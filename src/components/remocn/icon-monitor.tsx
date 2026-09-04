"use client";

import { useEffect, useRef } from "react";

export interface MonitorIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
  animate?: boolean;
}

const SCREEN_PATH =
  "M4 3H20A2 2 0 0 1 22 5V15A2 2 0 0 1 20 17H4A2 2 0 0 1 2 15V5A2 2 0 0 1 4 3Z";
const BASE_PATH = "M8 21H16";
const NECK_PATH = "M12 17V21";

// @remocn/icon-monitor: 16 draw frames, 2 delay frames, 18 action frames at 30 fps.
// Run its SVG motion with native animations so ordinary React needs no video player.
const FRAME_MS = 1000 / 30;
const OUT_QUAD = "cubic-bezier(0.333333, 0.666667, 0.666667, 1)";
const monitorActionFrames = Array.from({ length: 61 }, (_, index) => {
  const t = index / 60;
  const phase = t <= 0.45 ? t / 0.45 : (t - 0.45) / 0.55;
  const eased = 1 - (1 - phase) ** 2;
  const scaleY = t <= 0.45 ? 0.92 + 0.12 * eased : 1.04 - 0.04 * eased;
  return { offset: t, transform: `scaleY(${scaleY})` };
});
const monitorPopFrames = Array.from({ length: 61 }, (_, index) => {
  const t = index / 60;
  const phase = t < 0.5 ? 0 : t <= 0.7 ? (t - 0.5) / 0.2 : (t - 0.7) / 0.3;
  const eased = phase < 0.5 ? 2 * phase ** 2 : 1 - (-2 * phase + 2) ** 2 / 2;
  const scale = t < 0.5 ? 1 : t <= 0.7 ? 1 + 0.02 * eased : 1.02 - 0.02 * eased;
  return { offset: t, transform: `scale(${scale})` };
});

export function MonitorIcon({
  size = 48,
  color = "currentColor",
  strokeWidth = 2,
  className,
  animate = false,
}: MonitorIconProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !animate) return undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animations: Animation[] = [];
    const stop = () => {
      animations.forEach((animation) => animation.cancel());
      animations = [];
    };
    const sync = () => {
      stop();
      if (document.hidden || reducedMotion.matches) return;
      const draw = (selector: string, delay: number, duration: number) => {
        svg.querySelectorAll(selector).forEach((path) => {
          animations.push(path.animate([
            { strokeDasharray: "1", strokeDashoffset: "1" },
            { strokeDasharray: "1", strokeDashoffset: "0" },
          ], { delay, duration, easing: OUT_QUAD, fill: "backwards" }));
        });
      };
      draw(".remocn-monitor-base, .remocn-monitor-neck", 0, 8 * FRAME_MS);
      draw(".remocn-monitor-screen path", 5.6 * FRAME_MS, 10.4 * FRAME_MS);
      animations.push(svg.animate([{ transform: "scale(0.85)" }, { transform: "scale(1)" }], {
        duration: 16 * FRAME_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      }));
      const screen = svg.querySelector<SVGGElement>(".remocn-monitor-screen");
      const actionTiming = { delay: 18 * FRAME_MS, duration: 18 * FRAME_MS, iterations: Infinity };
      if (screen) animations.push(screen.animate(monitorActionFrames, actionTiming));
      animations.push(svg.animate(monitorPopFrames, actionTiming));
    };
    sync();
    reducedMotion.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      stop();
      reducedMotion.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [animate]);

  return (
    <svg
      ref={svgRef}
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ overflow: "visible", transformOrigin: "center" }}
      aria-hidden="true"
    >
      <g className="remocn-monitor-screen" style={{ transformOrigin: "12px 10px" }}>
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
