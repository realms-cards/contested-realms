"use client";

import { Trophy } from "lucide-react";
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  BracketMatchData,
  BracketPlayer,
  BracketRound,
} from "@/components/tournament/TournamentBracket";

type EdgeOutcome = "win" | "loss" | "draw" | "open";

interface FlowEdge {
  key: string;
  playerId: string;
  outcome: EdgeOutcome;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const EDGE_COLORS: Record<EdgeOutcome, string> = {
  win: "#10b981", // emerald-500
  loss: "#f43f5e", // rose-500
  draw: "#f59e0b", // amber-500
  open: "#64748b", // slate-500
};

interface TournamentFlowchartProps {
  rounds: BracketRound[];
  currentUserId?: string | null;
}

/**
 * Renders Swiss rounds as a flowchart: one column per round, match nodes
 * connected by edges that trace each player's path from round to round.
 * Edge color encodes the player's result in the earlier match; hovering a
 * player highlights their full path through the tournament.
 */
export function TournamentFlowchart({
  rounds,
  currentUserId,
}: TournamentFlowchartProps) {
  const sortedRounds = useMemo(
    () => [...rounds].sort((a, b) => a.roundNumber - b.roundNumber),
    [rounds],
  );

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [hoveredPlayerId, setHoveredPlayerId] = useState<string | null>(null);

  const setNodeRef = useCallback(
    (matchId: string) => (el: HTMLDivElement | null) => {
      if (el) {
        nodeRefs.current.set(matchId, el);
      } else {
        nodeRefs.current.delete(matchId);
      }
    },
    [],
  );

  const computeEdges = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();

    // Anchor a player's edge at their row within the match node
    const playerAnchorY = (rect: DOMRect, rowIndex: number) =>
      rect.top - canvasRect.top + rect.height * (rowIndex === 0 ? 0.32 : 0.68);

    const outcomeFor = (
      match: BracketMatchData,
      playerId: string,
    ): EdgeOutcome => {
      if (match.status !== "completed") return "open";
      if (!match.winnerId) return "draw";
      return match.winnerId === playerId ? "win" : "loss";
    };

    const nextEdges: FlowEdge[] = [];
    for (let i = 1; i < sortedRounds.length; i++) {
      const prevByPlayer = new Map<
        string,
        { match: BracketMatchData; rowIndex: number }
      >();
      for (const match of sortedRounds[i - 1].matches) {
        match.players.forEach((player, rowIndex) => {
          if (player?.id) prevByPlayer.set(player.id, { match, rowIndex });
        });
      }

      for (const match of sortedRounds[i].matches) {
        const targetEl = nodeRefs.current.get(match.id);
        if (!targetEl) continue;
        const targetRect = targetEl.getBoundingClientRect();

        match.players.forEach((player, rowIndex) => {
          if (!player?.id) return;
          const prev = prevByPlayer.get(player.id);
          if (!prev) return;
          const sourceEl = nodeRefs.current.get(prev.match.id);
          if (!sourceEl) return;
          const sourceRect = sourceEl.getBoundingClientRect();

          nextEdges.push({
            key: `${prev.match.id}:${match.id}:${player.id}`,
            playerId: player.id,
            outcome: outcomeFor(prev.match, player.id),
            x1: sourceRect.right - canvasRect.left,
            y1: playerAnchorY(sourceRect, prev.rowIndex),
            x2: targetRect.left - canvasRect.left,
            y2: playerAnchorY(targetRect, rowIndex),
          });
        });
      }
    }
    setEdges(nextEdges);
  }, [sortedRounds]);

  useLayoutEffect(() => {
    computeEdges();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => computeEdges());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [computeEdges]);

  if (sortedRounds.length === 0) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="text-center py-8 text-slate-400">
          No rounds started yet.
        </div>
      </div>
    );
  }

  const edgePath = (edge: FlowEdge) => {
    const bend = Math.max(24, (edge.x2 - edge.x1) / 2);
    return `M ${edge.x1} ${edge.y1} C ${edge.x1 + bend} ${edge.y1}, ${edge.x2 - bend} ${edge.y2}, ${edge.x2} ${edge.y2}`;
  };

  const edgeStyle = (edge: FlowEdge) => {
    if (hoveredPlayerId) {
      if (edge.playerId === hoveredPlayerId) {
        return { stroke: EDGE_COLORS[edge.outcome], strokeWidth: 3, opacity: 1 };
      }
      return { stroke: EDGE_COLORS[edge.outcome], strokeWidth: 1.5, opacity: 0.12 };
    }
    const isOwn = edge.playerId === currentUserId;
    return {
      stroke: EDGE_COLORS[edge.outcome],
      strokeWidth: isOwn ? 2.5 : 1.5,
      opacity: isOwn ? 1 : 0.6,
    };
  };

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="overflow-x-auto">
        <div ref={canvasRef} className="relative min-w-max pb-2">
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            aria-hidden="true"
          >
            {edges.map((edge) => (
              <path
                key={edge.key}
                d={edgePath(edge)}
                fill="none"
                {...edgeStyle(edge)}
              />
            ))}
          </svg>

          <div className="flex gap-16">
            {sortedRounds.map((round) => (
              <div key={round.id} className="flex flex-col min-w-[240px]">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-600">
                  <h3 className="text-sm font-semibold text-slate-300">
                    Round {round.roundNumber}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      round.status === "completed"
                        ? "bg-slate-600 text-slate-200"
                        : round.status === "active"
                          ? "bg-blue-600 text-white"
                          : "bg-amber-600/60 text-amber-100"
                    }`}
                  >
                    {round.status}
                  </span>
                </div>

                <div className="flex flex-col gap-4">
                  {round.matches.map((match) => (
                    <FlowchartMatchNode
                      key={match.id}
                      match={match}
                      currentUserId={currentUserId}
                      hoveredPlayerId={hoveredPlayerId}
                      onHoverPlayer={setHoveredPlayerId}
                      nodeRef={setNodeRef(match.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-slate-700 text-xs text-slate-400">
        {(
          [
            ["win", "Won previous match"],
            ["loss", "Lost previous match"],
            ["draw", "Drew previous match"],
            ["open", "Match in progress"],
          ] as Array<[EdgeOutcome, string]>
        ).map(([outcome, label]) => (
          <span key={outcome} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-5 h-0.5 rounded"
              style={{ backgroundColor: EDGE_COLORS[outcome] }}
            />
            {label}
          </span>
        ))}
        <span className="ml-auto text-slate-500">
          Hover a player to trace their path
        </span>
      </div>
    </div>
  );
}

interface FlowchartMatchNodeProps {
  match: BracketMatchData;
  currentUserId?: string | null;
  hoveredPlayerId: string | null;
  onHoverPlayer: (playerId: string | null) => void;
  nodeRef: (el: HTMLDivElement | null) => void;
}

function FlowchartMatchNode({
  match,
  currentUserId,
  hoveredPlayerId,
  onHoverPlayer,
  nodeRef,
}: FlowchartMatchNodeProps) {
  const player1 = match.players[0];
  const player2 = match.players[1];
  const isBye = match.bye || !player2;

  const rowClass = (player: BracketPlayer | undefined, isWinner: boolean) => {
    if (!player) return "bg-slate-700/50 text-slate-500";
    if (player.id === hoveredPlayerId)
      return "bg-amber-600/30 text-amber-100 ring-1 ring-amber-400/50";
    if (isWinner) return "bg-orange-600 text-white";
    if (match.status === "completed" && match.winnerId) {
      return "bg-slate-700 text-slate-400";
    }
    if (player.id === currentUserId) {
      return "bg-emerald-900/40 text-emerald-200 ring-1 ring-emerald-500/30";
    }
    return "bg-slate-700 text-slate-200";
  };

  const renderRow = (
    player: BracketPlayer | undefined,
    fallback: string,
    isWinner: boolean,
    withBorder: boolean,
  ) => (
    <div
      className={`flex items-center justify-between px-3 py-1.5 ${
        withBorder ? "border-b border-slate-600" : ""
      } ${rowClass(player, isWinner)}`}
      onMouseEnter={() => player && onHoverPlayer(player.id)}
      onMouseLeave={() => onHoverPlayer(null)}
    >
      <span className="text-sm font-medium truncate max-w-[180px]">
        {player?.name || fallback}
      </span>
      {isWinner && (
        <Trophy className="w-3.5 h-3.5 text-yellow-300 flex-shrink-0" />
      )}
    </div>
  );

  return (
    <div
      ref={nodeRef}
      className={`border rounded overflow-hidden ${
        match.status === "active"
          ? "border-blue-500/60"
          : match.invalid
            ? "border-red-500/50"
            : "border-slate-600"
      }`}
    >
      {renderRow(player1, "TBD", match.winnerId === player1?.id, true)}
      {renderRow(
        player2,
        isBye ? "(bye)" : "TBD",
        match.winnerId === player2?.id,
        false,
      )}
    </div>
  );
}

export default TournamentFlowchart;
