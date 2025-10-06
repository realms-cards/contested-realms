"use client";

import { useMemo } from "react";
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
        <div className="pointer-events-auto rounded-lg bg-slate-800/90 px-4 py-2 text-sm text-slate-100 shadow-lg ring-1 ring-slate-700/70">
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
      className={`absolute inset-0 z-40 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm px-4 ${
        className ?? ""
      }`.trim()}
    >
      <div className="max-w-lg rounded-xl bg-slate-900/95 p-6 text-slate-100 shadow-2xl ring-1 ring-slate-700/70">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Consent Request
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-50">
              {kindLabel}
            </h2>
          </div>
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <p>
            <span className="text-slate-400">Requester:</span>{" "}
            <span className="font-medium text-slate-100">{requesterName}</span>
          </p>
          {note && <p className="text-slate-200">{note}</p>}
          {grantSummary && (
            <p className="text-slate-300">
              <span className="text-slate-400">This will allow them to</span>{" "}
              {grantSummary}.
            </p>
          )}
          {createdAt && (
            <p className="text-xs text-slate-500">
              Requested at {createdAt.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="w-full rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 sm:w-auto"
            onClick={() => handleDecision("declined")}
          >
            Decline
          </button>
          <button
            type="button"
            className="w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 sm:w-auto"
            onClick={() => handleDecision("approved")}
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
