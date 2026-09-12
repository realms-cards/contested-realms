"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RcButton } from "@/components/ui/rc-button";

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
    <form
      onSubmit={onSubmit}
      className="w-full space-y-3 rounded-rc-md border border-rc-line/12 bg-black/30 p-4"
    >
      <div className="rc-eyebrow">import cube from text</div>
      <div className="grid gap-2 sm:grid-cols-5">
        <textarea
          className="rc-textarea h-40 w-full sm:col-span-3"
          placeholder="Paste card list or deck text here"
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={loading}
        />
        <div className="sm:col-span-2 flex flex-col gap-2">
          <input
            className="rc-input h-10 w-full"
            placeholder="Optional cube name"
            value={name}
            onChange={(event) => setName(event.target.value)}
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
            {unresolved.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                {item.count} × {item.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
