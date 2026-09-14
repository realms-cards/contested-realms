"use client";

import clsx from "clsx";
import { Globe, Lock, Trash2, List, Pencil, Copy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { RcButton } from "@/components/ui/rc-button";
import type { CubeSummary } from "@/lib/cubes/types";

export type CubeListItem = CubeSummary;

type CubeItemProps = {
  cube: CubeSummary;
  onDelete?: (cubeId: string) => void;
  variant?: "grid" | "list";
};

/** Icon-only row action (list view); the grid overlay uses the default size. */
const ROW_ACTION = "h-7 w-7 bg-black/35";

/** Public toggle when the cube is public. */
const PUBLIC_ACTION = "border-rc-success/40 bg-rc-success/15 text-rc-success-ink";

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
    items.push(<Badge key="count">{shortCardCount}</Badge>);
    if (isOwner || typeof cube.isPublic === "boolean") {
      items.push(
        <Badge key="visibility" tone={effectiveIsPublic ? "ok" : "default"}>
          {effectiveIsPublic ? "Public" : "Private"}
        </Badge>
      );
    }
    if (cube.imported) {
      items.push(
        <Badge key="imported" tone="info">
          Imported
        </Badge>
      );
    }
    return items;
  }, [shortCardCount, isOwner, cube.isPublic, cube.imported, effectiveIsPublic]);

  // List view - compact single row
  if (variant === "list") {
    return (
      <Link
        href={`/cubes/${encodeURIComponent(cube.id)}/edit`}
        className="group relative flex items-center gap-3 rounded-rc-md border border-rc-line/12 bg-black/30 px-3 py-2 transition-colors hover:border-rc-accent/30 hover:bg-rc-accent/6"
      >
        {copiedMsg && (
          <div
            className="absolute top-1 left-1/2 z-20 -translate-x-1/2 rounded-rc-sm border border-rc-line/22 bg-black/90 px-2 py-1 font-rc-mono text-[11px] text-rc-fg-strong"
            aria-live="polite"
          >
            {copiedMsg}
          </div>
        )}

        {/* Name */}
        <span className="min-w-[120px] flex-1 truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
          {cube.name}
        </span>

        {/* Tags */}
        <div className="flex flex-shrink-0 items-center gap-1">{tags}</div>

        {/* Date */}
        <div className="rc-hint hidden w-28 flex-shrink-0 text-right sm:block">
          {cube.userName && <span>{cube.userName} · </span>}
          {new Date(cube.updatedAt).toLocaleDateString()}
        </div>

        {/* Actions on hover */}
        <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {/* Edit */}
          <RcButton
            variant="outline"
            size="icon"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/cubes/${encodeURIComponent(cube.id)}/edit`);
            }}
            className={ROW_ACTION}
            aria-label="Edit"
            title="Edit Cube"
          >
            <Pencil className="h-3.5 w-3.5" />
          </RcButton>

          {/* TTS Export */}
          <RcButton
            variant="outline"
            size="icon"
            className={ROW_ACTION}
            aria-label="TTS Export"
            title="Download TTS JSON"
            onClick={handleTTSExport}
          >
            <span className="font-rc-mono text-[10px] leading-none tracking-[0.08em]">
              TTS
            </span>
          </RcButton>

          {/* Export List */}
          <RcButton
            variant="outline"
            size="icon"
            className={ROW_ACTION}
            aria-label="Export List"
            title="Copy card list"
            onClick={handleExportList}
            disabled={exportingText}
          >
            <List className="h-3.5 w-3.5" />
          </RcButton>

          {/* Copy Cube */}
          {!isOwner && (
            <RcButton
              variant="outline"
              size="icon"
              className={ROW_ACTION}
              aria-label="Copy Cube"
              title="Copy to your cubes"
              onClick={handleCopy}
            >
              <Copy className="h-3.5 w-3.5" />
            </RcButton>
          )}

          {/* Toggle Public/Private */}
          {isOwner && (
            <RcButton
              variant="outline"
              size="icon"
              className={clsx(ROW_ACTION, effectiveIsPublic && PUBLIC_ACTION)}
              aria-label="Toggle public/private"
              title={effectiveIsPublic ? "Make private" : "Make public"}
              onClick={handleTogglePublic}
              disabled={updatingPublic}
            >
              {effectiveIsPublic ? (
                <Globe className="h-3.5 w-3.5" />
              ) : (
                <Lock className="h-3.5 w-3.5" />
              )}
            </RcButton>
          )}

          {/* Delete */}
          {isOwner && (
            <RcButton
              variant="danger-soft"
              size="icon-xs"
              onClick={handleDelete}
              disabled={deleting}
              aria-label="Delete"
              title="Delete cube"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </RcButton>
          )}
        </div>
      </Link>
    );
  }

  // Grid view - card with hover overlay
  return (
    <Link
      href={`/cubes/${encodeURIComponent(cube.id)}/edit`}
      className="group relative block rounded-rc-md border border-rc-line/12 bg-black/30 p-3 transition-colors hover:border-rc-accent/30 hover:bg-rc-accent/6"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="line-clamp-1 pr-8 font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
            {cube.name}
          </div>
          {cube.description && (
            <p className="mt-1 line-clamp-2 font-rc-sans text-sm text-rc-fg-muted">
              {cube.description}
            </p>
          )}
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">{tags}</div>
          )}
          <div className="rc-hint mt-2">
            {cube.userName && <span>by {cube.userName} · </span>}
            Updated {updatedStr}
          </div>
        </div>
      </div>

      {/* Full card overlay with action buttons */}
      <div className="absolute inset-0 z-10 flex flex-wrap items-center justify-center gap-3 rounded-rc-md bg-[rgba(6,10,20,0.86)] opacity-0 transition-opacity group-hover:opacity-100">
        {copiedMsg && (
          <div
            className="absolute top-2 left-2 rounded-rc-sm border border-rc-line/22 bg-black/90 px-2 py-1 font-rc-mono text-[11px] text-rc-fg-strong"
            aria-live="polite"
          >
            {copiedMsg}
          </div>
        )}

        {/* Edit Cube */}
        <RcButton
          variant="outline"
          className="bg-black/35"
          aria-label="Edit Cube"
          onClick={(e: MouseEvent<HTMLButtonElement>) => {
            e.preventDefault();
            e.stopPropagation();
            router.push(`/cubes/${encodeURIComponent(cube.id)}/edit`);
          }}
        >
          <Pencil className="h-4 w-4" />
          <span>Edit</span>
        </RcButton>

        {/* TTS Export */}
        <RcButton
          variant="outline"
          size="icon"
          className="bg-black/35"
          aria-label="TTS Export"
          title="Download TTS JSON"
          onClick={handleTTSExport}
        >
          <span className="font-rc-mono text-xs tracking-[0.08em]">TTS</span>
        </RcButton>

        {/* Export List */}
        <RcButton
          variant="outline"
          size="icon"
          className="bg-black/35"
          aria-label="Export List"
          title="Copy card list"
          onClick={handleExportList}
          disabled={exportingText}
        >
          <List className="h-5 w-5" />
        </RcButton>

        {/* Copy Cube (for public cubes not owned) */}
        {!isOwner && (
          <RcButton
            variant="outline"
            size="icon"
            className="bg-black/35"
            aria-label="Copy Cube"
            title="Copy to your cubes"
            onClick={handleCopy}
          >
            <Copy className="h-5 w-5" />
          </RcButton>
        )}

        {/* Toggle Public/Private */}
        {isOwner && (
          <RcButton
            variant="outline"
            size="icon"
            className={clsx("bg-black/35", effectiveIsPublic && PUBLIC_ACTION)}
            aria-label="Toggle public/private"
            title={effectiveIsPublic ? "Make private" : "Make public"}
            onClick={handleTogglePublic}
            disabled={updatingPublic}
          >
            {effectiveIsPublic ? (
              <Globe className="h-5 w-5" />
            ) : (
              <Lock className="h-5 w-5" />
            )}
          </RcButton>
        )}

        {/* Delete */}
        {isOwner && (
          <RcButton
            variant="danger-soft"
            size="icon"
            aria-label="Delete cube"
            title="Delete"
            onClick={handleDelete}
            disabled={deleting}
          >
            <Trash2 className="h-5 w-5" />
          </RcButton>
        )}
      </div>
    </Link>
  );
}
