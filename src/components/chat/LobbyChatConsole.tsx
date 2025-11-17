"use client";

import { ChevronDown, ChevronUp, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatScope, ServerChatPayloadT } from "@/lib/net/protocol";

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
}: LobbyChatConsoleProps) {
  const [consoleOpen, setConsoleOpen] = useState<boolean>(true);

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

  // Auto-scroll to latest message when scope or messages change
  useEffect(() => {
    if (!consoleOpen) return;
    const el = chatRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [consoleOpen, chatTab, activeMessages.length]);

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

  return (
    <div
      className={`fixed ${positionClasses} z-30 text-white ${containerWidth} transition-all pointer-events-auto`}
    >
      <div className="bg-black/60 backdrop-blur rounded-xl ring-1 ring-white/10 shadow">
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
          <div className="h-56 flex flex-col">
            <div
              ref={chatRef}
              data-allow-wheel="true"
              className="flex-1 overflow-y-scroll thin-scrollbar px-3 py-3 text-xs space-y-1 min-h-0"
            >
              {activeMessages.length === 0 && (
                <div className="opacity-60">No messages</div>
              )}
              {activeMessages.map((m, i) => {
                const fromName = m.from?.displayName ?? "System";
                const isMine = myPlayerId && m.from?.id === myPlayerId;
                return (
                  <div
                    key={`${m.scope}-${i}-${m.from?.id ?? "system"}`}
                    className={`opacity-90 ${
                      isMine ? "text-slate-50" : "text-slate-100"
                    }`}
                  >
                    <span className="font-medium">{fromName}</span>: {m.content}
                  </div>
                );
              })}
            </div>
            {/* Chat input */}
            <div className="px-3 pb-3 pt-2 border-t border-white/10 flex gap-2 select-none">
              <input
                className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder={
                  chatTab === "global"
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
                disabled={!connected}
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
