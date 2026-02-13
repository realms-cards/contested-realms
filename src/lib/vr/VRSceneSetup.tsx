"use client";

import { useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import { useEffect, useRef } from "react";
import * as THREE from "three";

interface VRSceneSetupProps {
  /** Height offset for the board in VR (meters) */
  boardHeight?: number;
  /** Distance from player to board center (meters) */
  boardDistance?: number;
  /** Board tilt angle in degrees (0 = flat, 90 = vertical) */
  boardTilt?: number;
}

/**
 * Component to setup the scene for VR viewing.
 * Adjusts camera and scene positioning for comfortable VR experience.
 */
export function VRSceneSetup({
  boardHeight = 0.8,
  boardDistance = 0.6,
  boardTilt = 30,
}: VRSceneSetupProps) {
  const session = useXR((state) => state.session);
  const { camera, scene } = useThree();
  const previousCameraPosition = useRef<THREE.Vector3 | null>(null);
  const previousCameraRotation = useRef<THREE.Euler | null>(null);

  useEffect(() => {
    if (!session) {
      // Restore camera position when exiting VR
      if (previousCameraPosition.current && previousCameraRotation.current) {
        camera.position.copy(previousCameraPosition.current);
        camera.rotation.copy(previousCameraRotation.current);
        previousCameraPosition.current = null;
        previousCameraRotation.current = null;
      }
      return;
    }

    // Save current camera position before entering VR
    previousCameraPosition.current = camera.position.clone();
    previousCameraRotation.current = camera.rotation.clone();

    // In VR, position the scene so the board is at a comfortable viewing position
    // The XR origin is at the user's floor level, so we need to position content accordingly
    
    // Find the board/playmat group and adjust its position
    const boardGroup = scene.getObjectByName("game-board-group");
    if (boardGroup) {
      // Position board at comfortable height and distance
      boardGroup.position.set(0, boardHeight, -boardDistance);
      
      // Tilt the board for easier viewing
      const tiltRad = THREE.MathUtils.degToRad(boardTilt);
      boardGroup.rotation.set(-tiltRad, 0, 0);
    }
  }, [session, camera, scene, boardHeight, boardDistance, boardTilt]);

  return null;
}

export default VRSceneSetup;
