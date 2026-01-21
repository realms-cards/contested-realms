"use client";

import { useGLTF } from "@react-three/drei";
import { type ThreeEvent, useThree } from "@react-three/fiber";
import { RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { useRef, useMemo, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { useGameStore, type GemToken } from "@/lib/game/store";
import { GEM_COLORS } from "@/lib/game/store/gemTokenState";

const GEM_MODEL_PATH = "/3dmodels/gems/round_cut_red_sapphire.glb";
const GEM_SCALE = 0.06; // Half size for better board fit
const GEM_Y_OFFSET = 0; // Board surface is at Y=0

// Preload the model
useGLTF.preload(GEM_MODEL_PATH);

interface GemToken3DProps {
  token: GemToken;
  onContextMenu?: (e: ThreeEvent<PointerEvent>, tokenId: string) => void;
}

export function GemToken3D({ token, onContextMenu }: GemToken3DProps) {
  const { scene } = useGLTF(GEM_MODEL_PATH);
  const rigidBodyRef = useRef<RapierRigidBody>(null);
  const groupRef = useRef<THREE.Group>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 });
  const { camera, gl } = useThree();

  const moveGemToken = useGameStore((s) => s.moveGemToken);
  const actorKey = useGameStore((s) => s.actorKey);

  // Clone the scene, apply color tint, and offset so bottom sits on Y=0
  const { coloredScene, yOffset } = useMemo(() => {
    const cloned = scene.clone(true);
    const colorDef = GEM_COLORS.find((c) => c.id === token.color);
    const color = new THREE.Color(colorDef?.hex ?? "#dc2626");

    // Compute bounding box to find the bottom of the gem
    const box = new THREE.Box3().setFromObject(cloned);
    const bottomY = box.min.y;

    cloned.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        // Enable shadows
        child.castShadow = true;
        child.receiveShadow = true;
        // Create a fresh material with the selected color (don't clone original red)
        const mat = new THREE.MeshStandardMaterial({
          color,
          emissive: color.clone().multiplyScalar(0.1),
          metalness: 0.3,
          roughness: 0.2,
          transparent: true,
          opacity: 0.9,
          envMapIntensity: 1.0,
        });
        child.material = mat;
      }
    });

    // Return offset to move gem up so its bottom touches Y=0
    return { coloredScene: cloned, yOffset: -bottomY };
  }, [scene, token.color]);

  // Sync position from state to physics body when not dragging
  useEffect(() => {
    if (rigidBodyRef.current && !isDragging) {
      rigidBodyRef.current.setTranslation(
        { x: token.position.x, y: token.position.y, z: token.position.z },
        true,
      );
      rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      rigidBodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }, [token.position, isDragging]);

  // Raycast to find world position on the board plane
  const getWorldPosition = useCallback(
    (clientX: number, clientY: number) => {
      const rect = gl.domElement.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((clientY - rect.top) / rect.height) * 2 + 1;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

      // Intersect with a horizontal plane at board surface (y=0)
      // Plane equation: normal.dot(point) + constant = 0
      // For y=0 plane: (0,1,0).dot(p) + 0 = 0, so constant should be 0
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const target = new THREE.Vector3();
      raycaster.ray.intersectPlane(plane, target);

      return target;
    },
    [camera, gl],
  );

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return; // Only left click
    e.stopPropagation();

    // Check ownership in online play
    if (actorKey && actorKey !== token.owner) return;

    // Calculate offset between click point and gem center
    const clickWorldPos = getWorldPosition(
      e.nativeEvent.clientX,
      e.nativeEvent.clientY,
    );
    if (clickWorldPos) {
      dragOffsetRef.current = {
        x: token.position.x - clickWorldPos.x,
        z: token.position.z - clickWorldPos.z,
      };
    }

    setIsDragging(true);

    // Capture pointer for smooth dragging
    (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
  };

  // Global pointer move handler when dragging
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: PointerEvent) => {
      if (!rigidBodyRef.current) return;
      const worldPos = getWorldPosition(e.clientX, e.clientY);
      if (worldPos) {
        // Apply the offset so gem stays under cursor where it was clicked
        rigidBodyRef.current.setTranslation(
          {
            x: worldPos.x + dragOffsetRef.current.x,
            y: GEM_Y_OFFSET,
            z: worldPos.z + dragOffsetRef.current.z,
          },
          true,
        );
      }
    };

    const handleUp = () => {
      setIsDragging(false);
      if (rigidBodyRef.current) {
        const pos = rigidBodyRef.current.translation();
        moveGemToken(token.id, { x: pos.x, y: pos.y, z: pos.z });
      }
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [isDragging, getWorldPosition, moveGemToken, token.id]);

  const handleContextMenu = (e: ThreeEvent<PointerEvent>) => {
    e.nativeEvent.preventDefault();
    e.stopPropagation();
    onContextMenu?.(e, token.id);
  };

  return (
    <RigidBody
      ref={rigidBodyRef}
      type="kinematicPosition"
      position={[token.position.x, token.position.y, token.position.z]}
      colliders={false}
    >
      <group
        ref={groupRef}
        scale={[GEM_SCALE, GEM_SCALE, GEM_SCALE]}
        onPointerDown={handlePointerDown}
        onContextMenu={handleContextMenu}
      >
        {/* Offset the gem model so its bottom sits on Y=0 */}
        <primitive object={coloredScene} position={[0, yOffset, 0]} />
      </group>
    </RigidBody>
  );
}

export default GemToken3D;
