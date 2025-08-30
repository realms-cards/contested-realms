"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useOnline } from "../layout";
import LobbyList from "@/components/online/LobbyList";
import InvitesPanel from "@/components/online/InvitesPanel";
import PlayersInvitePanel from "@/components/online/PlayersInvitePanel";

export default function LobbyPage() {
  const router = useRouter();
  const {
    transport,
    connected,
    lobby,
    match,
    me,
    ready,
    toggleReady,
    joinLobby,
    leaveLobby,
    startMatch: startMatchOriginal,
    joinMatch,
    leaveMatch,
    sendChat,
    chatLog,
    resync,
    // New context state/actions
    lobbies,
    players,
    invites,
    requestLobbies,
    requestPlayers,
    setLobbyVisibility,
    inviteToLobby,
    dismissInvite,
  } = useOnline();

  const [lobbyIdInput, setLobbyIdInput] = useState("");
  const [matchIdInput, setMatchIdInput] = useState("");
  const [chatInput, setChatInput] = useState("");
  // Default to global when not in a lobby; will auto-switch on join/leave transitions
  const [chatTab, setChatTab] = useState<"lobby" | "global">("global");
  
  // Match type and sealed configuration
  const [matchType, setMatchType] = useState<"constructed" | "sealed">("constructed");
  const [sealedConfig, setSealedConfig] = useState({
    packCount: 6,
    setMix: ["Alpha/Beta"],
    timeLimit: 40 // minutes
  });
  const chatRef = useRef<HTMLDivElement | null>(null);
  const prevLobbyIdRef = useRef<string | null>(null);
  const [declinedRejoin, setDeclinedRejoin] = useState(false);

  const lobbyMessages = chatLog.filter((m) => m.scope === "lobby");
  const globalMessages = chatLog.filter((m) => m.scope === "global");
  const activeMessages = chatTab === "lobby" ? lobbyMessages : globalMessages;

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatTab, activeMessages.length]);

  // Switch default chat scope on lobby join/leave transitions only (not on every update)
  useEffect(() => {
    const prevId = prevLobbyIdRef.current;
    const currId = lobby?.id ?? null;
    if (!prevId && currId) {
      // Joined or created a lobby
      setChatTab("lobby");
    } else if (prevId && !currId) {
      // Left a lobby
      setChatTab("global");
    }
    prevLobbyIdRef.current = currId;
  }, [lobby]);

  // Note: Removed match leaving tracking since we don't have persistent sessions

  // Note: Removed auto-redirect to match to allow players to choose whether to rejoin

  // Track if the user explicitly left this match and declined rejoin (persisted)
  useEffect(() => {
    try {
      const id = match?.id;
      if (!id) {
        setDeclinedRejoin(false);
        return;
      }
      const key = `sorcery:declinedRejoin:${id}`;
      const flag =
        typeof window !== "undefined" ? localStorage.getItem(key) : null;
      setDeclinedRejoin(!!flag);
    } catch {
      setDeclinedRejoin(false);
    }
  }, [match?.id]);

  // Dynamic page title
  useEffect(() => {
    const baseTitle = "Contested Realms";
    let title = `${baseTitle} - Lobby`;

    if (lobby) {
      title = `${baseTitle} - Lobby ${lobby.id} (${lobby.players.length}/${lobby.maxPlayers})`;
    }

    if (match) {
      const playerNames =
        match.players?.map((p) => p.displayName).join(" vs ") || "Players";
      title = `${baseTitle} - ${playerNames} (${match.status})`;
    }

    if (!connected) {
      title = `${baseTitle} - Disconnected`;
    }

    document.title = title;
  }, [connected, lobby, match]);

  // Determine if this client is rejoining an ongoing match
  const isRejoin = !!(
    match &&
    !declinedRejoin &&
    match.status === "in_progress" &&
    me?.id &&
    match.players?.some((p) => p.id === me.id)
  );
  const matchJoinLabel = isRejoin ? "Rejoin" : "Join Match";
  const manualJoinLabel =
    matchIdInput.trim() && match?.id === matchIdInput.trim() && isRejoin
      ? "Rejoin"
      : "Join Match";

  const startSealedMatch = () => {
    // Validate sealed configuration
    if (sealedConfig.setMix.length === 0) {
      alert("Please select at least one set for sealed play.");
      return;
    }
    if (sealedConfig.packCount < 3 || sealedConfig.packCount > 8) {
      alert("Pack count must be between 3 and 8.");
      return;
    }
    
    // Send startMatch with sealed configuration
    if (transport) {
      transport.startMatch({
        matchType: "sealed",
        sealedConfig
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top summary of active lobbies and invites */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold opacity-90">
              Active Lobbies
            </div>
            <button
              className="rounded bg-slate-700 hover:bg-slate-600 px-2 py-1 text-xs"
              onClick={() => requestLobbies()}
              disabled={!connected}
            >
              Refresh
            </button>
          </div>
          <LobbyList lobbies={lobbies} onJoin={(id) => joinLobby(id)} />
        </div>
        <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 space-y-3">
          <div className="text-sm font-semibold opacity-90">Invites</div>
          <InvitesPanel
            invites={invites}
            onAccept={async (inv) => {
              await joinLobby(inv.lobbyId);
              dismissInvite(inv.lobbyId, inv.from.id);
            }}
            onDecline={(inv) => dismissInvite(inv.lobbyId, inv.from.id)}
          />
        </div>
      </div>

      {/* Match Section - only show for joinable matches and not when user declined rejoin */}
      {match &&
        !declinedRejoin &&
        (match.status === "waiting" || match.status === "in_progress" || match.status === "deck_construction") && (
          <div className="rounded-xl bg-orange-900/20 ring-1 ring-orange-600/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-orange-200 mb-1">
                  {match.status === "waiting"
                    ? "New Match Starting"
                    : match.status === "deck_construction"
                    ? "Sealed Deck Construction"
                    : "Ongoing Match Found"}
                </div>
                <div className="text-xs opacity-70">Match ID: {match.id}</div>
                <div className="text-xs opacity-70">
                  Status: {match.status} • Players:{" "}
                  {match.players?.map((p) => p.displayName).join(", ") ||
                    "Loading..."}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="rounded bg-orange-600/80 hover:bg-orange-600 px-4 py-2 text-sm font-medium transition-colors"
                  onClick={() =>
                    router.push(`/online/play/${encodeURIComponent(match.id)}`)
                  }
                >
                  {matchJoinLabel}
                </button>
                <button
                  className="rounded bg-red-600/80 hover:bg-red-600 px-4 py-2 text-sm font-medium transition-colors"
                  onClick={() => {
                    if (
                      confirm(
                        "Are you sure you want to permanently leave this match? This cannot be undone."
                      )
                    ) {
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

      {/* Match Type Selection */}
      {lobby && lobby.hostId === me?.id && (
        <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4">
          <div className="text-sm font-semibold opacity-90 mb-3">Match Configuration (Host Only)</div>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-2">Match Type</label>
              <div className="flex gap-2">
                <button
                  className={`px-3 py-2 text-sm rounded transition-colors ${
                    matchType === "constructed"
                      ? "bg-indigo-600/80 text-white"
                      : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"
                  }`}
                  onClick={() => setMatchType("constructed")}
                >
                  Constructed
                </button>
                <button
                  className={`px-3 py-2 text-sm rounded transition-colors ${
                    matchType === "sealed"
                      ? "bg-indigo-600/80 text-white"
                      : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"
                  }`}
                  onClick={() => setMatchType("sealed")}
                >
                  Sealed
                </button>
              </div>
            </div>
            
            {matchType === "sealed" && (
              <>
                <div>
                  <label className="block text-xs font-medium mb-2">
                    Packs per Player (3-8)
                  </label>
                  <input
                    type="number"
                    min="3"
                    max="8"
                    value={sealedConfig.packCount}
                    onChange={(e) => setSealedConfig(prev => ({ ...prev, packCount: parseInt(e.target.value) || 6 }))}
                    className="w-20 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium mb-2">Set Mix</label>
                  <div className="space-y-2">
                    {["Alpha/Beta", "Arthurian Legends"].map(set => (
                      <label key={set} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={sealedConfig.setMix.includes(set)}
                          onChange={(e) => {
                            setSealedConfig(prev => ({
                              ...prev,
                              setMix: e.target.checked
                                ? [...prev.setMix, set]
                                : prev.setMix.filter(s => s !== set)
                            }));
                          }}
                          className="rounded"
                        />
                        <span className="text-sm">{set}</span>
                      </label>
                    ))}
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-medium mb-2">
                    Deck Construction Time Limit (minutes)
                  </label>
                  <input
                    type="number"
                    min="15"
                    max="90"
                    step="5"
                    value={sealedConfig.timeLimit}
                    onChange={(e) => setSealedConfig(prev => ({ ...prev, timeLimit: parseInt(e.target.value) || 40 }))}
                    className="w-20 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
                  />
                </div>
              </>
            )}
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
              className={`rounded px-3 py-1 text-sm ${
                ready ? "bg-emerald-600/70" : "bg-slate-700 hover:bg-slate-600"
              }`}
              onClick={toggleReady}
              disabled={!lobby}
            >
              {ready ? "Ready ✓" : "Ready"}
            </button>
            <button
              className="rounded bg-violet-600/80 hover:bg-violet-600 px-3 py-1 text-sm disabled:opacity-40"
              onClick={() => {
                if (matchType === "constructed") {
                  startMatchOriginal();
                } else {
                  startSealedMatch();
                }
              }}
              disabled={!lobby || lobby.hostId !== me?.id}
              title={
                lobby && lobby.hostId !== me?.id
                  ? "Only the host can start"
                  : `Start ${matchType} match`
              }
            >
              Start {matchType === "constructed" ? "Match" : "Sealed"} (host)
            </button>
            {lobby && (
              <button
                className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1 text-sm"
                onClick={() => {
                  try {
                    if (navigator.clipboard && lobby?.id)
                      void navigator.clipboard.writeText(lobby.id);
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
              {manualJoinLabel}
            </button>
            {match && (
              <button
                className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1 text-sm"
                onClick={() => {
                  try {
                    if (navigator.clipboard && match?.id)
                      void navigator.clipboard.writeText(match.id);
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
                <span className="opacity-70">ID:</span>{" "}
                <span className="font-mono">{lobby.id}</span>
              </div>
              <div>
                <span className="opacity-70">Status:</span> {lobby.status}
              </div>
              <div className="flex items-center gap-2">
                <span className="opacity-70">Visibility:</span>
                <span
                  className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                    lobby.visibility === "open"
                      ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/30"
                      : "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/30"
                  }`}
                >
                  {lobby.visibility}
                </span>
                <div className="ml-auto flex gap-1">
                  <button
                    className="rounded bg-slate-700 hover:bg-slate-600 px-2 py-0.5 text-xs disabled:opacity-40"
                    onClick={() => setLobbyVisibility("open")}
                    disabled={lobby.hostId !== me?.id}
                    title={
                      lobby.hostId !== me?.id
                        ? "Only host can change"
                        : "Set lobby to open"
                    }
                  >
                    Open
                  </button>
                  <button
                    className="rounded bg-slate-700 hover:bg-slate-600 px-2 py-0.5 text-xs disabled:opacity-40"
                    onClick={() => setLobbyVisibility("private")}
                    disabled={lobby.hostId !== me?.id}
                    title={
                      lobby.hostId !== me?.id
                        ? "Only host can change"
                        : "Set lobby to private"
                    }
                  >
                    Private
                  </button>
                </div>
              </div>
              <div>
                <span className="opacity-70">Max Players:</span>{" "}
                {lobby.maxPlayers}
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
                <span className="opacity-70">ID:</span>{" "}
                <span className="font-mono">{match.id}</span>
              </div>
              <div>
                <span className="opacity-70">Status:</span> {match.status}
              </div>
              <div>
                <span className="opacity-70">Seed:</span>{" "}
                <span className="font-mono">{match.seed}</span>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900/60 rounded-xl ring-1 ring-slate-800 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold opacity-90">Chat</div>
            <div className="flex items-center gap-1">
              <button
                className={`rounded px-2 py-0.5 text-xs transition-colors ${
                  chatTab === "lobby"
                    ? "bg-white/15"
                    : "hover:bg-white/10 opacity-80"
                }`}
                onClick={() => setChatTab("lobby")}
              >
                Lobby
                {lobbyMessages.length > 0 && (
                  <span className="ml-1 bg-emerald-500/70 text-white text-[10px] px-1 rounded-full">
                    {lobbyMessages.length}
                  </span>
                )}
              </button>
              <button
                className={`rounded px-2 py-0.5 text-xs transition-colors ${
                  chatTab === "global"
                    ? "bg-white/15"
                    : "hover:bg-white/10 opacity-80"
                }`}
                onClick={() => setChatTab("global")}
              >
                Global
                {globalMessages.length > 0 && (
                  <span className="ml-1 bg-sky-500/70 text-white text-[10px] px-1 rounded-full">
                    {globalMessages.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div
            ref={chatRef}
            className="max-h-48 overflow-y-auto space-y-1 text-sm pr-1"
          >
            {activeMessages.length === 0 && (
              <div className="opacity-60">No messages</div>
            )}
            {activeMessages.map((m, i) => (
              <div key={i} className="opacity-90">
                <span className="font-medium">
                  {m.from?.displayName ?? "System"}
                </span>
                : {m.content}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder={
                chatTab === "global"
                  ? "Type a global message"
                  : "Type a message"
              }
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && connected) {
                  const msg = chatInput.trim();
                  if (!msg) return;
                  sendChat(msg, chatTab);
                  setChatInput("");
                }
              }}
              disabled={!connected}
            />
            <button
              className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => {
                const msg = chatInput.trim();
                if (!msg) return;
                sendChat(msg, chatTab);
                setChatInput("");
              }}
              disabled={!connected || !chatInput.trim()}
            >
              Send
            </button>
          </div>
        </div>
        <div className="bg-slate-900/60 rounded-xl ring-1 ring-slate-800 p-4">
          <div className="text-sm font-semibold opacity-90 mb-2">Players</div>
          <PlayersInvitePanel
            players={players}
            me={me}
            lobby={lobby}
            onInvite={(pid, lid) => inviteToLobby(pid, lid)}
            onRefresh={() => requestPlayers()}
          />
        </div>
      </div>
    </div>
  );
}
