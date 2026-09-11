"use client";

import Link from "next/link";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import type { Race } from "@/lib/types";

export interface RaceCardProps {
  race: Race;
}

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

const SURFACE_LABELS: Record<string, string> = {
  turf: "Çim",
  dirt: "Kum",
  synthetic: "Sentetik",
  unknown: "Bilinmiyor",
};

/**
 * Summary card for a single race shown in the today's-races list.
 * Links through to the race detail view for AI analysis.
 */
export default function RaceCard({ race }: RaceCardProps) {
  const surfaceLabel = SURFACE_LABELS[race.surface] ?? race.surface;

  return (
    <Link href={`/race/${race.id}`} className="block">
      <Card className="hover:border-primary/50 hover:shadow-glow transition-all cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted mb-1">
              {race.track} · {race.raceNumber}. Koşu
            </p>
            <h3 className="text-sm font-semibold text-white leading-snug">
              {race.name}
            </h3>
          </div>
          <Badge tone="primary">{formatTime(race.startTime)}</Badge>
        </div>

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <Badge tone="neutral">{race.distanceMeters} m</Badge>
          <Badge tone="neutral">{surfaceLabel}</Badge>
          {race.condition && <Badge tone="neutral">Pist: {race.condition}</Badge>}
          <Badge tone="accent">{race.horses.length} at</Badge>
        </div>
      </Card>
    </Link>
  );
}