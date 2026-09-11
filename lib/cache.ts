// Local JSON cache — fallback storage layer used when Supabase env vars are not set.
// Decouples the /api/scrape and /api/predict steps by persisting data to disk,
// mirroring the shape of the Supabase-backed store in lib/supabase.ts so callers
// (the API routes) can swap between the two without changing their logic.

import fs from "fs";
import path from "path";
import type { Race, RacePrediction } from "./types";

const CACHE_DIR = path.join(process.cwd(), ".cache");
const RACES_FILE = path.join(CACHE_DIR, "races.json");
const PREDICTIONS_FILE = path.join(CACHE_DIR, "predictions.json");

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`[cache] failed to read ${filePath}:`, err);
    return fallback;
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  ensureCacheDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/** Overwrite the full set of today's races in the local cache. */
export function cacheSetRaces(races: Race[]): void {
  writeJsonFile(RACES_FILE, {
    races,
    updatedAt: new Date().toISOString(),
  });
}

/** Read all cached races (empty array if none cached yet). */
export function cacheGetRaces(): { races: Race[]; updatedAt: string | null } {
  return readJsonFile(RACES_FILE, { races: [] as Race[], updatedAt: null });
}

/** Read a single cached race by id. */
export function cacheGetRaceById(raceId: string): Race | undefined {
  const { races } = cacheGetRaces();
  return races.find((r) => r.id === raceId);
}

/** Store/replace the AI prediction for a given race. */
export function cacheSetPrediction(prediction: RacePrediction): void {
  const all = readJsonFile<Record<string, RacePrediction>>(PREDICTIONS_FILE, {});
  all[prediction.raceId] = prediction;
  writeJsonFile(PREDICTIONS_FILE, all);
}

/** Read a cached prediction for a race, if one exists. */
export function cacheGetPrediction(raceId: string): RacePrediction | undefined {
  const all = readJsonFile<Record<string, RacePrediction>>(PREDICTIONS_FILE, {});
  return all[raceId];
}