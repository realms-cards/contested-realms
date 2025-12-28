"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";

interface ImportCollectionProps {
  onClose: () => void;
  onImported: () => void;
}

export default function ImportCollection({
  onClose,
  onImported,
}: ImportCollectionProps) {
  const [text, setText] = useState("");
  const [format, setFormat] = useState<"sorcery" | "csv">("sorcery");
  const [skipExisting, setSkipExisting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    errors: Array<{ name: string; message: string }>;
  } | null>(null);

  const handleImport = async () => {
    if (!text.trim()) return;

    setImporting(true);
    setResult(null);

    try {
      const res = await fetch("/api/collection/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, format, skipExisting }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({
          imported: 0,
          errors: [{ name: "Import", message: data.error || "Import failed" }],
        });
        return;
      }

      setResult({
        imported: data.imported,
        errors: data.errors || [],
      });

      if (data.imported > 0) {
        onImported();
      }
    } catch (e) {
      setResult({
        imported: 0,
        errors: [
          {
            name: "Import",
            message: e instanceof Error ? e.message : "Import failed",
          },
        ],
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="bg-gray-900 rounded-xl max-w-2xl w-full overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
          <h3 className="text-lg font-bold">Import Collection</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          {/* Format Selection */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Format</label>
            <div className="flex gap-2">
              <button
                onClick={() => setFormat("sorcery")}
                className={`flex-1 py-2 rounded-lg border ${
                  format === "sorcery"
                    ? "bg-blue-600 border-blue-500"
                    : "bg-gray-800 border-gray-700"
                }`}
              >
                Sorcery Text
              </button>
              <button
                onClick={() => setFormat("csv")}
                className={`flex-1 py-2 rounded-lg border ${
                  format === "csv"
                    ? "bg-blue-600 border-blue-500"
                    : "bg-gray-800 border-gray-700"
                }`}
              >
                CSV
              </button>
            </div>
          </div>

          {/* Skip Existing Option */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={skipExisting}
              onChange={(e) => setSkipExisting(e.target.checked)}
              className="w-4 h-4 rounded bg-gray-700 border-gray-600"
            />
            <span className="text-sm text-gray-300">Only add new cards</span>
            <span className="text-xs text-gray-500">
              (skip cards already in collection)
            </span>
          </label>

          {/* Text Input */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              {format === "sorcery"
                ? 'Paste deck list (e.g., "4 Apprentice Wizard")'
                : "Paste CSV (quantity,name per line)"}
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                format === "sorcery"
                  ? "Avatar (1)\n1 Druid\n\nMinion (20)\n4 Apprentice Wizard\n..."
                  : "4,Apprentice Wizard\n2,Fireball\n..."
              }
              className="w-full h-64 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 font-mono text-sm resize-none"
            />
          </div>

          {/* Result */}
          {result && (
            <div
              className={`rounded-lg p-4 ${
                result.imported > 0 && result.errors.length === 0
                  ? "bg-green-900/50 border border-green-700"
                  : result.errors.length > 0
                  ? "bg-yellow-900/50 border border-yellow-700"
                  : "bg-red-900/50 border border-red-700"
              }`}
            >
              {result.imported > 0 && (
                <div className="text-green-300 mb-2">
                  ✓ Imported {result.imported} cards
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="space-y-1">
                  <div className="text-yellow-300 text-sm">Errors:</div>
                  {result.errors.slice(0, 10).map((err, i) => (
                    <div key={i} className="text-sm text-yellow-200">
                      • {err.name}: {err.message}
                    </div>
                  ))}
                  {result.errors.length > 10 && (
                    <div className="text-sm text-yellow-300">
                      ...and {result.errors.length - 10} more errors
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 flex gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg"
          >
            Close
          </button>
          <button
            onClick={handleImport}
            disabled={importing || !text.trim()}
            className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium disabled:opacity-50"
          >
            {importing ? "Importing..." : "Import Cards"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
