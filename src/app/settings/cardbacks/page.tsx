"use client";

import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PanelHeader } from "@/components/ui/page-header";
import {
  RcButton,
  RcLinkButton,
  rcButtonVariants,
} from "@/components/ui/rc-button";
import { RcEmpty } from "@/components/ui/rc-empty";
import { cardbackAtlasUrl, cardbackSpellbookUrl } from "@/lib/assets";
import { FEATURE_CARD_SLEEVES } from "@/lib/config/features";
import { SLEEVE_PRESETS } from "@/lib/game/sleevePresets";

type CardbackSummary = {
  id: string;
  name: string;
  spellbookWidth: number;
  spellbookHeight: number;
  spellbookSize: number;
  atlasWidth: number;
  atlasHeight: number;
  atlasSize: number;
  createdAt: string;
  updatedAt: string;
};

type CardbacksResponse = {
  cardbacks: CardbackSummary[];
  selectedSpellbookRef: string | null;
  selectedAtlasRef: string | null;
};

// Export dimensions (final output size)
const SPELLBOOK_WIDTH = 375;
const SPELLBOOK_HEIGHT = 525;
const ATLAS_WIDTH = 525;
const ATLAS_HEIGHT = 375;

// Preview dimensions (canvas buffer AND CSS display size - keep them matched for simplicity)
const SPELLBOOK_PREVIEW_W = 150;
const SPELLBOOK_PREVIEW_H = 210;
const ATLAS_PREVIEW_W = 210;
const ATLAS_PREVIEW_H = 150;

// Must match MAX_BYTES_PER_IMAGE in /api/users/me/cardbacks
const MAX_UPLOAD_BYTES = 500_000;
const MAX_SCALE = 20;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// Editor state for a single cardback type
type EditorState = {
  img: HTMLImageElement | null;
  scale: number;
  offset: { x: number; y: number };
};

// Keep the image covering the whole frame: never zoom out past "cover" and
// never pan so far that the frame background shows through.
function clampEditorState(
  state: EditorState,
  frameW: number,
  frameH: number
): EditorState {
  if (!state.img) return state;
  const minScale = Math.max(
    frameW / state.img.naturalWidth,
    frameH / state.img.naturalHeight
  );
  const scale = clamp(state.scale, minScale, Math.max(MAX_SCALE, minScale));
  const w = state.img.naturalWidth * scale;
  const h = state.img.naturalHeight * scale;
  return {
    img: state.img,
    scale,
    offset: {
      x: clamp(state.offset.x, frameW - w, 0),
      y: clamp(state.offset.y, frameH - h, 0),
    },
  };
}

// Export a canvas as JPEG, lowering quality until it fits the server limit.
async function exportCanvasUnderLimit(
  canvas: HTMLCanvasElement,
  maxBytes: number,
  label: string
): Promise<Blob> {
  for (const quality of [0.92, 0.85, 0.75, 0.65, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob) throw new Error(`Failed to export ${label}`);
    if (blob.size <= maxBytes) return blob;
  }
  throw new Error(`${label} image is too detailed to fit the size limit`);
}

