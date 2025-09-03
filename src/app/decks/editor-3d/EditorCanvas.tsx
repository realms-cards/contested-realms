"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import Board from "@/lib/game/Board";

export default function EditorCanvas({ children }: { children?: React.ReactNode }) {
  return (
    <div className="absolute inset-0 w-full h-full">
      <Canvas
        camera={{ position: [0, 10, 0], fov: 50 }}
        shadows
        gl={{ preserveDrawingBuffer: true, antialias: true, alpha: false, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#0b0b0c"]} />
        <ambientLight intensity={0.8} />
        <directionalLight position={[10, 12, 8]} intensity={1.35} castShadow />
        <Physics gravity={[0, -9.81, 0]}>
          <Board />
          {children}
        </Physics>
        <OrbitControls makeDefault target={[0, 0, 0]} enablePan enableZoom enableDamping dampingFactor={0.08} screenSpacePanning panSpeed={1.2} zoomSpeed={0.75} minDistance={1} maxDistance={36} minPolarAngle={0} maxPolarAngle={Math.PI / 2.05} />
      </Canvas>
    </div>
  );
}
