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
  };
};

export default function DeckItem({ deck }: DeckItemProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

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
      href={`/decks/editor?id=${encodeURIComponent(deck.id)}`}
      className="border rounded p-3 hover:bg-muted/60 relative group block"
    >
      <div className="font-medium line-clamp-1 pr-8">{deck.name}</div>
      <div className="opacity-80">{deck.format}</div>
      <div className="opacity-70 text-xs mt-1">Updated {updatedStr}</div>

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
    </Link>
  );
}
