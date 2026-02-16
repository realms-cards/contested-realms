"use client";

import { Text } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useXR, useXRInputSourceState } from "@react-three/xr";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface RadialMenuItem {
  id: string;
  label: string;
  icon?: string;
  color?: string;
  disabled?: boolean;
}

interface VRRadialMenuProps {
  items: RadialMenuItem[];
  onSelect?: (itemId: string) => void;
  onClose?: () => void;
  /** Which hand's thumbstick controls the menu (Quest) */
  controlHand?: "left" | "right";
  /** Menu radius in meters */
  radius?: number;
  /** Distance from controller */
  distance?: number;
  /** Use gaze-based selection instead of thumbstick (for AVP) */
  useGazeSelection?: boolean;
  /** World position for gaze-based menu (AVP) */
  menuWorldPosition?: THREE.Vector3;
}

/** Auto-close timeout for gaze menu in ms */
const GAZE_MENU_TIMEOUT_MS = 8000;

/**
 * VR Radial Menu - Context action menu with dual input modes:
 * - Quest: Squeeze to open, thumbstick to navigate, squeeze release to confirm
 * - AVP: Gaze at items to highlight, pinch to select, auto-close on timeout
 */
export function VRRadialMenu({
  items,
  onSelect,
  onClose,
  controlHand = "right",
  radius = 0.15,
  distance = 0.3,
  useGazeSelection = false,
  menuWorldPosition,
}: VRRadialMenuProps) {
  const session = useXR((state) => state.session);
  const controller = useXRInputSourceState("controller", controlHand);

  const [isOpen, setIsOpen] = useState(useGazeSelection);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState(
    () => menuWorldPosition ?? new THREE.Vector3(),
  );

  const groupRef = useRef<THREE.Group>(null);
  const lastInteractionTime = useRef(Date.now());

  // Calculate segment angle for each item
  const segmentAngle = (2 * Math.PI) / items.length;

  // --- Quest: Thumbstick-based navigation ---

  // Get thumbstick values from gamepad
  const getThumbstick = useCallback((): { x: number; y: number } => {
    if (useGazeSelection) return { x: 0, y: 0 };
    const gamepad = controller?.inputSource?.gamepad;
    if (!gamepad?.axes || gamepad.axes.length < 4) {
      return { x: 0, y: 0 };
    }
    // Thumbstick axes are typically at indices 2 and 3
    return {
      x: gamepad.axes[2] ?? 0,
      y: gamepad.axes[3] ?? 0,
    };
  }, [controller, useGazeSelection]);

  // Determine selected item based on thumbstick angle
  const getSelectedFromThumbstick = useCallback(
    (x: number, y: number): number | null => {
      const magnitude = Math.sqrt(x * x + y * y);
      if (magnitude < 0.5) return null; // Dead zone

      // Calculate angle (0 = up, clockwise)
      let angle = Math.atan2(x, -y);
      if (angle < 0) angle += 2 * Math.PI;

      // Find which segment this angle falls into
      const index = Math.floor(angle / segmentAngle);
      return Math.min(index, items.length - 1);
    },
    [segmentAngle, items.length],
  );

  // --- AVP: Gaze-based interaction handlers ---

  const handleItemPointerEnter = useCallback(
    (index: number) => {
      if (!useGazeSelection) return;
      setSelectedIndex(index);
      lastInteractionTime.current = Date.now();
    },
    [useGazeSelection],
  );

  const handleItemPointerLeave = useCallback(
    (index: number) => {
      if (!useGazeSelection) return;
      setSelectedIndex((current) => (current === index ? null : current));
    },
    [useGazeSelection],
  );

  const handleItemClick = useCallback(
    (e: ThreeEvent<MouseEvent>, item: RadialMenuItem) => {
      if (!useGazeSelection) return;
      e.stopPropagation();
      if (!item.disabled) {
        onSelect?.(item.id);
        onClose?.();
      }
    },
    [useGazeSelection, onSelect, onClose],
  );

  // --- Frame update ---

  useFrame(() => {
    if (!session) return;

    if (useGazeSelection) {
      // Gaze menu: position at world position, face the camera
      if (groupRef.current && menuWorldPosition) {
        groupRef.current.position.copy(menuWorldPosition);
        groupRef.current.position.y += 0.15; // Slightly above the card
      }
    } else if (controller?.object) {
      // Quest: update menu position to follow controller
      if (isOpen && groupRef.current) {
        const controllerPos = new THREE.Vector3();
        const controllerDir = new THREE.Vector3(0, 0, -1);
        controller.object.getWorldPosition(controllerPos);
        controller.object.getWorldDirection(controllerDir);

        // Position menu in front of controller
        const menuPos = controllerPos
          .clone()
          .add(controllerDir.multiplyScalar(distance));
        setMenuPosition(menuPos);
        groupRef.current.position.copy(menuPos);

        // Make menu face the camera/player
        groupRef.current.lookAt(controllerPos);
      }

      // Update selected item based on thumbstick
      const thumbstick = getThumbstick();
      const newSelected = getSelectedFromThumbstick(
        thumbstick.x,
        thumbstick.y,
      );

      if (newSelected !== selectedIndex) {
        setSelectedIndex(newSelected);

        // Haptic feedback on selection change
        if (newSelected !== null) {
          const gamepad = controller?.inputSource?.gamepad;
          if (gamepad?.hapticActuators?.[0]) {
            (gamepad.hapticActuators[0] as GamepadHapticActuator).pulse?.(
              0.2,
              30,
            );
          }
        }
      }
    }
  });

  // Quest: handle menu open/close via squeeze button
  useEffect(() => {
    if (!session || useGazeSelection) return;

    const handleSqueezeStart = (event: XRInputSourceEvent) => {
      if (event.inputSource.handedness !== controlHand) return;

      const controllerObj = controller?.object;
      if (controllerObj) {
        const pos = new THREE.Vector3();
        controllerObj.getWorldPosition(pos);
        setMenuPosition(pos);
      }

      setIsOpen(true);
      setSelectedIndex(null);
    };

    const handleSqueezeEnd = (event: XRInputSourceEvent) => {
      if (event.inputSource.handedness !== controlHand) return;

      if (isOpen && selectedIndex !== null) {
        const item = items[selectedIndex];
        if (item && !item.disabled) {
          onSelect?.(item.id);

          // Confirm haptic
          const gamepad = controller?.inputSource?.gamepad;
          if (gamepad?.hapticActuators?.[0]) {
            (gamepad.hapticActuators[0] as GamepadHapticActuator).pulse?.(
              0.5,
              100,
            );
          }
        }
      }

      setIsOpen(false);
      setSelectedIndex(null);
      onClose?.();
    };

    session.addEventListener("squeezestart", handleSqueezeStart);
    session.addEventListener("squeezeend", handleSqueezeEnd);

    return () => {
      session.removeEventListener("squeezestart", handleSqueezeStart);
      session.removeEventListener("squeezeend", handleSqueezeEnd);
    };
  }, [
    session,
    controlHand,
    controller,
    isOpen,
    selectedIndex,
    items,
    onSelect,
    onClose,
    useGazeSelection,
  ]);

  // AVP: auto-close on timeout
  useEffect(() => {
    if (!useGazeSelection || !session) return;

    lastInteractionTime.current = Date.now();

    const checkTimeout = setInterval(() => {
      if (Date.now() - lastInteractionTime.current > GAZE_MENU_TIMEOUT_MS) {
        onClose?.();
      }
    }, 500);

    return () => clearInterval(checkTimeout);
  }, [useGazeSelection, session, onClose]);

  // Gaze menu is always "open" when rendered; Quest menu requires squeeze
  const shouldRender = useGazeSelection || isOpen;

  if (!session || !shouldRender) {
    return null;
  }

  return (
    <group ref={groupRef} position={menuPosition}>
      {/* Background circle */}
      <mesh>
        <circleGeometry args={[radius * 1.2, 32]} />
        <meshBasicMaterial
          color="#1a1a2e"
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Menu items */}
      {items.map((item, index) => {
        const angle = index * segmentAngle - Math.PI / 2; // Start from top
        const x = Math.cos(angle) * radius * 0.7;
        const y = Math.sin(angle) * radius * 0.7;
        const isSelected = selectedIndex === index;
        const isDisabled = item.disabled ?? false;

        return (
          <group key={item.id} position={[x, y, 0.01]}>
            {/* Item background — interactive in gaze mode */}
            <mesh
              onPointerEnter={
                useGazeSelection
                  ? () => handleItemPointerEnter(index)
                  : undefined
              }
              onPointerLeave={
                useGazeSelection
                  ? () => handleItemPointerLeave(index)
                  : undefined
              }
              onClick={
                useGazeSelection
                  ? (e) => handleItemClick(e, item)
                  : undefined
              }
            >
              <circleGeometry args={[radius * 0.25, 16]} />
              <meshBasicMaterial
                color={isSelected ? (item.color ?? "#4a90d9") : "#2a2a4e"}
                transparent
                opacity={isDisabled ? 0.3 : isSelected ? 1 : 0.7}
              />
            </mesh>

            {/* Item icon/label */}
            <Text
              position={[0, 0, 0.01]}
              fontSize={0.02}
              color={isDisabled ? "#666666" : "#ffffff"}
              anchorX="center"
              anchorY="middle"
              maxWidth={radius * 0.4}
            >
              {item.icon ?? item.label.substring(0, 2).toUpperCase()}
            </Text>
          </group>
        );
      })}

      {/* Center close button — interactive in gaze mode */}
      <mesh
        position={[0, 0, 0.02]}
        onClick={
          useGazeSelection
            ? (e) => {
                e.stopPropagation();
                onClose?.();
              }
            : undefined
        }
      >
        <circleGeometry args={[radius * 0.1, 16]} />
        <meshBasicMaterial
          color={useGazeSelection ? "#ff4444" : "#ffffff"}
          transparent
          opacity={useGazeSelection ? 0.6 : 0.3}
        />
      </mesh>

      {/* Close button label for gaze mode */}
      {useGazeSelection && (
        <Text
          position={[0, 0, 0.03]}
          fontSize={0.012}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          X
        </Text>
      )}

      {/* Selected item label */}
      {selectedIndex !== null && items[selectedIndex] && (
        <Text
          position={[0, -radius * 1.0, 0.02]}
          fontSize={0.015}
          color="#ffffff"
          anchorX="center"
          anchorY="middle"
        >
          {items[selectedIndex].label}
        </Text>
      )}
    </group>
  );
}

/**
 * Default card context menu items
 */
export const defaultCardMenuItems: RadialMenuItem[] = [
  { id: "tap", label: "Tap/Untap", icon: "T", color: "#4a90d9" },
  { id: "flip", label: "Flip", icon: "F", color: "#9b59b6" },
  { id: "destroy", label: "Destroy", icon: "D", color: "#e74c3c" },
  { id: "return", label: "Return to Hand", icon: "R", color: "#2ecc71" },
  { id: "exile", label: "Exile", icon: "E", color: "#f39c12" },
  { id: "copy", label: "Copy", icon: "C", color: "#3498db" },
];

export type { RadialMenuItem };
export default VRRadialMenu;
