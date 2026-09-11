// Storage abstraction layer used by the API routes.
// Picks Supabase as the backend when it is configured (SUPABASE_URL + a key),
// otherwise transparently falls back to the local JSON cache in lib/cache.ts.
// This lets /api/scrape and /api/predict stay agnostic to which store is active,
// and lets local development work with zero external services.

import type { Race, RacePrediction } from "./types";
import {
  isSupabaseConfigured,
  supabaseUpsertRaces,
  supabaseGetRaces,
  supabaseGetRaceById,
  supabaseUpsertPrediction,
  supabaseGetPrediction,
} from "./supabase";
import {
  cacheSetRaces,
  cacheGetRaces,
  cacheGetRaceById,
  cacheSetPrediction,
  cacheGetPrediction,
} from "./cache";

/** Which backend is currently active — surfaced in API responses for debugging. */
export function activeStoreBackend(): "supabase" | "local-cache" {
  return isSupabaseConfigured() ? "supabase" : "local-cache";
}

/**
 * Supabase is the intended primary store once configured, but a misconfigured
 * or not-yet-migrated Supabase project (e.g. schema.sql not run yet) must not
 * take the whole app down. Every Supabase call below is wrapped so a failure
 * degrades to the local cache with a clear console warning instead of a 500 —
 * note this degrade is NOT durable on Vercel (see lib/cache.ts), so it is a
 * safety net for demoing, not a substitute for actually running schema.sql.
 */
function warnFallback(op: string, err: unknown): void {
  console.error(
    `[store] Supabase ${op} failed, falling back to local cache. Run supabase/schema.sql against your project to fix this permanently. Error:`,
    err
  );
}

/** Persist today's freshly scraped races. */
export async function storeSetRaces(races: Race[]): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await supabaseUpsertRaces(races);
      return;
    } catch (err) {
      warnFallback("upsert races", err);
    }
  }
  cacheSetRaces(races);
}

/** Read all currently cached races, plus when they were last refreshed. */
export async function storeGetRaces(): Promise<{
  races: Race[];
  updatedAt: string | null;
}> {
  if (isSupabaseConfigured()) {
    try {
      const races = await supabaseGetRaces();
      const updatedAt = races.reduce<string | null>((latest, r) => {
        if (!latest || r.scrapedAt > latest) return r.scrapedAt;
        return latest;
      }, null);
      return { races, updatedAt };
    } catch (err) {
      warnFallback("read races", err);
    }
  }
  return cacheGetRaces();
}

/** Read a single race by id. */
export async function storeGetRaceById(raceId: string): Promise<Race | undefined> {
  if (isSupabaseConfigured()) {
    try {
      return await supabaseGetRaceById(raceId);
    } catch (err) {
      warnFallback("read race by id", err);
    }
  }
  return cacheGetRaceById(raceId);
}

/** Persist the AI-generated prediction for a race. */
export async function storeSetPrediction(prediction: RacePrediction): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      await supabaseUpsertPrediction(prediction);
      return;
    } catch (err) {
      warnFallback("upsert prediction", err);
    }
  }
  cacheSetPrediction(prediction);
}

/** Read the cached prediction for a race, if one exists. */
export async function storeGetPrediction(
  raceId: string
): Promise<RacePrediction | undefined> {
  if (isSupabaseConfigured()) {
    try {
      return await supabaseGetPrediction(raceId);
    } catch (err) {
      warnFallback("read prediction", err);
    }
  }
  return cacheGetPrediction(raceId);
}