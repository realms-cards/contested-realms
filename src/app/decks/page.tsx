"use client";

import { Grid3X3, List, RefreshCw } from "lucide-react";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import AuthButton from "@/components/auth/AuthButton";
import OnlinePageShell from "@/components/online/OnlinePageShell";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import { RcButton, RcLinkButton } from "@/components/ui/rc-button";
import { RcEmpty } from "@/components/ui/rc-empty";
import DeckImportCuriosa from "./DeckImportCuriosa";
import DeckImportText from "./DeckImportText";
import DeckItem from "./DeckItem";

type AvatarSummary = {
  avatarState: "none" | "single" | "multiple";
  avatarCard?: { name: string; slug: string | null } | null;
};

type MyDeck = {
  id: string;
  name: string;
  format: string;
  isPublic: boolean;
  imported?: boolean;
  curiosaSourceId?: string | null;
  updatedAt: string;
  /** True while deck is being loaded after import */
  isPending?: boolean;
} & AvatarSummary;

type PublicDeck = {
  id: string;
  name: string;
  format: string;
  imported?: boolean;
  userName: string;
  updatedAt: string;
  isPublic: boolean;
} & AvatarSummary;

function normalizeAvatarState(value: unknown): AvatarSummary["avatarState"] {
  if (value === "single" || value === "multiple" || value === "none") {
    return value;
  }
  return "none";
}

function normalizeAvatarCard(card: unknown): AvatarSummary["avatarCard"] {
  if (!card || typeof card !== "object") return null;
  const maybeCard = card as { name?: unknown; slug?: unknown };
  const name = typeof maybeCard.name === "string" ? maybeCard.name : "";
  const slugValue = maybeCard.slug;
  const slug =
    typeof slugValue === "string"
      ? slugValue
      : slugValue === null
      ? null
      : null;
  if (!name && slug == null) {
    return null;
  }
  return { name, slug };
}

function normalizeUpdatedAt(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" && Number.isFinite(value)) {
    const fromNumber = new Date(value);
    if (!Number.isNaN(fromNumber.getTime())) return fromNumber.toISOString();
  }
  return new Date().toISOString();
}

type RawDeck = Record<string, unknown>;

function mapAvatarSummary(deck: RawDeck): AvatarSummary {
  return {
    avatarState: normalizeAvatarState(deck["avatarState"]),
    avatarCard: normalizeAvatarCard(deck["avatarCard"]),
  };
}

function mapMyDeckFromApi(deck: RawDeck): MyDeck {
  const summary = mapAvatarSummary(deck);
  const curiosaSourceId = deck["curiosaSourceId"];
  return {
    id: String(deck["id"] ?? ""),
    name:
      typeof deck["name"] === "string"
        ? (deck["name"] as string)
        : "Untitled Deck",
    format:
      typeof deck["format"] === "string"
        ? (deck["format"] as string)
        : "Unknown",
    isPublic: Boolean(deck["isPublic"]),
    imported: Boolean(deck["imported"]),
    curiosaSourceId:
      typeof curiosaSourceId === "string" ? curiosaSourceId : null,
    updatedAt: normalizeUpdatedAt(deck["updatedAt"]),
    ...summary,
  };
}

function mapPublicDeckFromApi(deck: RawDeck): PublicDeck {
  const summary = mapAvatarSummary(deck);
  return {
    id: String(deck["id"] ?? ""),
    name:
      typeof deck["name"] === "string"
        ? (deck["name"] as string)
        : "Untitled Deck",
    format:
      typeof deck["format"] === "string"
        ? (deck["format"] as string)
        : "Unknown",
    imported: Boolean(deck["imported"]),
    userName:
      typeof deck["userName"] === "string" && deck["userName"]
        ? (deck["userName"] as string)
        : "Unknown Player",
    updatedAt: normalizeUpdatedAt(deck["updatedAt"]),
    isPublic: true,
    ...summary,
  };
}

