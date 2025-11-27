"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";

interface CodexContextType {
  showCodex: boolean;
  setShowCodex: (show: boolean) => void;
}

const CodexContext = createContext<CodexContextType>({
  showCodex: false,
  setShowCodex: () => {},
});

export function CodexProvider({ children }: { children: ReactNode }) {
  const [showCodex, setShowCodex] = useState(false);

  // Persist preference
  useEffect(() => {
    const stored = localStorage.getItem("collection:showCodex");
    if (stored === "1") setShowCodex(true);
  }, []);

  const handleSetShowCodex = (show: boolean) => {
    setShowCodex(show);
    localStorage.setItem("collection:showCodex", show ? "1" : "0");
  };

  return (
    <CodexContext.Provider
      value={{ showCodex, setShowCodex: handleSetShowCodex }}
    >
      {children}
    </CodexContext.Provider>
  );
}

export function useCodex() {
  return useContext(CodexContext);
}
