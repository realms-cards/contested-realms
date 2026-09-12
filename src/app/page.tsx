"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import AsciiBottomArt from "@/components/ui/AsciiBottomArt";
import AsciiLogo from "@/components/ui/AsciiLogo";
import LobbyFooter from "@/components/ui/LobbyFooter";
import OtherRealms from "@/components/ui/OtherRealms";
import { Badge } from "@/components/ui/badge";
import PanelTile from "@/components/ui/panel-tile";
import { RcButton } from "@/components/ui/rc-button";
import { FEATURE_CPU_BOTS, FEATURE_VS_CPU_PRECONS } from "@/lib/config/features";
import { fetchPatrons, isPatron } from "@/lib/patrons";

export default function Home() {
  const router = useRouter();
  const { data: session } = useSession();
  // Start with null (hidden) to avoid hydration mismatch, then show after mount if not dismissed
  const [userIsPatron, setUserIsPatron] = useState(false);
  const [showAlphaBanner, setShowAlphaBanner] = useState<boolean | null>(null);
  const [showCookieNotice, setShowCookieNotice] = useState<boolean | null>(
    null,
  );

  // Sync with localStorage after mount to avoid hydration mismatch
  useEffect(() => {
    document.title = "Realms.cards";
    try {
      const alphaDismissed = window.localStorage.getItem(
        "sorcery:alphaBannerDismissed",
      );
      setShowAlphaBanner(alphaDismissed !== "1");
      const cookieDismissed = window.localStorage.getItem(
        "sorcery:cookieNoticeDismissed",
      );
      setShowCookieNotice(cookieDismissed !== "1");
    } catch {
      // If localStorage fails, show both
      setShowAlphaBanner(true);
      setShowCookieNotice(true);
    }
  }, []);

  useEffect(() => {
    const userId = session?.user?.id as string | undefined;
    if (!userId) return;
    fetchPatrons().then(() => {
      setUserIsPatron(isPatron(userId));
    });
  }, [session]);

  const dismissAlpha = () => {
    try {
      window.localStorage.setItem("sorcery:alphaBannerDismissed", "1");
    } catch {}
    setShowAlphaBanner(false);
  };
  const dismissCookies = () => {
    try {
      window.localStorage.setItem("sorcery:cookieNoticeDismissed", "1");
    } catch {}
    setShowCookieNotice(false);
  };

  const tileTitle = "m-0 font-rc-display text-[28px] leading-none text-rc-fg-strong";
  const subTitle = "m-0 font-rc-display text-[22px] leading-none text-rc-fg-strong";
  const tileNote = "mt-2 font-rc-mono text-[11px] tracking-[0.1em] text-rc-fg-subtle";

  return (
    <div className="rc-app relative flex min-h-dvh flex-col items-center overflow-x-clip px-5">
      <div
        aria-hidden="true"
        className="rc-grain pointer-events-none fixed inset-0 z-0"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 shadow-[inset_0_0_120px_20px_rgba(0,0,0,0.45)]"
      />

      <div className="relative z-10 w-full max-w-6xl space-y-6 pb-10 pt-8 text-center md:space-y-7 md:pb-12 md:pt-10">
        {showAlphaBanner && (
          <div className="relative z-30 mx-auto flex max-w-5xl items-center justify-between gap-3.5 rounded-rc-md border border-rc-accent/35 bg-[rgba(112,65,22,0.45)] px-3.5 py-2.5 text-left font-rc-sans text-[13px] text-[#f3e0b3]">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="warn">Open Beta</Badge>
              <span className="text-rc-fg-muted">
                Data might be lost as the simulator evolves. Export your decks
                often.
              </span>
            </div>
            <button
              type="button"
              onClick={dismissAlpha}
              className="cursor-pointer rounded-rc-sm p-1 text-lg leading-none text-[#f3e0b3] transition-colors hover:text-rc-fg-strong focus:outline-none focus-visible:ring-1 focus-visible:ring-rc-accent-ring"
              aria-label="Dismiss banner"
            >
              ×
            </button>
          </div>
        )}

        {/* Logotype */}
        <AsciiLogo className="mx-auto max-w-4xl drop-shadow-[0_0_14px_rgba(243,207,106,0.18)]" />

        {/* Primary Navigation: the lobby is open to everyone (guests can join
            open lobbies or invite links), signing in unlocks decks + matchmaking */}
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-5 xl:gap-6">
          <PanelTile href="/online/lobby" className="w-full justify-self-center">
            <div className="flex items-center justify-center py-5 md:py-6">
              <h3 className={tileTitle}>Online Realms</h3>
            </div>
            {!session && (
              <div className="-mt-3 pb-2 text-center font-rc-mono text-[11px] tracking-[0.1em] text-rc-fg-subtle">
                sign in or play as a guest
              </div>
            )}
          </PanelTile>
          {!session && (
            <PanelTile
              onClick={() => router.push("/auth/signin")}
              className="w-full justify-self-center"
            >
              <div className="flex items-center justify-center py-5 md:py-6">
                <h3 className={tileTitle}>Sign In</h3>
              </div>
            </PanelTile>
          )}
        </div>

        {/* Secondary Links */}
        {session && (
          <div className="mx-auto grid max-w-4xl grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3 md:gap-4">
            <PanelTile href="/decks">
              <div className="flex items-center justify-center py-3 md:py-4">
                <h4 className={subTitle}>Your Decks</h4>
              </div>
            </PanelTile>
            <PanelTile href="/collection">
              <div className="flex items-center justify-center py-3 md:py-4">
                <h4 className={subTitle}>Your Collection</h4>
              </div>
            </PanelTile>
          </div>
        )}
        {/* Every row is an auto-fit grid: tiles share the row evenly and a
            lone tile (e.g. a feature flag is off) grows to the full width,
            so no row ever ends in a gap. */}
        {session && (FEATURE_CPU_BOTS || FEATURE_VS_CPU_PRECONS) && (
          <div className="mx-auto grid max-w-4xl grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3 md:gap-4">
            {FEATURE_CPU_BOTS && (
              <PanelTile
                href={
                  userIsPatron
                    ? "/play/goldfish"
                    : "https://www.patreon.com/realmscards"
                }
                className="w-full"
              >
                <div className="flex flex-col items-center justify-center py-3 md:py-4">
                  <span className="rc-eyebrow mb-1.5">experimental</span>
                  <h4 className={subTitle}>Goldfish — Any Deck</h4>
                  <span className={tileNote}>
                    {userIsPatron
                      ? "test your builds against the CPU"
                      : "patrons only"}
                  </span>
                </div>
              </PanelTile>
            )}
            {FEATURE_VS_CPU_PRECONS && (
              <PanelTile
                href={
                  userIsPatron
                    ? "/play/vs-cpu"
                    : "https://www.patreon.com/realmscards"
                }
                className="w-full"
              >
                <div
                  className={`flex flex-col items-center justify-center py-3 md:py-4 ${
                    userIsPatron ? "" : "opacity-60"
                  }`}
                >
                  <span className="rc-eyebrow mb-1.5">experimental</span>
                  <h4 className={subTitle}>VS CPU Precons</h4>
                  {!userIsPatron && (
                    <span className={tileNote}>patrons only</span>
                  )}
                </div>
              </PanelTile>
            )}
          </div>
        )}
        {session && (
          <div className="mx-auto grid max-w-4xl grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3 md:gap-4">
            <PanelTile href="/play" className="w-full">
              <div className="flex items-center justify-center py-3 md:py-4">
                <h4 className={subTitle}>Solo Hotseat</h4>
              </div>
            </PanelTile>
            <PanelTile href="/draft-3d" className="w-full">
              <div className="flex items-center justify-center py-3 md:py-4">
                <h4 className={subTitle}>Solo Draftsim</h4>
              </div>
            </PanelTile>
          </div>
        )}

        {/* Tutorial & Other Realms */}
        {session && (
          <div className="mx-auto grid max-w-4xl grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3 md:gap-4">
            <PanelTile href="/tutorial" className="w-full">
              <div className="flex items-center justify-center py-3 md:py-4">
                <h4 className={subTitle}>Sorcery Tutorial</h4>
              </div>
            </PanelTile>
            <OtherRealms className="w-full" />
          </div>
        )}

        <LobbyFooter />
      </div>

      {/* Bottom ASCII art background, warmed toward the gold palette */}
      <AsciiBottomArt opacityClass="text-white/10" />

      {/* Cookie/Privacy notice toast */}
      {showCookieNotice && (
        <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-[380px] -translate-x-1/2">
          <div className="rounded-rc-lg border border-rc-line/14 bg-gradient-to-b from-[rgba(26,36,58,0.96)] to-[rgba(17,26,46,0.96)] p-[18px] font-rc-sans text-[13px] leading-[1.55] text-rc-fg shadow-[0_18px_40px_rgba(0,0,0,0.55)] backdrop-blur-[8px]">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="text-rc-spark [text-shadow:0_0_8px_rgba(253,225,160,0.5)]">
                ✦
              </span>
              <span className="rc-eyebrow">cookies</span>
            </div>
            <p className="m-0 mb-3.5 text-rc-fg-muted">
              No third party tracking. Cookies are only for authentication and
              simulator functionality. You can delete your data at any time.
            </p>
            <div className="flex justify-end gap-2">
              <RcButton size="sm" onClick={dismissCookies}>
                Got it
              </RcButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
