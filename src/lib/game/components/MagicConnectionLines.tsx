import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { getPermanentOwnerBaseZ } from "@/lib/game/boardShared";
import { TargetBullseye } from "@/lib/game/components/TargetBullseye";
import { TILE_SIZE, PLAYER_COLORS } from "@/lib/game/constants";
import { requestCosmeticFrame } from "@/lib/game/render/cosmeticFrame";
import type { GameState } from "@/lib/game/store/types";
import { seatFromOwner } from "@/lib/game/store/utils/boardHelpers";

type MagicConnectionLinesProps = {
  pendingMagic: NonNullable<GameState["pendingMagic"]>;
  avatars: GameState["avatars"];
  permanents: GameState["permanents"];
  boardOffset: { x: number; y: number };
};

// Card offset from tile center: the same owner-based resting Z that
// PermanentStack renders with, so strips and the bullseye land on the card
// rather than on the far side of the tile.
const getCardZOffset = (owner: 1 | 2): number => getPermanentOwnerBaseZ(owner);

/** Per-card drag offset ([x, z]) of a permanent, if it has one. */
const permanentOffset = (
  permanents: GameState["permanents"],
  at: string,
  index: number | undefined,
): [number, number] => {
  const off = permanents[at]?.[index ?? -1]?.offset;
  return Array.isArray(off) ? [off[0] || 0, off[1] || 0] : [0, 0];
};

/** World position of an avatar's card centre (tile + its own offset). */
const avatarWorld = (
  avatars: GameState["avatars"],
  seat: "p1" | "p2",
  boardOffset: { x: number; y: number },
  elevation: number,
): [number, number, number] | null => {
  const av = avatars?.[seat];
  const pos = av?.pos as [number, number] | null | undefined;
  if (!Array.isArray(pos)) return null;
  const off = av?.offset;
  const ox = Array.isArray(off) ? off[0] || 0 : 0;
  const oz = Array.isArray(off) ? off[1] || 0 : 0;
  return [
    boardOffset.x + pos[0] * TILE_SIZE + ox,
    elevation,
    boardOffset.y + pos[1] * TILE_SIZE + oz,
  ];
};

/**
 * Creates a simple hollow chevron ">" shape
 * Sized for visibility on the game board
 */
function createChevronGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();

  // Chevron pointing along +X axis (will be rotated to point toward target)
  const w = 0.07; // width (tip to back) - larger
  const h = 0.10; // height (top to bottom) - larger
  const t = 0.025; // thickness of the chevron arms - fatter

  // Outer path
  shape.moveTo(-w, h / 2); // Back top
  shape.lineTo(0, 0); // Tip (pointing right)
  shape.lineTo(-w, -h / 2); // Back bottom

  // Inner path (creates hollow)
  shape.lineTo(-w + t, -h / 2 + t * 1.0);
  shape.lineTo(-t * 0.8, 0);
  shape.lineTo(-w + t, h / 2 - t * 1.0);
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  // Rotate to lay flat on XZ plane (Y is up), chevron points along +X
  geometry.rotateX(-Math.PI / 2);

  return geometry;
}

// Shared geometry instance for all chevrons
const sharedChevronGeometry = createChevronGeometry();

/**
 * Single chevron that points toward target
 */
function Chevron({
  position,
  rotation,
  color,
  opacity,
}: {
  position: [number, number, number];
  rotation: number;
  color: string;
  opacity: number;
}) {
  return (
    <mesh
      position={position}
      rotation={[0, rotation, 0]}
      geometry={sharedChevronGeometry}
      renderOrder={10500}
    >
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthTest={false}
      />
    </mesh>
  );
}

/**
 * Animated chevron strip between two 3D points.
 * Creates a flowing ">>>" effect from start toward end (target).
 */
