import { NextResponse } from "next/server";
import { storeGetRaces, activeStoreBackend } from "@/lib/store";
import type { ApiResult, Race } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read-only endpoint the dashboard UI polls to render today's races.
 * Never triggers a scrape itself — it only reads whatever /api/scrape
 * last persisted to the store (Supabase or local cache). Use /api/scrape
 * to refresh the underlying data.
 */
export async function GET() {
  try {
    const { races, updatedAt } = await storeGetRaces();

    return NextResponse.json<
      ApiResult<{ races: Race[]; updatedAt: string | null; backend: string }>
    >({
      ok: true,
      data: {
        races,
        updatedAt,
        backend: activeStoreBackend(),
      },
      cachedAt: updatedAt ?? undefined,
    });
  } catch (err) {
    console.error("[/api/races] failed:", err);
    return NextResponse.json<ApiResult<null>>(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error reading races.",
      },
      { status: 500 }
    );
  }
}