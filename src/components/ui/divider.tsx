import { cn } from "@/lib/utils";

/**
 * realms.cards design-system Divider: hairline rule with a mono eyebrow label.
 * Pass `star=""` for the icon-free variant.
 */
export function Divider({
  label,
  star = "✦",
  className,
}: {
  label?: string;
  star?: string;
  className?: string;
}) {
  const glyph = star ? (
    <span className="text-rc-spark [text-shadow:0_0_8px_rgba(253,225,160,0.45)]">
      {star}
    </span>
  ) : null;
  return (
    <div
      className={cn("my-5 flex items-center gap-3.5", className)}
      role="separator"
    >
      <div className="h-px flex-1 bg-rc-line/7" />
      {label && (
        <span className="inline-flex items-center gap-2.5 font-rc-mono text-[11px] uppercase tracking-[0.22em] text-rc-accent-link">
          {glyph}
          {label}
          {glyph}
        </span>
      )}
      <div className="h-px flex-1 bg-rc-line/7" />
    </div>
  );
}

export default Divider;
