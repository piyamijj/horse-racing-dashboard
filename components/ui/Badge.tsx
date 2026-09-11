import type { ReactNode } from "react";

type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "accent";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-surface-alt text-muted border-border",
  primary: "bg-primary/15 text-primary border-primary/40",
  success: "bg-success/15 text-success border-success/40",
  warning: "bg-warning/15 text-warning border-warning/40",
  danger: "bg-danger/15 text-danger border-danger/40",
  accent: "bg-accent/15 text-accent border-accent/40",
};

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

/**
 * Small pill-shaped label used for confidence scores, value-bet flags,
 * and data-source provenance ("Canlı TJK verisi", "Demo veri" vb.).
 */
export default function Badge({ children, tone = "neutral", className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}