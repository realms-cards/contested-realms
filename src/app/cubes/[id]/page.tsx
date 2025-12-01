"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import AuthButton from "@/components/auth/AuthButton";
import OnlinePageShell from "@/components/online/OnlinePageShell";

type ApiCard = {
  cardId: number;
  variantId: number | null;
  setId: number | null;
  count: number;
  name: string;
  slug: string | null;
  setName: string | null;
  type: string | null;
  rarity: string | null;
  zone: string | null;
};

type CubeData = {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  isOwner: boolean;
  creatorName?: string;
  cards: ApiCard[];
};

export default function CubeViewPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const cubeId = typeof params?.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cube, setCube] = useState<CubeData | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  // Fetch cube data
  useEffect(() => {
    if (status !== "authenticated" || !cubeId) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/cubes/${encodeURIComponent(cubeId)}`);
        if (!res.ok) {
          throw new Error("Failed to load cube");
        }
        const data = (await res.json()) as CubeData;
        if (!cancelled) {
          setCube(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load cube");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cubeId, status]);

  // Copy cube handler
  const handleCopy = async () => {
    if (!cube || copying) return;
    try {
      setCopying(true);
      setCopySuccess(null);
      const res = await fetch(
        `/api/cubes/${encodeURIComponent(cube.id)}/copy`,
        {
          method: "POST",
        }
      );
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        throw new Error(msg?.error || "Failed to copy cube");
      }
      const data = await res.json();
      setCopySuccess(`Copied as "${data.name}"`);
      // Optionally redirect to edit the new cube
      setTimeout(() => {
        router.push(`/cubes/${data.id}/edit`);
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to copy cube");
    } finally {
      setCopying(false);
    }
  };

  // Group cards by zone
  const mainCards = (cube?.cards || []).filter(
    (c) => (c.zone ?? "main") === "main"
  );
  const sideboardCards = (cube?.cards || []).filter(
    (c) => c.zone === "sideboard"
  );

  const totalMain = mainCards.reduce((sum, c) => sum + c.count, 0);
  const totalSideboard = sideboardCards.reduce((sum, c) => sum + c.count, 0);

  if (status === "loading" || loading) {
    return (
      <OnlinePageShell>
        <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-6 text-center">
          <div className="text-sm text-slate-300">Loading...</div>
        </div>
      </OnlinePageShell>
    );
  }

  if (!session) {
    return (
      <OnlinePageShell>
        <div className="pt-2">
          <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-6 text-center space-y-4">
            <div className="text-sm text-slate-200">
              Please sign in to view cubes.
            </div>
            <div className="flex justify-center">
              <AuthButton />
            </div>
          </div>
        </div>
      </OnlinePageShell>
    );
  }

  if (error && !cube) {
    return (
      <OnlinePageShell>
        <div className="pt-2 space-y-4">
          <div className="rounded-xl bg-red-900/20 ring-1 ring-red-600/40 p-5 text-sm text-red-200">
            Error: {error}
          </div>
          <Link
            href="/cubes"
            className="inline-block rounded-lg bg-slate-800/80 hover:bg-slate-700/80 px-4 py-2 text-sm font-medium text-slate-200"
          >
            Back to Cubes
          </Link>
        </div>
      </OnlinePageShell>
    );
  }

  if (!cube) return null;

  return (
    <OnlinePageShell>
      <div className="space-y-6 pt-2">
        {/* Header */}
        <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1">
              <h1 className="text-2xl font-semibold font-fantaisie text-slate-50">
                {cube.name}
              </h1>
              {cube.description && (
                <p className="mt-2 text-sm text-slate-300/90">
                  {cube.description}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {cube.creatorName && (
                  <span className="px-2 py-1 rounded bg-slate-800/80 text-slate-300">
                    By {cube.creatorName}
                  </span>
                )}
                <span
                  className={`px-2 py-1 rounded ${
                    cube.isPublic
                      ? "bg-emerald-800/60 text-emerald-200"
                      : "bg-slate-800/80 text-slate-300"
                  }`}
                >
                  {cube.isPublic ? "Public" : "Private"}
                </span>
                <span className="px-2 py-1 rounded bg-slate-800/80 text-slate-300">
                  {totalMain + totalSideboard} cards
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/cubes"
                className="rounded-lg bg-slate-800/80 hover:bg-slate-700/80 px-4 py-2 text-sm font-medium text-slate-200"
              >
                Back
              </Link>
              {cube.isOwner ? (
                <Link
                  href={`/cubes/${encodeURIComponent(cube.id)}/edit`}
                  className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-medium text-white"
                >
                  Edit
                </Link>
              ) : (
                <button
                  onClick={handleCopy}
                  disabled={copying}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {copying ? "Copying..." : "Copy to My Cubes"}
                </button>
              )}
            </div>
          </div>
          {copySuccess && (
            <div className="mt-3 text-sm text-emerald-300 bg-emerald-900/30 rounded px-3 py-2">
              {copySuccess}
            </div>
          )}
          {error && (
            <div className="mt-3 text-sm text-red-300 bg-red-900/30 rounded px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Main Deck */}
        <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-semibold text-slate-200">
              Main Deck
            </div>
            <div className="text-sm text-slate-400">{totalMain} cards</div>
          </div>
          {mainCards.length === 0 ? (
            <div className="text-sm text-slate-400">No cards in main deck</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {mainCards.map((card, idx) => (
                <div
                  key={`main-${card.cardId}-${idx}`}
                  className="relative bg-slate-800/60 rounded-lg overflow-hidden ring-1 ring-slate-700/50"
                >
                  <div className="aspect-[3/4] relative">
                    <Image
                      src={
                        card.slug
                          ? `/api/images/${card.slug}`
                          : "/api/assets/cardback_spellbook.png"
                      }
                      alt={card.name}
                      fill
                      className="object-cover"
                      sizes="100px"
                    />
                    <div className="absolute top-1 right-1 bg-black/80 rounded px-1.5 py-0.5 text-xs text-white font-bold">
                      {card.count}x
                    </div>
                  </div>
                  <div className="p-1">
                    <div className="text-[9px] text-slate-200 truncate">
                      {card.name}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sideboard */}
        <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-semibold text-slate-200">
              Sideboard
            </div>
            <div className="text-sm text-slate-400">{totalSideboard} cards</div>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Avatars in the sideboard are draftable in packs. Non-avatar cards
            are available as extras during deck building.
          </p>
          {sideboardCards.length === 0 ? (
            <div className="text-sm text-slate-400">No cards in sideboard</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {sideboardCards.map((card, idx) => (
                <div
                  key={`side-${card.cardId}-${idx}`}
                  className="relative bg-slate-800/60 rounded-lg overflow-hidden ring-1 ring-purple-700/50"
                >
                  <div className="aspect-[3/4] relative">
                    <Image
                      src={
                        card.slug
                          ? `/api/images/${card.slug}`
                          : "/api/assets/cardback_spellbook.png"
                      }
                      alt={card.name}
                      fill
                      className="object-cover"
                      sizes="100px"
                    />
                    <div className="absolute top-1 right-1 bg-purple-900/80 rounded px-1.5 py-0.5 text-xs text-white font-bold">
                      {card.count}x
                    </div>
                  </div>
                  <div className="p-1">
                    <div className="text-[9px] text-slate-200 truncate">
                      {card.name}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </OnlinePageShell>
  );
}
