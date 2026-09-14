"use client";

import { Icon } from "@iconify/react";
import {
  ChevronDown,
  ChevronUp,
  LogOut,
  MessageCircle,
  ScrollText,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { useGraphicsSettings } from "@/hooks/useGraphicsSettings";
import { type MatchEvent, formatMatchEvent } from "@/hooks/useMatchEvents";
import { PLAYER_COLORS } from "@/lib/game/constants";
import { useGameStore } from "@/lib/game/store";
import type { GameEvent } from "@/lib/game/store/types";
import { useMobileDevice } from "@/lib/hooks/useTouchDevice";
import type { ServerChatPayloadT, ChatScope } from "@/lib/net/protocol";

interface OnlineConsoleProps {
  dragFromHand: boolean;
  chatLog: ServerChatPayloadT[];
  chatInput: string;
  setChatInput: (value: string) => void;
  onSendChat: (message: string, scope?: ChatScope) => void;
  onLeaveMatch: () => void;
  onLeaveLobby?: () => void;
  connected: boolean;
  myPlayerId?: string | null;
  hideLeaveButton?: boolean;
  defaultOpen?: boolean;
  hideChat?: boolean;
  position?: "bottom-left" | "top-right" | "top-left";
  matchEvents?: MatchEvent[]; // Tournament/match-level events
  playerNames?: { p1?: string; p2?: string }; // Player names to replace P1/P2
  toastOnly?: boolean; // Only show toast notifications, hide console UI
}

type StreamItem =
  | { kind: "game"; id: string; ts: number; data: GameEvent }
  | { kind: "match"; id: string; ts: number; data: MatchEvent }
  | { kind: "chat"; id: string; ts: number; data: ServerChatPayloadT };

export default function OnlineConsole({
  dragFromHand,
  chatLog,
  chatInput,
  setChatInput,
  onSendChat,
  onLeaveMatch,
  onLeaveLobby,
  connected,
  myPlayerId,
  hideLeaveButton = false,
  defaultOpen = false,
  hideChat = false,
  position = "bottom-left",
  matchEvents = [],
  playerNames,
  toastOnly = false,
}: OnlineConsoleProps) {
  const router = useRouter();
  const { settings: graphicsSettings } = useGraphicsSettings();
  const { isMobile } = useMobileDevice();

  // Calculate font size based on uiTextScale (0.5-1.5 maps to 10px-16px)
  // Base size is 12px (text-xs), scaled with min 10px and max 16px
  const baseFontSize = 12;
  const scaledFontSize = Math.max(
    10,
    Math.min(16, Math.round(baseFontSize * graphicsSettings.uiTextScale)),
  );
  const fontStyle = { fontSize: `${scaledFontSize}px` };

  const [consoleOpen, setConsoleOpen] = useState<boolean>(defaultOpen);
  const [showEvents, setShowEvents] = useState<boolean>(true);
  const [showChat, setShowChat] = useState<boolean>(true);
  const [showToast, setShowToast] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>("");
  // Only show match chat in match console (or hide entirely in replay)
  const matchChat = useMemo(() => {
    if (hideChat) return [] as ServerChatPayloadT[];
    return chatLog.filter((m) => m.scope === "match");
  }, [hideChat, chatLog]);

  // Game events
  const events = useGameStore((s) => s.events);
  const actorKey = useGameStore((s) => s.actorKey);
  const streamRef = useRef<HTMLDivElement | null>(null);

  // Auto-expand on incoming chat (not from self) and auto-collapse after 10s
  const prevMatchChatLenRef = useRef<number>(matchChat.length);
  const autoCloseTimerRef = useRef<number | null>(null);
  const lastOpenReasonRef = useRef<"auto" | "manual" | null>(null);
  const clearAutoCloseTimer = useCallback(() => {
    if (autoCloseTimerRef.current !== null) {
      window.clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  }, []);
  const startAutoCloseTimer = useCallback(() => {
    clearAutoCloseTimer();
    autoCloseTimerRef.current = window.setTimeout(() => {
      // Only close if the console is still open due to auto-open
      if (lastOpenReasonRef.current === "auto") {
        setConsoleOpen(false);
        lastOpenReasonRef.current = null;
      }
    }, 10000);
  }, [clearAutoCloseTimer]);
  // Cleanup timer on unmount
  // Intentionally not including 'matchChat' in deps to avoid overfiring scroll on every render.

  useEffect(() => {
    return () => {
      clearAutoCloseTimer();
    };
  }, [clearAutoCloseTimer]);
  // Detect new incoming messages and toggle console accordingly
  useEffect(() => {
    const prevLen = prevMatchChatLenRef.current ?? 0;
    const newCount = matchChat.length - prevLen;
    if (newCount > 0) {
      const newMessages = matchChat.slice(-newCount);
      const hasIncoming = newMessages.some((m) => {
        const fromId = m.from?.id;
        // Only trigger on messages sent by another player (ignore system and self)
        return !!fromId && !!myPlayerId && fromId !== myPlayerId;
      });
      if (hasIncoming) {
        if (!consoleOpen) {
          // Show toast instead of auto-opening
          const latestMessage = newMessages[newMessages.length - 1];
          const senderName = latestMessage.from?.displayName || "Someone";
          setToastMessage(`${senderName}: ${latestMessage.content}`);
          setShowToast(true);

          // Auto-hide toast after 4 seconds
          setTimeout(() => setShowToast(false), 4000);
        } else if (lastOpenReasonRef.current === "auto") {
          // While auto-open, reset the collapse timer on further incoming messages
          startAutoCloseTimer();
        }
      }
    }
    prevMatchChatLenRef.current = matchChat.length;
  }, [myPlayerId, consoleOpen, startAutoCloseTimer, matchChat]);

  // Format event text (same logic as offline console)
  // IMPORTANT: Hide opponent's drawn card names from the event log
  function formatEventText(text: string): string {
    const t0 = text || "";
    const seat = actorKey;
    if (seat !== "p1" && seat !== "p2") return t0;

    // oppLower is "p1" or "p2" (used in markup like [p2:PLAYER], [p2card:Name])
    const oppLower = seat === "p1" ? "p2" : "p1";
    const opp = oppLower.toUpperCase(); // "P1" or "P2" for display
    let t = t0;

    // Match markup format: [p2:PLAYER] draws [p2card:CardName] from spellbook to hand
    // This hides the specific card name the opponent drew
    t = t.replace(
      new RegExp(
        `^\\[${oppLower}:PLAYER\\] draws \\[${oppLower}card:[^\\]]+\\] from (spellbook|atlas) to hand$`,
        "i",
      ),
      (_m, pile) => `[${oppLower}:PLAYER] just drew from ${pile}`,
    );

    // Legacy format (if any): "P2 draws 'CardName' from spellbook to hand"
    t = t.replace(
      new RegExp(
        `^(${opp} draws )'[^']+' from (spellbook|atlas) to hand$`,
        "i",
      ),
      (_m, _prefix, pile) => `${opp} just drew from ${pile}`,
    );

    // Hide bulk draws from bottom (markup format)
    t = t.replace(
      new RegExp(
        `^\\[${oppLower}:PLAYER\\] draws (\\d+) from bottom of (Spellbook|Atlas)$`,
        "i",
      ),
      (_m, _n, pile) => `[${oppLower}:PLAYER] just drew from ${pile}`,
    );

    // Hide bulk draws (markup format)
    t = t.replace(
      new RegExp(
        `^\\[${oppLower}:PLAYER\\] draws (\\d+) from (Spellbook|Atlas)$`,
        "i",
      ),
      (_m, _n, pile) => `[${oppLower}:PLAYER] just drew from ${pile}`,
    );

    // Legacy format: bulk draws from bottom
    t = t.replace(
      new RegExp(`^${opp} draws (\\d+) from bottom of (spellbook|atlas)$`, "i"),
      (_m, _n, pile) => `${opp} just drew from ${pile}`,
    );

    // Legacy format: bulk draws
    t = t.replace(
      new RegExp(`^${opp} draws (\\d+) from (spellbook|atlas)$`, "i"),
      (_m, _n, pile) => `${opp} just drew from ${pile}`,
    );

    // Hide card names in "Cannot draw" errors for opponent
    t = t.replace(
      new RegExp(
        `^Cannot draw '.*?'( from .+: ${opp} is not the current player)$`,
        "i",
      ),
      "Cannot draw a card$1",
    );

    // Hide opponent's peeked card names
    // Format: "P2 peeked 'CardName' from Spellbook → drawn to hand"
    t = t.replace(
      new RegExp(`^${opp} peeked '[^']+' from (Spellbook|Atlas) → (.+)$`, "i"),
      (_m, pile, action) => `${opp} peeked a card from ${pile} → ${action}`,
    );

    return t;
  }

  // Render text with color markup [p1:Name], [p2:Name], [p1card:Name], [p2card:Name] as colored spans
  // Also replaces P1/P2 and PLAYER with actual player names if provided
  function renderColoredText(text: string): React.ReactNode {
    let processedText = text;

    // Replace P1/P2 with actual player names if provided
    if (playerNames?.p1) {
      processedText = processedText.replace(/\bP1\b/g, playerNames.p1);
    }
    if (playerNames?.p2) {
      processedText = processedText.replace(/\bP2\b/g, playerNames.p2);
    }

    const parts: React.ReactNode[] = [];
    // Match [p1:...], [p2:...], [p1card:...], [p2card:...]
    const regex = /\[(p[12])(card)?:([^\]]+)\]/g;
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = regex.exec(processedText)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(processedText.slice(lastIndex, match.index));
      }
      // Add the colored name/card
      const playerKey = match[1] as "p1" | "p2";
      const isCard = match[2] === "card";
      let displayText = match[3];

      // Replace PLAYER placeholder with actual player name
      if (displayText === "PLAYER") {
        displayText = playerNames?.[playerKey] || playerKey.toUpperCase();
      }

      parts.push(
        <span
          key={key++}
          style={{ color: PLAYER_COLORS[playerKey], fontWeight: 500 }}
          className={isCard ? "font-rc-display" : undefined}
        >
          {displayText}
        </span>,
      );
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < processedText.length) {
      parts.push(processedText.slice(lastIndex));
    }

    return parts.length > 0 ? parts : processedText;
  }

  // Build unified stream: game events + match events + chat messages, sorted chronologically
  const streamItems = useMemo(() => {
    const gameItems: StreamItem[] = events.map((ev) => ({
      kind: "game" as const,
      id: `game-${ev.id}`,
      ts: ev.ts || 0,
      data: ev,
    }));

    const matchItems: StreamItem[] = matchEvents.map((ev) => ({
      kind: "match" as const,
      id: `match-${ev.id}`,
      ts: ev.timestamp,
      data: ev,
    }));

    const chatItems: StreamItem[] = matchChat.map((m, idx) => ({
      kind: "chat" as const,
      id: `chat-${idx}-${m.ts ?? idx}`,
      ts: m.ts ?? Date.now(),
      data: m,
    }));

    return [...gameItems, ...matchItems, ...chatItems].sort(
      (a, b) => a.ts - b.ts,
    );
  }, [events, matchEvents, matchChat]);

  // Apply filter toggles
  const filteredStream = useMemo(() => {
    return streamItems.filter((item) => {
      if (item.kind === "chat") return showChat && !hideChat;
      return showEvents; // "game" and "match" are both event types
    });
  }, [streamItems, showChat, showEvents, hideChat]);

  // Auto-scroll to latest content when new content arrives
  useEffect(() => {
    if (!consoleOpen) return;
    const el = streamRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [filteredStream.length, consoleOpen]);

  const handleSendChat = () => {
    const msg = chatInput.trim();
    if (!msg) return;
    onSendChat(msg, "match");
    setChatInput("");
  };

  const handleLeaveMatch = () => {
    if (
      confirm("Leave match? You won't be prompted to rejoin automatically.")
    ) {
      onLeaveMatch();
      if (onLeaveLobby) {
        onLeaveLobby();
      } else {
        router.push("/online/lobby");
      }
    }
  };

  const positionClasses = (() => {
    switch (position) {
      case "top-right":
        return "right-3 top-2";
      case "top-left":
        return "left-3 top-2";
      default:
        return "left-[max(0.75rem,env(safe-area-inset-left))] bottom-[max(0.5rem,env(safe-area-inset-bottom))]";
    }
  })();

  const collapsed = !consoleOpen;
  // Collapsed state is always compact icon-only
  const containerWidth = collapsed ? "w-auto" : isMobile ? "w-72" : "w-80";
  const headerPadding = collapsed ? "px-1.5 py-1" : "px-3 py-2";
  const filterBtnPadding = "px-2 py-1";

  // On mobile when expanded, use fixed bottom-sheet to avoid overlapping life/hand
  const mobileExpanded = isMobile && !collapsed && !toastOnly;

  return (
    <div
      className={`${mobileExpanded ? "fixed inset-x-0 bottom-0 z-30" : `absolute ${positionClasses} z-10`} ${
        dragFromHand ? "pointer-events-none" : "pointer-events-auto"
      } text-rc-fg ${toastOnly ? "w-80" : mobileExpanded ? "w-full" : containerWidth} transition-all`}
    >
      {/* Main console UI - hidden when toastOnly */}
      {!toastOnly && (
        <div
          className={`bg-[rgba(9,13,25,0.82)] backdrop-blur ring-1 ring-rc-line/18 shadow-rc-panel transition-all ${mobileExpanded ? "rounded-t-2xl max-h-[50vh] pb-[max(1rem,env(safe-area-inset-bottom))]" : "rounded-rc-lg"}`}
        >
          {/* Header - compact icon-only when collapsed, filter toggles when expanded */}
          <div
            className={`flex items-center justify-between ${headerPadding} text-sm ${!collapsed ? "border-b border-rc-line/18" : ""} select-none`}
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* Collapsed: compact icon buttons with badges */}
            {collapsed ? (
              <div className="flex items-center gap-0.5">
                <button
                  className={`rounded-rc-sm bg-black/35 text-rc-fg-muted ring-1 ring-rc-line/22 hover:text-rc-accent-ring hover:ring-rc-accent ${isMobile ? "p-1" : "p-1.5"} transition-colors relative`}
                  onClick={() => {
                    setConsoleOpen(true);
                    lastOpenReasonRef.current = "manual";
                    clearAutoCloseTimer();
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                  title="Events"
                >
                  <ScrollText className={isMobile ? "w-3 h-3" : "w-4 h-4"} />
                  {events.length > 0 && (
                    <span
                      className={`absolute -top-1 -right-1 bg-rc-info text-rc-fg-strong font-rc-mono tabular-nums flex items-center justify-center rounded-full ${isMobile ? "text-[7px] min-w-[12px] h-[12px]" : "text-[9px] min-w-[14px] h-[14px]"}`}
                    >
                      {events.length > 99 ? "99+" : events.length}
                    </span>
                  )}
                </button>
                {!hideChat && matchChat.length > 0 && (
                  <button
                    className={`rounded-rc-sm bg-black/35 text-rc-fg-muted ring-1 ring-rc-line/22 hover:text-rc-accent-ring hover:ring-rc-accent ${isMobile ? "p-1" : "p-1.5"} transition-colors relative`}
                    onClick={() => {
                      setConsoleOpen(true);
                      setShowChat(true);
                      lastOpenReasonRef.current = "manual";
                      clearAutoCloseTimer();
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    title="Chat"
                  >
                    <MessageCircle
                      className={isMobile ? "w-3 h-3" : "w-4 h-4"}
                    />
                    <span
                      className={`absolute -top-1 -right-1 bg-rc-success text-rc-fg-strong font-rc-mono tabular-nums flex items-center justify-center rounded-full ${isMobile ? "text-[7px] min-w-[12px] h-[12px]" : "text-[9px] min-w-[14px] h-[14px]"}`}
                    >
                      {matchChat.length > 99 ? "99+" : matchChat.length}
                    </span>
                  </button>
                )}
                <button
                  className={`rounded-rc-sm bg-black/35 text-rc-fg-muted ring-1 ring-rc-line/22 hover:text-rc-accent-ring hover:ring-rc-accent ${isMobile ? "p-0.5" : "p-1"} transition-colors`}
                  onClick={() => {
                    setConsoleOpen(true);
                    lastOpenReasonRef.current = "manual";
                    clearAutoCloseTimer();
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                  title="Expand console"
                >
                  <ChevronUp className={isMobile ? "w-3 h-3" : "w-4 h-4"} />
                </button>
              </div>
            ) : (
              /* Expanded: filter toggle buttons */
              <>
                <div className="flex items-center gap-1">
                  <button
                    className={`flex items-center gap-1 ${filterBtnPadding} rounded-rc-sm font-rc-mono tracking-[0.08em] text-[11px] transition-colors ${
                      showEvents
                        ? "text-rc-info"
                        : "text-rc-fg-dim hover:text-rc-fg-muted"
                    }`}
                    aria-pressed={showEvents}
                    onClick={() => setShowEvents((v) => !v)}
                    onContextMenu={(e) => e.preventDefault()}
                    title={showEvents ? "Hide events" : "Show events"}
                  >
                    <ScrollText className="w-3 h-3" />
                    Events
                    {events.length > 0 && (
                      <span className="tabular-nums text-[11px] opacity-70">
                        {events.length}
                      </span>
                    )}
                  </button>
                  {!hideChat && (
                    <button
                      className={`flex items-center gap-1 ${filterBtnPadding} rounded-rc-sm font-rc-mono tracking-[0.08em] text-[11px] transition-colors ${
                        showChat
                          ? "text-rc-success"
                          : "text-rc-fg-dim hover:text-rc-fg-muted"
                      }`}
                      aria-pressed={showChat}
                      onClick={() => setShowChat((v) => !v)}
                      onContextMenu={(e) => e.preventDefault()}
                      title={showChat ? "Hide chat" : "Show chat"}
                    >
                      <MessageCircle className="w-3 h-3" />
                      Chat
                      {matchChat.length > 0 && (
                        <span className="tabular-nums text-[11px] opacity-70">
                          {matchChat.length}
                        </span>
                      )}
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {!hideLeaveButton && (
                    <button
                      className="rounded-rc-sm bg-rc-danger/85 hover:bg-rc-danger-hover text-rc-fg-strong font-rc-mono tracking-[0.08em] px-2 py-0.5 text-[11px] flex items-center gap-1 transition-colors"
                      onClick={handleLeaveMatch}
                      title="Leave match and return to lobby"
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <LogOut className="w-3 h-3" />
                      Leave
                    </button>
                  )}
                  <button
                    className="rounded-rc-sm text-rc-fg-dim hover:text-rc-accent-ring px-2 py-0.5 text-[11px] transition-colors"
                    onClick={() => {
                      setConsoleOpen(false);
                      lastOpenReasonRef.current = "manual";
                      clearAutoCloseTimer();
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    title="Collapse console"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Content: interleaved stream + chat input */}
          {consoleOpen && (
            <div className="h-64 flex flex-col">
              {/* Interleaved stream */}
              <div
                ref={streamRef}
                data-allow-wheel="true"
                className="flex-1 overflow-y-scroll thin-scrollbar px-3 py-3 space-y-1 min-h-0 font-rc-mono leading-[1.5]"
                style={fontStyle}
              >
                {filteredStream.length === 0 && (
                  <div className="text-rc-fg-dim">No events yet</div>
                )}
                {filteredStream.slice(-100).map((item) => {
                  if (item.kind === "match") {
                    // Render match/tournament event
                    const formatted = formatMatchEvent(item.data);
                    return (
                      <div
                        key={item.id}
                        className={formatted.color || ""}
                      >
                        {formatted.icon ? (
                          <Icon
                            icon={formatted.icon}
                            width="1em"
                            height="1em"
                            className="mr-1 inline-block align-[-0.125em]"
                            aria-hidden="true"
                          />
                        ) : (
                          "• "
                        )}
                        {formatted.text}
                      </div>
                    );
                  } else if (item.kind === "chat") {
                    // Render chat message with green left border
                    const m = item.data;
                    return (
                      <div
                        key={item.id}
                        className="border-l-2 border-rc-success/50 pl-2 py-0.5"
                      >
                        <span className="font-semibold text-rc-success">
                          {m.from?.displayName ?? "System"}
                        </span>
                        <span className="text-rc-fg">: {m.content}</span>
                      </div>
                    );
                  } else {
                    // Render game event
                    const ev = item.data;
                    const t = ev.text || "";
                    const low = t.toLowerCase();
                    // Detect warnings: messages starting with [warning], warning, cannot, or other error patterns
                    const isWarn =
                      low.startsWith("[warning]") ||
                      low.startsWith("warning") ||
                      low.startsWith("cannot") ||
                      low.includes("cannot") ||
                      low.startsWith("insufficient") ||
                      low.startsWith("first site must") ||
                      low.startsWith("new sites must") ||
                      low.startsWith("sites cannot") ||
                      low.startsWith("permanents can only") ||
                      low.startsWith("avatar must");
                    const isSearch = low.startsWith("search:");
                    const turnPrefix = ev.turn ? `[T${ev.turn}] ` : "";
                    // Color turn prefix by which player's turn it was
                    const turnColor =
                      ev.player === 1
                        ? PLAYER_COLORS.p1
                        : ev.player === 2
                          ? PLAYER_COLORS.p2
                          : undefined;
                    return (
                      <div
                        key={item.id}
                        className={`${
                          isWarn
                            ? "text-rc-warning"
                            : isSearch
                              ? "text-rc-info"
                              : "text-rc-fg-muted"
                        }`}
                      >
                        {turnPrefix && (
                          <span
                            className="tabular-nums text-rc-fg-dim"
                            style={turnColor ? { color: turnColor } : undefined}
                          >
                            {turnPrefix}
                          </span>
                        )}
                        • {renderColoredText(formatEventText(ev.text))}
                      </div>
                    );
                  }
                })}
              </div>

              {/* Chat input - always visible when expanded and chat not hidden */}
              {!hideChat && (
                <div
                  className="px-3 pb-3 pt-2 border-t border-rc-line/18 flex gap-2 select-none"
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <input
                    className="flex-1 bg-black/45 ring-1 ring-rc-line/22 rounded-rc-md px-2 py-1 font-rc-mono text-rc-fg placeholder:text-rc-fg-dim outline-none focus:ring-rc-accent-ring"
                    style={fontStyle}
                    placeholder="Type a message..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSendChat();
                      }
                    }}
                    disabled={!connected}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                  <RcButton
                    size="xs"
                    className="h-auto px-3 py-1 font-rc-mono uppercase tracking-[0.14em]"
                    style={fontStyle}
                    onClick={handleSendChat}
                    disabled={!connected || !chatInput.trim()}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    Send
                  </RcButton>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Toast notification for chat messages - always shown (even in toastOnly mode) */}
      {showToast && (toastOnly || !consoleOpen) && (
        <div
          className={`rc-toast absolute ${toastOnly ? "top-0" : "top-[-70px]"} left-0 right-0 rounded-rc-lg px-4 py-3 text-sm cursor-pointer transform transition-all duration-300 ease-out z-20`}
          data-tone="info"
          style={{
            animation: "slideInUp 0.4s ease-out",
          }}
          onClick={() => {
            if (!toastOnly) {
              setConsoleOpen(true);
              setShowChat(true);
            }
            setShowToast(false);
            lastOpenReasonRef.current = "manual";
            clearAutoCloseTimer();
          }}
        >
          <div className="flex items-center gap-2">
            <MessageCircle
              className="w-4 h-4 flex-none text-rc-success"
              aria-hidden="true"
            />
            <span className="font-medium truncate text-rc-fg-strong">
              {toastMessage}
            </span>
            <span className="text-xs font-rc-mono tracking-[0.08em] text-rc-fg-dim ml-auto">
              Click to view
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