function blobToBase64(blob: Blob): Promise<string> {
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

type SleevePickerProps = {
  title: string;
  description: string;
  type: "spellbook" | "atlas";
  cardbacks: CardbackSummary[];
  selectedRef: string | null;
  selectedCustomId: string | null;
  defaultRef: string;
  defaultSelected: boolean;
  selecting: boolean;
  onSelect: (ref: string) => void;
};

function sleeveTileClass(selected: boolean, selecting: boolean): string {
  return [
    "w-full rounded-rc-md border bg-black/30 px-3 py-2 text-left transition-colors",
    selected
      ? "border-rc-accent shadow-[0_0_18px_rgba(243,207,106,0.28)]"
      : "border-rc-line/12 hover:border-rc-accent/40",
    selecting ? "cursor-not-allowed opacity-50" : "cursor-pointer",
  ].join(" ");
}

/** One sleeve slot (spellbook or atlas): default, uploads and colour presets. */
function SleevePicker({
  title,
  description,
  type,
  cardbacks,
  selectedRef,
  selectedCustomId,
  defaultRef,
  defaultSelected,
  selecting,
  onSelect,
}: SleevePickerProps) {
  return (
    <section className="rc-panel">
      <PanelHeader title={title} />
      <div className="px-[18px] py-3.5">
        <p className="m-0 font-rc-sans text-xs leading-relaxed text-rc-fg-muted">
          {description}
        </p>

        <div className="mt-3 space-y-2">
          <button
            type="button"
            disabled={selecting}
            onClick={() => onSelect(defaultRef)}
            className={sleeveTileClass(defaultSelected, selecting)}
          >
            <div className="font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
              Default
            </div>
          </button>

          {cardbacks.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={selecting}
              onClick={() => onSelect(`custom:${c.id}`)}
              className={sleeveTileClass(selectedCustomId === c.id, selecting)}
            >
              <div className="truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                {c.name}
              </div>
              <div className="rc-hint mt-0.5">
                {(
                  (type === "spellbook" ? c.spellbookSize : c.atlasSize) / 1024
                ).toFixed(0)}{" "}
                KB
              </div>
            </button>
          ))}

          {SLEEVE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={selecting}
              onClick={() => onSelect(preset.id)}
              className={sleeveTileClass(selectedRef === preset.id, selecting)}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-4 w-4 rounded-rc-sm ring-1 ring-rc-line/22"
                  style={{ backgroundColor: preset.color }}
                />
                <span className="font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                  {preset.label}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function CardbackSettingsPage() {
  // Feature gate - redirect if card sleeves feature is disabled
  if (!FEATURE_CARD_SLEEVES) {
    redirect("/");
  }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cardbacks, setCardbacks] = useState<CardbackSummary[]>([]);
  const [selectedSpellbookRef, setSelectedSpellbookRef] = useState<
    string | null
  >(null);
  const [selectedAtlasRef, setSelectedAtlasRef] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);

  const [name, setName] = useState("My Sleeves");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadExpanded, setUploadExpanded] = useState(false);

  // Spellbook editor state
  const [spellbookEditor, setSpellbookEditor] = useState<EditorState>({
    img: null,
    scale: 1,
    offset: { x: 0, y: 0 },
  });
  const spellbookDraggingRef = useRef(false);
  const spellbookDragStartRef = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);

  // Atlas editor state
  const [atlasEditor, setAtlasEditor] = useState<EditorState>({
    img: null,
    scale: 1,
    offset: { x: 0, y: 0 },
  });
  const atlasDraggingRef = useRef(false);
  const atlasDragStartRef = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);

  const spellbookCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const atlasCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentSpellbookCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const currentAtlasCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const defaultRef = "standard:default";

  // Helper to get preview info for a selection ref
  const getPreviewInfo = useCallback(
    (ref: string | null, type: "spellbook" | "atlas") => {
      if (!ref || ref === defaultRef) {
        return {
          type: "image" as const,
          url:
            type === "spellbook"
              ? cardbackSpellbookUrl()
              : cardbackAtlasUrl(),
        };
      }
      if (ref.startsWith("preset:")) {
        const preset = SLEEVE_PRESETS.find((p) => p.id === ref);
        if (preset) {
          return {
            type: "color" as const,
            color: preset.color,
            label: preset.label,
          };
        }
      }
      if (ref.startsWith("custom:")) {
        const id = ref.slice("custom:".length);
        return {
          type: "image" as const,
          url: `/api/users/me/cardbacks/${id}/${type}`,
        };
      }
      return {
        type: "image" as const,
        url:
          type === "spellbook"
            ? cardbackSpellbookUrl()
            : cardbackAtlasUrl(),
      };
    },
    []
  );

  const currentSpellbookPreview = useMemo(
    () => getPreviewInfo(selectedSpellbookRef, "spellbook"),
    [selectedSpellbookRef, getPreviewInfo]
  );
  const currentAtlasPreview = useMemo(
    () => getPreviewInfo(selectedAtlasRef, "atlas"),
    [selectedAtlasRef, getPreviewInfo]
  );

  const refresh = useCallback(async () => {
    console.log("[refresh] Starting refresh...");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me/cardbacks", { cache: "no-store" });
      console.log("[refresh] Response status:", res.status);
      if (res.status === 401) {
        setError("This feature is available to Patrons.");
        setCardbacks([]);
        setSelectedSpellbookRef(null);
        setSelectedAtlasRef(null);
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to load cardbacks (${res.status})`);
      }
      const json = (await res.json()) as CardbacksResponse;
      console.log("[refresh] Loaded cardbacks:", json.cardbacks);
      console.log("[refresh] Selected refs:", {
        spellbook: json.selectedSpellbookRef,
        atlas: json.selectedAtlasRef,
      });
      setCardbacks(Array.isArray(json.cardbacks) ? json.cardbacks : []);
      setSelectedSpellbookRef(
        typeof json.selectedSpellbookRef === "string"
          ? json.selectedSpellbookRef
          : null
      );
      setSelectedAtlasRef(
        typeof json.selectedAtlasRef === "string" ? json.selectedAtlasRef : null
      );
    } catch (e: unknown) {
      console.error("[refresh] Error:", e);
      setError(e instanceof Error ? e.message : "Failed to load sleeves");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Initialize canvas sizes explicitly to ensure buffer matches display
  useEffect(() => {
    const spellbookCanvas = spellbookCanvasRef.current;
    const atlasCanvas = atlasCanvasRef.current;
    if (spellbookCanvas) {
      spellbookCanvas.width = SPELLBOOK_PREVIEW_W;
      spellbookCanvas.height = SPELLBOOK_PREVIEW_H;
    }
    if (atlasCanvas) {
      atlasCanvas.width = ATLAS_PREVIEW_W;
      atlasCanvas.height = ATLAS_PREVIEW_H;
    }
  }, []);

  // Render spellbook editor preview
  const renderSpellbookPreview = useCallback(() => {
    const canvas = spellbookCanvasRef.current;
    if (!canvas) return;

    // Enforce buffer dimensions to match expected preview size
    if (canvas.width !== SPELLBOOK_PREVIEW_W)
      canvas.width = SPELLBOOK_PREVIEW_W;
    if (canvas.height !== SPELLBOOK_PREVIEW_H)
      canvas.height = SPELLBOOK_PREVIEW_H;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#090d19";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (spellbookEditor.img) {
      const { img, scale, offset } = spellbookEditor;
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, offset.x, offset.y, w, h);
    } else {
      ctx.fillStyle = "#5f5c50";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "Click to select image",
        canvas.width / 2,
        canvas.height / 2 - 8
      );
      ctx.font = "10px sans-serif";
      ctx.fillText(
        "Drag to pan, scroll to zoom",
        canvas.width / 2,
        canvas.height / 2 + 8
      );
    }
  }, [spellbookEditor]);

  // Render atlas editor preview
  const renderAtlasPreview = useCallback(() => {
    const canvas = atlasCanvasRef.current;
    if (!canvas) return;

    // Enforce buffer dimensions to match expected preview size
    if (canvas.width !== ATLAS_PREVIEW_W) canvas.width = ATLAS_PREVIEW_W;
    if (canvas.height !== ATLAS_PREVIEW_H) canvas.height = ATLAS_PREVIEW_H;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#090d19";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (atlasEditor.img) {
      const { img, scale, offset } = atlasEditor;
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, offset.x, offset.y, w, h);
    } else {
      ctx.fillStyle = "#5f5c50";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "Click to select image",
        canvas.width / 2,
        canvas.height / 2 - 8
      );
      ctx.font = "10px sans-serif";
      ctx.fillText(
        "Drag to pan, scroll to zoom",
        canvas.width / 2,
        canvas.height / 2 + 8
      );
    }
  }, [atlasEditor]);

  useEffect(() => {
    if (uploadExpanded) {
      renderSpellbookPreview();
    }
  }, [renderSpellbookPreview, uploadExpanded]);

  useEffect(() => {
    if (uploadExpanded) {
      renderAtlasPreview();
    }
  }, [renderAtlasPreview, uploadExpanded]);

  // Render current spellbook selection preview
  useEffect(() => {
    const canvas = currentSpellbookCanvasRef.current;
    if (!canvas) return;
    canvas.width = SPELLBOOK_PREVIEW_W;
    canvas.height = SPELLBOOK_PREVIEW_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (currentSpellbookPreview.type === "color") {
      ctx.fillStyle = currentSpellbookPreview.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.onerror = () => {
        ctx.fillStyle = "#090d19";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#5f5c50";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Failed to load", canvas.width / 2, canvas.height / 2);
      };
      img.src = currentSpellbookPreview.url;
    }
  }, [currentSpellbookPreview]);

  // Render current atlas selection preview
  useEffect(() => {
    const canvas = currentAtlasCanvasRef.current;
    if (!canvas) return;
    canvas.width = ATLAS_PREVIEW_W;
    canvas.height = ATLAS_PREVIEW_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (currentAtlasPreview.type === "color") {
      ctx.fillStyle = currentAtlasPreview.color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.onerror = () => {
        ctx.fillStyle = "#090d19";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#5f5c50";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Failed to load", canvas.width / 2, canvas.height / 2);
      };
      img.src = currentAtlasPreview.url;
    }
  }, [currentAtlasPreview]);

  // Handle file selection for spellbook
  const handleSpellbookFile = useCallback(async (file: File | null) => {
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

          // Calculate initial scale to fill the preview area
          const minScale = Math.max(
            SPELLBOOK_PREVIEW_W / image.naturalWidth,
            SPELLBOOK_PREVIEW_H / image.naturalHeight
          );
          const initialScale = minScale;
          const w = image.naturalWidth * initialScale;
          const h = image.naturalHeight * initialScale;

          setSpellbookEditor({
            img: image,
            scale: initialScale,
            offset: {
              x: (SPELLBOOK_PREVIEW_W - w) / 2,
              y: (SPELLBOOK_PREVIEW_H - h) / 2,
            },
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

  // Handle file selection for atlas
  const handleAtlasFile = useCallback(async (file: File | null) => {
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

          // Calculate initial scale to fill the preview area
          const minScale = Math.max(
            ATLAS_PREVIEW_W / image.naturalWidth,
            ATLAS_PREVIEW_H / image.naturalHeight
          );
          const initialScale = minScale;
          const w = image.naturalWidth * initialScale;
          const h = image.naturalHeight * initialScale;

          setAtlasEditor({
            img: image,
            scale: initialScale,
            offset: {
              x: (ATLAS_PREVIEW_W - w) / 2,
              y: (ATLAS_PREVIEW_H - h) / 2,
            },
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

  // Spellbook pointer handlers
  const pointerToSpellbookCanvas = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    []
  );

  const onSpellbookPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!spellbookEditor.img) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      spellbookDraggingRef.current = true;
      const p = pointerToSpellbookCanvas(e);
      spellbookDragStartRef.current = {
        x: p.x,
        y: p.y,
        ox: spellbookEditor.offset.x,
        oy: spellbookEditor.offset.y,
      };
    },
    [spellbookEditor.img, spellbookEditor.offset, pointerToSpellbookCanvas]
  );

  const onSpellbookPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!spellbookEditor.img) return;
      if (!spellbookDraggingRef.current || !spellbookDragStartRef.current)
        return;
      const p = pointerToSpellbookCanvas(e);
      const dx = p.x - spellbookDragStartRef.current.x;
      const dy = p.y - spellbookDragStartRef.current.y;
      const dragStart = spellbookDragStartRef.current;
      setSpellbookEditor((prev) =>
        clampEditorState(
          {
            ...prev,
            offset: { x: dragStart.ox + dx, y: dragStart.oy + dy },
          },
          SPELLBOOK_PREVIEW_W,
          SPELLBOOK_PREVIEW_H
        )
      );
    },
    [spellbookEditor.img, pointerToSpellbookCanvas]
  );

  const onSpellbookPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!spellbookDraggingRef.current) return;
      spellbookDraggingRef.current = false;
      spellbookDragStartRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    },
    []
  );

  const onSpellbookWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      if (!spellbookEditor.img) return;
      e.preventDefault();

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const nextScale = spellbookEditor.scale * zoomFactor;

      const imgX = (x - spellbookEditor.offset.x) / spellbookEditor.scale;
      const imgY = (y - spellbookEditor.offset.y) / spellbookEditor.scale;

      setSpellbookEditor((prev) =>
        clampEditorState(
          {
            ...prev,
            scale: nextScale,
            offset: { x: x - imgX * nextScale, y: y - imgY * nextScale },
          },
          SPELLBOOK_PREVIEW_W,
          SPELLBOOK_PREVIEW_H
        )
      );
    },
    [spellbookEditor]
  );

  // Atlas pointer handlers
  const pointerToAtlasCanvas = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    },
    []
  );

  const onAtlasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!atlasEditor.img) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      atlasDraggingRef.current = true;
      const p = pointerToAtlasCanvas(e);
      atlasDragStartRef.current = {
        x: p.x,
        y: p.y,
        ox: atlasEditor.offset.x,
        oy: atlasEditor.offset.y,
      };
    },
    [atlasEditor.img, atlasEditor.offset, pointerToAtlasCanvas]
  );

  const onAtlasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!atlasEditor.img) return;
      if (!atlasDraggingRef.current || !atlasDragStartRef.current) return;
      const p = pointerToAtlasCanvas(e);
      const dx = p.x - atlasDragStartRef.current.x;
      const dy = p.y - atlasDragStartRef.current.y;
      const dragStart = atlasDragStartRef.current;
      setAtlasEditor((prev) =>
        clampEditorState(
          {
            ...prev,
            offset: { x: dragStart.ox + dx, y: dragStart.oy + dy },
          },
          ATLAS_PREVIEW_W,
          ATLAS_PREVIEW_H
        )
      );
    },
    [atlasEditor.img, pointerToAtlasCanvas]
  );

  const onAtlasPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!atlasDraggingRef.current) return;
      atlasDraggingRef.current = false;
      atlasDragStartRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
    },
    []
  );

  const onAtlasWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      if (!atlasEditor.img) return;
      e.preventDefault();

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      const nextScale = atlasEditor.scale * zoomFactor;

      const imgX = (x - atlasEditor.offset.x) / atlasEditor.scale;
      const imgY = (y - atlasEditor.offset.y) / atlasEditor.scale;

      setAtlasEditor((prev) =>
        clampEditorState(
          {
            ...prev,
            scale: nextScale,
            offset: { x: x - imgX * nextScale, y: y - imgY * nextScale },
          },
          ATLAS_PREVIEW_W,
          ATLAS_PREVIEW_H
        )
      );
    },
    [atlasEditor]
  );

  // Zoom buttons
  const zoomSpellbook = useCallback(
    (direction: "in" | "out") => {
      if (!spellbookEditor.img) return;
      const zoomFactor = direction === "in" ? 1.15 : 0.85;
      const nextScale = spellbookEditor.scale * zoomFactor;
      const cx = SPELLBOOK_PREVIEW_W / 2;
      const cy = SPELLBOOK_PREVIEW_H / 2;
      const imgX = (cx - spellbookEditor.offset.x) / spellbookEditor.scale;
      const imgY = (cy - spellbookEditor.offset.y) / spellbookEditor.scale;
      setSpellbookEditor((prev) =>
        clampEditorState(
          {
            ...prev,
            scale: nextScale,
            offset: { x: cx - imgX * nextScale, y: cy - imgY * nextScale },
          },
          SPELLBOOK_PREVIEW_W,
          SPELLBOOK_PREVIEW_H
        )
      );
    },
    [spellbookEditor]
  );

  const zoomAtlas = useCallback(
    (direction: "in" | "out") => {
      if (!atlasEditor.img) return;
      const zoomFactor = direction === "in" ? 1.15 : 0.85;
      const nextScale = atlasEditor.scale * zoomFactor;
      const cx = ATLAS_PREVIEW_W / 2;
      const cy = ATLAS_PREVIEW_H / 2;
      const imgX = (cx - atlasEditor.offset.x) / atlasEditor.scale;
      const imgY = (cy - atlasEditor.offset.y) / atlasEditor.scale;
      setAtlasEditor((prev) =>
        clampEditorState(
          {
            ...prev,
            scale: nextScale,
            offset: { x: cx - imgX * nextScale, y: cy - imgY * nextScale },
          },
          ATLAS_PREVIEW_W,
          ATLAS_PREVIEW_H
        )
      );
    },
    [atlasEditor]
  );

  const setSelectedSleeve = useCallback(
    async (type: "spellbook" | "atlas", ref: string | null) => {
      console.log(`[setSelectedSleeve] Attempting to select ${type}:`, ref);
      setSelecting(true);
      setUploadError(null);
      try {
        const body =
          type === "spellbook"
            ? { selectedSpellbookRef: ref }
            : { selectedAtlasRef: ref };
        console.log("[setSelectedSleeve] Request body:", body);
        const res = await fetch("/api/users/me/cardbacks/selected", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        console.log("[setSelectedSleeve] Response status:", res.status);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          console.error("[setSelectedSleeve] Error response:", data);
          throw new Error(
            data?.error || `Failed to update selection (${res.status})`
          );
        }
        const responseData = await res.json();
        console.log("[setSelectedSleeve] Success response:", responseData);
        if (type === "spellbook") {
          setSelectedSpellbookRef(ref);
        } else {
          setSelectedAtlasRef(ref);
        }
      } catch (e: unknown) {
        console.error("[setSelectedSleeve] Exception:", e);
        setUploadError(
          e instanceof Error ? e.message : "Failed to update selection"
        );
      } finally {
        setSelecting(false);
      }
    },
    []
  );

  const deleteCardback = useCallback(
    async (id: string) => {
      if (!confirm("Delete these sleeves?")) return;
      try {
        const res = await fetch(`/api/users/me/cardbacks/${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || `Failed to delete (${res.status})`);
        }
        await refresh();
      } catch (e: unknown) {
        setUploadError(e instanceof Error ? e.message : "Failed to delete");
      }
    },
    [refresh]
  );

  // Export and upload cardbacks
  const uploadCardback = useCallback(async () => {
    if (!spellbookEditor.img || !atlasEditor.img) {
      setUploadError("Please select images for both spellbook and atlas");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setUploadError("Enter a name");
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      // Export spellbook at full resolution
      const spellbookScaleFactor = SPELLBOOK_WIDTH / SPELLBOOK_PREVIEW_W;
      const spellbookOut = document.createElement("canvas");
      spellbookOut.width = SPELLBOOK_WIDTH;
      spellbookOut.height = SPELLBOOK_HEIGHT;
      const spellbookCtx = spellbookOut.getContext("2d");
      if (!spellbookCtx) throw new Error("Canvas not supported");

      spellbookCtx.imageSmoothingEnabled = true;
      spellbookCtx.imageSmoothingQuality = "high";
      const sbScale = spellbookEditor.scale * spellbookScaleFactor;
      const sbW = spellbookEditor.img.naturalWidth * sbScale;
      const sbH = spellbookEditor.img.naturalHeight * sbScale;
      const sbX = spellbookEditor.offset.x * spellbookScaleFactor;
      const sbY = spellbookEditor.offset.y * spellbookScaleFactor;
      spellbookCtx.drawImage(spellbookEditor.img, sbX, sbY, sbW, sbH);

      // Export atlas at full resolution
      const atlasScaleFactor = ATLAS_WIDTH / ATLAS_PREVIEW_W;
      const atlasOut = document.createElement("canvas");
      atlasOut.width = ATLAS_WIDTH;
      atlasOut.height = ATLAS_HEIGHT;
      const atlasCtx = atlasOut.getContext("2d");
      if (!atlasCtx) throw new Error("Canvas not supported");

      atlasCtx.imageSmoothingEnabled = true;
      atlasCtx.imageSmoothingQuality = "high";
      const atScale = atlasEditor.scale * atlasScaleFactor;
      const atW = atlasEditor.img.naturalWidth * atScale;
      const atH = atlasEditor.img.naturalHeight * atScale;
      const atX = atlasEditor.offset.x * atlasScaleFactor;
      const atY = atlasEditor.offset.y * atlasScaleFactor;
      atlasCtx.drawImage(atlasEditor.img, atX, atY, atW, atH);

      // Export as JPEG so photos stay under the server's per-image limit
      // (PNG exports of photos routinely exceed it and get rejected).
      const [spellbookBlob, atlasBlob] = await Promise.all([
        exportCanvasUnderLimit(spellbookOut, MAX_UPLOAD_BYTES, "Spellbook"),
        exportCanvasUnderLimit(atlasOut, MAX_UPLOAD_BYTES, "Atlas"),
      ]);

      const [spellbookBase64, atlasBase64] = await Promise.all([
        blobToBase64(spellbookBlob),
        blobToBase64(atlasBlob),
      ]);

      const res = await fetch("/api/users/me/cardbacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          spellbookBase64,
          atlasBase64,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Upload failed (${res.status})`);
      }

      // Reset editors
      setSpellbookEditor({ img: null, scale: 1, offset: { x: 0, y: 0 } });
      setAtlasEditor({ img: null, scale: 1, offset: { x: 0, y: 0 } });
      setName("My Sleeves");
      await refresh();
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [spellbookEditor, atlasEditor, name, refresh]);

  const selectedSpellbookId =
    typeof selectedSpellbookRef === "string" &&
    selectedSpellbookRef.startsWith("custom:")
      ? selectedSpellbookRef.slice("custom:".length)
      : null;

  const selectedAtlasId =
    typeof selectedAtlasRef === "string" &&
    selectedAtlasRef.startsWith("custom:")
      ? selectedAtlasRef.slice("custom:".length)
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="settings"
        title="Card Sleeves"
        description="Upload custom sleeves for your Spellbook and Atlas. Other players will see your custom sleeves in online matches."
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
          {/* Selection panel - Spellbook */}
          <SleevePicker
            title="Spellbook sleeve"
            description="Used for portrait cards (spells, minions, etc.)"
            type="spellbook"
            cardbacks={cardbacks}
            selectedRef={selectedSpellbookRef}
            selectedCustomId={selectedSpellbookId}
            defaultRef={defaultRef}
            selecting={selecting}
            defaultSelected={
              selectedSpellbookRef === defaultRef || selectedSpellbookRef == null
            }
            onSelect={(ref) => void setSelectedSleeve("spellbook", ref)}
          />

          {/* Selection panel - Atlas */}
          <SleevePicker
            title="Atlas sleeve"
            description="Used for landscape cards (sites)"
            type="atlas"
            cardbacks={cardbacks}
            selectedRef={selectedAtlasRef}
            selectedCustomId={selectedAtlasId}
            defaultRef={defaultRef}
            selecting={selecting}
            defaultSelected={
              selectedAtlasRef === defaultRef || selectedAtlasRef == null
            }
            onSelect={(ref) => void setSelectedSleeve("atlas", ref)}
          />

          {/* Manage uploads */}
          <section className="rc-panel">
            <PanelHeader
              title="Manage uploads"
              meta={`${cardbacks.length} custom`}
            />
            <div className="px-[18px] py-3.5">
              <p className="m-0 font-rc-sans text-xs leading-relaxed text-rc-fg-muted">
                Delete custom sleeves you no longer need
              </p>

              {cardbacks.length === 0 ? (
                <RcEmpty className="mt-3" title="No custom sleeves yet.">
                  upload a pair below
                </RcEmpty>
              ) : (
                <div className="mt-3 space-y-2">
                  {cardbacks.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-2 rounded-rc-md border border-rc-line/12 bg-black/30 px-3 py-2"
                    >
                      <div className="flex-1 truncate font-rc-display text-[19px] leading-[1.1] text-rc-fg-strong">
                        {c.name}
                      </div>
                      <RcButton
                        variant="destructive"
                        size="sm"
                        onClick={() => void deleteCardback(c.id)}
                      >
                        Delete
                      </RcButton>
                    </div>
                  ))}
                </div>
              )}

              {uploadError && (
                <div className="rc-alert mt-3" data-tone="danger">
                  {uploadError}
                </div>
              )}
            </div>
          </section>

          {/* Current Selection Preview */}
          <section className="rc-panel">
            <PanelHeader title="Current selection" />
            <div className="px-[18px] py-3.5">
              <p className="m-0 font-rc-sans text-xs leading-relaxed text-rc-fg-muted">
                Preview of your active sleeves
              </p>

              <div className="mt-4 flex flex-wrap justify-center gap-4">
                {/* Current Spellbook */}
                <div className="flex flex-col items-center">
                  <div
                    style={{
                      width: SPELLBOOK_PREVIEW_W,
                      height: SPELLBOOK_PREVIEW_H,
                    }}
                    className="relative shrink-0"
                  >
                    <canvas
                      ref={currentSpellbookCanvasRef}
                      width={SPELLBOOK_PREVIEW_W}
                      height={SPELLBOOK_PREVIEW_H}
                      style={{
                        width: SPELLBOOK_PREVIEW_W,
                        height: SPELLBOOK_PREVIEW_H,
                      }}
                      className="block rounded-rc-md ring-1 ring-rc-accent/35"
                    />
                  </div>
                  <div className="mt-2 font-rc-mono text-[11px] uppercase tracking-[0.16em] text-rc-fg-subtle">
                    Spellbook
                  </div>
                </div>

                {/* Current Atlas */}
                <div className="flex flex-col items-center">
                  <div
                    style={{
                      width: ATLAS_PREVIEW_W,
                      height: ATLAS_PREVIEW_H,
                    }}
                    className="relative shrink-0"
                  >
                    <canvas
                      ref={currentAtlasCanvasRef}
                      width={ATLAS_PREVIEW_W}
                      height={ATLAS_PREVIEW_H}
                      style={{
                        width: ATLAS_PREVIEW_W,
                        height: ATLAS_PREVIEW_H,
                      }}
                      className="block rounded-rc-md ring-1 ring-rc-accent/35"
                    />
                  </div>
                  <div className="mt-2 font-rc-mono text-[11px] uppercase tracking-[0.16em] text-rc-fg-subtle">
                    Atlas
                  </div>
                </div>
              </div>

              {/* Upload New Sleeves - Collapsible */}
              <RcButton
                variant="outline"
                className="mt-6 w-full justify-between"
                onClick={() => setUploadExpanded((v) => !v)}
                aria-expanded={uploadExpanded}
              >
                <span>Upload new sleeves</span>
                {uploadExpanded ? (
                  <ChevronUp className="h-4 w-4 text-rc-fg-muted" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-rc-fg-muted" />
                )}
              </RcButton>

              {uploadExpanded && (
                <div className="mt-3 rounded-rc-md border border-rc-line/12 bg-black/30 p-3">
                  <p className="m-0 font-rc-sans text-xs leading-relaxed text-rc-fg-muted">
                    Select any image and position it within the frame. Drag to
                    pan, scroll to zoom.
                  </p>

                  <div className="mt-4 flex flex-wrap justify-center gap-4">
                    {/* Spellbook editor */}
                    <div className="flex flex-col items-center">
                      <div
                        className="relative shrink-0"
                        style={{
                          width: `${SPELLBOOK_PREVIEW_W}px`,
                          height: `${SPELLBOOK_PREVIEW_H}px`,
                          minWidth: `${SPELLBOOK_PREVIEW_W}px`,
                          minHeight: `${SPELLBOOK_PREVIEW_H}px`,
                        }}
                      >
                        <canvas
                          ref={spellbookCanvasRef}
                          width={SPELLBOOK_PREVIEW_W}
                          height={SPELLBOOK_PREVIEW_H}
                          style={{
                            width: `${SPELLBOOK_PREVIEW_W}px`,
                            height: `${SPELLBOOK_PREVIEW_H}px`,
                            minWidth: `${SPELLBOOK_PREVIEW_W}px`,
                            minHeight: `${SPELLBOOK_PREVIEW_H}px`,
                            maxWidth: "none",
                          }}
                          className="block cursor-move touch-none rounded-rc-md ring-1 ring-rc-line/22"
                          onPointerDown={onSpellbookPointerDown}
                          onPointerMove={onSpellbookPointerMove}
                          onPointerUp={onSpellbookPointerUp}
                          onPointerCancel={onSpellbookPointerUp}
                          onWheel={onSpellbookWheel}
                        />
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <RcButton
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Zoom out spellbook"
                          onClick={() => zoomSpellbook("out")}
                          disabled={!spellbookEditor.img}
                        >
                          <Minus className="h-4 w-4" />
                        </RcButton>
                        <label
                          className={rcButtonVariants({
                            variant: "outline",
                            size: "sm",
                            className: "cursor-pointer",
                          })}
                        >
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              void handleSpellbookFile(file);
                              e.target.value = "";
                            }}
                          />
                          {spellbookEditor.img ? "Change" : "Select"}
                        </label>
                        <RcButton
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Zoom in spellbook"
                          onClick={() => zoomSpellbook("in")}
                          disabled={!spellbookEditor.img}
                        >
                          <Plus className="h-4 w-4" />
                        </RcButton>
                      </div>
                      <div className="rc-hint mt-1">Spellbook</div>
                    </div>

                    {/* Atlas editor */}
                    <div className="flex flex-col items-center">
                      <div
                        className="relative shrink-0"
                        style={{
                          width: `${ATLAS_PREVIEW_W}px`,
                          height: `${ATLAS_PREVIEW_H}px`,
                          minWidth: `${ATLAS_PREVIEW_W}px`,
                          minHeight: `${ATLAS_PREVIEW_H}px`,
                        }}
                      >
                        <canvas
                          ref={atlasCanvasRef}
                          width={ATLAS_PREVIEW_W}
                          height={ATLAS_PREVIEW_H}
                          style={{
                            width: `${ATLAS_PREVIEW_W}px`,
                            height: `${ATLAS_PREVIEW_H}px`,
                            minWidth: `${ATLAS_PREVIEW_W}px`,
                            minHeight: `${ATLAS_PREVIEW_H}px`,
                            maxWidth: "none",
                          }}
                          className="block cursor-move touch-none rounded-rc-md ring-1 ring-rc-line/22"
                          onPointerDown={onAtlasPointerDown}
                          onPointerMove={onAtlasPointerMove}
                          onPointerUp={onAtlasPointerUp}
                          onPointerCancel={onAtlasPointerUp}
                          onWheel={onAtlasWheel}
                        />
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <RcButton
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Zoom out atlas"
                          onClick={() => zoomAtlas("out")}
                          disabled={!atlasEditor.img}
                        >
                          <Minus className="h-4 w-4" />
                        </RcButton>
                        <label
                          className={rcButtonVariants({
                            variant: "outline",
                            size: "sm",
                            className: "cursor-pointer",
                          })}
                        >
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              void handleAtlasFile(file);
                              e.target.value = "";
                            }}
                          />
                          {atlasEditor.img ? "Change" : "Select"}
                        </label>
                        <RcButton
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          aria-label="Zoom in atlas"
                          onClick={() => zoomAtlas("in")}
                          disabled={!atlasEditor.img}
                        >
                          <Plus className="h-4 w-4" />
                        </RcButton>
                      </div>
                      <div className="rc-hint mt-1">Atlas</div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label htmlFor="sleeve-name" className="rc-field-label">
                      Name
                    </label>
                    <input
                      id="sleeve-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="rc-input mt-1.5 h-10 w-full"
                      placeholder="My Sleeves"
                    />
                  </div>

                  {uploadError && (
                    <div className="rc-alert mt-3" data-tone="danger">
                      {uploadError}
                    </div>
                  )}

                  <RcButton
                    className="mt-4 w-full"
                    disabled={
                      uploading || !spellbookEditor.img || !atlasEditor.img
                    }
                    onClick={() => void uploadCardback()}
                  >
                    {uploading ? "Uploading…" : "Upload sleeves"}
                  </RcButton>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
