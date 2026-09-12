"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PanelHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";
import { RcDialog } from "@/components/ui/rc-dialog";
import { RcEmpty } from "@/components/ui/rc-empty";

interface CardList {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  isOwner: boolean;
  cardCount: number;
  previewCard: { name: string; slug?: string } | null;
  ownerName: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function ListsPage() {
  const router = useRouter();
  const [lists, setLists] = useState<CardList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [includePublic, setIncludePublic] = useState(false);

  const fetchLists = useCallback(async () => {
    try {
      setLoading(true);
      const url = includePublic
        ? "/api/lists?includePublic=true"
        : "/api/lists";
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load lists");
      }
      const data = await res.json();
      setLists(data.lists);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load lists");
    } finally {
      setLoading(false);
    }
  }, [includePublic]);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete list "${name}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/lists/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete");
      }
      setLists((prev) => prev.filter((l) => l.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete list");
    }
  };

  const handleTogglePublic = async (list: CardList) => {
    try {
      const res = await fetch(`/api/lists/${list.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !list.isPublic }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update");
      }
      setLists((prev) =>
        prev.map((l) =>
          l.id === list.id ? { ...l, isPublic: !l.isPublic } : l
        )
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update list");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <section className="rc-panel">
          <PanelHeader title="Card Lists" />
          <div className="rc-hint px-[18px] py-6 text-center">loading…</div>
        </section>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-rc-md border border-rc-line/12 bg-black/30"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rc-panel">
        <PanelHeader
          title="Card Lists"
          meta={`${lists.length} ${lists.length === 1 ? "list" : "lists"}`}
        >
          <label className="rc-check">
            <input
              type="checkbox"
              checked={includePublic}
              onChange={(e) => setIncludePublic(e.target.checked)}
            />
            Show public lists
          </label>
          <RcButton variant="outline" onClick={() => setShowImportModal(true)}>
            Import
          </RcButton>
          <RcButton onClick={() => setShowCreateModal(true)}>New List</RcButton>
        </PanelHeader>
        <p className="m-0 max-w-[68ch] px-[18px] py-3.5 text-sm leading-relaxed text-rc-fg-muted">
          Create wishlists, trade binders, want-to-buy lists, and more.
        </p>
      </section>

      {error && (
        <div className="rc-alert" data-tone="danger">
          {error}
          <button type="button" onClick={fetchLists} className="rc-link ml-4">
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {lists.length === 0 && !error && (
        <RcEmpty
          title="No lists yet."
          action={
            <>
              <RcButton onClick={() => setShowCreateModal(true)}>
                Create Your First List
              </RcButton>
              <RcButton
                variant="outline"
                onClick={() => setShowImportModal(true)}
              >
                Import from Text
              </RcButton>
            </>
          }
        >
          wishlists, trade binders, cards to buy, themed collections
        </RcEmpty>
      )}

      {/* Lists Grid */}
      {lists.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <div
              key={list.id}
              className="group overflow-hidden rounded-rc-md border border-rc-line/12 bg-black/30 transition-colors hover:border-rc-accent/40"
            >
              {/* Preview Image */}
              <div
                className="relative h-24 cursor-pointer bg-black/45"
                onClick={() => router.push(`/collection/lists/${list.id}`)}
              >
                {list.previewCard?.slug && (
                  <Image
                    src={`/api/images/${list.previewCard.slug}`}
                    alt={list.previewCard.name}
                    fill
                    className="object-cover opacity-50 transition-opacity group-hover:opacity-70"
                    sizes="(max-width: 768px) 100vw, 33vw"
                    unoptimized
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[rgba(7,10,20,0.95)] to-transparent" />
                <div className="absolute bottom-2 left-3 right-3">
                  <h3
                    className="m-0 truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong"
                    title={list.name}
                  >
                    {list.name}
                  </h3>
                </div>
              </div>

              {/* Content */}
              <div className="space-y-2 p-3">
                {list.description && (
                  <p className="m-0 line-clamp-2 text-sm text-rc-fg-muted">
                    {list.description}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rc-hint">
                    <span className="rc-stat">{list.cardCount}</span> card
                    {list.cardCount !== 1 ? "s" : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    {list.isPublic && <Badge tone="ok">Public</Badge>}
                    {!list.isOwner && list.ownerName && (
                      <span className="rc-hint">by {list.ownerName}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {list.isOwner && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-rc-line/8 pt-2">
                    <RcButton
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() =>
                        router.push(`/collection/lists/${list.id}`)
                      }
                    >
                      View
                    </RcButton>
                    <RcButton
                      variant="outline"
                      size="sm"
                      onClick={() => handleTogglePublic(list)}
                      title={list.isPublic ? "Make private" : "Make public"}
                    >
                      {list.isPublic ? "Make private" : "Make public"}
                    </RcButton>
                    <RcButton
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        window.open(
                          `/api/lists/${list.id}/export?format=text`,
                          "_blank"
                        )
                      }
                      title="Export"
                    >
                      Export
                    </RcButton>
                    <RcButton
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(list.id, list.name)}
                      title="Delete"
                    >
                      Delete
                    </RcButton>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateListModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(newList) => {
            setLists((prev) => [newList, ...prev]);
            setShowCreateModal(false);
          }}
        />
      )}

      {/* Import Modal */}
      {showImportModal && (
        <ImportListModal
          onClose={() => setShowImportModal(false)}
          onImported={(newList) => {
            setLists((prev) => [newList, ...prev]);
            setShowImportModal(false);
          }}
        />
      )}
    </div>
  );
}

// Create List Modal
function CreateListModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (list: CardList) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          isPublic,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create list");
      }

      const data = await res.json();
      onCreated({
        ...data,
        cardCount: 0,
        previewCard: null,
        isOwner: true,
        ownerName: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create list");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RcDialog
      title="Create New List"
      eyebrow="card lists"
      onClose={onClose}
      size="sm"
      actions={
        <>
          <RcButton variant="outline" onClick={onClose}>
            Cancel
          </RcButton>
          <RcButton
            type="submit"
            form="create-list-form"
            disabled={submitting || !name.trim()}
          >
            {submitting ? "Creating..." : "Create List"}
          </RcButton>
        </>
      }
    >
      <form id="create-list-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="rc-eyebrow mb-1 block">Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Wishlist"
            className="rc-input h-10 w-full"
            maxLength={100}
            required
          />
        </div>

        <div>
          <label className="rc-eyebrow mb-1 block">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Cards I want to get..."
            className="rc-textarea h-20 w-full resize-none"
          />
        </div>

        <label className="rc-check">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
          Make this list public
        </label>

        {error && (
          <div className="rc-alert" data-tone="danger">
            {error}
          </div>
        )}
      </form>
    </RcDialog>
  );
}

// Import List Modal
function ImportListModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (list: CardList) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [text, setText] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    added: number;
    notFound: string[];
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !text.trim()) return;

    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/lists/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          isPublic,
          text: text.trim(),
          format: "text",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to import list");
      }

      const data = await res.json();
      setResult({ added: data.added, notFound: data.notFound });

      // If successful, call onImported after a short delay to show results
      setTimeout(() => {
        onImported({
          id: data.id,
          name: data.name,
          description: description.trim() || null,
          isPublic,
          isOwner: true,
          cardCount: data.added,
          previewCard: null,
          ownerName: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import list");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RcDialog
      title="Import List from Text"
      eyebrow="card lists"
      onClose={onClose}
      size="md"
      actions={
        <>
          <RcButton variant="outline" onClick={onClose}>
            {result ? "Close" : "Cancel"}
          </RcButton>
          {!result && (
            <RcButton
              type="submit"
              form="import-list-form"
              disabled={submitting || !name.trim() || !text.trim()}
            >
              {submitting ? "Importing..." : "Import List"}
            </RcButton>
          )}
        </>
      }
    >
      <form id="import-list-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="rc-eyebrow mb-1 block">List Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Imported Wishlist"
            className="rc-input h-10 w-full"
            maxLength={100}
            required
          />
        </div>

        <div>
          <label className="rc-eyebrow mb-1 block">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            className="rc-input h-10 w-full"
          />
        </div>

        <div>
          <label className="rc-eyebrow mb-1 block">Card List *</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Enter cards, one per line:\n4 Lightning Bolt\n2x Fireball\nBlack Lotus`}
            className="rc-textarea h-48 w-full resize-none"
            required
          />
          <p className="m-0 mt-1 rc-hint">
            format: &quot;quantity card name&quot; or just &quot;card
            name&quot; per line
          </p>
        </div>

        <label className="rc-check">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
          Make this list public
        </label>

        {error && (
          <div className="rc-alert" data-tone="danger">
            {error}
          </div>
        )}

        {result && (
          <div className="rc-alert" data-tone="success">
            <p className="m-0">Added {result.added} cards</p>
            {result.notFound.length > 0 && (
              <div className="mt-2">
                <p className="m-0">Not found ({result.notFound.length}):</p>
                <p className="m-0 mt-1 text-[11px] tracking-[0.1em]">
                  {result.notFound.slice(0, 10).join(", ")}
                  {result.notFound.length > 10 &&
                    ` +${result.notFound.length - 10} more`}
                </p>
              </div>
            )}
          </div>
        )}
      </form>
    </RcDialog>
  );
}
