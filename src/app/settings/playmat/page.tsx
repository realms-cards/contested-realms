"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PlaymatSummary = {
  id: string;
  name: string;
  width: number;
  height: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

type PlaymatsResponse = {
  playmats: PlaymatSummary[];
  selectedPlaymatRef: string | null;
};

const REQUIRED_WIDTH = 2556;
const REQUIRED_HEIGHT = 1663;
const PREVIEW_WIDTH = 900;
const PREVIEW_HEIGHT = Math.round(
  (PREVIEW_WIDTH * REQUIRED_HEIGHT) / REQUIRED_WIDTH
);

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function toBase64Png(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const idx = result.indexOf(",");
      if (idx >= 0) resolve(result.slice(idx + 1));
      else resolve(result);
    };
    reader.readAsDataURL(blob);
  });
}

export default function PlaymatSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playmats, setPlaymats] = useState<PlaymatSummary[]>([]);
  const [selectedPlaymatRef, setSelectedPlaymatRef] = useState<string | null>(
    null
  );
  const [selecting, setSelecting] = useState(false);

  const [name, setName] = useState("My Playmat");
  const [editingPlaymatId, setEditingPlaymatId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [showGrid, setShowGrid] = useState(true);
  const [gridColor, setGridColor] = useState<"grey" | "black">("grey");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const draggingRef = useRef(false);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const defaultRef = "standard:default";

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me/playmats", { cache: "no-store" });
      if (res.status === 401) {
        setError("This feature is available to Patrons.");
        setPlaymats([]);
        setSelectedPlaymatRef(null);
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to load playmats (${res.status})`);
      }
      const json = (await res.json()) as PlaymatsResponse;
      setPlaymats(Array.isArray(json.playmats) ? json.playmats : []);
      setSelectedPlaymatRef(
        typeof json.selectedPlaymatRef === "string"
          ? json.selectedPlaymatRef
          : null
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load playmats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const [fontLoaded, setFontLoaded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = PREVIEW_WIDTH;
      canvas.height = PREVIEW_HEIGHT;
    }

    // Load Fantaisie Artistique font for grid tile numbers
    const font = new FontFace(
      "Fantaisie Artistique",
      "url(/fantaisie_artistiqu.ttf)"
    );
    font
      .load()
      .then((loadedFont) => {
        document.fonts.add(loadedFont);
        setFontLoaded(true);
      })
      .catch((err) => {
        console.warn("Failed to load Fantaisie Artistique font:", err);
        setFontLoaded(true); // Continue with fallback
      });
  }, []);

  const drawGridAtScale = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      color: "grey" | "black",
      targetWidth: number,
      targetHeight: number
    ) => {
      // Scale factor from required dimensions to target
      const scaleX = targetWidth / REQUIRED_WIDTH;
      const scaleY = targetHeight / REQUIRED_HEIGHT;

      // Grid bounds (from playmat-overlay.svg)
      const gridLeft = 306.2 * scaleX;
      const gridRight = 2249.8 * scaleX;
      const gridTop = 54 * scaleY;
      const gridBottom = 1609 * scaleY;

      // Line style
      ctx.strokeStyle =
        color === "black" ? "rgba(0, 0, 0, 0.7)" : "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 2;

      // Vertical lines (6 lines for 5 columns)
      const verticalLines = [306.2, 694.9, 1083.6, 1472.4, 1861.1, 2249.8];
      verticalLines.forEach((x) => {
        ctx.beginPath();
        ctx.moveTo(x * scaleX, gridTop);
        ctx.lineTo(x * scaleX, gridBottom);
        ctx.stroke();
      });

      // Horizontal lines (5 lines for 4 rows)
      const horizontalLines = [54, 442.8, 831.5, 1220.2, 1609];
      horizontalLines.forEach((y) => {
        ctx.beginPath();
        ctx.moveTo(gridLeft, y * scaleY);
        ctx.lineTo(gridRight, y * scaleY);
        ctx.stroke();
      });

      // Tile numbers
      ctx.fillStyle =
        color === "black" ? "rgba(0, 0, 0, 0.7)" : "rgba(255, 255, 255, 0.3)";
      ctx.font = `${Math.round(32 * scaleX)}px "Fantaisie Artistique", serif`;

      const tiles = [
        { num: 1, x: 318, y: 90 },
        { num: 2, x: 707, y: 90 },
        { num: 3, x: 1096, y: 90 },
        { num: 4, x: 1484, y: 90 },
        { num: 5, x: 1873, y: 90 },
        { num: 6, x: 318, y: 479 },
        { num: 7, x: 707, y: 479 },
        { num: 8, x: 1096, y: 479 },
        { num: 9, x: 1484, y: 479 },
        { num: 10, x: 1873, y: 479 },
        { num: 11, x: 318, y: 867 },
        { num: 12, x: 707, y: 867 },
        { num: 13, x: 1096, y: 867 },
        { num: 14, x: 1484, y: 867 },
        { num: 15, x: 1873, y: 867 },
        { num: 16, x: 318, y: 1256 },
        { num: 17, x: 707, y: 1256 },
        { num: 18, x: 1096, y: 1256 },
        { num: 19, x: 1484, y: 1256 },
        { num: 20, x: 1873, y: 1256 },
      ];

      tiles.forEach((tile) => {
        ctx.fillText(String(tile.num), tile.x * scaleX, tile.y * scaleY);
      });
    },
    []
  );

  const drawGrid = useCallback(
    (ctx: CanvasRenderingContext2D, color: "grey" | "black") => {
      drawGridAtScale(ctx, color, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    },
    [drawGridAtScale]
  );

  const drawGridExport = useCallback(
    (ctx: CanvasRenderingContext2D, color: "grey" | "black") => {
      drawGridAtScale(ctx, color, REQUIRED_WIDTH, REQUIRED_HEIGHT);
    },
    [drawGridAtScale]
  );

  const renderPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!img) return;

    const sx = scale;
    const w = img.naturalWidth * sx;
    const h = img.naturalHeight * sx;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, offset.x, offset.y, w, h);

    if (showGrid) {
      drawGrid(ctx, gridColor);
    }
  }, [
    img,
    offset.x,
    offset.y,
    scale,
    showGrid,
    gridColor,
    drawGrid,
    fontLoaded,
  ]);

  useEffect(() => {
    renderPreview();
  }, [renderPreview]);

  const setSelected = useCallback(async (ref: string | null) => {
    setSelecting(true);
    setUploadError(null);
    try {
      const res = await fetch("/api/users/me/playmats/selected", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ selectedPlaymatRef: ref }),
      });
      if (res.status === 401) {
        setUploadError("Unauthorized");
        return;
      }
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || `Failed to update (${res.status})`);
      }
      const json = (await res.json()) as { selectedPlaymatRef?: string | null };
      setSelectedPlaymatRef(
        typeof json.selectedPlaymatRef === "string"
          ? json.selectedPlaymatRef
          : null
      );
    } catch (e: unknown) {
      setUploadError(
        e instanceof Error ? e.message : "Failed to update selection"
      );
    } finally {
      setSelecting(false);
    }
  }, []);

  const deletePlaymat = useCallback(
    async (id: string) => {
      setUploadError(null);
      try {
        const res = await fetch(`/api/users/me/playmats/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          throw new Error(msg || `Delete failed (${res.status})`);
        }
        await refresh();
      } catch (e: unknown) {
        setUploadError(e instanceof Error ? e.message : "Delete failed");
      }
    },
    [refresh]
  );

  const handlePickFile = useCallback(async (file: File | null) => {
    setUploadError(null);
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to load image"));
    }).catch((e: unknown) => {
      setUploadError(e instanceof Error ? e.message : "Failed to load image");
    });

    URL.revokeObjectURL(objectUrl);

    if (!image.naturalWidth || !image.naturalHeight) {
      setUploadError("Invalid image");
      return;
    }

    const minScale = Math.max(
      PREVIEW_WIDTH / image.naturalWidth,
      PREVIEW_HEIGHT / image.naturalHeight
    );

    const initialScale = minScale;
    const w = image.naturalWidth * initialScale;
    const h = image.naturalHeight * initialScale;

    setImg(image);
    setScale(initialScale);
    setOffset({ x: (PREVIEW_WIDTH - w) / 2, y: (PREVIEW_HEIGHT - h) / 2 });
  }, []);

  const pointerToCanvas = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    []
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!img) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      draggingRef.current = true;
      const p = pointerToCanvas(e);
      dragStartRef.current = { x: p.x, y: p.y, ox: offset.x, oy: offset.y };
    },
    [img, offset.x, offset.y, pointerToCanvas]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!img) return;
      if (!draggingRef.current || !dragStartRef.current) return;
      const p = pointerToCanvas(e);
      const dx = p.x - dragStartRef.current.x;
      const dy = p.y - dragStartRef.current.y;
      setOffset({
        x: dragStartRef.current.ox + dx,
        y: dragStartRef.current.oy + dy,
      });
    },
    [img, pointerToCanvas]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      dragStartRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    },
    []
  );

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      if (!img) return;
      e.preventDefault();

      const { x, y } = (() => {
        const rect = e.currentTarget.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
      })();

      const zoomFactor = e.deltaY < 0 ? 1.06 : 0.94;
      const nextScale = clamp(scale * zoomFactor, 0.05, 20);

      const imgX = (x - offset.x) / scale;
      const imgY = (y - offset.y) / scale;

      const nextOffsetX = x - imgX * nextScale;
      const nextOffsetY = y - imgY * nextScale;

      setScale(nextScale);
      setOffset({ x: nextOffsetX, y: nextOffsetY });
    },
    [img, offset.x, offset.y, scale]
  );

  const zoomIn = useCallback(() => {
    if (!img) return;
    const zoomFactor = 1.15;
    const nextScale = clamp(scale * zoomFactor, 0.05, 20);
    const cx = PREVIEW_WIDTH / 2;
    const cy = PREVIEW_HEIGHT / 2;
    const imgX = (cx - offset.x) / scale;
    const imgY = (cy - offset.y) / scale;
    setScale(nextScale);
    setOffset({ x: cx - imgX * nextScale, y: cy - imgY * nextScale });
  }, [img, offset.x, offset.y, scale]);

  const zoomOut = useCallback(() => {
    if (!img) return;
    const zoomFactor = 0.85;
    const nextScale = clamp(scale * zoomFactor, 0.05, 20);
    const cx = PREVIEW_WIDTH / 2;
    const cy = PREVIEW_HEIGHT / 2;
    const imgX = (cx - offset.x) / scale;
    const imgY = (cy - offset.y) / scale;
    setScale(nextScale);
    setOffset({ x: cx - imgX * nextScale, y: cy - imgY * nextScale });
  }, [img, offset.x, offset.y, scale]);

  const loadPlaymatForEditing = useCallback(async (playmat: PlaymatSummary) => {
    setUploadError(null);
    try {
      const imageUrl = `/api/users/me/playmats/${playmat.id}/image`;
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = imageUrl;

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Failed to load playmat image"));
      });

      if (!image.naturalWidth || !image.naturalHeight) {
        setUploadError("Invalid image");
        return;
      }

      // For existing playmats, they're already at REQUIRED dimensions
      // Set scale to fit preview
      const fitScale = Math.min(
        PREVIEW_WIDTH / image.naturalWidth,
        PREVIEW_HEIGHT / image.naturalHeight
      );

      const w = image.naturalWidth * fitScale;
      const h = image.naturalHeight * fitScale;

      setImg(image);
      setScale(fitScale);
      setOffset({ x: (PREVIEW_WIDTH - w) / 2, y: (PREVIEW_HEIGHT - h) / 2 });
      setName(playmat.name);
      setEditingPlaymatId(playmat.id);
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : "Failed to load playmat");
    }
  }, []);

  const exportAndUpload = useCallback(async () => {
    setUploadError(null);
    if (!img) {
      setUploadError("Choose an image first");
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setUploadError("Enter a name");
      return;
    }

    setUploading(true);
    try {
      const scaleFactor = REQUIRED_WIDTH / PREVIEW_WIDTH;
      const out = document.createElement("canvas");
      out.width = REQUIRED_WIDTH;
      out.height = REQUIRED_HEIGHT;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      const sx = scale * scaleFactor;
      const ox = offset.x * scaleFactor;
      const oy = offset.y * scaleFactor;

      ctx.drawImage(img, ox, oy, img.naturalWidth * sx, img.naturalHeight * sx);

      if (showGrid) {
        drawGridExport(ctx, gridColor);
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        out.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Failed to export"))),
          "image/jpeg",
          0.85 // 85% quality - good balance of size and quality
        );
      });

      const jpegBase64 = await toBase64Png(blob); // reusing helper, works for any blob

      const res = await fetch("/api/users/me/playmats", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmedName, pngBase64: jpegBase64 }),
      });

      if (res.status === 401) {
        setUploadError("Unauthorized");
        return;
      }

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(json?.error || `Upload failed (${res.status})`);
      }

      await refresh();
      setImg(null);
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [
    img,
    name,
    offset.x,
    offset.y,
    refresh,
    scale,
    showGrid,
    gridColor,
    drawGridExport,
  ]);

  const selectedId = useMemo(() => {
    if (typeof selectedPlaymatRef !== "string") return null;
    if (!selectedPlaymatRef.startsWith("custom:")) return null;
    return selectedPlaymatRef.slice("custom:".length) || null;
  }, [selectedPlaymatRef]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Playmat Settings</h1>
            <p className="mt-1 text-sm text-slate-400">
              Upload and select your playmat. Exports must be {REQUIRED_WIDTH}×
              {REQUIRED_HEIGHT} PNG.
            </p>
          </div>
          <Link href="/" className="text-sm text-slate-300 hover:text-white">
            Home
          </Link>
        </div>

        {loading ? (
          <div className="mt-6 text-sm text-slate-400">Loading…</div>
        ) : error ? (
          <div className="mt-6 rounded-lg bg-slate-900 ring-1 ring-slate-800 p-4">
            <div className="text-sm text-rose-200">{error}</div>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-lg bg-slate-900 ring-1 ring-slate-800 p-4">
              <h2 className="text-base font-semibold">Selected</h2>

              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  disabled={selecting}
                  onClick={() => void setSelected(defaultRef)}
                  className={`w-full text-left px-3 py-2 rounded ring-1 transition-colors ${
                    selectedPlaymatRef === defaultRef ||
                    selectedPlaymatRef == null
                      ? "bg-emerald-500/10 ring-emerald-500/30"
                      : "bg-white/5 ring-white/10 hover:bg-white/10"
                  }`}
                >
                  <div className="text-sm font-medium">Default Playmat</div>
                  <div className="text-[11px] text-slate-400">
                    Uses /playmat.jpg
                  </div>
                </button>

                {playmats.map((p) => (
                  <div key={p.id} className="flex gap-2">
                    <button
                      type="button"
                      disabled={selecting}
                      onClick={() => void setSelected(`custom:${p.id}`)}
                      className={`flex-1 text-left px-3 py-2 rounded ring-1 transition-colors ${
                        selectedId === p.id
                          ? "bg-emerald-500/10 ring-emerald-500/30"
                          : "bg-white/5 ring-white/10 hover:bg-white/10"
                      }`}
                    >
                      <div className="text-sm font-medium truncate">
                        {p.name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {p.width}×{p.height} · {(p.sizeBytes / 1024).toFixed(0)}{" "}
                        KB
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadPlaymatForEditing(p)}
                      className={`px-3 py-2 rounded bg-blue-500/15 text-blue-200 hover:bg-blue-500/25 ring-1 ring-blue-500/20 ${
                        editingPlaymatId === p.id ? "ring-blue-400" : ""
                      }`}
                      title="Edit"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void deletePlaymat(p.id)}
                      className="px-3 py-2 rounded bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 ring-1 ring-rose-500/20"
                      title="Delete"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>

              {uploadError && (
                <div className="mt-3 text-[11px] text-rose-200">
                  {uploadError}
                </div>
              )}
            </div>

            <div className="rounded-lg bg-slate-900 ring-1 ring-slate-800 p-4">
              <h2 className="text-base font-semibold">Upload / Edit</h2>

              <div className="mt-3 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.currentTarget.value)}
                    className="h-9 flex-1 rounded bg-slate-800 px-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/60"
                    placeholder="Playmat name"
                  />
                  <label className="h-9 px-3 inline-flex items-center rounded bg-white/10 text-sm text-white hover:bg-white/20 cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0] ?? null;
                        void handlePickFile(file);
                        e.currentTarget.value = "";
                      }}
                    />
                    Choose Image
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowGrid((v) => !v)}
                      className="h-8 px-3 rounded bg-white/10 text-xs text-white hover:bg-white/20"
                    >
                      {showGrid ? "Hide Grid" : "Show Grid"}
                    </button>
                    {showGrid && (
                      <button
                        type="button"
                        onClick={() =>
                          setGridColor((c) => (c === "grey" ? "black" : "grey"))
                        }
                        className="h-8 px-3 rounded bg-white/10 text-xs text-white hover:bg-white/20 flex items-center gap-1.5"
                      >
                        <span
                          className={`w-3 h-3 rounded-sm ring-1 ring-white/30 ${
                            gridColor === "grey" ? "bg-gray-400" : "bg-black"
                          }`}
                        />
                        {gridColor === "grey" ? "Grey" : "Black"}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={zoomOut}
                      disabled={!img}
                      className="h-8 w-8 rounded bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-lg font-bold"
                      title="Zoom out"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={zoomIn}
                      disabled={!img}
                      className="h-8 w-8 rounded bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-lg font-bold"
                      title="Zoom in"
                    >
                      +
                    </button>
                    <div className="text-[11px] text-slate-400">
                      Drag to pan
                    </div>
                  </div>
                </div>

                <div className="rounded-md overflow-hidden ring-1 ring-white/10 bg-black">
                  <canvas
                    ref={canvasRef}
                    width={PREVIEW_WIDTH}
                    height={PREVIEW_HEIGHT}
                    className="block w-full h-auto touch-none"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onWheel={onWheel}
                  />
                </div>

                <button
                  type="button"
                  disabled={uploading || !img}
                  onClick={() => void exportAndUpload()}
                  className={`h-10 rounded bg-purple-600 text-sm font-semibold text-white hover:bg-purple-500 transition-colors ${
                    uploading || !img ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                >
                  {uploading ? "Uploading…" : "Export & Upload"}
                </button>

                <div className="text-[11px] text-slate-400">
                  Upload limit: 5 playmats. Stored privately.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
