"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";

interface CreateCubeFromCollectionProps {
  onClose?: () => void;
}

export default function CreateCubeFromCollection({
  onClose,
}: CreateCubeFromCollectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"create" | "update">("create");
  const [existingCubes, setExistingCubes] = useState<
    Array<{ id: number; name: string; cardCount: number }>
  >([]);
  const [selectedCubeId, setSelectedCubeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const router = useRouter();

  const handleOpen = async () => {
    setIsOpen(true);
    setResult(null);
    // Fetch existing cubes
    try {
      const res = await fetch("/api/cubes");
      if (res.ok) {
        const data = await res.json();
        const cubes = Array.isArray(data)
          ? data
          : Array.isArray(data.myCubes)
          ? data.myCubes
          : [];
        setExistingCubes(
          cubes.map((c: { id: number; name: string; cardCount?: number }) => ({
            id: c.id,
            name: c.name,
            cardCount: c.cardCount || 0,
          }))
        );
      }
    } catch {
      // Ignore errors
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      // First, export collection as text
      const exportRes = await fetch("/api/collection/export?format=text");
      if (!exportRes.ok) throw new Error("Failed to export collection");
      const collectionText = await exportRes.text();

      if (!collectionText.trim()) {
        throw new Error("Your collection is empty");
      }

      // Create cube via import API
      const res = await fetch("/api/cubes/import/text", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: collectionText,
          name: name.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create cube");

      setResult({
        type: "success",
        message: `Created cube "${name}" with ${data.cardCount || 0} cards!`,
      });

      // Redirect to cubes page after a short delay
      setTimeout(() => {
        router.push("/cubes");
        window.dispatchEvent(new Event("cubes:refresh"));
      }, 1500);
    } catch (e) {
      setResult({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to create cube",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedCubeId) return;
    setLoading(true);
    setResult(null);

    try {
      // Export collection
      const exportRes = await fetch("/api/collection/export?format=json");
      if (!exportRes.ok) throw new Error("Failed to export collection");
      const collectionData = await exportRes.json();

      // Transform to cube card format
      const cards = collectionData.map(
        (c: { cardName: string; quantity: number }) => ({
          name: c.cardName,
          count: c.quantity,
        })
      );

      // Update cube via PATCH
      const res = await fetch(`/api/cubes/${selectedCubeId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cards,
          replaceCards: true, // Replace all cards
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update cube");

      const cubeName =
        existingCubes.find((c) => c.id === selectedCubeId)?.name || "Cube";
      setResult({
        type: "success",
        message: `Updated "${cubeName}" with collection cards!`,
      });

      setTimeout(() => {
        router.push("/cubes");
        window.dispatchEvent(new Event("cubes:refresh"));
      }, 1500);
    } catch (e) {
      setResult({
        type: "error",
        message: e instanceof Error ? e.message : "Failed to update cube",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-400 hover:text-purple-300 hover:bg-gray-800 transition-colors"
        title="Create or update a cube from your collection"
      >
        <span>🎲</span>
        <span className="hidden sm:inline">Cube</span>
      </button>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4"
            onClick={handleClose}
          >
            <div
              className="bg-gray-900 rounded-xl max-w-md w-full overflow-hidden shadow-2xl border border-gray-700"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-lg font-bold">Collection → Cube</h3>
                <button
                  onClick={handleClose}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Mode toggle */}
              <div className="flex border-b border-gray-800">
                <button
                  onClick={() => setMode("create")}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    mode === "create"
                      ? "bg-gray-800 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Create New
                </button>
                <button
                  onClick={() => setMode("update")}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    mode === "update"
                      ? "bg-gray-800 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Update Existing
                </button>
              </div>

              <div className="p-4 space-y-4">
                {mode === "create" ? (
                  <>
                    <p className="text-sm text-gray-400">
                      Create a new cube containing all cards from your
                      collection.
                    </p>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Cube name (e.g. My Collection Cube)"
                      className="w-full bg-gray-800 rounded px-3 py-2 text-sm"
                    />
                    <button
                      onClick={handleCreate}
                      disabled={loading || !name.trim()}
                      className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded font-medium disabled:opacity-50"
                    >
                      {loading ? "Creating..." : "Create Cube from Collection"}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-400">
                      Replace an existing cube&apos;s cards with your current
                      collection.
                    </p>
                    {existingCubes.length === 0 ? (
                      <p className="text-sm text-yellow-400">
                        No cubes found. Create one first!
                      </p>
                    ) : (
                      <>
                        <select
                          value={selectedCubeId || ""}
                          onChange={(e) =>
                            setSelectedCubeId(
                              e.target.value ? Number(e.target.value) : null
                            )
                          }
                          className="w-full bg-gray-800 rounded px-3 py-2 text-sm"
                        >
                          <option value="">Select a cube...</option>
                          {existingCubes.map((cube) => (
                            <option key={cube.id} value={cube.id}>
                              {cube.name} ({cube.cardCount} cards)
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={handleUpdate}
                          disabled={loading || !selectedCubeId}
                          className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded font-medium disabled:opacity-50"
                        >
                          {loading
                            ? "Updating..."
                            : "Update Cube with Collection"}
                        </button>
                      </>
                    )}
                  </>
                )}

                {result && (
                  <div
                    className={`text-sm px-3 py-2 rounded ${
                      result.type === "success"
                        ? "bg-green-900/30 text-green-400"
                        : "bg-red-900/30 text-red-400"
                    }`}
                  >
                    {result.message}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
