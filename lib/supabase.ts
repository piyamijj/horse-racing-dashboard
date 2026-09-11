// Supabase client factory + typed data-access helpers.
// Used as the primary store when SUPABASE_URL and a Supabase key are configured,
// decoupling the /api/scrape write path from the /api/predict read path so
// prediction requests never depend on a live scrape happening in the same call.
//
// Falls back gracefully: if SUPABASE_URL is not set, callers should use
// lib/cache.ts instead (see isSupabaseConfigured()).

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Race, RacePrediction } from "./types";

let cachedClient: SupabaseClient | null = null;

/** Whether enough env vars are present to use Supabase as the store. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
  );
}

/**
 * Returns a singleton Supabase client using the service role key when available
 * (server-side only — required for writes from /api/scrape), falling back to
 * the anon key for read-only contexts. Throws if not configured; check
 * isSupabaseConfigured() first.
 */
export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in the environment."
    );
  }

  cachedClient = createClient(url, key, {
    auth: { persistSession: false },
    // Next.js patches the global fetch() to cache requests by default even
    // inside a `force-dynamic` route — that patch applies per-fetch-call, not
    // per-route, so the Supabase JS client's own internal fetch() calls were
    // silently served from Next's Data Cache instead of hitting Postgres each
    // time (observed live: /api/races kept returning the first-ever scrape's
    // data after later scrapes had clearly written fresh rows). Explicitly
    // opting every Supabase request out of that cache fixes it.
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });

  return cachedClient;
}

/**
 * Expected schema (see README.md "Supabase Schema" section for the full SQL):
 *
 * table races (
 *   id text primary key,
 *   track text, race_number int, name text, start_time timestamptz,
 *   distance_meters int, surface text, condition text,
 *   horses jsonb, scraped_at timestamptz
 * )
 *
 * table predictions (
 *   race_id text primary key references races(id),
 *   generated_at timestamptz, provider text, model text,
 *   predictions jsonb
 * )
 */

/** Upsert the full set of today's scraped races. */
export async function supabaseUpsertRaces(races: Race[]): Promise<void> {
  const client = getSupabaseClient();

  const rows = races.map((race) => ({
    id: race.id,
    track: race.track,
    race_number: race.raceNumber,
    name: race.name,
    start_time: race.startTime,
    distance_meters: race.distanceMeters,
    surface: race.surface,
    condition: race.condition ?? null,
    horses: race.horses,
    scraped_at: race.scrapedAt,
  }));

  const { error } = await client.from("races").upsert(rows, { onConflict: "id" });

  if (error) {
    throw new Error(`[supabase] failed to upsert races: ${error.message}`);
  }
}

/** Read all races currently stored (today's cached scrape). */
export async function supabaseGetRaces(): Promise<Race[]> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("races")
    .select("*")
    .order("start_time", { ascending: true });

  if (error) {
    throw new Error(`[supabase] failed to read races: ${error.message}`);
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    track: row.track,
    raceNumber: row.race_number,
    name: row.name,
    startTime: row.start_time,
    distanceMeters: row.distance_meters,
    surface: row.surface,
    condition: row.condition ?? undefined,
    horses: row.horses ?? [],
    scrapedAt: row.scraped_at,
  }));
}

/** Read a single race by id. */
export async function supabaseGetRaceById(raceId: string): Promise<Race | undefined> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("races")
    .select("*")
    .eq("id", raceId)
    .maybeSingle();

  if (error) {
    throw new Error(`[supabase] failed to read race ${raceId}: ${error.message}`);
  }

  if (!data) return undefined;

  return {
    id: data.id,
    track: data.track,
    raceNumber: data.race_number,
    name: data.name,
    startTime: data.start_time,
    distanceMeters: data.distance_meters,
    surface: data.surface,
    condition: data.condition ?? undefined,
    horses: data.horses ?? [],
    scrapedAt: data.scraped_at,
  };
}

/** Upsert the AI-generated prediction for a race. */
export async function supabaseUpsertPrediction(prediction: RacePrediction): Promise<void> {
  const client = getSupabaseClient();

  const { error } = await client.from("predictions").upsert(
    {
      race_id: prediction.raceId,
      generated_at: prediction.generatedAt,
      provider: prediction.provider,
      model: prediction.model,
      predictions: prediction.predictions,
    },
    { onConflict: "race_id" }
  );

  if (error) {
    throw new Error(`[supabase] failed to upsert prediction: ${error.message}`);
  }
}

/** Read the cached prediction for a race, if one exists. */
export async function supabaseGetPrediction(
  raceId: string
): Promise<RacePrediction | undefined> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("predictions")
    .select("*")
    .eq("race_id", raceId)
    .maybeSingle();

  if (error) {
    throw new Error(`[supabase] failed to read prediction for ${raceId}: ${error.message}`);
  }

  if (!data) return undefined;

  return {
    raceId: data.race_id,
    generatedAt: data.generated_at,
    provider: data.provider,
    model: data.model,
    predictions: data.predictions ?? [],
  };
}