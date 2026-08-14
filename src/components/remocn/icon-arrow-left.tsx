"use client";

export interface ArrowLeftIconProps { size?: number; color?: string; strokeWidth?: number; className?: string; }

export function ArrowLeftIcon({ size = 48, color = "currentColor", strokeWidth = 2, className }: ArrowLeftIconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g className="remocn-arrow-body">
        <path d="M19 12H5" pathLength={1} />
        <path d="m12 19-7-7 7-7" pathLength={1} />
      </g>
    </svg>
  );
}

export const ArrowLeftIconStatic = ArrowLeftIcon;
