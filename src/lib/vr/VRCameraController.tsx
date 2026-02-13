"use client";

import { useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

interface VRCameraControllerProps {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  /** Board height in VR space (meters from floor) */
  boardHeight?: number;
  /** Distance from player to board center (meters) */
  boardDistance?: number;
}

/**
 * Component that manages camera controls in VR mode.
 * Disables OrbitControls when in VR and restores them when exiting.
 */
export function VRCameraController({
  controlsRef,
  boardHeight = 0.9,
  boardDistance = 0.5,
}: VRCameraControllerProps) {
  const session = useXR((state) => state.session);
  const { camera, scene } = useThree();
  const savedState = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
    controlsEnabled: boolean;
  } | null>(null);

  useEffect(() => {
    const controls = controlsRef.current;

    if (session) {
      // Entering VR - save current state and disable controls
      if (controls) {
        savedState.current = {
          position: camera.position.clone(),
          target: controls.target.clone(),
          controlsEnabled: controls.enabled,
        };
        controls.enabled = false;
      }

      // Find and reposition the board group for VR viewing
      // The board should be at a comfortable height and distance
      const boardGroup = scene.getObjectByName("playmat-mesh");
      if (boardGroup) {
        // Store original transform
        const parent = boardGroup.parent;
        if (parent && !parent.userData.vrOriginalPosition) {
          parent.userData.vrOriginalPosition = parent.position.clone();
          parent.userData.vrOriginalRotation = parent.rotation.clone();
        }
      }
    } else {
      // Exiting VR - restore previous state
      if (savedState.current && controls) {
        camera.position.copy(savedState.current.position);
        controls.target.copy(savedState.current.target);
        controls.enabled = savedState.current.controlsEnabled;
        controls.update();
        savedState.current = null;
      }

      // Restore board position
      const boardGroup = scene.getObjectByName("playmat-mesh");
      if (boardGroup) {
        const parent = boardGroup.parent;
        if (parent?.userData.vrOriginalPosition) {
          parent.position.copy(parent.userData.vrOriginalPosition);
          parent.rotation.copy(parent.userData.vrOriginalRotation);
          delete parent.userData.vrOriginalPosition;
          delete parent.userData.vrOriginalRotation;
        }
      }
    }
  }, [session, camera, scene, controlsRef, boardHeight, boardDistance]);

  return null;
}

export default VRCameraController;
