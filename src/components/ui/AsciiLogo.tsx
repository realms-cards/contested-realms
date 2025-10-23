"use client";

import React from "react";
import AsciiSvg from "@/components/ui/AsciiSvg";

export default function AsciiLogo({ className = "" }: { className?: string }) {
  const [logo, setLogo] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/realms.cards.txt", { cache: "force-cache" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        if (cancelled) return;
        // Trim leading/trailing visually blank lines, treating U+2800 as blank
        const lines = text.replace(/\r\n?/g, "\n").split("\n");
        const isVisualBlank = (s: string) =>
          s.replace(/[\s\u2800]+/g, "") === "";
        while (lines.length && isVisualBlank(lines[0])) lines.shift();
        while (lines.length && isVisualBlank(lines[lines.length - 1]))
          lines.pop();
        setLogo(lines.join("\n"));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    // Fallback minimal heading when fetch fails
    return (
      <div className={className}>
        <h1 className="text-4xl font-fantaisie font-bold select-none">
          Sorcery
        </h1>
      </div>
    );
  }

  return (
    <div className={`${className} select-none`}>
      <AsciiSvg text={logo} className="text-white/90" padBottomLines={2} />
    </div>
  );
}
