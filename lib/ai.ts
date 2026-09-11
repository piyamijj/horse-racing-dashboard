// AI Analysis Engine for the Horse Racing Prediction Dashboard.
//
// Role: prompt the model as a quantitative analyst, not a tipster — it must
// reason from the supplied statistical fields (speed rating, weight, form,
// days since last run, current odds) and return strict structured JSON.
// Gemini is primary (per user decision — they supplied gemini-flash-latest
// keys); Groq is the fallback if Gemini fails, errors, or rate-limits.
//
// Implied probability and value-edge are NOT trusted to the model — they are
// computed deterministically in code from currentOdds, so the "value bet"
// signal is always mathematically consistent even if the model's win
// probability estimate is off.

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import Groq from "groq-sdk";
import type {
  Race,
  Horse,
  HorsePrediction,
  RacePrediction,
  AIRawPredictionResponse,
} from "./types";
import {
  getActiveKey,
  markFailed,
  markSuccess,
  allKeysExhausted,
  describeKeyForLog,
} from "./keyRotation";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

/** Strict JSON schema for Gemini's responseSchema — mirrors AIRawPredictionResponse. */
const GEMINI_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    predictions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          horseId: { type: SchemaType.STRING },
          horseName: { type: SchemaType.STRING },
          winProbabilityPercent: { type: SchemaType.NUMBER },
          confidenceScore: { type: SchemaType.NUMBER },
          reasoning: { type: SchemaType.STRING },
          isPotentialUpset: { type: SchemaType.BOOLEAN },
          upsetReasoning: { type: SchemaType.STRING },
          factors: {
            type: SchemaType.OBJECT,
            properties: {
              speedRatingScore: { type: SchemaType.NUMBER },
              weightDisadvantageScore: { type: SchemaType.NUMBER },
              formScore: { type: SchemaType.NUMBER },
            },
            required: ["speedRatingScore", "weightDisadvantageScore", "formScore"],
          },
        },
        required: [
          "horseId",
          "horseName",
          "winProbabilityPercent",
          "confidenceScore",
          "reasoning",
          "isPotentialUpset",
          "upsetReasoning",
          "factors",
        ],
      },
    },
  },
  required: ["predictions"],
};

const SYSTEM_INSTRUCTION = `You are a quantitative horse racing analyst. You calculate win probabilities and "value bets" (model probability vs. implied probability from current odds) using ONLY the statistical fields provided: speed rating, weight carried, recent form string, days since last run, barrier position, and current decimal odds.

Rules:
- Reason mathematically and statistically. Do not guess, do not use gut feeling, do not reference anything outside the supplied data.
- winProbabilityPercent values across all horses in a race should sum to roughly 100 (allow minor rounding).
- confidenceScore (0-100) reflects how much signal the input data actually contains (e.g. low if speedRating/form data is sparse or missing) — it is NOT the same as winProbabilityPercent.
- factors.speedRatingScore, weightDisadvantageScore, formScore are each 0-100 normalized sub-scores you derive from the raw fields, for charting.
- reasoning must be a concise (2-4 sentence) explanation citing the specific numbers you used (e.g. "Speed rating 88 vs field average 74, weight 54kg is 4kg lighter than the field median, form 1-2-1 shows consistent front-running.").
- isPotentialUpset: set true ONLY for a horse that is NOT your own top pick in this race, but whose underlying factors (a notably light weight relief, a sharp recent form reversal, an unusually favorable barrier, a live value edge if odds are available) suggest a realistic chance of surprising the favorites. Do not mark more than one horse per race as a potential upset, and do not mark the favorite itself. If no horse meaningfully qualifies, set isPotentialUpset to false for every horse.
- upsetReasoning: when isPotentialUpset is true, give a concise 1-2 sentence explanation citing the specific factor(s) that could produce a surprise. When isPotentialUpset is false, return an empty string.
- Return ONLY the JSON object matching the schema. No prose outside the JSON.`;

function buildUserPrompt(race: Race): string {
  const horseLines = race.horses
    .map((h: Horse) =>
      [
        `horseId=${h.id}`,
        `number=${h.number}`,
        `name=${h.name}`,
        `weightKg=${h.weightKg}`,
        `currentOdds=${h.currentOdds}`,
        `barrier=${h.barrier ?? "n/a"}`,
        `form=${h.form ?? "n/a"}`,
        `speedRating=${h.speedRating ?? "n/a"}`,
        `daysSinceLastRun=${h.daysSinceLastRun ?? "n/a"}`,
      ].join(", ")
    )
    .join("\n");

  return `Race: ${race.name} at ${race.track}, distance ${race.distanceMeters}m, surface ${race.surface}${race.condition ? `, condition ${race.condition}` : ""}.

Horses entered:
${horseLines}

Calculate winProbabilityPercent, confidenceScore, factors, and reasoning for every horse listed above. Use horseId values exactly as given.`;
}

