"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

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
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Card Lists</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-gray-800 rounded-lg p-4 h-32 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold">Card Lists</h2>
          <p className="text-sm text-gray-400">
            Create wishlists, trade binders, want-to-buy lists, and more
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={includePublic}
              onChange={(e) => setIncludePublic(e.target.checked)}
              className="rounded border-gray-600"
            />
            Show public lists
          </label>
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
          >
            📥 Import
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
          >
            + New List
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 text-center">
          {error}
          <button onClick={fetchLists} className="ml-4 underline">
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {lists.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 gap-6 text-center">
          <div className="text-6xl">📋</div>
          <h3 className="text-2xl font-bold">No Lists Yet</h3>
          <p className="text-gray-400 max-w-md">
            Create lists to organize cards however you like - wishlists, trade
            binders, cards to buy, or themed collections.
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
            >
              Create Your First List
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
            >
              Import from Text
            </button>
          </div>
        </div>
      )}

      {/* Lists Grid */}
      {lists.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {lists.map((list) => (
            <div
              key={list.id}
              className="bg-gray-800 rounded-lg overflow-hidden hover:bg-gray-750 transition-colors group"
            >
              {/* Preview Image */}
              <div
                className="h-24 bg-gray-700 relative cursor-pointer"
                onClick={() => router.push(`/collection/lists/${list.id}`)}
              >
                {list.previewCard?.slug && (
                  <Image
                    src={`/api/images/${list.previewCard.slug}`}
                    alt={list.previewCard.name}
                    fill
                    className="object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                    sizes="(max-width: 768px) 100vw, 33vw"
                    unoptimized
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-gray-800 to-transparent" />
                <div className="absolute bottom-2 left-3 right-3">
                  <h3 className="font-bold text-lg truncate">{list.name}</h3>
                </div>
              </div>

              {/* Content */}
              <div className="p-3 space-y-2">
                {list.description && (
                  <p className="text-sm text-gray-400 line-clamp-2">
                    {list.description}
                  </p>
                )}

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">
                    {list.cardCount} card{list.cardCount !== 1 ? "s" : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    {list.isPublic && (
                      <span className="px-2 py-0.5 bg-green-600/20 text-green-400 rounded text-xs">
                        Public
                      </span>
                    )}
                    {!list.isOwner && list.ownerName && (
                      <span className="text-xs text-gray-500">
                        by {list.ownerName}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {list.isOwner && (
                  <div className="flex items-center gap-2 pt-2 border-t border-gray-700">
                    <button
                      onClick={() =>
                        router.push(`/collection/lists/${list.id}`)
                      }
                      className="flex-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleTogglePublic(list)}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                      title={list.isPublic ? "Make private" : "Make public"}
                    >
                      {list.isPublic ? "🔓" : "🔒"}
                    </button>
                    <button
                      onClick={() =>
                        window.open(
                          `/api/lists/${list.id}/export?format=text`,
                          "_blank"
                        )
                      }
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm transition-colors"
                      title="Export"
                    >
                      📤
                    </button>
                    <button
                      onClick={() => handleDelete(list.id, list.name)}
                      className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded text-sm transition-colors"
                      title="Delete"
                    >
                      🗑️
                    </button>
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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">Create New List</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Wishlist"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={100}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Cards I want to get..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 h-20 resize-none"
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="rounded border-gray-600"
            />
            <span className="text-sm">Make this list public</span>
          </label>

          {error && <div className="text-red-400 text-sm">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create List"}
            </button>
          </div>
        </form>
      </div>
    </div>
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
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Import List from Text</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              List Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Imported Wishlist"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={100}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Card List *
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Enter cards, one per line:\n4 Lightning Bolt\n2x Fireball\nBlack Lotus`}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 h-48 resize-none font-mono text-sm"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Format: &quot;quantity card name&quot; or just &quot;card
              name&quot; per line
            </p>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              className="rounded border-gray-600"
            />
            <span className="text-sm">Make this list public</span>
          </label>

          {error && <div className="text-red-400 text-sm">{error}</div>}

          {result && (
            <div className="bg-gray-800 rounded-lg p-3 text-sm">
              <p className="text-green-400">✓ Added {result.added} cards</p>
              {result.notFound.length > 0 && (
                <div className="mt-2">
                  <p className="text-yellow-400">
                    ⚠ Not found ({result.notFound.length}):
                  </p>
                  <p className="text-gray-400 text-xs mt-1">
                    {result.notFound.slice(0, 10).join(", ")}
                    {result.notFound.length > 10 &&
                      ` +${result.notFound.length - 10} more`}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              {result ? "Close" : "Cancel"}
            </button>
            {!result && (
              <button
                type="submit"
                disabled={submitting || !name.trim() || !text.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {submitting ? "Importing..." : "Import List"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
