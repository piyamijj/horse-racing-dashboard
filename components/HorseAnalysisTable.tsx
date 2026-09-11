"use client";

import ProgressBar from "@/components/ui/ProgressBar";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import type { HorsePrediction } from "@/lib/types";

export interface HorseAnalysisTableProps {
  predictions: HorsePrediction[];
}

function confidenceTone(score: number): "success" | "primary" | "warning" | "danger" {
  if (score >= 75) return "success";
  if (score >= 50) return "primary";
  if (score >= 25) return "warning";
  return "danger";
}

/**
 * Detailed per-horse AI analysis, ranked by confidence score (highest first,
 * as required by the dashboard's detail view). Each entry shows win
 * probability, confidence, value-bet status, the factor breakdown
 * (speed rating / weight disadvantage / form) as progress bars, and the
 * model's mathematical reasoning text.
 */
export default function HorseAnalysisTable({ predictions }: HorseAnalysisTableProps) {
  const ranked = [...predictions].sort(
    (a, b) => b.confidenceScore - a.confidenceScore
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Güven Skoruna Göre Sıralanmış Analiz
        </h3>
        <Badge tone="neutral">{ranked.length} at</Badge>
      </div>

      <div className="space-y-3">
        {ranked.map((p, idx) => (
          <Card key={p.horseId} className="!p-4">
            <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-surface-alt border border-border flex items-center justify-center text-xs font-semibold text-muted">
                  {idx + 1}
                </span>
                <h4 className="text-sm font-semibold">{p.horseName}</h4>
                {p.isValueBet && <Badge tone="success">Değerli Bahis</Badge>}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={confidenceTone(p.confidenceScore)}>
                  Güven: %{p.confidenceScore.toFixed(0)}
                </Badge>
                <Badge tone="primary">
                  Kazanma İhtimali: %{p.winProbabilityPercent.toFixed(1)}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <ProgressBar
                label="Hız Reytingi"
                valueLabel={p.factors.speedRatingScore.toFixed(0)}
                value={p.factors.speedRatingScore}
                tone="primary"
                size="sm"
              />
              <ProgressBar
                label="Kilo Dezavantajı"
                valueLabel={p.factors.weightDisadvantageScore.toFixed(0)}
                value={p.factors.weightDisadvantageScore}
                tone="warning"
                size="sm"
              />
              <ProgressBar
                label="Form Skoru"
                valueLabel={p.factors.formScore.toFixed(0)}
                value={p.factors.formScore}
                tone="accent"
                size="sm"
              />
            </div>

            <div className="rounded-lg bg-surface-alt border border-border p-3">
              <p className="text-xs text-muted mb-1 font-medium">
                Matematiksel Gerekçe
              </p>
              <p className="text-sm text-white/90 leading-relaxed">
                {p.reasoning}
              </p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}