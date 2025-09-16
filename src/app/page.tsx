"use client";

import Link from "next/link";
import { useEffect } from "react";
import AsciiLogo from "@/components/ui/AsciiLogo";
import AsciiPanel from "@/components/ui/AsciiPanel";

export default function Home() {
  // Set home page title
  useEffect(() => {
    document.title = "Contested Realms";
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white flex flex-col items-center pt-10 pb-12 px-5">
      <div className="max-w-5xl w-full text-center space-y-8">
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
              href="/decks/editor-3d"
              className="group block hover:scale-[1.02] transition-transform duration-200"
            >
              <div className="flex items-center justify-center py-4">
                <h4 className="text-lg font-semibold tracking-wide">
                  Deck Editor
                </h4>
              </div>
            </Link>
          </AsciiPanel>
        </div>

        {/* Footer */}
        <div className="text-xs text-slate-500 space-y-1">
          <p>Sorcery: Contested Realm is a trademark of Erik&apos;s Curiosa.</p>
          <p>
            This is an unofficial digital client for educational and
            entertainment purposes.
          </p>
        </div>
      </div>
    </div>
  );
}
