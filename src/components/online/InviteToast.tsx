"use client";

import { Icon } from "@iconify/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RcButton } from "@/components/ui/rc-button";
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
      <div className="rc-toast p-4">
        {/* Header with close */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon
              icon="game-icons:crossed-swords"
              width={24}
              height={24}
              className="shrink-0 text-rc-accent"
            />
            <div>
              <div className="mb-1 font-rc-display text-[18px] leading-none text-rc-fg-strong">
                Game Invite!
              </div>
              <div className="font-rc-sans text-sm text-rc-fg-muted">
                From {invite.from.displayName}
              </div>
            </div>
          </div>
          <RcButton
            variant="ghost"
            size="icon-xs"
            onClick={onDismiss}
            className="-mt-1 -mr-1"
          >
            ✕
          </RcButton>
        </div>

        {/* Lobby info */}
        <div className="mb-4 rounded-rc-md border border-rc-line/12 bg-black/30 px-3 py-2 text-sm">
          <div className="font-rc-sans text-rc-fg">
            {invite.visibility === "private" ? "Private" : "Open"} Lobby
          </div>
          <div className="rc-hint truncate">
            {invite.lobbyId.slice(0, 20)}...
          </div>
        </div>

        {/* Action buttons - 3 options */}
        <div className="space-y-2">
          <RcButton onClick={handleAccept} className="w-full">
            Accept &amp; Join
          </RcButton>

          <div className="grid grid-cols-2 gap-2">
            <RcButton
              variant="quiet"
              onClick={handlePostpone}
              className="h-auto whitespace-normal px-2 py-2"
            >
              Give me a few minutes
            </RcButton>
            <RcButton
              variant="danger-soft"
              onClick={handleDecline}
              className="h-auto whitespace-normal px-2 py-2"
            >
              Decline politely
            </RcButton>
          </div>
        </div>

        {/* Auto-dismiss countdown */}
        <div className="mt-3 text-center">
          <div className="rc-hint">
            Auto-dismisses in {remaining}s
          </div>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/45">
            <div
              className="h-full bg-rc-accent/60 transition-all duration-1000"
              style={{ width: `${(remaining / (autoHideMs / 1000)) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
