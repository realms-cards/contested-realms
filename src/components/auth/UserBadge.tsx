"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import React, { useContext, useEffect, useRef, useState } from "react";
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Loading shimmer similar to AuthButton
  if (status === "loading") {
    if (variant === "floating") {
      return (
        <div className={`pointer-events-auto fixed top-3 right-4 z-[70] ${className}`}>
          <div className="h-9 w-[7.5rem] rounded-full bg-slate-800/80 animate-pulse" />
        </div>
      );
    }
    return <div className={`w-24 h-9 bg-slate-800 rounded animate-pulse ${className}`} />;
  }

  // Not authenticated: reuse AuthButton
  if (!session?.user?.id) {
    if (variant === "floating") {
      return (
        <div className={`pointer-events-auto fixed top-3 right-4 z-[70] ${className}`}>
          <AuthButton variant="floating" />
        </div>
      );
    }
    return <AuthButton className={className} />;
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

  const avatar = session.user.image ? (
    <Image
      src={session.user.image}
      alt={session.user.name || "User avatar"}
      width={32}
      height={32}
      className="rounded-full w-8 h-8"
      priority={false}
    />
  ) : (
    <div className="w-8 h-8 rounded-full bg-slate-700 text-white grid place-items-center text-[12px]">
      {(session.user.name || "?").slice(0, 1).toUpperCase()}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={
        variant === "floating"
          ? `pointer-events-auto fixed top-3 right-4 z-[70] ${className}`
          : `pointer-events-auto relative ${className}`
      }
    >
      {/* Collapsed trigger: avatar only */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-white/30"
        title={session.user.name || "User"}
      >
        {avatar}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 z-[75] min-w-[220px]">
          <div className="rounded-lg bg-slate-900 ring-1 ring-slate-800 shadow-xl p-2 text-sm">
            <div className="px-2 py-1.5 flex items-center gap-2">
              {avatar}
              <div className="min-w-0 flex-1">
                <div className="text-slate-200 text-sm truncate">{session.user.name || "User"}</div>
                <div className="mt-1">{presence}</div>
              </div>
            </div>
            <div className="my-2 h-px bg-white/10" />
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
