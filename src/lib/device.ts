"use client";

// Simple device heuristics for performance-sensitive targets.
// These checks run only in the browser and fall back safely on the server.

let cachedIsSwitch: boolean | null = null;

/**
 * Best-effort Nintendo Switch web browser detection via User-Agent.
 * Known UAs include substrings like:
 * - "Nintendo Switch" or "(Nintendo Switch;"; some include "WebApplet"
 * - Some firmwares include "NintendoBrowser"
 */
export function isHandheldSwitch(): boolean {
  if (cachedIsSwitch != null) return cachedIsSwitch;
  if (typeof navigator === "undefined") return false;
  const ua = (navigator.userAgent || navigator.vendor || "").toLowerCase();
  // Heuristics: match common Switch UA tokens conservatively
  const hit = ua.includes("nintendo switch") || ua.includes("nintendobrowser");
  cachedIsSwitch = !!hit;
  return cachedIsSwitch;
}

/**
 * Should we prefer raster/WebP textures on this device?
 * Currently returns true for Nintendo Switch to reduce CPU and energy usage.
 */
export function preferRasterOnThisDevice(): boolean {
  try {
    if (isHandheldSwitch()) return true;
  } catch {}
  return false;
}