export default function DecksPage() {
  const { data: session } = useSession();
  const [myDecks, setMyDecks] = useState<MyDeck[]>([]);
  const [publicDecks, setPublicDecks] = useState<PublicDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Filter state
  const [filterFormat, setFilterFormat] = useState<string>("all");
  const [filterAvatar, setFilterAvatar] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<
    "all" | "imported" | "created"
  >("all");

  // View mode (grid/list)
  const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sorcery:deckViewMode");
      if (saved === "grid" || saved === "list") return saved;
    }
    return "grid";
  });

  useEffect(() => {
    localStorage.setItem("sorcery:deckViewMode", viewMode);
  }, [viewMode]);

  const [sortBy, setSortBy] = useState<
    "date-desc" | "date-asc" | "name-asc" | "name-desc" | "format"
  >(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sorcery:deckSort");
      if (
        saved === "date-desc" ||
        saved === "date-asc" ||
        saved === "name-asc" ||
        saved === "name-desc" ||
        saved === "format"
      ) {
        return saved;
      }
    }
    return "date-desc";
  });

  useEffect(() => {
    localStorage.setItem("sorcery:deckSort", sortBy);
  }, [sortBy]);

  const fetchDecks = useCallback(async (force = false) => {
    try {
      setLoading(true);
      // Add cache-busting for production
      const url = force ? `/api/decks?_t=${Date.now()}` : "/api/decks";

      const res = await fetch(url, {
        // Force fresh data in production
        cache: force ? "no-cache" : "default",
        headers: force ? { "Cache-Control": "no-cache" } : {},
      });

      if (!res.ok) throw new Error("Failed to load decks");
      const data = await res.json();
      const normalizedMyDecks: MyDeck[] = Array.isArray(data?.myDecks)
        ? data.myDecks.map(mapMyDeckFromApi)
        : [];
      const normalizedPublicDecks: PublicDeck[] = Array.isArray(
        data?.publicDecks
      )
        ? data.publicDecks.map(mapPublicDeckFromApi)
        : [];
      setMyDecks(normalizedMyDecks);
      setPublicDecks(normalizedPublicDecks);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load decks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session) {
      fetchDecks();
    }
  }, [session, fetchDecks]);

  // Optimistic add handler - adds a pending deck immediately after import
  const handleOptimisticAdd = useCallback(
    (deck: { id: string; name: string; format: string }) => {
      const pendingDeck: MyDeck = {
        id: deck.id,
        name: deck.name,
        format: deck.format,
        isPublic: false,
        imported: true,
        updatedAt: new Date().toISOString(),
        avatarState: "none",
        avatarCard: null,
        isPending: true,
      };
      setMyDecks((prev) => [pendingDeck, ...prev]);
      // Don't hide import form - let the success message stay visible for a moment
      // The import form will auto-clear the success after 5 seconds
      // Fetch full data in background to update avatar info
      void fetchDecks(true);
    },
    [fetchDecks]
  );

  // Listen for import components signaling a refresh
  useEffect(() => {
    type DeckRefreshEvent = CustomEvent<{
      deck?: { id: string; name: string; format: string };
    }>;
    const onRefresh = (e: Event) => {
      const detail = (e as DeckRefreshEvent).detail;
      if (detail?.deck) {
        // Optimistic add with pending state
        handleOptimisticAdd(detail.deck);
      } else {
        // Fallback: just refresh (no deck info, don't hide import form)
        void fetchDecks(true);
      }
    };
    window.addEventListener("decks:refresh", onRefresh);
    return () => window.removeEventListener("decks:refresh", onRefresh);
  }, [fetchDecks, handleOptimisticAdd]);

  // Optimistic delete handler - removes deck from state immediately
  const handleDeleteDeck = useCallback((deckId: string) => {
    setMyDecks((prev) => prev.filter((d) => d.id !== deckId));
    setPublicDecks((prev) => prev.filter((d) => d.id !== deckId));
  }, []);

  // Sorting logic
  const sortDecks = useCallback(
    <T extends { name: string; updatedAt: string; format: string }>(
      decks: T[]
    ): T[] => {
      return [...decks].sort((a, b) => {
        switch (sortBy) {
          case "date-desc":
            return (
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            );
          case "date-asc":
            return (
              new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
            );
          case "name-asc":
            return a.name.localeCompare(b.name);
          case "name-desc":
            return b.name.localeCompare(a.name);
          case "format":
            return (
              a.format.localeCompare(b.format) || a.name.localeCompare(a.name)
            );
          default:
            return 0;
        }
      });
    },
    [sortBy]
  );

  // Extract unique formats and avatars for filter dropdowns
  const uniqueFormats = useMemo(() => {
    const formats = new Set<string>();
    myDecks.forEach((d) => formats.add(d.format));
    publicDecks.forEach((d) => formats.add(d.format));
    return Array.from(formats).sort();
  }, [myDecks, publicDecks]);

  const uniqueAvatars = useMemo(() => {
    const avatars = new Set<string>();
    myDecks.forEach((d) => {
      if (d.avatarCard?.name) avatars.add(d.avatarCard.name);
    });
    publicDecks.forEach((d) => {
      if (d.avatarCard?.name) avatars.add(d.avatarCard.name);
    });
    return Array.from(avatars).sort();
  }, [myDecks, publicDecks]);

  // Filter logic
  const filterDecks = useCallback(
    <
      T extends {
        format: string;
        imported?: boolean;
        avatarCard?: { name: string } | null;
      }
    >(
      decks: T[]
    ): T[] => {
      return decks.filter((d) => {
        // Format filter
        if (filterFormat !== "all" && d.format !== filterFormat) return false;
        // Avatar filter
        if (filterAvatar !== "all") {
          if (!d.avatarCard?.name || d.avatarCard.name !== filterAvatar)
            return false;
        }
        // Source filter
        if (filterSource === "imported" && !d.imported) return false;
        if (filterSource === "created" && d.imported) return false;
        return true;
      });
    },
    [filterFormat, filterAvatar, filterSource]
  );

  const filteredMyDecks = useMemo(
    () => filterDecks(myDecks),
    [myDecks, filterDecks]
  );
  const filteredPublicDecks = useMemo(
    () => filterDecks(publicDecks),
    [publicDecks, filterDecks]
  );

  const sortedMyDecks = useMemo(
    () => sortDecks(filteredMyDecks),
    [filteredMyDecks, sortDecks]
  );
  const sortedPublicDecks = useMemo(
    () => sortDecks(filteredPublicDecks),
    [filteredPublicDecks, sortDecks]
  );

  // Check if any filters are active
  const hasActiveFilters =
    filterFormat !== "all" || filterAvatar !== "all" || filterSource !== "all";

  const clearFilters = useCallback(() => {
    setFilterFormat("all");
    setFilterAvatar("all");
    setFilterSource("all");
  }, []);

  if (!session) {
    return (
      <OnlinePageShell>
        <PageHeader
          eyebrow="library"
          title="Your Decks"
          description="Manage your collections, import decklists, and create new builds."
        />
        <section className="rc-panel px-[18px] py-8 text-center">
          <div className="font-rc-sans text-sm text-rc-fg-muted">
            Please sign in to view your decks.
          </div>
          <div className="mt-4 flex justify-center">
            <AuthButton />
          </div>
        </section>
      </OnlinePageShell>
    );
  }

  const listClassName =
    viewMode === "grid"
      ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      : "flex flex-col gap-2";

  return (
    <OnlinePageShell>
      <PageHeader
        eyebrow="library"
        title="Your Decks"
        description="Manage your collections, import decklists, and create new builds."
        actions={
          <>
            <RcButton
              variant="outline"
              onClick={() => setShowImport((prev) => !prev)}
            >
              {showImport ? "Hide Importers" : "Import New Deck"}
            </RcButton>
            <RcLinkButton href="/decks/editor-3d">
              Construct New Deck
            </RcLinkButton>
          </>
        }
      />

      {showImport && (
        <section className="rc-panel space-y-4 p-[18px]">
          <DeckImportCuriosa />
          <DeckImportText />
        </section>
      )}

      {loading ? (
        <div className="rc-hint py-6 text-center">loading decks…</div>
      ) : error ? (
        <div className="rc-alert" data-tone="danger">
          Error: {error}
        </div>
      ) : (
        <div className="flex flex-col gap-7">
          {myDecks.length === 0 ? (
            <RcEmpty
              title="No decks yet."
              action={
                <>
                  <RcLinkButton
                    href="/decks/editor-3d"
                    variant="outline"
                    size="sm"
                  >
                    Open Deck Editor
                  </RcLinkButton>
                  <RcButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowImport(true)}
                  >
                    Show Import Tools
                  </RcButton>
                </>
              }
            >
              create one from the editor, import an existing list, or save from
              draft
            </RcEmpty>
          ) : (
            <section className="rc-panel">
              <PanelHeader
                title="Your Decks"
                meta={`${sortedMyDecks.length}${
                  hasActiveFilters ? ` of ${myDecks.length}` : ""
                } decks`}
              >
                {/* Refresh */}
                <RcButton
                  variant="ghost"
                  size="icon"
                  onClick={() => void fetchDecks(true)}
                  disabled={loading}
                  className="h-8 w-8 text-rc-fg-muted hover:text-rc-accent-ring"
                  aria-label="Refresh decks"
                  title="Refresh decks"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                  />
                </RcButton>

                {/* View mode toggle */}
                <div className="rc-segment">
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    aria-pressed={viewMode === "grid"}
                    aria-label="Grid view"
                    title="Grid view"
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    aria-pressed={viewMode === "list"}
                    aria-label="List view"
                    title="List view"
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rc-hint uppercase">sort</span>
                  <CustomSelect
                    value={sortBy}
                    onChange={(v) => setSortBy(v as typeof sortBy)}
                    options={[
                      { value: "date-desc", label: "Newest" },
                      { value: "date-asc", label: "Oldest" },
                      { value: "name-asc", label: "A-Z" },
                      { value: "name-desc", label: "Z-A" },
                      { value: "format", label: "Format" },
                    ]}
                  />
                </div>
              </PanelHeader>

              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-2 border-b border-rc-line/8 px-[18px] py-3">
                <span className="rc-hint uppercase">filter</span>

                <CustomSelect
                  value={filterFormat}
                  onChange={(v) => setFilterFormat(v)}
                  placeholder="All Formats"
                  options={uniqueFormats.map((f) => ({
                    value: f,
                    label: f,
                  }))}
                />

                <CustomSelect
                  value={filterAvatar}
                  onChange={(v) => setFilterAvatar(v)}
                  className="max-w-[140px]"
                  placeholder="All Avatars"
                  options={uniqueAvatars.map((a) => ({
                    value: a,
                    label: a,
                  }))}
                />

                <CustomSelect
                  value={filterSource}
                  onChange={(v) => setFilterSource(v as typeof filterSource)}
                  options={[
                    { value: "all", label: "All Sources" },
                    { value: "imported", label: "Imported" },
                    { value: "created", label: "Created" },
                  ]}
                />

                {hasActiveFilters && (
                  <RcButton variant="link" size="sm" onClick={clearFilters}>
                    Clear
                  </RcButton>
                )}
              </div>

              <div className={`px-[18px] py-3.5 ${listClassName}`}>
                {sortedMyDecks.map((d) => (
                  <DeckItem
                    key={d.id}
                    deck={{
                      id: d.id,
                      name: d.name,
                      format: d.format,
                      isPublic: d.isPublic,
                      imported: d.imported,
                      curiosaSourceId: d.curiosaSourceId,
                      avatarState: d.avatarState,
                      avatarCard: d.avatarCard,
                      updatedAt: d.updatedAt,
                      isOwner: true,
                      isPending: d.isPending,
                    }}
                    onDelete={handleDeleteDeck}
                    variant={viewMode}
                  />
                ))}
              </div>
            </section>
          )}

          {publicDecks.length > 0 && (
            <section className="rc-panel">
              <PanelHeader
                title="Public Decks"
                meta={`${sortedPublicDecks.length} decks`}
              />
              <div className={`px-[18px] py-3.5 ${listClassName}`}>
                {sortedPublicDecks.map((d) => (
                  <DeckItem
                    key={d.id}
                    deck={{
                      id: d.id,
                      name: d.name,
                      format: d.format,
                      imported: d.imported,
                      userName: d.userName,
                      avatarState: d.avatarState,
                      avatarCard: d.avatarCard,
                      updatedAt: d.updatedAt,
                      isPublic: Boolean(d.isPublic),
                      isOwner: false,
                    }}
                    variant={viewMode}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </OnlinePageShell>
  );
}
