"use client";

import { useEffect, useState } from "react";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Vector3,
  type Mesh,
} from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";

// Card model dimensions (from OBJ file comments: 63mm x 88mm x 0.3mm)
const OBJ_WIDTH = 63; // mm
const OBJ_HEIGHT = 88; // mm

// Cache geometry info
interface GeometryInfo {
  geometry: BufferGeometry;
  aspectRatio: number; // height / width after normalization
  thicknessRatio: number; // thickness / width after normalization
}

let cachedInfo: GeometryInfo | null = null;
let loadingPromise: Promise<GeometryInfo> | null = null;

/**
 * Generate UV coordinates for a BufferGeometry based on planar projection.
 * Maps X/Y coordinates to U/V, normalized to 0-1 range.
 */
function generatePlanarUVs(geometry: BufferGeometry): void {
  const position = geometry.getAttribute("position");
  if (!position) return;

  const uvs: number[] = [];
  const normals = geometry.getAttribute("normal");

  // Find actual bounds from geometry for accurate UV mapping
  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  // Generate UVs based on position and face normal
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const nz = normals ? normals.getZ(i) : 0;

    // Normalize to 0-1 based on actual geometry bounds
    let u = (x - minX) / rangeX;
    let v = (y - minY) / rangeY;

    // For side faces (small Z normal), use a simple mapping
    // These faces get edge color material anyway
    if (Math.abs(nz) < 0.5) {
      u = 0.5;
      v = 0.5;
    }

    uvs.push(u, v);
  }

  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
}

/**
 * Create geometry groups for multi-material rendering.
 * Group 0: Edge faces (sides)
 * Group 1: Front face (card art, +Z normal)
 * Group 2: Back face (card back, -Z normal)
 */
function createMaterialGroups(geometry: BufferGeometry): void {
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  const normals = geometry.getAttribute("normal");

  if (!position || !normals) return;

  // Clear existing groups
  geometry.clearGroups();

  if (index) {
    // Indexed geometry - group triangles by face normal
    const indices = index.array;
    const groups: { edge: number[]; front: number[]; back: number[] } = {
      edge: [],
      front: [],
      back: [],
    };

    for (let i = 0; i < indices.length; i += 3) {
      // Get average normal of triangle
      const i0 = indices[i];
      const i1 = indices[i + 1];
      const i2 = indices[i + 2];

      const nz = (normals.getZ(i0) + normals.getZ(i1) + normals.getZ(i2)) / 3;

      if (nz > 0.5) {
        groups.front.push(indices[i], indices[i + 1], indices[i + 2]);
      } else if (nz < -0.5) {
        groups.back.push(indices[i], indices[i + 1], indices[i + 2]);
      } else {
        groups.edge.push(indices[i], indices[i + 1], indices[i + 2]);
      }
    }

    // Rebuild index buffer with groups ordered: edge, front, back
    const newIndices = [...groups.edge, ...groups.front, ...groups.back];
    geometry.setIndex(newIndices);

    // Add groups
    let offset = 0;
    if (groups.edge.length > 0) {
      geometry.addGroup(offset, groups.edge.length, 0); // edge material
      offset += groups.edge.length;
    }
    if (groups.front.length > 0) {
      geometry.addGroup(offset, groups.front.length, 1); // front material
      offset += groups.front.length;
    }
    if (groups.back.length > 0) {
      geometry.addGroup(offset, groups.back.length, 2); // back material
    }
  } else {
    // Non-indexed geometry - group by triangle vertex indices
    const groups: { edge: number[]; front: number[]; back: number[] } = {
      edge: [],
      front: [],
      back: [],
    };

    for (let i = 0; i < position.count; i += 3) {
      const nz =
        (normals.getZ(i) + normals.getZ(i + 1) + normals.getZ(i + 2)) / 3;

      if (nz > 0.5) {
        groups.front.push(i, i + 1, i + 2);
      } else if (nz < -0.5) {
        groups.back.push(i, i + 1, i + 2);
      } else {
        groups.edge.push(i, i + 1, i + 2);
      }
    }

    // Create index buffer from grouped vertex indices: edge, front, back order
    const newIndices = [...groups.edge, ...groups.front, ...groups.back];
    geometry.setIndex(newIndices);

    // Add material groups
    let offset = 0;
    if (groups.edge.length > 0) {
      geometry.addGroup(offset, groups.edge.length, 0); // edge material
      offset += groups.edge.length;
    }
    if (groups.front.length > 0) {
      geometry.addGroup(offset, groups.front.length, 1); // front material
      offset += groups.front.length;
    }
    if (groups.back.length > 0) {
      geometry.addGroup(offset, groups.back.length, 2); // back material
    }
  }
}

