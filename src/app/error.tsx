"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="rc-app flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <div className="rc-eyebrow text-rc-danger">error</div>
      <h1 className="mt-3 font-rc-display text-[clamp(36px,4vw,56px)] leading-none text-rc-fg-strong [text-shadow:0_0_24px_rgba(212,169,74,0.2)]">
        Something went wrong.
      </h1>
      <p className="mt-3 max-w-[60ch] font-rc-mono text-xs leading-relaxed tracking-[0.06em] text-rc-fg-subtle">
        {error.message || "An unexpected error occurred."}
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-[38px] cursor-pointer items-center justify-center rounded-rc-md border border-rc-accent-press bg-gradient-to-b from-rc-accent-hover to-rc-accent px-[18px] font-rc-sans text-sm font-medium text-rc-accent-fg shadow-rc-sm transition-transform hover:-translate-y-px"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-[38px] items-center justify-center rounded-rc-md border border-rc-line/28 px-[18px] font-rc-sans text-sm font-medium text-rc-fg transition-colors hover:border-rc-accent hover:bg-rc-accent/8"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
