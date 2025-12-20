"use client";

import Link from "next/link";
import { redirect } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// Editor state for a single cardback type
type EditorState = {
  img: HTMLImageElement | null;
  scale: number;
  offset: { x: number; y: number };
};

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
              ? "/api/assets/cardback_spellbook.png"
              : "/api/assets/cardback_atlas.png",
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
            ? "/api/assets/cardback_spellbook.png"
            : "/api/assets/cardback_atlas.png",
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
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (spellbookEditor.img) {
      const { img, scale, offset } = spellbookEditor;
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, offset.x, offset.y, w, h);
    } else {
      ctx.fillStyle = "#64748b";
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
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (atlasEditor.img) {
      const { img, scale, offset } = atlasEditor;
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, offset.x, offset.y, w, h);
    } else {
      ctx.fillStyle = "#64748b";
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
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#64748b";
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
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#64748b";
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
      setSpellbookEditor((prev) => ({
        ...prev,
        offset: {
          x: spellbookDragStartRef.current!.ox + dx,
          y: spellbookDragStartRef.current!.oy + dy,
        },
      }));
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
      const nextScale = clamp(spellbookEditor.scale * zoomFactor, 0.05, 20);

      const imgX = (x - spellbookEditor.offset.x) / spellbookEditor.scale;
      const imgY = (y - spellbookEditor.offset.y) / spellbookEditor.scale;

      setSpellbookEditor((prev) => ({
        ...prev,
        scale: nextScale,
        offset: { x: x - imgX * nextScale, y: y - imgY * nextScale },
      }));
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
      setAtlasEditor((prev) => ({
        ...prev,
        offset: {
          x: atlasDragStartRef.current!.ox + dx,
          y: atlasDragStartRef.current!.oy + dy,
        },
      }));
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
      const nextScale = clamp(atlasEditor.scale * zoomFactor, 0.05, 20);

      const imgX = (x - atlasEditor.offset.x) / atlasEditor.scale;
      const imgY = (y - atlasEditor.offset.y) / atlasEditor.scale;

      setAtlasEditor((prev) => ({
        ...prev,
        scale: nextScale,
        offset: { x: x - imgX * nextScale, y: y - imgY * nextScale },
      }));
    },
    [atlasEditor]
  );

  // Zoom buttons
  const zoomSpellbook = useCallback(
    (direction: "in" | "out") => {
      if (!spellbookEditor.img) return;
      const zoomFactor = direction === "in" ? 1.15 : 0.85;
      const nextScale = clamp(spellbookEditor.scale * zoomFactor, 0.05, 20);
      const cx = SPELLBOOK_PREVIEW_W / 2;
      const cy = SPELLBOOK_PREVIEW_H / 2;
      const imgX = (cx - spellbookEditor.offset.x) / spellbookEditor.scale;
      const imgY = (cy - spellbookEditor.offset.y) / spellbookEditor.scale;
      setSpellbookEditor((prev) => ({
        ...prev,
        scale: nextScale,
        offset: { x: cx - imgX * nextScale, y: cy - imgY * nextScale },
      }));
    },
    [spellbookEditor]
  );

  const zoomAtlas = useCallback(
    (direction: "in" | "out") => {
      if (!atlasEditor.img) return;
      const zoomFactor = direction === "in" ? 1.15 : 0.85;
      const nextScale = clamp(atlasEditor.scale * zoomFactor, 0.05, 20);
      const cx = ATLAS_PREVIEW_W / 2;
      const cy = ATLAS_PREVIEW_H / 2;
      const imgX = (cx - atlasEditor.offset.x) / atlasEditor.scale;
      const imgY = (cy - atlasEditor.offset.y) / atlasEditor.scale;
      setAtlasEditor((prev) => ({
        ...prev,
        scale: nextScale,
        offset: { x: cx - imgX * nextScale, y: cy - imgY * nextScale },
      }));
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

      // Convert to base64
      const [spellbookBlob, atlasBlob] = await Promise.all([
        new Promise<Blob>((resolve, reject) =>
          spellbookOut.toBlob(
            (b) =>
              b ? resolve(b) : reject(new Error("Failed to export spellbook")),
            "image/png"
          )
        ),
        new Promise<Blob>((resolve, reject) =>
          atlasOut.toBlob(
            (b) =>
              b ? resolve(b) : reject(new Error("Failed to export atlas")),
            "image/png"
          )
        ),
      ]);

      const [spellbookBase64, atlasBase64] = await Promise.all([
        toBase64Png(spellbookBlob),
        toBase64Png(atlasBlob),
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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Card Sleeve Settings</h1>
            <p className="mt-1 text-sm text-slate-400">
              Upload custom sleeves for your Spellbook and Atlas.
              <br />
              <span className="text-amber-400">
                Other players will see your custom sleeves in online matches!
              </span>
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
            {/* Selection panel - Spellbook */}
            <div className="rounded-lg bg-slate-900 ring-1 ring-slate-800 p-4">
              <h2 className="text-base font-semibold">Spellbook Sleeve</h2>
              <p className="mt-1 text-xs text-slate-400">
                Used for portrait cards (spells, minions, etc.)
              </p>

              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  disabled={selecting}
                  onClick={() =>
                    void setSelectedSleeve("spellbook", defaultRef)
                  }
                  className={`w-full text-left px-3 py-2 rounded ring-1 transition-colors ${
                    selectedSpellbookRef === defaultRef ||
                    selectedSpellbookRef == null
                      ? "bg-emerald-500/10 ring-emerald-500/30"
                      : "bg-white/5 ring-white/10 hover:bg-white/10"
                  }`}
                >
                  <div className="text-sm font-medium">Default</div>
                </button>

                {cardbacks.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={selecting}
                    onClick={() =>
                      void setSelectedSleeve("spellbook", `custom:${c.id}`)
                    }
                    className={`w-full text-left px-3 py-2 rounded ring-1 transition-colors ${
                      selectedSpellbookId === c.id
                        ? "bg-emerald-500/10 ring-emerald-500/30"
                        : "bg-white/5 ring-white/10 hover:bg-white/10"
                    } ${
                      selecting
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer"
                    }`}
                  >
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {(c.spellbookSize / 1024).toFixed(0)} KB
                    </div>
                  </button>
                ))}

                {SLEEVE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={selecting}
                    onClick={() =>
                      void setSelectedSleeve("spellbook", preset.id)
                    }
                    className={`w-full text-left px-3 py-2 rounded ring-1 transition-colors ${
                      selectedSpellbookRef === preset.id
                        ? "bg-emerald-500/10 ring-emerald-500/30"
                        : "bg-white/5 ring-white/10 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded-sm ring-1 ring-white/20"
                        style={{ backgroundColor: preset.color }}
                      />
                      <span className="text-sm font-medium">
                        {preset.label}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Selection panel - Atlas */}
            <div className="rounded-lg bg-slate-900 ring-1 ring-slate-800 p-4">
              <h2 className="text-base font-semibold">Atlas Sleeve</h2>
              <p className="mt-1 text-xs text-slate-400">
                Used for landscape cards (sites)
              </p>

              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  disabled={selecting}
                  onClick={() => void setSelectedSleeve("atlas", defaultRef)}
                  className={`w-full text-left px-3 py-2 rounded ring-1 transition-colors ${
                    selectedAtlasRef === defaultRef || selectedAtlasRef == null
                      ? "bg-emerald-500/10 ring-emerald-500/30"
                      : "bg-white/5 ring-white/10 hover:bg-white/10"
                  }`}
                >
                  <div className="text-sm font-medium">Default</div>
                </button>

                {cardbacks.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={selecting}
                    onClick={() =>
                      void setSelectedSleeve("atlas", `custom:${c.id}`)
                    }
                    className={`w-full text-left px-3 py-2 rounded ring-1 transition-colors ${
                      selectedAtlasId === c.id
                        ? "bg-emerald-500/10 ring-emerald-500/30"
                        : "bg-white/5 ring-white/10 hover:bg-white/10"
                    } ${
                      selecting
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer"
                    }`}
                  >
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-[11px] text-slate-400">
                      {(c.atlasSize / 1024).toFixed(0)} KB
                    </div>
                  </button>
                ))}

                {SLEEVE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={selecting}
                    onClick={() => void setSelectedSleeve("atlas", preset.id)}
                    className={`w-full text-left px-3 py-2 rounded ring-1 transition-colors ${
                      selectedAtlasRef === preset.id
                        ? "bg-emerald-500/10 ring-emerald-500/30"
                        : "bg-white/5 ring-white/10 hover:bg-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded-sm ring-1 ring-white/20"
                        style={{ backgroundColor: preset.color }}
                      />
                      <span className="text-sm font-medium">
                        {preset.label}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Manage uploads */}
            <div className="rounded-lg bg-slate-900 ring-1 ring-slate-800 p-4">
              <h2 className="text-base font-semibold">Manage Uploads</h2>
              <p className="mt-1 text-xs text-slate-400">
                Delete custom sleeves you no longer need
              </p>

              {cardbacks.length === 0 ? (
                <div className="mt-3 text-sm text-slate-500">
                  No custom sleeves uploaded yet.
                </div>
              ) : (
                <>
                  <div className="mt-3 space-y-2">
                    {cardbacks.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-2 px-3 py-2 rounded bg-white/5 ring-1 ring-white/10"
                      >
                        <div className="flex-1 text-sm truncate">{c.name}</div>
                        <button
                          type="button"
                          onClick={() => void deleteCardback(c.id)}
                          className="px-3 py-1 rounded bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 ring-1 ring-rose-500/20 text-xs"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {uploadError && (
                <div className="mt-3 text-sm text-rose-300">{uploadError}</div>
              )}
            </div>

            {/* Current Selection Preview */}
            <div className="rounded-lg bg-slate-900 ring-1 ring-slate-800 p-4">
              <h2 className="text-base font-semibold">Current Selection</h2>
              <p className="mt-1 text-xs text-slate-400">
                Preview of your active sleeves
              </p>

              <div className="mt-4 flex gap-4 justify-center">
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
                      className="block rounded ring-1 ring-emerald-500/30"
                    />
                  </div>
                  <div className="mt-2 text-xs text-slate-300">Spellbook</div>
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
                      className="block rounded ring-1 ring-emerald-500/30"
                    />
                  </div>
                  <div className="mt-2 text-xs text-slate-300">Atlas</div>
                </div>
              </div>

              {/* Upload New Sleeves - Collapsible */}
              <button
                type="button"
                onClick={() => setUploadExpanded((v) => !v)}
                className="mt-6 w-full flex items-center justify-between px-3 py-2 rounded bg-white/5 ring-1 ring-white/10 hover:bg-white/10 transition-colors"
              >
                <span className="text-sm font-semibold">
                  Upload New Sleeves
                </span>
                <span className="text-slate-400 text-lg">
                  {uploadExpanded ? "−" : "+"}
                </span>
              </button>

              {uploadExpanded && (
                <div className="mt-3 p-3 rounded bg-slate-800/50 ring-1 ring-slate-700">
                  <p className="text-xs text-slate-400">
                    Select any image and position it within the frame. Drag to
                    pan, scroll to zoom.
                  </p>

                  <div className="mt-4 flex gap-4 justify-center flex-wrap">
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
                          className="block rounded ring-1 ring-slate-700 cursor-move touch-none"
                          onPointerDown={onSpellbookPointerDown}
                          onPointerMove={onSpellbookPointerMove}
                          onPointerUp={onSpellbookPointerUp}
                          onPointerCancel={onSpellbookPointerUp}
                          onWheel={onSpellbookWheel}
                        />
                      </div>
                      <div className="mt-2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => zoomSpellbook("out")}
                          disabled={!spellbookEditor.img}
                          className="w-7 h-7 rounded bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-sm font-bold"
                        >
                          −
                        </button>
                        <label className="cursor-pointer text-xs text-blue-300 hover:text-blue-200 px-2">
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
                        <button
                          type="button"
                          onClick={() => zoomSpellbook("in")}
                          disabled={!spellbookEditor.img}
                          className="w-7 h-7 rounded bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-sm font-bold"
                        >
                          +
                        </button>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        Spellbook
                      </div>
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
                          className="block rounded ring-1 ring-slate-700 cursor-move touch-none"
                          onPointerDown={onAtlasPointerDown}
                          onPointerMove={onAtlasPointerMove}
                          onPointerUp={onAtlasPointerUp}
                          onPointerCancel={onAtlasPointerUp}
                          onWheel={onAtlasWheel}
                        />
                      </div>
                      <div className="mt-2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => zoomAtlas("out")}
                          disabled={!atlasEditor.img}
                          className="w-7 h-7 rounded bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-sm font-bold"
                        >
                          −
                        </button>
                        <label className="cursor-pointer text-xs text-blue-300 hover:text-blue-200 px-2">
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
                        <button
                          type="button"
                          onClick={() => zoomAtlas("in")}
                          disabled={!atlasEditor.img}
                          className="w-7 h-7 rounded bg-white/10 text-white hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-sm font-bold"
                        >
                          +
                        </button>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1">
                        Atlas
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-xs text-slate-400 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-slate-800 ring-1 ring-slate-700 text-sm"
                      placeholder="My Sleeves"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={
                      uploading || !spellbookEditor.img || !atlasEditor.img
                    }
                    onClick={() => void uploadCardback()}
                    className="mt-4 w-full px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    {uploading ? "Uploading…" : "Upload Sleeves"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
