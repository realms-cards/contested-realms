"use client";

import Image, { ImageProps } from "next/image";
import React from "react";

export type AnimatedImageProps = Omit<ImageProps, "placeholder"> & {
  /** Show a subtle skeleton until the image has loaded */
  showSkeleton?: boolean;
  /** Optional className for the outer wrapper (borders, rounding, aspect) */
  wrapperClassName?: string;
};

/**
 * AnimatedImage wraps next/image to display animated assets (e.g., WebP) while preserving animation
 * by default via unoptimized. It also renders a lightweight skeleton until loading completes.
 */
export default function AnimatedImage({
  showSkeleton = true,
  unoptimized = true,
  className = "",
  wrapperClassName = "",
  onLoad,
  alt,
  ...imgProps
}: AnimatedImageProps) {
  const [loaded, setLoaded] = React.useState(false);

  const handleLoad: React.ReactEventHandler<HTMLImageElement> = (e) => {
    setLoaded(true);
    onLoad?.(e);
  };

  return (
    <div className={"relative w-full rounded-md border border-slate-700/80 overflow-hidden "+wrapperClassName}>
      {showSkeleton && !loaded && (
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-slate-800/80 via-slate-700/70 to-slate-800/80 animate-pulse"
        />
      )}
      <Image
        unoptimized={unoptimized}
        onLoad={handleLoad}
        alt={alt}
        className={"relative z-10 "+className}
        {...imgProps}
      />
    </div>
  );
}
