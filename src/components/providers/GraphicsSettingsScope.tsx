"use client";

import { useEffect } from "react";
import { useGraphicsSettings } from "@/hooks/useGraphicsSettings";

export default function GraphicsSettingsScope() {
  const { settings } = useGraphicsSettings();

  useEffect(() => {
    if (typeof document === "undefined") return;
    // On the ROOT element, not body: the grayscale filter keyed off this would otherwise make
    // its host a containing block for fixed-positioned descendants and collapse the game view.
    // See the rule in globals.css.
    document.documentElement.dataset.monochromeMode = settings.monochromeMode
      ? "true"
      : "false";
  }, [settings.monochromeMode]);

  return null;
}
