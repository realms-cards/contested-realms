"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AnimatedImage from "@/components/ui/AnimatedImage";
import HelpOverlay from "@/components/ui/HelpOverlay";
import { RcButton } from "@/components/ui/rc-button";

export default function DeckImportText() {
  const enabled = process.env.NEXT_PUBLIC_ENABLE_TEXT_IMPORT === "true";
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unresolved, setUnresolved] = useState<
    { name: string; count: number }[] | null
  >(null);
  const [warnings, setWarnings] = useState<
    { original: string; matched: string; count: number }[] | null
  >(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const router = useRouter();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setUnresolved(null);
    setWarnings(null);
    setImportSuccess(false);
    try {
      const res = await fetch("/api/decks/import/text", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          name: name.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data && data.error) || "Import failed";
        setError(typeof msg === "string" ? msg : "Import failed");
        if (Array.isArray(data?.unresolved)) {
          setUnresolved(
            (data.unresolved as unknown[])
              .map((u: unknown) => {
                const o =
                  u && typeof u === "object"
                    ? (u as Record<string, unknown>)
                    : {};
                return {
                  name: String(o.name ?? ""),
                  count: Number(o.count ?? 0),
                };
              })
              .filter((u) => u.name)
          );
        }
      } else {
        // Check for warnings (fuzzy matches)
        if (data.warnings?.fuzzyMatches?.length) {
          setWarnings(
            data.warnings.fuzzyMatches as {
              original: string;
              matched: string;
              count: number;
            }[]
          );
        }
        setImportSuccess(true);
        setName("");
        setText("");
        // Notify listeners with deck data for optimistic add
        try {
          const deckInfo = {
            id: data.id as string,
            name: data.name as string,
            format: (data.format as string) || "Constructed",
          };
          window.dispatchEvent(
            new CustomEvent("decks:refresh", { detail: { deck: deckInfo } })
          );
        } catch {
          // Fallback to simple refresh
          window.dispatchEvent(new Event("decks:refresh"));
        }
        router.refresh();
      }
    } catch {
      setError("Network error during import");
    } finally {
      setLoading(false);
    }
  };

  if (!enabled) {
    return null;
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full space-y-3 rounded-rc-md border border-rc-line/12 bg-black/30 p-4"
    >
      <div className="flex items-center gap-2">
        <span className="rc-eyebrow">import deck from text</span>
        <HelpOverlay
          title="Import from text — Help"
          triggerAriaLabel="Show help for Import Deck from Text"
          idSuffix="deck-import-text-help"
        >
          <figure className="space-y-2">
            <AnimatedImage
              src="/userhelp/realms-copyandimportdeck.webp"
              alt="Animation showing how to copy a deck from Realms and import it here"
              width={1280}
              height={720}
              className="block w-full h-auto"
              wrapperClassName="rounded-rc-md border border-rc-line/18"
              showSkeleton
              // keep animation intact via unoptimized
              unoptimized
            />
            <figcaption className="font-rc-sans text-xs text-rc-fg-muted">
              Tip: Copy your decklist from Sorcerytcg Decks (or any other text
              based source), paste it into the text box, optionally set a name,
              then click Import.
            </figcaption>
          </figure>
        </HelpOverlay>
      </div>
      <div className="grid gap-2 sm:grid-cols-5">
        <textarea
          className="rc-textarea h-40 w-full sm:col-span-3"
          placeholder="Paste your decklist text here (Avatar/Aura/Artifact/Minion/Magic/Site sections)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={loading}
        />
        <div className="sm:col-span-2 flex flex-col gap-2">
          <input
            className="rc-input h-10 w-full"
            placeholder="Optional deck name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
          />
          <RcButton type="submit" disabled={loading || !text.trim()}>
            {loading && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-rc-accent-fg border-t-transparent" />
            )}
            {loading ? "Importing..." : "Import"}
          </RcButton>
        </div>
      </div>
      {error && (
        <div className="rc-alert" data-tone="danger">
          {error}
        </div>
      )}
      {unresolved && unresolved.length > 0 && (
        <div className="rc-alert" data-tone="warning">
          <div className="mb-1">Unresolved cards (please correct names):</div>
          <ul className="list-disc space-y-0.5 pl-5">
            {unresolved.map((u, i) => (
              <li key={`${u.name}-${i}`}>
                {u.count} × {u.name}
              </li>
            ))}
          </ul>
        </div>
      )}
      {importSuccess && (
        <div className="rc-alert" data-tone="success">
          Deck imported successfully!
        </div>
      )}
      {warnings && warnings.length > 0 && (
        <div className="rc-alert" data-tone="warning">
          <div className="mb-1">Some card names were fuzzy-matched:</div>
          <ul className="list-disc space-y-0.5 pl-5">
            {warnings.map((w, i) => (
              <li key={`${w.original}-${i}`}>
                {w.count} × &quot;{w.original}&quot; → &quot;{w.matched}&quot;
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
