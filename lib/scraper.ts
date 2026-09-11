// Scraper for the Horse Racing Prediction Dashboard.
//
// Data source strategy (in order of preference), per the build instructions
// to prioritize TJK (Türkiye Jokey Kulübü) as the primary source:
//
//   1. TJK's public "ebayi" JSON feed (https://ebayi.tjk.org/s/d/...) — the
//      same static, keyless, no-auth-header endpoint TJK's own website reads
//      client-side, and the one real open-source community projects (e.g.
//      SezerFidanci/TJK-API) actually use. Confirmed live and working from a
//      cloud/serverless IP (no WAF block on this host, unlike www.tjk.org).
//      Gives full race + horse structural data (weight, jockey, trainer,
//      recent form, distance, surface, best times). Live odds (GANYAN/AGF)
//      are frequently still empty on this feed ahead of the betting window
//      opening — handled explicitly (see lib/ai.ts's oddsAvailable flag)
//      rather than treated as "0 implied probability".
//   2. TJK's official authenticated data API
//      (https://vhs.tjk.org/vss/data/program) — requires a TJK-issued
//      `X-Auth` key (TJK_API_AUTH_KEY env var). Not publicly available
//      (verified: no self-service signup exists anywhere), but kept as a
//      higher-fidelity path (incl. AGF/probable-odds) for if/when a key is
//      obtained through an official TJK partnership.
//   3. Cheerio HTML scrape of the public TJK race-program pages
//      (https://www.tjk.org/...) — native fetch + Cheerio, no headless
//      browser (keeps us inside Vercel's serverless size/time limits). TJK
//      fronts this specific host with a WAF that 403s requests from
//      datacenter/cloud IPs (confirmed live); kept only as a last-resort
//      attempt in case that ever changes.
//   4. Synthetic demo dataset — deterministic, clearly labeled
//      (`source: "demo"`), so /api/scrape and /api/predict always have
//      something to operate on end-to-end even if every live source fails.
//
// Everything here is native fetch + Cheerio only — no Puppeteer.

import * as cheerio from "cheerio";
import type { Horse, Race } from "./types";

const TJK_EBAYI_BASE_URL =
  process.env.TJK_EBAYI_BASE_URL || "https://ebayi.tjk.org/s/d";
const TJK_API_BASE_URL =
  process.env.TJK_API_BASE_URL || "https://vhs.tjk.org/vss/data";
const TJK_PROGRAM_PAGE_URL =
  process.env.TJK_PROGRAM_PAGE_URL ||
  "https://www.tjk.org/TR/YarisSever/Info/Page/GunlukYarisProgrami";
const USER_AGENT =
  process.env.SCRAPER_USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export type ScrapeSource = "tjk-ebayi" | "tjk-api" | "tjk-html" | "demo";

