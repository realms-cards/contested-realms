"use client";

import { useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

interface MouseTrackerProps {
  cards: Array<{ id: number; card: { slug: string; cardName: string; type: string | null }; y?: number }>;
  onHover: (card: { slug: string; name: string; type: string | null } | null) => void;
}

// Component to track mouse position and perform raycasting for card detection
export default function MouseTracker({ cards, onHover }: MouseTrackerProps) {
  const { camera, scene, raycaster, pointer, gl } = useThree();
  const lastHoveredSlug = useRef<string | null>(null);

  const interactableObjects = useMemo(() => {
    const objects: THREE.Object3D[] = [];
    scene.traverse((child) => {
      if (child.userData?.cardId && child.userData?.slug) {
        // Skip meshes that explicitly disable raycasting
        // (Three.js treats `undefined` as enabled, but some assets override to return empty arrays)
        const prototypeRaycast = (child as { raycast?: unknown }).raycast;
        if (prototypeRaycast === undefined || typeof prototypeRaycast === "function") {
          objects.push(child);
        }
      }
    });
    return objects;
  }, [scene]);
  
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
        // Find all intersections that have card data, then pick the topmost card (highest Y)
        const validIntersects = intersects
          .map(intersect => {
            const cardId = intersect.object.userData?.cardId;
            if (cardId) {
              const card = cards.find(c => c.id === cardId);
              if (card) {
                return { intersect, card, y: card.y || 0 };
              }
            }
            return null;
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);

        if (validIntersects.length > 0) {
          // Sort by Y position (highest first) to get the topmost card
          const topmost = validIntersects.sort((a, b) => b.y - a.y)[0];
          if (lastHoveredSlug.current !== topmost.card.card.slug) {
            lastHoveredSlug.current = topmost.card.card.slug;
            onHover({
              slug: topmost.card.card.slug,
              name: topmost.card.card.cardName,
              type: topmost.card.card.type,
            });
          }
          return;
        }
      }
      
      // Check if mouse is in hand area (bottom 25% of screen) - don't clear hover in hand area
      // as hand cards have their own hover management
      if (rect) {
        const relativeY = (event.clientY - rect.top) / rect.height;
        const inHandArea = relativeY > 0.75; // bottom 25% of screen
        
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

    canvas.addEventListener('mousemove', handleMouseMove);
    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      lastHoveredSlug.current = null;
    };
  }, [camera, scene, raycaster, pointer, gl, cards, interactableObjects, onHover]);
  
  return null; // This component doesn't render anything
}