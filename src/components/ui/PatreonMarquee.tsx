"use client";

import React, { useState, useEffect } from "react";
import { fetchPatrons, PATRON_COLORS, type PatronData } from "@/lib/patrons";

const THANK_YOU_DURATION = 3000;
const MARQUEE_DURATION = 15000;

type Phase = "thank-you" | "marquee";

export default function PatreonMarquee() {
  const [phase, setPhase] = useState<Phase>("thank-you");
  const [patrons, setPatrons] = useState<PatronData | null>(null);

  // Fetch patrons on mount
  useEffect(() => {
    fetchPatrons().then(setPatrons);
  }, []);

  // Phase alternation
  useEffect(() => {
    const duration =
      phase === "thank-you" ? THANK_YOU_DURATION : MARQUEE_DURATION;
    const timer = setTimeout(() => {
      setPhase((prev) => (prev === "thank-you" ? "marquee" : "thank-you"));
    }, duration);
    return () => clearTimeout(timer);
  }, [phase]);

  const hasApprentice = patrons ? patrons.apprentice.length > 0 : false;
  const hasGrandmaster = patrons ? patrons.grandmaster.length > 0 : false;
  const hasPatrons = hasApprentice || hasGrandmaster;

  // Always render a fixed-height container to prevent layout shifts
  if (!patrons || !hasPatrons) {
    return <div className="h-7" aria-hidden="true" />;
  }

  // Build patron elements with tier-specific colors
  // Note: kingofthe tier is excluded from marquee (special tier for site owner)
  const patronElements: React.ReactNode[] = [];

  patrons.grandmaster.forEach((patron, i) => {
    if (patronElements.length > 0) {
      patronElements.push(
        <span key={`sep-gm-${i}`} className="text-slate-500">
          {" "}
          ·{" "}
        </span>
      );
    }
    patronElements.push(
      <span
        key={`gm-${patron.id}`}
        className={PATRON_COLORS.grandmaster.text}
        style={{ textShadow: PATRON_COLORS.grandmaster.textShadow }}
      >
        {patron.name}
      </span>
    );
  });

  patrons.apprentice.forEach((patron, i) => {
    if (patronElements.length > 0) {
      patronElements.push(
        <span key={`sep-ap-${i}`} className="text-slate-500">
          {" "}
          ·{" "}
        </span>
      );
    }
    patronElements.push(
      <span
        key={`ap-${patron.id}`}
        className={PATRON_COLORS.apprentice.text}
        style={{ textShadow: PATRON_COLORS.apprentice.textShadow }}
      >
        {patron.name}
      </span>
    );
  });

  return (
    <div
      className="h-7 overflow-hidden border-t border-blue-500/30"
      style={{ width: "100vw", marginLeft: "calc(-50vw + 50%)" }}
    >
      {phase === "thank-you" ? (
        <div
          key="thank-you"
          className="h-7 flex items-center justify-center animate-thank-you-flash"
        >
          <span
            className="text-sm font-medium text-blue-400"
            style={{ textShadow: PATRON_COLORS.apprentice.textShadow }}
          >
            Thank you to our Patrons
          </span>
        </div>
      ) : (
        <div
          key="marquee"
          className="h-7 flex items-center whitespace-nowrap animate-marquee"
          style={{ animationDuration: "15s" }}
        >
          <span className="text-sm font-medium">{patronElements}</span>
        </div>
      )}
    </div>
  );
}
