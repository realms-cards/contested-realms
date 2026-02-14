"use client";

import { Canvas } from "@react-three/fiber";
import { XR, createXRStore } from "@react-three/xr";
import { useState } from "react";

// Create XR store at module level (important!)
const store = createXRStore();

export default function VRTestPage() {
  const [red, setRed] = useState(false);

  return (
    <div className="w-screen h-screen bg-black">
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <button
          onClick={() => store.enterVR()}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
        >
          Enter VR
        </button>
        <button
          onClick={() => store.enterAR()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Enter AR
        </button>
      </div>

      <Canvas>
        <XR store={store}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 5, 5]} />

          {/* Simple colored cube that toggles on click */}
          <mesh
            position={[0, 1.5, -2]}
            onClick={() => setRed(!red)}
          >
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshStandardMaterial color={red ? "red" : "blue"} />
          </mesh>

          {/* Floor plane */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <planeGeometry args={[10, 10]} />
            <meshStandardMaterial color="#333" />
          </mesh>

          {/* Some reference objects */}
          <mesh position={[-1, 0.25, -2]}>
            <sphereGeometry args={[0.25, 32, 32]} />
            <meshStandardMaterial color="green" />
          </mesh>

          <mesh position={[1, 0.25, -2]}>
            <cylinderGeometry args={[0.2, 0.2, 0.5, 32]} />
            <meshStandardMaterial color="orange" />
          </mesh>
        </XR>
      </Canvas>
    </div>
  );
}
