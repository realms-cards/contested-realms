"use client";

import { useState } from "react";
import { RcButton } from "@/components/ui/rc-button";
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
        buildTournamentInviteUrl(
          window.location.origin,
          kind,
          tournamentId,
          token,
        ),
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
    <RcButton
      variant="outline"
      size="sm"
      onClick={() => void copy()}
      disabled={busy}
      className={className}
      title="Copy a link anyone can use to join - no account needed"
    >
      {state === "copied"
        ? "Link copied!"
        : state === "error"
          ? "Copy failed"
          : "Copy invite link"}
    </RcButton>
  );
}
