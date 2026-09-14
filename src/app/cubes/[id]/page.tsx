"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import AuthButton from "@/components/auth/AuthButton";
import OnlinePageShell from "@/components/online/OnlinePageShell";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import { RcButton, RcLinkButton } from "@/components/ui/rc-button";

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
        <div className="rc-hint py-6 text-center">loading…</div>
      </OnlinePageShell>
    );
  }

  if (!session) {
    return (
      <OnlinePageShell>
        <section className="rc-panel px-[18px] py-8 text-center">
          <div className="font-rc-sans text-sm text-rc-fg-muted">
            Please sign in to view cubes.
          </div>
          <div className="mt-4 flex justify-center">
            <AuthButton />
          </div>
        </section>
      </OnlinePageShell>
    );
  }

  if (error && !cube) {
    return (
      <OnlinePageShell>
        <div className="space-y-4">
          <div className="rc-alert" data-tone="danger">
            Error: {error}
          </div>
          <RcLinkButton href="/cubes" variant="outline">
            Back to Cubes
          </RcLinkButton>
        </div>
      </OnlinePageShell>
    );
  }

  if (!cube) return null;

  return (
    <OnlinePageShell>
      <>
        <PageHeader
          eyebrow="cube"
          title={cube.name}
          description={cube.description || undefined}
          actions={
            <>
              <RcLinkButton href="/cubes" variant="outline">
                Back
              </RcLinkButton>
              {cube.isOwner ? (
                <RcLinkButton href={`/cubes/${encodeURIComponent(cube.id)}/edit`}>
                  Edit
                </RcLinkButton>
              ) : (
                <RcButton onClick={handleCopy} disabled={copying}>
                  {copying ? "Copying..." : "Copy to My Cubes"}
                </RcButton>
              )}
            </>
          }
        />

        <div className="flex flex-wrap gap-2">
          {cube.creatorName && <Badge>By {cube.creatorName}</Badge>}
          <Badge tone={cube.isPublic ? "ok" : "default"}>
            {cube.isPublic ? "Public" : "Private"}
          </Badge>
          <Badge>{totalMain + totalSideboard} cards</Badge>
        </div>

        {copySuccess && (
          <div className="rc-alert" data-tone="success">
            {copySuccess}
          </div>
        )}
        {error && (
          <div className="rc-alert" data-tone="danger">
            {error}
          </div>
        )}

        {/* Main Deck */}
        <section className="rc-panel">
          <PanelHeader title="Main Deck" meta={`${totalMain} cards`} />
          <div className="px-[18px] py-3.5">
          {mainCards.length === 0 ? (
            <div className="rc-hint">No cards in main deck</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {mainCards.map((card, idx) => (
                <div
                  key={`main-${card.cardId}-${idx}`}
                  className="relative overflow-hidden rounded-rc-md border border-rc-line/12 bg-black/30"
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
                      unoptimized
                    />
                    <div className="absolute top-1 right-1 rounded-rc-sm bg-black/80 px-1.5 py-0.5 font-rc-mono text-xs text-rc-fg-strong">
                      {card.count}x
                    </div>
                  </div>
                  <div className="p-1">
                    <div className="truncate font-rc-sans text-[9px] text-rc-fg">
                      {card.name}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </section>

        {/* Sideboard */}
        <section className="rc-panel">
          <PanelHeader title="Sideboard" meta={`${totalSideboard} cards`} />
          <div className="px-[18px] py-3.5">
          <p className="rc-hint mb-3">
            Avatars in the sideboard are draftable in packs. Non-avatar cards
            are available as extras during deck building.
          </p>
          {sideboardCards.length === 0 ? (
            <div className="rc-hint">No cards in sideboard</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {sideboardCards.map((card, idx) => (
                <div
                  key={`side-${card.cardId}-${idx}`}
                  className="relative overflow-hidden rounded-rc-md border border-rc-accent/25 bg-black/30"
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
                      unoptimized
                    />
                    <div className="absolute top-1 right-1 rounded-rc-sm border border-rc-accent/60 bg-black/80 px-1.5 py-0.5 font-rc-mono text-xs text-rc-spark">
                      {card.count}x
                    </div>
                  </div>
                  <div className="p-1">
                    <div className="truncate font-rc-sans text-[9px] text-rc-fg">
                      {card.name}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </section>
      </>
    </OnlinePageShell>
  );
}
