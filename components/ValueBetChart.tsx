"use client";

import ProgressBar from "@/components/ui/ProgressBar";
import Badge from "@/components/ui/Badge";
import type { HorsePrediction } from "@/lib/types";

export interface ValueBetChartProps {
  predictions: HorsePrediction[];
}

/**
 * Compares the AI's estimated win probability against the implied
 * probability derived from current odds, for every horse in a race.
 * A visible gap where winProbabilityPercent > impliedProbabilityPercent
 * marks a "value bet" — highlighted in green.
 *
 * Built with ProgressBar primitives only — no external chart library,
 * keeping the bundle small and Vercel-friendly.
 */
export default function ValueBetChart({ predictions }: ValueBetChartProps) {
  const sorted = [...predictions].sort(
    (a, b) => b.valueEdgePercent - a.valueEdgePercent
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Model Olasılığı vs. Oranların İma Ettiği Olasılık
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-primary inline-block" />
            Model Tahmini
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-muted inline-block" />
            Oran İma Edilen
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {sorted.map((p) => (
          <div
            key={p.horseId}
            className={`rounded-xl border p-3 ${
              p.isValueBet
                ? "border-success/40 bg-success/5"
                : "border-border bg-surface-alt"
            }`}
          >
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <span className="text-sm font-medium">{p.horseName}</span>
              <div className="flex items-center gap-2">
                {p.isValueBet && (
                  <Badge tone="success">
                    Değerli Bahis · +{p.valueEdgePercent.toFixed(1)} puan
                  </Badge>
                )}
                {!p.isValueBet && p.oddsAvailable && (
                  <Badge tone="neutral">
                    Fark: {p.valueEdgePercent.toFixed(1)} puan
                  </Badge>
                )}
                {!p.oddsAvailable && (
                  <Badge tone="neutral">Oran henüz açıklanmadı</Badge>
                )}
              </div>
            </div>

            <ProgressBar
              label="Model Kazanma Olasılığı"
              valueLabel={`%${p.winProbabilityPercent.toFixed(1)}`}
              value={p.winProbabilityPercent}
              tone={p.isValueBet ? "success" : "primary"}
              size="sm"
              className="mb-2"
            />
            <ProgressBar
              label="Oranların İma Ettiği Olasılık"
              valueLabel={
                p.oddsAvailable ? `%${p.impliedProbabilityPercent.toFixed(1)}` : "Oran yok"
              }
              value={p.impliedProbabilityPercent}
              tone="accent"
              size="sm"
            />
          </div>
        ))}
      </div>

      <p className="text-xs text-muted leading-relaxed">
        "Değerli Bahis" etiketi, modelin hesapladığı kazanma olasılığının
        güncel oranların ima ettiği olasılıktan yüksek olduğu atları
        gösterir. Bu bir tavsiye değil, matematiksel bir karşılaştırmadır.
      </p>
    </div>
  );
}