"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import { useRef } from "react";
import * as THREE from "three";

interface VRHand3DProps {
  /** Position offset for the hand cards in VR */
  positionOffset?: [number, number, number];
  /** Whether this is the player's own hand (follows camera) */
  followCamera?: boolean;
  children?: React.ReactNode;
}

/**
 * Wrapper component for Hand3D that repositions cards for VR viewing.
 * In VR, the player's hand is positioned at a comfortable viewing angle
 * below and in front of the user's view.
 */
export function VRHand3D({
  positionOffset = [0, -0.3, -0.4],
  followCamera = true,
  children,
}: VRHand3DProps) {
  const session = useXR((state) => state.session);
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();

  useFrame(() => {
    if (!session || !followCamera || !groupRef.current) return;

    // Position the hand relative to the camera in VR
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    // Position hand below and in front of the camera
    const handPosition = new THREE.Vector3(
      camera.position.x + positionOffset[0],
      camera.position.y + positionOffset[1],
      camera.position.z + positionOffset[2],
    );

    // Apply camera's horizontal rotation but keep cards level
    const cameraEuler = new THREE.Euler().setFromQuaternion(camera.quaternion);
    handPosition.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraEuler.y);

    groupRef.current.position.copy(handPosition);

    // Face the camera horizontally but tilt slightly for readability
    groupRef.current.rotation.set(
      -Math.PI / 6, // Tilt 30 degrees toward player
      cameraEuler.y + Math.PI, // Face player
      0,
    );
  });

  if (!session) {
    // When not in VR, render children normally
    return children;
  }

  return (
    <group ref={groupRef} name="vr-hand-container">
      {children}
    </group>
  );
}

export default VRHand3D;
