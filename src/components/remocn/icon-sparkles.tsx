"use client";

import { useEffect, useRef } from "react";

export interface SparklesIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
  softLoop?: boolean;
}

const MAIN_PATH =
  "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z";
const SOFT_LOOP_INTERVAL_MS = 4_050;

/** Remocn's Sparkles silhouette, adapted for Brizo's CSS animation runtime. */
export function SparklesIcon({
  size = 48,
  color = "currentColor",
  strokeWidth = 2,
  className,
  softLoop = false,
}: SparklesIconProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const node = svgRef.current;
    if (!node || !softLoop) return undefined;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let phase = false;
    let timer = 0;

    const stop = () => {
      if (timer) window.clearTimeout(timer);
      timer = 0;
      delete node.dataset.sparklesPhase;
    };
    const schedule = (delay = SOFT_LOOP_INTERVAL_MS) => {
      if (timer || reducedMotion.matches || document.hidden || !document.hasFocus()) return;
      timer = window.setTimeout(() => {
        timer = 0;
        phase = !phase;
        node.dataset.sparklesPhase = phase ? "top" : "bottom";
        schedule();
      }, delay);
    };
    const sync = () => {
      stop();
      schedule(900);
    };

    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", stop);
    reducedMotion.addEventListener("change", sync);
    schedule(900);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", stop);
      reducedMotion.removeEventListener("change", sync);
    };
  }, [softLoop]);

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
      aria-hidden="true"
    >
      <path className="remocn-sparkles-main" d={MAIN_PATH} pathLength={1} />
      <g className="remocn-sparkles-accent remocn-sparkles-accent-top">
        <path d="M20 2v4" />
        <path d="M22 4h-4" />
      </g>
      <circle className="remocn-sparkles-accent remocn-sparkles-accent-bottom" cx="4" cy="20" r="2" />
    </svg>
  );
}

export const SparklesIconStatic = SparklesIcon;
