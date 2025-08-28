"use client";

import React from "react";
import type { LobbyInvitePayloadT } from "@/lib/net/protocol";

export type InvitesPanelProps = {
  invites: LobbyInvitePayloadT[];
  onAccept: (invite: LobbyInvitePayloadT) => void | Promise<void>;
  onDecline: (invite: LobbyInvitePayloadT) => void | Promise<void>;
};

function shortId(id: string, left = 6, right = 4) {
  if (id.length <= left + right + 1) return id;
  return `${id.slice(0, left)}…${id.slice(-right)}`;
}

export default function InvitesPanel({ invites, onAccept, onDecline }: InvitesPanelProps) {
  if (!invites || invites.length === 0) {
    return <div className="text-sm opacity-60">No invites</div>;
  }

  return (
    <div className="space-y-2">
      {invites.map((inv) => (
        <div key={`${inv.lobbyId}:${inv.from.id}`} className="flex items-center justify-between rounded-lg bg-slate-900/60 ring-1 ring-slate-800 px-3 py-2">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              Invite from {inv.from.displayName}
            </div>
            <div className="text-xs opacity-70">
              Lobby {shortId(inv.lobbyId)} • {inv.visibility}
            </div>
          </div>
          <div className="shrink-0 flex gap-2">
            <button
              className="rounded bg-indigo-600/80 hover:bg-indigo-600 px-3 py-1 text-xs font-medium"
              onClick={() => onAccept(inv)}
            >
              Accept
            </button>
            <button
              className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1 text-xs font-medium"
              onClick={() => onDecline(inv)}
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
