"use client";

import Link from "next/link";
import { useState } from "react";
import { rcButtonVariants } from "@/components/ui/rc-button";
import { createGuestSession } from "@/lib/guest/guestSession";

interface GuestGateProps {
  title: string;
  description: string;
  /** Where sign-in should return to (the invite link itself, typically) */
  returnTo: string;
  /** "realms" uses the lobby design-system chrome; "default" a compact card */
  variant?: "default" | "realms";
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
  variant = "default",
}: GuestGateProps) {
  const realms = variant === "realms";
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
    <div
      className={
        realms
          ? "rc-panel space-y-3 px-[18px] py-4 font-rc-sans"
          : "rc-panel space-y-3 p-5 font-rc-sans"
      }
    >
      <div
        className={
          realms
            ? "font-rc-display text-[26px] leading-none text-rc-fg-strong"
            : "font-rc-display text-[22px] leading-none text-rc-fg-strong"
        }
      >
        {title}
      </div>
      <p className="text-sm text-rc-fg-muted">
        {description}
      </p>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          void continueAsGuest();
        }}
      >
        <input
          className={
            realms
              ? "rc-input h-10 min-h-10 w-full sm:flex-1"
              : "rc-input h-[38px] flex-1"
          }
          placeholder="Your name"
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          maxLength={24}
          autoFocus
          disabled={joining}
        />
        <button
          type="submit"
          className={
            realms
              ? rcButtonVariants({ className: "h-10" })
              : rcButtonVariants()
          }
          disabled={joining || guestName.trim().length < 2}
        >
          {joining ? "Joining..." : "Continue as guest"}
        </button>
        <Link
          href={signInHref}
          className={
            realms
              ? rcButtonVariants({ variant: "outline", className: "h-10" })
              : rcButtonVariants({ variant: "outline" })
          }
        >
          Sign in
        </Link>
      </form>
      {error && (
        <div className="rc-alert" data-tone="danger">
          {error}
        </div>
      )}
    </div>
  );
}
