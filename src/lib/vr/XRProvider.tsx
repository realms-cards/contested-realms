"use client";

import { XR } from "@react-three/xr";
import type { ReactNode } from "react";
import { xrStore } from "./xrStore";

interface XRProviderProps {
  children: ReactNode;
}

/**
 * XR Provider component that wraps the scene content.
 * This enables VR/AR capabilities for all child components.
 */
export function XRProvider({ children }: XRProviderProps) {
  return <XR store={xrStore}>{children}</XR>;
}

export default XRProvider;
