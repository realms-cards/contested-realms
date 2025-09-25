"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import type { CardPreviewData } from "@/lib/game/card-preview.types";
import CardPlane from "@/lib/game/components/CardPlane";
import { CARD_LONG, CARD_SHORT } from "@/lib/game/constants";
import { TOKEN_BY_KEY } from "@/lib/game/tokens";

type Anchor = "top-right" | "bottom-right" | "top-left" | "bottom-left";

type Props = {
  card: CardPreviewData | null | undefined;
  anchor?: Anchor; // default: top-right
  className?: string;
  zIndexClass?: string; // default: z-30
};

export default function CardPreview({
  card,
  anchor = "top-right",
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
    ? "w-[70vw] max-w-[1200px] min-w-[400px] aspect-[4/3]"
    : "w-[44vw] max-w-[720px] min-w-[360px] aspect-[3/4]";

  // Match board conventions: use portrait plane and rotate sites -90deg
  const planeWidth = CARD_SHORT;
  const planeHeight = CARD_LONG;
  const rotZ = isSite ? -Math.PI / 2 : 0;
  const canvasKey = `${card.slug}:${isSite ? "land" : "port"}`;

  return (
    <div
      className={`${anchorClasses} ${zIndexClass} pointer-events-none ${className}`}
    >
      <div className="relative">
        <div
          key={canvasKey}
          className={`relative ${base} rounded-xl overflow-hidden`}
        >
          <Canvas
            className="absolute inset-0"
            orthographic
            frameloop="demand"
            camera={{ position: [0, 0, 5], zoom: 260 }}
            gl={{ alpha: true, antialias: true, preserveDrawingBuffer: false }}
            dpr={[1, 2]}
          >
            <ambientLight intensity={1} />
            <Suspense fallback={null}>
              <CardPlane
                slug={card.slug}
                width={planeWidth}
                height={planeHeight}
                upright
                rotationZ={rotZ}
                depthWrite={false}
                depthTest={false}
                interactive={false}
                elevation={0}
                renderOrder={0}
              />
            </Suspense>
          </Canvas>
        </div>
      </div>
    </div>
  );
}
