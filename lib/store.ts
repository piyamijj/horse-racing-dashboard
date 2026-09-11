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

/** Persist today's freshly scraped races. */
export async function storeSetRaces(races: Race[]): Promise<void> {
  if (isSupabaseConfigured()) {
    await supabaseUpsertRaces(races);
    return;
  }
  cacheSetRaces(races);
}

/** Read all currently cached races, plus when they were last refreshed. */
export async function storeGetRaces(): Promise<{
  races: Race[];
  updatedAt: string | null;
}> {
  if (isSupabaseConfigured()) {
    const races = await supabaseGetRaces();
    const updatedAt = races.reduce<string | null>((latest, r) => {
      if (!latest || r.scrapedAt > latest) return r.scrapedAt;
      return latest;
    }, null);
    return { races, updatedAt };
  }
  return cacheGetRaces();
}

/** Read a single race by id. */
export async function storeGetRaceById(raceId: string): Promise<Race | undefined> {
  if (isSupabaseConfigured()) {
    return supabaseGetRaceById(raceId);
  }
  return cacheGetRaceById(raceId);
}

/** Persist the AI-generated prediction for a race. */
export async function storeSetPrediction(prediction: RacePrediction): Promise<void> {
  if (isSupabaseConfigured()) {
    await supabaseUpsertPrediction(prediction);
    return;
  }
  cacheSetPrediction(prediction);
}

/** Read the cached prediction for a race, if one exists. */
export async function storeGetPrediction(
  raceId: string
): Promise<RacePrediction | undefined> {
  if (isSupabaseConfigured()) {
    return supabaseGetPrediction(raceId);
  }
  return cacheGetPrediction(raceId);
}