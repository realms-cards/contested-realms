"use client";

import clsx from "clsx";
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
    userName?: string; // For public decks from other users
    isOwner?: boolean; // Whether current user owns this deck
    avatarState: "none" | "single" | "multiple";
    avatarCard?: { name: string; slug: string | null } | null;
  };
  onDelete?: (deckId: string) => void; // Optimistic delete callback
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

export default function DeckItem({ deck, onDelete }: DeckItemProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [updatingPublic, setUpdatingPublic] = useState(false);
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
    } else if (deck.avatarState === "none") {
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
    deck.isPublic,
    effectiveIsPublic,
    formatLabel,
    isOwner,
  ]);

  const avatarPreview = useMemo(() => {
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
  }, [deck.avatarCard, deck.avatarState]);

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

      {copiedMsg && (
        <div
          className="absolute top-2 left-2 z-10 rounded bg-black/80 text-white text-xs px-2 py-1 ring-1 ring-white/20"
          aria-live="polite"
        >
          {copiedMsg}
        </div>
      )}

      {/* Export Deck (Sorcery text format) */}
      <button
        aria-label="Export Deck"
        title="Export Deck"
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
              const t = typeof o.type === "string" ? o.type.toLowerCase() : "";
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
            await navigator.clipboard.writeText(text);
            setCopiedMsg("Copied deck");
            setTimeout(() => setCopiedMsg(null), 1200);
          } catch (err) {
            alert(err instanceof Error ? err.message : String(err));
          } finally {
            setExportingText(false);
          }
        }}
        disabled={exportingText}
        className="absolute top-2 right-20 inline-flex items-center justify-center h-8 w-8 rounded ring-1 ring-zinc-600 hover:bg-zinc-700/40 text-zinc-300 hover:text-zinc-100 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {/* Document icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-5 w-5"
        >
          <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6zm8 1.5V8h4.5" />
        </svg>
      </button>

      {isOwner && (
        <button
          aria-label="Toggle public/private"
          title={effectiveIsPublic ? "Make Private" : "Make Public"}
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
          className={`absolute top-2 right-12 inline-flex items-center justify-center h-8 w-8 rounded ring-1 transition-opacity ${
            effectiveIsPublic
              ? "text-green-400 ring-green-500/30 hover:bg-green-500/20"
              : "text-gray-400 ring-zinc-600 hover:bg-zinc-700/40"
          } opacity-0 group-hover:opacity-100`}
        >
          {/* Lock/Open icon */}
          {effectiveIsPublic ? (
            // Unlocked icon
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path d="M6 10.5A3.5 3.5 0 0 1 9.5 7h.25A2.75 2.75 0 0 1 12.5 4.25V4a3.5 3.5 0 1 1 7 0v2h-1.5V4a2 2 0 1 0-4 0v.25A4.25 4.25 0 0 1 9.75 8.5H9.5A2 2 0 0 0 7.5 10.5V12H18a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h.5Z" />
            </svg>
          ) : (
            // Locked icon
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path
                fillRule="evenodd"
                d="M12 1.5a4.5 4.5 0 0 0-4.5 4.5V9h-1A2.5 2.5 0 0 0 4 11.5v7A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-7A2.5 2.5 0 0 0 17.5 9h-1V6A4.5 4.5 0 0 0 12 1.5ZM9 9V6a3 3 0 1 1 6 0v3H9Z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </button>
      )}

      {isOwner && (
        <button
          aria-label="Delete deck"
          title="Delete deck"
          onClick={handleDelete}
          disabled={deleting}
          className="absolute top-2 right-2 inline-flex items-center justify-center h-8 w-8 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 ring-1 ring-transparent hover:ring-red-500/30 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {/* Trash icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path
              fillRule="evenodd"
              d="M9 3.75A2.25 2.25 0 0 1 11.25 1.5h1.5A2.25 2.25 0 0 1 15 3.75V4.5h3.75a.75.75 0 0 1 0 1.5h-.51l-1.093 13.12A3.75 3.75 0 0 1 13.41 22.5H10.59a3.75 3.75 0 0 1-3.936-3.38L5.56 6H5.25a.75.75 0 0 1 0-1.5H9V3.75Zm1.5.75h3V3.75a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0-.75.75V4.5Zm-3.978 1.5 1.08 12.97A2.25 2.25 0 0 0 10.59 21h2.82a2.25 2.25 0 0 0 2.988-2.03L17.478 6H6.522Z"
              clipRule="evenodd"
            />
            <path d="M9.75 9.75a.75.75 0 0 1 .75.75v6a.75.75 0 0 1-1.5 0v-6a.75.75 0 0 1 .75-.75Zm4.5 0a.75.75 0 0 1 .75.75v6a.75.75 0 0 1-1.5 0v-6a.75.75 0 0 1 .75-.75Z" />
          </svg>
        </button>
      )}
    </Link>
  );
}
