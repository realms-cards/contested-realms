"use client";

import React from "react";
import { useCardTexture } from "@/lib/game/textures/useCardTexture";

function Prefetch({ slug, preferRaster }: { slug: string; preferRaster?: boolean }) {
  // Fire and forget; hook will acquire and keep a soft-cached texture
  // The component itself renders nothing
  useCardTexture({ slug, preferRaster: preferRaster !== false });
  return null;
}

export default function TexturePrefetcher({
  slugs,
  preferRaster = true,
}: {
  slugs: string[];
  preferRaster?: boolean;
}) {
  if (!Array.isArray(slugs) || slugs.length === 0) return null;
  return (
    <>
      {slugs.map((s) =>
        typeof s === "string" && s ? (
          <Prefetch key={s} slug={s} preferRaster={preferRaster} />
        ) : null
      )}
    </>
  );
}
