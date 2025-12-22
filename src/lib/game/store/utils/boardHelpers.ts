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

// Get all adjacent cell keys (orthogonal only: up, down, left, right)
export const getAdjacentCells = (
  cellKey: CellKey,
  boardWidth: number,
  boardHeight: number
): CellKey[] => {
  const { x, y } = parseCellKey(cellKey);
  const adjacent: CellKey[] = [];

  // Up
  if (y > 0) adjacent.push(toCellKey(x, y - 1));
  // Down
  if (y < boardHeight - 1) adjacent.push(toCellKey(x, y + 1));
  // Left
  if (x > 0) adjacent.push(toCellKey(x - 1, y));
  // Right
  if (x < boardWidth - 1) adjacent.push(toCellKey(x + 1, y));

  return adjacent;
};

// Get all nearby cell keys (orthogonal + diagonals - 8 directions)
export const getNearbyCells = (
  cellKey: CellKey,
  boardWidth: number,
  boardHeight: number
): CellKey[] => {
  const { x, y } = parseCellKey(cellKey);
  const nearby: CellKey[] = [];

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue; // Skip self
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < boardWidth && ny >= 0 && ny < boardHeight) {
        nearby.push(toCellKey(nx, ny));
      }
    }
  }

  return nearby;
};
