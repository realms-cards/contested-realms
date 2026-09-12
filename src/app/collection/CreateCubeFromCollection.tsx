"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { RcButton } from "@/components/ui/rc-button";
import { RcDialog } from "@/components/ui/rc-dialog";

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
      <RcButton
        variant="outline"
        size="sm"
        onClick={handleOpen}
        title="Create or update a cube from your collection"
      >
        Cube
      </RcButton>

      {isOpen && (
        <RcDialog
          title="Collection → Cube"
          eyebrow="collection"
          onClose={handleClose}
          size="sm"
        >
          {/* Mode toggle */}
          <div className="rc-segment">
            <button
              type="button"
              aria-pressed={mode === "create"}
              onClick={() => setMode("create")}
            >
              Create New
            </button>
            <button
              type="button"
              aria-pressed={mode === "update"}
              onClick={() => setMode("update")}
            >
              Update Existing
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {mode === "create" ? (
              <>
                <p className="text-sm text-rc-fg-muted">
                  Create a new cube containing all cards from your collection.
                </p>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Cube name (e.g. My Collection Cube)"
                  className="rc-input h-10 w-full"
                />
                <RcButton
                  className="w-full"
                  onClick={handleCreate}
                  disabled={loading || !name.trim()}
                >
                  {loading ? "Creating..." : "Create Cube from Collection"}
                </RcButton>
              </>
            ) : (
              <>
                <p className="text-sm text-rc-fg-muted">
                  Replace an existing cube&apos;s cards with your current
                  collection.
                </p>
                {existingCubes.length === 0 ? (
                  <div className="rc-alert" data-tone="warning">
                    No cubes found. Create one first!
                  </div>
                ) : (
                  <>
                    <CustomSelect
                      value={selectedCubeId ? String(selectedCubeId) : ""}
                      onChange={(v) => setSelectedCubeId(v ? Number(v) : null)}
                      placeholder="Select a cube..."
                      className="w-full"
                      options={existingCubes.map((cube) => ({
                        value: String(cube.id),
                        label: `${cube.name} (${cube.cardCount} cards)`,
                      }))}
                    />
                    <RcButton
                      className="w-full"
                      onClick={handleUpdate}
                      disabled={loading || !selectedCubeId}
                    >
                      {loading ? "Updating..." : "Update Cube with Collection"}
                    </RcButton>
                  </>
                )}
              </>
            )}

            {result && (
              <div
                className="rc-alert"
                data-tone={result.type === "success" ? "success" : "danger"}
              >
                {result.message}
              </div>
            )}
          </div>
        </RcDialog>
      )}
    </>
  );
}
