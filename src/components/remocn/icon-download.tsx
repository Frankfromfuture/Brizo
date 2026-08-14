"use client";

export interface DownloadIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
  onAnimationEnd?: () => void;
}

const TRAY_PATH = "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4";
const SHAFT_PATH = "M12 15V3";
const HEAD_PATH = "M7 10 12 15 17 10";

/**
 * Remocn's Download silhouette, kept player-independent so Brizo can replay
 * its draw/drop choreography from CSS on hover and real download activity.
 */
export function DownloadIcon({
  size = 48,
  color = "currentColor",
  strokeWidth = 2,
  className,
  onAnimationEnd,
}: DownloadIconProps) {
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
      onAnimationEnd={onAnimationEnd}
    >
      <path d={SHAFT_PATH} pathLength={1} />
      <path d={TRAY_PATH} pathLength={1} />
      <path d={HEAD_PATH} pathLength={1} />
    </svg>
  );
}

export const DownloadIconStatic = DownloadIcon;
