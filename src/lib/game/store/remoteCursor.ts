import type { PlayerKey } from "./baseTypes";

export type RemoteCursorDragMeta =
  | {
      kind: "permanent";
      from?: string | null;
      index?: number | null;
    }
  | { kind: "hand" }
  | { kind: "pile"; source?: string | null }
  | { kind: "token" }
  | { kind: "avatar"; who?: PlayerKey | null };

export type RemoteCursorHighlight = {
  slug?: string | null;
  cardId?: number | null;
  instanceKey?: string | null;
} | null;

export type RemoteCursorState = {
  playerId: string;
  playerKey: PlayerKey | null;
  position: { x: number; z: number } | null;
  dragging: RemoteCursorDragMeta | null;
  highlight: RemoteCursorHighlight;
  ts: number;
  displayName?: string | null;
  // Interpolation state for smooth cursor movement at 60fps even with 15 Hz network updates
  prevPosition?: { x: number; z: number } | null;
  prevTs?: number;
};

export const REMOTE_CURSOR_TTL_MS = 3000;
