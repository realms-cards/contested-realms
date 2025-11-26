"use client";

import { useEffect, useState } from "react";

interface CardPriceTagProps {
  cardId: number;
  cardName: string;
  variantId?: number | null;
  finish?: "Standard" | "Foil";
  showLink?: boolean;
}

interface PriceInfo {
  marketPrice: number | null;
  affiliateUrl: string;
}

export default function CardPriceTag({
  cardId,
  cardName,
  variantId,
  finish,
  showLink = true,
}: CardPriceTagProps) {
  const [price, setPrice] = useState<PriceInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (variantId) params.set("variantId", String(variantId));
    if (finish) params.set("finish", finish);

    fetch(`/api/pricing/card/${cardId}?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.prices?.[0]) {
          setPrice({
            marketPrice: data.prices[0].marketPrice,
            affiliateUrl: data.prices[0].affiliateUrl,
          });
        } else if (data.affiliateUrl) {
          setPrice({
            marketPrice: null,
            affiliateUrl: data.affiliateUrl,
          });
        }
      })
      .catch(() => {
        // Generate fallback affiliate link
        const query = encodeURIComponent(cardName);
        setPrice({
          marketPrice: null,
          affiliateUrl: `https://www.tcgplayer.com/search/sorcery-contested-realm/product?q=${query}&view=grid`,
        });
      })
      .finally(() => setLoading(false));
  }, [cardId, variantId, finish, cardName]);

  if (loading) {
    return <span className="text-gray-500 text-sm">Loading...</span>;
  }

  if (!price) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      {price.marketPrice != null ? (
        <span className="font-medium text-green-400">
          ${price.marketPrice.toFixed(2)}
        </span>
      ) : (
        <span className="text-gray-500">Price N/A</span>
      )}

      {showLink && price.affiliateUrl && (
        <a
          href={price.affiliateUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 hover:underline"
        >
          Buy →
        </a>
      )}
    </div>
  );
}
