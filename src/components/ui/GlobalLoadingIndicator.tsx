"use client";

import { useEffect, useState, useMemo } from "react";
import { useLoadingContext } from "@/lib/contexts/LoadingContext";

const FADE_DURATION_MS = 400;
const SPINNER_CHARS = ["✵", "⎈", "❇︎", "*", "⚙︎", "⌾"];

/**
 * GlobalLoadingIndicator renders an ASCII-styled spinner that mirrors the
 * Next.js dev helper position and vibe. It fades in/out smoothly while
 * remaining non-blocking for user interaction.
 */
export default function GlobalLoadingIndicator() {
  const { isLoading } = useLoadingContext();
  const [shouldRender, setShouldRender] = useState(isLoading);
  const [charIndex, setCharIndex] = useState(0);

  // Handle fade out delay
  useEffect(() => {
    let timeout: number | undefined;

    if (isLoading) {
      setShouldRender(true);
    } else if (shouldRender) {
      timeout = window.setTimeout(() => {
        setShouldRender(false);
      }, FADE_DURATION_MS);
    }

    return () => {
      if (timeout) {
        window.clearTimeout(timeout);
      }
    };
  }, [isLoading, shouldRender]);

  // Rotate spinner characters
  useEffect(() => {
    if (!isLoading) return undefined;

    const interval = setInterval(() => {
      setCharIndex((prev) => (prev + 1) % SPINNER_CHARS.length);
    }, 150);

    return () => clearInterval(interval);
  }, [isLoading]);

  const containerClasses = useMemo(
    () =>
      [
        "pointer-events-none",
        "fixed",
        "bottom-4",
        "left-4",
        "z-[9999]",
        "transition-opacity",
        "duration-200",
        "ease-out",
        isLoading ? "opacity-100" : "opacity-0",
      ].join(" "),
    [isLoading]
  );

  if (!shouldRender && !isLoading) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading"
      className={containerClasses}
    >
      <span className="text-3xl opacity-50" aria-hidden="true">
        {SPINNER_CHARS[charIndex]}
      </span>
    </div>
  );
}
