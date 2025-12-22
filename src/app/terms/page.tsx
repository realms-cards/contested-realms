import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100 px-6 py-10">
      <main className="max-w-3xl mx-auto space-y-8">
        <header className="flex items-start justify-between gap-4">
          <h1 className="text-2xl sm:text-3xl font-semibold font-fantaisie">
            Terms of Service
          </h1>
          <Link
            href="/"
            className="text-sm underline text-slate-300 hover:text-slate-100"
          >
            Home
          </Link>
        </header>

        <p className="text-xs text-slate-400">Last updated: 2025-12-22</p>

        <section className="space-y-4 text-sm text-slate-200/90 leading-relaxed">
          <p>
            Realms.cards is an independent, community-run simulator for Sorcery:
            Contested Realms.
          </p>
          <p>
            By accessing or using the site, you agree to these Terms of Service.
            If you do not agree, do not use the site.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-200/90 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-100">
            Use of the service
          </h2>
          <p>
            You may use the service for personal, non-commercial, community, and
            educational purposes.
          </p>
          <p>
            You agree not to misuse the service, including attempting to disrupt
            gameplay, probe for vulnerabilities, abuse other users, or upload
            content you do not have the right to share.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-200/90 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-100">
            Rules of conduct
          </h2>
          <p>
            We want Realms.cards to remain welcoming and respectful. Harassment,
            hateful or profane language, threats, or abusive behavior in chat,
            lobbies, matches, or other areas of the service are not allowed. We
            may warn, suspend, or ban users at our discretion for conduct that
            violates these expectations.
          </p>
          <p>
            If you experience abusive behavior, please contact us and include
            any relevant details so we can investigate.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-200/90 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-100">Accounts</h2>
          <p>
            If you create an account, you are responsible for maintaining the
            confidentiality of your login method and for all activity under your
            account.
          </p>
          <p>
            We may suspend or terminate accounts that violate these terms or
            that harm the service or other users.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-200/90 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-100">
            Intellectual property
          </h2>
          <p>
            All rights to Sorcery: Contested Realms and affiliated intellectual
            property (including card images, artwork, logos, and trademarks)
            remain with Erik’s Curiosa Limited and/or the original artists.
          </p>
          <p>
            Realms.cards is not affiliated with or endorsed by Erik’s Curiosa
            Limited.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-200/90 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-100">Disclaimer</h2>
          <p>
            The service is provided “as is” and “as available” without
            warranties of any kind. We do not guarantee uninterrupted or
            error-free operation.
          </p>
          <p>
            To the fullest extent permitted by law, we are not liable for any
            indirect, incidental, special, consequential, or punitive damages
            arising out of your use of the service.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-200/90 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-100">Contact</h2>
          <p>
            Questions about these terms can be sent to{" "}
            <a
              href="mailto:kingofthe@realms.cards"
              className="underline text-slate-300 hover:text-slate-100"
            >
              kingofthe@realms.cards
            </a>
            .
          </p>
        </section>

        <footer className="pt-2 text-sm">
          <Link
            href="/privacy"
            className="underline text-slate-300 hover:text-slate-100"
          >
            Read our Privacy Policy
          </Link>
        </footer>
      </main>
    </div>
  );
}