async function loadCardGeometryWithInfo(): Promise<GeometryInfo> {
  const loader = new OBJLoader();

  return new Promise((resolve, reject) => {
    loader.load(
      "/3dmodels/card.obj",
      (obj) => {
        // Find the mesh geometry
        let foundGeometry: BufferGeometry | null = null;
        obj.traverse((child) => {
          const mesh = child as Mesh;
          if (mesh.isMesh && !foundGeometry) {
            foundGeometry = mesh.geometry as BufferGeometry;
          }
        });

        if (!foundGeometry) {
          reject(new Error("No mesh found in card.obj"));
          return;
        }

        // Clone to avoid modifying the original (explicit cast needed due to TS narrowing in callbacks)
        const geo = (foundGeometry as BufferGeometry).clone();

        // Normalize the OBJ file's unnormalized normals (magnitude ~0.1)
        const normAttr = geo.getAttribute("normal");
        if (normAttr) {
          const arr = normAttr.array as Float32Array;
          for (let i = 0; i < arr.length; i += 3) {
            const x = arr[i],
              y = arr[i + 1],
              z = arr[i + 2];
            const len = Math.sqrt(x * x + y * y + z * z);
            if (len > 0.0001) {
              arr[i] /= len;
              arr[i + 1] /= len;
              arr[i + 2] /= len;
            }
          }
          normAttr.needsUpdate = true;
        } else {
          geo.computeVertexNormals();
        }

        // Generate UV coordinates (must happen before scaling)
        generatePlanarUVs(geo);

        // Create material groups
        createMaterialGroups(geo);

        // Get actual bounds from geometry
        geo.computeBoundingBox();
        if (!geo.boundingBox) {
          reject(new Error("Failed to compute bounding box"));
          return;
        }

        const size = new Vector3();
        geo.boundingBox.getSize(size);
        const actualWidth = size.x;
        const actualHeight = size.y;
        const actualThickness = size.z;

        // Calculate ratios before normalization
        const aspectRatio = actualHeight / actualWidth;
        const thicknessRatio = actualThickness / actualWidth;

        // Normalize scale: scale so width = 1
        const scale = 1 / actualWidth;
        geo.scale(scale, scale, scale);

        // Center the geometry
        geo.computeBoundingBox();
        if (geo.boundingBox) {
          const center = new Vector3();
          geo.boundingBox.getCenter(center);
          geo.translate(-center.x, -center.y, -center.z);
        }

        resolve({ geometry: geo, aspectRatio, thicknessRatio });
      },
      undefined,
      (err) => reject(err)
    );
  });
}

/**
 * Hook to load and cache the rounded card geometry.
 * Returns { geometry, aspectRatio, thicknessRatio } where geometry is scaled to width=1.
 */
export function useCardGeometry(): {
  geometry: BufferGeometry | null;
  aspectRatio: number;
  thicknessRatio: number;
  loading: boolean;
} {
  const [info, setInfo] = useState<GeometryInfo | null>(cachedInfo);
  const [loading, setLoading] = useState(!cachedInfo);

  useEffect(() => {
    if (cachedInfo) {
      setInfo(cachedInfo);
      setLoading(false);
      return;
    }

    if (!loadingPromise) {
      loadingPromise = loadCardGeometryWithInfo();
    }

    loadingPromise
      .then((result) => {
        cachedInfo = result;
        setInfo(result);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[useCardGeometry] Failed to load card.obj:", err);
        setLoading(false);
      });
  }, []);

  // Default fallback ratios based on standard card proportions
  const defaultAspectRatio = OBJ_HEIGHT / OBJ_WIDTH;
  const defaultThicknessRatio = 0.3 / OBJ_WIDTH;

  return {
    geometry: info?.geometry ?? null,
    aspectRatio: info?.aspectRatio ?? defaultAspectRatio,
    thicknessRatio: info?.thicknessRatio ?? defaultThicknessRatio,
    loading,
  };
}

/**
 * Get the cached geometry synchronously (returns null if not loaded yet).
 * Useful for components that can fall back to box geometry.
 */
export function getCardGeometry(): BufferGeometry | null {
  return cachedInfo?.geometry ?? null;
}

/**
 * Preload the card geometry (call early in app lifecycle).
 */
export async function preloadCardGeometry(): Promise<void> {
  if (cachedInfo) return;
  if (!loadingPromise) {
    loadingPromise = loadCardGeometryWithInfo();
  }
  await loadingPromise;
}
