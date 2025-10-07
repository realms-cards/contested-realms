"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import AuthButton from "@/components/auth/AuthButton";
import OnlinePageShell from "@/components/online/OnlinePageShell";
import { normalizeCubeSummary, type CubeSummaryInput } from "@/lib/cubes/normalizers";
import CubeImportText from "./CubeImportText";
import CubeItem, { type CubeListItem } from "./CubeItem";

type PublicCube = CubeListItem & { userName: string };

type ApiResponse = {
  myCubes: CubeSummaryInput[];
  publicCubes: (CubeSummaryInput & { user?: { name?: string | null } | null })[];
};

export default function CubesPage() {
  const { data: session } = useSession();
  const [myCubes, setMyCubes] = useState<CubeListItem[]>([]);
  const [publicCubes, setPublicCubes] = useState<PublicCube[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setMyCubes(data.map((raw) => normalizeCubeSummary(raw, { isOwner: true })));
        setPublicCubes([]);
      } else {
        const myList = Array.isArray(data.myCubes)
          ? data.myCubes.map((raw) => normalizeCubeSummary(raw, { isOwner: true }))
          : [];
        const pubList = Array.isArray(data.publicCubes)
          ? data.publicCubes.map((raw) =>
              normalizeCubeSummary(raw, {
                isOwner: false,
                userName:
                  typeof raw.userName === "string" && raw.userName
                    ? raw.userName
                    : typeof raw.user?.name === "string" && raw.user?.name
                    ? raw.user.name
                    : "Unknown Player",
              }) as PublicCube,
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

  useEffect(() => {
    const onRefresh = () => {
      void fetchCubes(true);
    };
    window.addEventListener("cubes:refresh", onRefresh);
    return () => window.removeEventListener("cubes:refresh", onRefresh);
  }, [fetchCubes]);

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

        <CubeImportText />

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
            {myCubes.length === 0 ? (
              <div className="rounded-xl bg-slate-900/70 ring-1 ring-slate-800/80 p-6 text-sm text-slate-300 space-y-2">
                <div>No cubes yet. Import from text or start assembling a custom draft pool.</div>
              </div>
            ) : (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold uppercase tracking-wide text-slate-200">
                  Your Cubes
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                  {myCubes.map((cube) => (
                    <CubeItem key={cube.id} cube={cube} />
                  ))}
                </div>
              </div>
            )}

            {publicCubes.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold uppercase tracking-wide text-slate-200">
                  Public Cubes
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                  {publicCubes.map((cube) => (
                    <CubeItem key={cube.id} cube={cube} />
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