/** Computes implied probability (%) from decimal-style currentOdds. */
function impliedProbabilityFromOdds(currentOdds: number): number {
  if (!currentOdds || currentOdds <= 0) return 0;
  // currentOdds is treated as "X-to-1" style (odds against); implied prob = 1 / (odds + 1).
  const prob = 1 / (currentOdds + 1);
  return Math.round(prob * 1000) / 10; // one decimal place, as a percent
}

/** Merges raw AI output with deterministically-computed implied probability / value edge. */
function finalizePredictions(
  race: Race,
  raw: AIRawPredictionResponse
): HorsePrediction[] {
  const horseById = new Map(race.horses.map((h) => [h.id, h]));

  const predictions: HorsePrediction[] = raw.predictions
    .filter((p) => horseById.has(p.horseId))
    .map((p) => {
      const horse = horseById.get(p.horseId)!;
      // TJK's live program feed does not always publish odds ahead of the
      // betting window opening (currentOdds is 0/absent in that case). A
      // missing odds value must NOT be treated as "0% implied probability" —
      // that would make every horse look like a huge, spurious value bet.
      // In that case we report the value-bet math as unavailable rather than
      // fabricate an edge.
      const oddsAvailable = Boolean(horse.currentOdds && horse.currentOdds > 0);
      const impliedProbabilityPercent = oddsAvailable
        ? impliedProbabilityFromOdds(horse.currentOdds)
        : 0;
      const winProbabilityPercent = Math.max(0, Math.min(100, p.winProbabilityPercent));
      const valueEdgePercent = oddsAvailable
        ? Math.round((winProbabilityPercent - impliedProbabilityPercent) * 10) / 10
        : 0;

      return {
        horseId: p.horseId,
        horseName: p.horseName || horse.name,
        winProbabilityPercent,
        confidenceScore: Math.max(0, Math.min(100, p.confidenceScore)),
        impliedProbabilityPercent,
        valueEdgePercent,
        oddsAvailable,
        isValueBet: oddsAvailable && valueEdgePercent > 0,
        isPotentialUpset: Boolean(p.isPotentialUpset),
        upsetReasoning: p.upsetReasoning || "",
        reasoning: p.reasoning,
        factors: {
          speedRatingScore: Math.max(0, Math.min(100, p.factors.speedRatingScore)),
          weightDisadvantageScore: Math.max(
            0,
            Math.min(100, p.factors.weightDisadvantageScore)
          ),
          formScore: Math.max(0, Math.min(100, p.factors.formScore)),
        },
      };
    });

  // Rank by confidence score, descending — as required by the dashboard's detail view.
  predictions.sort((a, b) => b.confidenceScore - a.confidenceScore);

  return predictions;
}

function extractJson(text: string): AIRawPredictionResponse {
  const cleaned = text.trim().replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned) as AIRawPredictionResponse;
}

/** Classifies a provider error into the two cooldown buckets keyRotation understands. */
function classifyError(err: unknown): "quota" | "transient" {
  const message = err instanceof Error ? err.message : String(err);
  if (
    message.includes("429") ||
    /quota/i.test(message) ||
    /rate.?limit/i.test(message) ||
    /RESOURCE_EXHAUSTED/i.test(message)
  ) {
    return "quota";
  }
  return "transient"; // 503 / UNAVAILABLE / momentary overload / anything else unexpected
}

/**
 * Tries one Gemini call with a single specific key. Left as a thin wrapper
 * so the rotation loop below can call it once per key attempt.
 */
async function analyzeWithGeminiKey(race: Race, apiKey: string): Promise<HorsePrediction[]> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: GEMINI_RESPONSE_SCHEMA as any,
      temperature: 0.2,
    },
  });

  const result = await model.generateContent(buildUserPrompt(race));
  const text = result.response.text();
  const raw = extractJson(text);

  return finalizePredictions(race, raw);
}

/**
 * Pools all 5 Gemini keys: pulls the next round-robin key that isn't in
 * cooldown, tries it, and on failure marks it cooled-down (429/quota → 10
 * min, transient 503 → 15s) then immediately tries the next available key.
 * Exhausts every non-cooling key once before giving up so a single bad key
 * never blocks the other 4 from being tried in the same request.
 */
