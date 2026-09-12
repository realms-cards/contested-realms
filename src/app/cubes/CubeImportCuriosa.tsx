"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RcButton } from "@/components/ui/rc-button";

type ImportState =
  | { status: "idle" }
  | { status: "fetching" }
  | { status: "success"; cubeName: string; cubeId: string }
  | { status: "error"; message: string };

export default function CubeImportCuriosa() {
  const enabled = process.env.NEXT_PUBLIC_ENABLE_CURIOSA_IMPORT === "true";
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
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
    if (!url.trim()) return;
    setImportState({ status: "fetching" });
    try {
      const res = await fetch("/api/cubes/import/curiosa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: url.trim(),
          name: name.trim() || undefined,
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
    if (elapsedSeconds < 3) return "Connecting to Sorcerytcg...";
    if (elapsedSeconds < 8) return "Fetching data...";
    if (elapsedSeconds < 15) return "Processing cards...";
    return "Almost done... (Sorcerytcg may be slow)";
  };

  if (!enabled) {
    return null;
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full space-y-3 rounded-rc-md border border-rc-line/12 bg-black/30 p-4"
    >
      <div className="rc-eyebrow">import from sorcerytcg</div>
      <div className="grid gap-2 sm:grid-cols-5">
        <input
          className="rc-input h-10 w-full sm:col-span-3"
          placeholder="Paste a sorcerytcg.com deck URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
        />
        <input
          className="rc-input h-10 w-full sm:col-span-2"
          placeholder="Optional cube name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={loading}
        />
      </div>

      {/* Progress indicator */}
      {loading && (
        <div className="rc-alert" data-tone="info">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-rc-accent border-t-transparent" />
            <div className="flex-1">
              <div>{getProgressMessage()}</div>
              <div className="mt-0.5 text-rc-fg-subtle">
                {elapsedSeconds > 0 && `${elapsedSeconds}s elapsed`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success message */}
      {importState.status === "success" && (
        <div className="rc-alert" data-tone="success">
          Successfully imported <strong>{importState.cubeName}</strong>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="rc-alert" data-tone="danger">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <RcButton type="submit" disabled={loading || !url.trim()}>
          {loading ? "Importing..." : "Import as Cube"}
        </RcButton>
        {error && (
          <RcButton
            variant="outline"
            onClick={() => setImportState({ status: "idle" })}
          >
            Clear Error
          </RcButton>
        )}
      </div>
    </form>
  );
}
