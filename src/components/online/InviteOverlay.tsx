"use client";

import React from "react";
import { createPortal } from "react-dom";
import type { LobbyInvitePayloadT } from "@/lib/net/protocol";

export type InviteOverlayProps = {
  invite: LobbyInvitePayloadT;
  onAccept: () => void | Promise<void>;
  onDecline: () => void;
};

export default function InviteOverlay({
  invite,
  onAccept,
  onDecline,
}: InviteOverlayProps) {
  // Use portal to render at document body level for proper viewport centering
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onDecline}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4 rounded-2xl bg-gradient-to-b from-slate-800 to-slate-900 ring-1 ring-slate-700 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header glow */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500" />

        <div className="p-6 text-center">
          {/* Icon */}
          <div className="mx-auto w-16 h-16 rounded-full bg-indigo-500/20 flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-indigo-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>

          {/* Title */}
          <h2 className="text-xl font-bold text-white mb-2">
            Lobby Invitation
          </h2>

          {/* Invite details */}
          <p className="text-slate-300 mb-1">
            <span className="font-semibold text-indigo-300">
              {invite.from.displayName}
            </span>{" "}
            has invited you to join their lobby
          </p>
          <p className="text-sm text-slate-500 mb-6">
            {invite.visibility === "private" ? "🔒 Private" : "🌐 Public"} lobby
          </p>

          {/* Actions */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={onDecline}
              className="px-6 py-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 font-medium transition-colors"
            >
              Decline
            </button>
            <button
              onClick={() => void onAccept()}
              className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors shadow-lg shadow-indigo-500/25"
            >
              Accept & Join
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
