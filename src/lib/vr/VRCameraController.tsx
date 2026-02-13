"use client";

import { useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

interface VRCameraControllerProps {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  /** Board height in VR space (meters below eye level) */
  boardHeight?: number;
  /** Distance from player to board center (meters) */
  boardDistance?: number;
}

/**
 * Component that manages camera controls and scene positioning in VR mode.
 * In VR, we move the entire scene so the board appears at a comfortable
 * viewing position in front of the user (who starts at world origin).
 */
export function VRCameraController({
  controlsRef,
  boardHeight = 0.7,
  boardDistance = 0.6,
}: VRCameraControllerProps) {
  const session = useXR((state) => state.session);
  const { camera, scene } = useThree();
  const savedState = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
    controlsEnabled: boolean;
  } | null>(null);
  const vrSceneOffset = useRef<THREE.Group | null>(null);

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

      // Create a wrapper group to offset the entire scene for VR viewing
      // In VR, the user is at origin (0, ~1.6, 0) looking at -Z
      // We need to move the scene so the board is in front and below the user
      if (!vrSceneOffset.current) {
        vrSceneOffset.current = new THREE.Group();
        vrSceneOffset.current.name = "vr-scene-offset";

        // Collect all scene children except camera-related objects
        const childrenToMove: THREE.Object3D[] = [];
        scene.children.forEach((child) => {
          if (
            child !== camera &&
            child.type !== "XROrigin" &&
            child.name !== "vr-scene-offset" &&
            !child.name.includes("XR")
          ) {
            childrenToMove.push(child);
          }
        });

        // Move children into the offset group
        const offsetGroup = vrSceneOffset.current;
        for (const child of childrenToMove) {
          // @ts-expect-error - Three.js type conflicts between @types/three versions
          offsetGroup.attach(child);
        }

        scene.add(offsetGroup);
      }

      // Position the scene so the board is at a comfortable VR viewing position
      // User stands at origin, board should be:
      // - In front (negative Z in VR)
      // - Below eye level (negative Y offset)
      // - Slightly tilted toward the user for better viewing
      vrSceneOffset.current.position.set(0, -boardHeight, -boardDistance);
      vrSceneOffset.current.rotation.set(-0.3, 0, 0); // Tilt board toward user

      console.log("[VR] Scene repositioned for VR viewing:", {
        position: vrSceneOffset.current.position,
        rotation: vrSceneOffset.current.rotation,
      });
    } else {
      // Exiting VR - restore previous state
      if (savedState.current && controls) {
        camera.position.copy(savedState.current.position);
        controls.target.copy(savedState.current.target);
        controls.enabled = savedState.current.controlsEnabled;
        controls.update();
        savedState.current = null;
      }

      // Restore scene structure - move children back to scene root
      if (vrSceneOffset.current) {
        const childrenToRestore = [...vrSceneOffset.current.children];
        childrenToRestore.forEach((child) => {
          scene.add(child);
        });
        scene.remove(vrSceneOffset.current);
        vrSceneOffset.current = null;
        console.log("[VR] Scene restored to normal viewing");
      }
    }
  }, [session, camera, scene, controlsRef, boardHeight, boardDistance]);

  return null;
}

export default VRCameraController;
