"use client";

import Link from "next/link";
import ChangelogOverlay from "@/components/ui/ChangelogOverlay";
import CombinedMarquee from "@/components/ui/CombinedMarquee";
import ManualOverlay from "@/components/ui/ManualOverlay";
import { CommunityChip } from "@/components/ui/community-chip";
import { Divider } from "@/components/ui/divider";

const LINK =
  "text-rc-fg-subtle transition-colors hover:text-rc-accent-ring underline-offset-4 hover:underline";

function Dot() {
  return (
    <span className="text-rc-fg-dim" aria-hidden="true">
      ·
    </span>
  );
}

/** Lobby footer: info & support divider, community chips, links, attribution. */
export default function LobbyPageFooter() {
  return (
    <footer className="pt-2">
      <Divider label="info & support" star="" />
      <div className="flex flex-wrap items-center justify-center gap-x-[18px] gap-y-2.5 font-rc-mono text-xs tracking-[0.1em] text-rc-fg-subtle">
        <CommunityChip kind="discord" href="https://discord.gg/UE2Gfbxjym">
          Official Discord
        </CommunityChip>
        <CommunityChip kind="patreon" href="https://www.patreon.com/realmscards">
          Patreon
        </CommunityChip>
        <a href="mailto:kingofthe@realms.cards" className={LINK}>
          Email
        </a>
        <Dot />
        <ChangelogOverlay triggerClassName={LINK} />
        <Dot />
        <ManualOverlay variant="plain" triggerClassName={LINK} />
        <Dot />
        <Link href="/terms" className={LINK}>
          Terms
        </Link>
        <Dot />
        <Link href="/privacy" className={LINK}>
          Privacy
        </Link>
        <Dot />
        <a
          href="https://github.com/realms-cards/contested-realms"
          target="_blank"
          rel="noopener noreferrer"
          className={LINK}
        >
          GitHub
        </a>
      </div>
      <div className="mt-[18px] text-center font-rc-mono text-[11px] tracking-[0.15em] text-rc-fg-dim">
        realms.cards · fan-made simulator · all rights to Sorcery: Contested
        Realm remain with Erik&apos;s Curiosa Limited
      </div>
      <div className="mt-4">
        <CombinedMarquee />
      </div>
    </footer>
  );
}
