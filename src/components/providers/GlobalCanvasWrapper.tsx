"use client";

import type { ReactNode } from "react";
import { GlobalCanvasProvider } from "@/components/three/GlobalCanvas";

/**
 * Client wrapper for GlobalCanvasProvider to use in server component layout.
 */
export default function GlobalCanvasWrapper({
  children,
}: {
  children: ReactNode;
}) {
  return <GlobalCanvasProvider>{children}</GlobalCanvasProvider>;
}
