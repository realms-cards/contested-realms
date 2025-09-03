"use client";

import { useMemo, useState } from "react";
import { useOnline } from "@/app/online/online-context";
import LobbyList from "@/components/online/LobbyList";

export default function LobbiesPanel() {
  const {
    connected,
    lobby,
    me,
    lobbies,
    requestLobbies,
    joinLobby,
    createLobby,
    leaveLobby,
    setLobbyVisibility,
    resync,
  } = useOnline();

  const [lobbyIdInput, setLobbyIdInput] = useState("");
  const [lobbyQuery, setLobbyQuery] = useState("");
  const [hideFull, setHideFull] = useState(false);
  const [hideStarted, setHideStarted] = useState(true);
  const [sortKey, setSortKey] = useState<"playersAsc" | "playersDesc" | "status">("status");

  const filteredLobbies = useMemo(() => {
    const q = lobbyQuery.trim().toLowerCase();
    const list = lobbies.filter((l) => {
      if (hideFull && l.players.length >= l.maxPlayers) return false;
      if (hideStarted && l.status !== "open") return false;
      if (!q) return true;
      const hostName = l.players.find((p) => p.id === l.hostId)?.displayName?.toLowerCase() || "";
      const playerNames = l.players.map((p) => p.displayName.toLowerCase()).join(" ");
      return (
        l.id.toLowerCase().includes(q) ||
        hostName.includes(q) ||
        playerNames.includes(q)
      );
    });
    const statusWeight = (s: string) => (s === "open" ? 0 : s === "started" ? 1 : 2);
    list.sort((a, b) => {
      switch (sortKey) {
        case "playersAsc":
          return a.players.length - b.players.length;
        case "playersDesc":
          return b.players.length - a.players.length;
        case "status":
          return statusWeight(a.status) - statusWeight(b.status);
        default:
          return 0;
      }
    });
    return list;
  }, [lobbies, lobbyQuery, hideFull, hideStarted, sortKey]);

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {/* Browse Lobbies */}
      <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold opacity-90">Active Lobbies</div>
          <button
            className="rounded bg-slate-700 hover:bg-slate-600 px-2 py-1 text-xs"
            onClick={() => requestLobbies()}
            disabled={!connected}
          >
            Refresh
          </button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="flex-1 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
            placeholder="Search by lobby ID, host, or player"
            value={lobbyQuery}
            onChange={(e) => setLobbyQuery(e.target.value)}
          />
          <select
            className="bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
            title="Sort lobbies"
          >
            <option value="status">Status</option>
            <option value="playersAsc">Players ↑</option>
            <option value="playersDesc">Players ↓</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="text-xs flex items-center gap-1 opacity-80">
            <input type="checkbox" checked={hideFull} onChange={(e) => setHideFull(e.target.checked)} />
            Hide full
          </label>
          <label className="text-xs flex items-center gap-1 opacity-80">
            <input type="checkbox" checked={hideStarted} onChange={(e) => setHideStarted(e.target.checked)} />
            Hide started/closed
          </label>
        </div>
        <LobbyList
          lobbies={filteredLobbies}
          onJoin={(id) => joinLobby(id)}
          meId={me?.id ?? null}
        />
      </div>

      {/* Lobby Controls */}
      <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 space-y-3">
        <div className="text-sm font-semibold opacity-90">Lobby Controls</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            className="rounded bg-indigo-600/80 hover:bg-indigo-600 px-3 py-1 text-sm disabled:opacity-40"
            onClick={() => joinLobby()}
            disabled={!connected}
            title="Join an existing lobby or create one if none available"
          >
            Quick Join
          </button>
          <button
            className="rounded bg-green-600/80 hover:bg-green-600 px-3 py-1 text-sm disabled:opacity-40"
            onClick={() => createLobby()}
            disabled={!connected}
            title="Always create a new lobby"
          >
            Create New
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
          {lobby && (
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
          )}
        </div>
      </div>
    </div>
  );
}

