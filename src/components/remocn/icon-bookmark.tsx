"use client";

export interface BookmarkIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
  filled?: boolean;
}

const BOOKMARK_PATH = "M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z";

export function BookmarkIcon({
  size = 48,
  color = "currentColor",
  strokeWidth = 2,
  className,
  filled = false,
}: BookmarkIconProps) {
  return (
    <svg className={`${className || ""}${filled ? " is-filled" : ""}`} width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g className="remocn-bookmark-body">
        <path d={BOOKMARK_PATH} pathLength={1} />
      </g>
    </svg>
  );
}

export const BookmarkIconStatic = BookmarkIcon;
