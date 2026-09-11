"use client";

import { useCallback, useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import type { AltiliSummary, ApiResult } from "@/lib/types";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "--:--";
  }
}

export default function AltiliGanyanPage() {
  const [summary, setSummary] = useState<AltiliSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/altili", { cache: "no-store" });
      const json: ApiResult<AltiliSummary | null> = await res.json();

      if (!json.ok) {
        setError(json.error || "Altılı Ganyan verisi alınamadı.");
        setSummary(null);
        return;
      }

      if (!json.data) {
        setNotice(
          json.error ||
            "Bugünün verilerinde bir Altılı Ganyan bloğu tespit edilemedi. Önce günün koşularını güncelleyin."
        );
        setSummary(null);
        return;
      }

      setSummary(json.data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Altılı Ganyan verisi alınırken beklenmeyen bir hata oluştu."
      );
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Altılı Ganyan Özeti</h2>
          <p className="text-sm text-muted mt-1">
            Günün Altılı Ganyan'ındaki 6 ayağın yapay zeka analizine göre en
            olası kazananı, yakın rakibi ve olası sürpriz atı — tek bakışta.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-border bg-surface-alt px-3 py-1.5 text-sm font-medium hover:bg-surface-alt/70 transition-colors disabled:opacity-50"
        >
          {loading ? "Yükleniyor..." : "Yenile"}
        </button>
      </div>

      {loading && (
        <Card className="animate-pulse space-y-3">
          <div className="h-4 w-40 rounded bg-surface-alt" />
          <div className="h-24 rounded bg-surface-alt" />
        </Card>
      )}

      {!loading && error && (
        <Card className="border-danger/40 bg-danger/5">
          <p className="text-sm text-danger">{error}</p>
        </Card>
      )}

      {!loading && !error && notice && (
        <Card>
          <p className="text-sm text-muted leading-relaxed">{notice}</p>
        </Card>
      )}

      {!loading && !error && summary && (
        <>
          <Card className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-sm font-semibold">{summary.track}</p>
              <p className="text-xs text-muted">{summary.date} · 6 Ayaklı Altılı Ganyan</p>
            </div>
            <Badge tone="primary">6 Ayak</Badge>
          </Card>

          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-medium">Ayak</th>
                  <th className="px-4 py-3 font-medium">Koşu</th>
                  <th className="px-4 py-3 font-medium">Saat</th>
                  <th className="px-4 py-3 font-medium">En Olası Kazanan</th>
                  <th className="px-4 py-3 font-medium">Yakın Rakip</th>
                  <th className="px-4 py-3 font-medium">Sürpriz Adayı</th>
                </tr>
              </thead>
              <tbody>
                {summary.legs.map((leg) => (
                  <tr
                    key={leg.raceId}
                    className="border-b border-border last:border-0 align-top"
                  >
                    <td className="px-4 py-3 font-semibold text-primary">
                      {leg.legNumber}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{leg.raceNumber}. Koşu</span>
                    </td>
                    <td className="px-4 py-3 text-muted">{formatTime(leg.startTime)}</td>
                    {leg.pending ? (
                      <td colSpan={3} className="px-4 py-3">
                        <Badge tone="warning">Analiz bekleniyor</Badge>
                        <p className="text-xs text-muted mt-1">
                          Bu ayak için yapay zeka analizi şu anda oluşturulamadı
                          (sağlayıcı geçici olarak meşgul). Sayfayı yenileyin.
                        </p>
                      </td>
                    ) : (
                    <>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-xs font-bold">
                          {leg.topPick.horseNumber}
                        </span>
                        <div>
                          <p className="font-medium leading-tight">
                            {leg.topPick.horseName}
                          </p>
                          <p className="text-xs text-muted leading-tight">
                            %{leg.topPick.winProbabilityPercent.toFixed(1)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {leg.nearTie ? (
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-alt text-xs font-bold">
                            {leg.nearTie.horseNumber}
                          </span>
                          <div>
                            <p className="font-medium leading-tight">
                              {leg.nearTie.horseName}
                            </p>
                            <p className="text-xs text-muted leading-tight">
                              %{leg.nearTie.winProbabilityPercent.toFixed(1)}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">Yakın rakip yok</span>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      {leg.upset ? (
                        <div className="space-y-1">
                          <Badge tone="success">
                            {leg.upset.horseNumber} · {leg.upset.horseName} · %
                            {leg.upset.winProbabilityPercent.toFixed(1)}
                          </Badge>
                          <p className="text-xs text-muted leading-snug">
                            {leg.upset.reasoning}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-muted">Belirgin sürpriz sinyali yok</span>
                      )}
                    </td>
                    </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <p className="text-xs text-muted leading-relaxed">
            "Yakın Rakip" sütunu, en olası kazanana yapay zeka tahmininde
            puan bazında yakın bir at olduğunda gösterilir. "Sürpriz Adayı"
            ise favoriler dışından, taşıdığı verilere göre sürpriz yapma
            ihtimali olan tek atı işaret eder — bu bir bahis tavsiyesi
            değil, matematiksel bir olasılık karşılaştırmasıdır.
          </p>
        </>
      )}
    </div>
  );
}