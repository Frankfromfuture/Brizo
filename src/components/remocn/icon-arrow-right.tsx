"use client";

export interface ArrowRightIconProps { size?: number; color?: string; strokeWidth?: number; className?: string; }

export function ArrowRightIcon({ size = 48, color = "currentColor", strokeWidth = 2, className }: ArrowRightIconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g className="remocn-arrow-body">
        <path d="M5 12h14" pathLength={1} />
        <path d="m12 5 7 7-7 7" pathLength={1} />
      </g>
    </svg>
  );
}

export const ArrowRightIconStatic = ArrowRightIcon;
