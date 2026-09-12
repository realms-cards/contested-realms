"use client";

import type { Finish } from "@prisma/client";
import Image from "next/image";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { RcButton } from "@/components/ui/rc-button";
import { RcDialog } from "@/components/ui/rc-dialog";
import { getImageSlug } from "@/lib/utils/cardSlug";
import CardPriceTag from "./CardPriceTag";

interface CardData {
  id: number;
  name: string;
  variant?: {
    id: number;
    slug: string;
    setName: string;
    setId?: number;
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

  const imageSlug = getImageSlug(
    card.variant?.slug,
    card.name,
    card.variant?.setName
  );

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
            setId: card.variant?.setId || null,
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
    <RcDialog
      title="Add to Collection"
      eyebrow="collection"
      onClose={onClose}
      size="sm"
      actions={
        <>
          <RcButton variant="outline" onClick={onClose}>
            Cancel
          </RcButton>
          <RcButton onClick={handleAdd} disabled={saving}>
            {saving
              ? "Adding..."
              : `Add ${quantity} Card${quantity > 1 ? "s" : ""}`}
          </RcButton>
        </>
      }
    >
      <div className="space-y-4">
        {/* Card Preview */}
        <div className="flex gap-4">
          {(() => {
            const isSite = card.meta?.type?.toLowerCase().includes("site");
            return (
              <div
                className={`relative flex-shrink-0 overflow-hidden rounded-rc-sm ${
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
                  unoptimized
                />
              </div>
            );
          })()}
          <div className="min-w-0">
            <div className="font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
              {card.name}
            </div>
            <div className="mt-1.5">
              <Badge>{card.variant?.setName || "Unknown Set"}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              <div className="flex items-center gap-1 font-rc-mono text-[11px] tracking-[0.1em] text-rc-fg-subtle">
                <span>Std:</span>
                <CardPriceTag
                  cardId={card.id}
                  cardName={card.name}
                  variantId={card.variant?.id ?? null}
                  finish="Standard"
                />
              </div>
              <div className="flex items-center gap-1 font-rc-mono text-[11px] tracking-[0.1em] text-rc-fg-subtle">
                <span>Foil:</span>
                <CardPriceTag
                  cardId={card.id}
                  cardName={card.name}
                  variantId={card.variant?.id ?? null}
                  finish="Foil"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Quantity */}
        <div>
          <div className="rc-eyebrow mb-2">Quantity</div>
          <div className="flex items-center gap-3">
            <RcButton
              variant="outline"
              size="icon"
              aria-label="Decrease quantity"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
            >
              −
            </RcButton>
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
              aria-label="Quantity"
              className="rc-input h-[38px] w-20 text-center"
            />
            <RcButton
              variant="outline"
              size="icon"
              aria-label="Increase quantity"
              onClick={() => setQuantity((q) => Math.min(99, q + 1))}
              disabled={quantity >= 99}
            >
              +
            </RcButton>
          </div>
        </div>

        {/* Finish */}
        <div>
          <div className="rc-eyebrow mb-2">Finish</div>
          <div className="rc-segment">
            <button
              type="button"
              aria-pressed={finish === "Standard"}
              onClick={() => setFinish("Standard")}
            >
              Standard
            </button>
            <button
              type="button"
              aria-pressed={finish === "Foil"}
              onClick={() => setFinish("Foil")}
            >
              Foil
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rc-alert" data-tone="danger">
            {error}
          </div>
        )}
      </div>
    </RcDialog>
  );
}
