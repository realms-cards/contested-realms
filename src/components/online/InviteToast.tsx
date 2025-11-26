"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { LobbyInvitePayloadT } from "@/lib/net/protocol";

export interface InviteToastProps {
  invite: LobbyInvitePayloadT;
  onAccept: () => void;
  onDecline: () => void;
  onPostpone: () => void;
  onDismiss: () => void;
  /** Auto-dismiss timeout in ms (default: 60000 = 1 minute) */
  autoHideMs?: number;
}

/**
 * Persistent toast notification for lobby invites.
 * Shows 3 options: Accept, Decline politely, Give me a few minutes
 */
export default function InviteToast({
  invite,
  onAccept,
  onDecline,
  onPostpone,
  onDismiss,
  autoHideMs = 60000,
}: InviteToastProps) {
  const [visible, setVisible] = useState(true);
  const [remaining, setRemaining] = useState(Math.ceil(autoHideMs / 1000));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const countdown = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          setVisible(false);
          onDismiss();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdown);
  }, [onDismiss, autoHideMs]);

  if (!visible || !mounted) return null;

  const handleAccept = () => {
    setVisible(false);
    onAccept();
  };

  const handleDecline = () => {
    setVisible(false);
    onDecline();
  };

  const handlePostpone = () => {
    setVisible(false);
    onPostpone();
  };

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[9999] max-w-sm animate-in slide-in-from-right duration-300">
      <div className="bg-slate-900 border border-indigo-500/50 rounded-xl shadow-2xl shadow-indigo-500/20 p-4">
        {/* Header with close */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎮</span>
            <div>
              <div className="font-semibold text-indigo-200">Game Invite!</div>
              <div className="text-sm text-slate-400">
                From {invite.from.displayName}
              </div>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="text-slate-500 hover:text-slate-300 -mt-1 -mr-1"
          >
            ✕
          </button>
        </div>

        {/* Lobby info */}
        <div className="bg-slate-800/50 rounded-lg px-3 py-2 mb-4 text-sm">
          <div className="text-slate-300">
            {invite.visibility === "private" ? "🔒 Private" : "🌐 Open"} Lobby
          </div>
          <div className="text-xs text-slate-500 truncate">
            {invite.lobbyId.slice(0, 20)}...
          </div>
        </div>

        {/* Action buttons - 3 options */}
        <div className="space-y-2">
          <button
            onClick={handleAccept}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <span>✓</span> Accept &amp; Join
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handlePostpone}
              className="py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
            >
              Give me a few minutes
            </button>
            <button
              onClick={handleDecline}
              className="py-2 bg-red-900/50 hover:bg-red-900/80 text-red-200 rounded-lg text-sm transition-colors"
            >
              Decline politely
            </button>
          </div>
        </div>

        {/* Auto-dismiss countdown */}
        <div className="mt-3 text-center">
          <div className="text-xs text-slate-500">
            Auto-dismisses in {remaining}s
          </div>
          <div className="h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
            <div
              className="h-full bg-indigo-500/50 transition-all duration-1000"
              style={{ width: `${(remaining / (autoHideMs / 1000)) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
