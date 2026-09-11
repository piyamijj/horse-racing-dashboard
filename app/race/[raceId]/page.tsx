"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import HorseAnalysisTable from "@/components/HorseAnalysisTable";
import ValueBetChart from "@/components/ValueBetChart";
import type { ApiResult, Race, RacePrediction } from "@/lib/types";

const SURFACE_LABELS: Record<string, string> = {
  turf: "Çim",
  dirt: "Kum",
  synthetic: "Sentetik",
  unknown: "Bilinmiyor",
};

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Race detail page: shows race metadata, then triggers/reads the AI
 * analysis for that race and renders it ranked by confidence score
 * (HorseAnalysisTable) alongside the value-bet comparison chart
 * (ValueBetChart). All user-facing text is in Turkish.
 */
export default function RaceDetailPage() {
  const params = useParams<{ raceId: string }>();
  const router = useRouter();
  const raceId = params?.raceId;

  const [race, setRace] = useState<Race | null>(null);
  const [prediction, setPrediction] = useState<RacePrediction | null>(null);
  const [loadingRace, setLoadingRace] = useState(true);
  const [loadingPrediction, setLoadingPrediction] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [predictionError, setPredictionError] = useState<string | null>(null);

  const loadRace = useCallback(async () => {
    if (!raceId) return;
    try {
      setError(null);
      const res = await fetch("/api/races", { cache: "no-store" });
      const json: ApiResult<{ races: Race[] }> = await res.json();

      if (!json.ok || !json.data) {
        throw new Error(json.error || "Koşu verileri alınamadı.");
      }

      const found = json.data.races.find((r) => r.id === raceId);

      if (!found) {
        throw new Error(
          "Bu koşu bulunamadı. Verilerin yenilenmesi gerekiyor olabilir."
        );
      }

      setRace(found);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Koşu yüklenirken beklenmeyen bir hata oluştu."
      );
    } finally {
      setLoadingRace(false);
    }
  }, [raceId]);

  const loadPrediction = useCallback(
    async (forceRefresh = false) => {
      if (!raceId) return;
      try {
        setPredictionError(null);
        setLoadingPrediction(true);
        const url = forceRefresh
          ? `/api/predict?raceId=${encodeURIComponent(raceId)}&refresh=1`
          : `/api/predict?raceId=${encodeURIComponent(raceId)}`;
        const res = await fetch(url, { cache: "no-store" });
        const json: ApiResult<RacePrediction> = await res.json();

        if (!json.ok || !json.data) {
          throw new Error(json.error || "Analiz alınamadı.");
        }

        setPrediction(json.data);
      } catch (err) {
        setPredictionError(
          err instanceof Error
            ? err.message
            : "Analiz yüklenirken beklenmeyen bir hata oluştu."
        );
      } finally {
        setLoadingPrediction(false);
        setRefreshing(false);
      }
    },
    [raceId]
  );

  useEffect(() => {
    loadRace();
  }, [loadRace]);

  useEffect(() => {
    if (race) {
      loadPrediction(false);
    }
  }, [race, loadPrediction]);

  async function handleReanalyze() {
    setRefreshing(true);
    await loadPrediction(true);
  }

  if (loadingRace) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-64 bg-surface-alt rounded animate-pulse" />
        <Card className="animate-pulse h-32" />
      </div>
    );
  }

  if (error || !race) {
    return (
      <Card className="text-center py-10">
        <p className="text-danger font-medium mb-2">Bir sorun oluştu</p>
        <p className="text-sm text-muted mb-4">
          {error || "Koşu bulunamadı."}
        </p>
        <button
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition"
        >
          Ana Sayfaya Dön
        </button>
      </Card>
    );
  }

  const surfaceLabel = SURFACE_LABELS[race.surface] ?? race.surface;

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push("/")}
        className="text-xs text-muted hover:text-white transition inline-flex items-center gap-1"
      >
        ← Tüm Koşulara Dön
      </button>

      <section>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs text-muted mb-1">
              {race.track} · {race.raceNumber}. Koşu
            </p>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              {race.name}
            </h1>
          </div>
          <Badge tone="primary">{formatTime(race.startTime)}</Badge>
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Badge tone="neutral">{race.distanceMeters} m</Badge>
          <Badge tone="neutral">{surfaceLabel}</Badge>
          {race.condition && <Badge tone="neutral">Pist: {race.condition}</Badge>}
          <Badge tone="accent">{race.horses.length} at</Badge>
        </div>
      </section>

      {loadingPrediction && (
        <Card className="text-center py-10">
          <p className="text-sm text-muted">
            Yapay zeka analiz motoru koşuyu değerlendiriyor, lütfen bekleyin...
          </p>
        </Card>
      )}

      {!loadingPrediction && predictionError && (
        <Card className="text-center py-10">
          <p className="text-danger font-medium mb-2">Analiz alınamadı</p>
          <p className="text-sm text-muted mb-4">{predictionError}</p>
          <button
            onClick={handleReanalyze}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {refreshing ? "Yeniden deneniyor..." : "Tekrar Dene"}
          </button>
        </Card>
      )}

      {!loadingPrediction && prediction && !predictionError && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span>
                Analiz motoru: <span className="text-white">{prediction.provider === "gemini" ? "Gemini" : "Groq"}</span>
              </span>
              <span>·</span>
              <span>
                Oluşturulma:{" "}
                {new Date(prediction.generatedAt).toLocaleString("tr-TR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <button
              onClick={handleReanalyze}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-alt px-3 py-1.5 text-xs font-medium hover:border-primary/50 transition disabled:opacity-50"
            >
              {refreshing ? "Yeniden analiz ediliyor..." : "Yeniden Analiz Et"}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <HorseAnalysisTable predictions={prediction.predictions} />
            </div>
            <div className="lg:col-span-2">
              <Card>
                <ValueBetChart predictions={prediction.predictions} />
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}