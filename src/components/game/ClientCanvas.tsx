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

type GlProbeResult = {
  status: GlStatus;
  /** True when WebGL is emulated on the CPU (SwiftShader/llvmpipe) — typically
   * hardware acceleration disabled in the browser. The board technically works
   * but renders at a crawl with high CPU, the classic "great PC, 10fps" report. */
  softwareRenderer: boolean;
};

function isSoftwareRendererString(renderer: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic render/i.test(
    renderer,
  );
}

function probeWebGL2(): GlProbeResult {
  if (typeof document === "undefined") {
    return { status: "pending", softwareRenderer: false };
  }
  let softwareRenderer = false;
  const probe = (antialias: boolean): boolean => {
    let canvas: HTMLCanvasElement | null = null;
    try {
      canvas = document.createElement("canvas");
      const ctx = canvas.getContext("webgl2", {
        antialias,
        failIfMajorPerformanceCaveat: false,
      });
      if (!ctx) return false;
      try {
        const dbg = ctx.getExtension("WEBGL_debug_renderer_info");
        const renderer = dbg
          ? String(ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
          : String(ctx.getParameter(ctx.RENDERER));
        if (isSoftwareRendererString(renderer)) {
          softwareRenderer = true;
          console.warn(
            "[ClientCanvas] Software WebGL renderer detected:",
            renderer,
          );
        }
      } catch {}
      // Release the probe context promptly so we don't hold a GPU context slot.
      ctx.getExtension("WEBGL_lose_context")?.loseContext();
      return true;
    } catch {
      return false;
    }
  };

  if (probe(true)) return { status: "ok", softwareRenderer };
  if (probe(false)) return { status: "ok-no-aa", softwareRenderer };
  return { status: "unsupported", softwareRenderer };
}

const SW_WARNING_DISMISS_KEY = "sorcery:softwareGlWarningDismissed";

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
/**
 * Default device-pixel-ratio clamp for every 3D surface.
 *
 * R3F's own default is `[1, 2]`, which means a Retina/4K/5K panel
 * (devicePixelRatio 2) renders ~4x the pixels of a 1x display. Combined with the
 * fixed per-frame cost of the board (shadow pass, HDRI/PBR materials, physics),
 * that uncapped resolution is what saturates the GPU on high-end machines.
 *
 * Capping the upper bound to 1.5 keeps text/cards crisp while cutting fragment
 * work by ~1.8x on high-DPI displays. Pages that need a different budget can
 * still pass their own `dpr` prop, which overrides this default.
 */
const DEFAULT_DPR: [number, number] = [1, 1.5];

function SoftwareRendererWarning() {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SW_WARNING_DISMISS_KEY) === "true";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 90,
        maxWidth: 460,
        padding: "10px 14px",
        borderRadius: 10,
        background: "rgba(120, 53, 15, 0.92)",
        color: "#fef3c7",
        fontSize: 13,
        lineHeight: 1.45,
        boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        display: "flex",
        gap: 12,
        alignItems: "center",
        pointerEvents: "auto",
      }}
    >
      <span>
        Your browser is rendering the 3D board without GPU acceleration, which
        causes low frame rates and high CPU usage. Enable hardware acceleration
        in your browser settings, then restart the browser.
      </span>
      <button
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(SW_WARNING_DISMISS_KEY, "true");
          } catch {}
        }}
        style={{
          flexShrink: 0,
          border: "1px solid rgba(254,243,199,0.4)",
          borderRadius: 6,
          background: "transparent",
          color: "#fef3c7",
          padding: "4px 8px",
          cursor: "pointer",
        }}
      >
        Dismiss
      </button>
    </div>
  );
}

export function ClientCanvas({
  children,
  gl,
  dpr = DEFAULT_DPR,
  ...props
}: ClientCanvasProps) {
  const [status, setStatus] = useState<GlStatus>("pending");
  const [softwareRenderer, setSoftwareRenderer] = useState(false);

  useEffect(() => {
    const result = probeWebGL2();
    setSoftwareRenderer(result.softwareRenderer);
    setStatus(result.status);
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
    <>
      {softwareRenderer && <SoftwareRendererWarning />}
      <Canvas {...props} dpr={dpr} gl={glConfig}>
        {children}
      </Canvas>
    </>
  );
}

export default ClientCanvas;
