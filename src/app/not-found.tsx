import Link from "next/link";

// Prevent static generation to avoid drei Html detection during build
export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <div className="rc-app flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <div className="rc-eyebrow">404</div>
      <h1 className="mt-3 font-rc-display text-[clamp(36px,4vw,56px)] leading-none text-rc-fg-strong [text-shadow:0_0_24px_rgba(212,169,74,0.2)]">
        This realm does not exist.
      </h1>
      <p className="mt-3 font-rc-mono text-xs tracking-[0.1em] text-rc-fg-subtle">
        The page you are looking for was never summoned, or has been banished.
      </p>
      <Link
        href="/"
        className="mt-7 inline-flex h-[38px] items-center justify-center rounded-rc-md border border-rc-accent-press bg-gradient-to-b from-rc-accent-hover to-rc-accent px-[18px] font-rc-sans text-sm font-medium text-rc-accent-fg shadow-rc-sm transition-transform hover:-translate-y-px"
      >
        Return home
      </Link>
    </div>
  );
}
