"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import AuthButton from "@/components/auth/AuthButton";
import {
  PresenceProvider,
  usePresence,
} from "@/components/providers/PresenceProvider";
import { CodexProvider, useCodex } from "@/contexts/CodexContext";
import CollectionImportExport from "./CollectionImportExport";
import CreateCubeFromCollection from "./CreateCubeFromCollection";

const tabs = [
  { href: "/collection", label: "My Collection", exact: true },
  { href: "/collection/browser", label: "Browse Cards" },
  { href: "/collection/lists", label: "Lists" },
  { href: "/collection/decks", label: "My Decks" },
  { href: "/collection/stats", label: "Statistics" },
];

export default function CollectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  // Show auth prompt for unauthenticated users
  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white flex flex-col items-center justify-center gap-6 p-4">
        <h1 className="text-2xl font-bold">Collection Tracker</h1>
        <p className="text-gray-400 text-center max-w-md">
          Sign in to track your physical card collection, see set completion,
          and build decks from cards you own.
        </p>
        <AuthButton />
      </div>
    );
  }

  return (
    <PresenceProvider location="collection">
      <CodexProvider>
        <CollectionLayoutContent
          pathname={pathname}
          userName={session.user?.name || "Your"}
        >
          {children}
        </CollectionLayoutContent>
      </CodexProvider>
    </PresenceProvider>
  );
}

function CollectionLayoutContent({
  children,
  pathname,
  userName,
}: {
  children: React.ReactNode;
  pathname: string | null;
  userName: string;
}) {
  const { connected } = usePresence();
  const { showCodex, setShowCodex } = useCodex();

  // Trigger refresh event for collection components
  const handleCollectionRefresh = () => {
    window.dispatchEvent(new Event("collection:refresh"));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-gray-400 hover:text-white transition-colors"
              >
                ← Home
              </Link>
              <h1 className="text-xl font-fantaisie">
                {userName}&apos;s Collection
              </h1>
              {/* Online indicator */}
              {connected && (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  Online
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Import/Export */}
              <CollectionImportExport onImported={handleCollectionRefresh} />

              {/* Create Cube */}
              <CreateCubeFromCollection />

              {/* Codex toggle */}
              <button
                onClick={() => setShowCodex(!showCodex)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                  showCodex
                    ? "bg-amber-600/30 text-amber-300 border border-amber-500/50"
                    : "text-gray-400 hover:text-amber-300 hover:bg-gray-800"
                }`}
                title="Show codex/errata info for cards"
              >
                <span>📜</span>
                <span className="hidden sm:inline">Codex</span>
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex gap-1 mt-4 -mb-px overflow-x-auto">
            {tabs.map((tab) => {
              const isActive = tab.exact
                ? pathname === tab.href
                : pathname?.startsWith(tab.href);

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? "bg-gray-800 text-white border-b-2 border-blue-500"
                      : "text-gray-400 hover:text-white hover:bg-gray-800/50"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
