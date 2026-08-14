"use client";

export interface PlusIconProps { size?: number; color?: string; strokeWidth?: number; className?: string; }

export function PlusIcon({ size = 48, color = "currentColor", strokeWidth = 2, className }: PlusIconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" pathLength={1} />
      <path d="M12 5v14" pathLength={1} />
    </svg>
  );
}

export const PlusIconStatic = PlusIcon;
