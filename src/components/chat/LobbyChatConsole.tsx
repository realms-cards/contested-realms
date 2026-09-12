"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { playerColor } from "@/lib/lobby/playerColor";
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
  // Pagination for global chat history
  chatHasMore?: boolean;
  chatLoading?: boolean;
  onRequestMoreHistory?: () => void;
}

// Patron tiers keep their glow colours; everyone else gets the deterministic
// palette colour for their id (see playerColor).
const PATRON_HEX = {
  apprentice: "#60a5fa",
  grandmaster: "#fbbf24",
  kingofthe: "#34d399",
} as const;

/**
 * Lobby Chat panel: Lobby | Global scopes, timestamped message log with
 * per-player username colours, and a prompt-style composer.
 */
export default function LobbyChatConsole({
  connected,
  chatLog,
  chatTab,
  setChatTab,
  chatInput,
  setChatInput,
  onSendChat,
  myPlayerId,
  chatHasMore,
  chatLoading,
  onRequestMoreHistory,
}: LobbyChatConsoleProps) {
  const [patrons, setPatrons] = useState<PatronData | null>(null);

  useEffect(() => {
    fetchPatrons().then(setPatrons);
  }, []);

  const lobbyMessages = useMemo(
    () => chatLog.filter((m) => m.scope === "lobby"),
    [chatLog],
  );
  const globalMessages = useMemo(
    () => chatLog.filter((m) => m.scope === "global"),
    [chatLog],
  );
  const activeMessages = chatTab === "lobby" ? lobbyMessages : globalMessages;

  const chatRef = useRef<HTMLDivElement | null>(null);
  const prevMessageCountRef = useRef<number>(0);
  const isNearBottomRef = useRef<boolean>(true);
  const loadingHistoryRef = useRef<boolean>(false);
  const lastHistoryRequestRef = useRef<number>(0);
  const prevScrollHeightRef = useRef<number>(0);

  // Scroll to the newest message when new ones arrive (if already near the
  // bottom); keep the viewport stable when older history is prepended.
  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    const prevCount = prevMessageCountRef.current;
    const currentCount = activeMessages.length;
    const prevScrollHeight = prevScrollHeightRef.current;

    if (loadingHistoryRef.current && currentCount > prevCount) {
      el.scrollTop = el.scrollTop + (el.scrollHeight - prevScrollHeight);
      loadingHistoryRef.current = false;
    } else if (currentCount > prevCount && isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }

    prevMessageCountRef.current = currentCount;
    prevScrollHeightRef.current = el.scrollHeight;
  }, [activeMessages.length]);

  // Jump to the bottom on mount and when switching scope
  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    isNearBottomRef.current = true;
    prevMessageCountRef.current = activeMessages.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset on scope change, not message changes
  }, [chatTab]);

  const handleScroll = () => {
    const el = chatRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < 50;

    if (
      chatTab === "global" &&
      chatHasMore &&
      onRequestMoreHistory &&
      !chatLoading &&
      el.scrollTop < 40
    ) {
      const now = Date.now();
      if (now - lastHistoryRequestRef.current > 500) {
        lastHistoryRequestRef.current = now;
        loadingHistoryRef.current = true;
        prevScrollHeightRef.current = el.scrollHeight;
        onRequestMoreHistory();
      }
    }
  };

  const canSend = connected && chatInput.trim().length > 0;
  const handleSend = () => {
    const msg = chatInput.trim();
    if (!msg || !connected) return;
    onSendChat(msg, chatTab);
    setChatInput("");
  };

  const patronTierFor = (id: string | undefined) => {
    if (!id || !patrons) return null;
    if (patrons.kingofthe?.some((p) => p.id === id)) return "kingofthe";
    if (patrons.grandmaster.some((p) => p.id === id)) return "grandmaster";
    if (patrons.apprentice.some((p) => p.id === id)) return "apprentice";
    return null;
  };

  return (
    <section className="rc-panel flex min-h-[560px] flex-col">
      <div className="rc-panel-head">
        <h2 className="m-0 font-rc-display text-[26px] leading-none text-rc-fg-strong">
          Lobby Chat
        </h2>
        <div className="flex-1" />
        <div className="rc-segment" role="group" aria-label="Chat scope">
          <button
            type="button"
            aria-pressed={chatTab === "lobby"}
            onClick={() => setChatTab("lobby")}
          >
            Lobby{lobbyMessages.length > 0 ? ` · ${lobbyMessages.length}` : ""}
          </button>
          <button
            type="button"
            aria-pressed={chatTab === "global"}
            onClick={() => setChatTab("global")}
          >
            Global
            {globalMessages.length > 0 ? ` · ${globalMessages.length}` : ""}
          </button>
        </div>
      </div>

      <div
        ref={chatRef}
        data-allow-wheel="true"
        onScroll={handleScroll}
        className="thin-scrollbar flex max-h-[520px] min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-[18px] py-1.5"
      >
        {chatTab === "global" && chatLoading && (
          <div className="py-2 text-center font-rc-mono text-[10px] tracking-[0.1em] text-rc-fg-dim">
            loading older messages…
          </div>
        )}
        {chatTab === "global" &&
          chatHasMore &&
          !chatLoading &&
          activeMessages.length > 0 && (
            <div className="py-1 text-center font-rc-mono text-[10px] tracking-[0.1em] text-rc-fg-dim">
              ↑ scroll up for more
            </div>
          )}
        {activeMessages.length === 0 && !chatLoading && (
          <div className="py-6 text-center font-rc-mono text-xs tracking-[0.1em] text-rc-fg-dim">
            {chatTab === "lobby"
              ? "no lobby messages yet"
              : "the realm is silent"}
          </div>
        )}
        {activeMessages.map((m, i) => {
          const fromId = m.from?.id;
          const fromName = m.from?.displayName ?? "System";
          const isMine = !!myPlayerId && fromId === myPlayerId;
          const tier = patronTierFor(fromId);
          const color = tier
            ? PATRON_HEX[tier]
            : isMine
              ? "#e3ba55"
              : playerColor(fromId);
          const timeStr = m.ts
            ? new Date(m.ts).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "";
          return (
            <div
              key={`${m.scope}-${i}-${fromId ?? "system"}`}
              className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-rc-mono text-[13px] leading-[1.55]"
            >
              <span className="pt-[3px] text-[11px] tracking-[0.06em] tabular-nums text-rc-fg-dim">
                {timeStr}
              </span>
              <div className="min-w-0 break-words">
                <span
                  className="font-semibold"
                  style={{
                    color,
                    textShadow: tier
                      ? PATRON_COLORS[tier].textShadowMinimal
                      : undefined,
                  }}
                  title={tier ? `${fromName} · patron` : fromName}
                >
                  {fromName}
                </span>
                <span className="text-rc-fg-dim"> › </span>
                <span className="whitespace-pre-wrap text-rc-fg">{m.content}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2.5 border-t border-rc-line/18 px-[18px] py-3.5">
        <div
          className={`flex h-10 flex-1 items-center gap-2.5 rounded-rc-md border border-rc-line/22 bg-black/45 px-3.5 transition-[border-color,box-shadow] focus-within:border-rc-accent-ring focus-within:shadow-[0_0_0_1px_#f3cf6a] ${
            !connected ? "opacity-50" : ""
          }`}
        >
          <span className="font-rc-mono text-rc-accent-link" aria-hidden="true">
            &gt;
          </span>
          <textarea
            rows={1}
            aria-label={
              chatTab === "global" ? "Global chat message" : "Lobby chat message"
            }
            className="h-full min-w-0 flex-1 resize-none border-0 bg-transparent py-[11px] font-rc-mono text-[13px] leading-[18px] text-rc-fg outline-none"
            placeholder={
              !connected ? "reconnecting…" : "say something to the realm_"
            }
            value={chatInput}
            disabled={!connected}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
        </div>
        <RcButton onClick={handleSend} disabled={!canSend} className="h-10">
          Send
        </RcButton>
      </div>
    </section>
  );
}
