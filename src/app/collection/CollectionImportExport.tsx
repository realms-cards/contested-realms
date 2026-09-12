"use client";

import { useRef, useState } from "react";
import { RcButton, rcButtonVariants } from "@/components/ui/rc-button";
import { RcDialog } from "@/components/ui/rc-dialog";

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
      <RcButton
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        title="Import/Export collection"
      >
        Import / Export
      </RcButton>

      {isOpen && (
        <RcDialog
          title="Import / Export Collection"
          eyebrow="collection"
          onClose={() => setIsOpen(false)}
          size="md"
        >
          {/* Mode toggle */}
          <div className="rc-segment">
            <button
              type="button"
              aria-pressed={mode === "export"}
              onClick={() => setMode("export")}
            >
              Export
            </button>
            <button
              type="button"
              aria-pressed={mode === "import"}
              onClick={() => setMode("import")}
            >
              Import
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {mode === "export" ? (
              <>
                <p className="text-sm text-rc-fg-muted">
                  Export your collection in various formats.
                </p>

                {/* Curiosa Export - Primary */}
                <div className="space-y-2 rounded-rc-md border border-rc-line/18 bg-black/30 p-3">
                  <div className="rc-eyebrow">Curiosa Collection</div>
                  <div className="flex flex-wrap gap-2">
                    <RcButton
                      className="flex-1"
                      onClick={() => handleDownload("curiosa")}
                      disabled={loading}
                    >
                      Download CSV
                    </RcButton>
                    <RcButton
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleExport("curiosa")}
                      disabled={loading}
                    >
                      Copy
                    </RcButton>
                  </div>
                </div>

                {/* Other formats */}
                <div className="rc-hint">Other formats</div>
                <div className="flex flex-wrap gap-2">
                  <RcButton
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleExport("text")}
                    disabled={loading}
                  >
                    Text (4x Card)
                  </RcButton>
                  <RcButton
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleExport("csv")}
                    disabled={loading}
                  >
                    CSV
                  </RcButton>
                </div>

                {text && (
                  <textarea readOnly value={text} className="rc-textarea h-32 w-full" />
                )}
              </>
            ) : (
              <>
                {/* Curiosa Import - Primary */}
                <div className="space-y-2 rounded-rc-md border border-rc-line/18 bg-black/30 p-3">
                  <div className="rc-eyebrow">Curiosa Collection</div>
                  <p className="text-xs text-rc-fg-muted">
                    Upload a CSV exported from Curiosa (auto-detects format)
                  </p>
                  <label
                    className={rcButtonVariants({
                      className: "w-full cursor-pointer",
                    })}
                  >
                    Upload CSV File
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="rc-hint text-center">
                  — or paste text below —
                </div>

                <div className="space-y-2">
                  <div className="rc-eyebrow">Format</div>
                  <div className="rc-segment">
                    <button
                      type="button"
                      aria-pressed={importFormat === "sorcery"}
                      onClick={() => setImportFormat("sorcery")}
                    >
                      Text (i.e. CardNexus)
                    </button>
                    <button
                      type="button"
                      aria-pressed={importFormat === "curiosa"}
                      onClick={() => setImportFormat("curiosa")}
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
                  className="rc-textarea h-32 w-full"
                />
                <RcButton
                  className="w-full"
                  onClick={handleImport}
                  disabled={loading || !text.trim()}
                >
                  {loading ? "Importing..." : "Import to Collection"}
                </RcButton>
              </>
            )}

            {result && (
              <div
                className="rc-alert"
                data-tone={result.type === "success" ? "success" : "danger"}
              >
                {result.message}
              </div>
            )}
          </div>
        </RcDialog>
      )}
    </>
  );
}
