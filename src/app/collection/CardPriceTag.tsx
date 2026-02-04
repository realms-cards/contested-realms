"use client";

import type { Finish } from "@prisma/client";
import { useEffect, useState, useRef } from "react";

interface CardPriceTagProps {
  cardId: number;
  cardName: string;
  variantId?: number | null;
  finish?: Finish;
}

interface PriceInfo {
  marketPrice: number | null;
}

// Simple in-memory cache for prices
const priceCache = new Map<string, PriceInfo>();

export default function CardPriceTag({
  cardId,
  cardName,
  variantId,
  finish,
}: CardPriceTagProps) {
  const [price, setPrice] = useState<PriceInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [shouldFetch, setShouldFetch] = useState(false);
  const fetchedRef = useRef(false);

  // Delay fetching to avoid fetching when user quickly hovers over cards
  useEffect(() => {
    const timer = setTimeout(() => {
      setShouldFetch(true);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!shouldFetch || fetchedRef.current) return;
    fetchedRef.current = true;

    const cacheKey = `${cardId}:${variantId || ""}:${finish || ""}`;

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
        const priceInfo: PriceInfo = {
          marketPrice: data.prices?.[0]?.marketPrice ?? null,
        };
        priceCache.set(cacheKey, priceInfo);
        setPrice(priceInfo);
      })
      .catch(() => {
        const priceInfo: PriceInfo = { marketPrice: null };
        priceCache.set(cacheKey, priceInfo);
        setPrice(priceInfo);
      })
      .finally(() => setLoading(false));
  }, [shouldFetch, cardId, variantId, finish, cardName]);

  if (loading) {
    return <span className="text-gray-500 text-sm">...</span>;
  }

  if (!price || price.marketPrice == null) {
    return <span className="text-gray-500 text-sm">N/A</span>;
  }

  return (
    <span className="font-medium text-green-400 text-sm">
      ${price.marketPrice.toFixed(2)}
    </span>
  );
}
