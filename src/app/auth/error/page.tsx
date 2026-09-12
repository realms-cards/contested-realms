"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import AppShell from "@/components/ui/AppShell";
import { PageHeader } from "@/components/ui/page-header";
import { RcLinkButton } from "@/components/ui/rc-button";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ErrorPageProps {}

const errorMessages: Record<string, string> = {
  Configuration: "There is a problem with the server configuration.",
  AccessDenied: "You do not have permission to sign in.",
  Verification: "The verification token has expired or has already been used.",
  OAuthSignin: "Error in constructing an authorization URL.",
  OAuthCallback: "Error in handling the response from an OAuth provider.",
  OAuthCreateAccount: "Could not create OAuth account.",
  EmailCreateAccount: "Could not create email account.",
  Callback: "Error in the OAuth callback handler route.",
  OAuthAccountNotLinked:
    "The account is not linked. Please try signing in with the account you originally used.",
  EmailSignin: "Sending the e-mail with the verification token failed.",
  CredentialsSignin:
    "Invalid credentials provided. Please check your input and try again.",
  SessionRequired: "You must be signed in to view this page.",
  Default: "An unexpected error occurred. Please try again.",
};

function ErrorContent() {
  const searchParams = useSearchParams();
  const error = searchParams?.get("error") || "Default";

  const errorMessage = errorMessages[error] || errorMessages.Default;

  return (
    <AppShell width="narrow">
      <section className="rc-panel mx-auto w-full max-w-md p-6">
        <PageHeader
          size="md"
          eyebrow="sign in"
          title="Authentication Error"
        />

        <div className="rc-alert mt-5" data-tone="danger">
          {errorMessage}
        </div>

        {error === "OAuthAccountNotLinked" && (
          <div className="rc-alert mt-3" data-tone="info">
            This usually happens when you try to sign in with a different
            provider than the one you originally used. Please use the same
            provider you used to create your account.
          </div>
        )}

        {error === "CredentialsSignin" && (
          <div className="rc-alert mt-3" data-tone="warning">
            For the 2FA test provider, make sure you&apos;re using the correct
            code (default: 424242).
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3">
          <RcLinkButton href="/auth/signin" className="w-full">
            Try Again
          </RcLinkButton>
          <RcLinkButton href="/" variant="outline" className="w-full">
            Go Home
          </RcLinkButton>
        </div>

        {process.env.NODE_ENV === "development" && (
          <div className="rc-hint mt-6 rounded-rc-md border border-rc-line/12 bg-black/30 px-3 py-2">
            Debug info: {error}
          </div>
        )}
      </section>
    </AppShell>
  );
}

export default function ErrorPage({}: ErrorPageProps) {
  return (
    <Suspense
      fallback={
        <AppShell width="narrow">
          <div className="rc-hint py-6 text-center">loading…</div>
        </AppShell>
      }
    >
      <ErrorContent />
    </Suspense>
  );
}
