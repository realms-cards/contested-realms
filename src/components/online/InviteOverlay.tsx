"use client";

import React from "react";
import { createPortal } from "react-dom";
import { RcButton } from "@/components/ui/rc-button";
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
        className="absolute inset-0 bg-[rgba(6,10,20,0.82)] backdrop-blur-[4px]"
        onClick={onDecline}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-4 rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] text-rc-fg shadow-rc-panel overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header glow */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rc-accent-press via-rc-accent-ring to-rc-accent-press" />

        <div className="p-6 text-center">
          {/* Icon */}
          <div className="mx-auto w-16 h-16 rounded-full border border-rc-accent/35 bg-rc-accent/12 flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-rc-accent-link"
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
          <h2 className="mb-2 font-rc-display text-[26px] leading-none text-rc-fg-strong">
            Lobby Invitation
          </h2>

          {/* Invite details */}
          <p className="font-rc-sans text-rc-fg-muted mb-1">
            <span className="font-semibold text-rc-accent-link">
              {invite.from.displayName}
            </span>{" "}
            has invited you to join their lobby
          </p>
          <p className="font-rc-sans text-sm text-rc-fg-subtle mb-6">
            {invite.visibility === "private" ? "Private" : "Public"} lobby
          </p>

          {/* Actions */}
          <div className="flex gap-3 justify-center">
            <RcButton variant="danger-soft" onClick={onDecline} className="px-6">
              Decline
            </RcButton>
            <RcButton onClick={() => void onAccept()} className="px-6">
              Accept & Join
            </RcButton>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
