"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeckImportText() {
  const enabled = process.env.NEXT_PUBLIC_ENABLE_TEXT_IMPORT === "true";
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unresolved, setUnresolved] = useState<{ name: string; count: number }[] | null>(null);
  const router = useRouter();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setUnresolved(null);
    try {
      const res = await fetch("/api/decks/import/text", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text.trim(), name: name.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data && data.error) || "Import failed";
        setError(typeof msg === "string" ? msg : "Import failed");
        if (Array.isArray(data?.unresolved)) {
          setUnresolved(
            (data.unresolved as unknown[])
              .map((u: unknown) => {
                const o = (u && typeof u === "object" ? (u as Record<string, unknown>) : {});
                return { name: String(o.name ?? ""), count: Number(o.count ?? 0) };
              })
              .filter((u) => u.name)
          );
        }
      } else {
        setName("");
        setText("");
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
      <div className="text-sm font-medium">Import Deck from Text</div>
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
            className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Importing..." : "Import"}
          </button>
        </div>
      </div>
      {error && (
        <div className="text-red-400 text-xs bg-red-900/20 rounded px-3 py-2 ring-1 ring-red-800">{error}</div>
      )}
      {unresolved && unresolved.length > 0 && (
        <div className="text-xs bg-zinc-800/60 rounded px-3 py-2 ring-1 ring-zinc-700">
          <div className="font-medium mb-1">Unresolved cards (please correct names):</div>
          <ul className="list-disc pl-5 space-y-0.5">
            {unresolved.map((u, i) => (
              <li key={`${u.name}-${i}`}>{u.count} × {u.name}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
