// Shared TypeScript types for the Horse Racing Prediction Dashboard.
// Used by lib/scraper.ts, lib/ai.ts, lib/supabase.ts, lib/cache.ts,
// the /api/scrape and /api/predict routes, and all UI components.

/** A single horse entered in a race, as scraped from the source. */
export interface Horse {
  /** Stable unique id, e.g. `${raceId}-${horseNumber}` */
  id: string;
  raceId: string;
  number: number;
  name: string;
  jockey: string;
  trainer: string;
  /** Weight carried, in kg (or lbs, depending on source — keep units consistent). */
  weightKg: number;
  /** Starting/current odds as decimal (e.g. 4.5 means 4.5-to-1 equivalent). */
  currentOdds: number;
  /** Barrier / starting gate position, if available. */
  barrier?: number;
  /** Recent form string as published by the source, e.g. "3-1-2-5". */
  form?: string;
  /** Average speed rating from recent starts, if the source publishes one. */
  speedRating?: number;
  /** Days since the horse's last start. */
  daysSinceLastRun?: number;
}

/** A single race as scraped from the source, before AI analysis. */
export interface Race {
  id: string;
  /** Track / venue name. */
  track: string;
  /** Race number on the day's card. */
  raceNumber: number;
  name: string;
  /** ISO 8601 scheduled start time. */
  startTime: string;
  /** Distance in meters. */
  distanceMeters: number;
  /** Track surface, e.g. "turf", "dirt", "synthetic". */
  surface: string;
  /** Track condition, e.g. "good", "soft", "heavy". */
  condition?: string;
  horses: Horse[];
  /** When this record was scraped (ISO 8601), for cache-freshness checks. */
  scrapedAt: string;
  /** Raw TJK betting-types string for this race (e.g. "1. ÇİFTE, 1. 6'LI GANYAN bu koşudan başlar, GANYAN, İKİLİ"), used to detect Altılı Ganyan legs. Undefined for demo/non-TJK sources. */
  bettingTypesRaw?: string;
}

/** AI-produced value-bet analysis for a single horse in a race. */
export interface HorsePrediction {
  horseId: string;
  horseName: string;
  /** Model's estimated win probability, 0-100. */
  winProbabilityPercent: number;
  /** Model's self-reported confidence in this estimate, 0-100. */
  confidenceScore: number;
  /** Implied probability from currentOdds, 0-100, for comparison. */
  impliedProbabilityPercent: number;
  /** winProbabilityPercent - impliedProbabilityPercent; positive = value bet. */
  valueEdgePercent: number;
  /** False when the track hasn't published live odds yet (pre-market window); in that case implied probability/value edge are not meaningful and isValueBet is forced false. */
  oddsAvailable: boolean;
  /** Whether the model flags this as a +EV "value bet". */
  isValueBet: boolean;
  /** True when the model flags this horse (typically NOT its own top pick) as a plausible surprise/upset based on the supplied factors. */
  isPotentialUpset: boolean;
  /** Why this horse could surprise, when isPotentialUpset is true; empty otherwise. */
  upsetReasoning: string;
  /** Structured mathematical/statistical reasoning, not free-form guessing. */
  reasoning: string;
  /** Key quantitative factors the model weighed, for chart display. */
  factors: {
    speedRatingScore: number;
    weightDisadvantageScore: number;
    formScore: number;
    /** Optional catch-all for extra factors the model surfaces. */
    other?: Record<string, number>;
  };
}

/** Full AI analysis result for one race, ranked by confidence. */
export interface RacePrediction {
  raceId: string;
  generatedAt: string;
  /** Which AI provider produced this analysis. */
  provider: "gemini" | "groq";
  /** Model name/version used. */
  model: string;
  /** Predictions sorted by confidenceScore descending. */
  predictions: HorsePrediction[];
}

/** Strict JSON schema shape the AI must return (mirrors HorsePrediction/RacePrediction
 *  minus fields we compute ourselves, e.g. impliedProbabilityPercent/valueEdgePercent). */
export interface AIRawPredictionItem {
  horseId: string;
  horseName: string;
  winProbabilityPercent: number;
  confidenceScore: number;
  reasoning: string;
  isPotentialUpset: boolean;
  upsetReasoning: string;
  factors: {
    speedRatingScore: number;
    weightDisadvantageScore: number;
    formScore: number;
  };
}

export interface AIRawPredictionResponse {
  predictions: AIRawPredictionItem[];
}

/** One row of the Altılı Ganyan (6-leg accumulator) summary table. */
export interface AltiliLegSummary {
  legNumber: number; // 1-6
  raceId: string;
  raceNumber: number;
  track: string;
  startTime: string;
  topPick: { horseNumber: number; horseName: string; winProbabilityPercent: number };
  /** A second horse whose probability is close to the top pick's (near-tie), if any. */
  nearTie?: { horseNumber: number; horseName: string; winProbabilityPercent: number };
  /** The AI-flagged potential upset for this leg, if any. */
  upset?: {
    horseNumber: number;
    horseName: string;
    winProbabilityPercent: number;
    reasoning: string;
  };
}

export interface AltiliSummary {
  track: string;
  date: string;
  legs: AltiliLegSummary[];
}

/** Generic result wrapper for scrape/predict API responses. */
export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  /** ISO timestamp of when the underlying data was last refreshed. */
  cachedAt?: string;
}