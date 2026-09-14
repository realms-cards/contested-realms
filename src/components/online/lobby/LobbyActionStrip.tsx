"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useOnline } from "@/app/online/online-context";
import { isFeatureEnabled } from "@/lib/config/features";
import {
  buildLobbyInvitePath,
  buildLobbyInviteUrl,
  createInviteLobbyId,
} from "@/lib/lobby-links";

interface LobbyActionStripProps {
  onCreateMatch: () => void;
}

const TILE_BASE =
  "relative block rounded-rc-lg border px-7 py-[22px] text-left transition-[border-color,background-color,box-shadow,transform] duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rc-accent-ring";
const EYEBROW = "font-rc-mono text-[11px] uppercase tracking-[0.24em]";
const SUB = "mt-2 font-rc-mono text-xs tracking-[0.06em]";

/**
 * The four entry actions: Create Match (solid gold), Constructed Queue
 * (amber, live count + matchmaking states), Invite a Friend (dashed, copy
 * link) and Learn to Play (ghost). Hidden while the player is in a lobby or
 * match, exactly like the panel it replaces.
 */
export default function LobbyActionStrip({
  onCreateMatch,
}: LobbyActionStripProps) {
  const {
    matchmaking,
    joinMatchmaking,
    leaveMatchmaking,
    declineMatchmaking,
    leaveLobby,
    lobby,
    match,
    isGuest,
  } = useOnline();

  // One invite id per visit: the lobby is materialised on demand when the
  // first person opens the link, so it can be copied before it exists.
  const [inviteId] = useState(() => createInviteLobbyId());
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  useEffect(() => {
    if (matchmaking.status !== "confirming") return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [matchmaking.status]);

  const disabled = !!lobby || !!match;
  if (disabled) return null;

  const isSearching = matchmaking.status === "searching";
  const isConfirming = matchmaking.status === "confirming";
  const matchFound = matchmaking.status === "found";
  const queueSize = matchmaking.queueSize ?? 0;
  const queueBySource = matchmaking.queueBySource;
  const queuePosition = matchmaking.queuePosition;
  const confirmSeconds =
    matchmaking.confirmExpiresAt !== null
      ? Math.max(0, Math.ceil((matchmaking.confirmExpiresAt - now) / 1000))
      : null;

  const handleQueueClick = () => {
    if (isConfirming) {
      declineMatchmaking();
      return;
    }
    if (isSearching || matchFound) {
      leaveMatchmaking();
      if (lobby) leaveLobby();
      return;
    }
    joinMatchmaking(["constructed"]);
  };

  const invitePath = buildLobbyInvitePath(inviteId);
  const inviteUrl = origin ? buildLobbyInviteUrl(origin, inviteId) : "";
  const inviteDisplay = inviteUrl.replace(/^https?:\/\//, "");
  const copyInvite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const queueTitle = isConfirming
    ? "Match Found"
    : matchFound
      ? "Match Ready"
      : isSearching
        ? "Searching…"
        : "Constructed Queue";
  const queueSub = isConfirming
    ? `confirm${confirmSeconds !== null ? ` · ${confirmSeconds}s` : ""} · click to decline`
    : matchFound
      ? "entering match…"
      : isSearching
        ? queuePosition !== null
          ? `you are #${queuePosition + 1} · click to cancel`
          : "click to cancel"
        : "click to find match";

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3.5">
      {/* (a) Create Match: the only filled tile */}
      <button
        type="button"
        onClick={onCreateMatch}
        className={`${TILE_BASE} border-rc-accent-ring bg-gradient-to-b from-rc-accent-hover to-rc-accent text-rc-accent-fg shadow-[0_6px_14px_rgba(0,0,0,0.4),0_0_22px_rgba(243,207,106,0.22)] hover:-translate-y-px hover:shadow-[0_6px_14px_rgba(0,0,0,0.4),0_0_30px_rgba(243,207,106,0.35)]`}
      >
        <div className={`${EYEBROW} text-rc-gold-ink`}>primary</div>
        <div className="mt-1.5 font-rc-display text-[34px] leading-none text-rc-accent-fg">
          Create Match
        </div>
        <div className={`${SUB} text-rc-gold-ink`}>
          Constructed · Sealed · Draft
        </div>
      </button>

      {/* (b) Constructed Queue: amber card with the live count */}
      {isGuest ? (
        <Link
          href="/auth/signin?callbackUrl=%2Fonline%2Flobby"
          className={`${TILE_BASE} flex items-center justify-between gap-4 border-rc-warning/45 bg-gradient-to-br from-rc-warning/16 to-[rgba(9,13,25,0.85)] to-60% shadow-rc-panel hover:-translate-y-px hover:border-rc-warning hover:shadow-[0_6px_14px_rgba(0,0,0,0.4),0_0_18px_rgba(217,155,44,0.35)]`}
        >
          <div>
            <div className={`${EYEBROW} text-rc-warning`}>ranked</div>
            <div className="mt-1.5 font-rc-display text-[28px] leading-none text-rc-fg-strong">
              Constructed Queue
            </div>
            <div className={`${SUB} text-rc-fg-subtle`}>
              sign in to use matchmaking
            </div>
          </div>
          <QueueCount value={queueSize} />
        </Link>
      ) : (
        <button
          type="button"
          onClick={handleQueueClick}
          className={`${TILE_BASE} flex items-center justify-between gap-4 border-rc-warning/45 bg-gradient-to-br from-rc-warning/16 to-[rgba(9,13,25,0.85)] to-60% shadow-rc-panel hover:-translate-y-px hover:border-rc-warning hover:shadow-[0_6px_14px_rgba(0,0,0,0.4),0_0_18px_rgba(217,155,44,0.35)] ${
            isSearching || isConfirming ? "border-rc-warning" : ""
          }`}
          aria-live="polite"
        >
          <div className="min-w-0">
            <div className={`${EYEBROW} text-rc-warning`}>ranked</div>
            <div className="mt-1.5 font-rc-display text-[28px] leading-none text-rc-fg-strong">
              {queueTitle}
            </div>
            <div className={`${SUB} text-rc-fg-subtle`}>{queueSub}</div>
            {queueBySource && !isSearching && !isConfirming && (
              <div className="mt-1 font-rc-mono text-[11px] tracking-[0.06em] text-rc-fg-dim">
                {queueBySource.web} web · {queueBySource.discord} discord
              </div>
            )}
          </div>
          <QueueCount value={queueSize} pulse={isSearching || isConfirming} />
        </button>
      )}

      {/* (c) Invite a Friend: dashed outline + inline copy field */}
      <Link
        href={invitePath}
        className={`${TILE_BASE} border-dashed border-rc-info/60 bg-rc-info/6 hover:-translate-y-px hover:border-rc-info hover:bg-rc-info/12`}
        title="Open a private lobby anyone with the link can join - no account needed"
      >
        <div className={`${EYEBROW} text-rc-info`}>private</div>
        <div className="mt-1.5 font-rc-display text-[28px] leading-none text-rc-fg-strong">
          Invite a Friend
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={copyInvite}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") void copyInvite(e as unknown as React.MouseEvent);
          }}
          className="mt-2.5 flex items-center gap-2 rounded-rc-sm border border-rc-line/12 bg-black/40 px-2.5 py-1.5 font-rc-mono text-xs text-rc-fg-muted transition-colors hover:border-rc-info/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rc-accent-ring"
          title="Copy invite link"
        >
          <span className="flex-1 truncate">{inviteDisplay || "…"}</span>
          <span className="text-[10px] uppercase tracking-[0.1em] text-rc-info">
            {copied ? "copied" : "copy"}
          </span>
        </div>
      </Link>

      {/* (d) Learn to Play: quiet ghost tile */}
      {isFeatureEnabled("tutorialMode") && (
        <Link
          href="/tutorial"
          className={`${TILE_BASE} flex flex-col justify-center border-transparent bg-transparent hover:border-rc-success/50 hover:bg-rc-success/6`}
        >
          <div className={`${EYEBROW} text-rc-success`}>new here?</div>
          <div className="mt-1.5 font-rc-display text-[28px] leading-none text-rc-fg-strong">
            Learn to Play <span className="text-rc-success">→</span>
          </div>
          <div className={`${SUB} text-rc-fg-subtle`}>
            Interactive tutorial · 12 min · no account
          </div>
        </Link>
      )}
    </div>
  );
}

function QueueCount({ value, pulse = false }: { value: number; pulse?: boolean }) {
  return (
    <div className="flex-none text-center">
      <div
        className={`font-rc-mono text-[40px] font-semibold leading-none tabular-nums text-rc-warning ${
          pulse ? "animate-rc-blink" : ""
        }`}
      >
        {value}
      </div>
      <div className="mt-1 font-rc-mono text-[10px] uppercase tracking-[0.2em] text-rc-fg-dim">
        in queue
      </div>
    </div>
  );
}
