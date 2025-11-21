"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface ColorBlindContextValue {
  enabled: boolean;
  setEnabled: (next: boolean) => void;
  toggle: () => void;
}

const ColorBlindContext = createContext<ColorBlindContextValue | null>(null);

const STORAGE_KEY = "sorcery:colorBlindMode";

export const ColorBlindProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/users/me/color-blind", { method: "GET" });
        if (!res.ok) return;
        const data = (await res.json()) as { enabled?: boolean };
        if (!cancelled && typeof data.enabled === "boolean") {
          setEnabledState(data.enabled);
        }
      } catch {}
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      const body = document.body;
      if (enabled) {
        body.classList.add("colorblind-ui");
        body.setAttribute("data-colorblind", "true");
      } else {
        body.classList.remove("colorblind-ui");
        body.setAttribute("data-colorblind", "false");
      }
    }
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
      }
    } catch {}
  }, [enabled]);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    if (typeof window !== "undefined") {
      void fetch("/api/users/me/color-blind", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      }).catch(() => {});
    }
  }, []);

  const toggle = useCallback(() => {
    setEnabled(!enabled);
  }, [enabled, setEnabled]);

  const value = useMemo(
    () => ({ enabled, setEnabled, toggle }),
    [enabled, setEnabled, toggle]
  );

  return (
    <ColorBlindContext.Provider value={value}>
      {children}
    </ColorBlindContext.Provider>
  );
};

export function useColorBlind(): ColorBlindContextValue {
  const ctx = useContext(ColorBlindContext);
  if (!ctx) {
    throw new Error("useColorBlind must be used within a ColorBlindProvider");
  }
  return ctx;
}
