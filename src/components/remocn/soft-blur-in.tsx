"use client";

import {
  type CSSProperties,
  type ElementType,
  type ReactNode,
  useEffect,
  useRef,
} from "react";

const DEFAULT_UI_SELECTOR = [
  ".app-shell button:not(.soft-blur-in-skip)",
  ".app-shell input:not([type='range']):not([type='color']):not([type='checkbox']):not([type='radio'])",
  ".app-shell textarea",
  ".app-shell select",
  ".app-shell [role='menu']",
  ".app-shell [role='listbox']",
  ".app-shell [role='dialog']",
  ".app-shell .address-bar",
  ".bookmark-folder-flyout",
].join(",");

export interface SoftBlurInProps {
  as?: ElementType;
  blur?: number;
  children?: ReactNode;
  className?: string;
  [key: `data-${string}`]: string | number | boolean | undefined;
  distance?: number;
  duration?: number;
  fontWeight?: CSSProperties["fontWeight"];
  selector?: string;
  speed?: number;
  stagger?: number;
  style?: CSSProperties;
}

/**
 * Applies the Remocn Soft Blur In language to ordinary Brizo UI. It watches for
 * newly mounted controls so menus and dialogs replay the entrance only when
 * they actually appear, without introducing React state per animated element.
 */
export function SoftBlurIn({
  as: Component = "div",
  blur = 10,
  children,
  className,
  distance = 8,
  duration = 300,
  fontWeight,
  selector = DEFAULT_UI_SELECTOR,
  speed = 1,
  stagger = 12,
  style,
  ...elementProps
}: SoftBlurInProps) {
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof document === "undefined") return undefined;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animated = new WeakSet<Element>();

    const reveal = (candidate: Element, order: number) => {
      if (!(candidate instanceof HTMLElement) || animated.has(candidate)) return;
      animated.add(candidate);
      if (reducedMotion.matches || typeof candidate.animate !== "function") return;

      candidate.animate(
        [
          {
            filter: `blur(${blur}px)`,
            opacity: 0,
            transform: `translate3d(0, ${distance}px, 0)`,
          },
          {
            filter: "blur(0)",
            opacity: 1,
            transform: "translate3d(0, 0, 0)",
          },
        ],
        {
          delay: Math.min(order * stagger, 96),
          duration: duration / Math.max(0.1, speed),
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "backwards",
        },
      );
    };

    const revealWithin = (node: Node) => {
      if (!(node instanceof Element)) return;
      const matches = [];
      if (node.matches(selector)) matches.push(node);
      matches.push(...node.querySelectorAll(selector));
      matches.forEach(reveal);
    };

    revealWithin(document.body);
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => mutation.addedNodes.forEach(revealWithin));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [blur, distance, duration, selector, speed, stagger]);

  return (
    <Component
      ref={rootRef}
      className={className}
      style={fontWeight === undefined ? style : { ...style, fontWeight }}
      {...elementProps}
    >
      {children}
    </Component>
  );
}
