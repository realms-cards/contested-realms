"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

interface CollectionImportExportProps {
  onImported: () => void;
}

export default function CollectionImportExport({
  onImported,
}: CollectionImportExportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"import" | "export">("export");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleExport = async (format: "text" | "csv") => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/collection/export?format=${format}`);
      if (!res.ok) throw new Error("Export failed");

      const data = await res.text();
      setText(data);

      // Copy to clipboard
      await navigator.clipboard.writeText(data);
      setResult({
        type: "success",
        message: `Exported and copied to clipboard! (${format.toUpperCase()})`,
      });
    } catch (e) {
      setResult({
        type: "error",
        message: e instanceof Error ? e.message : "Export failed",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/collection/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          format: "csv", // Works with both "4 Card Name" and "4,Card Name"
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      const imported = data.imported || 0;
      const errors = data.errors?.length || 0;

      setResult({
        type: errors > 0 ? "error" : "success",
        message: `Imported ${imported} cards${
          errors > 0 ? `, ${errors} not found` : ""
        }`,
      });

      if (imported > 0) {
        onImported();
      }
    } catch (e) {
      setResult({
        type: "error",
        message: e instanceof Error ? e.message : "Import failed",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        title="Import/Export collection"
      >
        <span>📋</span>
        <span className="hidden sm:inline">Import/Export</span>
      </button>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999] p-4"
            onClick={() => setIsOpen(false)}
          >
            <div
              className="bg-gray-900 rounded-xl max-w-lg w-full overflow-hidden shadow-2xl border border-gray-700 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-4 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-lg font-bold">
                  Import / Export Collection
                </h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Mode toggle */}
              <div className="flex border-b border-gray-800">
                <button
                  onClick={() => setMode("export")}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    mode === "export"
                      ? "bg-gray-800 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Export
                </button>
                <button
                  onClick={() => setMode("import")}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${
                    mode === "import"
                      ? "bg-gray-800 text-white"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  Import
                </button>
              </div>

              <div className="p-4 space-y-4">
                {mode === "export" ? (
                  <>
                    <p className="text-sm text-gray-400">
                      Export your collection as a text list compatible with
                      Curiosa/deck builders.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleExport("text")}
                        disabled={loading}
                        className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium text-sm disabled:opacity-50"
                      >
                        {loading ? "Exporting..." : "Export Text (4 Card Name)"}
                      </button>
                      <button
                        onClick={() => handleExport("csv")}
                        disabled={loading}
                        className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium text-sm disabled:opacity-50"
                      >
                        Export CSV
                      </button>
                    </div>
                    {text && (
                      <textarea
                        readOnly
                        value={text}
                        className="w-full h-48 bg-gray-800 rounded p-3 text-xs font-mono"
                      />
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-400">
                      Paste a card list to add to your collection. Format:{" "}
                      <code className="bg-gray-800 px-1 rounded">
                        4 Card Name
                      </code>{" "}
                      per line.
                    </p>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="4 Apprentice Wizard&#10;2 Black Obelisk&#10;1 Queen Guinevere"
                      className="w-full h-48 bg-gray-800 rounded p-3 text-xs font-mono"
                    />
                    <button
                      onClick={handleImport}
                      disabled={loading || !text.trim()}
                      className="w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded font-medium disabled:opacity-50"
                    >
                      {loading ? "Importing..." : "Import to Collection"}
                    </button>
                  </>
                )}

                {result && (
                  <div
                    className={`text-sm px-3 py-2 rounded ${
                      result.type === "success"
                        ? "bg-green-900/30 text-green-400"
                        : "bg-red-900/30 text-red-400"
                    }`}
                  >
                    {result.message}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