export interface ScrapeResult {
  races: Race[];
  source: ScrapeSource;
  /** Human-readable note on how the data was obtained, or why a fallback was used. */
  note: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Formats a decimal odds value from a raw TJK numeric/string field. */
function toNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "string" ? parseFloat(value.replace(",", ".")) : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

interface EbayiHippodrome {
  KEY: string;
  AD: string;
  YER: string;
  GUN: string | null;
}

/**
 * Attempt 1: TJK's public, keyless "ebayi" JSON feed.
 * https://ebayi.tjk.org/s/d/program/{YYYYMMDD}/yarislar.json lists today's
 * hippodromes; https://ebayi.tjk.org/s/d/program/{YYYYMMDD}/full/{KEY}.json
 * gives the full race card + entries for one hippodrome. No auth header of
 * any kind. Returns null (not throws) on any failure so callers fall
 * through to the next source.
 */
async function fetchFromTjkEbayi(): Promise<Race[] | null> {
  const date = todayIso().replace(/-/g, ""); // YYYYMMDD
  try {
    const listRes = await fetch(
      `${TJK_EBAYI_BASE_URL}/program/${date}/yarislar.json`,
      { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, cache: "no-store" }
    );

    if (!listRes.ok) {
      console.error(`[scraper] TJK ebayi hippodrome list HTTP ${listRes.status}`);
      return null;
    }

    const hippodromes: EbayiHippodrome[] = await listRes.json();
    if (!Array.isArray(hippodromes) || hippodromes.length === 0) return null;

    // Only hippodromes with a GUN (day number) actually have local TJK races
    // today; entries like foreign tracks (Doncaster, Fairview, ...) carry
    // GUN: null and are informational only, not TJK's own program.
    const localHippodromes = hippodromes.filter((h) => h.GUN);
    if (localHippodromes.length === 0) return null;

    const races: Race[] = [];

    for (const hip of localHippodromes) {
      const fullRes = await fetch(
        `${TJK_EBAYI_BASE_URL}/program/${date}/full/${encodeURIComponent(hip.KEY)}.json`,
        { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, cache: "no-store" }
      );
      if (!fullRes.ok) continue;

      const full = await fullRes.json();
      const kosular = Array.isArray(full?.kosular) ? full.kosular : [];

      for (const k of kosular) {
        const raceNumber = toNumber(k.NO ?? k.RACENO, races.length + 1);
        const raceId = `tjk-${hip.KEY}-${raceNumber}-${todayIso()}`;

        const horses: Horse[] = (Array.isArray(k.atlar) ? k.atlar : []).map(
          (h: any, hIdx: number) => {
            // GANYAN (live win odds) is frequently blank on this feed until
            // TJK opens the betting window for that race — 0 here is treated
            // by lib/ai.ts as "odds not yet available", never as "0% implied
            // probability" (see finalizePredictions's oddsAvailable flag).
            const currentOdds = toNumber(h.GANYAN, 0);
            // SON6 is a compact recent-form string like "K2K1K4K2K7K1" —
            // strip the "K" separators down to a "2-1-4-2-7-1" style form.
            const form =
              typeof h.SON6 === "string" && h.SON6.length > 0
                ? h.SON6.replace(/K/g, "-").replace(/^-/, "")
                : undefined;

            return {
              id: `${raceId}-${h.NO ?? hIdx + 1}`,
              raceId,
              number: toNumber(h.NO, hIdx + 1),
              name: h.AD ?? `Horse ${hIdx + 1}`,
              jockey: h.JOKEYADI ?? "",
              trainer: h.ANTRENORADI ?? "",
              weightKg: toNumber(h.KILO),
              currentOdds,
              form,
              daysSinceLastRun: undefined,
            } satisfies Horse;
          }
        );

        if (horses.length === 0) continue;

        races.push({
          id: raceId,
          track: hip.AD ?? hip.KEY,
          raceNumber,
          name: `${hip.AD ?? hip.KEY} - ${raceNumber}. Koşu`,
          startTime: k.TARIH && k.SAAT
            ? parseTjkDateTime(k.TARIH, k.SAAT)
            : new Date().toISOString(),
          distanceMeters: toNumber(k.MESAFE),
          surface: k.PISTADI_TR ?? k.PIST ?? "unknown",
          condition: undefined,
          horses,
          scrapedAt: new Date().toISOString(),
        });
      }
    }

    return races.length > 0 ? races : null;
  } catch (err) {
    console.error("[scraper] TJK ebayi fetch failed:", err);
    return null;
  }
}

/** TJK's TARIH is "DD/MM/YYYY", SAAT is "HH:mm" — combine into an ISO string. */
function parseTjkDateTime(tarih: string, saat: string): string {
  const [dd, mm, yyyy] = tarih.split("/");
  if (!dd || !mm || !yyyy) return new Date().toISOString();
  const iso = `${yyyy}-${mm}-${dd}T${saat}:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * Attempt 2: TJK's official JSON data API.
 * Requires TJK_API_AUTH_KEY. Returns null (not throws) if the key is absent
 * or the call fails, so callers can fall through to the next source.
 */
async function fetchFromTjkApi(): Promise<Race[] | null> {
  const authKey = process.env.TJK_API_AUTH_KEY;
  if (!authKey) return null;

  try {
    const res = await fetch(
      `${TJK_API_BASE_URL}/program?date=${todayIso()}`,
      {
        headers: { "X-Auth": authKey, "User-Agent": USER_AGENT },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      console.error(`[scraper] TJK API HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();

    if (!json?.success || !Array.isArray(json?.data?.yarislar)) {
      console.error("[scraper] TJK API returned no usable data:", json?.message);
      return null;
    }

    const races: Race[] = json.data.yarislar.map((rawRace: any, idx: number) => {
      const raceId = `tjk-${rawRace.hipodromKey ?? "unknown"}-${rawRace.kosuNo ?? idx + 1}-${todayIso()}`;
      const horses: Horse[] = (rawRace.atlar ?? []).map((h: any, hIdx: number) => ({
        id: `${raceId}-${h.no ?? hIdx + 1}`,
        raceId,
        number: toNumber(h.no, hIdx + 1),
        name: h.at ?? h.atIsim ?? `Horse ${hIdx + 1}`,
        jockey: h.jokey ?? "",
        trainer: h.antrenor ?? h.sahip ?? "",
        weightKg: toNumber(h.kilo),
        currentOdds: toNumber(h.ganyan ?? h.agf, 0),
        barrier: h.startNo ? toNumber(h.startNo) : undefined,
        form: h.derece ?? h.ganyanForm ?? undefined,
        speedRating: h.hp ? toNumber(h.hp) : undefined,
        daysSinceLastRun: h.sonKosuGun ? toNumber(h.sonKosuGun) : undefined,
      }));

      return {
        id: raceId,
        track: rawRace.hipodrom ?? "Unknown",
        raceNumber: toNumber(rawRace.kosuNo, idx + 1),
        name: rawRace.kosuAdi ?? `Race ${idx + 1}`,
        startTime: rawRace.saat
          ? `${todayIso()}T${rawRace.saat}:00`
          : new Date().toISOString(),
        distanceMeters: toNumber(rawRace.mesafe),
        surface: rawRace.pist ?? "unknown",
        condition: rawRace.pistDurumu ?? undefined,
        horses,
        scrapedAt: new Date().toISOString(),
      };
    });

    return races;
  } catch (err) {
    console.error("[scraper] TJK API request failed:", err);
    return null;
  }
}

