"use client";

import clsx from "clsx";
import { Globe, Lock, Trash2, FileText, List, MoreVertical, Pencil, RefreshCw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { RcButton } from "@/components/ui/rc-button";

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

/** Icon-only row action (list view); grid overlay uses the default icon size. */
const ROW_ACTION = "h-7 w-7 bg-black/35";

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
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const mobileActionsRef = useRef<HTMLDivElement>(null);

  // Close mobile actions when tapping outside
  useEffect(() => {
    if (!mobileActionsOpen) return;
    function handleOutside(e: globalThis.MouseEvent | TouchEvent) {
      if (mobileActionsRef.current && !mobileActionsRef.current.contains(e.target as Node)) {
        setMobileActionsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [mobileActionsOpen]);

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
        <Badge key="loading" tone="info">
          <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
          Loading...
        </Badge>
      );
    }
    if (formatLabel && deck.format?.toLowerCase() !== "sandbox") {
      items.push(<Badge key="format">{formatLabel}</Badge>);
    }
    if (isOwner || typeof deck.isPublic === "boolean") {
      items.push(
        <Badge key="visibility" tone={effectiveIsPublic ? "ok" : "default"}>
          {effectiveIsPublic ? "Public" : "Private"}
        </Badge>
      );
    }
    if (deck.imported) {
      items.push(
        <Badge key="imported" tone="info">
          Imported
        </Badge>
      );
    }
    if (deck.avatarState === "multiple") {
      items.push(
        <Badge key="avatar-wip" tone="warn">
          WIP (Multiple Avatars)
        </Badge>
      );
    } else if (deck.avatarState === "none" && !deck.isPending) {
      items.push(
        <Badge key="avatar-missing" tone="danger">
          Avatar Missing
        </Badge>
      );
    }
    return items;
  }, [
    deck.avatarState,
    deck.format,
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
          <div className="relative flex h-24 w-16 items-center justify-center overflow-hidden rounded-rc-sm border border-rc-line/18 bg-black/30 shadow-rc-md">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-rc-accent border-t-transparent" />
          </div>
        </div>
      );
    }
    if (deck.avatarState !== "single" || !deck.avatarCard) return null;
    const { name, slug } = deck.avatarCard;
    if (slug) {
      return (
        <div className="flex-shrink-0 pointer-events-none">
          <div className="relative h-24 w-16 overflow-hidden rounded-rc-sm border border-rc-line/18 bg-black/30 shadow-rc-md">
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
          <div className="max-w-[5rem] rounded-rc-md border border-rc-line/18 bg-black/30 px-2 py-1 text-center font-rc-mono text-[11px] text-rc-fg-muted">
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

        {/* Small avatar thumbnail */}
        {deck.avatarState === "single" && deck.avatarCard?.slug && (
          <div className="relative h-12 w-8 flex-shrink-0 overflow-hidden rounded-rc-sm border border-rc-line/14">
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
          <div className="flex h-12 w-8 flex-shrink-0 items-center justify-center rounded-rc-sm border border-rc-line/14 bg-black/30">
            <div className="h-4 w-4 animate-spin rounded-full border border-rc-accent border-t-transparent" />
          </div>
        )}

        {/* Name - allow more space */}
        <span className="min-w-[120px] flex-1 truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
          {deck.name}
        </span>

        {/* Tags */}
        <div className="flex flex-shrink-0 items-center gap-1">
          {formatLabel && <Badge>{formatLabel}</Badge>}
          {(isOwner || typeof deck.isPublic === "boolean") && (
            <Badge tone={effectiveIsPublic ? "ok" : "default"}>
              {effectiveIsPublic ? "Public" : "Private"}
            </Badge>
          )}
          {deck.imported && <Badge tone="info">Imported</Badge>}
          {deck.avatarState === "multiple" && <Badge tone="warn">WIP</Badge>}
          {deck.avatarState === "none" && !deck.isPending && (
            <Badge tone="danger">No Avatar</Badge>
          )}
        </div>

        {/* Date */}
        <div className="rc-hint hidden w-28 flex-shrink-0 text-right sm:block">
          {deck.userName && <span>{deck.userName} · </span>}
          {new Date(deck.updatedAt).toLocaleDateString()}
        </div>

        {/* Mobile: always-visible more button + actions */}
        <div ref={variant === "list" ? mobileActionsRef : undefined} className="flex flex-shrink-0 items-center gap-1">
          <RcButton
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMobileActionsOpen((prev) => !prev);
            }}
            className="h-7 w-7 text-rc-fg-muted hover:text-rc-accent-ring md:hidden"
            aria-label="More actions"
            title="More actions"
          >
            <MoreVertical className="h-4 w-4" />
          </RcButton>

          {/* Actions: visible on desktop hover OR mobile toggle */}
          <div className={clsx(
            "flex items-center gap-1 transition-opacity",
            mobileActionsOpen
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
          )}>
          {/* Edit */}
          <RcButton
            variant="outline"
            size="icon"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              router.push(`/decks/editor-3d?id=${encodeURIComponent(deck.id)}`);
            }}
            className={ROW_ACTION}
            aria-label="Edit"
            title="Edit Deck"
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
          >
            <span className="font-rc-mono text-[10px] leading-none tracking-[0.08em]">
              TTS
            </span>
          </RcButton>

          {/* Quick Export (simple list) */}
          <RcButton
            variant="outline"
            size="icon"
            className={ROW_ACTION}
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
          >
            <List className="h-3.5 w-3.5" />
          </RcButton>

          {/* Full Export */}
          <RcButton
            variant="outline"
            size="icon"
            className={ROW_ACTION}
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
          >
            <FileText className="h-3.5 w-3.5" />
          </RcButton>

          {/* Toggle Public/Private */}
          {isOwner && (
            <RcButton
              variant="outline"
              size="icon"
              className={clsx(
                ROW_ACTION,
                effectiveIsPublic &&
                  "border-rc-success/40 bg-rc-success/15 text-rc-success-ink"
              )}
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
            >
              {effectiveIsPublic ? (
                <Globe className="h-3.5 w-3.5" />
              ) : (
                <Lock className="h-3.5 w-3.5" />
              )}
            </RcButton>
          )}

          {/* Sync from Curiosa */}
          {isOwner && deck.curiosaSourceId && (
            <RcButton
              variant="outline"
              size="icon"
              className={ROW_ACTION}
              onClick={handleSync}
              disabled={syncing}
              aria-label="Sync from Sorcerytcg"
              title="Reload deck from Sorcerytcg"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
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
              title="Delete deck"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </RcButton>
          )}
          </div>
        </div>
      </Link>
    );
  }

  // Grid view - card with full hover overlay
  return (
    <Link
      href={`/decks/editor-3d?id=${encodeURIComponent(deck.id)}`}
      className="group relative block rounded-rc-md border border-rc-line/12 bg-black/30 p-3 transition-colors hover:border-rc-accent/30 hover:bg-rc-accent/6"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="line-clamp-1 pr-8 font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
            {deck.name}
          </div>
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">{tags}</div>
          )}
          <div className="rc-hint mt-2">
            {deck.userName && <span>by {deck.userName} · </span>}
            Updated {updatedStr}
          </div>
        </div>
        {avatarPreview}
      </div>

      {/* Mobile: always-visible more button for grid */}
      <RcButton
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMobileActionsOpen((prev) => !prev);
        }}
        className="absolute top-2 right-2 z-20 h-8 w-8 bg-black/50 text-rc-fg-muted hover:text-rc-accent-ring md:hidden"
        aria-label="More actions"
        title="More actions"
      >
        <MoreVertical className="h-4 w-4" />
      </RcButton>

      {/* Full card overlay with action buttons */}
      <div
        ref={variant === "grid" ? mobileActionsRef : undefined}
        className={clsx(
          "absolute inset-0 z-10 flex flex-wrap items-center justify-center gap-3 rounded-rc-md bg-[rgba(6,10,20,0.86)] transition-opacity",
          mobileActionsOpen
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto"
        )}>
        {copiedMsg && (
          <div
            className="absolute top-2 left-2 rounded-rc-sm border border-rc-line/22 bg-black/90 px-2 py-1 font-rc-mono text-[11px] text-rc-fg-strong"
            aria-live="polite"
          >
            {copiedMsg}
          </div>
        )}

        {/* Edit Deck - prominent button */}
        <RcButton
          variant="outline"
          className="bg-black/35"
          aria-label="Edit Deck"
          data-tooltip="Edit Deck"
          onClick={(e: MouseEvent<HTMLButtonElement>) => {
            e.preventDefault();
            e.stopPropagation();
            router.push(`/decks/editor-3d?id=${encodeURIComponent(deck.id)}`);
          }}
        >
          <Pencil className="h-4 w-4" />
          <span>Edit</span>
        </RcButton>

        {/* TTS Export (for Tabletop Simulator) - downloads JSON file */}
        <RcButton
          variant="outline"
          size="icon"
          className="bg-black/35"
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
        >
          <span className="font-rc-mono text-xs tracking-[0.08em]">TTS</span>
        </RcButton>

        {/* Quick Export (simple list) */}
        <RcButton
          variant="outline"
          size="icon"
          className="bg-black/35"
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
        >
          <List className="h-5 w-5" />
        </RcButton>

        {/* Export Deck (Sorcery text format) */}
        <RcButton
          variant="outline"
          size="icon"
          className="bg-black/35"
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
        >
          <FileText className="h-5 w-5" />
        </RcButton>

        {isOwner && (
          <RcButton
            variant="outline"
            size="icon"
            className={clsx(
              "bg-black/35",
              effectiveIsPublic &&
                "border-rc-success/40 bg-rc-success/15 text-rc-success-ink"
            )}
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
          >
            {effectiveIsPublic ? (
              <Globe className="h-5 w-5" />
            ) : (
              <Lock className="h-5 w-5" />
            )}
          </RcButton>
        )}

        {/* Sync from Curiosa */}
        {isOwner && deck.curiosaSourceId && (
          <RcButton
            variant="outline"
            size="icon"
            className="bg-black/35"
            aria-label="Sync from Sorcerytcg"
            data-tooltip="Reload from Sorcerytcg"
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw className={`h-5 w-5 ${syncing ? "animate-spin" : ""}`} />
          </RcButton>
        )}

        {isOwner && (
          <RcButton
            variant="danger-soft"
            size="icon"
            aria-label="Delete deck"
            data-tooltip="Delete"
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
