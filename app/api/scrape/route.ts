// Serverless API route: /api/scrape
//
// Responsibility: fetch today's races from the data source (see lib/scraper.ts)
// and persist them to the store (Supabase or local cache, see lib/store.ts).
// Intentionally does NOT call the AI analysis engine — scraping and prediction
// are decoupled into separate requests so neither step risks exceeding
// Vercel's serverless execution time limit. /api/predict reads whatever this
// route last stored.
//
// Runtime: Node.js (not Edge) — Cheerio and Node's fs (via lib/cache.ts) are
// not Edge-compatible. See vercel.json for the explicit runtime/timeout config.
//
// Can be called on a schedule (see the "crons" entry in vercel.json) or
// on-demand. Scheduled/cron calls are expected to send `?secret=` matching
// CRON_SECRET; manual calls from an authenticated admin context can omit it
// in local development.

import { NextRequest, NextResponse } from "next/server";
import { scrapeTodaysRaces } from "@/lib/scraper";
import { storeSetRaces, activeStoreBackend } from "@/lib/store";
import type { ApiResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // If no CRON_SECRET is configured (e.g. early local dev), allow the call —
  // operators should set CRON_SECRET before exposing this route publicly.
  if (!cronSecret) return true;

  const headerSecret = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const querySecret = req.nextUrl.searchParams.get("secret");

  return headerSecret === cronSecret || querySecret === cronSecret;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json<ApiResult<null>>(
      { ok: false, error: "Unauthorized: missing or invalid secret." },
      { status: 401 }
    );
  }

  try {
    const { races, source, note } = await scrapeTodaysRaces();

    await storeSetRaces(races);

    return NextResponse.json<
      ApiResult<{ raceCount: number; source: string; note: string; backend: string }>
    >({
      ok: true,
      data: {
        raceCount: races.length,
        source,
        note,
        backend: activeStoreBackend(),
      },
      cachedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[/api/scrape] failed:", err);
    return NextResponse.json<ApiResult<null>>(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown scrape error.",
      },
      { status: 500 }
    );
  }
}

// POST is an alias for GET, so both cron-style GET pings and manual
// "refresh now" button POSTs from the UI work identically.
export async function POST(req: NextRequest) {
  return GET(req);
}