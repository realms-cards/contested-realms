"use client";

import { useMemo } from "react";
import { Color, type Object3D, type Raycaster, type Intersection } from "three";

function noopRaycast(
  this: Object3D,
  _raycaster: Raycaster,
  _intersects: Intersection[],
): void {
  void _raycaster;
  void _intersects;
}

interface CardBorderProps {
  width: number;
  height: number;
  rotationZ?: number;
  elevation?: number;
  color?: string;
  thickness?: number;
  renderOrder?: number;
}

export default function CardBorder({
  width,
  height,
  rotationZ = 0,
  elevation = 0,
  color = "#fbbf24",
  thickness = 0.04,
  renderOrder = 10000,
}: CardBorderProps) {
  const aspect = width / height;

  const uniforms = useMemo(
    () => ({
      u_color: { value: new Color(color) },
      u_aspect: { value: aspect },
      u_thickness: { value: thickness },
      u_radius: { value: 0.08 },
    }),
    [aspect, color, thickness],
  );

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      rotation-z={rotationZ}
      position={[0, elevation, 0]}
      renderOrder={renderOrder}
      raycast={noopRaycast}
    >
      <planeGeometry args={[width * 1.06, height * 1.06]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          precision highp float;
          varying vec2 vUv;
          uniform vec3 u_color;
          uniform float u_aspect;
          uniform float u_thickness;
          uniform float u_radius;

          float sdRoundedBox(in vec2 p, in vec2 b, in float r) {
            vec2 q = abs(p) - b + vec2(r);
            return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
          }

          void main() {
            vec2 p = (vUv - 0.5) * 2.0;
            p.x *= u_aspect;

            vec2 b = vec2(u_aspect, 1.0) * 0.5;

            float d = sdRoundedBox(p, b, u_radius);
            
            // Create a sharp border outline
            float border = smoothstep(u_thickness, u_thickness - 0.01, abs(d));
            float inside = step(d, 0.0);
            float a = border * inside;

            if (a <= 0.001) discard;
            gl_FragColor = vec4(u_color, a);
          }
        `}
        transparent
        depthWrite={false}
        depthTest={false}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
        toneMapped={false}
      />
    </mesh>
  );
}
