"use client";

import { Canvas } from "@react-three/fiber";
<<<<<<< Updated upstream
import { Suspense } from "react";
=======
import { Suspense, useEffect, useRef, useState } from "react";
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
  const isRegularSite = (card.type || "").toLowerCase().includes("site");
  const isToken = card.slug.startsWith("token:");
  let isSiteReplacementToken = false;

  if (isToken) {
    const key = card.slug.split(":")[1]?.toLowerCase() || "";
    const def = TOKEN_BY_KEY[key];
    isSiteReplacementToken = def?.siteReplacement === true;
  }

  const isSite = isRegularSite || isSiteReplacementToken;

=======
  const isRegularSite = (card?.type || "").toLowerCase().includes("site");
  const isToken = slug.startsWith("token:");
  const tokenKey = isToken ? slug.split(":")[1]?.toLowerCase() ?? "" : "";
  const tokenDefinition = isToken ? TOKEN_BY_KEY[tokenKey] : undefined;
  const isSiteReplacementToken = tokenDefinition?.siteReplacement === true;

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
  const [isExpanded, setIsExpanded] = useState(true);
  const prevPreferBottomRef = useRef(false);

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
      const isShortHeight = innerHeight < 720;
      const preferBottomNext = innerHeight < 520;

      let heightCapFactor = 0.8;
      if (innerHeight < 720) heightCapFactor = 0.68;
      if (innerHeight < 640) heightCapFactor = 0.6;
      if (innerHeight < 580) heightCapFactor = 0.54;
      if (innerHeight < 520) heightCapFactor = 0.5;
      if (innerHeight < 460) heightCapFactor = 0.46;
      const cappedHeight = Math.max(
        (availableHeight > 0 ? availableHeight : innerHeight) * heightCapFactor,
        0
      );

      const aspectWidthOverHeight = isSite ? 4 / 3 : 3 / 4;
      const widthFromHeight = cappedHeight * aspectWidthOverHeight;

      const baseVwFraction = isSite ? 0.34 : 0.21;
      const heightShortness = Math.max(
        0,
        Math.min(1, (780 - innerHeight) / 360)
      );
      const widthShortness = Math.max(
        0,
        Math.min(1, (1400 - innerWidth) / 600)
      );
      const heightReduction = 0.5 * heightShortness;
      const widthReduction = 0.65 * widthShortness;
      let vwFraction =
        baseVwFraction * (1 - heightReduction) * (1 - widthReduction);
      if (preferBottomNext) {
        vwFraction *= 0.82;
      }
      vwFraction = Math.max(vwFraction, isSite ? 0.14 : 0.12);
      const preferredWidth = innerWidth * vwFraction;
      const minWidth = isSite ? 260 : 200;
      const absoluteMaxWidth = isSite ? 460 : 345;

      let maxWidth = Number.isFinite(widthFromHeight)
        ? Math.min(widthFromHeight, absoluteMaxWidth)
        : absoluteMaxWidth;
      if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
        maxWidth = absoluteMaxWidth;
      }

      // Ensure the preview does not overflow horizontal space
      const wideViewportRatio = Math.max(0, innerWidth - 1280) / 720;
      const widthRatioBase = preferBottomNext
        ? isSite
          ? 0.34
          : 0.29
        : isSite
        ? 0.5
        : 0.38;
      const widthRatioDynamic = widthRatioBase * (1 - widthShortness * 0.45);
      const widthRatio = Math.max(
        widthRatioDynamic * (1 - wideViewportRatio * 0.45),
        isSite ? 0.22 : 0.18
      );
      const horizontalCap = Math.min(
        Math.max(innerWidth - 72, 220),
        innerWidth * widthRatio,
        absoluteMaxWidth
      );
      maxWidth = Math.min(maxWidth, horizontalCap);

      let width = Math.max(minWidth, preferredWidth);
      if (Number.isFinite(maxWidth) && maxWidth > 0) {
        width = Math.min(width, maxWidth);
      }
      if (maxWidth > 0 && maxWidth < minWidth) {
        width = maxWidth;
      }

      const baseEnlarge = preferBottomNext ? 1.18 : 1.5;
      const enlargeReduction = wideViewportRatio * 0.45;
      const enlargeFloor = preferBottomNext ? 1.05 : 1.25;
      const enlargeFactor = Math.max(
        enlargeFloor,
        baseEnlarge - enlargeReduction
      );
      width = Math.min(maxWidth, Math.max(minWidth, width * enlargeFactor));

      setLayout({
        width,
        isShort: isShortHeight,
        preferBottom: preferBottomNext,
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

  useEffect(() => {
    const prev = prevPreferBottomRef.current;
    if (preferBottom && !prev) {
      setIsExpanded(false);
    }
    if (!preferBottom && prev) {
      setIsExpanded(true);
    }
    prevPreferBottomRef.current = preferBottom;
  }, [preferBottom]);

  if (!slug) return null;

  const toBottomAnchor = (a: Anchor): Anchor => {
    if (a === "top-left" || a === "bottom-left") return "bottom-left";
    return "bottom-right";
  };

  const effectiveAnchor = preferBottom ? toBottomAnchor(anchor) : anchor;

  const topOffsetClass = isShort ? "top-12" : "top-20";
  const bottomOffsetClass = isShort ? "bottom-2" : "bottom-3";

>>>>>>> Stashed changes
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
    ? "w-[35vw] max-w-[600px] min-w-[200px] aspect-[4/3]"
    : "w-[22vw] max-w-[360px] min-w-[180px] aspect-[3/4]";

  const previewScale = 1.5;

  const shouldRenderPreview = !preferBottom || isExpanded;
  const collapsedWidth = Math.min(width, isSite ? 240 : 200);
  const fallbackSlugName = slug.includes(":")
    ? slug.split(":").slice(1).join(":")
    : slug;
  const displayName =
    card?.name ??
    (fallbackSlugName.replace(/[-_]/g, " ").trim() || "Card");

  // Match board conventions: use portrait plane and rotate sites -90deg
  const planeWidth = CARD_SHORT * previewScale;
  const planeHeight = CARD_LONG * previewScale;
  const rotZ = isSite ? -Math.PI / 2 : 0;
  const cameraZoom = 260 * previewScale;
<<<<<<< Updated upstream
  const canvasKey = `${card.slug}:${isSite ? "land" : "port"}`;
=======
  const canvasKey = `${slug}:${isSite ? "land" : "port"}`;

  // When `preferBottom` is true we collapse to a tap-to-expand control to avoid covering the viewport.
>>>>>>> Stashed changes

  return (
    <div
      className={`${anchorClasses} ${zIndexClass} pointer-events-none ${className}`}
    >
<<<<<<< Updated upstream
      <div className="relative">
        <div
          key={canvasKey}
          className={`relative ${base} rounded-xl overflow-hidden`}
        >
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
=======
      <div className="relative pointer-events-auto">
        {preferBottom && !shouldRenderPreview ? (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="flex w-full flex-col items-center gap-1 rounded-lg border border-white/10 bg-slate-900/85 px-3 py-2 text-xs font-medium text-slate-200 shadow-lg backdrop-blur-sm transition hover:bg-slate-900/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-200/50"
            style={{ width: collapsedWidth }}
          >
            <span>Show card preview</span>
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              {displayName}
            </span>
          </button>
        ) : (
          <div key={canvasKey} className={`relative ${base}`} style={{ width }}>
            {preferBottom ? (
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="absolute right-2 top-2 z-10 rounded-full bg-slate-900/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-200 shadow-md transition hover:bg-slate-900/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-200/60"
              >
                Hide
              </button>
            ) : null}
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
                  slug={slug}
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
        )}
>>>>>>> Stashed changes
      </div>
    </div>
  );
}
