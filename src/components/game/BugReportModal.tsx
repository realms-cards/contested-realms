"use client";

import { AlertTriangle, Camera, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getLogsAsText } from "@/lib/debug/consoleCapture";

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchId?: string | null;
  userId?: string | null;
}

type SubmitState = "idle" | "capturing" | "submitting" | "success" | "error";

export default function BugReportModal({
  isOpen,
  onClose,
  matchId,
  userId,
}: BugReportModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const [includeLogs, setIncludeLogs] = useState(true);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(
    null
  );
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [issueUrl, setIssueUrl] = useState<string | null>(null);

  // Compress image by resizing and converting to JPEG
  const compressImage = useCallback(
    async (
      dataUrl: string,
      maxWidth = 1280,
      quality = 0.7
    ): Promise<string> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          let { width, height } = img;

          // Scale down if wider than maxWidth
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
          }

          // Convert to JPEG with compression
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = () => resolve(dataUrl); // Fallback to original
        img.src = dataUrl;
      });
    },
    []
  );

  // Capture screenshot when modal opens
  const captureScreenshot = useCallback(async () => {
    try {
      setSubmitState("capturing");
      // Small delay to let modal render
      await new Promise((r) => setTimeout(r, 100));

      // Dynamically import dom-to-image-more (browser-only library)
      const domtoimage = await import("dom-to-image-more");
      const rawDataUrl = await domtoimage.default.toPng(document.body, {
        bgcolor: "#000000",
        // Filter out the bug report modal itself
        filter: (node: Node) => {
          if (node instanceof Element && node.id === "bug-report-modal") {
            return false;
          }
          return true;
        },
      });

      // Compress the screenshot (resize to max 1600px wide, JPEG at 80% quality)
      // Screenshot is uploaded to separate repo, so we can use better quality
      const compressedDataUrl = await compressImage(rawDataUrl, 1600, 0.8);
      setScreenshotPreview(compressedDataUrl);
      setSubmitState("idle");
    } catch (err) {
      console.error("[BugReport] Screenshot capture failed:", err);
      setSubmitState("idle");
    }
  }, [compressImage]);

  // Auto-capture when modal opens
  useEffect(() => {
    if (isOpen && includeScreenshot && !screenshotPreview) {
      captureScreenshot();
    }
  }, [isOpen, includeScreenshot, screenshotPreview, captureScreenshot]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setTitle("");
      setDescription("");
      setScreenshotPreview(null);
      setSubmitState("idle");
      setResultMessage(null);
      setIssueUrl(null);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      setResultMessage("Please provide both a title and description");
      return;
    }

    setSubmitState("submitting");
    setResultMessage(null);

    try {
      const consoleLogs = includeLogs ? getLogsAsText() : "";

      // Extract base64 data from data URL
      let screenshotBase64: string | undefined;
      if (includeScreenshot && screenshotPreview) {
        screenshotBase64 = screenshotPreview.replace(
          /^data:image\/png;base64,/,
          ""
        );
      }

      const response = await fetch("/api/bug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          consoleLogs,
          screenshotBase64,
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: new Date().toISOString(),
          matchId,
          userId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit bug report");
      }

      setSubmitState("success");
      setResultMessage(`Bug report submitted successfully!`);
      setIssueUrl(data.issueUrl);
    } catch (err) {
      console.error("[BugReport] Submit error:", err);
      setSubmitState("error");
      setResultMessage(
        err instanceof Error ? err.message : "Failed to submit bug report"
      );
    }
  };

  const handleRetakeScreenshot = () => {
    setScreenshotPreview(null);
    captureScreenshot();
  };

  if (!isOpen) return null;

  return (
    <div
      id="bug-report-modal"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-[95vw] max-w-lg max-h-[90vh] overflow-y-auto bg-zinc-900 rounded-2xl ring-1 ring-white/10 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 bg-zinc-900 border-b border-white/10">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Report a Bug</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {submitState === "success" ? (
            <div className="text-center py-6">
              <div className="text-emerald-400 text-lg font-medium mb-4">
                ✓ {resultMessage}
              </div>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded bg-white/10 hover:bg-white/20 text-white"
              >
                Close
              </button>
              {issueUrl && (
                <a
                  href={issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-4 text-blue-400 hover:text-blue-300 underline text-sm"
                >
                  View issue on GitHub →
                </a>
              )}
            </div>
          ) : (
            <>
              {/* Title */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">
                  Bug Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Brief description of the issue..."
                  className="w-full px-3 py-2 rounded-lg bg-black/40 ring-1 ring-white/10 text-white placeholder:text-zinc-500 focus:ring-amber-500/50 focus:outline-none"
                  disabled={submitState === "submitting"}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">
                  Description *
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What happened? What did you expect to happen? Steps to reproduce..."
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 ring-1 ring-white/10 text-white placeholder:text-zinc-500 focus:ring-amber-500/50 focus:outline-none resize-none"
                  disabled={submitState === "submitting"}
                />
              </div>

              {/* Options */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeScreenshot}
                    onChange={(e) => setIncludeScreenshot(e.target.checked)}
                    className="w-4 h-4 rounded bg-white/10 border-white/20 text-amber-500 focus:ring-amber-500/50"
                    disabled={submitState === "submitting"}
                  />
                  <span className="text-sm text-zinc-300">
                    Include screenshot
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeLogs}
                    onChange={(e) => setIncludeLogs(e.target.checked)}
                    className="w-4 h-4 rounded bg-white/10 border-white/20 text-amber-500 focus:ring-amber-500/50"
                    disabled={submitState === "submitting"}
                  />
                  <span className="text-sm text-zinc-300">
                    Include console logs
                  </span>
                </label>
              </div>

              {/* Screenshot Preview */}
              {includeScreenshot && (
                <div className="rounded-lg bg-black/40 ring-1 ring-white/10 p-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-zinc-400">
                      Screenshot Preview
                    </span>
                    <button
                      onClick={handleRetakeScreenshot}
                      className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300"
                      disabled={submitState === "capturing"}
                    >
                      <Camera className="w-3 h-3" />
                      Retake
                    </button>
                  </div>
                  {submitState === "capturing" ? (
                    <div className="flex items-center justify-center h-32 text-zinc-500">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      Capturing...
                    </div>
                  ) : screenshotPreview ? (
                    <img
                      src={screenshotPreview}
                      alt="Screenshot preview"
                      className="w-full rounded border border-white/10"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-32 text-zinc-500 text-sm">
                      No screenshot captured
                    </div>
                  )}
                </div>
              )}

              {/* Error Message */}
              {resultMessage && submitState === "error" && (
                <div className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2">
                  {resultMessage}
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={
                  submitState === "submitting" || submitState === "capturing"
                }
                className="w-full py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:bg-amber-600/50 disabled:cursor-not-allowed text-white font-medium flex items-center justify-center gap-2 transition-colors"
              >
                {submitState === "submitting" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    Submit Bug Report
                  </>
                )}
              </button>

              <p className="text-xs text-zinc-500 text-center">
                Your report will be submitted to our public GitHub issues
                repository.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
