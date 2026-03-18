import { useCallback, useRef } from "react";

type MarqueeRect = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

/**
 * HTML overlay that renders a semi-transparent selection rectangle
 * during marquee drag in TTS control mode.
 *
 * Uses direct DOM manipulation via ref to avoid re-renders per frame.
 */
export function MarqueeOverlay() {
  const rectRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={rectRef}
      className="pointer-events-none fixed z-[9999] border border-cyan-400 bg-cyan-400/10 rounded-sm"
      style={{ display: "none" }}
    />
  );
}

/**
 * Hook that returns a callback to update the MarqueeOverlay's DOM element directly.
 * Pass this callback to MarqueeSelectLayer's onMarqueeUpdate prop.
 */
export function useMarqueeOverlayRef() {
  const rectRef = useRef<HTMLDivElement>(null);

  const updateRect = useCallback((rect: MarqueeRect | null) => {
    const el = rectRef.current;
    if (!el) return;
    if (!rect) {
      el.style.display = "none";
      return;
    }
    const left = Math.min(rect.x1, rect.x2);
    const top = Math.min(rect.y1, rect.y2);
    const width = Math.abs(rect.x2 - rect.x1);
    const height = Math.abs(rect.y2 - rect.y1);
    el.style.display = "block";
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
  }, []);

  return { rectRef, updateRect };
}

/**
 * MarqueeOverlay with ref-based updates (combined component + hook).
 */
export function MarqueeOverlayWithRef({
  rectRef,
}: {
  rectRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={rectRef}
      className="pointer-events-none fixed z-[9999] border border-cyan-400 bg-cyan-400/10 rounded-sm"
      style={{ display: "none" }}
    />
  );
}
