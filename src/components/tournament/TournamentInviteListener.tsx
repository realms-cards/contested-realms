"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useOnline } from "@/app/online/online-context";
import { RcButton, rcButtonVariants } from "@/components/ui/rc-button";
import { soundManager } from "@/lib/audio/soundManager";

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
      soundManager.play("invite");

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
          className="rc-toast p-4 animate-slide-in"
        >
          <div className="flex items-start gap-3">
            <Icon
              icon="game-icons:laurels-trophy"
              width={24}
              height={24}
              className="shrink-0 text-rc-accent"
            />
            <div className="flex-1 min-w-0">
              <div className="font-rc-display text-[18px] leading-none text-rc-fg-strong">
                Tournament Invitation
              </div>
              <div className="font-rc-sans text-sm text-rc-fg-muted mt-1">
                <span className="font-medium text-rc-fg-strong">
                  {toast.data.from.displayName}
                </span>{" "}
                invited you to join{" "}
                <span className="font-medium text-rc-fg-strong">
                  {toast.data.tournamentName}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                {toast.data.invitationId ? (
                  <>
                    <RcButton
                      size="sm"
                      onClick={() =>
                        handleRespond(
                          toast.id,
                          toast.data.invitationId as string,
                          "accept",
                        )
                      }
                      disabled={toast.responding !== null}
                    >
                      {toast.responding === "accept" ? "Accepting..." : "Accept"}
                    </RcButton>
                    <RcButton
                      variant="danger-soft"
                      size="sm"
                      onClick={() =>
                        handleRespond(
                          toast.id,
                          toast.data.invitationId as string,
                          "decline",
                        )
                      }
                      disabled={toast.responding !== null}
                    >
                      {toast.responding === "decline" ? "Declining..." : "Decline"}
                    </RcButton>
                  </>
                ) : null}
                <Link
                  href={`/tournaments/${toast.data.tournamentId}`}
                  onClick={() => removeToast(toast.id)}
                  className={rcButtonVariants({ variant: "secondary", size: "sm" })}
                >
                  View
                </Link>
              </div>
            </div>
            <RcButton
              variant="ghost"
              size="icon-xs"
              onClick={() => removeToast(toast.id)}
              className="text-lg leading-none"
            >
              ×
            </RcButton>
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
