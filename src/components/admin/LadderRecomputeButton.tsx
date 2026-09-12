"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "idle" | "running" | "done" | "error";

/** Triggers the socket server's ladder replay via the admin actions API. */
export default function LadderRecomputeButton() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const run = async () => {
    setStatus("running");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "recomputeLadder" }),
      });
      const body = (await res.json().catch(() => null)) as {
        status?: string;
        message?: string;
        error?: string;
      } | null;
      if (!res.ok || body?.status === "error") {
        throw new Error(body?.message || body?.error || "Recompute failed");
      }
      setMessage(body?.message ?? "Ladder recomputed.");
      setStatus("done");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={status === "running"}
        className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-100 hover:bg-slate-700 disabled:opacity-50"
      >
        {status === "running" ? "Recomputing…" : "Recompute ladder"}
      </button>
      {message && (
        <span
          className={`text-xs ${
            status === "error" ? "text-red-300" : "text-emerald-300"
          }`}
        >
          {message}
        </span>
      )}
    </div>
  );
}