function ChevronStrip({
  start,
  end,
  color,
  animationSpeed = 3.0,
}: {
  start: [number, number, number];
  end: [number, number, number];
  color: string;
  animationSpeed?: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  const { positions, rotation, chevronCount } = useMemo(() => {
    const startVec = new THREE.Vector3(...start);
    const endVec = new THREE.Vector3(...end);
    const direction = new THREE.Vector3().subVectors(endVec, startVec);
    const lineLength = direction.length();
    direction.normalize();

    // Calculate rotation angle around Y axis
    // The chevron geometry points along +X, so we need to rotate from +X to our direction
    const angle = -Math.atan2(direction.z, direction.x);

    // Spacing between chevrons (0.08 units apart for larger chevrons)
    const spacing = 0.08;
    const count = Math.max(3, Math.floor(lineLength / spacing));

    // Calculate positions for each chevron along the line
    // Interpolate between start and end (which should already be at card height)
    const chevronPositions: [number, number, number][] = [];

    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const pos = new THREE.Vector3().lerpVectors(startVec, endVec, t);
      chevronPositions.push([pos.x, pos.y, pos.z]);
    }

    return {
      positions: chevronPositions,
      rotation: angle,
      chevronCount: count,
    };
  }, [start, end]);

  // Animate opacity wave flowing from start to end (toward target)
  useFrame((state) => {
    if (!groupRef.current) return;

    const time = state.clock.elapsedTime * animationSpeed;

    groupRef.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      if (mesh.material && "opacity" in mesh.material) {
        // Wave flows from start (i=0) toward end (i=max)
        const wavePosition = (time % chevronCount) - i;

        // Create a smooth traveling wave
        let opacity: number;
        if (wavePosition >= 0 && wavePosition < 2) {
          // Bright part of wave
          opacity = 0.95 - Math.abs(wavePosition - 1) * 0.35;
        } else if (wavePosition >= -1.5 && wavePosition < 0) {
          // Leading edge fading in
          opacity = 0.5 + (wavePosition + 1.5) * 0.2;
        } else {
          // Dim base state
          opacity = 0.4;
        }

        (mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
      }
    });
    // Decorative wave: ride the shared ~12fps cosmetic pump instead of
    // invalidate() so a spell left pending doesn't render the whole scene at
    // display refresh rate for minutes (frameloop="demand").
    requestCosmeticFrame();
  });

  return (
    <group ref={groupRef}>
      {positions.map((pos, i) => (
        <Chevron
          key={i}
          position={pos}
          rotation={rotation}
          color={color}
          opacity={0.5}
        />
      ))}
    </group>
  );
}

/**
 * Renders flat connection lines for magic spell interactions.
 * Lines connect: spell location → caster → target
 * All lines are constrained to be flat on the board (constant Y elevation)
 */
