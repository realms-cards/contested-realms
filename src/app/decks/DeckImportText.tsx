"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import AnimatedImage from "@/components/ui/AnimatedImage";
import HelpOverlay from "@/components/ui/HelpOverlay";

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
      className="w-full bg-zinc-900/70 ring-1 ring-white/10 rounded-xl p-4 space-y-3"
    >
      <div className="text-sm font-medium flex items-center gap-2">
        <span>Import Deck from Text</span>
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
              wrapperClassName="rounded-md border border-slate-700"
              showSkeleton
              // keep animation intact via unoptimized
              unoptimized
            />
            <figcaption className="text-xs text-slate-300/90">
              Tip: Copy your decklist from Curiosa Decks (or any other text
              based source), paste it into the text box, optionally set a name,
              then click Import.
            </figcaption>
          </figure>
        </HelpOverlay>
      </div>
      <div className="grid gap-2 sm:grid-cols-5">
        <textarea
          className="sm:col-span-3 w-full h-40 bg-zinc-800/80 ring-1 ring-zinc-700 rounded px-3 py-2 text-white font-mono text-xs"
          placeholder="Paste your decklist text here (Avatar/Aura/Artifact/Minion/Magic/Site sections)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={loading}
        />
        <div className="sm:col-span-2 flex flex-col gap-2">
          <input
            className="w-full bg-zinc-800/80 ring-1 ring-zinc-700 rounded px-3 py-2 text-white"
            placeholder="Optional deck name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !text.trim()}
            className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            {loading ? "Importing..." : "Import"}
          </button>
        </div>
      </div>
      {error && (
        <div className="text-red-400 text-xs bg-red-900/20 rounded px-3 py-2 ring-1 ring-red-800">
          {error}
        </div>
      )}
      {unresolved && unresolved.length > 0 && (
        <div className="text-xs bg-zinc-800/60 rounded px-3 py-2 ring-1 ring-zinc-700">
          <div className="font-medium mb-1">
            Unresolved cards (please correct names):
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {unresolved.map((u, i) => (
              <li key={`${u.name}-${i}`}>
                {u.count} × {u.name}
              </li>
            ))}
          </ul>
        </div>
      )}
      {importSuccess && (
        <div className="text-green-400 text-xs bg-green-900/20 rounded px-3 py-2 ring-1 ring-green-800 flex items-center gap-2">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          Deck imported successfully!
        </div>
      )}
      {warnings && warnings.length > 0 && (
        <div className="text-xs bg-amber-900/20 rounded px-3 py-2 ring-1 ring-amber-700">
          <div className="font-medium mb-1 text-amber-300 flex items-center gap-1">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            Some card names were fuzzy-matched:
          </div>
          <ul className="list-disc pl-5 space-y-0.5 text-amber-200/90">
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
