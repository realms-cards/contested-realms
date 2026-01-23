"use client";

import { Grid3X3, List as ListIcon } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import AuthButton from "@/components/auth/AuthButton";
import OnlinePageShell from "@/components/online/OnlinePageShell";
import {
  normalizeCubeSummary,
  type CubeSummaryInput,
} from "@/lib/cubes/normalizers";
import CubeImportCuriosa from "./CubeImportCuriosa";
import CubeImportText from "./CubeImportText";
import CubeItem, { type CubeListItem } from "./CubeItem";

type PublicCube = CubeListItem & { userName: string };

type ApiResponse = {
  myCubes: CubeSummaryInput[];
  publicCubes: (CubeSummaryInput & { user?: { name?: string | null } | null })[];
};

type SortOption =
  | "date-desc"
  | "date-asc"
  | "name-asc"
  | "name-desc"
  | "count-desc"
  | "count-asc";
type FilterSource = "all" | "imported" | "created";
type ViewMode = "grid" | "list";

export default function CubesPage() {
  const { data: session } = useSession();
  const [myCubes, setMyCubes] = useState<CubeListItem[]>([]);
  const [publicCubes, setPublicCubes] = useState<PublicCube[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View mode with localStorage persistence
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sorcery:cubeViewMode");
      if (saved === "grid" || saved === "list") return saved;
    }
    return "grid";
  });

  // Sort with localStorage persistence
  const [sortBy, setSortBy] = useState<SortOption>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sorcery:cubeSort");
      if (
        saved === "date-desc" ||
        saved === "date-asc" ||
        saved === "name-asc" ||
        saved === "name-desc" ||
        saved === "count-desc" ||
        saved === "count-asc"
      ) {
        return saved;
      }
    }
    return "date-desc";
  });

  // Filter by source (imported/created)
  const [filterSource, setFilterSource] = useState<FilterSource>("all");

  // Persist view mode
  useEffect(() => {
    localStorage.setItem("sorcery:cubeViewMode", viewMode);
  }, [viewMode]);

  // Persist sort
  useEffect(() => {
    localStorage.setItem("sorcery:cubeSort", sortBy);
  }, [sortBy]);

  const fetchCubes = useCallback(async (force = false) => {
    if (!session) return;
    try {
      setLoading(true);
      const url = force ? `/api/cubes?_=${Date.now()}` : "/api/cubes";
      const res = await fetch(url, {
        cache: force ? "no-cache" : "default",
        headers: force ? { "Cache-Control": "no-cache" } : {},
      });
      if (!res.ok) throw new Error("Failed to load cubes");
      const data = (await res.json()) as ApiResponse | CubeSummaryInput[];
      if (Array.isArray(data)) {
        setMyCubes(
          data.map((raw) => normalizeCubeSummary(raw, { isOwner: true }))
        );
        setPublicCubes([]);
      } else {
        const myList = Array.isArray(data.myCubes)
          ? data.myCubes.map((raw) =>
              normalizeCubeSummary(raw, { isOwner: true })
            )
          : [];
        const pubList = Array.isArray(data.publicCubes)
          ? data.publicCubes.map(
              (raw) =>
                normalizeCubeSummary(raw, {
                  isOwner: false,
                  userName:
                    typeof raw.userName === "string" && raw.userName
                      ? raw.userName
                      : typeof raw.user?.name === "string" && raw.user?.name
                      ? raw.user.name
                      : "Unknown Player",
                }) as PublicCube
            )
          : [];
        setMyCubes(myList);
        setPublicCubes(pubList);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cubes");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void fetchCubes();
  }, [session, fetchCubes]);

  // Listen for refresh events (optimistic UI)
  useEffect(() => {
    const onRefresh = (e: Event) => {
      // Check if event has cube info for optimistic add
      const customEvent = e as CustomEvent<{ cube?: CubeListItem }>;
      if (customEvent.detail?.cube) {
        const newCube = customEvent.detail.cube;
        setMyCubes((prev) => {
          // Avoid duplicates
          if (prev.some((c) => c.id === newCube.id)) return prev;
          return [{ ...newCube, isOwner: true }, ...prev];
        });
      }
      void fetchCubes(true);
    };
    window.addEventListener("cubes:refresh", onRefresh);
    return () => window.removeEventListener("cubes:refresh", onRefresh);
  }, [fetchCubes]);

  // Optimistic delete handler
  const handleDeleteCube = useCallback((cubeId: string) => {
    setMyCubes((prev) => prev.filter((c) => c.id !== cubeId));
  }, []);

  // Sorting logic
  const sortCubes = useCallback(
    <T extends { name: string; updatedAt: string; cardCount: number }>(
      cubes: T[]
    ): T[] => {
      return [...cubes].sort((a, b) => {
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
          case "count-desc":
            return b.cardCount - a.cardCount;
          case "count-asc":
            return a.cardCount - b.cardCount;
          default:
            return 0;
        }
      });
    },
    [sortBy]
  );

  // Filtering logic
  const filterCubes = useCallback(
    <T extends { imported?: boolean }>(cubes: T[]): T[] => {
      return cubes.filter((c) => {
        if (filterSource === "imported" && !c.imported) return false;
        if (filterSource === "created" && c.imported) return false;
        return true;
      });
    },
    [filterSource]
  );

  // Apply filter then sort
  const filteredMyCubes = useMemo(
    () => filterCubes(myCubes),
    [myCubes, filterCubes]
  );
  const filteredPublicCubes = useMemo(
    () => filterCubes(publicCubes),
    [publicCubes, filterCubes]
  );
  const sortedMyCubes = useMemo(
    () => sortCubes(filteredMyCubes),
    [filteredMyCubes, sortCubes]
  );
  const sortedPublicCubes = useMemo(
    () => sortCubes(filteredPublicCubes),
    [filteredPublicCubes, sortCubes]
  );

  const hasActiveFilters = filterSource !== "all";

  const clearFilters = useCallback(() => {
    setFilterSource("all");
  }, []);

  if (!session) {
    return (
      <OnlinePageShell>
        <div className="pt-2">
          <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-6 text-center space-y-4">
            <div className="text-sm text-slate-200">
              Please sign in to manage your cubes.
            </div>
            <div className="flex justify-center">
              <AuthButton />
            </div>
          </div>
        </div>
      </OnlinePageShell>
    );
  }

  return (
    <OnlinePageShell>
      <div className="space-y-6 pt-2">
        {/* Header */}
        <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold font-fantaisie text-slate-50">
                Your Cubes
              </h1>
              <p className="text-sm text-slate-300/90">
                Maintain draftable card pools separate from your decks.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/decks"
                className="rounded-lg bg-slate-800/80 hover:bg-slate-700/80 px-4 py-2 text-sm font-medium text-slate-200"
              >
                Manage Decks
              </Link>
            </div>
          </div>
        </div>

        {/* Import sections */}
        <div className="grid gap-4 md:grid-cols-2">
          <CubeImportText />
          <CubeImportCuriosa />
        </div>

        {/* Toolbar: View toggle, Sort, Filter */}
        <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* View mode toggle */}
            <div className="flex items-center rounded-md bg-slate-800/60 p-0.5">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === "grid"
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
                title="Grid view"
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded transition-colors ${
                  viewMode === "list"
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:text-white"
                }`}
                title="List view"
              >
                <ListIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Sort dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="rounded-md bg-slate-800/60 border-0 py-1.5 px-3 text-sm text-slate-200 ring-1 ring-slate-700/50 focus:ring-2 focus:ring-blue-500"
            >
              <option value="date-desc">Newest</option>
              <option value="date-asc">Oldest</option>
              <option value="name-asc">A-Z</option>
              <option value="name-desc">Z-A</option>
              <option value="count-desc">Most Cards</option>
              <option value="count-asc">Least Cards</option>
            </select>

            {/* Filter dropdown */}
            <select
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value as FilterSource)}
              className="rounded-md bg-slate-800/60 border-0 py-1.5 px-3 text-sm text-slate-200 ring-1 ring-slate-700/50 focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Sources</option>
              <option value="imported">Imported</option>
              <option value="created">Created</option>
            </select>

            {/* Clear filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-slate-400 hover:text-slate-200 underline text-sm"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-5 text-sm text-slate-300">
            Loading cubes...
          </div>
        ) : error ? (
          <div className="rounded-xl bg-red-900/20 ring-1 ring-red-600/40 p-5 text-sm text-red-200">
            Error: {error}
          </div>
        ) : (
          <div className="space-y-6">
            {/* My Cubes */}
            {sortedMyCubes.length === 0 && filteredMyCubes.length === 0 ? (
              <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-6 text-sm text-slate-300 space-y-2">
                <div>
                  No cubes yet. Import from text, Curiosa, or start assembling a
                  custom draft pool.
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold uppercase tracking-wide text-slate-200">
                  Your Cubes ({sortedMyCubes.length})
                </h2>
                <div
                  className={
                    viewMode === "grid"
                      ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm"
                      : "flex flex-col gap-2 text-sm"
                  }
                >
                  {sortedMyCubes.map((cube) => (
                    <CubeItem
                      key={cube.id}
                      cube={cube}
                      variant={viewMode}
                      onDelete={handleDeleteCube}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Public Cubes */}
            {sortedPublicCubes.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold uppercase tracking-wide text-slate-200">
                  Public Cubes ({sortedPublicCubes.length})
                </h2>
                <div
                  className={
                    viewMode === "grid"
                      ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm"
                      : "flex flex-col gap-2 text-sm"
                  }
                >
                  {sortedPublicCubes.map((cube) => (
                    <CubeItem key={cube.id} cube={cube} variant={viewMode} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </OnlinePageShell>
  );
}
