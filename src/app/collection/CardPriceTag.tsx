"use client";

import type { Finish } from "@prisma/client";
import { useEffect, useState, useRef } from "react";

// Feature flag for pricing - set to true when pricing API is available
const PRICING_ENABLED = process.env.NEXT_PUBLIC_PRICING_ENABLED === "true";

interface CardPriceTagProps {
  cardId: number;
  cardName: string;
  variantId?: number | null;
  finish?: Finish;
  showLink?: boolean;
}

interface PriceInfo {
  marketPrice: number | null;
  affiliateUrl: string;
}

// Simple in-memory cache for prices
const priceCache = new Map<string, PriceInfo>();

export default function CardPriceTag({
  cardId,
  cardName,
  variantId,
  finish,
  showLink = true,
}: CardPriceTagProps) {
  const [price, setPrice] = useState<PriceInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [shouldFetch, setShouldFetch] = useState(false);
  const fetchedRef = useRef(false);

  // Delay fetching to avoid fetching when user quickly hovers over cards
  useEffect(() => {
    // Skip if pricing is disabled
    if (!PRICING_ENABLED) return;

    const timer = setTimeout(() => {
      setShouldFetch(true);
    }, 500); // Wait 500ms before fetching
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Skip if pricing is disabled
    if (!PRICING_ENABLED) return;
    if (!shouldFetch || fetchedRef.current) return;
    fetchedRef.current = true;

    const cacheKey = `${cardId}:${variantId || ""}:${finish || ""}`;

    // Check cache first
    const cached = priceCache.get(cacheKey);
    if (cached) {
      setPrice(cached);
      return;
    }

    setLoading(true);
    const params = new URLSearchParams();
    if (variantId) params.set("variantId", String(variantId));
    if (finish) params.set("finish", finish);

    fetch(`/api/pricing/card/${cardId}?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        let priceInfo: PriceInfo;
        if (data.prices?.[0]) {
          priceInfo = {
            marketPrice: data.prices[0].marketPrice,
            affiliateUrl: data.prices[0].affiliateUrl,
          };
        } else if (data.affiliateUrl) {
          priceInfo = {
            marketPrice: null,
            affiliateUrl: data.affiliateUrl,
          };
        } else {
          // Generate fallback affiliate link
          const query = encodeURIComponent(cardName);
          priceInfo = {
            marketPrice: null,
            affiliateUrl: `https://www.tcgplayer.com/search/sorcery-contested-realm/product?q=${query}&view=grid`,
          };
        }
        priceCache.set(cacheKey, priceInfo);
        setPrice(priceInfo);
      })
      .catch(() => {
        // Generate fallback affiliate link
        const query = encodeURIComponent(cardName);
        const priceInfo = {
          marketPrice: null,
          affiliateUrl: `https://www.tcgplayer.com/search/sorcery-contested-realm/product?q=${query}&view=grid`,
        };
        priceCache.set(cacheKey, priceInfo);
        setPrice(priceInfo);
      })
      .finally(() => setLoading(false));
  }, [shouldFetch, cardId, variantId, finish, cardName]);

  // Return null if pricing is disabled
  if (!PRICING_ENABLED) {
    return null;
  }

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
