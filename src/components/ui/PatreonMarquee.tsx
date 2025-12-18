"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  fetchPatrons,
  PATRON_COLORS,
  type PatronData,
  type PatronInfo,
} from "@/lib/patrons";

const THANK_YOU_DURATION = 3000;
const MARQUEE_DURATION = 60000;

type Phase = "thank-you" | "marquee";

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

export default function PatreonMarquee() {
  const [phase, setPhase] = useState<Phase>("thank-you");
  const [patrons, setPatrons] = useState<PatronData | null>(null);
  const [ordered, setOrdered] = useState<{
    grandmaster: PatronInfo[];
    apprentice: PatronInfo[];
  } | null>(null);
  const marqueeCycleRef = useRef(0);

  // Fetch patrons on mount
  useEffect(() => {
    fetchPatrons().then(setPatrons);
  }, []);

  useEffect(() => {
    if (!patrons) return;
    setOrdered({
      grandmaster: patrons.grandmaster,
      apprentice: patrons.apprentice,
    });
  }, [patrons]);

  useEffect(() => {
    if (!patrons) return;
    if (phase !== "marquee") return;

    marqueeCycleRef.current += 1;
    const shouldShuffle = marqueeCycleRef.current % 3 === 0;
    if (!shouldShuffle) return;

    const grandmaster = [...patrons.grandmaster];
    const apprentice = [...patrons.apprentice];
    shuffleInPlace(grandmaster);
    shuffleInPlace(apprentice);
    setOrdered({ grandmaster, apprentice });
  }, [phase, patrons]);

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

  const grandmasters = ordered?.grandmaster ?? patrons.grandmaster;
  const apprentices = ordered?.apprentice ?? patrons.apprentice;

  grandmasters.forEach((patron, i) => {
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

  apprentices.forEach((patron, i) => {
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
      className="h-7 overflow-x-hidden overflow-y-visible border-t border-blue-500/30"
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
          style={{ animationDuration: `${MARQUEE_DURATION / 1000}s` }}
        >
          <span className="text-sm font-medium">{patronElements}</span>
        </div>
      )}
    </div>
  );
}