export function MagicConnectionLines({
  pendingMagic,
  avatars,
  permanents,
  boardOffset,
}: MagicConnectionLinesProps) {
  const { spell, caster, target, tile } = pendingMagic;

  // Calculate world positions for all entities (card centers, not tile centers)
  const positions = useMemo(() => {
    const elevation = 0.25; // At card level (cards are raised above the board)

    // Spell card position (at tile center + owner offset)
    const [spellOffX, spellOffZ] = permanentOffset(
      permanents,
      spell.at,
      spell.index,
    );
    const spellX = boardOffset.x + tile.x * TILE_SIZE + spellOffX;
    const spellZ =
      boardOffset.y + tile.y * TILE_SIZE + getCardZOffset(spell.owner) + spellOffZ;
    const spellPos: [number, number, number] = [spellX, elevation, spellZ];

    // Caster position (if selected)
    let casterPos: [number, number, number] | null = null;
    if (caster) {
      if (caster.kind === "avatar") {
        casterPos = avatarWorld(avatars, caster.seat, boardOffset, elevation);
      } else if (caster.kind === "permanent") {
        const [px, py] = String(caster.at).split(",").map(Number);
        if (Number.isFinite(px) && Number.isFinite(py)) {
          const [ox, oz] = permanentOffset(permanents, caster.at, caster.index);
          const cx = boardOffset.x + px * TILE_SIZE + ox;
          const cz =
            boardOffset.y + py * TILE_SIZE + getCardZOffset(caster.owner) + oz;
          casterPos = [cx, elevation, cz];
        }
      } else if (caster.kind === "site") {
        // A site card is the tile itself, so it sits at the tile centre.
        const [px, py] = String(caster.at).split(",").map(Number);
        if (Number.isFinite(px) && Number.isFinite(py)) {
          casterPos = [
            boardOffset.x + px * TILE_SIZE,
            elevation,
            boardOffset.y + py * TILE_SIZE,
          ];
        }
      }
    }

    // No default caster: while the player is still choosing who casts, a
    // spell -> avatar strip would wrongly suggest the avatar is already it.

    // Target position (if selected)
    let targetPos: [number, number, number] | null = null;
    if (target) {
      if (target.kind === "location") {
        const [tx, ty] = String(target.at).split(",").map(Number);
        if (Number.isFinite(tx) && Number.isFinite(ty)) {
          const worldX = boardOffset.x + tx * TILE_SIZE;
          const worldZ = boardOffset.y + ty * TILE_SIZE;
          targetPos = [worldX, elevation, worldZ];
        }
      } else if (target.kind === "permanent") {
        const [tx, ty] = String(target.at).split(",").map(Number);
        if (Number.isFinite(tx) && Number.isFinite(ty)) {
          // Look up permanent owner from permanents data
          const cellItems = permanents[target.at];
          const targetPerm = cellItems?.[target.index];
          const targetOwner = targetPerm?.owner ?? spell.owner; // Fallback to spell owner
          const [ox, oz] = permanentOffset(permanents, target.at, target.index);
          const worldX = boardOffset.x + tx * TILE_SIZE + ox;
          const worldZ =
            boardOffset.y + ty * TILE_SIZE + getCardZOffset(targetOwner) + oz;
          targetPos = [worldX, elevation, worldZ];
        }
      } else if (target.kind === "avatar") {
        targetPos = avatarWorld(avatars, target.seat, boardOffset, elevation);
      } else if (target.kind === "projectile") {
        // For projectiles, use firstHit if available, otherwise use intended target
        const hitTarget = target.firstHit || target.intended;
        if (hitTarget) {
          // firstHit always has 'at' as CellKey for both permanents and avatars
          if ("at" in hitTarget) {
            const [tx, ty] = String(hitTarget.at).split(",").map(Number);
            if (Number.isFinite(tx) && Number.isFinite(ty)) {
              // Look up permanent owner from permanents data
              const cellItems = permanents[hitTarget.at];
              const hitIndex = hitTarget.index ?? 0;
              const hitPerm = cellItems?.[hitIndex];
              const hitOwner = hitPerm?.owner ?? spell.owner; // Fallback to spell owner
              if (hitTarget.kind === "permanent") {
                const [ox, oz] = permanentOffset(permanents, hitTarget.at, hitIndex);
                targetPos = [
                  boardOffset.x + tx * TILE_SIZE + ox,
                  elevation,
                  boardOffset.y + ty * TILE_SIZE + getCardZOffset(hitOwner) + oz,
                ];
              } else {
                // Avatar hit: find which avatar stands on that cell
                const seatHere = (["p1", "p2"] as const).find((s) => {
                  const p = avatars?.[s]?.pos as [number, number] | null | undefined;
                  return Array.isArray(p) && p[0] === tx && p[1] === ty;
                });
                targetPos = seatHere
                  ? avatarWorld(avatars, seatHere, boardOffset, elevation)
                  : [boardOffset.x + tx * TILE_SIZE, elevation, boardOffset.y + ty * TILE_SIZE];
              }
            }
          } else if ("seat" in hitTarget) {
            // intended target with seat (fallback for when firstHit not available)
            targetPos = avatarWorld(avatars, hitTarget.seat, boardOffset, elevation);
          }
        }
      }
    }

    return { spellPos, casterPos, targetPos };
  }, [avatars, permanents, boardOffset, tile, spell, caster, target]);

  // Don't render if we don't have necessary positions
  if (!positions.casterPos && !positions.targetPos) {
    return null;
  }

  // Use player color for the spell owner
  const ownerSeat = seatFromOwner(spell.owner);
  const playerColor = PLAYER_COLORS[ownerSeat];

  return (
    <group>
      {/* Chevron strip from spell to caster */}
      {positions.casterPos && (
        <ChevronStrip
          start={positions.spellPos}
          end={positions.casterPos}
          color={playerColor}
          animationSpeed={4.0}
        />
      )}

      {/* Chevron strip from caster to target */}
      {positions.casterPos && positions.targetPos && (
        <ChevronStrip
          start={positions.casterPos}
          end={positions.targetPos}
          color={playerColor}
          animationSpeed={3.5}
        />
      )}

      {/* Caster indicator - glowing dot */}
      {positions.casterPos && (
        <mesh position={positions.casterPos} renderOrder={10501}>
          <sphereGeometry args={[0.08, 16, 16]} />
          <meshBasicMaterial
            color={playerColor}
            transparent
            opacity={0.9}
            depthTest={false}
          />
        </mesh>
      )}

      {/* Target indicator - bulls-eye for selected target */}
      {positions.targetPos && target && (
        <TargetBullseye position={positions.targetPos} color={playerColor} />
      )}
    </group>
  );
}
