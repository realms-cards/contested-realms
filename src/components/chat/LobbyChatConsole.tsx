"use client";

import { ChevronDown, ChevronUp, Loader2, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatScope, ServerChatPayloadT } from "@/lib/net/protocol";
import { fetchPatrons, PATRON_COLORS, type PatronData } from "@/lib/patrons";

interface LobbyChatConsoleProps {
  connected: boolean;
  chatLog: ServerChatPayloadT[];
  chatTab: "lobby" | "global";
  setChatTab: (tab: "lobby" | "global") => void;
  chatInput: string;
  setChatInput: (value: string) => void;
  onSendChat: (message: string, scope: ChatScope) => void;
  myPlayerId?: string | null;
  position?: "bottom-left" | "top-right" | "top-left";
  // Pagination for global chat history
  chatHasMore?: boolean;
  chatLoading?: boolean;
  onRequestMoreHistory?: () => void;
  // Inline mode: renders as a normal flow element instead of fixed position
  inline?: boolean;
}

export default function LobbyChatConsole({
  connected,
  chatLog,
  chatTab,
  setChatTab,
  chatInput,
  setChatInput,
  onSendChat,
  myPlayerId,
  position = "bottom-left",
  chatHasMore,
  chatLoading,
  onRequestMoreHistory,
  inline = false,
}: LobbyChatConsoleProps) {
  const [consoleOpen, setConsoleOpen] = useState<boolean>(true);
  const [patrons, setPatrons] = useState<PatronData | null>(null);

  // Fetch patrons on mount
  useEffect(() => {
    fetchPatrons().then(setPatrons);
  }, []);

  const lobbyMessages = useMemo(
    () => chatLog.filter((m) => m.scope === "lobby"),
    [chatLog]
  );
  const globalMessages = useMemo(
    () => chatLog.filter((m) => m.scope === "global"),
    [chatLog]
  );
  const activeMessages = chatTab === "lobby" ? lobbyMessages : globalMessages;

  const chatRef = useRef<HTMLDivElement | null>(null);
  const prevMessageCountRef = useRef<number>(0);
  const isNearBottomRef = useRef<boolean>(true);
  const loadingHistoryRef = useRef<boolean>(false);
  const lastHistoryRequestRef = useRef<number>(0);
  const prevScrollHeightRef = useRef<number>(0);

  // Auto-scroll to latest message only when NEW messages arrive (not when loading history)
  // and only if user is already near the bottom
  // Also preserve scroll position when prepending history
  useEffect(() => {
    if (!consoleOpen) return;
    const el = chatRef.current;
    if (!el) return;

    const prevCount = prevMessageCountRef.current;
    const currentCount = activeMessages.length;
    const prevScrollHeight = prevScrollHeightRef.current;

    // If we were loading history, preserve scroll position
    if (loadingHistoryRef.current && currentCount > prevCount) {
      // History was prepended - maintain scroll position relative to old content
      const scrollDelta = el.scrollHeight - prevScrollHeight;
      el.scrollTop = el.scrollTop + scrollDelta;
      loadingHistoryRef.current = false;
    } else if (currentCount > prevCount && isNearBottomRef.current) {
      // New messages at the end - scroll to bottom
      el.scrollTop = el.scrollHeight;
    }

    prevMessageCountRef.current = currentCount;
    prevScrollHeightRef.current = el.scrollHeight;
  }, [consoleOpen, activeMessages.length]);

  // Scroll to bottom when switching tabs
  useEffect(() => {
    const el = chatRef.current;
    if (!el || !consoleOpen) return;
    el.scrollTop = el.scrollHeight;
    isNearBottomRef.current = true;
    prevMessageCountRef.current = activeMessages.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset on tab/console toggle, not message changes
  }, [chatTab, consoleOpen]);

  // Load more history when scrolling to top (global chat only)
  // Also track if user is near bottom for auto-scroll behavior
  const handleScroll = () => {
    const el = chatRef.current;
    if (!el) return;

    // Track if user is near the bottom (within 50px)
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 50;

    // Load more history when near top (global chat only)
    // Throttle requests to prevent rapid firing (500ms cooldown)
    if (
      chatTab === "global" &&
      chatHasMore &&
      onRequestMoreHistory &&
      !chatLoading
    ) {
      if (el.scrollTop < 40) {
        const now = Date.now();
        if (now - lastHistoryRequestRef.current > 500) {
          lastHistoryRequestRef.current = now;
          loadingHistoryRef.current = true;
          prevScrollHeightRef.current = el.scrollHeight;
          onRequestMoreHistory();
        }
      }
    }
  };

  const handleSend = () => {
    const msg = chatInput.trim();
    if (!msg || !connected) return;
    const scope: ChatScope = chatTab;
    onSendChat(msg, scope);
    setChatInput("");
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

  const containerWidth = consoleOpen ? "w-80" : "w-64";
  const headerPadding = consoleOpen ? "px-3 py-2" : "px-2 py-1";

  // Inline mode: normal flow element; fixed mode: floating overlay
  const containerClasses = inline
    ? "text-white w-full h-full flex flex-col overflow-hidden"
    : `fixed ${positionClasses} z-30 text-white ${containerWidth} transition-all pointer-events-auto`;

  const innerClasses = inline
    ? "bg-slate-900/60 ring-1 ring-slate-800 rounded-xl flex flex-col h-full overflow-hidden"
    : "bg-black/60 backdrop-blur rounded-xl ring-1 ring-white/10 shadow";

  return (
    <div className={containerClasses}>
      <div className={innerClasses}>
        {/* Header */}
        <div
          className={`flex items-center justify-between ${headerPadding} text-sm border-b border-white/10 select-none`}
        >
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs opacity-90">
              <MessageCircle className="w-3 h-3" />
              <span>Lobby Chat</span>
            </div>
            {/* Scope toggles */}
            <div className="flex items-center gap-1 ml-2">
              <button
                className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                  chatTab === "lobby"
                    ? "bg-white/20 text-white"
                    : "hover:bg-white/10 opacity-80"
                }`}
                onClick={() => setChatTab("lobby")}
              >
                Lobby
                {lobbyMessages.length > 0 && (
                  <span className="ml-1 bg-emerald-500/80 text-white text-[10px] px-1 rounded-full">
                    {lobbyMessages.length}
                  </span>
                )}
              </button>
              <button
                className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                  chatTab === "global"
                    ? "bg-white/20 text-white"
                    : "hover:bg-white/10 opacity-80"
                }`}
                onClick={() => setChatTab("global")}
              >
                Global
                {globalMessages.length > 0 && (
                  <span className="ml-1 bg-sky-500/80 text-white text-[10px] px-1 rounded-full">
                    {globalMessages.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          <button
            className="rounded bg-white/10 hover:bg-white/20 px-2 py-0.5 text-xs transition-colors"
            onClick={() => setConsoleOpen((o) => !o)}
          >
            {consoleOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Content */}
        {consoleOpen && (
          <div
            className={
              inline
                ? "flex-1 flex flex-col min-h-0 overflow-hidden"
                : "h-56 flex flex-col"
            }
          >
            <div
              ref={chatRef}
              data-allow-wheel="true"
              className="flex-1 overflow-y-auto thin-scrollbar px-3 py-3 text-xs space-y-1 min-h-0 max-h-full"
              onScroll={handleScroll}
            >
              {/* Loading indicator for history */}
              {chatTab === "global" && chatLoading && (
                <div className="flex items-center justify-center py-2 text-slate-400">
                  <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                  <span className="text-[10px]">Loading older messages...</span>
                </div>
              )}
              {/* Load more hint when scrolled to top */}
              {chatTab === "global" &&
                chatHasMore &&
                !chatLoading &&
                activeMessages.length > 0 && (
                  <div className="text-center py-1 text-[10px] text-slate-500">
                    ↑ Scroll up for more
                  </div>
                )}
              {activeMessages.length === 0 && !chatLoading && (
                <div className="opacity-60">No messages</div>
              )}
              {activeMessages.map((m, i) => {
                const fromName = m.from?.displayName ?? "System";
                const isMine = myPlayerId && m.from?.id === myPlayerId;
                const patronTier =
                  m.from?.id && patrons
                    ? patrons.kingofthe?.some((p) => p.id === m.from?.id)
                      ? "kingofthe"
                      : patrons.grandmaster.some((p) => p.id === m.from?.id)
                      ? "grandmaster"
                      : patrons.apprentice.some((p) => p.id === m.from?.id)
                      ? "apprentice"
                      : null
                    : null;
                const patronStyle = patronTier
                  ? PATRON_COLORS[patronTier]
                  : null;
                const timeStr = m.ts
                  ? new Date(m.ts).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : null;
                return (
                  <div
                    key={`${m.scope}-${i}-${m.from?.id ?? "system"}`}
                    className={`opacity-90 ${
                      isMine ? "text-slate-50" : "text-slate-100"
                    }`}
                  >
                    <div className="flex flex-col">
                      <div>
                        <span
                          className={`font-medium ${patronStyle?.text ?? ""}`}
                          style={
                            patronStyle
                              ? { textShadow: patronStyle.textShadowMinimal }
                              : undefined
                          }
                        >
                          {fromName}
                        </span>
                        {timeStr && (
                          <span className="text-[9px] text-slate-400 ml-1.5">
                            {timeStr}
                          </span>
                        )}
                      </div>
                      <div className="text-slate-200">{m.content}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Chat input */}
            <div className="px-3 pb-3 pt-2 border-t border-white/10 flex gap-2 select-none">
              <input
                className={`flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-xs${!connected ? " opacity-50 cursor-wait" : ""}`}
                placeholder={
                  !connected
                    ? "Reconnecting…"
                    : chatTab === "global"
                      ? "Type a global message"
                      : "Type a lobby message"
                }
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSend();
                  }
                }}
              />
              <button
                className="rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 text-xs transition-colors"
                onClick={handleSend}
                disabled={!connected || !chatInput.trim()}
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
