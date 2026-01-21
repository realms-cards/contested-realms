"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  useGraphicsSettings,
  getGraphicsSettings,
} from "@/hooks/useGraphicsSettings";
import type { CardPreviewData } from "@/lib/game/card-preview.types";
import { TOKEN_BY_KEY, tokenTextureUrl } from "@/lib/game/tokens";

const SITE_SIZE_MULTIPLIER = 1.5;

type LayoutState = {
  width: number;
  isShort: boolean;
  preferBottom: boolean;
};

const parsePx = (value: string | null | undefined) => {
  const parsed = Number.parseFloat((value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

function computeLayout(isSite: boolean): LayoutState {
  if (typeof window === "undefined") {
    return {
      width: isSite ? 320 * SITE_SIZE_MULTIPLIER : 240,
      isShort: false,
      preferBottom: false,
    };
  }

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

  const aspectWidthOverHeight = 3 / 4;
  const widthFromHeight = cappedHeight * aspectWidthOverHeight;

  // Mobile-first sizing: larger preview on small screens
  const isMobileWidth = innerWidth < 768;
  const baseVwFraction = isMobileWidth ? 0.35 : 0.21; // Larger fraction on mobile
  const heightShortness = Math.max(0, Math.min(1, (780 - innerHeight) / 360));
  const widthShortness = Math.max(0, Math.min(1, (1400 - innerWidth) / 600));
  const heightReduction = isMobileWidth ? 0.2 * heightShortness : 0.5 * heightShortness;
  const widthReduction = isMobileWidth ? 0.3 * widthShortness : 0.65 * widthShortness;
  let vwFraction =
    baseVwFraction * (1 - heightReduction) * (1 - widthReduction);
  if (preferBottomNext) {
    vwFraction *= isMobileWidth ? 0.9 : 0.82; // Less reduction on mobile
  }
  vwFraction = Math.max(vwFraction, isMobileWidth ? 0.28 : 0.12); // Higher floor on mobile
  const preferredWidth = innerWidth * vwFraction;
  const minWidth = isMobileWidth ? 140 : 200; // Slightly smaller min but better proportions
  const absoluteMaxWidth = isSite ? 345 * SITE_SIZE_MULTIPLIER : 345;

  let maxWidth = Number.isFinite(widthFromHeight)
    ? Math.min(widthFromHeight, absoluteMaxWidth)
    : absoluteMaxWidth;
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
    maxWidth = absoluteMaxWidth;
  }

  const wideViewportRatio = Math.max(0, innerWidth - 1280) / 720;
  const widthRatioBase = isMobileWidth ? 0.45 : (preferBottomNext ? 0.29 : 0.38);
  const widthRatioDynamic = widthRatioBase * (1 - widthShortness * (isMobileWidth ? 0.2 : 0.45));
  const widthRatio = Math.max(
    widthRatioDynamic * (1 - wideViewportRatio * 0.45),
    isMobileWidth ? 0.35 : 0.18 // Higher floor on mobile
  );
  const horizontalCap = Math.min(
    Math.max(innerWidth - (isMobileWidth ? 20 : 72), isMobileWidth ? 140 : 220),
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
  const enlargeFactor = Math.max(enlargeFloor, baseEnlarge - enlargeReduction);
  width = Math.min(maxWidth, Math.max(minWidth, width * enlargeFactor));

  // Apply site multiplier
  if (isSite) {
    width = Math.min(width * SITE_SIZE_MULTIPLIER, absoluteMaxWidth);
  }

  return {
    width,
    isShort: isShortHeight,
    preferBottom: preferBottomNext,
  };
}

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

  // Get card preview scale from user settings
  // Use synchronous read for initial render to avoid flash/jump when settings load
  const initialScale = useMemo(
    () => getGraphicsSettings().cardPreviewScale,
    []
  );
  const { settings: graphicsSettings } = useGraphicsSettings();
  const previewScale = graphicsSettings.cardPreviewScale || initialScale;

  // Compute layout synchronously on first render to avoid "blow up" effect
  const initialLayout = useMemo(() => computeLayout(isSite), [isSite]);
  const [layout, setLayout] = useState<LayoutState>(initialLayout);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleResize = () => setLayout(computeLayout(isSite));

    // Sync layout on mount (in case useMemo ran during SSR)
    handleResize();

    window.addEventListener("resize", handleResize, { passive: true });
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [isSite]);

  const { width: baseWidth, isShort, preferBottom } = layout;

  // Apply user's preview scale preference
  const width = baseWidth * previewScale;

  if (!slug) return null;

  // Resolve image src: tokens are not served by /api/images; use assets path
  const imageSrc = (() => {
    if (isToken) {
      const key = slug.split(":")[1]?.toLowerCase() || "";
      const def = TOKEN_BY_KEY[key];
      if (def) return tokenTextureUrl(def);
    }
    return `/api/images/${slug}`;
  })();

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
    ? "aspect-[4/3] rounded-xl overflow-hidden bg-black/20 backdrop-blur-sm shadow-2xl ring-1 ring-white/10"
    : "aspect-[3/4] rounded-xl overflow-hidden bg-black/20 backdrop-blur-sm shadow-2xl ring-1 ring-white/10";

  // Use simple Image component instead of 3D Canvas to avoid WebGL context leaks
  // The tournament draft was creating hundreds of WebGL contexts and crashing browsers
  return (
    <div
      className={`${anchorClasses} ${zIndexClass} pointer-events-none ${className}`}
    >
      <div className="relative">
        <div className={`relative ${base}`} style={{ width }}>
          <Image
            src={imageSrc}
            alt={card?.name || "Card preview"}
            fill
            className={`${
              isSite
                ? "object-contain rotate-90 scale-[1.333] origin-center"
                : "object-contain"
            } object-center`}
            sizes={`${Math.round(width)}px`}
            priority
            unoptimized
          />
        </div>
      </div>
    </div>
  );
}
