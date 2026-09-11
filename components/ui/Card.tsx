import type { ReactNode } from "react";

export interface CardProps {
  children: ReactNode;
  className?: string;
  /** Optional header row content (title/subtitle/actions) rendered above the body. */
  header?: ReactNode;
  /** Disables the default padding, useful when a child needs edge-to-edge layout. */
  noPadding?: boolean;
  onClick?: () => void;
}

/**
 * Generic panel/card wrapper used across the dashboard (race cards, race
 * detail sections, chart containers) for a consistent dark, sleek look.
 */
export default function Card({
  children,
  className = "",
  header,
  noPadding = false,
  onClick,
}: CardProps) {
  const Component = onClick ? "button" : "div";

  return (
    <Component
      onClick={onClick}
      className={`panel w-full text-left ${
        onClick ? "hover:border-primary/50 hover:shadow-glow transition-all cursor-pointer" : ""
      } ${noPadding ? "" : "p-4 sm:p-5"} ${className}`}
    >
      {header && (
        <div className={`${noPadding ? "p-4 sm:p-5 pb-0" : "mb-3"}`}>{header}</div>
      )}
      {children}
    </Component>
  );
}