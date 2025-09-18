"use client";

import Image from "next/image";
import { TOKEN_BY_KEY } from "@/lib/game/tokens";

export type CardPreviewData = {
  slug?: string | null;
  name: string;
  type: string | null;
};

type Anchor = "top-right" | "bottom-right" | "top-left" | "bottom-left";

type Props = {
  card: CardPreviewData | null | undefined;
  anchor?: Anchor; // default: top-right
  onClose?: () => void;
  className?: string;
  zIndexClass?: string; // default: z-30
};

export default function CardPreview({
  card,
  anchor = "top-right",
  onClose,
  className = "",
  zIndexClass = "z-30",
}: Props) {
  if (!card?.slug) return null;
  
  // Check if this is a site or a token that should be displayed like a site (e.g., Rubble)
  const isRegularSite = (card.type || "").toLowerCase().includes("site");
  const isToken = card.slug.startsWith("token:");
  let isSiteReplacementToken = false;
  
  if (isToken) {
    const key = card.slug.split(":")[1]?.toLowerCase() || "";
    const def = TOKEN_BY_KEY[key];
    isSiteReplacementToken = def?.siteReplacement === true;
  }
  
  const isSite = isRegularSite || isSiteReplacementToken;
  
  // Handle token assets properly
  let imgSrc = `/api/images/${card.slug}`;
  if (isToken) {
    const key = card.slug.split(":")[1]?.toLowerCase() || "";
    const def = TOKEN_BY_KEY[key];
    if (def) {
      imgSrc = `/api/assets/tokens/${def.fileBase}.png`;
    }
  } else {
    // Try ktx2 textures first, fallback to standard if needed
    imgSrc = `/api/images/${card.slug}`;
  }

  const anchorClasses = (() => {
    switch (anchor) {
      case "top-left":
        return "absolute left-3 top-20";
      case "bottom-left":
        return "absolute left-3 bottom-3";
      case "bottom-right":
        return "absolute right-1 bottom-3";
      case "top-right":
      default:
        return "absolute right-3 top-20";
    }
  })();

  const base = isSite
    ? "w-[35vw] max-w-[600px] min-w-[200px] aspect-[4/3]" // rotated site (4:3)
    : "w-[22vw] max-w-[360px] min-w-[180px] aspect-[3/4]"; // portrait

  return (
    <div
      className={`${anchorClasses} ${zIndexClass} pointer-events-none ${className}`}
    >
      <div className="relative">
        {(() => {
          // Force a remount when orientation changes (Safari workaround for rotation/layout lag)
          const orientationKey = `${card.slug}:${isSite ? "land" : "port"}`;
          return (
            <div
              key={orientationKey}
              className={`relative ${base} rounded-xl overflow-hidden ${
                isSite ? "rotate-90" : ""
              }`}
            >
          <Image
            src={imgSrc}
            alt={card.name}
            fill
            sizes="(max-width:640px) 50vw, (max-width:1024px) 30vw, 25vw"
            className={`${isSite ? "object-contain" : "object-cover"}`}
            priority={false}
          />
            </div>
          );
        })()}
      </div>
    </div>
  );
}
