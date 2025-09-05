"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useOnline } from "@/app/online/online-context";
import { useGameStore } from "@/lib/game/store";
import LobbyList from "@/components/online/LobbyList";
import InvitesPanel from "@/components/online/InvitesPanel";
import PlayersInvitePanel from "@/components/online/PlayersInvitePanel";

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
    createLobby,
    leaveLobby,
    startMatch,
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
  // Tabs removed: we show all sections in the main view
  const [matchIdInput, setMatchIdInput] = useState("");
  const [chatInput, setChatInput] = useState("");
  // Default to global when not in a lobby; will auto-switch on join/leave transitions
  const [chatTab, setChatTab] = useState<"lobby" | "global">("global");
  
  // Lobby list filters/sorting
  const [lobbyQuery, setLobbyQuery] = useState("");
  const [hideFull, setHideFull] = useState(false);
  const [hideStarted, setHideStarted] = useState(true);
  const [invitedOnly, setInvitedOnly] = useState(false);
  type SortKey = "invited" | "playersAsc" | "playersDesc" | "status";
  const [sortKey, setSortKey] = useState<SortKey>("invited");
  const [topTab, setTopTab] = useState<"invites" | "friends">("invites");
  
  // Match type and sealed/draft configuration
  const [matchType, setMatchType] = useState<"constructed" | "sealed" | "draft">("constructed");
  const [sealedConfig, setSealedConfig] = useState({
    packCounts: { "Beta": 6, "Arthurian Legends": 0 } as Record<string, number>,
    timeLimit: 40, // minutes
    replaceAvatars: false
  });
  const [draftConfig, setDraftConfig] = useState({
    // Available sets restricted for now
    setMix: ["Beta"] as string[],
    packCount: 3,
    packSize: 15,
    packCounts: { "Beta": 3, "Arthurian Legends": 0 } as Record<string, number>,
  });
  
  // UI validation helpers
  const sealedTotalPacks = useMemo(
    () => Object.values(sealedConfig.packCounts).reduce((sum, c) => sum + c, 0),
    [sealedConfig.packCounts]
  );
  const sealedActiveSets = useMemo(
    () => Object.entries(sealedConfig.packCounts).filter(([, c]) => c > 0).length,
    [sealedConfig.packCounts]
  );
  const sealedValid = sealedActiveSets > 0 && sealedTotalPacks >= 3 && sealedTotalPacks <= 8;

  const draftAssigned = useMemo(
    () => Object.values(draftConfig.packCounts).reduce((sum, c) => sum + c, 0),
    [draftConfig.packCounts]
  );
  const draftValid = draftAssigned === draftConfig.packCount;
  const chatRef = useRef<HTMLDivElement | null>(null);
  const prevLobbyIdRef = useRef<string | null>(null);
  const [declinedRejoin, setDeclinedRejoin] = useState(false);
  // Overlay for configuring and confirming match start (host)
  const [configOpen, setConfigOpen] = useState(false);

  const inviteLobbyIds = useMemo(() => invites.map((i) => i.lobbyId), [invites]);
  const inviteSet = useMemo(() => new Set(inviteLobbyIds), [inviteLobbyIds]);

  const filteredLobbies = useMemo(() => {
    const q = lobbyQuery.trim().toLowerCase();
    const list = lobbies.filter((l) => {
      if (hideFull && l.players.length >= l.maxPlayers) return false;
      if (hideStarted && l.status !== "open") return false;
      if (invitedOnly && !inviteSet.has(l.id)) return false;
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
        case "invited":
          if (inviteSet.has(a.id) !== inviteSet.has(b.id)) return inviteSet.has(a.id) ? -1 : 1;
          if (statusWeight(a.status) !== statusWeight(b.status)) return statusWeight(a.status) - statusWeight(b.status);
          return a.players.length - b.players.length;
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
  }, [lobbies, lobbyQuery, hideFull, hideStarted, invitedOnly, sortKey, inviteSet]);

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

  // Derived lobby state for control visibility
  const joinedLobby = !!lobby;
  const isHost = joinedLobby && me?.id === lobby.hostId;
  const allReady = useMemo(() => {
    if (!lobby) return false;
    const readyIds = new Set(lobby.readyPlayerIds || []);
    return lobby.players.length > 1 && lobby.players.every((p) => readyIds.has(p.id));
  }, [lobby]);

  // Planned match summary (client-side, only reliable for host)
  const plannedSummary = useMemo(() => {
    if (!isHost) return null;
    if (matchType === "constructed") return "Planned: Constructed";
    if (matchType === "draft") {
      const entries = Object.entries(draftConfig.packCounts || {}).filter(([, c]) => c > 0);
      const mix = entries.length ? entries.map(([s, c]) => `${s}×${c}`).join(", ") : draftConfig.setMix.join(", ");
      return `Planned: Draft • Mix: ${mix} • Packs: ${draftConfig.packCount} • Pack size: ${draftConfig.packSize}`;
    }
    const totalPacks = Object.values(sealedConfig.packCounts).reduce((sum, count) => sum + count, 0);
    const activeSets = Object.entries(sealedConfig.packCounts)
      .filter(([, count]) => count > 0)
      .map(([set]) => set);
    return `Planned: Sealed • Packs: ${totalPacks} • Sets: ${activeSets.join(", ")} • Time: ${sealedConfig.timeLimit}m`;
  }, [isHost, matchType, sealedConfig, draftConfig]);
  const plannedSummaries = useMemo(() => {
    if (lobby && isHost && plannedSummary) {
      return { [lobby.id]: plannedSummary } as Record<string, string>;
    }
    return {} as Record<string, string>;
  }, [lobby, isHost, plannedSummary]);

  // removed startSealedMatch helper; start is confirmed via modal action

  return (
    <div className="space-y-6">
      {/* Page title and connection badge */}
      <div className="flex items-end justify-between">
        <h2 className="text-3xl sm:text-4xl font-fantaisie text-white">Lobby</h2>
        <div className="flex items-center gap-2 text-xs">
          <span className={`px-2 py-0.5 rounded-full ring-1 ${connected ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" : "bg-rose-500/15 text-rose-300 ring-rose-500/30"}`}>{connected ? "Connected" : "Disconnected"}</span>
          {lobby?.id && <span className="opacity-70">Lobby {lobby.id.slice(-6)}</span>}
        </div>
      </div>
      {/* Top action bar: Ready / Start controls */}
      <div className="rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm font-semibold opacity-90">Lobby Actions</div>
        <div className="flex flex-wrap gap-2 items-center">
          {joinedLobby && (
            <button
              className={`rounded-lg px-4 py-2 text-base font-semibold shadow ${
                ready
                  ? "bg-emerald-600/90 hover:bg-emerald-600"
                  : "bg-slate-700 hover:bg-slate-600"
              }`}
              onClick={toggleReady}
              title="Toggle your ready state"
            >
              {ready ? "Ready ✓" : "Ready"}
            </button>
          )}
          {isHost && (
            <>
              <button
                className="rounded-lg px-3 py-2 text-sm bg-slate-700/80 hover:bg-slate-600 shadow"
                onClick={() => setConfigOpen(true)}
                title="Configure match settings"
              >
                Configure
              </button>
              {allReady && (
                <button
                  className="rounded-lg bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 px-5 py-2.5 text-base font-semibold shadow"
                  onClick={() => setConfigOpen(true)}
                  title={`Start ${matchType} match (confirm settings)`}
                >
                  Start Match
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {/* Active lobbies and social (invites/friends) side by side */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className={`rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 space-y-3`}>
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
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              title="Sort lobbies"
            >
              <option value="invited">Invited first</option>
              <option value="playersAsc">Players ↑</option>
              <option value="playersDesc">Players ↓</option>
              <option value="status">Status</option>
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
            <label className="text-xs flex items-center gap-1 opacity-80">
              <input type="checkbox" checked={invitedOnly} onChange={(e) => setInvitedOnly(e.target.checked)} />
              Invited only
            </label>
          </div>
          <LobbyList
            lobbies={filteredLobbies}
            onJoin={(id) => joinLobby(id)}
            meId={me?.id ?? null}
            inviteLobbyIds={inviteLobbyIds}
            plannedSummaries={plannedSummaries}
          />
        </div>
        <div className={`rounded-xl bg-slate-900/60 ring-1 ring-slate-800 p-4 space-y-3`}>
          <div className="flex items-center gap-1">
            <button
              className={`text-sm font-semibold px-2 py-1 rounded ${topTab === "invites" ? "bg-white/10" : "opacity-70 hover:opacity-90"}`}
              onClick={() => setTopTab("invites")}
            >
              Invites
            </button>
            <button
              className={`text-sm font-semibold px-2 py-1 rounded ${topTab === "friends" ? "bg-white/10" : "opacity-70 hover:opacity-90"}`}
              onClick={() => { setTopTab("friends"); requestPlayers(); }}
            >
              Friends
            </button>
          </div>
          {topTab === "invites" ? (
            <InvitesPanel
              invites={invites}
              onAccept={async (inv) => {
                await joinLobby(inv.lobbyId);
                dismissInvite(inv.lobbyId, inv.from.id);
              }}
              onDecline={(inv) => dismissInvite(inv.lobbyId, inv.from.id)}
            />
          ) : (
            <PlayersInvitePanel
              players={players}
              me={me}
              lobby={lobby}
              onInvite={(pid, lid) => inviteToLobby(pid, lid)}
              onRefresh={() => requestPlayers()}
            />
          )}
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

      {/* Match Configuration Overlay (Host) */}
      {isHost && configOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfigOpen(false)} />
          <div className="relative bg-slate-900/95 ring-1 ring-slate-800 rounded-xl shadow-xl w-full max-w-xl p-5">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold">Match Configuration</div>
              <button
                className="text-slate-300 hover:text-white text-sm"
                onClick={() => setConfigOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="mt-3 space-y-4">
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
                  <button
                    className={`px-3 py-2 text-sm rounded transition-colors ${
                      matchType === "draft"
                        ? "bg-indigo-600/80 text-white"
                        : "bg-slate-700/60 text-slate-300 hover:bg-slate-600/60"
                    }`}
                    onClick={() => setMatchType("draft")}
                  >
                    Draft
                  </button>
                </div>
              </div>
              {matchType === "draft" && (
                <>
                  <div>
                    <label className="block text-xs font-medium mb-3">
                      Draft Configuration
                    </label>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3 items-end">
                        <div>
                          <label className="block text-xs font-medium mb-2">Number of Packs</label>
                          <select
                            value={draftConfig.packCount}
                            onChange={(e) => {
                              const nextCount = parseInt(e.target.value) || 3;
                              setDraftConfig(prev => {
                                const total = Object.values(prev.packCounts).reduce((s, c) => s + c, 0);
                                const packs = { ...prev.packCounts };
                                // Clamp or pad counts to match nextCount
                                if (total > nextCount) {
                                  // Reduce from the last non-zero set first
                                  const order = ["Arthurian Legends", "Beta"]; // prefer reducing AL first if needed
                                  let excess = total - nextCount;
                                  for (const name of order) {
                                    const take = Math.min(excess, packs[name] || 0);
                                    if (take > 0) { packs[name] = (packs[name] || 0) - take; excess -= take; }
                                    if (excess <= 0) break;
                                  }
                                } else if (total < nextCount) {
                                  // Add remainder to Beta by default
                                  packs["Beta"] = (packs["Beta"] || 0) + (nextCount - total);
                                }
                                return { ...prev, packCount: nextCount, packCounts: packs };
                              });
                            }}
                            className="w-full bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
                          >
                            <option value={3}>3 Packs</option>
                            <option value={4}>4 Packs</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-2">Pack Size</label>
                          <input
                            type="number"
                            min="12"
                            max="18"
                            value={draftConfig.packSize}
                            onChange={(e) => setDraftConfig(prev => ({ ...prev, packSize: parseInt(e.target.value) || 15 }))}
                            className="w-full bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-2">
                          Exact Pack Mix (sum must equal {draftConfig.packCount})
                          <span
                            className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] ring-1 ${
                              draftValid
                                ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                                : "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                            }`}
                          >
                            {draftValid
                              ? "OK"
                              : draftAssigned < draftConfig.packCount
                              ? `Need ${draftConfig.packCount - draftAssigned}`
                              : `Remove ${draftAssigned - draftConfig.packCount}`}
                          </span>
                        </label>
                        <div className="space-y-2">
                          {["Beta", "Arthurian Legends"].map((set) => {
                            const count = draftConfig.packCounts[set] || 0;
                            const total = Object.values(draftConfig.packCounts).reduce((s, c) => s + c, 0);
                            const canInc = total < draftConfig.packCount;
                            const canDec = count > 0;
                            return (
                              <div key={set} className="flex items-center justify-between">
                                <span className="text-sm">{set}</span>
                                <div className="flex items-center gap-2">
                                  <button
                                    className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded text-xs flex items-center justify-center transition-colors disabled:opacity-40"
                                    onClick={() => setDraftConfig(prev => ({
                                      ...prev,
                                      setMix: Array.from(new Set([...(prev.setMix || []), set])),
                                      packCounts: { ...prev.packCounts, [set]: Math.max(0, (prev.packCounts[set] || 0) - 1) }
                                    }))}
                                    disabled={!canDec}
                                  >
                                    −
                                  </button>
                                  <span className="w-8 text-center text-sm font-medium">{count}</span>
                                  <button
                                    className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded text-xs flex items-center justify-center transition-colors disabled:opacity-40"
                                    onClick={() => setDraftConfig(prev => ({
                                      ...prev,
                                      setMix: Array.from(new Set([...(prev.setMix || []), set])),
                                      packCounts: { ...prev.packCounts, [set]: Math.min(prev.packCount, (prev.packCounts[set] || 0) + 1) }
                                    }))}
                                    disabled={!canInc}
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
              {matchType === "sealed" && (
                <>
                  <div>
                    <label className="block text-xs font-medium mb-3">
                      Pack Configuration
                      <span className="text-xs opacity-70 ml-2">
                        (Total: {sealedTotalPacks} packs, 3-8 required)
                      </span>
                      <span
                        className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] ring-1 ${
                          sealedValid
                            ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                            : "bg-rose-500/15 text-rose-300 ring-rose-500/30"
                        }`}
                      >
                        {sealedValid ? "OK" : sealedActiveSets === 0 ? "No packs set" : sealedTotalPacks < 3 ? `Need ${3 - sealedTotalPacks} more` : `Remove ${sealedTotalPacks - 8}`}
                      </span>
                    </label>
                    <div className="space-y-3">
                      {Object.entries(sealedConfig.packCounts).map(([set, count]) => (
                        <div key={set} className="flex items-center justify-between">
                          <span className="text-sm">{set}</span>
                          <div className="flex items-center gap-2">
                            <button
                              className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded text-xs flex items-center justify-center transition-colors disabled:opacity-40"
                              onClick={() => setSealedConfig(prev => ({
                                ...prev,
                                packCounts: {
                                  ...prev.packCounts,
                                  [set]: Math.max(0, count - 1)
                                }
                              }))}
                              disabled={count <= 0}
                            >
                              −
                            </button>
                            <span className="w-8 text-center text-sm font-medium">{count}</span>
                            <button
                              className="w-6 h-6 bg-slate-700 hover:bg-slate-600 rounded text-xs flex items-center justify-center transition-colors disabled:opacity-40"
                              onClick={() => setSealedConfig(prev => ({
                                ...prev,
                                packCounts: {
                                  ...prev.packCounts,
                                  [set]: Math.min(8, count + 1)
                                }
                              }))}
                              disabled={Object.values(sealedConfig.packCounts).reduce((sum, c) => sum + c, 0) >= 8}
                            >
                              +
                            </button>
                          </div>
                        </div>
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
                      className="w-24 bg-slate-800/70 ring-1 ring-slate-700 rounded px-2 py-1 text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={sealedConfig.replaceAvatars}
                      onChange={(e) => setSealedConfig(prev => ({ ...prev, replaceAvatars: e.target.checked }))}
                      className="rounded"
                    />
                    <span>Replace Sorcerer with Beta avatars</span>
                  </label>
                </>
              )}
            </div>
            <div className="mt-5 flex items-center justify-between">
              <div className="text-xs opacity-70 truncate">{plannedSummary}</div>
              <div className="flex gap-2">
                <button
                  className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm"
                  onClick={() => setConfigOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="rounded bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 px-4 py-1.5 text-sm font-semibold disabled:opacity-40"
                  onClick={() => {
                    if (matchType === "constructed") {
                      startMatch({ matchType: "constructed" });
                      setConfigOpen(false);
                      return;
                    }
                    if (matchType === "draft") {
                      const total = Object.values(draftConfig.packCounts).reduce((s, c) => s + c, 0);
                      if (total !== draftConfig.packCount) {
                        alert(`Draft pack mix must sum to ${draftConfig.packCount}.`);
                        return;
                      }
                      const activeSets = Object.entries(draftConfig.packCounts).filter(([, c]) => c > 0).map(([s]) => s);
                      const payload = {
                        ...draftConfig,
                        setMix: activeSets.length ? activeSets : draftConfig.setMix,
                      };
                      startMatch({ matchType: "draft", draftConfig: payload });
                      setConfigOpen(false);
                      return;
                    }
                    const totalPacks = Object.values(sealedConfig.packCounts).reduce((sum, count) => sum + count, 0);
                    const activeSets = Object.entries(sealedConfig.packCounts).filter(([, count]) => count > 0);
                    if (activeSets.length === 0) {
                      alert("Please configure at least one set with packs for sealed play.");
                      return;
                    }
                    if (totalPacks < 3 || totalPacks > 8) {
                      alert("Total pack count must be between 3 and 8.");
                      return;
                    }
                    const setMix = activeSets.map(([set]) => set);
                    const legacySealedConfig = {
                      packCount: totalPacks,
                      setMix,
                      timeLimit: sealedConfig.timeLimit,
                      packCounts: sealedConfig.packCounts,
                      replaceAvatars: sealedConfig.replaceAvatars,
                    };
                    startMatch({ matchType: "sealed", sealedConfig: legacySealedConfig });
                    setConfigOpen(false);
                  }}
                  disabled={!allReady || (matchType === "sealed" && !sealedValid) || (matchType === "draft" && !draftValid)}
                  title={!allReady ? "All players must be ready to start" : `Start ${matchType} match`}
                >
                  Confirm Start
                </button>
              </div>
            </div>
          </div>
        </div>
        )}

      {/* Controls for lobby and match IDs */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
                if (id) {
                  console.log("[game] Joining match - resetting game state");
                  useGameStore.getState().resetGameState();
                  joinMatch(id);
                }
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

      {/* Lobby details */}
      <div className="grid grid-cols-1 gap-4">
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
              {/* Planned match configuration (host view) */}
              {isHost && (
                <div className="text-xs opacity-80">
                  <span className="opacity-70">Planned Match:</span>{" "}
                  {matchType === "constructed"
                    ? "Constructed"
                    : (() => {
                        const totalPacks = Object.values(sealedConfig.packCounts).reduce((sum, c) => sum + c, 0);
                        const activeSets = Object.entries(sealedConfig.packCounts)
                          .filter(([, count]) => count > 0)
                          .map(([set]) => set);
                        return `Sealed • Packs: ${totalPacks} • Sets: ${activeSets.join(", ")} • Time: ${sealedConfig.timeLimit}m`;
                      })()}
                </div>
              )}
              <div className="mt-2">
                <div className="font-medium flex items-center gap-2">
                  <span>Players</span>
                  <span className="text-xs opacity-70">
                    Ready: {(lobby.readyPlayerIds || []).length}/{lobby.players.length}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {lobby.players.map((p) => {
                    const isReady = (lobby.readyPlayerIds || []).includes(p.id);
                    const isHost = p.id === lobby.hostId;
                    const isYou = !!me?.id && p.id === me.id;
                    return (
                      <span
                        key={p.id}
                        className={`text-[11px] px-1.5 py-0.5 rounded ring-1 ${
                          isReady
                            ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                            : "bg-slate-800/60 text-slate-300 ring-slate-700/60"
                        }`}
                        title={`${p.displayName}${isYou ? " • You" : ""}${isHost ? " • Host" : ""}${
                          isReady ? " • Ready" : " • Not ready"
                        }`}
                      >
                        {p.displayName}
                        {isYou && <span className="opacity-70"> • You</span>}
                        {isHost && <span className="opacity-70"> • Host</span>}
                        <span className="opacity-80"> {isReady ? " • ✓" : " • …"}</span>
                      </span>
                    );
                  })}
                </div>
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
              {match.matchType && (
                <div>
                  <span className="opacity-70">Mode:</span> {match.matchType}
                </div>
              )}
              {match.sealedConfig && (
                <div className="text-xs opacity-80">
                  Sealed • Packs: {match.sealedConfig.packCount} • Sets: {match.sealedConfig.setMix.join(", ")} • Time: {match.sealedConfig.timeLimit}m
                </div>
              )}
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
      {/* Chat */}
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-slate-900/60 rounded-xl ring-1 ring-slate-800 p-4">
          <div className="flex items-center justify-between mb-2">
            {/* tabs for Lobby/Global chat scopes */}
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
      </div>
    </div>
  );
}
