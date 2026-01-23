"use client";

import clsx from "clsx";
import { Globe, Lock, Trash2, List, Pencil, Copy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import type { CubeSummary } from "@/lib/cubes/types";

export type CubeListItem = CubeSummary;

type CubeItemProps = {
  cube: CubeSummary;
  onDelete?: (cubeId: string) => void;
  variant?: "grid" | "list";
};

type TagTone = "default" | "public" | "private" | "info";

const TAG_TONE_STYLES: Record<TagTone, string> = {
  default: "bg-foreground/10 text-foreground/80 border-white/10",
  public: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  private: "bg-zinc-800/70 text-zinc-300 border-zinc-600/60",
  info: "bg-blue-500/15 text-blue-200 border-blue-400/20",
};

function Tag({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: TagTone;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center text-xs px-2 py-0.5 rounded border leading-tight max-w-full overflow-hidden text-ellipsis whitespace-nowrap",
        TAG_TONE_STYLES[tone]
      )}
    >
      {children}
    </span>
  );
}

export default function CubeItem({
  cube,
  onDelete,
  variant = "grid",
}: CubeItemProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [updatingPublic, setUpdatingPublic] = useState(false);
  const [isPublicState, setIsPublicState] = useState(Boolean(cube.isPublic));
  const [exportingText, setExportingText] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);

  const isOwner = cube.isOwner !== false;
  const effectiveIsPublic = isOwner ? isPublicState : Boolean(cube.isPublic);

  const updatedStr = useMemo(
    () => new Date(cube.updatedAt).toLocaleString(),
    [cube.updatedAt]
  );

  const shortCardCount = useMemo(() => {
    const main = cube.cardCount;
    const extras = cube.sideboardCount;
    if (extras > 0) {
      return `${main}+${extras}`;
    }
    return `${main}`;
  }, [cube.cardCount, cube.sideboardCount]);

  async function handleDelete(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (deleting) return;
    const ok = window.confirm(
      `Delete cube "${cube.name}"? This cannot be undone.`
    );
    if (!ok) return;

    // Optimistic update
    if (onDelete) {
      onDelete(cube.id);
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
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  async function handleTogglePublic(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (updatingPublic) return;
    try {
      setUpdatingPublic(true);
      const res = await fetch(`/api/cubes/${encodeURIComponent(cube.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isPublic: !effectiveIsPublic }),
      });
      if (!res.ok) throw new Error("Failed to update visibility");
      setIsPublicState((prev) => !prev);
      try {
        window.dispatchEvent(new Event("cubes:refresh"));
      } catch {
        // Ignore dispatch errors
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setUpdatingPublic(false);
    }
  }

  async function handleExportList(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (exportingText) return;
    try {
      setExportingText(true);
      const res = await fetch(`/api/cubes/${encodeURIComponent(cube.id)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load cube");
      const data = await res.json();
      const allCards = Array.isArray(data?.cards) ? data.cards : [];

      // Group by name and count
      const counts = new Map<string, number>();
      for (const c of allCards) {
        const nm = typeof c.name === "string" ? c.name.trim() : "";
        const count = typeof c.count === "number" ? c.count : 1;
        if (nm) counts.set(nm, (counts.get(nm) || 0) + count);
      }

      const lines = Array.from(counts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, n]) => `${n} ${name}`);

      const textToCopy = lines.join("\n");
      await navigator.clipboard.writeText(textToCopy);
      setCopiedMsg("Copied list");
      setTimeout(() => setCopiedMsg(null), 1200);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setExportingText(false);
    }
  }

  async function handleTTSExport(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const ttsUrl = `/api/cubes/${encodeURIComponent(cube.id)}/tts`;
      const res = await fetch(ttsUrl);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to fetch TTS data");
      }
      const ttsJson = await res.json();
      const blob = new Blob([JSON.stringify(ttsJson, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${cube.name.replace(/[^a-zA-Z0-9]/g, "_")}_TTS.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setCopiedMsg("TTS downloaded!");
      setTimeout(() => setCopiedMsg(null), 1500);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to export TTS");
    }
  }

  async function handleCopy(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await fetch(`/api/cubes/${encodeURIComponent(cube.id)}/copy`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to copy cube");
      }
      setCopiedMsg("Cube copied!");
      setTimeout(() => setCopiedMsg(null), 1500);
      try {
        window.dispatchEvent(new Event("cubes:refresh"));
      } catch {
        // Ignore dispatch errors
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  const tags = useMemo(() => {
    const items: ReactNode[] = [];
    items.push(
      <Tag key="count" tone="default">
        {shortCardCount}
      </Tag>
    );
    if (isOwner || typeof cube.isPublic === "boolean") {
      items.push(
        <Tag key="visibility" tone={effectiveIsPublic ? "public" : "private"}>
          {effectiveIsPublic ? "Public" : "Private"}
        </Tag>
      );
    }
    if (cube.imported) {
      items.push(
        <Tag key="imported" tone="info">
          Imported
        </Tag>
      );
    }
    return items;
  }, [shortCardCount, isOwner, cube.isPublic, cube.imported, effectiveIsPublic]);

  // List view - compact single row
  if (variant === "list") {
    return (
      <Link
        href={`/cubes/${encodeURIComponent(cube.id)}/edit`}
        className="border rounded px-3 py-2 hover:bg-muted/60 relative group flex items-center gap-3"
      >
        {copiedMsg && (
          <div
            className="absolute top-1 left-1/2 -translate-x-1/2 rounded bg-black/90 text-white text-xs px-2 py-1 ring-1 ring-white/20 z-20"
            aria-live="polite"
          >
            {copiedMsg}
          </div>
        )}

        {/* Name */}
        <span className="font-medium truncate min-w-[120px] flex-1">
          {cube.name}
        </span>

        {/* Tags */}
        <div className="flex items-center gap-1 flex-shrink-0">{tags}</div>

        {/* Date */}
        <div className="flex-shrink-0 text-xs text-slate-400 hidden sm:block w-28 text-right">
          {cube.userName && <span>{cube.userName} - </span>}
          {new Date(cube.updatedAt).toLocaleDateString()}
        </div>

        {/* Actions on hover */}
        <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Edit */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/cubes/${encodeURIComponent(cube.id)}/edit`);
            }}
            className="p-1.5 rounded bg-amber-600/80 hover:bg-amber-500 text-white"
            aria-label="Edit"
            title="Edit Cube"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>

          {/* TTS Export */}
          <button
            aria-label="TTS Export"
            title="Download TTS JSON"
            onClick={handleTTSExport}
            className="p-1.5 rounded bg-zinc-700/80 ring-1 ring-purple-500/50 hover:bg-purple-600/70 text-purple-300 hover:text-white"
          >
            <span className="text-[10px] font-bold leading-none">TTS</span>
          </button>

          {/* Export List */}
          <button
            aria-label="Export List"
            title="Copy card list"
            onClick={handleExportList}
            disabled={exportingText}
            className="p-1.5 rounded bg-zinc-700/80 ring-1 ring-zinc-500/50 hover:bg-zinc-600/80 text-zinc-300 hover:text-white"
          >
            <List className="h-3.5 w-3.5" />
          </button>

          {/* Copy Cube */}
          {!isOwner && (
            <button
              aria-label="Copy Cube"
              title="Copy to your cubes"
              onClick={handleCopy}
              className="p-1.5 rounded bg-zinc-700/80 ring-1 ring-emerald-500/50 hover:bg-emerald-600/70 text-emerald-300 hover:text-white"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Toggle Public/Private */}
          {isOwner && (
            <button
              aria-label="Toggle public/private"
              title={effectiveIsPublic ? "Make private" : "Make public"}
              onClick={handleTogglePublic}
              disabled={updatingPublic}
              className={`p-1.5 rounded ring-1 transition-colors ${
                effectiveIsPublic
                  ? "bg-green-700/60 text-green-300 ring-green-500/50 hover:bg-green-600/80 hover:text-white"
                  : "bg-zinc-700/80 text-zinc-400 ring-zinc-500/50 hover:bg-zinc-600/80 hover:text-white"
              }`}
            >
              {effectiveIsPublic ? (
                <Globe className="h-3.5 w-3.5" />
              ) : (
                <Lock className="h-3.5 w-3.5" />
              )}
            </button>
          )}

          {/* Delete */}
          {isOwner && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 rounded bg-zinc-700/80 ring-1 ring-red-500/50 hover:bg-red-600/70 text-red-400 hover:text-white"
              aria-label="Delete"
              title="Delete cube"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </Link>
    );
  }

  // Grid view - card with hover overlay
  return (
    <Link
      href={`/cubes/${encodeURIComponent(cube.id)}/edit`}
      className="border rounded p-3 hover:bg-muted/60 relative group block"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium line-clamp-1 pr-8">{cube.name}</div>
          {cube.description && (
            <p className="mt-1 text-sm text-slate-300/80 line-clamp-2">
              {cube.description}
            </p>
          )}
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">{tags}</div>
          )}
          <div className="opacity-70 text-xs mt-2">
            {cube.userName && <span>by {cube.userName} - </span>}
            Updated {updatedStr}
          </div>
        </div>
      </div>

      {/* Full card overlay with action buttons */}
      <div className="absolute inset-0 z-10 flex items-center justify-center gap-3 rounded-lg bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity">
        {copiedMsg && (
          <div
            className="absolute top-2 left-2 rounded bg-black/90 text-white text-xs px-2 py-1 ring-1 ring-white/20"
            aria-live="polite"
          >
            {copiedMsg}
          </div>
        )}

        {/* Edit Cube */}
        <button
          aria-label="Edit Cube"
          onClick={(e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            router.push(`/cubes/${encodeURIComponent(cube.id)}/edit`);
          }}
          className="inline-flex items-center justify-center h-10 px-3 gap-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 ring-1 ring-amber-400/60 hover:from-amber-500 hover:to-amber-400 text-white font-medium shadow-md shadow-amber-500/20 transition-all hover:scale-105"
        >
          <Pencil className="h-4 w-4" />
          <span className="text-sm">Edit</span>
        </button>

        {/* TTS Export */}
        <button
          aria-label="TTS Export"
          title="Download TTS JSON"
          onClick={handleTTSExport}
          className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-zinc-700/80 ring-1 ring-purple-500/50 hover:bg-purple-600/70 text-purple-300 hover:text-white transition-colors"
        >
          <span className="text-xs font-bold">TTS</span>
        </button>

        {/* Export List */}
        <button
          aria-label="Export List"
          title="Copy card list"
          onClick={handleExportList}
          disabled={exportingText}
          className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-zinc-700/80 ring-1 ring-zinc-500/50 hover:bg-zinc-600/80 text-zinc-300 hover:text-white transition-colors"
        >
          <List className="h-5 w-5" />
        </button>

        {/* Copy Cube (for public cubes not owned) */}
        {!isOwner && (
          <button
            aria-label="Copy Cube"
            title="Copy to your cubes"
            onClick={handleCopy}
            className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-zinc-700/80 ring-1 ring-emerald-500/50 hover:bg-emerald-600/70 text-emerald-300 hover:text-white transition-colors"
          >
            <Copy className="h-5 w-5" />
          </button>
        )}

        {/* Toggle Public/Private */}
        {isOwner && (
          <button
            aria-label="Toggle public/private"
            title={effectiveIsPublic ? "Make private" : "Make public"}
            onClick={handleTogglePublic}
            disabled={updatingPublic}
            className={`inline-flex items-center justify-center h-10 w-10 rounded-lg ring-1 transition-colors ${
              effectiveIsPublic
                ? "bg-green-700/60 text-green-300 ring-green-500/50 hover:bg-green-600/80 hover:text-white"
                : "bg-zinc-700/80 text-zinc-400 ring-zinc-500/50 hover:bg-zinc-600/80 hover:text-white"
            }`}
          >
            {effectiveIsPublic ? (
              <Globe className="h-5 w-5" />
            ) : (
              <Lock className="h-5 w-5" />
            )}
          </button>
        )}

        {/* Delete */}
        {isOwner && (
          <button
            aria-label="Delete cube"
            title="Delete"
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-zinc-700/80 ring-1 ring-red-500/50 hover:bg-red-600/70 text-red-400 hover:text-white transition-colors"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        )}
      </div>
    </Link>
  );
}
