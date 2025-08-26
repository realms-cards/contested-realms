"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Head from "next/head";
import { useOnline } from "../layout";

export default function LobbyPage() {
  const router = useRouter();
  const {
    connected,
    lobby,
    match,
    me,
    ready,
    toggleReady,
    joinLobby,
    leaveLobby,
    startMatch,
    joinMatch,
    leaveMatch,
    sendChat,
    chatLog,
    resync,
  } = useOnline();

  const [lobbyIdInput, setLobbyIdInput] = useState("");
  const [matchIdInput, setMatchIdInput] = useState("");
  const [chatInput, setChatInput] = useState("");

  // Note: Removed match leaving tracking since we don't have persistent sessions

  // Note: Removed auto-redirect to match to allow players to choose whether to rejoin

  // Dynamic page title
  useEffect(() => {
    const baseTitle = "Sorcery Online";
    let title = `${baseTitle} - Lobby`;
    
    if (lobby) {
      title = `${baseTitle} - Lobby ${lobby.id} (${lobby.players.length}/${lobby.maxPlayers})`;
    }
    
    if (match) {
      const playerNames = match.players?.map(p => p.displayName).join(' vs ') || 'Players';
      title = `${baseTitle} - ${playerNames} (${match.status})`;
    }
    
    if (!connected) {
      title = `${baseTitle} - Disconnected`;
    }
    
    document.title = title;
  }, [connected, lobby, match]);

  return (
    <div className="space-y-6">
      {/* Match Section - only show for joinable matches */}
      {match?.id && (match.status === 'waiting' || match.status === 'in_progress') && (
        <div className="rounded-xl bg-orange-900/20 ring-1 ring-orange-600/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-orange-200 mb-1">
                {match.status === 'waiting' ? 'New Match Starting' : 'Ongoing Match Found'}
              </div>
              <div className="text-xs opacity-70">
                Match ID: {match.id}
              </div>
              <div className="text-xs opacity-70">
                Status: {match.status} • Players: {match.players?.map(p => p.displayName).join(', ') || 'Loading...'}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="rounded bg-orange-600/80 hover:bg-orange-600 px-4 py-2 text-sm font-medium transition-colors"
                onClick={() => router.push(`/online/play/${encodeURIComponent(match.id)}`)}
              >
Join Match
              </button>
              <button
                className="rounded bg-red-600/80 hover:bg-red-600 px-4 py-2 text-sm font-medium transition-colors"
                onClick={() => {
                  if (confirm('Are you sure you want to permanently leave this match? This cannot be undone.')) {
                    leaveMatch();
                  }
                }}
              >
                Leave Match
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 space-y-3">
          <div className="text-sm font-semibold opacity-90">Lobby Controls</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              className="rounded bg-indigo-600/80 hover:bg-indigo-600 px-3 py-1 text-sm disabled:opacity-40"
              onClick={() => joinLobby()}
              disabled={!connected}
            >
              Quick Join / Create
            </button>
            <div className="flex-1 flex gap-2">
              <input
                className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
                placeholder="Lobby ID"
                value={lobbyIdInput}
                onChange={(e) => setLobbyIdInput(e.target.value)}
              />
              <button
                className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1 text-sm disabled:opacity-40"
                onClick={() => joinLobby(lobbyIdInput.trim())}
                disabled={!connected || !lobbyIdInput.trim()}
              >
                Join by ID
              </button>
            </div>
            <button
              className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1 text-sm disabled:opacity-40"
              onClick={leaveLobby}
              disabled={!lobby}
            >
              Leave Lobby
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className={`rounded px-3 py-1 text-sm ${ready ? "bg-emerald-600/70" : "bg-slate-700 hover:bg-slate-600"}`}
              onClick={toggleReady}
              disabled={!lobby}
            >
              {ready ? "Ready ✓" : "Ready"}
            </button>
            <button
              className="rounded bg-violet-600/80 hover:bg-violet-600 px-3 py-1 text-sm disabled:opacity-40"
              onClick={startMatch}
              disabled={!lobby || lobby.hostId !== me?.id}
              title={lobby && lobby.hostId !== me?.id ? "Only the host can start" : "Start match"}
            >
              Start Match (host)
            </button>
            {lobby && (
              <button
                className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1 text-sm"
                onClick={() => {
                  try {
                    if (navigator.clipboard && lobby?.id) void navigator.clipboard.writeText(lobby.id);
                  } catch {}
                }}
              >
                Copy Lobby ID
              </button>
            )}
            <button
              className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1 text-sm disabled:opacity-40"
              onClick={() => resync()}
              disabled={!connected}
            >
              Resync
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 space-y-3">
          <div className="text-sm font-semibold opacity-90">Match Controls</div>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
              placeholder="Match ID"
              value={matchIdInput}
              onChange={(e) => setMatchIdInput(e.target.value)}
            />
            <button
              className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1 text-sm disabled:opacity-40"
              onClick={() => {
                const id = matchIdInput.trim();
                if (id) joinMatch(id);
              }}
              disabled={!connected || !matchIdInput.trim()}
            >
              Join Match
            </button>
            {match && (
              <button
                className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1 text-sm"
                onClick={() => {
                  try {
                    if (navigator.clipboard && match?.id) void navigator.clipboard.writeText(match.id);
                  } catch {}
                }}
              >
                Copy Match ID
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900/60 rounded-xl ring-1 ring-slate-800 p-4">
          <div className="text-sm font-semibold opacity-90">Lobby</div>
          {lobby ? (
            <div className="mt-3 text-sm space-y-2">
              <div>
                <span className="opacity-70">ID:</span> <span className="font-mono">{lobby.id}</span>
              </div>
              <div>
                <span className="opacity-70">Status:</span> {lobby.status}
              </div>
              <div>
                <span className="opacity-70">Max Players:</span> {lobby.maxPlayers}
              </div>
              <div className="mt-2">
                <div className="font-medium">Players</div>
                <ul className="list-disc ml-5 space-y-0.5">
                  {lobby.players.map((p) => (
                    <li key={p.id}>
                      {p.displayName} {p.id === lobby.hostId ? "(Host)" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm opacity-70">Not in a lobby</div>
          )}
        </div>

        <div className="bg-slate-900/60 rounded-xl ring-1 ring-slate-800 p-4">
          <div className="text-sm font-semibold opacity-90">Match</div>
          {match ? (
            <div className="mt-3 text-sm space-y-2">
              <div>
                <span className="opacity-70">ID:</span> <span className="font-mono">{match.id}</span>
              </div>
              <div>
                <span className="opacity-70">Status:</span> {match.status}
              </div>
              <div>
                <span className="opacity-70">Seed:</span> <span className="font-mono">{match.seed}</span>
              </div>
              <div>
                <span className="opacity-70">Turn:</span> {match.turn}
              </div>
              <div className="mt-2">
                <div className="font-medium">Players</div>
                <ul className="list-disc ml-5 space-y-0.5">
                  {match.players.map((p) => (
                    <li key={p.id}>{p.displayName}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm opacity-70">No active match</div>
          )}
        </div>
      </div>

      <div className="bg-slate-900/60 rounded-xl ring-1 ring-slate-800 p-4">
        <div className="text-sm font-semibold opacity-90 mb-2">Chat</div>
        <div className="max-h-48 overflow-y-auto space-y-1 text-sm pr-1">
          {chatLog.length === 0 && <div className="opacity-60">No messages</div>}
          {chatLog.map((m, i) => (
            <div key={i} className="opacity-90">
              <span className="text-slate-300/80">[{m.scope}]</span>{" "}
              <span className="font-medium">{m.from?.displayName ?? "System"}</span>: {m.content}
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
            placeholder="Type a message"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
          />
          <button
            className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1 text-sm"
            onClick={() => {
              const msg = chatInput.trim();
              if (!msg) return;
              sendChat(msg);
              setChatInput("");
            }}
            disabled={!connected}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
