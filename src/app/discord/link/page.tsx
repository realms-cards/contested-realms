"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

type LinkStatus =
  | "loading"
  | "not-signed-in"
  | "invalid"
  | "expired"
  | "already-linked"
  | "success"
  | "error";

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
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800/50 border border-slate-700 rounded-xl p-8 text-center">
        {/* Discord Icon */}
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[#5865F2] flex items-center justify-center">
          <svg
            className="w-10 h-10 text-white"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
          </svg>
        </div>

        {/* Loading */}
        {linkStatus === "loading" && (
          <>
            <h1 className="text-2xl font-bold text-white mb-4">
              Linking Discord Account...
            </h1>
            <div className="animate-pulse text-slate-400">
              Please wait while we connect your accounts.
            </div>
          </>
        )}

        {/* Not Signed In */}
        {linkStatus === "not-signed-in" && (
          <>
            <h1 className="text-2xl font-bold text-white mb-4">
              Sign In Required
            </h1>
            <p className="text-slate-300 mb-6">
              Please sign in to your Realms.cards account to link it with
              Discord.
            </p>
            <button
              onClick={handleSignIn}
              className="w-full py-3 px-4 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-lg transition-colors"
            >
              Sign In to Continue
            </button>
            <p className="text-slate-500 text-sm mt-4">
              Don&apos;t have an account? Sign in to create one automatically.
            </p>
          </>
        )}

        {/* Invalid Token */}
        {linkStatus === "invalid" && (
          <>
            <h1 className="text-2xl font-bold text-red-400 mb-4">
              Invalid Link
            </h1>
            <p className="text-slate-300 mb-6">
              {error || "This link is invalid or has already been used."}
            </p>
            <p className="text-slate-400 text-sm">
              Please request a new link using the{" "}
              <code className="bg-slate-700 px-1 rounded">/link start</code>{" "}
              command in Discord.
            </p>
          </>
        )}

        {/* Expired Token */}
        {linkStatus === "expired" && (
          <>
            <h1 className="text-2xl font-bold text-yellow-400 mb-4">
              Link Expired
            </h1>
            <p className="text-slate-300 mb-6">
              This link has expired. Links are valid for 15 minutes.
            </p>
            <p className="text-slate-400 text-sm">
              Please request a new link using the{" "}
              <code className="bg-slate-700 px-1 rounded">/link start</code>{" "}
              command in Discord.
            </p>
          </>
        )}

        {/* Already Linked */}
        {linkStatus === "already-linked" && (
          <>
            <h1 className="text-2xl font-bold text-yellow-400 mb-4">
              Already Linked
            </h1>
            <p className="text-slate-300 mb-6">
              {error ||
                "This Discord account is already linked to a Realms.cards account."}
            </p>
            <Link
              href="/settings"
              className="inline-block py-3 px-6 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
            >
              Go to Settings
            </Link>
          </>
        )}

        {/* Success */}
        {linkStatus === "success" && (
          <>
            <h1 className="text-2xl font-bold text-green-400 mb-4">
              ✅ Successfully Linked!
            </h1>
            <p className="text-slate-300 mb-2">
              Your Discord account has been linked to Realms.cards.
            </p>
            {discordTag && (
              <p className="text-slate-400 mb-6">
                Discord:{" "}
                <span className="text-white font-medium">{discordTag}</span>
              </p>
            )}
            <div className="space-y-3">
              <Link
                href="/online/lobby"
                className="block w-full py-3 px-4 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-lg transition-colors"
              >
                Go to Lobby
              </Link>
              <p className="text-slate-500 text-sm">
                You can now use{" "}
                <code className="bg-slate-700 px-1 rounded">/challenge</code>{" "}
                and other Discord commands!
              </p>
            </div>
          </>
        )}

        {/* Error */}
        {linkStatus === "error" && (
          <>
            <h1 className="text-2xl font-bold text-red-400 mb-4">
              Something Went Wrong
            </h1>
            <p className="text-slate-300 mb-6">
              {error || "An error occurred while linking your account."}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="py-3 px-6 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
            >
              Try Again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
