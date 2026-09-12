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

/**
 * Home-route footer (design system v2): community chips, support links, the
 * rights notice and the mono signature line, then the supporters marquee.
 */
export default function LobbyFooter() {
  return (
    <footer className="pt-2 text-center">
      <Divider label="info & support" />
      <div className="flex flex-wrap items-center justify-center gap-x-[18px] gap-y-2.5 font-rc-mono text-xs tracking-[0.1em] text-rc-fg-subtle">
        <CommunityChip kind="discord" href="https://discord.gg/UE2Gfbxjym">
          Official Discord
        </CommunityChip>
        <CommunityChip kind="patreon" href="https://www.patreon.com/realmscards">
          Support on Patreon
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
      <p className="mx-auto mt-[18px] max-w-[640px] font-rc-sans text-xs leading-[1.7] text-rc-fg-subtle">
        All rights to Sorcery: Contested Realms and affiliated intellectual
        property, including card images, artwork, logos and trademarks, remain
        with Erik&apos;s Curiosa Limited and the original artists. Visit the
        official site at{" "}
        <a
          href="https://curiosa.io"
          target="_blank"
          rel="noopener noreferrer"
          className="rc-link"
        >
          curiosa.io
        </a>
        . This simulator is an independent community project, provided as-is,
        free of charge for community and educational purposes.
      </p>
      <div className="mt-3.5 font-rc-mono text-[11px] tracking-[0.15em] text-rc-accent-link">
        <span className="text-rc-spark">✦</span>
        {"  realms.cards  ·  fan-made simulator  ·  open source  "}
        <span className="text-rc-spark">✦</span>
      </div>
      <div className="mt-4">
        <CombinedMarquee />
      </div>
    </footer>
  );
}
