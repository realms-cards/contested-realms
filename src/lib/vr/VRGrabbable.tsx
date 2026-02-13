"use client";

import { useFrame } from "@react-three/fiber";
import { useXR, useXRInputSourceState } from "@react-three/xr";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import * as THREE from "three";

// Context for VR grab state
interface VRGrabContextValue {
  isGrabbing: boolean;
  grabbedObject: THREE.Object3D | null;
  grabHand: "left" | "right" | null;
}

const VRGrabContext = createContext<VRGrabContextValue>({
  isGrabbing: false,
  grabbedObject: null,
  grabHand: null,
});

export const useVRGrab = () => useContext(VRGrabContext);

interface VRGrabbableProps {
  children: ReactNode;
  onGrab?: (hand: "left" | "right") => void;
  onRelease?: (position: THREE.Vector3) => void;
  onHover?: (hovering: boolean) => void;
  disabled?: boolean;
  /** Distance from controller/hand to trigger grab (meters) */
  grabRadius?: number;
  /** User data to attach to the grabbable group */
  userData?: Record<string, unknown>;
}

export interface VRGrabbableRef {
  group: THREE.Group | null;
  isGrabbed: boolean;
}

/**
 * VRGrabbable wrapper component that makes children interactive in VR.
 * Supports both controller grip button and hand pinch gesture.
 */
export const VRGrabbable = forwardRef<VRGrabbableRef, VRGrabbableProps>(
  function VRGrabbable(
    {
      children,
      onGrab,
      onRelease,
      onHover,
      disabled = false,
      grabRadius = 0.1,
      userData,
    },
    ref,
  ) {
    const groupRef = useRef<THREE.Group>(null);
    const session = useXR((state) => state.session);
    const leftController = useXRInputSourceState("controller", "left");
    const rightController = useXRInputSourceState("controller", "right");

    const [isGrabbed, setIsGrabbed] = useState(false);
    const [grabHand, setGrabHand] = useState<"left" | "right" | null>(null);
    const [isHovered, setIsHovered] = useState(false);

    // Store the offset from controller to object when grabbed
    const grabOffset = useRef(new THREE.Vector3());
    const initialRotation = useRef(new THREE.Quaternion());

    // Expose ref
    useImperativeHandle(ref, () => ({
      group: groupRef.current,
      isGrabbed,
    }));

    // Apply user data to group
    useEffect(() => {
      if (groupRef.current && userData) {
        Object.assign(groupRef.current.userData, userData);
      }
    }, [userData]);

    // Get controller world position
    const getControllerPosition = useCallback(
      (hand: "left" | "right"): THREE.Vector3 | null => {
        const controller = hand === "left" ? leftController : rightController;
        if (!controller?.object) return null;

        const position = new THREE.Vector3();
        controller.object.getWorldPosition(position);
        return position;
      },
      [leftController, rightController],
    );

    // Check if controller is within grab radius
    const isWithinGrabRadius = useCallback(
      (hand: "left" | "right"): boolean => {
        if (!groupRef.current) return false;

        const controllerPos = getControllerPosition(hand);
        if (!controllerPos) return false;

        const objectPos = new THREE.Vector3();
        groupRef.current.getWorldPosition(objectPos);

        return controllerPos.distanceTo(objectPos) < grabRadius;
      },
      [getControllerPosition, grabRadius],
    );

    // Handle grab start
    const handleGrabStart = useCallback(
      (hand: "left" | "right") => {
        if (disabled || isGrabbed) return;
        if (!isWithinGrabRadius(hand)) return;
        if (!groupRef.current) return;

        const controllerPos = getControllerPosition(hand);
        if (!controllerPos) return;

        // Calculate offset from controller to object
        const objectPos = new THREE.Vector3();
        groupRef.current.getWorldPosition(objectPos);
        grabOffset.current.copy(objectPos).sub(controllerPos);

        // Store initial rotation
        groupRef.current.getWorldQuaternion(initialRotation.current);

        setIsGrabbed(true);
        setGrabHand(hand);
        onGrab?.(hand);
      },
      [disabled, isGrabbed, isWithinGrabRadius, getControllerPosition, onGrab],
    );

    // Handle grab end
    const handleGrabEnd = useCallback(() => {
      if (!isGrabbed || !groupRef.current) return;

      const position = new THREE.Vector3();
      groupRef.current.getWorldPosition(position);

      setIsGrabbed(false);
      setGrabHand(null);
      onRelease?.(position);
    }, [isGrabbed, onRelease]);

    // Update hover state
    useFrame(() => {
      if (disabled || !session || isGrabbed) return;

      const leftHover = isWithinGrabRadius("left");
      const rightHover = isWithinGrabRadius("right");
      const hovering = leftHover || rightHover;

      if (hovering !== isHovered) {
        setIsHovered(hovering);
        onHover?.(hovering);
      }
    });

    // Update grabbed object position
    useFrame(() => {
      if (!isGrabbed || !grabHand || !groupRef.current) return;

      const controllerPos = getControllerPosition(grabHand);
      if (!controllerPos) return;

      // Move object to follow controller with offset
      const newPos = controllerPos.clone().add(grabOffset.current);
      groupRef.current.position.copy(newPos);
    });

    // Provide context for children
    const contextValue: VRGrabContextValue = {
      isGrabbing: isGrabbed,
      grabbedObject: isGrabbed ? groupRef.current : null,
      grabHand,
    };

    return (
      <VRGrabContext.Provider value={contextValue}>
        <group
          ref={groupRef}
          onPointerDown={(e) => {
            // Handle VR grab via pointer events (squeeze/select)
            if (session && !disabled) {
              // Determine hand from pointer ID or event
              const hand = e.pointerId % 2 === 0 ? "left" : "right";
              handleGrabStart(hand);
            }
          }}
          onPointerUp={() => {
            if (session && isGrabbed) {
              handleGrabEnd();
            }
          }}
        >
          {children}
        </group>
      </VRGrabContext.Provider>
    );
  },
);

export default VRGrabbable;
