import type { StateCreator } from "zustand";
import type { CustomMessage } from "@/lib/net/transport";
import type {
  CardRef,
  CellKey,
  GameState,
  PlayerKey,
  ServerPatchT,
} from "./types";
// Board helper imports available if needed for future expansion
// import { seatFromOwner, toCellKey } from "./utils/boardHelpers";

function newArtifactCastId() {
  return `artifact_cast_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

// Artifact types that enable collection spell casting
export type ArtifactCastType = "toolbox" | "silver_bullet";

// Rarity filter for each artifact type
const ARTIFACT_RARITY_FILTER: Record<ArtifactCastType, string> = {
  toolbox: "ordinary",
  silver_bullet: "exceptional",
};

// Display names
const ARTIFACT_DISPLAY_NAMES: Record<ArtifactCastType, string> = {
  toolbox: "Toolbox",
  silver_bullet: "Silver Bullet",
};

export type ArtifactCastPhase =
  | "selecting" // Player selecting spell from collection
  | "casting" // Spell selected, playing to board
  | "complete";

export type PendingArtifactCast = {
  id: string;
  artifactType: ArtifactCastType;
  casterSeat: PlayerKey;
  // The artifact being sacrificed
  artifact: {
    at: CellKey;
    index: number;
    instanceId: string | null;
    name: string;
  };
  // The bearer (permanent or avatar) - for Silver Bullet, bearer must be tapped
  bearer: {
    kind: "permanent" | "avatar";
    at: CellKey;
    index: number; // -1 for avatar
    instanceId: string | null;
    name: string;
  };
  phase: ArtifactCastPhase;
  // Eligible spells from collection (filtered by rarity)
  eligibleSpells: CardRef[];
  // Selected spell to cast
  selectedSpell: CardRef | null;
  createdAt: number;
};

export type ArtifactCastSlice = Pick<
  GameState,
  | "pendingArtifactCast"
  | "beginArtifactCast"
  | "selectArtifactCastSpell"
  | "resolveArtifactCast"
  | "cancelArtifactCast"
>;

/**
 * Detect if a card name is Toolbox
 */
export function isToolbox(name: string | null | undefined): boolean {
  if (!name) return false;
  return name.toLowerCase() === "toolbox";
}

/**
 * Detect if a card name is Silver Bullet
 */
export function isSilverBullet(name: string | null | undefined): boolean {
  if (!name) return false;
  return name.toLowerCase() === "silver bullet";
}

/**
 * Get the artifact cast type from a card name
 */
export function getArtifactCastType(
  name: string | null | undefined,
): ArtifactCastType | null {
  if (isToolbox(name)) return "toolbox";
  if (isSilverBullet(name)) return "silver_bullet";
  return null;
}

export const createArtifactCastSlice: StateCreator<
  GameState,
  [],
  [],
  ArtifactCastSlice
> = (set, get) => ({
  pendingArtifactCast: null,

  beginArtifactCast: (input: {
    artifactType: ArtifactCastType;
    casterSeat: PlayerKey;
    artifact: {
      at: CellKey;
      index: number;
      instanceId: string | null;
      name: string;
    };
    bearer: {
      kind: "permanent" | "avatar";
      at: CellKey;
      index: number;
      instanceId: string | null;
      name: string;
    };
  }) => {
    const id = newArtifactCastId();
    const { artifactType, casterSeat, artifact, bearer } = input;
    const state = get();

    // For Silver Bullet, bearer must be tapped first
    if (artifactType === "silver_bullet") {
      if (bearer.kind === "permanent") {
        const perm = state.permanents[bearer.at]?.[bearer.index];
        if (perm && !perm.tapped) {
          // Tap the bearer
          state.toggleTapPermanent(bearer.at, bearer.index);
        }
      } else if (bearer.kind === "avatar") {
        const avatar = state.avatars[casterSeat];
        if (avatar && !avatar.tapped) {
          // Tap the avatar
          state.toggleTapAvatar(casterSeat);
        }
      }
    }

    // Get spells from collection filtered by rarity
    const collection = state.zones[casterSeat]?.collection || [];
    const targetRarity = ARTIFACT_RARITY_FILTER[artifactType];

    // Filter collection to matching rarity only — no card type filtering.
    // The player decides what to cast from eligible cards.
    const eligibleSpells = collection.filter((card) => {
      const cardRarity = (card.rarity || "").toLowerCase();
      return cardRarity === targetRarity;
    });

    if (eligibleSpells.length === 0) {
      const displayName = ARTIFACT_DISPLAY_NAMES[artifactType];
      get().log(
        `[${casterSeat.toUpperCase()}] ${displayName}: No ${targetRarity} spells in collection`,
      );
      return;
    }

    // Set pending state
    set({
      pendingArtifactCast: {
        id,
        artifactType,
        casterSeat,
        artifact,
        bearer,
        phase: "selecting",
        eligibleSpells,
        selectedSpell: null,
        createdAt: Date.now(),
      },
    } as Partial<GameState> as GameState);

    const displayName = ARTIFACT_DISPLAY_NAMES[artifactType];
    get().log(
      `[${casterSeat.toUpperCase()}] activates ${displayName} on ${bearer.name}`,
    );

    // Broadcast to opponent
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "artifactCastBegin",
          id,
          artifactType,
          casterSeat,
          artifact,
          bearer,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  selectArtifactCastSpell: (spell: CardRef) => {
    const pending = get().pendingArtifactCast;
    if (!pending || pending.phase !== "selecting") return;

    // Verify spell is in eligible list
    const isEligible = pending.eligibleSpells.some(
      (s) =>
        s.cardId === spell.cardId &&
        (s.instanceId === spell.instanceId ||
          (!s.instanceId && !spell.instanceId)),
    );
    if (!isEligible) return;

    set({
      pendingArtifactCast: {
        ...pending,
        selectedSpell: spell,
        // Keep phase as "selecting" so UI stays visible until user confirms
      },
    } as Partial<GameState> as GameState);

    // Broadcast selection
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "artifactCastSelect",
          id: pending.id,
          spellName: spell.name,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },

  resolveArtifactCast: () => {
    const pending = get().pendingArtifactCast;
    if (!pending || pending.phase !== "selecting" || !pending.selectedSpell)
      return;

    const { casterSeat, artifact, bearer, selectedSpell, artifactType } =
      pending;

    // 1. Sacrifice the artifact (move to graveyard)
    get().movePermanentToZone(artifact.at, artifact.index, "graveyard");

    // 2. Remove spell from collection (re-fetch state after artifact move)
    const zones = get().zones;
    const collection = [...(zones[casterSeat]?.collection || [])];
    const spellIndex = collection.findIndex(
      (c) =>
        c.cardId === selectedSpell.cardId &&
        (c.instanceId === selectedSpell.instanceId ||
          (!c.instanceId && !selectedSpell.instanceId)),
    );

    if (spellIndex === -1) {
      get().log(`[${casterSeat.toUpperCase()}] Spell not found in collection`);
      set({ pendingArtifactCast: null } as Partial<GameState> as GameState);
      return;
    }

    const [removedSpell] = collection.splice(spellIndex, 1);

    // 3. Place spell on the board at bearer's location (bearer casts it)
    const bearerTile = bearer.at;
    const permanents = get().permanents;
    const tileStack = [...(permanents[bearerTile] || [])];

    // Create the spell permanent with the caster's ownership
    const spellPermanent = {
      card: removedSpell,
      owner: casterSeat === "p1" ? 1 : 2,
      tapped: false,
      instanceId:
        removedSpell.instanceId ||
        `spell_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    };

    // Add spell to the tile
    tileStack.push(spellPermanent as never);

    const permanentsNext = {
      ...permanents,
      [bearerTile]: tileStack,
    };

    const zonesNext = {
      ...zones,
      [casterSeat]: {
        ...zones[casterSeat],
        collection,
      },
    };

    // Update state
    set({
      zones: zonesNext,
      permanents: permanentsNext,
      pendingArtifactCast: { ...pending, phase: "complete" },
    } as Partial<GameState> as GameState);

    // Send patches
    const patches: ServerPatchT = {
      zones: {
        [casterSeat]: zonesNext[casterSeat],
      } as unknown as ServerPatchT["zones"],
      permanents: permanentsNext as ServerPatchT["permanents"],
    };
    get().trySendPatch(patches);

    const displayName = ARTIFACT_DISPLAY_NAMES[artifactType];
    get().log(
      `[${casterSeat.toUpperCase()}] ${bearer.name} casts ${selectedSpell.name} via ${displayName}`,
    );

    // Broadcast resolution with zone and board data so opponent sees the changes
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "artifactCastResolve",
          id: pending.id,
          spellName: selectedSpell.name,
          casterSeat,
          newZones: { [casterSeat]: zonesNext[casterSeat] },
          newPermanents: permanentsNext,
          ts: Date.now(),
        } as unknown as CustomMessage);
        // Toast notification
        transport.sendMessage({
          type: "toast",
          message: `${casterSeat.toUpperCase()} casts ${selectedSpell.name} via ${displayName}`,
        } as never);
      } catch {}
    }

    // Clear pending after short delay
    setTimeout(() => {
      set((s) => {
        if (s.pendingArtifactCast?.id === pending.id) {
          return { ...s, pendingArtifactCast: null } as GameState;
        }
        return s;
      });
    }, 300);
  },

  cancelArtifactCast: () => {
    const pending = get().pendingArtifactCast;
    if (!pending) return;

    const { casterSeat, artifactType } = pending;
    const displayName = ARTIFACT_DISPLAY_NAMES[artifactType];

    set({ pendingArtifactCast: null } as Partial<GameState> as GameState);

    get().log(`[${casterSeat.toUpperCase()}] cancels ${displayName}`);

    // Broadcast cancellation
    const transport = get().transport;
    if (transport?.sendMessage) {
      try {
        transport.sendMessage({
          type: "artifactCastCancel",
          id: pending.id,
          ts: Date.now(),
        } as unknown as CustomMessage);
      } catch {}
    }
  },
});
