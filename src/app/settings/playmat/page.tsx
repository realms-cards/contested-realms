"use client";

import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import {
  RcButton,
  RcLinkButton,
  rcButtonVariants,
} from "@/components/ui/rc-button";

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

function playmatTileClass(selected: boolean, selecting: boolean): string {
  return [
    "rounded-rc-md border bg-black/30 px-3 py-2 text-left transition-colors",
    selected
      ? "border-rc-accent shadow-[0_0_18px_rgba(243,207,106,0.28)]"
      : "border-rc-line/12 hover:border-rc-accent/40",
    selecting ? "cursor-not-allowed opacity-50" : "cursor-pointer",
  ].join(" ");
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
  const [uploadExpanded, setUploadExpanded] = useState(false);

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
  const currentPlaymatCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const defaultRef = "standard:default";

  // Get current playmat preview URL
  const currentPlaymatUrl = useMemo(() => {
    if (!selectedPlaymatRef || selectedPlaymatRef === defaultRef) {
      return "/playmat.jpg";
    }
    if (selectedPlaymatRef.startsWith("custom:")) {
      const id = selectedPlaymatRef.slice("custom:".length);
      return `/api/users/me/playmats/${id}/image`;
    }
    return "/playmat.jpg";
  }, [selectedPlaymatRef]);

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

  // Render current playmat preview
  useEffect(() => {
    const canvas = currentPlaymatCanvasRef.current;
    if (!canvas) return;
    const previewW = 360;
    const previewH = Math.round((previewW * REQUIRED_HEIGHT) / REQUIRED_WIDTH);
    canvas.width = previewW;
    canvas.height = previewH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#090d19";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.onerror = () => {
      ctx.fillStyle = "#5f5c50";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Failed to load", canvas.width / 2, canvas.height / 2);
    };
    img.src = currentPlaymatUrl;
  }, [currentPlaymatUrl]);

  const [fontLoaded, setFontLoaded] = useState(false);

  useEffect(() => {
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

    // Enforce buffer dimensions
    if (canvas.width !== PREVIEW_WIDTH) canvas.width = PREVIEW_WIDTH;
    if (canvas.height !== PREVIEW_HEIGHT) canvas.height = PREVIEW_HEIGHT;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    img,
    offset.x,
    offset.y,
    scale,
    showGrid,
    gridColor,
    drawGrid,
    fontLoaded, // Needed to re-render when font loads
  ]);

  useEffect(() => {
    if (uploadExpanded) {
      renderPreview();
    }
  }, [renderPreview, uploadExpanded]);

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

    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const image = new Image();
        image.onload = () => {
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
          setOffset({
            x: (PREVIEW_WIDTH - w) / 2,
            y: (PREVIEW_HEIGHT - h) / 2,
          });
        };
        image.onerror = () => setUploadError("Failed to load image");
        image.src = result;
      };
      reader.readAsDataURL(file);
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : "Failed to load image");
    }
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="settings"
        title="Playmat"
        description={`Upload and select your playmat. Exports must be ${REQUIRED_WIDTH}×${REQUIRED_HEIGHT} PNG.`}
        actions={
          <>
            <Badge tone="gold">patrons</Badge>
            <RcLinkButton href="/" variant="outline" size="sm">
              Home
            </RcLinkButton>
          </>
        }
      />

      {loading ? (
        <div className="rc-hint py-6 text-center">loading…</div>
      ) : error ? (
        <div className="rc-alert" data-tone="danger">
          {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rc-panel">
            <PanelHeader title="Current playmat" />
            <div className="px-[18px] py-3.5">
              <p className="m-0 font-rc-sans text-xs leading-relaxed text-rc-fg-muted">
                Preview of your active playmat
              </p>

              <div className="mt-3 flex justify-center">
                <canvas
                  ref={currentPlaymatCanvasRef}
                  className="max-w-full rounded-rc-md ring-1 ring-rc-accent/35"
                  style={{
                    width: 360,
                    height: Math.round(
                      (360 * REQUIRED_HEIGHT) / REQUIRED_WIDTH,
                    ),
                  }}
                />
              </div>

              <div className="rc-eyebrow mt-6">Select playmat</div>

              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  disabled={selecting}
                  onClick={() => void setSelected(defaultRef)}
                  className={`${playmatTileClass(
                    selectedPlaymatRef === defaultRef ||
                      selectedPlaymatRef == null,
                    selecting,
                  )} w-full`}
                >
                  <div className="font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                    Default playmat
                  </div>
                  <div className="rc-hint mt-0.5">uses /playmat.jpg</div>
                </button>

                {playmats.map((p) => (
                  <div key={p.id} className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={selecting}
                      onClick={() => void setSelected(`custom:${p.id}`)}
                      className={`${playmatTileClass(
                        selectedId === p.id,
                        selecting,
                      )} min-w-0 flex-1`}
                    >
                      <div className="truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                        {p.name}
                      </div>
                      <div className="rc-hint mt-0.5">
                        {p.width}×{p.height} · {(p.sizeBytes / 1024).toFixed(0)}{" "}
                        KB
                      </div>
                    </button>
                    <RcButton
                      variant="outline"
                      onClick={() => void loadPlaymatForEditing(p)}
                      title="Edit"
                      data-active={editingPlaymatId === p.id}
                    >
                      Edit
                    </RcButton>
                    <RcButton
                      variant="destructive"
                      onClick={() => void deletePlaymat(p.id)}
                      title="Delete"
                    >
                      Delete
                    </RcButton>
                  </div>
                ))}
              </div>

              {uploadError && (
                <div className="rc-alert mt-3" data-tone="danger">
                  {uploadError}
                </div>
              )}
            </div>
          </section>

          <section className="rc-panel">
            <div className="px-[18px] py-3.5">
              {/* Upload / Edit - Collapsible */}
              <RcButton
                variant="outline"
                className="w-full justify-between"
                onClick={() => setUploadExpanded((v) => !v)}
                aria-expanded={uploadExpanded}
              >
                <span>Upload / edit</span>
                {uploadExpanded ? (
                  <ChevronUp className="h-4 w-4 text-rc-fg-muted" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-rc-fg-muted" />
                )}
              </RcButton>

              {uploadExpanded && (
                <div className="mt-3 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={name}
                      onChange={(e) => setName(e.currentTarget.value)}
                      className="rc-input h-9 min-w-0 flex-1"
                      placeholder="Playmat name"
                    />
                    <label
                      className={rcButtonVariants({
                        variant: "outline",
                        size: "sm",
                        className: "h-9 cursor-pointer",
                      })}
                    >
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
                      Choose image
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="rc-check">
                        <input
                          type="checkbox"
                          checked={showGrid}
                          onChange={() => setShowGrid((v) => !v)}
                        />
                        Grid
                      </label>
                      {showGrid && (
                        <div className="rc-segment">
                          <button
                            type="button"
                            aria-pressed={gridColor === "grey"}
                            onClick={() => setGridColor("grey")}
                          >
                            Grey
                          </button>
                          <button
                            type="button"
                            aria-pressed={gridColor === "black"}
                            onClick={() => setGridColor("black")}
                          >
                            Black
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <RcButton
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={zoomOut}
                        disabled={!img}
                        title="Zoom out"
                        aria-label="Zoom out"
                      >
                        <Minus className="h-4 w-4" />
                      </RcButton>
                      <RcButton
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={zoomIn}
                        disabled={!img}
                        title="Zoom in"
                        aria-label="Zoom in"
                      >
                        <Plus className="h-4 w-4" />
                      </RcButton>
                      <div className="rc-hint">drag to pan</div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-rc-md bg-black ring-1 ring-rc-line/12">
                    <canvas
                      ref={canvasRef}
                      width={PREVIEW_WIDTH}
                      height={PREVIEW_HEIGHT}
                      className="block h-auto w-full touch-none"
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerCancel={onPointerUp}
                      onWheel={onWheel}
                    />
                  </div>

                  <RcButton
                    disabled={uploading || !img}
                    onClick={() => void exportAndUpload()}
                  >
                    {uploading ? "Uploading…" : "Export & upload"}
                  </RcButton>

                  <div className="rc-hint">
                    upload limit: 5 playmats · stored privately
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
