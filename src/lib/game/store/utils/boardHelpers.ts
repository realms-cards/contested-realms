import type { CellKey, PlayerKey } from "../types";

export const toCellKey = (x: number, y: number): CellKey => `${x},${y}`;

export const parseCellKey = (key: CellKey): { x: number; y: number } => {
  const [rawX, rawY] = key.split(",", 2);
  return {
    x: Number(rawX || 0),
    y: Number(rawY || 0),
  };
};

export const getCellNumber = (x: number, y: number, width: number): number =>
  y * width + x + 1;

export const seatFromOwner = (owner: 1 | 2): PlayerKey =>
  owner === 1 ? "p1" : "p2";

export const ownerFromSeat = (seat: PlayerKey): 1 | 2 =>
  seat === "p1" ? 1 : 2;

export const ownerLabel = (seat: PlayerKey): string => seat.toUpperCase();

export const opponentSeat = (seat: PlayerKey): PlayerKey =>
  seat === "p1" ? "p2" : "p1";

export const opponentOwner = (owner: 1 | 2): 1 | 2 => (owner === 1 ? 2 : 1);
