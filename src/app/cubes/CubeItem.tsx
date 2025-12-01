"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type MouseEvent } from "react";
import type { CubeSummary } from "@/lib/cubes/types";

export type CubeListItem = CubeSummary;

interface CubeItemProps {
  cube: CubeSummary;
}

export default function CubeItem({ cube }: CubeItemProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [updatingPublic, setUpdatingPublic] = useState(false);
  const [isPublicState, setIsPublicState] = useState(Boolean(cube.isPublic));

  const updatedLabel = useMemo(() => {
    const date = new Date(cube.updatedAt);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return date.toLocaleString();
  }, [cube.updatedAt]);

  const handleDelete = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (deleting) return;
    if (!window.confirm(`Delete cube "${cube.name}"? This cannot be undone.`)) {
      return;
    }
    try {
      setDeleting(true);
      const res = await fetch(`/api/cubes/${encodeURIComponent(cube.id)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || "Failed to delete cube");
      }
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleting(false);
    }
  };

  const handleTogglePublic = async () => {
    if (updatingPublic) return;
    try {
      setUpdatingPublic(true);
      const next = !isPublicState;
      const res = await fetch(`/api/cubes/${encodeURIComponent(cube.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isPublic: next }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || "Failed to update cube visibility");
      }
      setIsPublicState(next);
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdatingPublic(false);
    }
  };

  const isOwner = cube.isOwner !== false;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-slate-50 break-words">
            {cube.name}
          </div>
          {cube.description ? (
            <p className="mt-1 text-sm text-slate-300/90 whitespace-pre-line break-words">
              {cube.description}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300/80">
            <span className="inline-flex items-center rounded bg-slate-800/80 px-2 py-0.5 ring-1 ring-slate-700/70">
              {cube.cardCount} cards
            </span>
            <span className="inline-flex items-center rounded bg-slate-800/80 px-2 py-0.5 ring-1 ring-slate-700/70">
              Updated {updatedLabel}
            </span>
            {cube.imported ? (
              <span className="inline-flex items-center rounded bg-blue-600/20 px-2 py-0.5 ring-1 ring-blue-500/30 text-blue-200">
                Imported
              </span>
            ) : null}
            {cube.userName && !isOwner ? (
              <span className="inline-flex items-center rounded bg-slate-800/80 px-2 py-0.5 ring-1 ring-slate-700/70">
                by {cube.userName}
              </span>
            ) : null}
            {isOwner ? (
              <span
                className={`inline-flex items-center rounded px-2 py-0.5 ring-1 text-xs ${
                  isPublicState
                    ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/30"
                    : "bg-slate-800/80 text-slate-200 ring-slate-700/70"
                }`}
              >
                {isPublicState ? "Public" : "Private"}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {isOwner ? (
            <>
              <Link
                href={`/cubes/${encodeURIComponent(cube.id)}/edit`}
                className="rounded bg-blue-600/80 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600 text-center"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={handleTogglePublic}
                disabled={updatingPublic}
                className="rounded bg-slate-800/80 px-3 py-1 text-xs font-medium text-slate-100 hover:bg-slate-700/80 disabled:opacity-50"
              >
                {updatingPublic
                  ? "Updating..."
                  : isPublicState
                  ? "Make Private"
                  : "Make Public"}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded bg-rose-600/80 px-3 py-1 text-xs font-medium text-white hover:bg-rose-600 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </>
          ) : (
            <Link
              href={`/cubes/${encodeURIComponent(cube.id)}`}
              className="rounded bg-emerald-600/80 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-600 text-center"
            >
              View
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
