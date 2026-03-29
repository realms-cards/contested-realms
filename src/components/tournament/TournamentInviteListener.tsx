"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useOnline } from "@/app/online/online-context";

interface TournamentInviteData {
  tournamentId: string;
  tournamentName: string;
  invitationId: string | null;
  from: {
    id: string;
    displayName: string;
  };
}

interface InviteToast {
  id: string;
  data: TournamentInviteData;
  expiresAt: number;
  responding: "accept" | "decline" | null;
}

/**
 * Global listener for tournament invite notifications.
 * Shows a toast when the user receives a tournament invitation.
 * Should be placed in the root layout.
 */
export default function TournamentInviteListener() {
  const { transport } = useOnline();
  const socket = transport?.getSocket() ?? null;
  const [toasts, setToasts] = useState<InviteToast[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const setToastResponding = useCallback(
    (id: string, responding: "accept" | "decline" | null) => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, responding } : t)),
      );
    },
    [],
  );

  const handleRespond = useCallback(
    async (toastId: string, invitationId: string, action: "accept" | "decline") => {
      setToastResponding(toastId, action);
      try {
        const res = await fetch(
          `/api/tournaments/invitations/${encodeURIComponent(invitationId)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const errMsg =
            (data as { error?: string }).error || `Failed to ${action} invitation`;
          console.error(`[TournamentInviteListener] ${action} failed:`, errMsg);
          setToastResponding(toastId, null);
          return;
        }
        // Success — show brief feedback then remove
        removeToast(toastId);
        try {
          window.dispatchEvent(
            new CustomEvent("app:toast", {
              detail: {
                message:
                  action === "accept"
                    ? "Tournament invitation accepted!"
                    : "Tournament invitation declined.",
              },
            }),
          );
        } catch {}
      } catch (err) {
        console.error(`[TournamentInviteListener] ${action} error:`, err);
        setToastResponding(toastId, null);
      }
    },
    [removeToast, setToastResponding],
  );

  useEffect(() => {
    if (!socket) return;

    const handleTournamentInvite = (data: TournamentInviteData) => {
      console.log("[TournamentInviteListener] Received invite:", data);

      const id = `${data.tournamentId}-${Date.now()}`;
      const toast: InviteToast = {
        id,
        data,
        expiresAt: Date.now() + 30000,
        responding: null,
      };

      setToasts((prev) => [...prev, toast]);

      // Auto-remove after 30 seconds
      setTimeout(() => {
        removeToast(id);
      }, 30000);
    };

    socket.on("tournamentInvite", handleTournamentInvite);

    return () => {
      socket.off("tournamentInvite", handleTournamentInvite);
    };
  }, [socket, removeToast]);

  if (!mounted || toasts.length === 0) return null;

  return createPortal(
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="bg-slate-900 border border-emerald-500/50 rounded-lg shadow-xl p-4 animate-slide-in"
        >
          <div className="flex items-start gap-3">
            <div className="text-2xl">&#127942;</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-emerald-400">
                Tournament Invitation
              </div>
              <div className="text-sm text-white/80 mt-1">
                <span className="font-medium">
                  {toast.data.from.displayName}
                </span>{" "}
                invited you to join{" "}
                <span className="font-medium">
                  {toast.data.tournamentName}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                {toast.data.invitationId ? (
                  <>
                    <button
                      onClick={() =>
                        handleRespond(
                          toast.id,
                          toast.data.invitationId as string,
                          "accept",
                        )
                      }
                      disabled={toast.responding !== null}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {toast.responding === "accept" ? "Accepting..." : "Accept"}
                    </button>
                    <button
                      onClick={() =>
                        handleRespond(
                          toast.id,
                          toast.data.invitationId as string,
                          "decline",
                        )
                      }
                      disabled={toast.responding !== null}
                      className="px-3 py-1.5 bg-red-600/80 hover:bg-red-500 rounded text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {toast.responding === "decline" ? "Declining..." : "Decline"}
                    </button>
                  </>
                ) : null}
                <Link
                  href={`/tournaments/${toast.data.tournamentId}`}
                  onClick={() => removeToast(toast.id)}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded text-sm text-white/70"
                >
                  View
                </Link>
              </div>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-white/50 hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
