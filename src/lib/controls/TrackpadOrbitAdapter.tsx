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

  useEffect(() => {
    if (!gl?.domElement) return;
    if (!controls) return;
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    try {
      const isMac =
        typeof navigator !== "undefined" &&
        (/Mac/i.test(navigator.platform || "") ||
          /Macintosh/i.test(navigator.userAgent || ""));
      if (!isMac) return;
    } catch {
      // if detection fails, do nothing
      return;
    }

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
      const ndcX = (px / size.width) * 2 - 1;
      const ndcY = -(py / size.height) * 2 + 1;
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

      const ndc2X = ndcX + (event.deltaX / size.width) * 2;
      const ndc2Y = ndcY - (event.deltaY / size.height) * 2;
      const p1 = getWorldPointOnPlane(ndcX, ndcY);
      const p2 = getWorldPointOnPlane(ndc2X, ndc2Y);
      tmpVec.copy(p1).sub(p2);
      (controls.target as THREE.Vector3).add(tmpVec);
      camera.position.add(tmpVec);
      controls.update();
      invalidate();
    };

    gl.domElement.addEventListener("wheel", handleWheel, {
      passive: false,
      capture: true,
    } as AddEventListenerOptions);

    // Safari gesture events: implement pinch zoom using scale delta
    type SafariGestureEvent = Event & { scale: number; clientX?: number; clientY?: number };
    const onGestureStart = (ev: SafariGestureEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      lastScaleRef.current = ev.scale || 1;
    };
    const onGestureChange = (ev: SafariGestureEvent) => {
      if (!controls?.enabled) return;
      ev.preventDefault();
      ev.stopPropagation();
      const last = lastScaleRef.current ?? (ev.scale || 1);
      const factor = (ev.scale || 1) / last;
      lastScaleRef.current = ev.scale || 1;

      const rect = gl.domElement.getBoundingClientRect();
      const px = typeof ev.clientX === "number" ? ev.clientX - rect.left : rect.width / 2;
      const py = typeof ev.clientY === "number" ? ev.clientY - rect.top : rect.height / 2;
      const ndcX = (px / size.width) * 2 - 1;
      const ndcY = -(py / size.height) * 2 + 1;

      // Convert gesture factor to camera distance scale; factor>1 means zoom in on Safari
      const d = camera.position.distanceTo(controls.target);
      let scale = 1 / Math.max(1e-6, factor);
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
    };
    const onGestureEnd = (ev: SafariGestureEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      lastScaleRef.current = null;
    };
    gl.domElement.addEventListener("gesturestart", onGestureStart as EventListener, { passive: false, capture: true } as AddEventListenerOptions);
    gl.domElement.addEventListener("gesturechange", onGestureChange as EventListener, { passive: false, capture: true } as AddEventListenerOptions);
    gl.domElement.addEventListener("gestureend", onGestureEnd as EventListener, { passive: false, capture: true } as AddEventListenerOptions);

    return () => {
      gl.domElement.removeEventListener("wheel", handleWheel as EventListener);
      gl.domElement.removeEventListener("gesturestart", onGestureStart as EventListener);
      gl.domElement.removeEventListener("gesturechange", onGestureChange as EventListener);
      gl.domElement.removeEventListener("gestureend", onGestureEnd as EventListener);
      // no-op
    };
  }, [camera, controls, gl?.domElement, size.width, size.height, invalidate]);

  return null;
}
