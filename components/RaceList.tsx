"use client";

import { useCallback, useEffect, useState } from "react";
import RaceCard from "@/components/RaceCard";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import type { Race, ApiResult } from "@/lib/types";

interface RacesResponseData {
  races: Race[];
  updatedAt: string | null;
  source?: string;
  backend?: string;
}

function formatUpdatedAt(iso: string | null): string {
  if (!iso) return "henüz güncellenmedi";
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Fetches and lists today's races, with loading / empty / error states in
 * Turkish and a manual "yenile" (refresh) action that triggers a fresh
 * scrape before reloading the list.
 */
export default function RaceList() {
  const [races, setRaces] = useState<Race[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRaces = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/races", { cache: "no-store" });
      const json: ApiResult<RacesResponseData> = await res.json();

      if (!json.ok || !json.data) {
        throw new Error(json.error || "Koşu verileri alınamadı.");
      }

      setRaces(json.data.races);
      setUpdatedAt(json.data.updatedAt);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Koşu verileri yüklenirken beklenmeyen bir hata oluştu."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadRaces();
  }, [loadRaces]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch("/api/scrape", { method: "POST" });
    } catch {
      // scrape failure is surfaced by the subsequent loadRaces() error state
    }
    await loadRaces();
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <div className="h-3 w-24 bg-surface-alt rounded mb-2" />
            <div className="h-4 w-40 bg-surface-alt rounded mb-4" />
            <div className="h-6 w-full bg-surface-alt rounded" />
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="text-center py-10">
        <p className="text-danger font-medium mb-2">Bir sorun oluştu</p>
        <p className="text-sm text-muted mb-4">{error}</p>
        <button
          onClick={handleRefresh}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition"
        >
          Tekrar dene
        </button>
      </Card>
    );
  }

  if (races.length === 0) {
    return (
      <Card className="text-center py-10">
        <p className="font-medium mb-2">Bugün için koşu verisi bulunamadı</p>
        <p className="text-sm text-muted mb-4">
          Veriler henüz alınmamış olabilir. Aşağıdaki butonla yenilemeyi
          deneyebilirsiniz.
        </p>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {refreshing ? "Yenileniyor..." : "Verileri Yenile"}
        </button>
      </Card>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Bugünün Koşuları</h2>
          <Badge tone="neutral">{races.length} koşu</Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">
            Son güncelleme: {formatUpdatedAt(updatedAt)}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-alt px-3 py-1.5 text-xs font-medium hover:border-primary/50 transition disabled:opacity-50"
          >
            {refreshing ? "Yenileniyor..." : "Yenile"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {races.map((race) => (
          <RaceCard key={race.id} race={race} />
        ))}
      </div>
    </div>
  );
}