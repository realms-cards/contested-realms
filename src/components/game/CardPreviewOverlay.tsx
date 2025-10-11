"use client";

import Image from "next/image";
import React from "react";

export type PreviewCard = {
  slug: string;
  name: string;
  type: string | null;
};

export default function CardPreviewOverlay({
  card,
  anchor = "bottom-left",
  className = "",
}: {
  card: PreviewCard | null;
  anchor?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  className?: string;
}) {
  if (!card) return null;
  const isSite = (card.type || "").toLowerCase().includes("site");

  const anchorClass = (() => {
    switch (anchor) {
      case "top-left":
        return "fixed top-6 left-6";
      case "top-right":
        return "fixed top-6 right-6";
      case "bottom-right":
        return "fixed bottom-6 right-6";
      case "bottom-left":
      default:
        return "fixed bottom-6 left-6";
    }
  })();

  const base = isSite
    ? "w-[30vw] max-w-[600px] min-w-[200px] aspect-[4/3]"
    : "w-[22vw] max-w-[360px] min-w-[180px] aspect-[3/4]";

  return (
    <div className={`${anchorClass} z-50 pointer-events-none select-none ${className}`}>
      <div className={`relative ${base} rounded-xl overflow-hidden shadow-2xl ${isSite ? "rotate-90" : ""}`}>
        <Image
          src={`/api/images/${card.slug}`}
          alt={card.name}
          fill
          sizes="(max-width:640px) 50vw, (max-width:1024px) 30vw, 25vw"
          className={isSite ? "object-contain" : "object-cover"}
          priority
          unoptimized
        />
      </div>
    </div>
  );
}
