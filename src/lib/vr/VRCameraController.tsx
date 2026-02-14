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
  /** Distance from board center to user (meters) */
  userDistance?: number;
}

/**
 * Component that manages camera controls and VR origin positioning.
 * Uses XROrigin to position the VR user above and in front of the game board.
 */
export function VRCameraController({
  controlsRef,
  userHeight = 1.5,
  userDistance = 2.5,
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

  // Tilt user's view down toward the board (about 30 degrees)
  const tiltAngle = -0.5; // radians, ~30 degrees down
  const originRotation: [number, number, number] = [tiltAngle, 0, 0];

  // Debug: render colored cubes at known positions to verify VR rendering works
  const showDebug = session !== null;

  return (
    <>
      <XROrigin position={originPosition} rotation={originRotation} />
      {showDebug && (
        <group>
          {/* Red cube at origin */}
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
            <meshBasicMaterial color="red" />
          </mesh>
          {/* Green cube at board center */}
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[0.2, 0.2, 0.2]} />
            <meshBasicMaterial color="green" />
          </mesh>
          {/* Blue cube where cards should be */}
          <mesh position={[1, 0.05, 1]}>
            <boxGeometry args={[0.5, 0.1, 0.7]} />
            <meshBasicMaterial color="blue" />
          </mesh>
        </group>
      )}
    </>
  );
}

export default VRCameraController;
