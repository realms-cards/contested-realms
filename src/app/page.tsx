"use client";

import { Gamepad2, Users, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function Home() {
  // Set home page title
  useEffect(() => {
    document.title = "Contested Realms";
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white flex items-center justify-center p-8">
      <div className="max-w-4xl w-full text-center space-y-12">
        {/* Header */}
        <div className="space-y-4">
          <h1 className="text-6xl font-bold bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
            Sorcery
          </h1>
          <p className="text-xl text-slate-300">
            Contested Realm • Digital Client
          </p>
          <p className="text-sm text-slate-400 max-w-2xl mx-auto">
            Experience the strategic depth of Sorcery: Contested Realm with this
            immersive 3D digital client. Play online with friends or practice
            offline.
          </p>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {/* Offline Play */}
          <Link
            href="/play"
            className="group bg-gradient-to-br from-blue-900/50 to-blue-800/30 ring-1 ring-blue-500/30 rounded-2xl p-8 hover:ring-blue-400/50 hover:scale-[1.02] transition-all duration-200"
          >
            <div className="flex flex-col items-center space-y-4">
              <div className="p-4 bg-blue-500/20 rounded-full group-hover:bg-blue-500/30 transition-colors">
                <Gamepad2 className="w-8 h-8 text-blue-400" />
              </div>
              <h3 className="text-2xl font-semibold text-blue-100">
                Offline Play
              </h3>
              <p className="text-blue-200/80 text-center">
                Play locally with hot-seat multiplayer. Perfect for learning the
                game or playing with friends at the same computer.
              </p>
            </div>
          </Link>

          {/* Online Multiplayer */}
          <Link
            href="/online/lobby"
            className="group bg-gradient-to-br from-emerald-900/50 to-emerald-800/30 ring-1 ring-emerald-500/30 rounded-2xl p-8 hover:ring-emerald-400/50 hover:scale-[1.02] transition-all duration-200"
          >
            <div className="flex flex-col items-center space-y-4">
              <div className="p-4 bg-emerald-500/20 rounded-full group-hover:bg-emerald-500/30 transition-colors">
                <Users className="w-8 h-8 text-emerald-400" />
              </div>
              <h3 className="text-2xl font-semibold text-emerald-100">
                Online Multiplayer
              </h3>
              <p className="text-emerald-200/80 text-center">
                Connect with players worldwide. Create or join matches, chat
                with opponents, and compete online.
              </p>
            </div>
          </Link>
        </div>

        {/* Features */}
        <div className="bg-slate-800/50 ring-1 ring-slate-700/50 rounded-2xl p-8 max-w-2xl mx-auto">
          <div className="flex items-center justify-center mb-4">
            <Zap className="w-6 h-6 text-yellow-400 mr-2" />
            <h3 className="text-xl font-semibold">Features</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm text-slate-300">
            <div>• 3D Interactive Board</div>
            <div>• Full Sorcery Rules</div>
            <div>• Deck Import System</div>
            <div>• Real-time Multiplayer</div>
            <div>• Match Spectating</div>
            <div>• Tournament Support</div>
          </div>
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
