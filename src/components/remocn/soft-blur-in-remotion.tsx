"use client";

import { Easing, interpolate, useCurrentFrame } from "remotion";

export interface RemotionSoftBlurInProps {
  text: string;
  blur?: number;
  fontSize?: number;
  color?: string;
  fontWeight?: number;
  speed?: number;
  className?: string;
}

/** The original Remocn per-character composition for Remotion timelines. */
export function RemotionSoftBlurIn({
  text,
  blur = 12,
  fontSize = 72,
  color = "#171717",
  fontWeight = 600,
  speed = 1,
  className,
}: RemotionSoftBlurInProps) {
  const frame = useCurrentFrame() * speed;
  const chars = Array.from(text);
  const easing = Easing.bezier(0.22, 1, 0.36, 1);

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
      <span className={className} style={{ fontSize, fontWeight, color, letterSpacing: "-0.05em", fontFamily: "var(--font-geist-sans), -apple-system, BlinkMacSystemFont, sans-serif" }}>
        {chars.map((char, index) => {
          const local = frame - index;
          const opacity = interpolate(local, [0, 27], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });
          const y = interpolate(local, [0, 9], [16, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });
          const blurAmount = interpolate(local, [0, 27], [blur, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing });
          return (
            <span
              key={`${char}-${index}`}
              style={{
                display: "inline-block",
                whiteSpace: "pre",
                backfaceVisibility: "hidden",
                transformOrigin: "50% 55%",
                opacity,
                transform: `translateY(${y}px)`,
                filter: `blur(${blurAmount}px)`,
              }}
            >
              {char}
            </span>
          );
        })}
      </span>
    </div>
  );
}
