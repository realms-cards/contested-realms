"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CubeImportText() {
  const enabled = process.env.NEXT_PUBLIC_ENABLE_TEXT_IMPORT === "true";
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unresolved, setUnresolved] = useState<{ name: string; count: number }[] | null>(null);
  const router = useRouter();

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setUnresolved(null);
    try {
      const res = await fetch("/api/cubes/import/text", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text.trim(), name: name.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data && data.error) || "Import failed";
        setError(typeof msg === "string" ? msg : "Import failed");
        if (Array.isArray(data?.unresolved)) {
          const aggregated = new Map<string, number>();
          for (const item of data.unresolved as unknown[]) {
            const value = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
            const name = String(value.name ?? "").trim();
            if (!name) continue;
            const count = Number(value.count ?? 0);
            const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
            if (safeCount <= 0) continue;
            aggregated.set(name, (aggregated.get(name) ?? 0) + safeCount);
          }
          setUnresolved(
            Array.from(aggregated.entries())
              .map(([name, count]) => ({ name, count }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          );
        }
      } else {
        setName("");
        setText("");
        try {
          window.dispatchEvent(new Event("cubes:refresh"));
        } catch {}
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
      <div className="text-sm font-medium">Import Cube from Text</div>
      <div className="grid gap-2 sm:grid-cols-5">
        <textarea
          className="sm:col-span-3 w-full h-40 bg-zinc-800/80 ring-1 ring-zinc-700 rounded px-3 py-2 text-white font-mono text-xs"
          placeholder="Paste card list or deck text here"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={loading}
        />
        <div className="sm:col-span-2 flex flex-col gap-2">
          <input
            className="w-full bg-zinc-800/80 ring-1 ring-zinc-700 rounded px-3 py-2 text-white"
            placeholder="Optional cube name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !text.trim()}
            className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
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
            {unresolved.map((item, index) => (
              <li key={`${item.name}-${index}`}>{item.count} × {item.name}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
