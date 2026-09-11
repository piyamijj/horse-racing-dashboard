// Serverless API route: /api/predict
//
// Responsibility: read a previously-scraped race from the store (Supabase or
// local cache — see lib/store.ts) and run the AI analysis engine (lib/ai.ts)
// against it, then persist and return the resulting prediction. Deliberately
// decoupled from /api/scrape: this route never scrapes live, so it stays
// fast and never risks combining a slow scrape + AI inference call inside a
// single serverless invocation.
//
// Runtime: Node.js (not Edge) — the Gemini/Groq SDKs and lib/cache.ts's use
// of Node's fs are not guaranteed Edge-compatible.
//
// Usage: GET /api/predict?raceId=<id>            → cached prediction if present, else generate
//        GET /api/predict?raceId=<id>&refresh=1   → force regeneration even if cached

import { NextRequest, NextResponse } from "next/server";
import { analyzeRace } from "@/lib/ai";
import {
  storeGetRaceById,
  storeGetPrediction,
  storeSetPrediction,
} from "@/lib/store";
import type { ApiResult, RacePrediction } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const raceId = req.nextUrl.searchParams.get("raceId");
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";

  if (!raceId) {
    return NextResponse.json<ApiResult<null>>(
      { ok: false, error: "Missing required query param: raceId" },
      { status: 400 }
    );
  }

  try {
    if (!forceRefresh) {
      const cached = await storeGetPrediction(raceId);
      if (cached) {
        return NextResponse.json<ApiResult<RacePrediction>>({
          ok: true,
          data: cached,
          cachedAt: cached.generatedAt,
        });
      }
    }

    const race = await storeGetRaceById(raceId);

    if (!race) {
      return NextResponse.json<ApiResult<null>>(
        {
          ok: false,
          error: `Race ${raceId} not found in the store. Run /api/scrape first.`,
        },
        { status: 404 }
      );
    }

    const prediction = await analyzeRace(race);
    await storeSetPrediction(prediction);

    return NextResponse.json<ApiResult<RacePrediction>>({
      ok: true,
      data: prediction,
      cachedAt: prediction.generatedAt,
    });
  } catch (err) {
    console.error("[/api/predict] failed:", err);
    return NextResponse.json<ApiResult<null>>(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown prediction error.",
      },
      { status: 500 }
    );
  }
}

// POST supports body-based invocation (e.g. { raceId, refresh }) for clients
// that prefer not to use query params.
export async function POST(req: NextRequest) {
  let raceId: string | null = null;
  let forceRefresh = false;

  try {
    const body = await req.json();
    raceId = body?.raceId ?? null;
    forceRefresh = Boolean(body?.refresh);
  } catch {
    // fall through — raceId stays null, handled below
  }

  if (!raceId) {
    return NextResponse.json<ApiResult<null>>(
      { ok: false, error: "Missing required field: raceId" },
      { status: 400 }
    );
  }

  const url = new URL(req.url);
  url.searchParams.set("raceId", raceId);
  if (forceRefresh) url.searchParams.set("refresh", "1");

  return GET(new NextRequest(url, req));
}