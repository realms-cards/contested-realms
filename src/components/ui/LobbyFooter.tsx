"use client";

import Link from "next/link";
import ChangelogOverlay from "@/components/ui/ChangelogOverlay";
import CombinedMarquee from "@/components/ui/CombinedMarquee";
import ManualOverlay from "@/components/ui/ManualOverlay";

export default function LobbyFooter() {
  return (
    <>
      <div className="mt-8 text-center text-xs text-slate-500 space-x-3">
        <span>Info & Support:</span>
        <a
          href="https://discord.gg/UE2Gfbxjym"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md 
              bg-gradient-to-r from-fuchsia-500/20 via-purple-400/30 to-violet-500/20 
              border border-purple-400/50 hover:border-purple-300/80
              text-purple-200 hover:text-purple-100 font-medium
              shadow-[0_0_12px_rgba(168,85,247,0.3)] hover:shadow-[0_0_20px_rgba(168,85,247,0.5)]
              transition-all duration-300"
        >
          Official Discord
        </a>
        <span>·</span>
        <a
          href="mailto:kingofthe@realms.cards"
          className="underline hover:text-slate-300"
        >
          Email
        </a>
        <span>·</span>
        <ChangelogOverlay />
        <span>·</span>
        <ManualOverlay />
        <span>·</span>
        <Link href="/terms" className="underline hover:text-slate-300">
          Terms
        </Link>
        <span>·</span>
        <Link href="/privacy" className="underline hover:text-slate-300">
          Privacy
        </Link>
        <span>·</span>
        <a
          href="https://www.patreon.com/realmscards"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md 
              bg-gradient-to-r from-blue-500/20 via-sky-400/30 to-blue-500/20 
              border border-blue-400/50 hover:border-blue-300/80
              text-blue-200 hover:text-blue-100 font-medium
              shadow-[0_0_12px_rgba(59,130,246,0.3)] hover:shadow-[0_0_20px_rgba(59,130,246,0.5)]
              transition-all duration-300"
        >
          Patreon
        </a>
        <span>·</span>
        <a
          href="https://github.com/realms-cards/contested-realms"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center align-middle text-slate-400 hover:text-slate-200 transition-colors duration-300"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z" />
          </svg>
        </a>
      </div>
      <CombinedMarquee />
    </>
  );
}
