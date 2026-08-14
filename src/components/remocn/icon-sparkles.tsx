"use client";

export interface SparklesIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

const MAIN_PATH =
  "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z";

/** Remocn's Sparkles silhouette, adapted for Brizo's CSS animation runtime. */
export function SparklesIcon({
  size = 48,
  color = "currentColor",
  strokeWidth = 2,
  className,
}: SparklesIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path className="remocn-sparkles-main" d={MAIN_PATH} pathLength={1} />
      <g className="remocn-sparkles-accent remocn-sparkles-accent-top">
        <path d="M20 2v4" />
        <path d="M22 4h-4" />
      </g>
      <circle className="remocn-sparkles-accent remocn-sparkles-accent-bottom" cx="4" cy="20" r="2" />
    </svg>
  );
}

export const SparklesIconStatic = SparklesIcon;
