/**
 * Attack of the Realm Eater - Pathfinding
 *
 * BFS pathfinding for Realm Eater movement toward destination marker
 */

import type { CellKey } from "@/lib/game/store";
import type { AotreTile } from "../types/entities";

/**
 * Parse a cell key into x,y coordinates
 */
function parseKey(key: CellKey): [number, number] {
  const [x, y] = key.split(",").map(Number);
  return [x, y];
}

/**
 * Create a cell key from x,y coordinates
 */
function cellKey(x: number, y: number): CellKey {
  return `${x},${y}`;
}

/**
 * Get adjacent cell keys (orthogonal movement only)
 */
function getAdjacentCells(key: CellKey): CellKey[] {
  const [x, y] = parseKey(key);
  return [
    cellKey(x, y - 1), // up
    cellKey(x, y + 1), // down
    cellKey(x - 1, y), // left
    cellKey(x + 1, y), // right
  ];
}

/**
 * Check if a tile is traversable (not void)
 */
function isTraversable(tile: AotreTile | undefined): boolean {
  if (!tile) return false;
  return tile.state !== "void";
}

/**
 * BFS to find shortest path from start to target
 * Returns array of cell keys representing the path (excluding start, including target)
 * Returns empty array if no path exists
 */
export function findPath(
  start: CellKey,
  target: CellKey,
  tiles: Record<CellKey, AotreTile>
): CellKey[] {
  // If already at target, no movement needed
  if (start === target) {
    return [];
  }

  const visited = new Set<CellKey>();
  const queue: Array<{ key: CellKey; path: CellKey[] }> = [
    { key: start, path: [] },
  ];
  visited.add(start);

  while (queue.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const current = queue.shift()!;

    // Check all adjacent cells
    for (const neighbor of getAdjacentCells(current.key)) {
      // Skip if already visited
      if (visited.has(neighbor)) {
        continue;
      }

      // Skip if not traversable
      if (!isTraversable(tiles[neighbor])) {
        continue;
      }

      const newPath = [...current.path, neighbor];

      // Found the target
      if (neighbor === target) {
        return newPath;
      }

      // Add to queue
      visited.add(neighbor);
      queue.push({ key: neighbor, path: newPath });
    }
  }

  // No path found
  return [];
}

/**
 * Get the next step toward the destination
 * Returns the cell key to move to, or null if no movement possible
 */
export function getNextStep(
  currentPosition: CellKey,
  destination: CellKey,
  tiles: Record<CellKey, AotreTile>
): CellKey | null {
  const path = findPath(currentPosition, destination, tiles);

  if (path.length === 0) {
    return null;
  }

  return path[0];
}

/**
 * Calculate distance between two cells (Manhattan distance)
 */
export function getManhattanDistance(from: CellKey, to: CellKey): number {
  const [x1, y1] = parseKey(from);
  const [x2, y2] = parseKey(to);
  return Math.abs(x2 - x1) + Math.abs(y2 - y1);
}

/**
 * Find nearest site tile from a position
 */
export function findNearestSite(
  from: CellKey,
  tiles: Record<CellKey, AotreTile>,
  excludePosition?: CellKey
): CellKey | null {
  let nearest: CellKey | null = null;
  let nearestDistance = Infinity;

  for (const [key, tile] of Object.entries(tiles)) {
    if (tile.state !== "site") continue;
    if (key === excludePosition) continue;

    const distance = getManhattanDistance(from, key);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = key;
    }
  }

  return nearest;
}

/**
 * Find a random site tile for new destination
 */
export function findRandomSite(
  tiles: Record<CellKey, AotreTile>,
  excludePosition?: CellKey
): CellKey | null {
  const siteTiles = Object.entries(tiles)
    .filter(([key, tile]) => tile.state === "site" && key !== excludePosition)
    .map(([key]) => key);

  if (siteTiles.length === 0) {
    return null;
  }

  return siteTiles[Math.floor(Math.random() * siteTiles.length)];
}
