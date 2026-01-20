"use client";

import React, { useState, useEffect } from "react";
import CreditsMarquee from "./CreditsMarquee";
import PatreonMarquee from "./PatreonMarquee";

// Durations match the respective marquee components
// PatreonMarquee: 3s thank you + 60s marquee = 63s
const PATREON_DURATION = 63000;
// CreditsMarquee: 3s label + 60s marquee = 63s
const CREDITS_DURATION = 63000;

type MarqueeType = "patreon" | "credits";

export default function CombinedMarquee() {
  const [currentMarquee, setCurrentMarquee] = useState<MarqueeType>("patreon");
  const [isCreditsHovered, setIsCreditsHovered] = useState(false);

  useEffect(() => {
    // Block switching while credits are hovered
    if (isCreditsHovered) return;

    const duration =
      currentMarquee === "patreon" ? PATREON_DURATION : CREDITS_DURATION;
    const timer = setTimeout(() => {
      setCurrentMarquee((prev) => (prev === "patreon" ? "credits" : "patreon"));
    }, duration);
    return () => clearTimeout(timer);
  }, [currentMarquee, isCreditsHovered]);

  return currentMarquee === "patreon" ? (
    <PatreonMarquee />
  ) : (
    <CreditsMarquee onHoverChange={setIsCreditsHovered} />
  );
}
