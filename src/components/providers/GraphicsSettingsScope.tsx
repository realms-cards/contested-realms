"use client";

import { useEffect } from "react";
import { useGraphicsSettings } from "@/hooks/useGraphicsSettings";

export default function GraphicsSettingsScope() {
  const { settings } = useGraphicsSettings();

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.dataset.monochromeMode = settings.monochromeMode
      ? "true"
      : "false";
  }, [settings.monochromeMode]);

  return null;
}
