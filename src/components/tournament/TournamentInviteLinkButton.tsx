"use client";

import { Link2 } from "lucide-react";
import { useState } from "react";
import {
  buildTournamentInviteUrl,
  type TournamentKind,
} from "@/lib/tournament/invite-links";

interface TournamentInviteLinkButtonProps {
  tournamentId: string;
  kind: TournamentKind;
  /** Current token as returned to the host by the detail endpoint (null until minted) */
  inviteToken: string | null;
  onTokenChange?: (token: string) => void;
  className?: string;
}

/**
 * Host control: copies the shareable invite link, minting the token on first
 * use. Anyone with the link - account or guest - can view and join the
 * tournament, even when it is private.
 */
export default function TournamentInviteLinkButton({
  tournamentId,
  kind,
  inviteToken,
  onTokenChange,
  className = "",
}: TournamentInviteLinkButtonProps) {
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  const copy = async () => {
    setBusy(true);
    try {
      let token = inviteToken;
      if (!token) {
        const res = await fetch(
          `/api/tournaments/${encodeURIComponent(tournamentId)}/invite-link`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || typeof data?.inviteToken !== "string") {
          throw new Error(data?.error || "Could not create invite link");
        }
        token = data.inviteToken as string;
        onTokenChange?.(token);
      }
      await navigator.clipboard.writeText(
        buildTournamentInviteUrl(window.location.origin, kind, tournamentId, token),
      );
      setState("copied");
    } catch {
      setState("error");
    } finally {
      setBusy(false);
      window.setTimeout(() => setState("idle"), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      disabled={busy}
      className={`inline-flex items-center gap-2 bg-sky-600/90 hover:bg-sky-600 disabled:opacity-50 text-white px-3 py-2 rounded-md text-sm ${className}`}
      title="Copy a link anyone can use to join - no account needed"
    >
      <Link2 className="w-4 h-4" />
      {state === "copied"
        ? "Link copied!"
        : state === "error"
          ? "Copy failed"
          : "Copy invite link"}
    </button>
  );
}
