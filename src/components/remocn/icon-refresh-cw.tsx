"use client";

export interface RefreshCwIconProps { size?: number; color?: string; strokeWidth?: number; className?: string; }

export function RefreshCwIcon({ size = 48, color = "currentColor", strokeWidth = 2, className }: RefreshCwIconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path className="remocn-refresh-arc" d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" pathLength={1} />
      <path className="remocn-refresh-head" d="M21 3v5h-5" pathLength={1} />
      <path className="remocn-refresh-arc" d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" pathLength={1} />
      <path className="remocn-refresh-head" d="M8 16H3v5" pathLength={1} />
    </svg>
  );
}

export const RefreshCwIconStatic = RefreshCwIcon;
