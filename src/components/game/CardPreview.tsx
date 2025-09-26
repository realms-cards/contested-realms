"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect, useState } from "react";
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
  const slug = card?.slug ?? "";

  // Check if this is a site or a token that should be displayed like a site (e.g., Rubble)
  const isRegularSite = (card?.type || "").toLowerCase().includes("site");
  const isToken = slug.startsWith("token:");
  let isSiteReplacementToken = false;

  if (isToken) {
    const key = slug.split(":")[1]?.toLowerCase() || "";
    const def = TOKEN_BY_KEY[key];
    isSiteReplacementToken = def?.siteReplacement === true;
  }

  const isSite = isRegularSite || isSiteReplacementToken;

  type LayoutState = {
    width: number;
    isShort: boolean;
    preferBottom: boolean;
  };

  const [layout, setLayout] = useState<LayoutState>(() => ({
    width: isSite ? 320 : 240,
    isShort: false,
    preferBottom: false,
  }));

  useEffect(() => {
    if (typeof window === "undefined") return;

    const parsePx = (value: string | null | undefined) => {
      const parsed = Number.parseFloat((value ?? "").trim());
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const compute = () => {
      const { innerWidth, innerHeight } = window;
      const docStyle = window.getComputedStyle(document.documentElement);
      const uiTop = parsePx(docStyle.getPropertyValue("--ui-top"));
      const uiBottom = parsePx(docStyle.getPropertyValue("--ui-bottom"));
      const availableHeight = Math.max(innerHeight - uiTop - uiBottom, 0);
      const isShortHeight = innerHeight < 700;
      const heightCapFactor = isShortHeight ? 0.7 : 0.8;
      const cappedHeight = Math.max(
        (availableHeight > 0 ? availableHeight : innerHeight) * heightCapFactor,
        0
      );

      const aspectWidthOverHeight = isSite ? 4 / 3 : 3 / 4;
      const widthFromHeight = cappedHeight * aspectWidthOverHeight;

      const vwFraction = isSite ? 0.35 : 0.22;
      const preferredWidth = innerWidth * vwFraction;
      const minWidth = isSite ? 200 : 180;
      const absoluteMaxWidth = isSite ? 600 : 360;

      let maxWidth = Number.isFinite(widthFromHeight)
        ? Math.min(widthFromHeight, absoluteMaxWidth)
        : absoluteMaxWidth;
      if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
        maxWidth = absoluteMaxWidth;
      }

      let width = Math.max(minWidth, preferredWidth);
      if (Number.isFinite(maxWidth) && maxWidth > 0) {
        width = Math.min(width, maxWidth);
      }
      if (maxWidth > 0 && maxWidth < minWidth) {
        width = maxWidth;
      }

      setLayout({
        width,
        isShort: isShortHeight,
        preferBottom: innerHeight < 520,
      });
    };

    compute();
    window.addEventListener("resize", compute, { passive: true });
    window.addEventListener("orientationchange", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, [isSite]);

  const { width, isShort, preferBottom } = layout;

  if (!slug) return null;

  const toBottomAnchor = (a: Anchor): Anchor => {
    if (a === "top-left" || a === "bottom-left") return "bottom-left";
    return "bottom-right";
  };

  const effectiveAnchor = preferBottom ? toBottomAnchor(anchor) : anchor;

  const topOffsetClass = isShort ? "top-12" : "top-20";
  const bottomOffsetClass = isShort ? "bottom-2" : "bottom-3";

  const anchorClasses = (() => {
    switch (effectiveAnchor) {
      case "top-left":
        return `absolute left-3 ${topOffsetClass}`;
      case "bottom-left":
        return `absolute left-3 ${bottomOffsetClass}`;
      case "bottom-right":
        return `absolute right-2 ${bottomOffsetClass}`;
      case "top-right":
      default:
        return `absolute right-3 ${topOffsetClass}`;
    }
  })();

  const base = isSite
    ? "aspect-[4/3] rounded-xl overflow-hidden"
    : "aspect-[3/4] rounded-xl overflow-hidden";

  const previewScale = 1.4;

  // Match board conventions: use portrait plane and rotate sites -90deg
  const planeWidth = CARD_SHORT * previewScale;
  const planeHeight = CARD_LONG * previewScale;
  const rotZ = isSite ? -Math.PI / 2 : 0;
  const cameraZoom = 260 * previewScale;
  const canvasKey = `${card.slug}:${isSite ? "land" : "port"}`;

  return (
    <div
      className={`${anchorClasses} ${zIndexClass} pointer-events-none ${className}`}
    >
      <div className="relative">
        <div key={canvasKey} className={`relative ${base}`} style={{ width }}>
          <Canvas
            className="absolute inset-0"
            orthographic
            frameloop="demand"
            camera={{ position: [0, 0, 5], zoom: cameraZoom }}
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
