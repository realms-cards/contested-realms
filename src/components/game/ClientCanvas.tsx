"use client";

import { Canvas, type CanvasProps } from "@react-three/fiber";
import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export interface ClientCanvasProps extends CanvasProps {
  children?: ReactNode;
}

const shellStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  background: "#0b0b0c",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#cbd5e1",
  fontSize: "14px",
  padding: "24px",
  textAlign: "center",
};

/**
 * Result of probing the browser/GPU for a usable WebGL2 context.
 * - "pending"      – not yet checked (SSR / first paint)
 * - "ok"           – WebGL2 available with antialiasing
 * - "ok-no-aa"     – WebGL2 available only without antialiasing (some weak GPUs
 *                    reject MSAA); we force `antialias: false` so they still render
 * - "unsupported"  – no WebGL2 context at all (e.g. pre-WebGL2 GPUs); three.js is
 *                    WebGL2-only since r163, so the 3D board cannot run here
 */
type GlStatus = "pending" | "ok" | "ok-no-aa" | "unsupported";

function probeWebGL2(): GlStatus {
  if (typeof document === "undefined") return "pending";
  const probe = (antialias: boolean): boolean => {
    let canvas: HTMLCanvasElement | null = null;
    try {
      canvas = document.createElement("canvas");
      const ctx = canvas.getContext("webgl2", {
        antialias,
        failIfMajorPerformanceCaveat: false,
      });
      if (!ctx) return false;
      // Release the probe context promptly so we don't hold a GPU context slot.
      ctx.getExtension("WEBGL_lose_context")?.loseContext();
      return true;
    } catch {
      return false;
    }
  };

  if (probe(true)) return "ok";
  if (probe(false)) return "ok-no-aa";
  return "unsupported";
}

/**
 * Client-only Canvas wrapper that prevents SSR issues with React Three Fiber and
 * degrades gracefully when WebGL2 is unavailable.
 *
 * The Canvas component from R3F uses hooks that don't work during SSR, so we delay
 * rendering until after hydration. We also probe for a usable WebGL2 context first:
 * three.js is WebGL2-only (since r163), so on hardware/drivers that can't provide
 * one (old GPUs, disabled hardware acceleration) we show an explanatory message
 * instead of a silently black canvas. GPUs that only fail because they reject MSAA
 * fall back to `antialias: false` so they keep working.
 */
export function ClientCanvas({ children, gl, ...props }: ClientCanvasProps) {
  const [status, setStatus] = useState<GlStatus>("pending");

  useEffect(() => {
    setStatus(probeWebGL2());
  }, []);

  if (status === "pending") {
    // Keep a visible scene shell during client hydration to avoid blank flashes.
    return <div style={shellStyle}>Loading 3D scene…</div>;
  }

  if (status === "unsupported") {
    return (
      <div style={shellStyle}>
        <div style={{ maxWidth: 420, lineHeight: 1.5 }}>
          <div
            style={{ fontSize: "16px", color: "#f1f5f9", marginBottom: "10px" }}
          >
            3D board unavailable
          </div>
          <div style={{ color: "#94a3b8" }}>
            Your browser or graphics hardware doesn’t support WebGL2, which the 3D
            board requires. Try the following:
            <ul
              style={{
                textAlign: "left",
                margin: "12px auto 0",
                paddingLeft: "20px",
                maxWidth: 360,
              }}
            >
              <li>
                Enable hardware acceleration in your browser settings, then
                restart it.
              </li>
              <li>Update your graphics drivers.</li>
              <li>
                Use an up-to-date version of Chrome, Edge, or Firefox.
              </li>
              <li>If the problem persists, try a newer device.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // When MSAA is the only blocker, force antialias off so the scene still renders.
  const glConfig =
    status === "ok-no-aa"
      ? typeof gl === "object" && gl !== null
        ? { ...gl, antialias: false }
        : { antialias: false }
      : gl;

  return (
    <Canvas {...props} gl={glConfig}>
      {children}
    </Canvas>
  );
}

export default ClientCanvas;
