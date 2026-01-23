"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ImportState =
  | { status: "idle" }
  | { status: "fetching" }
  | { status: "success"; cubeName: string; cubeId: string }
  | { status: "error"; message: string };

export default function CubeImportCuriosa() {
  const enabled = process.env.NEXT_PUBLIC_ENABLE_CURIOSA_IMPORT === "true";
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [tts, setTts] = useState("");
  const [importState, setImportState] = useState<ImportState>({
    status: "idle",
  });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const router = useRouter();

  // Track elapsed time during import
  useEffect(() => {
    if (importState.status !== "fetching") {
      setElapsedSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [importState.status]);

  // Auto-clear success message after 5 seconds
  useEffect(() => {
    if (importState.status !== "success") return;
    const timeout = setTimeout(() => {
      setImportState({ status: "idle" });
    }, 5000);
    return () => clearTimeout(timeout);
  }, [importState.status]);

  const loading = importState.status === "fetching";
  const error = importState.status === "error" ? importState.message : null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() && !tts.trim()) return;
    setImportState({ status: "fetching" });
    try {
      const res = await fetch("/api/cubes/import/curiosa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          name: name.trim() || undefined,
          tts: tts.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data && data.error) || "Import failed";
        setImportState({
          status: "error",
          message: typeof msg === "string" ? msg : "Import failed",
        });
      } else {
        const cubeId = data.id as string;
        const cubeName = data.name as string;
        setImportState({ status: "success", cubeName, cubeId });
        setUrl("");
        setName("");
        setTts("");
        // Notify listeners with cube data for optimistic add
        try {
          const cubeInfo = {
            id: cubeId,
            name: cubeName,
            cardCount: (data.cardCount as number) || 0,
            sideboardCount: (data.sideboardCount as number) || 0,
            imported: true,
            isPublic: false,
            isOwner: true,
            updatedAt: new Date().toISOString(),
            description: null,
          };
          window.dispatchEvent(
            new CustomEvent("cubes:refresh", { detail: { cube: cubeInfo } })
          );
        } catch {
          window.dispatchEvent(new Event("cubes:refresh"));
        }
        router.refresh();
      }
    } catch {
      setImportState({
        status: "error",
        message: "Network error during import",
      });
    }
  };

  const getProgressMessage = () => {
    if (elapsedSeconds < 3) return "Connecting to Curiosa...";
    if (elapsedSeconds < 8) return "Fetching data...";
    if (elapsedSeconds < 15) return "Processing cards...";
    return "Almost done... (Curiosa may be slow)";
  };

  if (!enabled) {
    return null;
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full bg-zinc-900/70 ring-1 ring-white/10 rounded-xl p-4 space-y-3"
    >
      <div className="text-sm font-medium">Import from Curiosa</div>
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
          placeholder="Optional cube name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={loading}
        />
      </div>
      <details className="bg-zinc-900/50 rounded ring-1 ring-zinc-700 p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Paste TTS JSON (fallback if the deck is private)
        </summary>
        <textarea
          className="mt-2 w-full h-28 bg-zinc-800/80 ring-1 ring-zinc-700 rounded px-3 py-2 text-white font-mono text-xs"
          placeholder="Paste the Tabletop Simulator JSON exported from Curiosa"
          value={tts}
          onChange={(e) => setTts(e.target.value)}
          disabled={loading}
        />
        <div className="mt-1 text-xs opacity-70">
          Tip: On Curiosa, open your deck, click Export → Tabletop Simulator,
          copy the JSON and paste it here.
        </div>
      </details>

      {/* Progress indicator */}
      {loading && (
        <div className="bg-blue-900/30 rounded px-3 py-3 ring-1 ring-blue-700/50 space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <div className="flex-1">
              <div className="text-sm font-medium text-blue-200">
                {getProgressMessage()}
              </div>
              <div className="text-xs text-blue-300/70 mt-0.5">
                {elapsedSeconds > 0 && `${elapsedSeconds}s elapsed`}
              </div>
            </div>
          </div>
          {elapsedSeconds >= 15 && (
            <div className="text-xs text-blue-300/80 bg-blue-900/40 rounded px-2 py-1.5">
              Tip: If this takes too long, try using the TTS JSON fallback
              option above.
            </div>
          )}
        </div>
      )}

      {/* Success message */}
      {importState.status === "success" && (
        <div className="text-green-300 text-sm bg-green-900/30 rounded px-3 py-2 ring-1 ring-green-700/50 flex items-center gap-2">
          <svg
            className="w-5 h-5 text-green-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span>
            Successfully imported <strong>{importState.cubeName}</strong>
          </span>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="text-red-400 text-xs bg-red-900/20 rounded px-3 py-2 ring-1 ring-red-800">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || (!url.trim() && !tts.trim())}
          className="px-3 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? "Importing..." : "Import as Cube"}
        </button>
        {error && (
          <button
            type="button"
            onClick={() => setImportState({ status: "idle" })}
            className="px-3 py-2 rounded bg-zinc-700 hover:bg-zinc-600 text-sm"
          >
            Clear Error
          </button>
        )}
      </div>
    </form>
  );
}
