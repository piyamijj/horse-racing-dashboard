// Altılı Ganyan (6-leg accumulator) detection + summary builder.
//
// TJK marks the race where the day's Altılı Ganyan starts inside that race's
// own betting-types string (bettingTypesRaw), e.g.:
//   "Handikap 15/DHÖW /H1, 4 Yaşlı Araplar, 2000 Sentetik ... 1. 6'LI GANYAN
//    bu koşudan başlar, GANYAN, İKİLİ, SIRALI İKİLİ"
// The accumulator's 6 legs are that race plus the next 5 races (by
// raceNumber) at the same track. This module finds that block from whatever
// races are currently in the store, makes sure each leg has an AI prediction
// (generating one on demand if missing), and reduces each leg's predictions
// down to: top pick, an optional near-tie second pick, and the AI-flagged
// potential upset (if any).

import { analyzeRace } from "./ai";
import { storeGetPrediction, storeSetPrediction } from "./store";
import type { AltiliLegSummary, AltiliSummary, Race, RacePrediction } from "./types";

/** Points of win-probability difference within which a second horse counts as a "near-tie" with the top pick. */
const NEAR_TIE_THRESHOLD_POINTS = 6;

/** Detects the marker TJK uses on the leg where the Altılı Ganyan starts. */
function isAltiliStartRace(race: Race): boolean {
  const raw = race.bettingTypesRaw;
  if (!raw) return false;
  const normalized = raw.toLocaleUpperCase("tr-TR");
  return (
    normalized.includes("6'LI GANYAN BU KOŞUDAN BAŞLAR") ||
    normalized.includes("6´LI GANYAN BU KOŞUDAN BAŞLAR") ||
    normalized.includes("6 LI GANYAN BU KOŞUDAN BAŞLAR") ||
    (normalized.includes("ALTILI GANYAN") && normalized.includes("BAŞLAR"))
  );
}

/**
 * Finds the 6 consecutive races (by raceNumber, same track) that make up
 * today's Altılı Ganyan, starting from whichever race carries TJK's start
 * marker. Returns null if no such block can be identified from the races
 * currently in the store (e.g. demo data, or a day with no Altılı Ganyan).
 */
export function findAltiliLegs(allRaces: Race[]): Race[] | null {
  const startRace = allRaces.find(isAltiliStartRace);
  if (!startRace) return null;

  const sameTrack = allRaces
    .filter((r) => r.track === startRace.track)
    .sort((a, b) => a.raceNumber - b.raceNumber);

  const startIdx = sameTrack.findIndex((r) => r.id === startRace.id);
  if (startIdx === -1) return null;

  const legs = sameTrack.slice(startIdx, startIdx + 6);
  return legs.length === 6 ? legs : null;
}

/** Reads a cached prediction for the race, or generates + persists one if missing. */
async function getOrCreatePrediction(race: Race): Promise<RacePrediction> {
  const cached = await storeGetPrediction(race.id);
  if (cached) return cached;

  const prediction = await analyzeRace(race);
  await storeSetPrediction(prediction);
  return prediction;
}

/** Reduces one race's full prediction list down to a single Altılı Ganyan leg summary row. */
function summarizeLeg(
  legNumber: number,
  race: Race,
  prediction: RacePrediction
): AltiliLegSummary {
  const horseByPredictionId = new Map(
    race.horses.map((h) => [h.id, h])
  );

  const byWinProbability = [...prediction.predictions].sort(
    (a, b) => b.winProbabilityPercent - a.winProbabilityPercent
  );

  const top = byWinProbability[0];
  const second = byWinProbability[1];

  const topHorse = horseByPredictionId.get(top.horseId);

  const summary: AltiliLegSummary = {
    legNumber,
    raceId: race.id,
    raceNumber: race.raceNumber,
    track: race.track,
    startTime: race.startTime,
    topPick: {
      horseNumber: topHorse?.number ?? 0,
      horseName: top.horseName,
      winProbabilityPercent: top.winProbabilityPercent,
    },
  };

  if (
    second &&
    top.winProbabilityPercent - second.winProbabilityPercent <= NEAR_TIE_THRESHOLD_POINTS
  ) {
    const secondHorse = horseByPredictionId.get(second.horseId);
    summary.nearTie = {
      horseNumber: secondHorse?.number ?? 0,
      horseName: second.horseName,
      winProbabilityPercent: second.winProbabilityPercent,
    };
  }

  const upset = prediction.predictions.find((p) => p.isPotentialUpset);
  if (upset) {
    const upsetHorse = horseByPredictionId.get(upset.horseId);
    summary.upset = {
      horseNumber: upsetHorse?.number ?? 0,
      horseName: upset.horseName,
      winProbabilityPercent: upset.winProbabilityPercent,
      reasoning: upset.upsetReasoning,
    };
  }

  return summary;
}

/**
 * Builds the full Altılı Ganyan summary from whatever races are currently in
 * the store. Generates any missing per-leg predictions on demand (so this
 * works right after a fresh /api/scrape, before every leg has been opened in
 * the detail view yet). Returns null if today's Altılı Ganyan block can't be
 * identified from the current data.
 *
 * Each leg's AI call is isolated: on a free-tier AI provider, 6 sequential
 * calls WILL occasionally hit a transient failure (observed live: Gemini's
 * free tier intermittently 503s, and the Groq fallback has a tight daily
 * token budget shared across the whole app). A single leg failing must not
 * blank out the other 5 legs the user actually wants to see — so a failed
 * leg is reported with pending: true and an error message instead of
 * aborting the whole table.
 */
export async function buildAltiliSummary(allRaces: Race[]): Promise<AltiliSummary | null> {
  const legs = findAltiliLegs(allRaces);
  if (!legs) return null;

  const legSummaries: AltiliLegSummary[] = [];
  for (let i = 0; i < legs.length; i++) {
    const race = legs[i];
    try {
      const prediction = await getOrCreatePrediction(race);
      legSummaries.push(summarizeLeg(i + 1, race, prediction));
    } catch (err) {
      console.error(`[altili] leg ${i + 1} (${race.id}) prediction failed:`, err);
      legSummaries.push({
        legNumber: i + 1,
        raceId: race.id,
        raceNumber: race.raceNumber,
        track: race.track,
        startTime: race.startTime,
        topPick: { horseNumber: 0, horseName: "", winProbabilityPercent: 0 },
        pending: true,
        pendingReason:
          err instanceof Error
            ? err.message
            : "Bu ayak için analiz şu anda oluşturulamadı.",
      });
    }
  }

  return {
    track: legs[0].track,
    date: legs[0].startTime.slice(0, 10),
    legs: legSummaries,
  };
}