import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { TargetBullseye } from "@/lib/game/components/TargetBullseye";
import { TILE_SIZE, PLAYER_COLORS } from "@/lib/game/constants";
import type { GameState } from "@/lib/game/store/types";
import { seatFromOwner } from "@/lib/game/store/utils/boardHelpers";

type MagicConnectionLinesProps = {
  pendingMagic: NonNullable<GameState["pendingMagic"]>;
  avatars: GameState["avatars"];
  boardOffset: { x: number; y: number };
};

/**
 * Component to render a line between two 3D points using a thin cylinder with animated pulse.
 * This ensures the line is visible and properly oriented in 3D space.
 */
function ConnectionLine({
  start,
  end,
  color,
  pulseSpeed = 2.0,
}: {
  start: [number, number, number];
  end: [number, number, number];
  color: string;
  pulseSpeed?: number;
}) {
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  // Animate the pulse effect
  useFrame((state) => {
    if (materialRef.current) {
      const pulse = Math.sin(state.clock.elapsedTime * pulseSpeed) * 0.5 + 0.5;
      materialRef.current.opacity = 0.4 + pulse * 0.5; // Oscillate between 0.4 and 0.9
    }
  });
  const { position, rotation, length } = useMemo(() => {
    const startVec = new THREE.Vector3(...start);
    const endVec = new THREE.Vector3(...end);

    // Calculate midpoint
    const midpoint = new THREE.Vector3()
      .addVectors(startVec, endVec)
      .multiplyScalar(0.5);

    // Calculate length
    const lineLength = startVec.distanceTo(endVec);

    // Calculate rotation to align cylinder with line
    const direction = new THREE.Vector3()
      .subVectors(endVec, startVec)
      .normalize();

    // Cylinder is oriented along Y axis by default, we need to rotate it
    // to point in the direction of our line
    const quaternion = new THREE.Quaternion();

    // Create a rotation from the default up vector (0,1,0) to our direction
    // But first we need to project direction onto XZ plane for horizontal line
    const up = new THREE.Vector3(0, 1, 0);

    // For a line in 3D space, we rotate from Y axis to the direction vector
    quaternion.setFromUnitVectors(up, direction);

    const euler = new THREE.Euler().setFromQuaternion(quaternion);

    return {
      position: [midpoint.x, midpoint.y, midpoint.z] as [
        number,
        number,
        number
      ],
      rotation: [euler.x, euler.y, euler.z] as [number, number, number],
      length: lineLength,
    };
  }, [start, end]);

  return (
    <mesh position={position} rotation={rotation} renderOrder={10500}>
      <cylinderGeometry args={[0.04, 0.04, length, 8]} />
      <meshBasicMaterial
        ref={materialRef}
        color={color}
        transparent
        opacity={0.8}
        depthTest={false}
      />
    </mesh>
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
  boardOffset,
}: MagicConnectionLinesProps) {
  const { spell, caster, target, tile } = pendingMagic;

  // Calculate world positions for all entities
  const positions = useMemo(() => {
    const elevation = 0.05; // Slightly above board surface to avoid z-fighting

    // Spell tile position (always available)
    const spellX = boardOffset.x + tile.x * TILE_SIZE;
    const spellZ = boardOffset.y + tile.y * TILE_SIZE;
    const spellPos: [number, number, number] = [spellX, elevation, spellZ];

    // Caster position (if selected)
    let casterPos: [number, number, number] | null = null;
    if (caster) {
      if (caster.kind === "avatar") {
        const avatarPos = avatars?.[caster.seat]?.pos as
          | [number, number]
          | null;
        if (Array.isArray(avatarPos)) {
          const cx = boardOffset.x + avatarPos[0] * TILE_SIZE;
          const cz = boardOffset.y + avatarPos[1] * TILE_SIZE;
          casterPos = [cx, elevation, cz];
        }
      } else if (caster.kind === "permanent") {
        const [px, py] = String(caster.at).split(",").map(Number);
        if (Number.isFinite(px) && Number.isFinite(py)) {
          const cx = boardOffset.x + px * TILE_SIZE;
          const cz = boardOffset.y + py * TILE_SIZE;
          casterPos = [cx, elevation, cz];
        }
      }
    }

    // If no explicit caster, use spell owner's avatar as default
    if (!casterPos) {
      const ownerSeat = seatFromOwner(spell.owner);
      const avatarPos = avatars?.[ownerSeat]?.pos as [number, number] | null;
      if (Array.isArray(avatarPos)) {
        const cx = boardOffset.x + avatarPos[0] * TILE_SIZE;
        const cz = boardOffset.y + avatarPos[1] * TILE_SIZE;
        casterPos = [cx, elevation, cz];
      }
    }

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
          const worldX = boardOffset.x + tx * TILE_SIZE;
          const worldZ = boardOffset.y + ty * TILE_SIZE;
          targetPos = [worldX, elevation, worldZ];
        }
      } else if (target.kind === "avatar") {
        const avatarPos = avatars?.[target.seat]?.pos as
          | [number, number]
          | null;
        if (Array.isArray(avatarPos)) {
          const worldX = boardOffset.x + avatarPos[0] * TILE_SIZE;
          const worldZ = boardOffset.y + avatarPos[1] * TILE_SIZE;
          targetPos = [worldX, elevation, worldZ];
        }
      } else if (target.kind === "projectile") {
        // For projectiles, use firstHit if available, otherwise use intended target
        const hitTarget = target.firstHit || target.intended;
        if (hitTarget) {
          // firstHit always has 'at' as CellKey for both permanents and avatars
          if ("at" in hitTarget) {
            const [tx, ty] = String(hitTarget.at).split(",").map(Number);
            if (Number.isFinite(tx) && Number.isFinite(ty)) {
              const worldX = boardOffset.x + tx * TILE_SIZE;
              const worldZ = boardOffset.y + ty * TILE_SIZE;
              targetPos = [worldX, elevation, worldZ];
            }
          } else if ("seat" in hitTarget) {
            // intended target with seat (fallback for when firstHit not available)
            const avatarPos = avatars?.[hitTarget.seat]?.pos as
              | [number, number]
              | null;
            if (Array.isArray(avatarPos)) {
              const worldX = boardOffset.x + avatarPos[0] * TILE_SIZE;
              const worldZ = boardOffset.y + avatarPos[1] * TILE_SIZE;
              targetPos = [worldX, elevation, worldZ];
            }
          }
        }
      }
    }

    return { spellPos, casterPos, targetPos };
  }, [avatars, boardOffset, tile, spell, caster, target]);

  // Don't render if we don't have necessary positions
  if (!positions.casterPos && !positions.targetPos) {
    return null;
  }

  // Use player color for the spell owner
  const ownerSeat = seatFromOwner(spell.owner);
  const playerColor = PLAYER_COLORS[ownerSeat];

  return (
    <group>
      {/* Line from spell to caster */}
      {positions.casterPos && (
        <ConnectionLine
          start={positions.spellPos}
          end={positions.casterPos}
          color={playerColor}
          pulseSpeed={3.0}
        />
      )}

      {/* Line from caster to target */}
      {positions.casterPos && positions.targetPos && (
        <ConnectionLine
          start={positions.casterPos}
          end={positions.targetPos}
          color={playerColor}
          pulseSpeed={2.5}
        />
      )}

      {/* Caster indicator - glowing dot */}
      {positions.casterPos && (
        <mesh position={positions.casterPos}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color={playerColor} transparent opacity={0.7} />
        </mesh>
      )}

      {/* Target indicator - bulls-eye for selected target */}
      {positions.targetPos && target && (
        <TargetBullseye position={positions.targetPos} color={playerColor} />
      )}
    </group>
  );
}
