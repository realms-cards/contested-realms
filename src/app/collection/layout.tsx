"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import AuthButton from "@/components/auth/AuthButton";
import {
  PresenceProvider,
  usePresence,
} from "@/components/providers/PresenceProvider";
import AppShell from "@/components/ui/AppShell";
import { PageHeader } from "@/components/ui/page-header";
// TODO: These components are available for future use
// import ChangelogOverlay from "@/components/ui/ChangelogOverlay";
// import PatreonMarquee from "@/components/ui/PatreonMarquee";
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
      <AppShell width="narrow">
        <section className="rc-panel px-[18px] py-10">
          <div className="rc-hint text-center">loading…</div>
        </section>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell width="narrow">
        <section className="rc-panel px-[18px] py-10 text-center">
          <div className="rc-eyebrow mb-2">collection</div>
          <h1 className="m-0 font-rc-display text-[clamp(26px,2.4vw,34px)] leading-none text-rc-fg-strong">
            Collection Tracker
          </h1>
          <p className="mx-auto mt-3 max-w-md font-rc-sans text-sm leading-relaxed text-rc-fg-muted">
            Sign in to track your physical card collection, see set completion,
            and build decks from cards you own.
          </p>
          <div className="mt-6 flex justify-center">
            <AuthButton />
          </div>
        </section>
      </AppShell>
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
  const { showCodex, setShowCodex, showNotes, setShowNotes } = useCodex();

  // Trigger refresh event for collection components
  const handleCollectionRefresh = () => {
    window.dispatchEvent(new Event("collection:refresh"));
  };

  return (
    <AppShell width="wide">
      <PageHeader
        eyebrow={connected ? "collection · online" : "collection"}
        title={`${userName}'s Collection`}
        actions={
          <>
            <CollectionImportExport onImported={handleCollectionRefresh} />
            <CreateCubeFromCollection />
            <div className="rc-segment">
              <button
                type="button"
                aria-pressed={showNotes}
                onClick={() => setShowNotes(!showNotes)}
                title="Show/hide notes on cards"
              >
                Notes
              </button>
              <button
                type="button"
                aria-pressed={showCodex}
                onClick={() => setShowCodex(!showCodex)}
                title="Show codex/errata info for cards"
              >
                Codex
              </button>
            </div>
          </>
        }
      />

      {/* Navigation Tabs */}
      <nav className="rc-tabs thin-scrollbar">
        {tabs.map((tab) => {
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname?.startsWith(tab.href);

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="rc-tab"
              aria-current={isActive ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </AppShell>
  );
}