async function analyzeWithGeminiPool(race: Race): Promise<HorsePrediction[]> {
  if (allKeysExhausted("gemini")) {
    throw new Error("All Gemini keys are currently cooling down.");
  }

  const triedKeys = new Set<string>();
  let lastErr: unknown = new Error("No Gemini keys configured.");

  // Bound attempts to the pool size — never loop forever if every key fails.
  const maxAttempts = 5;
  for (let i = 0; i < maxAttempts; i++) {
    const key = getActiveKey("gemini");
    if (!key || triedKeys.has(key)) break; // exhausted the pool or looped back
    triedKeys.add(key);

    try {
      const predictions = await analyzeWithGeminiKey(race, key);
      markSuccess("gemini", key);
      return predictions;
    } catch (err) {
      lastErr = err;
      const reason = classifyError(err);
      console.error(
        `[ai] Gemini key ${describeKeyForLog(key)} failed (${reason}), rotating:`,
        err instanceof Error ? err.message : err
      );
      markFailed("gemini", key, reason);
      // Only retry transient errors inline within this pool pass; a quota
      // failure moves straight to the next key too (markFailed already
      // advanced the pointer), so no special branching needed here.
    }
  }

  throw lastErr;
}

async function analyzeWithGroqKey(race: Race, apiKey: string): Promise<HorsePrediction[]> {
  const groq = new Groq({ apiKey });

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_INSTRUCTION },
      {
        role: "user",
        content: `${buildUserPrompt(race)}\n\nRespond with a single JSON object of the exact shape: {"predictions":[{"horseId":string,"horseName":string,"winProbabilityPercent":number,"confidenceScore":number,"reasoning":string,"isPotentialUpset":boolean,"upsetReasoning":string,"factors":{"speedRatingScore":number,"weightDisadvantageScore":number,"formScore":number}}]}`,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content ?? "";
  const raw = extractJson(text);

  return finalizePredictions(race, raw);
}

/** Same pooling strategy as Gemini's, applied to Groq's 5 keys. */
async function analyzeWithGroqPool(race: Race): Promise<HorsePrediction[]> {
  if (allKeysExhausted("groq")) {
    throw new Error("All Groq keys are currently cooling down.");
  }

  const triedKeys = new Set<string>();
  let lastErr: unknown = new Error("No Groq keys configured.");

  const maxAttempts = 5;
  for (let i = 0; i < maxAttempts; i++) {
    const key = getActiveKey("groq");
    if (!key || triedKeys.has(key)) break;
    triedKeys.add(key);

    try {
      const predictions = await analyzeWithGroqKey(race, key);
      markSuccess("groq", key);
      return predictions;
    } catch (err) {
      lastErr = err;
      const reason = classifyError(err);
      console.error(
        `[ai] Groq key ${describeKeyForLog(key)} failed (${reason}), rotating:`,
        err instanceof Error ? err.message : err
      );
      markFailed("groq", key, reason);
    }
  }

  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Gemini's free tier intermittently returns 503 "high demand" errors that
 * clear within seconds. analyzeWithGeminiPool already rotates across all 5
 * keys on any failure (quota OR transient), so this outer retry loop exists
 * only to give the whole pool a second full pass after a short backoff, in
 * case every key was transiently busy at the same instant (rare, but cheap
 * to guard against before paying Groq's tighter daily token budget).
 */
async function analyzeWithGeminiRetrying(race: Race): Promise<HorsePrediction[]> {
  const attempts = 2; // each attempt already sweeps up to 5 keys internally
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await analyzeWithGeminiPool(race);
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1) throw err;
      await sleep(1500 * (i + 1));
    }
  }

  throw lastErr;
}

/**
 * Main entry point used by /api/predict and /api/altili.
 * Tries the full Gemini key pool first (round-robin across all 5 keys,
 * skipping any in cooldown, one retry pass on transient failures), falling
 * back to the full Groq key pool only if every Gemini key failed. Throws
 * only if every key across both providers failed.
 */
export async function analyzeRace(race: Race): Promise<RacePrediction> {
  try {
    const predictions = await analyzeWithGeminiRetrying(race);
    return {
      raceId: race.id,
      generatedAt: new Date().toISOString(),
      provider: "gemini",
      model: GEMINI_MODEL,
      predictions,
    };
  } catch (geminiErr) {
    console.error("[ai] All Gemini keys failed, falling back to Groq pool:", geminiErr);

    const predictions = await analyzeWithGroqPool(race);
    return {
      raceId: race.id,
      generatedAt: new Date().toISOString(),
      provider: "groq",
      model: GROQ_MODEL,
      predictions,
    };
  }
}