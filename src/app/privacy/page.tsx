import Link from "next/link";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100 px-6 py-10">
      <main className="max-w-3xl mx-auto space-y-8">
        <header className="flex items-start justify-between gap-4">
          <h1 className="text-2xl sm:text-3xl font-semibold font-fantaisie">
            Privacy Policy
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
            This Privacy Policy explains what information we collect, how we use
            it, and what choices you have.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-200/90 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-100">
            Information we collect
          </h2>
          <p>
            Depending on how you use the service, we may collect and store the
            following:
          </p>
          <div className="space-y-2">
            <p>
              1. Account information such as a user ID, display name, and
              authentication identifiers.
            </p>
            <p>
              2. Gameplay information such as decks you create, tournament
              participation, and match state or match history needed for replay
              or moderation.
            </p>
            <p>
              3. User-generated content such as chat messages you send in
              lobbies or matches.
            </p>
            <p>
              4. Basic technical information such as error logs and diagnostics
              to maintain and improve the service.
            </p>
          </div>
        </section>

        <section className="space-y-3 text-sm text-slate-200/90 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-100">
            How we use information
          </h2>
          <div className="space-y-2">
            <p>
              1. To operate the service (authentication, deck storage, matches,
              tournaments, and replays).
            </p>
            <p>2. To prevent abuse and keep the service secure.</p>
            <p>3. To debug issues and improve performance and reliability.</p>
          </div>
        </section>

        <section className="space-y-3 text-sm text-slate-200/90 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-100">
            Cookies and local storage
          </h2>
          <p>
            We do not use third-party tracking cookies. Cookies and local
            storage are used only for authentication, simulator functionality,
            and saving preferences.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-200/90 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-100">
            Your choices and data deletion
          </h2>
          <p>
            You can delete your account and associated data using the in-app
            account deletion option in Settings. If you need assistance, contact
            us.
          </p>
        </section>

        <section className="space-y-3 text-sm text-slate-200/90 leading-relaxed">
          <h2 className="text-lg font-semibold text-slate-100">Contact</h2>
          <p>
            Questions about privacy can be sent to{" "}
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
            href="/terms"
            className="underline text-slate-300 hover:text-slate-100"
          >
            Read our Terms of Service
          </Link>
        </footer>
      </main>
    </div>
  );
}
