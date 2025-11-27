"use client";

import type { Finish } from "@prisma/client";
import Image from "next/image";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";

interface CardData {
  id: number;
  name: string;
  variant?: {
    id: number;
    slug: string;
    setName: string;
  };
  meta?: {
    type?: string;
  };
}

interface AddCardModalProps {
  card: CardData;
  onClose: () => void;
  onAdded: () => void;
}

export default function AddCardModal({
  card,
  onClose,
  onAdded,
}: AddCardModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [finish, setFinish] = useState<Finish>("Standard");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imageSlug =
    card.variant?.slug || `${card.name.toLowerCase().replace(/\s+/g, "_")}_b_s`;

  const handleAdd = async () => {
    setSaving(true);
    setError(null);

    // Close modal immediately for optimistic UX
    onAdded();

    // Fire API call without blocking
    fetch("/api/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cards: [
          {
            cardId: card.id,
            variantId: card.variant?.id || null,
            finish,
            quantity,
          },
        ],
      }),
    })
      .then((res) => {
        if (!res.ok) {
          res.json().then((data) => {
            console.error("Failed to add card:", data.error);
          });
        }
      })
      .catch((e) => {
        console.error("Failed to add card:", e);
      });
  };

  return (
    <Modal onClose={onClose}>
      <div className="bg-gray-900 rounded-xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-lg font-bold">Add to Collection</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Card Preview */}
          <div className="flex gap-4">
            {(() => {
              const isSite = card.meta?.type?.toLowerCase().includes("site");
              return (
                <div
                  className={`relative rounded overflow-hidden flex-shrink-0 ${
                    isSite ? "w-32 aspect-[3.5/2.5]" : "w-24 aspect-[2.5/3.5]"
                  }`}
                >
                  <Image
                    src={`/api/images/${imageSlug}`}
                    alt={card.name}
                    fill
                    className={
                      isSite ? "object-contain rotate-90" : "object-cover"
                    }
                  />
                </div>
              );
            })()}
            <div>
              <div className="font-bold text-lg">{card.name}</div>
              <div className="text-gray-400 text-sm">
                {card.variant?.setName || "Unknown Set"}
              </div>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Quantity</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className="w-10 h-10 bg-gray-800 hover:bg-gray-700 rounded-lg font-bold text-xl disabled:opacity-50"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={99}
                value={quantity}
                onChange={(e) =>
                  setQuantity(
                    Math.min(99, Math.max(1, parseInt(e.target.value) || 1))
                  )
                }
                className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-center"
              />
              <button
                onClick={() => setQuantity((q) => Math.min(99, q + 1))}
                disabled={quantity >= 99}
                className="w-10 h-10 bg-gray-800 hover:bg-gray-700 rounded-lg font-bold text-xl disabled:opacity-50"
              >
                +
              </button>
            </div>
          </div>

          {/* Finish */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Finish</label>
            <div className="flex gap-2">
              <button
                onClick={() => setFinish("Standard")}
                className={`flex-1 py-2 rounded-lg border transition-colors ${
                  finish === "Standard"
                    ? "bg-blue-600 border-blue-500"
                    : "bg-gray-800 border-gray-700 hover:border-gray-600"
                }`}
              >
                Standard
              </button>
              <button
                onClick={() => setFinish("Foil")}
                className={`flex-1 py-2 rounded-lg border transition-colors ${
                  finish === "Foil"
                    ? "bg-yellow-600 border-yellow-500"
                    : "bg-gray-800 border-gray-700 hover:border-gray-600"
                }`}
              >
                ✨ Foil
              </button>
            </div>
          </div>

          {/* Error */}
          {error && <div className="text-red-400 text-sm">{error}</div>}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={saving}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {saving
              ? "Adding..."
              : `Add ${quantity} Card${quantity > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
