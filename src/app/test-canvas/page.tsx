"use client";

import { OrbitControls } from "@react-three/drei";
import { useState } from "react";
import { SceneView } from "@/components/three/GlobalCanvas";

/**
 * Test page for the Global Canvas architecture.
 * Visit /test-canvas to see it in action.
 *
 * This demonstrates:
 * 1. Multiple 3D views sharing a single WebGL context
 * 2. Each view has its own camera and controls
 * 3. Views can be dynamically shown/hidden
 *
 * NOTE: GlobalCanvasProvider is now in the root layout, so we just use SceneView directly.
 */
export default function TestCanvasPage() {
  const [showSecond, setShowSecond] = useState(true);
  const [showThird, setShowThird] = useState(true);

  return (
    <div className="min-h-screen bg-slate-900 p-8">
      <h1 className="text-2xl font-bold text-white mb-4">Global Canvas Test</h1>
      <p className="text-slate-400 mb-6">
        Multiple 3D views sharing a single WebGL context. Each view has its own
        camera and controls.
      </p>

      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setShowSecond(!showSecond)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          {showSecond ? "Hide" : "Show"} View 2
        </button>
        <button
          onClick={() => setShowThird(!showThird)}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          {showThird ? "Hide" : "Show"} View 3
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* View 1: Red cube */}
        <div className="bg-slate-800 rounded-lg overflow-hidden">
          <h2 className="text-white p-2 bg-slate-700">View 1: Red Cube</h2>
          <SceneView
            className="w-full h-64"
            style={{
              background: "linear-gradient(to bottom, #1e293b, #0f172a)",
            }}
          >
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1} />
            <mesh>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="red" />
            </mesh>
            <OrbitControls />
          </SceneView>
        </div>

        {/* View 2: Green sphere */}
        {showSecond && (
          <div className="bg-slate-800 rounded-lg overflow-hidden">
            <h2 className="text-white p-2 bg-slate-700">
              View 2: Green Sphere
            </h2>
            <SceneView
              className="w-full h-64"
              style={{
                background: "linear-gradient(to bottom, #1e293b, #0f172a)",
              }}
            >
              <ambientLight intensity={0.5} />
              <directionalLight position={[5, 5, 5]} intensity={1} />
              <mesh>
                <sphereGeometry args={[0.7, 32, 32]} />
                <meshStandardMaterial color="green" />
              </mesh>
              <OrbitControls />
            </SceneView>
          </div>
        )}

        {/* View 3: Blue torus */}
        {showThird && (
          <div className="bg-slate-800 rounded-lg overflow-hidden">
            <h2 className="text-white p-2 bg-slate-700">View 3: Blue Torus</h2>
            <SceneView
              className="w-full h-64"
              style={{
                background: "linear-gradient(to bottom, #1e293b, #0f172a)",
              }}
            >
              <ambientLight intensity={0.5} />
              <directionalLight position={[5, 5, 5]} intensity={1} />
              <mesh>
                <torusGeometry args={[0.5, 0.2, 16, 32]} />
                <meshStandardMaterial color="blue" />
              </mesh>
              <OrbitControls />
            </SceneView>
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-slate-800 rounded-lg">
        <h3 className="text-white font-semibold mb-2">Architecture Info</h3>
        <ul className="text-slate-400 text-sm space-y-1">
          <li>✓ Single WebGL context for all views</li>
          <li>✓ Each view has independent camera/controls</li>
          <li>✓ Views can be dynamically mounted/unmounted</li>
          <li>✓ Shared textures and shaders</li>
          <li>✓ No context loss from navigation</li>
        </ul>
      </div>
    </div>
  );
}
