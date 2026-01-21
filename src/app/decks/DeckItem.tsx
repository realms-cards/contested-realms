"use client";

import clsx from "clsx";
import { Globe, Lock, Trash2, FileText, List, Pencil, RefreshCw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type MouseEvent, type ReactNode } from "react";

type DeckItemProps = {
  deck: {
    id: string;
    name: string;
    format: string;
    updatedAt: string; // ISO string
    isPublic?: boolean;
    imported?: boolean;
    curiosaSourceId?: string | null; // For sync functionality
    userName?: string; // For public decks from other users
    isOwner?: boolean; // Whether current user owns this deck
    avatarState: "none" | "single" | "multiple";
    avatarCard?: { name: string; slug: string | null } | null;
    isPending?: boolean; // True while loading after import
  };
  onDelete?: (deckId: string) => void; // Optimistic delete callback
  variant?: "grid" | "list"; // Display mode
};

type TagTone = "default" | "public" | "private" | "info" | "warning" | "error";

const TAG_TONE_STYLES: Record<TagTone, string> = {
  default: "bg-foreground/10 text-foreground/80 border-white/10",
  public: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  private: "bg-zinc-800/70 text-zinc-300 border-zinc-600/60",
  info: "bg-blue-500/15 text-blue-200 border-blue-400/20",
  warning: "bg-amber-500/15 text-amber-200 border-amber-400/20",
  error: "bg-rose-500/15 text-rose-200 border-rose-400/20",
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

function normalizeFormatLabel(format: string | undefined) {
  if (!format) return "";
  const lower = format.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export default function DeckItem({
  deck,
  onDelete,
  variant = "grid",
}: DeckItemProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [updatingPublic, setUpdatingPublic] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isPublicState, setIsPublicState] = useState<boolean>(
    Boolean(deck.isPublic)
  );
  const [exportingText, setExportingText] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);

  async function handleDelete(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (deleting) return;
    const ok = window.confirm(
      `Delete deck "${deck.name}"? This cannot be undone.`
    );
    if (!ok) return;

    // Optimistic update - remove from UI immediately
    if (onDelete) {
      onDelete(deck.id);
    }

    try {
      setDeleting(true);
      const res = await fetch(`/api/decks/${encodeURIComponent(deck.id)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || "Failed to delete deck");
      }
      // Still refresh to ensure consistency, but user already sees the change
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      // Refetch to restore the deck if delete failed
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  async function handleSync(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (syncing || !deck.curiosaSourceId) return;

    try {
      setSyncing(true);
      const res = await fetch(`/api/decks/${encodeURIComponent(deck.id)}/sync`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to sync deck");
      }
      setCopiedMsg("Synced!");
      setTimeout(() => setCopiedMsg(null), 1500);
      // Refresh to show updated deck
      try {
        window.dispatchEvent(new Event("decks:refresh"));
      } catch {}
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }

  const isOwner = deck.isOwner !== false;
  const effectiveIsPublic = isOwner ? isPublicState : Boolean(deck.isPublic);
  const formatLabel = useMemo(
    () => normalizeFormatLabel(deck.format),
    [deck.format]
  );
  const updatedStr = useMemo(
    () => new Date(deck.updatedAt).toLocaleString(),
    [deck.updatedAt]
  );

  const tags = useMemo(() => {
    const items: ReactNode[] = [];
    // Show loading tag for pending decks
    if (deck.isPending) {
      items.push(
        <Tag key="loading" tone="info">
          <span className="inline-flex items-center gap-1">
            <span className="w-3 h-3 border border-blue-300 border-t-transparent rounded-full animate-spin" />
            Loading...
          </span>
        </Tag>
      );
    }
    if (formatLabel) {
      items.push(
        <Tag key="format" tone="default">
          {formatLabel}
        </Tag>
      );
    }
    if (isOwner || typeof deck.isPublic === "boolean") {
      items.push(
        <Tag key="visibility" tone={effectiveIsPublic ? "public" : "private"}>
          {effectiveIsPublic ? "Public" : "Private"}
        </Tag>
      );
    }
    if (deck.imported) {
      items.push(
        <Tag key="imported" tone="info">
          Imported
        </Tag>
      );
    }
    if (deck.avatarState === "multiple") {
      items.push(
        <Tag key="avatar-wip" tone="warning">
          WIP (Multiple Avatars)
        </Tag>
      );
    } else if (deck.avatarState === "none" && !deck.isPending) {
      items.push(
        <Tag key="avatar-missing" tone="error">
          Avatar Missing
        </Tag>
      );
    }
    return items;
  }, [
    deck.avatarState,
    deck.imported,
    deck.isPending,
    deck.isPublic,
    effectiveIsPublic,
    formatLabel,
    isOwner,
  ]);

  const avatarPreview = useMemo(() => {
    // Show loading spinner for pending decks
    if (deck.isPending) {
      return (
        <div className="flex-shrink-0 pointer-events-none">
          <div className="relative w-16 h-24 overflow-hidden rounded-sm shadow-lg shadow-black/40 ring-1 ring-white/15 bg-black/30 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      );
    }
    if (deck.avatarState !== "single" || !deck.avatarCard) return null;
    const { name, slug } = deck.avatarCard;
    if (slug) {
      return (
        <div className="flex-shrink-0 pointer-events-none">
          <div className="relative w-16 h-24 overflow-hidden rounded-sm shadow-lg shadow-black/40 ring-1 ring-white/15 bg-black/30">
            <Image
              src={`/api/images/${slug}`}
              alt={name ? `${name} avatar` : "Avatar card"}
              fill
              sizes="64px"
              className="object-cover"
              priority={false}
              unoptimized
            />
          </div>
        </div>
      );
    }
    if (name) {
      return (
        <div className="flex-shrink-0 pointer-events-none">
          <div className="px-2 py-1 rounded bg-purple-500/15 border border-purple-400/20 text-xs text-purple-200 text-center max-w-[5rem]">
            {name}
          </div>
        </div>
      );
    }
    return null;
  }, [deck.avatarCard, deck.avatarState, deck.isPending]);

  // List view - compact single row with full actions
  if (variant === "list") {
    return (
      <Link
        href={`/decks/editor-3d?id=${encodeURIComponent(deck.id)}`}
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

        {/* Small avatar thumbnail */}
        {deck.avatarState === "single" && deck.avatarCard?.slug && (
          <div className="flex-shrink-0 w-8 h-12 relative overflow-hidden rounded-sm ring-1 ring-white/10">
            <Image
              src={`/api/images/${deck.avatarCard.slug}`}
              alt={deck.avatarCard.name || "Avatar"}
              fill
              sizes="32px"
              className="object-cover"
              unoptimized
            />
          </div>
        )}
        {deck.isPending && (
          <div className="flex-shrink-0 w-8 h-12 flex items-center justify-center bg-black/30 rounded-sm ring-1 ring-white/10">
            <div className="w-4 h-4 border border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Name - allow more space */}
        <span className="font-medium truncate min-w-[120px] flex-1">
          {deck.name}
        </span>

        {/* Tags */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {formatLabel && <Tag tone="default">{formatLabel}</Tag>}
          {(isOwner || typeof deck.isPublic === "boolean") && (
            <Tag tone={effectiveIsPublic ? "public" : "private"}>
              {effectiveIsPublic ? "Public" : "Private"}
            </Tag>
          )}
          {deck.imported && <Tag tone="info">Imported</Tag>}
          {deck.avatarState === "multiple" && <Tag tone="warning">WIP</Tag>}
          {deck.avatarState === "none" && !deck.isPending && (
            <Tag tone="error">No Avatar</Tag>
          )}
        </div>

        {/* Date */}
        <div className="flex-shrink-0 text-xs text-slate-400 hidden sm:block w-28 text-right">
          {deck.userName && <span>{deck.userName} • </span>}
          {new Date(deck.updatedAt).toLocaleDateString()}
        </div>

        {/* All actions on hover */}
        <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Edit */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/decks/editor-3d?id=${encodeURIComponent(deck.id)}`);
            }}
            className="p-1.5 rounded bg-amber-600/80 hover:bg-amber-500 text-white"
            aria-label="Edit"
            title="Edit Deck"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>

          {/* TTS Export */}
          <button
            aria-label="TTS Export"
            title="Download TTS JSON"
            onClick={async (e: MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              try {
                const ttsUrl = `/api/decks/${encodeURIComponent(deck.id)}/tts`;
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
                a.download = `${deck.name.replace(
                  /[^a-zA-Z0-9]/g,
                  "_"
                )}_TTS.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                setCopiedMsg("TTS downloaded!");
                setTimeout(() => setCopiedMsg(null), 1500);
              } catch (err) {
                alert(
                  err instanceof Error ? err.message : "Failed to export TTS"
                );
              }
            }}
            className="p-1.5 rounded bg-zinc-700/80 ring-1 ring-purple-500/50 hover:bg-purple-600/70 text-purple-300 hover:text-white"
          >
            <span className="text-[10px] font-bold leading-none">TTS</span>
          </button>

          {/* Quick Export (simple list) */}
          <button
            aria-label="Quick Export"
            title="Copy card list"
            onClick={async (e: MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              if (exportingText) return;
              try {
                setExportingText(true);
                const res = await fetch(
                  `/api/decks/${encodeURIComponent(deck.id)}`,
                  { cache: "no-store" }
                );
                if (!res.ok) throw new Error("Failed to load deck");
                const data = await res.json();
                const allCards = [
                  ...(Array.isArray(data?.spellbook) ? data.spellbook : []),
                  ...(Array.isArray(data?.atlas) ? data.atlas : []),
                  ...(Array.isArray(data?.sideboard) ? data.sideboard : []),
                  ...(Array.isArray(data?.collection) ? data.collection : []),
                ];
                const avatarCounts = new Map<string, number>();
                const otherCounts = new Map<string, number>();
                for (const c of allCards) {
                  const nm = typeof c.name === "string" ? c.name.trim() : "";
                  if (!nm) continue;
                  const t =
                    typeof c.type === "string" ? c.type.toLowerCase() : "";
                  if (t.includes("avatar"))
                    avatarCounts.set(nm, (avatarCounts.get(nm) || 0) + 1);
                  else otherCounts.set(nm, (otherCounts.get(nm) || 0) + 1);
                }
                const avatarLines = Array.from(avatarCounts.entries())
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([name, n]) => `${n} ${name}`);
                const otherLines = Array.from(otherCounts.entries())
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([name, n]) => `${n} ${name}`);
                const textToCopy = [...avatarLines, ...otherLines].join("\n");
                await navigator.clipboard.writeText(textToCopy);
                setCopiedMsg("Copied list");
                setTimeout(() => setCopiedMsg(null), 1200);
              } catch (err) {
                alert(err instanceof Error ? err.message : String(err));
              } finally {
                setExportingText(false);
              }
            }}
            disabled={exportingText}
            className="p-1.5 rounded bg-zinc-700/80 ring-1 ring-zinc-500/50 hover:bg-zinc-600/80 text-zinc-300 hover:text-white"
          >
            <List className="h-3.5 w-3.5" />
          </button>

          {/* Full Export */}
          <button
            aria-label="Export Deck"
            title="Copy formatted deck"
            onClick={async (e: MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              if (exportingText) return;
              try {
                setExportingText(true);
                const res = await fetch(
                  `/api/decks/${encodeURIComponent(deck.id)}`,
                  { cache: "no-store" }
                );
                if (!res.ok) throw new Error("Failed to load deck");
                const data = await res.json();
                const spellbook = Array.isArray(data?.spellbook)
                  ? data.spellbook
                  : [];
                const atlas = Array.isArray(data?.atlas) ? data.atlas : [];
                const sideboard = [
                  ...(Array.isArray(data?.sideboard) ? data.sideboard : []),
                  ...(Array.isArray(data?.collection) ? data.collection : []),
                ];
                type Cat =
                  | "Avatar"
                  | "Aura"
                  | "Artifact"
                  | "Minion"
                  | "Magic"
                  | "Site"
                  | "Collection";
                const cats: Record<Cat, Map<string, number>> = {
                  Avatar: new Map(),
                  Aura: new Map(),
                  Artifact: new Map(),
                  Minion: new Map(),
                  Magic: new Map(),
                  Site: new Map(),
                  Collection: new Map(),
                };
                let avatarFound = false;
                const add = (c: Record<string, unknown>) => {
                  const nm = typeof c.name === "string" ? c.name.trim() : "";
                  if (!nm) return;
                  const t =
                    typeof c.type === "string" ? c.type.toLowerCase() : "";
                  let cat: Cat;
                  if (t.includes("avatar")) {
                    cat = "Avatar";
                    avatarFound = true;
                  } else if (t.includes("site")) cat = "Site";
                  else if (t.includes("aura")) cat = "Aura";
                  else if (t.includes("artifact")) cat = "Artifact";
                  else if (t.includes("minion") || t.includes("creature"))
                    cat = "Minion";
                  else cat = "Magic";
                  cats[cat].set(nm, (cats[cat].get(nm) || 0) + 1);
                };
                for (const c of [...spellbook, ...atlas]) add(c);
                for (const o of sideboard) {
                  const nm = typeof o.name === "string" ? o.name.trim() : "";
                  const t =
                    typeof o.type === "string" ? o.type.toLowerCase() : "";
                  if (!nm) continue;
                  if (t.includes("avatar")) {
                    if (!avatarFound) {
                      cats.Avatar.set(nm, (cats.Avatar.get(nm) || 0) + 1);
                      avatarFound = true;
                    }
                  } else
                    cats.Collection.set(nm, (cats.Collection.get(nm) || 0) + 1);
                }
                const order: Cat[] = [
                  "Avatar",
                  "Aura",
                  "Artifact",
                  "Minion",
                  "Magic",
                  "Site",
                  "Collection",
                ];
                const lines: string[] = [];
                for (const cat of order) {
                  const entries = Array.from(cats[cat].entries()).sort((a, b) =>
                    a[0].localeCompare(b[0])
                  );
                  if (!entries.length) continue;
                  const total = entries.reduce((sum, [, n]) => sum + n, 0);
                  lines.push(`${cat} (${total})`);
                  for (const [name, n] of entries) lines.push(`${n} ${name}`);
                  lines.push("");
                }
                await navigator.clipboard.writeText(lines.join("\n").trim());
                setCopiedMsg("Copied deck");
                setTimeout(() => setCopiedMsg(null), 1200);
              } catch (err) {
                alert(err instanceof Error ? err.message : String(err));
              } finally {
                setExportingText(false);
              }
            }}
            disabled={exportingText}
            className="p-1.5 rounded bg-zinc-700/80 ring-1 ring-zinc-500/50 hover:bg-zinc-600/80 text-zinc-300 hover:text-white"
          >
            <FileText className="h-3.5 w-3.5" />
          </button>

          {/* Toggle Public/Private */}
          {isOwner && (
            <button
              aria-label="Toggle public/private"
              title={effectiveIsPublic ? "Make private" : "Make public"}
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (updatingPublic) return;
                try {
                  setUpdatingPublic(true);
                  const res = await fetch(
                    `/api/decks/${encodeURIComponent(deck.id)}`,
                    {
                      method: "PUT",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ isPublic: !effectiveIsPublic }),
                    }
                  );
                  if (!res.ok) throw new Error("Failed to update visibility");
                  setIsPublicState((prev) => !prev);
                  try {
                    window.dispatchEvent(new Event("decks:refresh"));
                  } catch {}
                  router.refresh();
                } catch (err) {
                  alert(err instanceof Error ? err.message : String(err));
                } finally {
                  setUpdatingPublic(false);
                }
              }}
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

          {/* Sync from Curiosa */}
          {isOwner && deck.curiosaSourceId && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="p-1.5 rounded bg-zinc-700/80 ring-1 ring-cyan-500/50 hover:bg-cyan-600/70 text-cyan-400 hover:text-white"
              aria-label="Sync from Curiosa"
              title="Reload deck from Curiosa"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            </button>
          )}

          {/* Delete */}
          {isOwner && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 rounded bg-zinc-700/80 ring-1 ring-red-500/50 hover:bg-red-600/70 text-red-400 hover:text-white"
              aria-label="Delete"
              title="Delete deck"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </Link>
    );
  }

  // Grid view - card with full hover overlay
  return (
    <Link
      href={`/decks/editor-3d?id=${encodeURIComponent(deck.id)}`}
      className="border rounded p-3 hover:bg-muted/60 relative group block"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="font-medium line-clamp-1 pr-8">{deck.name}</div>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">{tags}</div>
          )}
          <div className="opacity-70 text-xs mt-2">
            {deck.userName && <span>by {deck.userName} • </span>}
            Updated {updatedStr}
          </div>
        </div>
        {avatarPreview}
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

        {/* Edit Deck - prominent button */}
        <button
          aria-label="Edit Deck"
          data-tooltip="Edit Deck"
          onClick={(e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            router.push(`/decks/editor-3d?id=${encodeURIComponent(deck.id)}`);
          }}
          className="inline-flex items-center justify-center h-10 px-3 gap-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 ring-1 ring-amber-400/60 hover:from-amber-500 hover:to-amber-400 text-white font-medium shadow-md shadow-amber-500/20 transition-all hover:scale-105"
        >
          <Pencil className="h-4 w-4" />
          <span className="text-sm">Edit</span>
        </button>

        {/* TTS Export (for Tabletop Simulator) - downloads JSON file */}
        <button
          aria-label="TTS Export"
          data-tooltip="Download TTS JSON"
          onClick={async (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            try {
              // Fetch TTS JSON from our endpoint
              const ttsUrl = `/api/decks/${encodeURIComponent(deck.id)}/tts`;
              const res = await fetch(ttsUrl);
              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || "Failed to fetch TTS data");
              }
              const ttsJson = await res.json();
              // Create and download the JSON file
              const blob = new Blob([JSON.stringify(ttsJson, null, 2)], {
                type: "application/json",
              });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${deck.name.replace(
                /[^a-zA-Z0-9]/g,
                "_"
              )}_TTS.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              setCopiedMsg("TTS file downloaded!");
              setTimeout(() => setCopiedMsg(null), 1500);
            } catch (err) {
              alert(
                err instanceof Error ? err.message : "Failed to export TTS"
              );
            }
          }}
          className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-zinc-700/80 ring-1 ring-purple-500/50 hover:bg-purple-600/70 text-purple-300 hover:text-white transition-colors"
        >
          <span className="text-xs font-bold">TTS</span>
        </button>

        {/* Quick Export (simple list) */}
        <button
          aria-label="Quick Export"
          data-tooltip="Quick export"
          onClick={async (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (exportingText) return;
            try {
              setExportingText(true);
              const res = await fetch(
                `/api/decks/${encodeURIComponent(deck.id)}`,
                { cache: "no-store" }
              );
              if (!res.ok) {
                const msg = await res.text().catch(() => "");
                throw new Error(msg || "Failed to load deck for export");
              }
              const data = await res.json();
              const allCards = [
                ...(Array.isArray(data?.spellbook) ? data.spellbook : []),
                ...(Array.isArray(data?.atlas) ? data.atlas : []),
                ...(Array.isArray(data?.sideboard) ? data.sideboard : []),
                ...(Array.isArray(data?.collection) ? data.collection : []),
              ];
              // Separate avatars from other cards
              const avatarCounts = new Map<string, number>();
              const otherCounts = new Map<string, number>();
              for (const c of allCards) {
                const nm = typeof c.name === "string" ? c.name.trim() : "";
                if (!nm) continue;
                const t =
                  typeof c.type === "string" ? c.type.toLowerCase() : "";
                if (t.includes("avatar")) {
                  avatarCounts.set(nm, (avatarCounts.get(nm) || 0) + 1);
                } else {
                  otherCounts.set(nm, (otherCounts.get(nm) || 0) + 1);
                }
              }
              // Avatar first, then rest sorted alphabetically
              const avatarLines = Array.from(avatarCounts.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([name, n]) => `${n} ${name}`);
              const otherLines = Array.from(otherCounts.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([name, n]) => `${n} ${name}`);
              const lines = [...avatarLines, ...otherLines];
              const textToCopy = lines.join("\n");
              try {
                await navigator.clipboard.writeText(textToCopy);
                setCopiedMsg("Copied list");
                setTimeout(() => setCopiedMsg(null), 1200);
              } catch {
                // Clipboard API failed - show fallback with selectable text
                const msg =
                  "Clipboard access denied. Select and copy the text below:\n\n" +
                  textToCopy;
                if (!prompt("Copy this deck list:", textToCopy)) alert(msg);
              }
            } catch (err) {
              alert(err instanceof Error ? err.message : String(err));
            } finally {
              setExportingText(false);
            }
          }}
          disabled={exportingText}
          className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-zinc-700/80 ring-1 ring-zinc-500/50 hover:bg-zinc-600/80 text-zinc-300 hover:text-white transition-colors"
        >
          <List className="h-5 w-5" />
        </button>

        {/* Export Deck (Sorcery text format) */}
        <button
          aria-label="Export Deck"
          data-tooltip="Export deck"
          onClick={async (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (exportingText) return;
            try {
              setExportingText(true);
              const res = await fetch(
                `/api/decks/${encodeURIComponent(deck.id)}`,
                { cache: "no-store" }
              );
              if (!res.ok) {
                const msg = await res.text().catch(() => "");
                throw new Error(msg || "Failed to load deck for export");
              }
              const data = await res.json();
              const spellbook = Array.isArray(data?.spellbook)
                ? data.spellbook
                : [];
              const atlas = Array.isArray(data?.atlas) ? data.atlas : [];
              // Combine sideboard and collection zones (both are "Collection" in game terms)
              const sideboard = [
                ...(Array.isArray(data?.sideboard) ? data.sideboard : []),
                ...(Array.isArray(data?.collection) ? data.collection : []),
              ];

              type Cat =
                | "Avatar"
                | "Aura"
                | "Artifact"
                | "Minion"
                | "Magic"
                | "Site"
                | "Collection";
              const cats: Record<Cat, Map<string, number>> = {
                Avatar: new Map(),
                Aura: new Map(),
                Artifact: new Map(),
                Minion: new Map(),
                Magic: new Map(),
                Site: new Map(),
                Collection: new Map(),
              };

              let avatarFound = false;
              const add = (c: Record<string, unknown>) => {
                const rec = c as Record<string, unknown>;
                const nm = typeof rec.name === "string" ? rec.name.trim() : "";
                if (!nm) return;
                const t =
                  typeof rec.type === "string" ? rec.type.toLowerCase() : "";
                let cat: Cat;
                if (t.includes("avatar")) {
                  cat = "Avatar";
                  avatarFound = true;
                } else if (t.includes("site")) cat = "Site";
                else if (t.includes("aura")) cat = "Aura";
                else if (t.includes("artifact")) cat = "Artifact";
                else if (t.includes("minion") || t.includes("creature"))
                  cat = "Minion";
                else cat = "Magic";
                cats[cat].set(nm, (cats[cat].get(nm) || 0) + 1);
              };

              for (const c of [...spellbook, ...atlas]) add(c);

              // Process sideboard/collection cards
              for (const obj of sideboard) {
                const o = obj as Record<string, unknown>;
                const nm = typeof o.name === "string" ? o.name.trim() : "";
                const t =
                  typeof o.type === "string" ? o.type.toLowerCase() : "";
                if (!nm) continue;
                if (t.includes("avatar")) {
                  if (!avatarFound) {
                    cats.Avatar.set(nm, (cats.Avatar.get(nm) || 0) + 1);
                    avatarFound = true;
                  }
                } else {
                  // Non-avatar sideboard cards go to Collection
                  cats.Collection.set(nm, (cats.Collection.get(nm) || 0) + 1);
                }
              }

              const order: Cat[] = [
                "Avatar",
                "Aura",
                "Artifact",
                "Minion",
                "Magic",
                "Site",
                "Collection",
              ];
              const lines: string[] = [];
              for (const cat of order) {
                const entries = Array.from(cats[cat].entries()).sort((a, b) =>
                  a[0].localeCompare(b[0])
                );
                if (!entries.length) continue;
                const total = entries.reduce((sum, [, n]) => sum + n, 0);
                lines.push(`${cat} (${total})`);
                for (const [name, n] of entries) lines.push(`${n} ${name}`);
                lines.push("");
              }
              const text = lines.join("\n").trim();
              try {
                await navigator.clipboard.writeText(text);
                setCopiedMsg("Copied deck");
                setTimeout(() => setCopiedMsg(null), 1200);
              } catch {
                // Clipboard API failed - show fallback with selectable text
                const msg =
                  "Clipboard access denied. Select and copy the text below:\n\n" +
                  text;
                if (!prompt("Copy this deck:", text)) alert(msg);
              }
            } catch (err) {
              alert(err instanceof Error ? err.message : String(err));
            } finally {
              setExportingText(false);
            }
          }}
          disabled={exportingText}
          className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-zinc-700/80 ring-1 ring-zinc-500/50 hover:bg-zinc-600/80 text-zinc-300 hover:text-white transition-colors"
        >
          <FileText className="h-5 w-5" />
        </button>

        {isOwner && (
          <button
            aria-label="Toggle public/private"
            data-tooltip={effectiveIsPublic ? "Make private" : "Make public"}
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (updatingPublic) return;
              try {
                setUpdatingPublic(true);
                const res = await fetch(
                  `/api/decks/${encodeURIComponent(deck.id)}`,
                  {
                    method: "PUT",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ isPublic: !effectiveIsPublic }),
                  }
                );
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  const msg =
                    (data && data.error) || "Failed to update deck visibility";
                  throw new Error(
                    typeof msg === "string"
                      ? msg
                      : "Failed to update deck visibility"
                  );
                }
                setIsPublicState((prev) => !prev);
                try {
                  window.dispatchEvent(new Event("decks:refresh"));
                } catch {}
                router.refresh();
              } catch (err) {
                alert(err instanceof Error ? err.message : String(err));
              } finally {
                setUpdatingPublic(false);
              }
            }}
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

        {/* Sync from Curiosa */}
        {isOwner && deck.curiosaSourceId && (
          <button
            aria-label="Sync from Curiosa"
            data-tooltip="Reload from Curiosa"
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-zinc-700/80 ring-1 ring-cyan-500/50 hover:bg-cyan-600/70 text-cyan-400 hover:text-white transition-colors"
          >
            <RefreshCw className={`h-5 w-5 ${syncing ? "animate-spin" : ""}`} />
          </button>
        )}

        {isOwner && (
          <button
            aria-label="Delete deck"
            data-tooltip="Delete"
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
