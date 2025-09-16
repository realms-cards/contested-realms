"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "colorful" | "grayscale";

interface ThemeContextValue {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode; defaultMode?: ThemeMode }>
= ({ children, defaultMode = "grayscale" }) => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return defaultMode;
    const saved = window.localStorage.getItem("sorcery:themeMode") as ThemeMode | null;
    return saved ?? defaultMode;
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    if (!body) return;

    // Apply a helpful attribute and class for CSS targeting
    body.setAttribute("data-theme-mode", mode);

    try {
      window.localStorage.setItem("sorcery:themeMode", mode);
    } catch {}
  }, [mode]);

  const value = useMemo<ThemeContextValue>(() => ({
    mode,
    setMode,
    toggle: () => setMode((prev) => (prev === "grayscale" ? "colorful" : "grayscale")),
  }), [mode]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
