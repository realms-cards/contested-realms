"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";

interface MouseTrackerProps {
  cards: Array<{ id: number; card: { slug: string; cardName: string; type: string | null } }>;
  onHover: (card: { slug: string; name: string; type: string | null } | null) => void;
}

// Component to track mouse position and perform raycasting for card detection
export default function MouseTracker({ cards, onHover }: MouseTrackerProps) {
  const { camera, scene, raycaster, pointer } = useThree();
  
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      // Convert screen coordinates to normalized device coordinates
      const rect = (event.target as HTMLElement)?.getBoundingClientRect();
      if (!rect) return;
      
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Update raycaster
      raycaster.setFromCamera(pointer, camera);
      
      // Find all intersectable objects (the visual card meshes)
      const intersectableObjects: THREE.Object3D[] = [];
      scene.traverse((child) => {
        // Look for CardPlane meshes with card data
        if (child.userData?.cardId && child.userData?.slug) {
          intersectableObjects.push(child);
        }
      });
      
      // Perform raycasting
      const intersects = raycaster.intersectObjects(intersectableObjects, true);
      
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
          .filter(Boolean);

        if (validIntersects.length > 0) {
          // Sort by Y position (highest first) to get the topmost card
          const topmost = validIntersects.sort((a, b) => b.y - a.y)[0];
          onHover({
            slug: topmost.card.card.slug,
            name: topmost.card.card.cardName,
            type: topmost.card.card.type,
          });
          return;
        }
      }
      
      // No card found under cursor
      onHover(null);
    };
    
    // Add event listener to the canvas
    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('mousemove', handleMouseMove);
      return () => canvas.removeEventListener('mousemove', handleMouseMove);
    }
  }, [camera, scene, raycaster, pointer, cards, onHover]);
  
  return null; // This component doesn't render anything
}