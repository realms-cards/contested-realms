"use client";

import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSocket } from "@/lib/hooks/useSocket";

interface TournamentInviteData {
  tournamentId: string;
  tournamentName: string;
  from: {
    id: string;
    displayName: string;
  };
}

interface InviteToast {
  id: string;
  data: TournamentInviteData;
  expiresAt: number;
}

/**
 * Global listener for tournament invite notifications.
 * Shows a toast when the user receives a tournament invitation.
 * Should be placed in the root layout.
 */
export default function TournamentInviteListener() {
  const socket = useSocket();
  const [toasts, setToasts] = useState<InviteToast[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleTournamentInvite = (data: TournamentInviteData) => {
      console.log("[TournamentInviteListener] Received invite:", data);

      const id = `${data.tournamentId}-${Date.now()}`;
      const toast: InviteToast = {
        id,
        data,
        expiresAt: Date.now() + 15000, // 15 seconds
      };

      setToasts((prev) => [...prev, toast]);

      // Auto-remove after 15 seconds
      setTimeout(() => {
        removeToast(id);
      }, 15000);
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
            <div className="text-2xl">🏆</div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-emerald-400">
                Tournament Invitation
              </div>
              <div className="text-sm text-white/80 mt-1">
                <span className="font-medium">
                  {toast.data.from.displayName}
                </span>{" "}
                invited you to join{" "}
                <span className="font-medium">{toast.data.tournamentName}</span>
              </div>
              <div className="flex gap-2 mt-3">
                <Link
                  href={`/tournaments/${toast.data.tournamentId}`}
                  onClick={() => removeToast(toast.id)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-sm font-medium text-white"
                >
                  View Tournament
                </Link>
                <button
                  onClick={() => removeToast(toast.id)}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded text-sm text-white/70"
                >
                  Dismiss
                </button>
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
    document.body
  );
}
