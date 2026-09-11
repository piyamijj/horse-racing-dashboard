// Key-rotation manager for pooling multiple free-tier API keys per provider.
//
// Why this exists: both Gemini and Groq's free tiers rate-limit (429) or
// transiently overload (503/UNAVAILABLE) on a *per-key* basis. The user
// supplied 5 keys per provider specifically so quota is pooled across all
// of them instead of one key absorbing every request. This module tracks,
// per provider, which key to try next (round-robin) and which keys are
// currently in a cooldown window after a failure, so a bad/exhausted key
// is skipped automatically until its cooldown expires.
//
// State is an in-memory module-level singleton. Next.js API routes on
// Vercel reuse the same warm serverless instance across nearby invocations,
// so this rotation state persists best-effort across calls within a warm
// instance — it is NOT persisted to a database and resets on cold start.
// That's an acceptable tradeoff here: the goal is to spread load and skip
// recently-failed keys, not to guarantee perfectly durable global state.

export type Provider = "gemini" | "groq";

interface RotatorState {
  keys: string[];
  idx: number;
  /** key value -> epoch ms until which this key should be skipped */
  cooldowns: Map<string, number>;
}

const state = new Map<Provider, RotatorState>();

/** Reads GEMINI_API_KEY / GEMINI_API_KEY_BACKUP_1..4 (or GROQ_*) into an ordered list. */
export function getKeys(provider: Provider): string[] {
  const prefix = provider === "gemini" ? "GEMINI_API_KEY" : "GROQ_API_KEY";
  const primary = process.env[prefix];
  const backups = [1, 2, 3, 4].map((n) => process.env[`${prefix}_BACKUP_${n}`]);

  return [primary, ...backups].filter((k): k is string => Boolean(k && k.trim().length > 0));
}

function getState(provider: Provider): RotatorState {
  let s = state.get(provider);
  if (!s) {
    s = { keys: getKeys(provider), idx: 0, cooldowns: new Map() };
    state.set(provider, s);
  } else if (s.keys.length === 0) {
    // Keys can appear if env vars were set after the module first loaded
    // (e.g. a redeploy picked up new backup keys) — re-read defensively.
    s.keys = getKeys(provider);
  }
  return s;
}

function isCoolingDown(s: RotatorState, key: string): boolean {
  const until = s.cooldowns.get(key);
  return typeof until === "number" && until > Date.now();
}

/**
 * Returns the next usable key for a provider, round-robin from wherever the
 * pointer last landed, skipping any key still inside its cooldown window.
 * Returns null only if every known key for that provider is currently
 * cooling down (caller should treat this as "provider exhausted for now").
 */
export function getActiveKey(provider: Provider): string | null {
  const s = getState(provider);
  if (s.keys.length === 0) return null;

  for (let attempts = 0; attempts < s.keys.length; attempts++) {
    const key = s.keys[s.idx % s.keys.length];
    if (!isCoolingDown(s, key)) {
      return key;
    }
    s.idx = (s.idx + 1) % s.keys.length;
  }

  // Every key is in cooldown right now.
  return null;
}

/**
 * Records a failure for `key` and puts it into cooldown, then advances the
 * rotator pointer immediately so the very next getActiveKey() call for this
 * provider tries a different key rather than retrying the same one.
 *
 * reasonCode distinguishes how long to sideline the key for:
 * - "quota": 429 / quota-exhausted — the key is genuinely spent for a
 *   while, so it gets a long (10 minute) cooldown.
 * - "transient": 503 / UNAVAILABLE / momentary overload — the key itself
 *   is fine, so a short (15 second) cooldown is enough before retrying it.
 */
export function markFailed(
  provider: Provider,
  key: string,
  reasonCode: "quota" | "transient"
): void {
  const s = getState(provider);
  const cooldownMs = reasonCode === "quota" ? 10 * 60 * 1000 : 15 * 1000;
  s.cooldowns.set(key, Date.now() + cooldownMs);

  // Move the pointer past this key so the next getActiveKey() call doesn't
  // land on the same (now-cooling) key again.
  const keyIdx = s.keys.indexOf(key);
  s.idx = keyIdx >= 0 ? (keyIdx + 1) % s.keys.length : (s.idx + 1) % Math.max(s.keys.length, 1);
}

/**
 * Records a success for `key`: clears any lingering cooldown (in case a
 * "transient" entry from a previous call hadn't expired yet but the key
 * clearly works now), and advances the pointer to the next key.
 *
 * Advancing on success (not just on failure) is what makes this a true
 * round-robin instead of a pure failover — quota gets spread across all 5
 * keys over time even when nothing is failing, rather than one key being
 * hammered until it eventually rate-limits.
 */
export function markSuccess(provider: Provider, key: string): void {
  const s = getState(provider);
  s.cooldowns.delete(key);

  const keyIdx = s.keys.indexOf(key);
  s.idx = keyIdx >= 0 ? (keyIdx + 1) % s.keys.length : s.idx;
}

/** True when every configured key for this provider is currently cooling down. */
export function allKeysExhausted(provider: Provider): boolean {
  const s = getState(provider);
  if (s.keys.length === 0) return true;
  return s.keys.every((k) => isCoolingDown(s, k));
}

/** Redacts a key for safe logging — never print a full key, even a free-tier one. */
export function describeKeyForLog(key: string | null | undefined): string {
  if (!key) return "(none)";
  return `...${key.slice(-4)}`;
}