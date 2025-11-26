"use client";

import {
  ChevronDown,
  ChevronUp,
  LogOut,
  MessageCircle,
  ScrollText,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { PLAYER_COLORS } from "@/lib/game/constants";
import { useGameStore } from "@/lib/game/store";
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
}

type TabType = "events" | "chat";

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
}: OnlineConsoleProps) {
  const router = useRouter();
  const [consoleOpen, setConsoleOpen] = useState<boolean>(defaultOpen);
  const [activeTab, setActiveTab] = useState<TabType>("events");
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
  const eventsRef = useRef<HTMLDivElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);

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

  // Ensure chat tab cannot be active when chat is hidden
  useEffect(() => {
    if (hideChat && activeTab === "chat") setActiveTab("events");
  }, [hideChat, activeTab]);

  // Format event text (same logic as offline console)
  function formatEventText(text: string): string {
    const t0 = text || "";
    const seat = actorKey;
    if (seat !== "p1" && seat !== "p2") return t0;

    const opp = seat === "p1" ? "P2" : "P1";
    let t = t0;

    t = t.replace(
      new RegExp(
        `^(${opp} draws )'[^']+' from (spellbook|atlas) to hand$`,
        "i"
      ),
      (_m, _prefix, pile) => `${opp} just drew from ${pile}`
    );

    t = t.replace(
      new RegExp(`^${opp} draws (\\d+) from bottom of (spellbook|atlas)$`, "i"),
      (_m, _n, pile) => `${opp} just drew from ${pile}`
    );

    t = t.replace(
      new RegExp(`^${opp} draws (\\d+) from (spellbook|atlas)$`, "i"),
      (_m, _n, pile) => `${opp} just drew from ${pile}`
    );

    t = t.replace(
      new RegExp(
        `^Cannot draw '.*?'( from .+: ${opp} is not the current player)$`,
        "i"
      ),
      "Cannot draw a card$1"
    );

    return t;
  }

  // Render text with color markup [p1:Name] or [p2:Name] as colored spans
  function renderColoredText(text: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    const regex = /\[(p[12]):([^\]]+)\]/g;
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = regex.exec(text)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      // Add the colored name
      const playerKey = match[1] as "p1" | "p2";
      const cardName = match[2];
      parts.push(
        <span
          key={key++}
          style={{ color: PLAYER_COLORS[playerKey], fontWeight: 500 }}
        >
          {cardName}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  }

  // Auto-scroll to latest content when tab changes or new content arrives
  useEffect(() => {
    if (!consoleOpen) return;
    const targetRef = activeTab === "events" ? eventsRef : chatRef;
    const el = targetRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [events.length, matchChat.length, activeTab, consoleOpen]);

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
      }
      router.push("/online/lobby");
    }
  };

  const positionClasses = (() => {
    switch (position) {
      case "top-right":
        return "right-3 top-2";
      case "top-left":
        return "left-3 top-2";
      default:
        return "left-3 bottom-2";
    }
  })();

  const collapsed = !consoleOpen;
  const containerWidth = collapsed ? "w-64" : "w-80";
  const headerPadding = collapsed ? "px-2 py-1" : "px-3 py-2";
  const tabBtnPadding = collapsed ? "px-2 py-0.5" : "px-2 py-1";

  return (
    <div
      className={`absolute ${positionClasses} z-10 ${
        dragFromHand ? "pointer-events-none" : "pointer-events-auto"
      } text-white ${containerWidth} transition-all`}
    >
      <div className="bg-black/60 backdrop-blur rounded-xl ring-1 ring-white/10 shadow transition-all">
        {/* Header with tabs */}
        <div
          className={`flex items-center justify-between ${headerPadding} text-sm border-b border-white/10 select-none`}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="flex items-center gap-2">
            <button
              className={`flex items-center gap-1 ${tabBtnPadding} rounded text-xs transition-colors ${
                activeTab === "events"
                  ? "bg-white/20 text-white"
                  : "hover:bg-white/10 opacity-70"
              }`}
              onClick={() => {
                setActiveTab("events");
                if (!consoleOpen) {
                  setConsoleOpen(true);
                  lastOpenReasonRef.current = "manual";
                  clearAutoCloseTimer();
                }
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <ScrollText className="w-3 h-3" />
              Events
              {events.length > 0 && (
                <span className="bg-blue-500 text-white text-xs px-1 rounded-full">
                  {events.length}
                </span>
              )}
            </button>
            {!hideChat && (
              <button
                className={`flex items-center gap-1 ${tabBtnPadding} rounded text-xs transition-colors ${
                  activeTab === "chat"
                    ? "bg-white/20 text-white"
                    : "hover:bg-white/10 opacity-70"
                }`}
                onClick={() => {
                  setActiveTab("chat");
                  if (!consoleOpen) {
                    setConsoleOpen(true);
                    lastOpenReasonRef.current = "manual";
                    clearAutoCloseTimer();
                  }
                }}
                onContextMenu={(e) => e.preventDefault()}
              >
                <MessageCircle className="w-3 h-3" />
                Chat
                {matchChat.length > 0 && (
                  <span className="bg-green-500 text-white text-xs px-1 rounded-full">
                    {matchChat.length}
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {!hideLeaveButton && consoleOpen && (
              <button
                className="rounded bg-red-600/80 hover:bg-red-600 px-2 py-0.5 text-xs flex items-center gap-1 transition-colors"
                onClick={handleLeaveMatch}
                title="Leave match and return to lobby"
                onContextMenu={(e) => e.preventDefault()}
              >
                <LogOut className="w-3 h-3" />
                Leave
              </button>
            )}
            <button
              className="rounded bg-white/10 hover:bg-white/20 px-2 py-0.5 text-xs transition-colors"
              onClick={() => {
                setConsoleOpen((o) => {
                  const next = !o;
                  // Any explicit user toggle takes precedence over auto behavior
                  lastOpenReasonRef.current = "manual";
                  clearAutoCloseTimer();
                  return next;
                });
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {consoleOpen ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Content */}
        {consoleOpen && (
          <div className="h-64 flex flex-col">
            {/* Events Tab */}
            {activeTab === "events" && (
              <div
                ref={eventsRef}
                data-allow-wheel="true"
                className="flex-1 overflow-y-scroll thin-scrollbar px-3 py-3 text-xs space-y-1 min-h-0"
              >
                {events.length === 0 && (
                  <div className="opacity-60">No events yet</div>
                )}
                {events.slice(-100).map((ev, index) => {
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
                      key={`${ev.id}-${index}`}
                      className={`opacity-85 ${
                        isWarn
                          ? "text-yellow-400"
                          : isSearch
                          ? "text-blue-400"
                          : ""
                      }`}
                    >
                      {turnPrefix && (
                        <span
                          className="opacity-70"
                          style={turnColor ? { color: turnColor } : undefined}
                        >
                          {turnPrefix}
                        </span>
                      )}
                      • {renderColoredText(formatEventText(ev.text))}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Chat Tab */}
            {activeTab === "chat" && !hideChat && (
              <>
                <div
                  ref={chatRef}
                  data-allow-wheel="true"
                  className="flex-1 overflow-y-scroll thin-scrollbar px-3 py-3 text-xs space-y-1 min-h-0"
                >
                  {matchChat.length === 0 && (
                    <div className="opacity-60">No messages</div>
                  )}
                  {matchChat.map((m, i) => (
                    <div key={i} className="opacity-90">
                      <span className="font-medium">
                        {m.from?.displayName ?? "System"}
                      </span>
                      : {m.content}
                    </div>
                  ))}
                </div>

                {/* Chat input */}
                <div
                  className="px-3 pb-3 pt-2 border-t border-white/10 flex gap-2 select-none"
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <input
                    className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-xs"
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
                  <button
                    className="rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 text-xs transition-colors"
                    onClick={handleSendChat}
                    disabled={!connected || !chatInput.trim()}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    Send
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Toast notification for chat messages when console is collapsed or chat not active */}
      {showToast && (!consoleOpen || activeTab !== "chat") && (
        <div
          className="absolute top-[-70px] left-0 right-0 bg-black/70 rounded-lg px-4 py-3 text-sm text-white shadow-xl cursor-pointer transform transition-all duration-300 ease-out z-20"
          style={{
            animation: "slideInUp 0.4s ease-out",
          }}
          onClick={() => {
            setConsoleOpen(true);
            setActiveTab("chat");
            setShowToast(false);
            lastOpenReasonRef.current = "manual";
            clearAutoCloseTimer();
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">💬</span>
            <span className="font-medium truncate">{toastMessage}</span>
            <span className="text-xs opacity-75 ml-auto">Click to view</span>
          </div>
        </div>
      )}
    </div>
  );
}
