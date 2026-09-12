"use client";

import { useRef } from "react";
import { Spherical, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

/** Default 3D camera polar angle (radians from straight down, ~17°). */
export const ORBIT_DEFAULT_TILT = 0.3;

type Props = {
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
  isMobile?: boolean;
};

// Radians of camera rotation per dragged pixel
const SENSITIVITY = 0.01;

/**
 * Drag-to-orbit handle for the 3D camera: horizontal drag rotates around the
 * board, vertical drag tilts. OrbitControls.update() clamps to the configured
 * polar/azimuth limits and emits "change" (which invalidates the demand loop).
 */
export default function CameraOrbitPad({ controlsRef, isMobile }: Props) {
  const lastRef = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    lastRef.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const last = lastRef.current;
    const c = controlsRef.current;
    if (!last || !c) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    lastRef.current = { x: e.clientX, y: e.clientY };
    if (dx === 0 && dy === 0) return;
    const target = c.target;
    const cam = c.object;
    const offset = new Vector3().copy(cam.position).sub(target);
    const sph = new Spherical().setFromVector3(offset);
    // Same feel as OrbitControls drag: "grab" the table
    sph.theta -= dx * SENSITIVITY;
    sph.phi -= dy * SENSITIVITY;
    sph.makeSafe();
    offset.setFromSpherical(sph);
    cam.position.copy(target).add(offset);
    c.update();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    lastRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <button
      type="button"
      aria-label="Rotate 3D camera"
      title="Drag to rotate / tilt the 3D camera (or middle-mouse drag on the board)"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`${isMobile ? "ml-0.5 p-1" : "ml-1 p-1.5"} rounded-full text-rc-fg-muted transition-colors hover:bg-rc-accent/10 hover:text-rc-accent-ring cursor-grab active:cursor-grabbing touch-none`}
    >
      <svg
        className={isMobile ? "w-3 h-3" : "w-4 h-4"}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Orbit icon: ellipse around a sphere with arrowhead */}
        <circle cx="12" cy="12" r="3" />
        <path d="M21 12c0 2.2-4 4-9 4s-9-1.8-9-4 4-4 9-4c2.3 0 4.4.4 6 1" />
        <path d="M16 6.5 18 9l-3 .8" />
      </svg>
    </button>
  );
}
