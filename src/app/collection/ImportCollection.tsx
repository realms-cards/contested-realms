"use client";

import { useState } from "react";
import { RcButton } from "@/components/ui/rc-button";
import { RcDialog } from "@/components/ui/rc-dialog";

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

  const resultTone = !result
    ? "info"
    : result.imported > 0 && result.errors.length === 0
    ? "success"
    : result.errors.length > 0
    ? "warning"
    : "danger";

  return (
    <RcDialog
      title="Import Collection"
      eyebrow="collection"
      onClose={onClose}
      size="lg"
      actions={
        <>
          <RcButton variant="outline" onClick={onClose}>
            Close
          </RcButton>
          <RcButton onClick={handleImport} disabled={importing || !text.trim()}>
            {importing ? "Importing..." : "Import Cards"}
          </RcButton>
        </>
      }
    >
      <div className="space-y-4">
        {/* Format Selection */}
        <div>
          <div className="rc-eyebrow mb-2">Format</div>
          <div className="rc-segment">
            <button
              type="button"
              aria-pressed={format === "sorcery"}
              onClick={() => setFormat("sorcery")}
            >
              Sorcery Text
            </button>
            <button
              type="button"
              aria-pressed={format === "csv"}
              onClick={() => setFormat("csv")}
            >
              CSV
            </button>
          </div>
        </div>

        {/* Skip Existing Option */}
        <label className="rc-check">
          <input
            type="checkbox"
            checked={skipExisting}
            onChange={(e) => setSkipExisting(e.target.checked)}
          />
          Only add new cards (skip cards already in collection)
        </label>

        {/* Text Input */}
        <div>
          <div className="rc-eyebrow mb-2">
            {format === "sorcery"
              ? 'Paste deck list (e.g., "4 Apprentice Wizard")'
              : "Paste CSV (quantity,name per line)"}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              format === "sorcery"
                ? "Avatar (1)\n1 Druid\n\nMinion (20)\n4 Apprentice Wizard\n..."
                : "4,Apprentice Wizard\n2,Fireball\n..."
            }
            className="rc-textarea h-64 w-full resize-none"
          />
        </div>

        {/* Result */}
        {result && (
          <div className="rc-alert" data-tone={resultTone}>
            {result.imported > 0 && (
              <div className="mb-2">Imported {result.imported} cards</div>
            )}
            {result.errors.length > 0 && (
              <div className="space-y-1">
                <div>Errors:</div>
                {result.errors.slice(0, 10).map((err, i) => (
                  <div key={i}>
                    · {err.name}: {err.message}
                  </div>
                ))}
                {result.errors.length > 10 && (
                  <div>...and {result.errors.length - 10} more errors</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </RcDialog>
  );
}
