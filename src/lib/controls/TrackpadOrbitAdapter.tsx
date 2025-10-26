"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

export default function TrackpadOrbitAdapter() {
  const { camera, gl, size, controls, invalidate } = useThree((s) => ({
    camera: s.camera as THREE.PerspectiveCamera,
    gl: s.gl,
    size: s.size,
    controls: s.controls as OrbitControlsImpl | undefined,
    invalidate: s.invalidate,
  }));
  const lastScaleRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const twoTouchRef = useRef<{
    lastCenter: { x: number; y: number } | null;
    lastDist: number | null;
  }>({ lastCenter: null, lastDist: null });

  useEffect(() => {
    if (!gl?.domElement) return;
    if (!controls) return;
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    let isMac = false;
    let isTouch = false;
    try {
      isMac =
        typeof navigator !== "undefined" &&
        (/Mac/i.test(navigator.platform || "") ||
          /Macintosh/i.test(navigator.userAgent || ""));
      isTouch =
        (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0) ||
        (typeof window !== "undefined" && "ontouchstart" in window);
    } catch {
      // if detection fails, proceed conservatively
      isMac = false;
      isTouch = false;
    }
    if (!isMac && !isTouch) return;

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const raycaster = new THREE.Raycaster();
    const tmpVec = new THREE.Vector3();

    const getWorldPointOnPlane = (ndcX: number, ndcY: number): THREE.Vector3 => {
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const hit = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (hit) return hit;
      return (controls.target as THREE.Vector3).clone();
    };

    const handleWheel = (event: WheelEvent) => {
      if (!controls?.enabled) return;
      // Prevent default page scroll/zoom and block OrbitControls' own wheel handler
      event.preventDefault();
      const e = event as WheelEvent & { stopImmediatePropagation?: () => void };
      if (typeof e.stopImmediatePropagation === "function") {
        e.stopImmediatePropagation();
      }
      event.stopPropagation();

      const rect = gl.domElement.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const ndcX = (px / rect.width) * 2 - 1;
      const ndcY = -(py / rect.height) * 2 + 1;
      // Pinch-to-zoom (Chrome/Safari ctrl+wheel): zoom to cursor
      if (event.ctrlKey) {
        const d = camera.position.distanceTo(controls.target);
        const zoomSpeed = 1.1;
        let scale = event.deltaY < 0 ? 1 / zoomSpeed : zoomSpeed;
        // Clamp scale so resulting distance respects min/max
        const minD = (controls.minDistance ?? 0.1) / Math.max(d, 1e-6);
        const maxD = (controls.maxDistance ?? 1e6) / Math.max(d, 1e-6);
        scale = Math.max(minD, Math.min(maxD, scale));

        const p = getWorldPointOnPlane(ndcX, ndcY);
        tmpVec.copy(camera.position).sub(p).multiplyScalar(scale).add(p);
        const newCam = tmpVec.clone();
        tmpVec.copy(controls.target as THREE.Vector3).sub(p).multiplyScalar(scale).add(p);
        const newTarget = tmpVec.clone();
        (controls.target as THREE.Vector3).copy(newTarget);
        camera.position.copy(newCam);
        controls.update();
        invalidate();
        return;
      }

      const ndc2X = ndcX + (event.deltaX / rect.width) * 2;
      const ndc2Y = ndcY - (event.deltaY / rect.height) * 2;
      const p1 = getWorldPointOnPlane(ndcX, ndcY);
      const p2 = getWorldPointOnPlane(ndc2X, ndc2Y);
      const panScale = rect.width > rect.height ? 0.9 : 1;
      tmpVec.copy(p1).sub(p2).multiplyScalar(panScale);
      (controls.target as THREE.Vector3).add(tmpVec);
      camera.position.add(tmpVec);
      controls.update();
      invalidate();
    };

    if (isMac) {
      gl.domElement.addEventListener("wheel", handleWheel, {
        passive: false,
        capture: true,
      } as AddEventListenerOptions);
    }

    // Safari gesture events (Mac only): implement pinch zoom using scale delta
    type SafariGestureEvent = Event & { scale: number; clientX?: number; clientY?: number };
    let onGestureStart: ((ev: SafariGestureEvent) => void) | null = null;
    let onGestureChange: ((ev: SafariGestureEvent) => void) | null = null;
    let onGestureEnd: ((ev: SafariGestureEvent) => void) | null = null;
    if (isMac) {
      onGestureStart = (ev: SafariGestureEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        lastScaleRef.current = ev.scale || 1;
      };
      onGestureChange = (ev: SafariGestureEvent) => {
        if (!controls?.enabled) return;
        ev.preventDefault();
        ev.stopPropagation();
        const last = lastScaleRef.current ?? (ev.scale || 1);
        const factor = (ev.scale || 1) / last;
        lastScaleRef.current = ev.scale || 1;

        const rect = gl.domElement.getBoundingClientRect();
        const px = typeof ev.clientX === "number" ? ev.clientX - rect.left : rect.width / 2;
        const py = typeof ev.clientY === "number" ? ev.clientY - rect.top : rect.height / 2;
        const ndcX = (px / rect.width) * 2 - 1;
        const ndcY = -(py / rect.height) * 2 + 1;

        // Convert gesture factor to camera distance scale; factor>1 means zoom in on Safari
        const d = camera.position.distanceTo(controls.target);
        let scale = 1 / Math.max(1e-6, factor);
        const isLandscape = rect.width > rect.height;
        if (isLandscape) {
          // Ease zoom response slightly in landscape for smoother feel
          scale = Math.pow(scale, 0.9);
        }
        const minD = (controls.minDistance ?? 0.1) / Math.max(d, 1e-6);
        const maxD = (controls.maxDistance ?? 1e6) / Math.max(d, 1e-6);
        scale = Math.max(minD, Math.min(maxD, scale));

        const p = getWorldPointOnPlane(ndcX, ndcY);
        tmpVec.copy(camera.position).sub(p).multiplyScalar(scale).add(p);
        const newCam = tmpVec.clone();
        tmpVec
          .copy(controls.target as THREE.Vector3)
          .sub(p)
          .multiplyScalar(scale)
          .add(p);
        const newTarget = tmpVec.clone();
        (controls.target as THREE.Vector3).copy(newTarget);
        camera.position.copy(newCam);
        controls.update();
        invalidate();
      };
      onGestureEnd = (ev: SafariGestureEvent) => {
        ev.preventDefault();
        ev.stopPropagation();
        lastScaleRef.current = null;
      };
      gl.domElement.addEventListener("gesturestart", onGestureStart as EventListener, { passive: false, capture: true } as AddEventListenerOptions);
      gl.domElement.addEventListener("gesturechange", onGestureChange as EventListener, { passive: false, capture: true } as AddEventListenerOptions);
      gl.domElement.addEventListener("gestureend", onGestureEnd as EventListener, { passive: false, capture: true } as AddEventListenerOptions);
    }

    // --- Mobile touch: two-finger pan and pinch-to-zoom; long-press as right-click ---
    const LONG_PRESS_MS = 500;
    const MOVE_CANCEL_PX = 10;
    const dispatchContextMenu = (clientX: number, clientY: number) => {
      try {
        if (typeof PointerEvent !== "undefined") {
          const down = new PointerEvent("pointerdown", {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
            pointerType: "touch",
            button: 2,
            buttons: 2,
          });
          gl.domElement.dispatchEvent(down);
          const up = new PointerEvent("pointerup", {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
            pointerType: "touch",
            button: 2,
            buttons: 0,
          });
          gl.domElement.dispatchEvent(up);
        }
      } catch {}
      try {
        const cm = new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          button: 2,
          buttons: 2,
        });
        gl.domElement.dispatchEvent(cm);
      } catch {}
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (!isTouch || !controls?.enabled) return;
      if (event.touches.length === 2) {
        // Begin two-finger gesture
        const t1 = event.touches[0];
        const t2 = event.touches[1];
        const cx = (t1.clientX + t2.clientX) / 2;
        const cy = (t1.clientY + t2.clientY) / 2;
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        twoTouchRef.current.lastCenter = { x: cx, y: cy };
        twoTouchRef.current.lastDist = Math.hypot(dx, dy);
        // Block OrbitControls default touch handling and page scroll
        event.preventDefault();
        const te = event as TouchEvent & {
          stopImmediatePropagation?: () => void;
        };
        te.stopImmediatePropagation?.();
        event.stopPropagation();
        // Cancel any pending long-press
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        longPressStartRef.current = null;
      } else if (event.touches.length === 1) {
        // Setup long-press detection; don't block normal tap/drag events
        const t = event.touches[0];
        longPressStartRef.current = { x: t.clientX, y: t.clientY };
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = window.setTimeout(() => {
          if (!longPressStartRef.current) return;
          dispatchContextMenu(longPressStartRef.current.x, longPressStartRef.current.y);
          longPressTimerRef.current = null;
          longPressStartRef.current = null;
        }, LONG_PRESS_MS) as unknown as number;
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!isTouch || !controls?.enabled) return;
      if (event.touches.length === 2) {
        // Two-finger pan + pinch
        event.preventDefault();
        const te = event as TouchEvent & {
          stopImmediatePropagation?: () => void;
        };
        te.stopImmediatePropagation?.();
        event.stopPropagation();

        const t1 = event.touches[0];
        const t2 = event.touches[1];
        const cx = (t1.clientX + t2.clientX) / 2;
        const cy = (t1.clientY + t2.clientY) / 2;
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        const dist = Math.hypot(dx, dy);

        const rect = gl.domElement.getBoundingClientRect();
        const px = cx - rect.left;
        const py = cy - rect.top;
        const ndcX = (px / rect.width) * 2 - 1;
        const ndcY = -(py / rect.height) * 2 + 1;

        // Pan by center delta
        const lastC = twoTouchRef.current.lastCenter || { x: cx, y: cy };
        const ndc2X = ndcX + ((cx - lastC.x) / rect.width) * 2;
        const ndc2Y = ndcY - ((cy - lastC.y) / rect.height) * 2;
        const p1 = getWorldPointOnPlane(ndcX, ndcY);
        const p2 = getWorldPointOnPlane(ndc2X, ndc2Y);
        const isLandscape = rect.width > rect.height;
        const panScale = isLandscape ? 0.85 : 1;
        tmpVec.copy(p1).sub(p2).multiplyScalar(panScale);
        (controls.target as THREE.Vector3).add(tmpVec);
        camera.position.add(tmpVec);

        // Pinch zoom to center
        const lastD = twoTouchRef.current.lastDist ?? dist;
        let scale = lastD / Math.max(1e-6, dist);
        const isLandscapeZoom = rect.width > rect.height;
        if (isLandscapeZoom) {
          // Ease zoom response slightly in landscape for smoother feel
          scale = Math.pow(scale, 0.9);
        }
        const currentDist = camera.position.distanceTo(controls.target);
        const minD = (controls.minDistance ?? 0.1) / Math.max(currentDist, 1e-6);
        const maxD = (controls.maxDistance ?? 1e6) / Math.max(currentDist, 1e-6);
        scale = Math.max(minD, Math.min(maxD, scale));
        const p = getWorldPointOnPlane(ndcX, ndcY);
        tmpVec.copy(camera.position).sub(p).multiplyScalar(scale).add(p);
        const newCam = tmpVec.clone();
        tmpVec.copy(controls.target as THREE.Vector3).sub(p).multiplyScalar(scale).add(p);
        const newTarget = tmpVec.clone();
        (controls.target as THREE.Vector3).copy(newTarget);
        camera.position.copy(newCam);

        controls.update();
        invalidate();

        twoTouchRef.current.lastCenter = { x: cx, y: cy };
        twoTouchRef.current.lastDist = dist;

        // Cancel long-press if any
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
          longPressStartRef.current = null;
        }
      } else if (event.touches.length === 1) {
        // Cancel long-press if finger moved too far
        const start = longPressStartRef.current;
        if (start) {
          const t = event.touches[0];
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
            longPressStartRef.current = null;
          }
        }
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (!isTouch) return;
      if (event.touches.length < 2) {
        twoTouchRef.current.lastCenter = null;
        twoTouchRef.current.lastDist = null;
      }
      if (event.touches.length === 0) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        longPressStartRef.current = null;
      }
    };

    if (isTouch) {
      gl.domElement.addEventListener("touchstart", handleTouchStart as EventListener, { passive: false, capture: true } as AddEventListenerOptions);
      gl.domElement.addEventListener("touchmove", handleTouchMove as EventListener, { passive: false, capture: true } as AddEventListenerOptions);
      gl.domElement.addEventListener("touchend", handleTouchEnd as EventListener, { passive: false, capture: true } as AddEventListenerOptions);
      gl.domElement.addEventListener("touchcancel", handleTouchEnd as EventListener, { passive: false, capture: true } as AddEventListenerOptions);
    }

    return () => {
      if (isMac) {
        gl.domElement.removeEventListener("wheel", handleWheel as EventListener);
        if (onGestureStart) gl.domElement.removeEventListener("gesturestart", onGestureStart as EventListener);
        if (onGestureChange) gl.domElement.removeEventListener("gesturechange", onGestureChange as EventListener);
        if (onGestureEnd) gl.domElement.removeEventListener("gestureend", onGestureEnd as EventListener);
      }
      if (isTouch) {
        gl.domElement.removeEventListener("touchstart", handleTouchStart as EventListener);
        gl.domElement.removeEventListener("touchmove", handleTouchMove as EventListener);
        gl.domElement.removeEventListener("touchend", handleTouchEnd as EventListener);
        gl.domElement.removeEventListener("touchcancel", handleTouchEnd as EventListener);
      }
      // no-op
    };
  }, [camera, controls, gl?.domElement, size.width, size.height, invalidate]);

  return null;
}
