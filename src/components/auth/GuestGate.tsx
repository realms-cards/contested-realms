"use client";

import Link from "next/link";
import { useState } from "react";
import { createGuestSession } from "@/lib/guest/guestSession";

interface GuestGateProps {
  title: string;
  description: string;
  /** Where sign-in should return to (the invite link itself, typically) */
  returnTo: string;
}

/**
 * Shown to visitors with neither an account nor a guest identity: pick a name
 * and continue as a guest, or sign in. On success the guest cookie is set and
 * `useViewer()` / the online provider pick the new identity up on their own.
 */
export default function GuestGate({
  title,
  description,
  returnTo,
}: GuestGateProps) {
  const [guestName, setGuestName] = useState("");
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signInHref = `/auth/signin?callbackUrl=${encodeURIComponent(returnTo)}`;

  const continueAsGuest = async () => {
    setJoining(true);
    setError(null);
    try {
      await createGuestSession(guestName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not continue as guest");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="rounded-xl bg-slate-900/60 ring-1 ring-sky-500/40 p-5 space-y-3">
      <div className="text-lg font-semibold">{title}</div>
      <p className="text-sm opacity-80">{description}</p>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          void continueAsGuest();
        }}
      >
        <input
          className="flex-1 rounded-lg bg-slate-800/80 ring-1 ring-slate-700 px-3 py-2 text-sm"
          placeholder="Your name"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          maxLength={24}
          autoFocus
          disabled={joining}
        />
        <button
          type="submit"
          className="rounded-lg bg-sky-600/90 hover:bg-sky-600 disabled:opacity-50 px-4 py-2 text-sm font-semibold"
          disabled={joining || guestName.trim().length < 2}
        >
          {joining ? "Joining..." : "Continue as guest"}
        </button>
        <Link
          href={signInHref}
          className="rounded-lg bg-slate-700/80 hover:bg-slate-700 px-4 py-2 text-sm font-semibold text-center"
        >
          Sign in
        </Link>
      </form>
      {error && (
        <div className="text-xs text-red-300 bg-red-900/20 ring-1 ring-red-800 rounded px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
