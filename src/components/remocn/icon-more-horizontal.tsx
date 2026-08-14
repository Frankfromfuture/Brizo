"use client";

export interface MoreHorizontalIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}

export function MoreHorizontalIcon({
  size = 48,
  color = "currentColor",
  strokeWidth = 2,
  className,
}: MoreHorizontalIconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle className="remocn-more-dot" cx="5" cy="12" r="1" />
      <circle className="remocn-more-dot" cx="12" cy="12" r="1" />
      <circle className="remocn-more-dot" cx="19" cy="12" r="1" />
    </svg>
  );
}

export const MoreHorizontalIconStatic = MoreHorizontalIcon;
