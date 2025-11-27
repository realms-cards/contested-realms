"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import AsciiBottomArt from "@/components/ui/AsciiBottomArt";
import AsciiLogo from "@/components/ui/AsciiLogo";
import AsciiPanel from "@/components/ui/AsciiPanel";
import OtherRealms from "@/components/ui/OtherRealms";

export default function Home() {
  const router = useRouter();
  const { data: session } = useSession();
  const [showAlphaBanner, setShowAlphaBanner] = useState(true);
  const [showCookieNotice, setShowCookieNotice] = useState(true);
  // Set home page title
  useEffect(() => {
    document.title = "Realms.cards";
    try {
      const alphaDismissed =
        typeof window !== "undefined"
          ? window.localStorage.getItem("sorcery:alphaBannerDismissed")
          : null;
      if (alphaDismissed === "1") setShowAlphaBanner(false);
      const cookieDismissed =
        typeof window !== "undefined"
          ? window.localStorage.getItem("sorcery:cookieNoticeDismissed")
          : null;
      if (cookieDismissed === "1") setShowCookieNotice(false);
    } catch {}
  }, []);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-950 to-slate-900 text-white flex flex-col items-center justify-start px-5 relative overflow-x-hidden overflow-y-auto">
      <div className="relative z-10 max-w-6xl w-full text-center space-y-6 md:space-y-7 pt-8 md:pt-10 pb-10 md:pb-12">
        {showAlphaBanner && (
          <div className="max-w-5xl mx-auto">
            <div className="bg-orange-900/50 border border-orange-500/50 text-orange-100 rounded-md px-4 py-3 flex items-center justify-between shadow">
              <p className="text-sm md:text-base font-medium">
                Currently in Open Alpha - Data might be lost in the future -
                back up your decks!
              </p>
              <button
                type="button"
                onClick={() => {
                  try {
                    window.localStorage.setItem(
                      "sorcery:alphaBannerDismissed",
                      "1"
                    );
                  } catch {}
                  setShowAlphaBanner(false);
                }}
                className="ml-4 inline-flex items-center rounded px-2 py-1 text-orange-100/90 hover:text-white hover:bg-orange-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/70"
                aria-label="Dismiss banner"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* ASCII Logotype */}
        <AsciiLogo className="max-w-4xl mx-auto" />

        {/* Primary Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-1 gap-5 xl:gap-6 max-w-6xl mx-auto">
          {/* Local Hotseat 
          <AsciiPanel className="p-5 md:p-6">
            <Link
              href="/play"
              className="group block hover:scale-[1.02] transition-transform duration-200"
            >
              <div className="flex items-center justify-center py-5 md:py-6">
                <h3 className="text-2xl font-semibold tracking-wide">
                  Local Hotseat
                </h3>
              </div>
            </Link>
          </AsciiPanel>
          */}

          {session ? (
            <AsciiPanel className="max-w-4xl min-w-2xl p-5 md:p-6 justify-self-center">
              <Link
                href="/online/lobby"
                className="group block hover:scale-[1.02] transition-transform duration-200"
              >
                <div className="flex items-center justify-center py-5 md:py-6">
                  <h3 className="text-2xl font-semibold tracking-wide">
                    Online Realms
                  </h3>
                </div>
              </Link>
            </AsciiPanel>
          ) : (
            <AsciiPanel className="w-4xl p-5 md:p-6 justify-self-center">
              <button
                type="button"
                onClick={() => router.push("/auth/signin")}
                className="group block w-full hover:scale-[1.02] transition-transform duration-200"
              >
                <div className="flex items-center justify-center py-5 md:py-6">
                  <h3 className="text-2xl font-semibold tracking-wide">
                    Sign In
                  </h3>
                </div>
              </button>
            </AsciiPanel>
          )}
        </div>

        {/* Secondary Links */}
        {session && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 max-w-4xl min-w-2xl justify-self-center">
            <AsciiPanel className="p-5 md:p-6">
              <Link
                href="/decks"
                className="group block hover:scale-[1.02] transition-transform duration-200"
              >
                <div className="flex items-center justify-center py-3 md:py-4">
                  <h4 className="text-lg font-semibold tracking-wide">
                    Your Decks
                  </h4>
                </div>
              </Link>
            </AsciiPanel>
            <AsciiPanel className="p-5 md:p-6">
              <Link
                href="/collection"
                className="group block hover:scale-[1.02] transition-transform duration-200"
              >
                <div className="flex items-center justify-center py-3 md:py-4">
                  <h4 className="text-lg font-semibold tracking-wide">
                    Your Collection
                  </h4>
                </div>
              </Link>
            </AsciiPanel>
          </div>
        )}

        {/* Other Realms (wide bottom element) */}
        {session && (
          <div className="min-w-2xl max-w-3xlp-5 md:p-6 justify-self-center cursor-pointer">
            <OtherRealms />
          </div>
        )}

        {/* Footer */}
        <div className="text-xs text-orange-300/80">
          <p>
            All rights to Sorcery: Contested Realms and affiliated intellectual
            property, including but not limited to card images, artwork, logos,
            and trademarks, remain with Erik’s Curiosa Limited and or the
            original artists. Visit the official site at{" "}
            <a
              href="https://curiosa.io"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-orange-200/90 hover:text-orange-100"
            >
              curiosa.io
            </a>
            .
            <br />
            This simulator is an independent community focused project and is
            provided as is:
            <br />
            free of charge for community and educational purposes only.
          </p>
          <p />
        </div>

        <div className="mx-auto mt-6 text-xs text-orange-200/80 grid grid-cols-3 items-center gap-1">
          <a
            href="https://github.com/realms-cards/issues/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-orange-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/70"
            aria-label="Report an issue on GitHub"
          >
            Report an Issue
          </a>
          <a
            href="https://realms.cards"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-orange-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/70"
            aria-label="Realms.cards"
          >
            Realms.cards
          </a>
          <a
            href="mailto:kingofthe@realms.cards"
            className="underline hover:text-orange-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300/70"
            aria-label="Email the Realms team"
          >
            Email Us
          </a>
        </div>
      </div>

      {/* Bottom ASCII art background */}
      <AsciiBottomArt opacityClass="text-white/12" maxVh={null} />

      {/* Cookie/Privacy notice toast */}
      {showCookieNotice && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[calc(100%-2rem)]">
          <div className="bg-slate-800/95 backdrop-blur border border-slate-700/50 rounded-lg px-4 py-3 shadow-xl flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-300 leading-tight">
              We are not using third party tracking cookies. All cookies are for
              authentication and simulator functionality only. Users have the
              ability to delete all of their own data.
            </p>
            <button
              type="button"
              onClick={() => {
                try {
                  window.localStorage.setItem(
                    "sorcery:cookieNoticeDismissed",
                    "1"
                  );
                } catch {}
                setShowCookieNotice(false);
              }}
              className="shrink-0 text-slate-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-white/10"
              aria-label="Dismiss cookie notice"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
