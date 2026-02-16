"use client";

import { useThree } from "@react-three/fiber";
import { useXR, XROrigin } from "@react-three/xr";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

interface VRCameraControllerProps {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  /** Height of VR user above the board (meters) */
  userHeight?: number;
  /** Distance behind board center to user position (meters) */
  userDistance?: number;
}

/**
 * Component that manages camera controls and VR origin positioning.
 * Uses XROrigin to position the VR user behind and above the game board,
 * like sitting at a table. The board (7×5 grid) spans ~10×7 world units
 * centered at the origin, so the user must be beyond Z=3.5 to see it.
 */
export function VRCameraController({
  controlsRef,
  userHeight = 3.0,
  userDistance = 5.5,
}: VRCameraControllerProps) {
  const session = useXR((state) => state.session);
  const { camera } = useThree();
  const savedState = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
    controlsEnabled: boolean;
  } | null>(null);

  useEffect(() => {
    const controls = controlsRef.current;

    if (session) {
      // Entering VR - save current state and disable OrbitControls
      if (controls) {
        savedState.current = {
          position: camera.position.clone(),
          target: controls.target.clone(),
          controlsEnabled: controls.enabled,
        };
        controls.enabled = false;
      }
      console.log("[VR] Entered VR mode, OrbitControls disabled");
    } else {
      // Exiting VR - restore previous state
      if (savedState.current && controls) {
        camera.position.copy(savedState.current.position);
        controls.target.copy(savedState.current.target);
        controls.enabled = savedState.current.controlsEnabled;
        controls.update();
        savedState.current = null;
        console.log("[VR] Exited VR mode, OrbitControls restored");
      }
    }
  }, [session, camera, controlsRef]);

  // Position VR origin so user stands behind the board looking down at it
  // The board is at Y=0, so we position the user above and behind it
  // Looking toward -Z (forward in the scene's coordinate system)
  const originPosition: [number, number, number] = [
    0,
    userHeight,
    userDistance,
  ];

  // Mild downward tilt so the board is in the user's natural field of view
  // Keep it subtle — on AVP, aggressive tilt feels disorienting with passthrough
  const tiltAngle = -0.3; // radians, ~17 degrees down
  const originRotation: [number, number, number] = [tiltAngle, 0, 0];

  return <XROrigin position={originPosition} rotation={originRotation} />;
}

export default VRCameraController;
