import type { StateCreator } from "zustand";
import type {
  GameState,
  GemColorId,
  GemToken,
  PlayerKey,
  ServerPatchT,
} from "./types";

// Gem token colors available for selection
export const GEM_COLORS: ReadonlyArray<{
  id: GemColorId;
  label: string;
  hex: string;
}> = [
  { id: "red", label: "Red", hex: "#dc2626" },
  { id: "blue", label: "Blue", hex: "#2563eb" },
  { id: "green", label: "Green", hex: "#16a34a" },
  { id: "yellow", label: "Yellow", hex: "#eab308" },
  { id: "purple", label: "Purple", hex: "#9333ea" },
  { id: "orange", label: "Orange", hex: "#ea580c" },
  { id: "cyan", label: "Cyan", hex: "#06b6d4" },
  { id: "pink", label: "Pink", hex: "#ec4899" },
  { id: "white", label: "White", hex: "#f5f5f5" },
  { id: "black", label: "Black", hex: "#1f1f1f" },
];

export type GemTokenState = {
  gemTokens: GemToken[];
  spawnGemToken: (color: GemColorId, owner: PlayerKey) => void;
  spawnGemTokenAt: (
    color: GemColorId,
    owner: PlayerKey,
    position: { x: number; y: number; z: number },
  ) => void;
  moveGemToken: (
    id: string,
    position: { x: number; y: number; z: number },
  ) => void;
  changeGemTokenColor: (id: string, color: GemColorId) => void;
  duplicateGemToken: (id: string) => void;
  destroyGemToken: (id: string) => void;
};

let gemSeq = 0;

function generateGemId(): string {
  return `gem_${Date.now()}_${++gemSeq}`;
}

// Calculate spawn position in front of the player
function getSpawnPosition(owner: PlayerKey): {
  x: number;
  y: number;
  z: number;
} {
  // Spawn gems in front of player (near their side of the board)
  // P1 is at positive Z (bottom), P2 is at negative Z (top)
  const frontZ = owner === "p1" ? 3.5 : -3.5;
  // Add some random offset to avoid stacking
  const offsetX = (Math.random() - 0.5) * 1.0;
  const offsetZ = (Math.random() - 0.5) * 0.5;
  return { x: offsetX, y: 0, z: frontZ + offsetZ };
}

export const createGemTokenSlice: StateCreator<
  GameState,
  [],
  [],
  GemTokenState
> = (set, get) => ({
  gemTokens: [],

  spawnGemToken: (color: GemColorId, owner: PlayerKey) => {
    const newToken: GemToken = {
      id: generateGemId(),
      color,
      position: getSpawnPosition(owner),
      owner,
      createdAt: Date.now(),
    };

    set((state) => ({
      gemTokens: [...state.gemTokens, newToken],
    }));

    // Sync to network
    const patch: Partial<ServerPatchT> = {
      gemTokens: [...get().gemTokens],
    };
    get().trySendPatch?.(patch as ServerPatchT);

    get().log?.(`Spawned a ${color} gem token`);
  },

  spawnGemTokenAt: (
    color: GemColorId,
    owner: PlayerKey,
    position: { x: number; y: number; z: number },
  ) => {
    const newToken: GemToken = {
      id: generateGemId(),
      color,
      position,
      owner,
      createdAt: Date.now(),
    };

    set((state) => ({
      gemTokens: [...state.gemTokens, newToken],
    }));

    // Sync to network
    const patch: Partial<ServerPatchT> = {
      gemTokens: [...get().gemTokens],
    };
    get().trySendPatch?.(patch as ServerPatchT);

    get().log?.(`Spawned a ${color} gem token at cursor`);
  },

  moveGemToken: (id: string, position: { x: number; y: number; z: number }) => {
    set((state) => ({
      gemTokens: state.gemTokens.map((t) =>
        t.id === id ? { ...t, position } : t,
      ),
    }));

    // Sync to network
    const patch: Partial<ServerPatchT> = {
      gemTokens: [...get().gemTokens],
    };
    get().trySendPatch?.(patch as ServerPatchT);
  },

  changeGemTokenColor: (id: string, color: GemColorId) => {
    const token = get().gemTokens.find((t) => t.id === id);
    if (!token) return;

    set((state) => ({
      gemTokens: state.gemTokens.map((t) =>
        t.id === id ? { ...t, color } : t,
      ),
    }));

    // Sync to network
    const patch: Partial<ServerPatchT> = {
      gemTokens: [...get().gemTokens],
    };
    get().trySendPatch?.(patch as ServerPatchT);

    get().log?.(`Changed gem token color to ${color}`);
  },

  duplicateGemToken: (id: string) => {
    const original = get().gemTokens.find((t) => t.id === id);
    if (!original) return;

    const newToken: GemToken = {
      id: generateGemId(),
      color: original.color,
      position: {
        x: original.position.x + 0.3,
        y: original.position.y,
        z: original.position.z + 0.3,
      },
      owner: original.owner,
      createdAt: Date.now(),
    };

    set((state) => ({
      gemTokens: [...state.gemTokens, newToken],
    }));

    // Sync to network
    const patch: Partial<ServerPatchT> = {
      gemTokens: [...get().gemTokens],
    };
    get().trySendPatch?.(patch as ServerPatchT);

    get().log?.(`Duplicated ${original.color} gem token`);
  },

  destroyGemToken: (id: string) => {
    const token = get().gemTokens.find((t) => t.id === id);
    if (!token) return;

    set((state) => ({
      gemTokens: state.gemTokens.filter((t) => t.id !== id),
    }));

    // Sync to network
    const patch: Partial<ServerPatchT> = {
      gemTokens: [...get().gemTokens],
    };
    get().trySendPatch?.(patch as ServerPatchT);

    get().log?.(`Destroyed ${token.color} gem token`);
  },
});