/**
 * Attempt 2: Cheerio HTML scrape of TJK's public program page.
 * Best-effort — TJK's WAF may 403 requests from cloud/datacenter IPs.
 * Returns null on any failure so callers fall through to the demo dataset.
 *
 * NOTE: TJK's page markup changes over time and is not officially documented;
 * the selectors below target the general race-card / entries-table structure
 * as of this writing and should be revisited if TJK changes their layout.
 */
async function fetchFromTjkHtml(): Promise<Race[] | null> {
  try {
    const res = await fetch(TJK_PROGRAM_PAGE_URL, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "tr-TR,tr;q=0.9",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(`[scraper] TJK HTML page HTTP ${res.status} (likely WAF-blocked)`);
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);
    const races: Race[] = [];

    $(".raceCard, .kosu-karti, table.programTable").each((raceIdx, raceEl) => {
      const track =
        $(raceEl).find(".hipodrom, .track-name").first().text().trim() || "Unknown";
      const raceNumber = raceIdx + 1;
      const raceId = `tjk-html-${track.replace(/\s+/g, "-").toLowerCase()}-${raceNumber}-${todayIso()}`;
      const horses: Horse[] = [];

      $(raceEl)
        .find("tr.horseRow, tr.at-satir")
        .each((hIdx, hEl) => {
          const cells = $(hEl).find("td");
          const name = $(cells.get(1)).text().trim() || `Horse ${hIdx + 1}`;
          horses.push({
            id: `${raceId}-${hIdx + 1}`,
            raceId,
            number: hIdx + 1,
            name,
            jockey: $(cells.get(2)).text().trim(),
            trainer: $(cells.get(3)).text().trim(),
            weightKg: toNumber($(cells.get(4)).text().trim()),
            currentOdds: toNumber($(cells.get(5)).text().trim()),
          });
        });

      if (horses.length > 0) {
        races.push({
          id: raceId,
          track,
          raceNumber,
          name: `${track} - Race ${raceNumber}`,
          startTime: new Date().toISOString(),
          distanceMeters: 1600,
          surface: "dirt",
          horses,
          scrapedAt: new Date().toISOString(),
        });
      }
    });

    return races.length > 0 ? races : null;
  } catch (err) {
    console.error("[scraper] TJK HTML scrape failed:", err);
    return null;
  }
}

