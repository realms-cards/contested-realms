"use client";

import React, { useState, useEffect } from "react";

const CREDITS_LABEL_DURATION = 3000; // Match patron "Thank you" duration
const CREDITS_MARQUEE_DURATION = 60000; // Match patron marquee duration (60s)

type Phase = "label" | "marquee";

interface Credit {
  label: string;
  url: string;
}

// White glow effect for credits (similar to patron colors)
const CREDITS_GLOW = {
  textShadow:
    "0 0 6px rgba(253,225,160,0.9), 0 0 14px rgba(253,225,160,0.55), 0 0 20px rgba(212,169,74,0.35)",
};

const CREDITS: Credit[] = [
  {
    label: "Music by Knight of Cups",
    url: "https://knightofcups.bandcamp.com/",
  },
  {
    label: "Mahogany Table by myndman",
    url: "https://skfb.ly/6xPWF",
  },
  {
    label: "Icons by game-icons.net",
    url: "https://game-icons.net",
  },
];

interface CreditsMarqueeProps {
  /** Callback when hover state changes (to block marquee switching) */
  onHoverChange?: (isHovered: boolean) => void;
}

export default function CreditsMarquee({ onHoverChange }: CreditsMarqueeProps) {
  const [phase, setPhase] = useState<Phase>("label");
  const [isHovered, setIsHovered] = useState(false);

  // Notify parent of hover changes
  const handleHoverChange = (hovered: boolean) => {
    setIsHovered(hovered);
    onHoverChange?.(hovered);
  };

  // Phase alternation (paused while hovering)
  useEffect(() => {
    if (isHovered) return;
    const duration =
      phase === "label" ? CREDITS_LABEL_DURATION : CREDITS_MARQUEE_DURATION;
    const timer = setTimeout(() => {
      setPhase((prev) => (prev === "label" ? "marquee" : "label"));
    }, duration);
    return () => clearTimeout(timer);
  }, [phase, isHovered]);

  // Build credit elements with links - white text with glow, blue underline on hover
  const creditElements: React.ReactNode[] = [];
  CREDITS.forEach((credit, i) => {
    if (i > 0) {
      creditElements.push(
        <span key={`sep-${i}`} className="text-rc-fg-dim">
          {" "}
          ·{" "}
        </span>,
      );
    }
    creditElements.push(
      <a
        key={`credit-${i}`}
        href={credit.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-rc-fg transition-colors duration-300 hover:text-rc-accent-ring hover:underline"
        style={CREDITS_GLOW}
        onMouseEnter={() => handleHoverChange(true)}
        onMouseLeave={() => handleHoverChange(false)}
      >
        {credit.label}
      </a>,
    );
  });

  return (
    <div
      className="h-7 overflow-x-hidden overflow-y-visible border-t border-rc-line/14"
      style={{ width: "100vw", marginLeft: "calc(-50vw + 50%)" }}
    >
      {phase === "label" ? (
        <div
          key="credits-label"
          className="h-7 flex items-center justify-center animate-credits-fade-in"
        >
          <span className="font-rc-mono text-xs uppercase tracking-[0.18em] text-rc-spark" style={CREDITS_GLOW}>
            credits
          </span>
        </div>
      ) : (
        <div
          key="credits-marquee"
          className="h-7 flex items-center whitespace-nowrap animate-marquee"
          style={{
            animationDuration: `${CREDITS_MARQUEE_DURATION / 1000}s`,
            animationPlayState: isHovered ? "paused" : "running",
          }}
        >
          <span className="font-rc-mono text-[13px]">{creditElements}</span>
        </div>
      )}
    </div>
  );
}
