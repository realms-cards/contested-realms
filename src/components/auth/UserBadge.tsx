"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import React, { useContext, useState } from "react";
import { OnlineContext } from "@/app/online/online-context";
import AuthButton from "@/components/auth/AuthButton";

/**
 * UserBadge
 * - Standard user badge used across the app.
 * - Shows avatar/name and a small presence indicator when OnlineContext is available.
 * - Falls back to AuthButton (sign in) if the user is not authenticated.
 * - Includes a tiny dropdown for quick actions/settings.
 */
export default function UserBadge({
  variant = "inline",
  className = "",
}: {
  variant?: "inline" | "floating";
  className?: string;
}) {
  const { data: session, status } = useSession();
  const onlineCtx = useContext(OnlineContext);
  const connected: boolean = onlineCtx ? !!onlineCtx.connected : false;
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Loading shimmer similar to AuthButton
  if (status === "loading") {
    return <div className={`w-24 h-9 bg-slate-800 rounded animate-pulse ${className}`} />;
  }

  // Not authenticated: reuse AuthButton
  if (!session?.user?.id) {
    return <AuthButton />;
  }

  const presence = (
    <span
      className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ring-1 ${
        connected
          ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
          : "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30"
      }`}
      title={
        connected
          ? "Online services connected"
          : onlineCtx
          ? "Online services disconnected"
          : "Online services are not active on this page"
      }
    >
      <span
        className={`inline-block w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-rose-400"}`}
      />
      {connected ? "Online" : "Offline"}
    </span>
  );

  return (
    <div
      className={
        variant === "floating"
          ? `pointer-events-auto fixed top-3 right-4 z-[70] ${className}`
          : `pointer-events-auto ${className}`
      }
    >
      <div className="flex items-center gap-2 bg-slate-900/60 ring-1 ring-slate-800 px-2.5 py-1.5 rounded-lg shadow-sm">
        {presence}
        {session.user.image ? (
          <Image
            src={session.user.image}
            alt={session.user.name || "User avatar"}
            width={24}
            height={24}
            className="rounded-full"
          />
        ) : (
          <div className="w-6 h-6 rounded-full bg-slate-700 text-white grid place-items-center text-[11px]">
            {(session.user.name || "?").slice(0, 1).toUpperCase()}
          </div>
        )}
        <span className="text-xs font-medium text-slate-200 max-w-[14ch] truncate">
          {session.user.name || "User"}
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="h-7 w-7 grid place-items-center rounded hover:bg-white/10 text-slate-300"
          aria-label="User menu"
          title="User menu"
        >
          ⋮
        </button>
      </div>

      {open && (
        <div className="mt-2 right-0 absolute z-[75]">
          <div className="min-w-[200px] rounded-lg bg-slate-900 ring-1 ring-slate-800 shadow-xl p-2 text-sm">
            <div className="px-2 py-1.5 text-xs text-slate-400">Account</div>
            <div className="px-2 py-1.5 flex items-center justify-between">
              <span className="text-slate-200">Status</span>
              {presence}
            </div>
            <div className="px-2 py-1.5">
              <button
                onClick={() => {
                  setOpen(false);
                  router.push("/");
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-white/10"
              >
                Go Home
              </button>
            </div>
            <div className="px-2 py-1.5">
              <button
                onClick={() => {
                  setOpen(false);
                  router.push("/online/lobby");
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-white/10"
              >
                Go to Lobby
              </button>
            </div>
            <div className="px-2 py-1.5">
              <button
                onClick={async () => {
                  try {
                    await signOut({ callbackUrl: "/" });
                  } catch {}
                }}
                className="w-full text-left px-2 py-1 rounded hover:bg-white/10 text-rose-300"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
