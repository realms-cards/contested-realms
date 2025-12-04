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
  showNotes: boolean;
  setShowNotes: (show: boolean) => void;
}

const CodexContext = createContext<CodexContextType>({
  showCodex: false,
  setShowCodex: () => {},
  showNotes: true,
  setShowNotes: () => {},
});

export function CodexProvider({ children }: { children: ReactNode }) {
  const [showCodex, setShowCodex] = useState(false);
  const [showNotes, setShowNotes] = useState(true);

  // Persist preferences
  useEffect(() => {
    const storedCodex = localStorage.getItem("collection:showCodex");
    if (storedCodex === "1") setShowCodex(true);
    const storedNotes = localStorage.getItem("collection:showNotes");
    if (storedNotes === "0") setShowNotes(false); // Default to showing notes
  }, []);

  const handleSetShowCodex = (show: boolean) => {
    setShowCodex(show);
    localStorage.setItem("collection:showCodex", show ? "1" : "0");
  };

  const handleSetShowNotes = (show: boolean) => {
    setShowNotes(show);
    localStorage.setItem("collection:showNotes", show ? "1" : "0");
  };

  return (
    <CodexContext.Provider
      value={{
        showCodex,
        setShowCodex: handleSetShowCodex,
        showNotes,
        setShowNotes: handleSetShowNotes,
      }}
    >
      {children}
    </CodexContext.Provider>
  );
}

export function useCodex() {
  return useContext(CodexContext);
}
