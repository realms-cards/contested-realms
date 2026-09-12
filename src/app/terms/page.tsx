import Link from "next/link";
import AppShell from "@/components/ui/AppShell";
import { Divider } from "@/components/ui/divider";
import { PageHeader } from "@/components/ui/page-header";
import { RcLinkButton } from "@/components/ui/rc-button";

const PROSE = "font-rc-sans text-[15px] leading-[1.65] text-rc-fg";
const HEADING = "m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong";

export default function TermsPage() {
  return (
    <AppShell width="narrow">
      <PageHeader
        eyebrow="legal"
        title="Terms of Service"
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
          By accessing or using the site, you agree to these Terms of Service.
          If you do not agree, do not use the site.
        </p>
      </section>

      <Divider star="" className="my-0" />

      <section className={`${PROSE} space-y-3`}>
        <h2 className={HEADING}>Use of the service</h2>
        <p className="m-0">
          You may use the service for personal, non-commercial, community, and
          educational purposes.
        </p>
        <p className="m-0">
          You agree not to misuse the service, including attempting to disrupt
          gameplay, probe for vulnerabilities, abuse other users, or upload
          content you do not have the right to share.
        </p>
      </section>

      <Divider star="" className="my-0" />

      <section className={`${PROSE} space-y-3`}>
        <h2 className={HEADING}>Rules of conduct</h2>
        <p className="m-0">
          We want Realms.cards to remain welcoming and respectful. Harassment,
          hateful or profane language, threats, or abusive behavior in chat,
          lobbies, matches, or other areas of the service are not allowed. We
          may warn, suspend, or ban users at our discretion for conduct that
          violates these expectations.
        </p>
        <p className="m-0">
          If you experience abusive behavior, please contact us and include any
          relevant details so we can investigate.
        </p>
      </section>

      <Divider star="" className="my-0" />

      <section className={`${PROSE} space-y-3`}>
        <h2 className={HEADING}>Accounts</h2>
        <p className="m-0">
          If you create an account, you are responsible for maintaining the
          confidentiality of your login method and for all activity under your
          account.
        </p>
        <p className="m-0">
          We may suspend or terminate accounts that violate these terms or that
          harm the service or other users.
        </p>
      </section>

      <Divider star="" className="my-0" />

      <section className={`${PROSE} space-y-3`}>
        <h2 className={HEADING}>Intellectual property</h2>
        <p className="m-0">
          All rights to Sorcery: Contested Realms and affiliated intellectual
          property (including card images, artwork, logos, and trademarks)
          remain with Erik’s Curiosa Limited and/or the original artists.
        </p>
        <p className="m-0">
          Realms.cards is not affiliated with or endorsed by Erik’s Curiosa
          Limited.
        </p>
      </section>

      <Divider star="" className="my-0" />

      <section className={`${PROSE} space-y-3`}>
        <h2 className={HEADING}>Disclaimer</h2>
        <p className="m-0">
          The service is provided “as is” and “as available” without warranties
          of any kind. We do not guarantee uninterrupted or error-free
          operation.
        </p>
        <p className="m-0">
          To the fullest extent permitted by law, we are not liable for any
          indirect, incidental, special, consequential, or punitive damages
          arising out of your use of the service.
        </p>
      </section>

      <Divider star="" className="my-0" />

      <section className={`${PROSE} space-y-3`}>
        <h2 className={HEADING}>Contact</h2>
        <p className="m-0">
          Questions about these terms can be sent to{" "}
          <a href="mailto:kingofthe@realms.cards" className="rc-link">
            kingofthe@realms.cards
          </a>
          .
        </p>
      </section>

      <footer className={PROSE}>
        <Link href="/privacy" className="rc-link">
          Read our Privacy Policy
        </Link>
      </footer>
    </AppShell>
  );
}
