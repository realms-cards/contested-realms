"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import AppShell from "@/components/ui/AppShell";
import { PageHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";

type ConfirmState = {
  nextUrl: string | null;
  error: string | null;
};

function resolveNextUrl(raw: string, origin: string): ConfirmState {
  if (!raw) {
    return { nextUrl: null, error: "Missing sign-in link." };
  }
  try {
    const parsed = new URL(raw, origin);
    if (parsed.origin !== origin) {
      return { nextUrl: null, error: "Invalid sign-in link." };
    }
    if (!parsed.pathname.startsWith("/api/auth/callback/")) {
      return { nextUrl: null, error: "Invalid sign-in link." };
    }
    return { nextUrl: parsed.toString(), error: null };
  } catch {
    return { nextUrl: null, error: "Invalid sign-in link." };
  }
}

export default function ConfirmSignInPage() {
  const searchParams = useSearchParams();
  const nextParam = searchParams?.get("next") || "";
  const emailParam = searchParams?.get("email");
  const [state, setState] = useState<ConfirmState>({
    nextUrl: null,
    error: null,
  });

  useEffect(() => {
    const origin = window.location.origin;
    setState(resolveNextUrl(nextParam, origin));
  }, [nextParam]);

  return (
    <AppShell width="narrow">
      <section className="rc-panel mx-auto w-full max-w-md p-6">
        <PageHeader
          size="md"
          eyebrow="realms.cards"
          title="Confirm sign-in"
          description="To protect against email scanners, please confirm before we finish signing you in."
        />

        {emailParam ? (
          <div className="mt-5 rounded-rc-md border border-rc-line/18 bg-black/30 px-4 py-3 font-rc-mono text-xs tracking-[0.06em] text-rc-fg">
            Signing in as{" "}
            <span className="text-rc-fg-strong">{emailParam}</span>
          </div>
        ) : null}

        {state.error ? (
          <div className="rc-alert mt-5" data-tone="danger">
            {state.error} Please request a new magic link.
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          <RcButton
            className="w-full"
            onClick={() => {
              if (state.nextUrl) {
                window.location.assign(state.nextUrl);
              }
            }}
            disabled={!state.nextUrl}
          >
            Continue to sign in
          </RcButton>
          <a href="/auth/signin" className="rc-link text-center text-sm">
            Back to sign in
          </a>
        </div>
      </section>
    </AppShell>
  );
}
