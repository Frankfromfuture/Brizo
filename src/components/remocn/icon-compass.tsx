"use client";

import React from "react";

export interface CompassIconProps {
  size?: number;
  color?: string;
  highlightColor?: string;
  strokeWidth?: number;
  className?: string;
}

/**
 * Remocn Animated Compass Icon
 * Converted from Lottie "17 Compass" with Brizo Logo Gold highlight.
 */
export function CompassIcon({
  size = 35,
  color = "currentColor",
  highlightColor = "var(--brizo-gold, #a58c5e)",
  strokeWidth = 16,
  className = "",
}: CompassIconProps) {
  return (
    <svg
      className={`remocn-compass-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 500 500"
      fill="none"
      aria-hidden="true"
    >
      <g className="remocn-compass-body">
        {/* Top Ring / Handle */}
        <path
          d="M 226.736 141.736 C 226.736 117.073 237.759 106.05 250 106.05 C 262.241 106.05 273.264 117.073 273.264 141.736"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Top Highlight Arc */}
        <path
          className="remocn-compass-highlight"
          d="M 214.169 123.894 C 214.169 101.197 229.5 78.5 250 78.5 C 270.5 78.5 285.831 101.197 285.831 123.894"
          stroke={highlightColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Outer Ring */}
        <circle
          cx="250"
          cy="281.618"
          r="139.882"
          stroke={color}
          strokeWidth={strokeWidth}
        />

        {/* Inner Dial Circle */}
        <circle
          cx="250"
          cy="281.618"
          r="110.373"
          stroke={color}
          strokeWidth={strokeWidth}
        />

        {/* 4 Cardinal Tick Marks */}
        {/* Top Tick */}
        <line
          x1="250"
          y1="173.078"
          x2="250"
          y2="196.51"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Right Tick */}
        <line
          x1="335.108"
          y1="281.618"
          x2="358.54"
          y2="281.618"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Bottom Tick */}
        <line
          x1="250"
          y1="366.726"
          x2="250"
          y2="390.158"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Left Tick */}
        <line
          x1="141.46"
          y1="281.618"
          x2="164.892"
          y2="281.618"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Animated Needle / Arrow */}
        <g className="remocn-compass-needle" style={{ transformOrigin: "250px 281.618px" }}>
          {/* North Pointer (Gold Highlight) */}
          <path
            d="M 278.6 273.7 L 305.5 337.1 L 242.1 310.2 Z"
            fill={highlightColor}
            stroke={highlightColor}
            strokeWidth={12}
            strokeLinejoin="round"
          />
          {/* South Pointer (Base Dark / Highlight) */}
          <path
            d="M 221.4 289.5 L 194.5 226.1 L 257.9 253.0 Z"
            fill={color}
            stroke={color}
            strokeWidth={12}
            strokeLinejoin="round"
          />
          {/* Center Pin */}
          <circle
            cx="250"
            cy="281.618"
            r="12"
            fill={highlightColor}
          />
        </g>
      </g>
    </svg>
  );
}

export const CompassIconStatic = CompassIcon;
