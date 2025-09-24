"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeckImportCuriosa() {
  const enabled = process.env.NEXT_PUBLIC_ENABLE_CURIOSA_IMPORT === "true";
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [tts, setTts] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() && !tts.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/decks/import/curiosa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim(), name: name.trim() || undefined, tts: tts.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data && data.error) || "Import failed";
        setError(typeof msg === "string" ? msg : "Import failed");
      } else {
        setUrl("");
        setName("");
        setTts("");
        // Notify listeners on the page to refetch deck lists immediately
        try { window.dispatchEvent(new Event("decks:refresh")); } catch {}
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
    <form onSubmit={onSubmit} className="w-full bg-zinc-900/70 ring-1 ring-white/10 rounded-xl p-4 space-y-3">
      <div className="text-sm font-medium">Import Curiosa Deck</div>
      <div className="grid gap-2 sm:grid-cols-5">
        <input
          className="sm:col-span-3 w-full bg-zinc-800/80 ring-1 ring-zinc-700 rounded px-3 py-2 text-white"
          placeholder="Paste Curiosa deck URL (public)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
        />
        <input
          className="sm:col-span-2 w-full bg-zinc-800/80 ring-1 ring-zinc-700 rounded px-3 py-2 text-white"
          placeholder="Optional deck name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={loading}
        />
      </div>
      <details className="bg-zinc-900/50 rounded ring-1 ring-zinc-700 p-3">
        <summary className="cursor-pointer text-sm font-medium">Paste TTS JSON (fallback if the deck is private)</summary>
        <textarea
          className="mt-2 w-full h-28 bg-zinc-800/80 ring-1 ring-zinc-700 rounded px-3 py-2 text-white font-mono text-xs"
          placeholder="Paste the Tabletop Simulator JSON exported from Curiosa"
          value={tts}
          onChange={(e) => setTts(e.target.value)}
          disabled={loading}
        />
        <div className="mt-1 text-xs opacity-70">
          Tip: On Curiosa, open your deck, click Export → Tabletop Simulator, copy the JSON and paste it here.
        </div>
      </details>
      {error && (
        <div className="text-red-400 text-xs bg-red-900/20 rounded px-3 py-2 ring-1 ring-red-800">{error}</div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || (!url.trim() && !tts.trim())}
          className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {loading && (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          )}
          {loading ? "Importing..." : "Import"}
        </button>
      </div>
    </form>
  );
}
