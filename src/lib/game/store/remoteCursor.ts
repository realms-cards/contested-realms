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
} | null;

export type RemoteCursorState = {
  playerId: string;
  playerKey: PlayerKey | null;
  position: { x: number; z: number } | null;
  dragging: RemoteCursorDragMeta | null;
  highlight: RemoteCursorHighlight;
  ts: number;
  displayName?: string | null;
};

export const REMOTE_CURSOR_TTL_MS = 3000;
