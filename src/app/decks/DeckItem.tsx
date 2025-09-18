"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";

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
  };
};

export default function DeckItem({ deck }: DeckItemProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [updatingPublic, setUpdatingPublic] = useState(false);
  const [isPublic, setIsPublic] = useState<boolean>(Boolean(deck.isPublic));

  async function onDelete(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (deleting) return;
    const ok = window.confirm(`Delete deck "${deck.name}"? This cannot be undone.`);
    if (!ok) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/decks/${encodeURIComponent(deck.id)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || "Failed to delete deck");
      }
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  const updatedStr = new Date(deck.updatedAt).toLocaleString();

  return (
    <Link
      href={`/decks/editor-3d?id=${encodeURIComponent(deck.id)}`}
      className="border rounded p-3 hover:bg-muted/60 relative group block"
    >
      <div className="font-medium line-clamp-1 pr-8">{deck.name}</div>
      <div className="flex items-center gap-2 opacity-80">
        <span>{deck.format}</span>
        {isPublic !== undefined && (
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            isPublic ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
          }`}>
            {isPublic ? 'Public' : 'Private'}
          </span>
        )}
        {deck.imported && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">Imported</span>
        )}
      </div>
      <div className="opacity-70 text-xs mt-1">
        {deck.userName && <span>by {deck.userName} • </span>}
        Updated {updatedStr}
      </div>

      {deck.isOwner !== false && (
        <button
          aria-label="Toggle public/private"
          title={isPublic ? "Make Private" : "Make Public"}
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (updatingPublic) return;
            try {
              setUpdatingPublic(true);
              const res = await fetch(`/api/decks/${encodeURIComponent(deck.id)}`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ isPublic: !isPublic }),
              });
              if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const msg = (data && data.error) || "Failed to update deck visibility";
                throw new Error(typeof msg === "string" ? msg : "Failed to update deck visibility");
              }
              setIsPublic((prev) => !prev);
              try { window.dispatchEvent(new Event("decks:refresh")); } catch {}
              router.refresh();
            } catch (err) {
              alert(err instanceof Error ? err.message : String(err));
            } finally {
              setUpdatingPublic(false);
            }
          }}
          disabled={updatingPublic}
          className={`absolute top-2 right-12 inline-flex items-center justify-center h-8 w-8 rounded ring-1 transition-opacity ${
            isPublic
              ? 'text-green-400 ring-green-500/30 hover:bg-green-500/20'
              : 'text-gray-400 ring-zinc-600 hover:bg-zinc-700/40'
          } opacity-0 group-hover:opacity-100`}
        >
          {/* Lock/Open icon */}
          {isPublic ? (
            // Unlocked icon
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M6 10.5A3.5 3.5 0 0 1 9.5 7h.25A2.75 2.75 0 0 1 12.5 4.25V4a3.5 3.5 0 1 1 7 0v2h-1.5V4a2 2 0 1 0-4 0v.25A4.25 4.25 0 0 1 9.75 8.5H9.5A2 2 0 0 0 7.5 10.5V12H18a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h.5Z" />
            </svg>
          ) : (
            // Locked icon
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M12 1.5a4.5 4.5 0 0 0-4.5 4.5V9h-1A2.5 2.5 0 0 0 4 11.5v7A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-7A2.5 2.5 0 0 0 17.5 9h-1V6A4.5 4.5 0 0 0 12 1.5ZM9 9V6a3 3 0 1 1 6 0v3H9Z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      )}

      {deck.isOwner !== false && (
        <button
          aria-label="Delete deck"
          title="Delete deck"
          onClick={onDelete}
          disabled={deleting}
          className="absolute top-2 right-2 inline-flex items-center justify-center h-8 w-8 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 ring-1 ring-transparent hover:ring-red-500/30 opacity-0 group-hover:opacity-100 transition-opacity"
        >
        {/* Trash icon */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <path fillRule="evenodd" d="M9 3.75A2.25 2.25 0 0 1 11.25 1.5h1.5A2.25 2.25 0 0 1 15 3.75V4.5h3.75a.75.75 0 0 1 0 1.5h-.51l-1.093 13.12A3.75 3.75 0 0 1 13.41 22.5H10.59a3.75 3.75 0 0 1-3.936-3.38L5.56 6H5.25a.75.75 0 0 1 0-1.5H9V3.75Zm1.5.75h3V3.75a.75.75 0 0 0-.75-.75h-1.5a.75.75 0 0 0-.75.75V4.5Zm-3.978 1.5 1.08 12.97A2.25 2.25 0 0 0 10.59 21h2.82a2.25 2.25 0 0 0 2.988-2.03L17.478 6H6.522Z" clipRule="evenodd" />
          <path d="M9.75 9.75a.75.75 0 0 1 .75.75v6a.75.75 0 0 1-1.5 0v-6a.75.75 0 0 1 .75-.75Zm4.5 0a.75.75 0 0 1 .75.75v6a.75.75 0 0 1-1.5 0v-6a.75.75 0 0 1 .75-.75Z" />
        </svg>
        </button>
      )}
    </Link>
  );
}
