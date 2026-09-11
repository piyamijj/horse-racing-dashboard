import type { ReactNode } from "react";

type ProgressBarTone = "primary" | "success" | "warning" | "danger" | "accent";

const TONE_BAR_CLASSES: Record<ProgressBarTone, string> = {
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  accent: "bg-accent",
};

export interface ProgressBarProps {
  /** Value from 0-100. Values outside this range are clamped. */
  value: number;
  /** Label shown above the bar, e.g. "Hız Reytingi". */
  label?: ReactNode;
  /** Optional text shown at the right of the label row, e.g. "82/100". */
  valueLabel?: ReactNode;
  tone?: ProgressBarTone;
  className?: string;
  /** Height of the bar track, in Tailwind spacing units terms. Defaults to compact. */
  size?: "sm" | "md";
}

/**
 * Horizontal progress bar used across the race detail view for speed rating,
 * weight disadvantage, form score, and win probability visualizations.
 */
export default function ProgressBar({
  value,
  label,
  valueLabel,
  tone = "primary",
  className = "",
  size = "md",
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const trackHeight = size === "sm" ? "h-1.5" : "h-2.5";

  return (
    <div className={className}>
      {(label || valueLabel) && (
        <div className="flex items-center justify-between mb-1">
          {label && <span className="text-xs text-muted">{label}</span>}
          {valueLabel !== undefined && (
            <span className="text-xs font-medium text-white">{valueLabel}</span>
          )}
        </div>
      )}
      <div className={`w-full rounded-full bg-surface-alt border border-border overflow-hidden ${trackHeight}`}>
        <div
          className={`${trackHeight} rounded-full ${TONE_BAR_CLASSES[tone]} transition-all duration-500`}
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}