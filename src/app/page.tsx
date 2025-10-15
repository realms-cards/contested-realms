"use client";

import Link from "next/link";
import { useEffect } from "react";
import AsciiBottomArt from "@/components/ui/AsciiBottomArt";
import AsciiLogo from "@/components/ui/AsciiLogo";
import AsciiPanel from "@/components/ui/AsciiPanel";
import OtherRealms from "@/components/ui/OtherRealms";

export default function Home() {
  // Set home page title
  useEffect(() => {
    document.title = "Realms.cards";
  }, []);

  return (
    <div className="h-dvh bg-gradient-to-b from-slate-950 to-slate-900 text-white flex flex-col items-center justify-center px-5 relative overflow-hidden">
      <div className="relative z-10 max-w-5xl w-full text-center space-y-8 pt-10 pb-12">
        {/* ASCII Logotype */}
        <AsciiLogo className="max-w-4xl mx-auto" />

        {/* Primary Navigation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {/* Local Hotseat */}
          <AsciiPanel>
            <Link
              href="/play"
              className="group block hover:scale-[1.02] transition-transform duration-200"
            >
              <div className="flex items-center justify-center py-7">
                <h3 className="text-2xl font-semibold tracking-wide">
                  Local Hotseat
                </h3>
              </div>
            </Link>
          </AsciiPanel>

          {/* Contest a Realm (Online) */}
          <AsciiPanel>
            <Link
              href="/online/lobby"
              className="group block hover:scale-[1.02] transition-transform duration-200"
            >
              <div className="flex items-center justify-center py-7">
                <h3 className="text-2xl font-semibold tracking-wide">
                  Online Realms
                </h3>
              </div>
            </Link>
          </AsciiPanel>
        </div>

        {/* Secondary Links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
          <AsciiPanel>
            <Link
              href="/draft-3d"
              className="group block hover:scale-[1.02] transition-transform duration-200"
            >
              <div className="flex items-center justify-center py-4">
                <h4 className="text-lg font-semibold tracking-wide">
                  Draft Simulator
                </h4>
              </div>
            </Link>
          </AsciiPanel>
          <AsciiPanel>
            <Link
              href="/decks"
              className="group block hover:scale-[1.02] transition-transform duration-200"
            >
              <div className="flex items-center justify-center py-4">
                <h4 className="text-lg font-semibold tracking-wide">Decks</h4>
              </div>
            </Link>
          </AsciiPanel>
          <AsciiPanel>
            <Link
              href="/cubes"
              className="group block hover:scale-[1.02] transition-transform duration-200"
            >
              <div className="flex items-center justify-center py-4">
                <h4 className="text-lg font-semibold tracking-wide">Cubes</h4>
              </div>
            </Link>
          </AsciiPanel>
        </div>

        {/* Other Realms (wide bottom element) */}
        <div className="max-w-5xl mx-auto cursor-pointer">
          <OtherRealms />
        </div>

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
    </div>
  );
}
