"use client";

export interface MonitorIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

const SCREEN_PATH =
  "M4 3H20A2 2 0 0 1 22 5V15A2 2 0 0 1 20 17H4A2 2 0 0 1 2 15V5A2 2 0 0 1 4 3Z";
const BASE_PATH = "M8 21H16";
const NECK_PATH = "M12 17V21";

/** Remocn Monitor, adapted to Brizo's player-independent CSS animation runtime. */
export function MonitorIcon({
  size = 48,
  color = "currentColor",
  strokeWidth = 2,
  className,
}: MonitorIconProps) {
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
      <g className="remocn-monitor-screen">
        <path d={SCREEN_PATH} pathLength={1} />
      </g>
      <path className="remocn-monitor-base" d={BASE_PATH} pathLength={1} />
      <path className="remocn-monitor-neck" d={NECK_PATH} pathLength={1} />
    </svg>
  );
}

export function MonitorIconStatic({
  size = 48,
  color = "currentColor",
  strokeWidth = 2,
  className,
}: MonitorIconProps) {
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
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </svg>
  );
}
