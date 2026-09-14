"use client";

import { useMemo } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGameStore } from "@/lib/game/store";
import type {
  InteractionDecision,
  InteractionGrantRequest,
} from "@/lib/net/interactions";

const KIND_LABEL: Record<string, string> = {
  instantSpell: "Instant Spell",
  defend: "Defend Action",
  forcedDraw: "Forced Draw",
  inspectHand: "Inspect Hand",
  takeFromPile: "Look at Card From Pile",
  manipulatePermanent: "Manipulate Permanent",
  tieGame: "Tie Game",
  inspectBanished: "Look at Banished",
  unbanishCard: "Return from Banished",
  restoreSnapshot: "Restore Snapshot",
  switchSite: "Switch Site Position",
};

function describeGrant(grant?: InteractionGrantRequest | null): string | null {
  if (!grant) return null;
  const parts: string[] = [];
  if (grant.allowOpponentZoneWrite) {
    parts.push("modify your zones");
  }
  if (grant.allowRevealOpponentHand) {
    parts.push("inspect your hand");
  }
  if (grant.singleUse) {
    parts.push("single use only");
  }
  if (typeof grant.expiresAt === "number") {
    const delta = grant.expiresAt - Date.now();
    if (delta > 0) {
      const seconds = Math.ceil(delta / 1000);
      parts.push(`expires in ${seconds}s`);
    }
  }
  return parts.length ? parts.join(", ") : null;
}

function formatPlayerName(
  id: string | null | undefined,
  seat: "p1" | "p2" | null,
  playerNames?: { p1: string; p2: string }
): string {
  if (!id && !seat) return "Unknown player";
  if (seat && playerNames) {
    return seat === "p1" ? playerNames.p1 : playerNames.p2;
  }
  return id ?? "Unknown player";
}

type InteractionConsentDialogProps = {
  myPlayerId: string | null;
  mySeat?: "p1" | "p2" | null;
  playerNames?: { p1: string; p2: string };
  playerNameById?: Record<string, string> | null;
  className?: string;
};

export function InteractionConsentDialog({
  myPlayerId,
  mySeat = null,
  playerNames,
  playerNameById,
  className,
}: InteractionConsentDialogProps) {
  const activeInteraction = useGameStore((s) => s.activeInteraction);
  const pendingInteractionId = useGameStore((s) => s.pendingInteractionId);
  const interactionLog = useGameStore((s) => s.interactionLog);
  const respondToInteraction = useGameStore((s) => s.respondToInteraction);
  const clearInteraction = useGameStore((s) => s.clearInteraction);

  const pendingInbound = useMemo(() => {
    if (!activeInteraction) return null;
    if (activeInteraction.status !== "pending") return null;
    if (activeInteraction.direction !== "inbound") return null;
    return activeInteraction;
  }, [activeInteraction]);

  const waitingOutbound = useMemo(() => {
    if (!activeInteraction) return null;
    if (activeInteraction.status !== "pending") return null;
    if (activeInteraction.direction !== "outbound") return null;
    return activeInteraction;
  }, [activeInteraction]);

  const outboundWaitingCount = useMemo(() => {
    return Object.values(interactionLog).filter(
      (entry) => entry.direction === "outbound" && entry.status === "pending"
    ).length;
  }, [interactionLog]);

  if (!pendingInbound && !waitingOutbound) {
    if (outboundWaitingCount === 0) {
      return null;
    }
    return (
      <div
        className={`pointer-events-none absolute inset-x-0 top-4 z-40 flex justify-center ${
          className ?? ""
        }`.trim()}
      >
        <div className="pointer-events-auto rounded-rc-md border border-rc-line/22 bg-[rgba(7,10,20,0.9)] px-4 py-2 font-rc-sans text-sm text-rc-fg shadow-rc-md">
          Waiting for opponent consent &middot; {outboundWaitingCount}
        </div>
      </div>
    );
  }

  if (!pendingInbound || !pendingInteractionId) {
    return null;
  }

  const { request, proposedGrant } = pendingInbound;
  const createdAt = request.createdAt ? new Date(request.createdAt) : null;
  const note = request.note ?? null;
  const grantSummary = describeGrant(proposedGrant);

  const handleDecision = (decision: InteractionDecision) => {
    if (!myPlayerId) return;
    respondToInteraction(request.requestId, decision, myPlayerId, {
      grant: proposedGrant ?? undefined,
    });
    if (decision !== "approved") {
      clearInteraction(request.requestId);
    }
  };

  const requesterSeat = request.from === request.to ? mySeat : null;
  const requesterName =
    (playerNameById && request.from && playerNameById[request.from]) ||
    formatPlayerName(request.from, requesterSeat, playerNames);

  const kindLabel = KIND_LABEL[request.kind] ?? request.kind;

  return (
    <div
      className={`absolute inset-0 z-40 flex items-center justify-center bg-[rgba(6,10,20,0.7)] backdrop-blur-[4px] px-4 ${
        className ?? ""
      }`.trim()}
    >
      <div className="max-w-lg rounded-rc-lg border border-rc-line/18 bg-[rgba(9,13,25,0.95)] p-6 text-rc-fg shadow-rc-panel">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="rc-eyebrow">
              Consent Request
            </p>
            <h2 className="mb-0 mt-1 font-rc-display text-[22px] leading-none text-rc-fg-strong">
              {kindLabel}
            </h2>
          </div>
        </div>
        <div className="mt-4 space-y-2 font-rc-sans text-sm">
          <p>
            <span className="text-rc-fg-subtle">Requester:</span>{" "}
            <span className="font-medium text-rc-fg-strong">{requesterName}</span>
          </p>
          {note && <p className="text-rc-fg">{note}</p>}
          {grantSummary && (
            <p className="text-rc-fg-muted">
              <span className="text-rc-fg-subtle">This will allow them to</span>{" "}
              {grantSummary}.
            </p>
          )}
          {createdAt && (
            <p className="rc-hint">
              Requested at {createdAt.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <RcButton
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => handleDecision("declined")}
          >
            Decline
          </RcButton>
          <RcButton
            type="button"
            className="w-full sm:w-auto"
            onClick={() => handleDecision("approved")}
          >
            Approve
          </RcButton>
        </div>
      </div>
    </div>
  );
}
