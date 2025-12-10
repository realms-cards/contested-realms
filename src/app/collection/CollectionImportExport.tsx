"use client";

import { useRef, useState } from "react";
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
  const [importFormat, setImportFormat] = useState<"sorcery" | "curiosa">(
    "sorcery"
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async (format: "text" | "csv" | "curiosa") => {
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

  const handleDownload = async (format: "text" | "csv" | "curiosa") => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/collection/export?format=${format}`);
      if (!res.ok) throw new Error("Export failed");

      const data = await res.text();
      const blob = new Blob([data], {
        type:
          format === "curiosa" || format === "csv" ? "text/csv" : "text/plain",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        format === "curiosa"
          ? `collection-${new Date().toISOString().slice(0, 10)}.csv`
          : format === "csv"
          ? "collection.csv"
          : "collection.txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setResult({
        type: "success",
        message: `Downloaded ${a.download}`,
      });
    } catch (e) {
      setResult({
        type: "error",
        message: e instanceof Error ? e.message : "Download failed",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setText(content);

      // Auto-detect Curiosa format
      if (content.toLowerCase().startsWith("card name,")) {
        setImportFormat("curiosa");
      }
    };
    reader.readAsText(file);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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
          format: importFormat,
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
                      Export your collection in various formats.
                    </p>

                    {/* Curiosa Export - Primary */}
                    <div className="p-3 bg-purple-900/30 border border-purple-700 rounded-lg space-y-2">
                      <div className="text-sm font-medium text-purple-300">
                        Curiosa Collection
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDownload("curiosa")}
                          disabled={loading}
                          className="flex-1 px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded font-medium text-sm disabled:opacity-50"
                        >
                          📥 Download CSV
                        </button>
                        <button
                          onClick={() => handleExport("curiosa")}
                          disabled={loading}
                          className="flex-1 px-3 py-2 bg-purple-600/50 hover:bg-purple-600 rounded font-medium text-sm disabled:opacity-50"
                        >
                          📋 Copy
                        </button>
                      </div>
                    </div>

                    {/* Other formats */}
                    <div className="text-xs text-gray-500 mt-2">
                      Other formats
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleExport("text")}
                        disabled={loading}
                        className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium text-sm disabled:opacity-50"
                      >
                        Text (4x Card)
                      </button>
                      <button
                        onClick={() => handleExport("csv")}
                        disabled={loading}
                        className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded font-medium text-sm disabled:opacity-50"
                      >
                        CSV
                      </button>
                    </div>

                    {text && (
                      <textarea
                        readOnly
                        value={text}
                        className="w-full h-32 bg-gray-800 rounded p-3 text-xs font-mono"
                      />
                    )}
                  </>
                ) : (
                  <>
                    {/* Curiosa Import - Primary */}
                    <div className="p-3 bg-purple-900/30 border border-purple-700 rounded-lg space-y-2">
                      <div className="text-sm font-medium text-purple-300">
                        Curiosa Collection
                      </div>
                      <p className="text-xs text-gray-400">
                        Upload a CSV exported from Curiosa (auto-detects format)
                      </p>
                      <label className="flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 rounded font-medium text-sm cursor-pointer transition-colors">
                        📤 Upload CSV File
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv,.txt"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="text-xs text-gray-500 text-center">
                      — or paste text below —
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm text-gray-400">
                        Format
                      </label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setImportFormat("sorcery")}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                            importFormat === "sorcery"
                              ? "bg-blue-600 text-white"
                              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                          }`}
                        >
                          Text (i.e. CardNexus)
                        </button>
                        <button
                          onClick={() => setImportFormat("curiosa")}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                            importFormat === "curiosa"
                              ? "bg-purple-600 text-white"
                              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                          }`}
                        >
                          Curiosa CSV
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={
                        importFormat === "curiosa"
                          ? "card name,set,finish,product,quantity,notes\n13 Treasures of Britain,Arthurian Legends,Standard,Booster,1,"
                          : "4 Apprentice Wizard\n2 Black Obelisk\n1 Queen Guinevere"
                      }
                      className="w-full h-32 bg-gray-800 rounded p-3 text-xs font-mono"
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
