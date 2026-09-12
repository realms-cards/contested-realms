import Link from "next/link";
import AppShell from "@/components/ui/AppShell";
import { Divider } from "@/components/ui/divider";
import { PageHeader } from "@/components/ui/page-header";
import { RcLinkButton } from "@/components/ui/rc-button";

const PROSE = "font-rc-sans text-[15px] leading-[1.65] text-rc-fg";
const HEADING = "m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong";

export default function PrivacyPolicyPage() {
  return (
    <AppShell width="narrow">
      <PageHeader
        eyebrow="legal"
        title="Privacy Policy"
        description="Last updated: 2025-12-22"
        actions={
          <RcLinkButton href="/" variant="outline" size="sm">
            Home
          </RcLinkButton>
        }
      />

      <section className={`${PROSE} space-y-4`}>
        <p className="m-0">
          Realms.cards is an independent, community-run simulator for Sorcery:
          Contested Realms.
        </p>
        <p className="m-0">
          This Privacy Policy explains what information we collect, how we use
          it, and what choices you have.
        </p>
      </section>

      <Divider star="" className="my-0" />

      <section className={`${PROSE} space-y-3`}>
        <h2 className={HEADING}>Information we collect</h2>
        <p className="m-0">
          Depending on how you use the service, we may collect and store the
          following:
        </p>
        <div className="space-y-2">
          <p className="m-0">
            1. Account information such as a user ID, display name, and
            authentication identifiers.
          </p>
          <p className="m-0">
            2. Gameplay information such as decks you create, tournament
            participation, and match state or match history needed for replay
            or moderation.
          </p>
          <p className="m-0">
            3. User-generated content such as chat messages you send in lobbies
            or matches.
          </p>
          <p className="m-0">
            4. Basic technical information such as error logs and diagnostics to
            maintain and improve the service.
          </p>
        </div>
      </section>

      <Divider star="" className="my-0" />

      <section className={`${PROSE} space-y-3`}>
        <h2 className={HEADING}>How we use information</h2>
        <div className="space-y-2">
          <p className="m-0">
            1. To operate the service (authentication, deck storage, matches,
            tournaments, and replays).
          </p>
          <p className="m-0">2. To prevent abuse and keep the service secure.</p>
          <p className="m-0">
            3. To debug issues and improve performance and reliability.
          </p>
        </div>
      </section>

      <Divider star="" className="my-0" />

      <section className={`${PROSE} space-y-3`}>
        <h2 className={HEADING}>Cookies and local storage</h2>
        <p className="m-0">
          We do not use third-party tracking cookies. Cookies and local storage
          are used only for authentication, simulator functionality, and saving
          preferences.
        </p>
      </section>

      <Divider star="" className="my-0" />

      <section className={`${PROSE} space-y-3`}>
        <h2 className={HEADING}>Your choices and data deletion</h2>
        <p className="m-0">
          You can delete your account and associated data using the in-app
          account deletion option in Settings. If you need assistance, contact
          us.
        </p>
      </section>

      <Divider star="" className="my-0" />

      <section className={`${PROSE} space-y-3`}>
        <h2 className={HEADING}>Contact</h2>
        <p className="m-0">
          Questions about privacy can be sent to{" "}
          <a href="mailto:kingofthe@realms.cards" className="rc-link">
            kingofthe@realms.cards
          </a>
          .
        </p>
      </section>

      <footer className={PROSE}>
        <Link href="/terms" className="rc-link">
          Read our Terms of Service
        </Link>
      </footer>
    </AppShell>
  );
}