/**
 * Attempt 3: deterministic synthetic dataset, clearly labeled as demo data.
 * Guarantees the pipeline (scrape → store → predict → UI) always has
 * something to run against, even with zero external access.
 */
function generateDemoRaces(): Race[] {
  const date = todayIso();
  const tracks = ["İstanbul (Veliefendi)", "Ankara (75. Yıl)", "İzmir (Şirinyer)"];
  const now = Date.now();

  return tracks.map((track, raceIdx) => {
    const raceId = `demo-${raceIdx + 1}-${date}`;
    const horseCount = 6 + (raceIdx % 3);

    const horses: Horse[] = Array.from({ length: horseCount }, (_, hIdx) => {
      const number = hIdx + 1;
      const seed = (raceIdx + 1) * 17 + number * 7;
      return {
        id: `${raceId}-${number}`,
        raceId,
        number,
        name: `Demo At ${raceIdx + 1}-${number}`,
        jockey: `Jokey ${String.fromCharCode(65 + (seed % 20))}`,
        trainer: `Antrenör ${String.fromCharCode(65 + ((seed * 3) % 20))}`,
        weightKg: 54 + (seed % 10),
        currentOdds: Math.round(((seed % 30) + 1.5 + hIdx * 0.7) * 10) / 10,
        barrier: number,
        form: `${(seed % 6) + 1}-${((seed * 2) % 6) + 1}-${((seed * 3) % 6) + 1}`,
        speedRating: 70 + (seed % 25),
        daysSinceLastRun: 7 + (seed % 40),
      };
    });

    return {
      id: raceId,
      track,
      raceNumber: raceIdx + 1,
      name: `${track} - ${raceIdx + 1}. Koşu`,
      startTime: new Date(now + raceIdx * 30 * 60 * 1000).toISOString(),
      distanceMeters: 1400 + raceIdx * 200,
      surface: raceIdx % 2 === 0 ? "turf" : "dirt",
      condition: "good",
      horses,
      scrapedAt: new Date().toISOString(),
    };
  });
}

/**
 * Main entry point used by /api/scrape.
 * Tries TJK API → TJK HTML → demo dataset, in that order, and reports
 * which source actually produced the data so the UI/API can be honest
 * about data freshness/provenance.
 */
export async function scrapeTodaysRaces(): Promise<ScrapeResult> {
  const fromEbayi = await fetchFromTjkEbayi();
  if (fromEbayi && fromEbayi.length > 0) {
    return {
      races: fromEbayi,
      source: "tjk-ebayi",
      note: "Fetched live from TJK's public ebayi.tjk.org feed (real races, structural data only — live odds populate closer to post time).",
    };
  }

  const fromApi = await fetchFromTjkApi();
  if (fromApi && fromApi.length > 0) {
    return {
      races: fromApi,
      source: "tjk-api",
      note: "Fetched live from the official TJK data API.",
    };
  }

  const fromHtml = await fetchFromTjkHtml();
  if (fromHtml && fromHtml.length > 0) {
    return {
      races: fromHtml,
      source: "tjk-html",
      note: "Fetched via HTML scraping of the public TJK program page.",
    };
  }

  return {
    races: generateDemoRaces(),
    source: "demo",
    note:
      "TJK data was unreachable from every live source (ebayi feed, authenticated API, HTML page). Serving a clearly-labeled synthetic dataset so the pipeline remains demoable end-to-end.",
  };
}