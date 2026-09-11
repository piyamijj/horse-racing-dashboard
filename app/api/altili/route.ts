import { NextResponse } from "next/server";
import { storeGetRaces } from "@/lib/store";
import { buildAltiliSummary } from "@/lib/altili";
import type { AltiliSummary, ApiResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Read/derive endpoint for the Altılı Ganyan (6-leg accumulator) summary
 * table. Reads whatever races /api/scrape last persisted, detects the day's
 * Altılı Ganyan 6-race block, and ensures every leg has an AI prediction —
 * generating one on demand via the same analyzeRace() path /api/predict
 * uses, for any leg not yet analyzed. Returns null data (with ok: true) when
 * today's race data doesn't contain an identifiable Altılı Ganyan block
 * (e.g. still on demo data, or the marker wasn't present).
 */
export async function GET() {
  try {
    const { races } = await storeGetRaces();

    if (races.length === 0) {
      return NextResponse.json<ApiResult<null>>({
        ok: true,
        data: null,
        error: "No races in the store yet. Run /api/scrape first.",
      });
    }

    const summary = await buildAltiliSummary(races);

    return NextResponse.json<ApiResult<AltiliSummary | null>>({
      ok: true,
      data: summary,
      cachedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[/api/altili] failed:", err);
    return NextResponse.json<ApiResult<null>>(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error building Altılı Ganyan summary.",
      },
      { status: 500 }
    );
  }
}