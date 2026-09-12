"use client";

import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import { useRouter, useSearchParams } from "next/navigation";
import { getProviders, signIn, getSession } from "next-auth/react";
import type { LiteralUnion, ClientSafeProvider } from "next-auth/react";
import { useEffect, useState } from "react";
import { Suspense } from "react";
import AppShell from "@/components/ui/AppShell";
import { Divider } from "@/components/ui/divider";
import { PageHeader } from "@/components/ui/page-header";
import { RcButton } from "@/components/ui/rc-button";

type ProvidersType = Record<
  LiteralUnion<string, string>,
  ClientSafeProvider
> | null;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface SignInPageProps {}

function SignInContent() {
  const [providers, setProviders] = useState<ProvidersType>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [twoFactorCode, setTwoFactorCode] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isPasskeyBusy, setIsPasskeyBusy] = useState<boolean>(false);
  const [registerDisplayName, setRegisterDisplayName] = useState<string>("");
  const [registerEmail, setRegisterEmail] = useState<string>("");
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState<string>("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isEmailSending, setIsEmailSending] = useState<boolean>(false);
  const [emailSuccessMessage, setEmailSuccessMessage] = useState<string | null>(
    null
  );

  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") || "/";
  const error = searchParams?.get("error");

  useEffect(() => {
    (async () => {
      try {
        // Check if already signed in
        const session = await getSession();
        if (session) {
          router.push(callbackUrl);
          return;
        }

        const res = await getProviders();
        setProviders(res);
      } catch (error) {
        console.error("Failed to load providers:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, [callbackUrl, router]);

  const handleDiscordSignIn = async (): Promise<void> => {
    setIsSubmitting(true);
    try {
      await signIn("discord", { callbackUrl });
    } catch (error) {
      console.error("Discord sign-in error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) {
      setEmailError("Enter an email address.");
      setEmailSuccessMessage(null);
      return;
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      setEmailError("Enter a valid email address.");
      setEmailSuccessMessage(null);
      return;
    }

    setIsEmailSending(true);
    setEmailError(null);
    setEmailSuccessMessage(null);
    try {
      const result = await signIn("email", {
        email: trimmed,
        callbackUrl,
        redirect: false,
      });

      if (result?.ok) {
        setEmailSuccessMessage(
          `Magic link sent to ${trimmed}. Check your inbox to continue.`
        );
        setEmailInput("");
      } else {
        setEmailError("Unable to send magic link. Try again in a moment.");
      }
    } catch (error) {
      console.error("Email sign-in error:", error);
      setEmailError("We could not send the email. Please try again.");
    } finally {
      setIsEmailSending(false);
    }
  };

  // Passkey sign-in (authentication)
  const handlePasskeySignIn = async (): Promise<void> => {
    setIsPasskeyBusy(true);
    setPasskeyError(null);
    try {
      const res = await fetch("/api/webauthn/authentication/options", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to get authentication options");
      const { options } = await res.json();
      const assertion = await startAuthentication(options);
      const result = await signIn("passkey", {
        assertion: JSON.stringify(assertion),
        callbackUrl,
        redirect: false,
      });
      if (result?.ok) {
        router.push(callbackUrl);
      } else if (result?.error) {
        console.error("Passkey sign-in error:", result.error);
      }
    } catch (err) {
      console.error("Passkey sign-in failed:", err);
    } finally {
      setIsPasskeyBusy(false);
    }
  };

  const ensureDocumentFocus = async (): Promise<boolean> => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return true;
    }

    if (document.visibilityState === "visible" && document.hasFocus()) {
      return true;
    }

    window.focus();

    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(handleTimeout, 500);

      window.addEventListener("focus", onWindowFocus, { once: true });
      document.addEventListener("visibilitychange", onVisibilityChange);

      function resolveAndCleanup(result: boolean) {
        if (settled) return;
        settled = true;
        window.removeEventListener("focus", onWindowFocus);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        window.clearTimeout(timeoutId);
        resolve(result);
      }

      function onWindowFocus() {
        resolveAndCleanup(true);
      }

      function onVisibilityChange() {
        if (document.visibilityState === "visible" && document.hasFocus()) {
          resolveAndCleanup(true);
        }
      }

      function handleTimeout() {
        resolveAndCleanup(document.hasFocus());
      }
    });
  };

  // Passkey registration flow
  const handlePasskeyRegistration = async (
    e: React.FormEvent
  ): Promise<void> => {
    e.preventDefault();
    setIsPasskeyBusy(true);
    setPasskeyError(null);
    const trimmedEmail = registerEmail.trim().toLowerCase();
    if (registerEmail && !EMAIL_PATTERN.test(trimmedEmail)) {
      setPasskeyError("Enter a valid email address.");
      setIsPasskeyBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/webauthn/registration/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: registerDisplayName,
          email: registerEmail ? trimmedEmail : undefined,
        }),
      });
      if (!res.ok) {
        let message = "Failed to get registration options";
        try {
          const data = await res.json();
          if (typeof data?.error === "string") {
            message = data.error;
          }
        } catch {}
        throw new Error(message);
      }
      const { options } = await res.json();

      const hasFocus = await ensureDocumentFocus();
      if (!hasFocus) {
        setPasskeyError(
          "Focus this tab to finish passkey registration, then try again."
        );
        return;
      }

      const attestation = await startRegistration(options);
      const vr = await fetch("/api/webauthn/registration/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attestation }),
      });
      if (!vr.ok) throw new Error("Registration verification failed");
      await handlePasskeySignIn();
      setRegisterDisplayName("");
      setRegisterEmail("");
    } catch (err) {
      console.error("Passkey registration failed:", err);
      if (
        err instanceof DOMException &&
        err.name === "NotAllowedError" &&
        /document is not focused/i.test(err.message)
      ) {
        setPasskeyError(
          "Your browser blocked the prompt because this tab is unfocused. Click the app and try again."
        );
      } else if (err instanceof Error) {
        setPasskeyError(
          err.message || "Passkey registration failed. Please try again."
        );
      } else {
        setPasskeyError("Passkey registration failed. Please try again.");
      }
    } finally {
      setIsPasskeyBusy(false);
    }
  };

  const handleTwoFactorSignIn = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const result = await signIn("2fa", {
        code: twoFactorCode,
        callbackUrl,
        redirect: false,
      });

      if (result?.error) {
        console.error("2FA sign-in error:", result.error);
        // Handle error (show message to user)
      } else if (result?.ok) {
        router.push(callbackUrl);
      }
    } catch (error) {
      console.error("2FA sign-in error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AppShell width="narrow">
        <div className="rc-hint py-6 text-center">loading…</div>
      </AppShell>
    );
  }

  return (
    <AppShell width="narrow">
      <section className="rc-panel mx-auto w-full max-w-md p-6">
        <PageHeader
          size="md"
          eyebrow="realms.cards"
          title="Sign In"
          className="mb-5"
        />

        {error && (
          <div className="rc-alert mb-4" data-tone="danger">
            {error === "CredentialsSignin"
              ? "Invalid 2FA code. Please try again."
              : "An error occurred during sign in. Please try again."}
          </div>
        )}

        <div className="space-y-4">
          {/* Discord Provider */}
          {providers?.discord && (
            <RcButton
              variant="outline"
              onClick={handleDiscordSignIn}
              disabled={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? (
                "Signing in..."
              ) : (
                <>
                  <svg
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M20.317 4.369a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.211.375-.445.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.369a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                  </svg>
                  Continue with Discord
                </>
              )}
            </RcButton>
          )}

          {/* Email Magic Link */}
          {providers?.email && (
            <form
              onSubmit={handleEmailSignIn}
              className="space-y-2.5 rounded-rc-md border border-rc-line/18 bg-black/30 p-4"
            >
              <label
                className="rc-eyebrow block"
                htmlFor="email-signin-input"
              >
                Email Address
              </label>
              <input
                id="email-signin-input"
                type="email"
                name="email"
                autoComplete="email username"
                value={emailInput}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setEmailInput(e.target.value);
                  setEmailError(null);
                  setEmailSuccessMessage(null);
                }}
                placeholder="you@example.com"
                className="rc-input h-10 w-full"
                disabled={isEmailSending}
                required
              />
              {emailError && (
                <div className="rc-alert" data-tone="danger">
                  {emailError}
                </div>
              )}
              {emailSuccessMessage && (
                <div className="rc-alert" data-tone="success">
                  {emailSuccessMessage}
                </div>
              )}
              <RcButton
                type="submit"
                disabled={isEmailSending}
                className="w-full"
              >
                {isEmailSending ? "Sending…" : "Send Magic Link"}
              </RcButton>
            </form>
          )}

          {/* Passkey Sign-In */}
          <RcButton
            variant="outline"
            onClick={handlePasskeySignIn}
            disabled={isPasskeyBusy}
            className="w-full"
          >
            {isPasskeyBusy ? "Working…" : "Sign in with Passkey"}
          </RcButton>

          {/* 2FA Provider (Development/Test) */}
          {providers?.["2fa"] && (
            <div>
              <Divider label="development testing" star="" />
              <form onSubmit={handleTwoFactorSignIn} className="space-y-3">
                <input
                  type="text"
                  name="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={twoFactorCode}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setTwoFactorCode(e.target.value)
                  }
                  placeholder="Enter 2FA Code (424242)"
                  className="rc-input h-10 w-full"
                  disabled={isSubmitting}
                  required
                />
                <RcButton
                  type="submit"
                  variant="outline"
                  disabled={isSubmitting || !twoFactorCode.trim()}
                  className="w-full"
                >
                  {isSubmitting ? "Signing in..." : "Sign In with 2FA"}
                </RcButton>
              </form>
            </div>
          )}

          {/* Passkey Registration */}
          <div>
            <Divider label="register a passkey" star="" />
            <form onSubmit={handlePasskeyRegistration} className="space-y-3">
              <input
                type="text"
                name="name"
                autoComplete="name"
                value={registerDisplayName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setRegisterDisplayName(e.target.value)
                }
                placeholder="Display name (optional)"
                className="rc-input h-10 w-full"
                disabled={isPasskeyBusy}
              />
              <input
                type="email"
                name="email"
                autoComplete="email"
                value={registerEmail}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setRegisterEmail(e.target.value)
                }
                placeholder="Email (optional)"
                className="rc-input h-10 w-full"
                disabled={isPasskeyBusy}
              />
              {passkeyError && (
                <div className="rc-alert" data-tone="danger">
                  {passkeyError}
                </div>
              )}
              <RcButton
                type="submit"
                variant="outline"
                disabled={isPasskeyBusy}
                className="w-full"
              >
                {isPasskeyBusy ? "Working…" : "Register Passkey"}
              </RcButton>
            </form>
          </div>
        </div>

        <p className="mt-6 text-center font-rc-sans text-xs leading-relaxed text-rc-fg-subtle">
          By signing in, you agree to our terms of service and privacy policy.
        </p>
      </section>
    </AppShell>
  );
}

export default function SignInPage({}: SignInPageProps) {
  return (
    <Suspense
      fallback={
        <AppShell width="narrow">
          <div className="rc-hint py-6 text-center">loading…</div>
        </AppShell>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
