"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { createCardPreviewData } from "@/lib/game/card-preview.types";
import { throttle } from "@/lib/utils/throttle";

interface MouseTrackerProps {
  cards: Array<{
    id: number;
    card: { slug: string; cardName: string; type: string | null };
    y?: number;
  }>;
  onHover: (
    card: { slug: string; name: string; type: string | null } | null,
  ) => void;
}

/**
 * MouseTracker - Centralized card hover detection
 *
 * Performs raycasting on mousemove and picks the topmost card based on actual
 * world Y position. This handles stacked cards properly by reading the 3D position
 * from the scene, not from the cards array.
 */
export default function MouseTracker({ cards, onHover }: MouseTrackerProps) {
  const { camera, scene, raycaster, pointer, gl } = useThree();
  const lastHoveredSlug = useRef<string | null>(null);
  const cardSignature = useMemo(
    () => cards.map((card) => card.id).join("|"),
    [cards],
  );

  const interactableObjects = useMemo(() => {
    void cardSignature;
    const objects: THREE.Object3D[] = [];
    scene.traverse((child) => {
      if (child.userData?.cardId && child.userData?.slug) {
        // Skip meshes that explicitly disable raycasting
        // (Three.js treats `undefined` as enabled, but some assets override to return empty arrays)
        const prototypeRaycast = (child as { raycast?: unknown }).raycast;
        if (
          prototypeRaycast === undefined ||
          typeof prototypeRaycast === "function"
        ) {
          objects.push(child);
        }
      }
    });
    return objects;
  }, [scene, cardSignature]); // Re-build when cards array changes

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      // Convert screen coordinates to normalized device coordinates
      const rect = (event.target as HTMLElement)?.getBoundingClientRect();
      if (!rect) return;

      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      // Update raycaster
      raycaster.setFromCamera(pointer, camera);

      // Perform raycasting
      const intersects = raycaster.intersectObjects(interactableObjects, true);

      if (intersects.length > 0) {
        // Take the closest intersected card (Three.js already sorts by distance).
        // This matches how pointer events choose targets and feels most natural
        // for "card directly under the cursor" behavior.
        for (const intersect of intersects) {
          const userData = intersect.object.userData as
            | {
                cardId?: number;
                slug?: string | null;
                name?: string | null;
                type?: string | null;
              }
            | undefined;

          // First, try to derive preview data directly from mesh userData.
          const directPreview = userData
            ? createCardPreviewData({
                slug: userData.slug ?? undefined,
                name: userData.name ?? undefined,
                type: userData.type ?? undefined,
              })
            : null;

          let preview = directPreview;

          // If userData is incomplete (e.g. name missing), fall back to cards[] lookup by id.
          if (!preview && typeof userData?.cardId === "number") {
            const card = cards.find((c) => c.id === userData.cardId);
            if (card) {
              preview = {
                slug: card.card.slug,
                name: card.card.cardName,
                type: card.card.type,
              };
            }
          }

          if (preview) {
            if (lastHoveredSlug.current !== preview.slug) {
              lastHoveredSlug.current = preview.slug;
              onHover(preview);
            }
            return;
          }
        }
      }

      // Check if mouse is in hand area (bottom 5-15% of screen, center 16% horizontally)
      // Don't clear hover in hand area as hand cards have their own hover management
      if (rect) {
        const relativeY = (event.clientY - rect.top) / rect.height;
        const relativeX = (event.clientX - rect.left) / rect.width;
        const inHandArea =
          relativeY >= 0.85 &&
          relativeY <= 0.95 &&
          relativeX >= 0.42 &&
          relativeX <= 0.58;

        // Only clear hover if not in hand area
        if (!inHandArea && lastHoveredSlug.current !== null) {
          lastHoveredSlug.current = null;
          onHover(null);
        }
      }
    };

    // Add event listener to the canvas
    const canvas = gl?.domElement ?? null;
    if (!canvas) return undefined;

    // Throttle to 30ms (~33fps) - raycasting is expensive, especially during drag
    const throttledHandler = throttle(handleMouseMove, 30);
    canvas.addEventListener("mousemove", throttledHandler);
    return () => {
      canvas.removeEventListener("mousemove", throttledHandler);
      throttledHandler.cancel();
      lastHoveredSlug.current = null;
    };
  }, [
    camera,
    scene,
    raycaster,
    pointer,
    gl,
    cards,
    interactableObjects,
    onHover,
  ]);

  return null; // This component doesn't render anything
}
