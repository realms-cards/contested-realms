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
  const isSite = (card.type || "").toLowerCase().includes("site");
  
  // Handle token assets properly
  const isToken = card.slug.startsWith("token:");
  let imgSrc = `/api/images/${card.slug}`;
  if (isToken) {
    const key = card.slug.split(":")[1]?.toLowerCase() || "";
    const def = TOKEN_BY_KEY[key];
    if (def) {
      imgSrc = `/api/assets/tokens/${def.fileBase}.png`;
    }
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
        <div
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
      </div>
    </div>
  );
}
