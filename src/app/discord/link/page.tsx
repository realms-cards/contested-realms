"use client";

import { useSearchParams } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/ui/AppShell";
import { PageHeader } from "@/components/ui/page-header";
import { RcButton, RcLinkButton } from "@/components/ui/rc-button";

type LinkStatus =
  | "loading"
  | "not-signed-in"
  | "invalid"
  | "expired"
  | "already-linked"
  | "success"
  | "error";

const STATUS_TITLES: Record<LinkStatus, string> = {
  loading: "Linking Discord Account…",
  "not-signed-in": "Sign In Required",
  invalid: "Invalid Link",
  expired: "Link Expired",
  "already-linked": "Already Linked",
  success: "Successfully Linked",
  error: "Something Went Wrong",
};

export default function DiscordLinkPage() {
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();
  const [linkStatus, setLinkStatus] = useState<LinkStatus>("loading");
  const [discordTag, setDiscordTag] = useState<string>("");
  const [error, setError] = useState<string>("");

  const token = searchParams?.get("token") ?? null;

  const linkAccount = useCallback(async () => {
    if (!token || !session?.user) return;

    try {
      const response = await fetch("/api/discord/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (response.ok) {
        setDiscordTag(data.discordTag || "");
        setLinkStatus("success");
      } else if (response.status === 400) {
        setLinkStatus("invalid");
        setError(data.error || "Invalid token");
      } else if (response.status === 410) {
        setLinkStatus("expired");
      } else if (response.status === 409) {
        setLinkStatus("already-linked");
        setError(data.error || "Account already linked");
      } else {
        setLinkStatus("error");
        setError(data.error || "Failed to link account");
      }
    } catch (err) {
      console.error("[discord/link] Error:", err);
      setLinkStatus("error");
      setError("Failed to connect to server");
    }
  }, [token, session?.user]);

  useEffect(() => {
    if (!token) {
      setLinkStatus("invalid");
      return;
    }

    if (sessionStatus === "loading") {
      return;
    }

    if (sessionStatus === "unauthenticated") {
      setLinkStatus("not-signed-in");
      return;
    }

    // User is authenticated, attempt to link
    linkAccount();
  }, [token, sessionStatus, linkAccount]);

  function handleSignIn() {
    // Sign in and return to this page
    signIn(undefined, { callbackUrl: window.location.href });
  }

  return (
    <AppShell width="narrow">
      <section className="rc-panel mx-auto w-full max-w-md p-6">
        <PageHeader
          size="md"
          eyebrow="discord"
          title={STATUS_TITLES[linkStatus]}
        />

        <div className="mt-5 font-rc-sans text-[15px] leading-[1.65] text-rc-fg">
          {/* Loading */}
          {linkStatus === "loading" && (
            <div className="rc-hint py-2">
              please wait while we connect your accounts…
            </div>
          )}

          {/* Not Signed In */}
          {linkStatus === "not-signed-in" && (
            <>
              <p className="m-0 text-rc-fg-muted">
                Please sign in to your Realms.cards account to link it with
                Discord.
              </p>
              <RcButton onClick={handleSignIn} className="mt-5 w-full">
                Sign In to Continue
              </RcButton>
              <p className="rc-hint mt-4">
                don&apos;t have an account? sign in to create one automatically
              </p>
            </>
          )}

          {/* Invalid Token */}
          {linkStatus === "invalid" && (
            <>
              <div className="rc-alert" data-tone="danger">
                {error || "This link is invalid or has already been used."}
              </div>
              <p className="mt-4 text-rc-fg-muted">
                Please request a new link using the{" "}
                <code className="rounded-rc-sm bg-black/40 px-1.5 py-0.5 font-rc-mono text-[13px] text-rc-fg">
                  /link start
                </code>{" "}
                command in Discord.
              </p>
            </>
          )}

          {/* Expired Token */}
          {linkStatus === "expired" && (
            <>
              <div className="rc-alert" data-tone="warning">
                This link has expired. Links are valid for 15 minutes.
              </div>
              <p className="mt-4 text-rc-fg-muted">
                Please request a new link using the{" "}
                <code className="rounded-rc-sm bg-black/40 px-1.5 py-0.5 font-rc-mono text-[13px] text-rc-fg">
                  /link start
                </code>{" "}
                command in Discord.
              </p>
            </>
          )}

          {/* Already Linked */}
          {linkStatus === "already-linked" && (
            <>
              <div className="rc-alert" data-tone="warning">
                {error ||
                  "This Discord account is already linked to a Realms.cards account."}
              </div>
              <RcLinkButton
                href="/settings"
                variant="outline"
                className="mt-5"
              >
                Go to Settings
              </RcLinkButton>
            </>
          )}

          {/* Success */}
          {linkStatus === "success" && (
            <>
              <div className="rc-alert" data-tone="success">
                Your Discord account has been linked to Realms.cards.
              </div>
              {discordTag && (
                <p className="mt-4 text-rc-fg-muted">
                  Discord:{" "}
                  <span className="font-rc-mono text-sm text-rc-fg-strong">
                    {discordTag}
                  </span>
                </p>
              )}
              <RcLinkButton href="/online/lobby" className="mt-5 w-full">
                Go to Lobby
              </RcLinkButton>
              <p className="mt-4 text-rc-fg-muted">
                You can now use{" "}
                <code className="rounded-rc-sm bg-black/40 px-1.5 py-0.5 font-rc-mono text-[13px] text-rc-fg">
                  /challenge
                </code>{" "}
                and other Discord commands.
              </p>
            </>
          )}

          {/* Error */}
          {linkStatus === "error" && (
            <>
              <div className="rc-alert" data-tone="danger">
                {error || "An error occurred while linking your account."}
              </div>
              <RcButton
                variant="outline"
                onClick={() => window.location.reload()}
                className="mt-5"
              >
                Try Again
              </RcButton>
            </>
          )}
        </div>
      </section>
    </AppShell>
  );
}
