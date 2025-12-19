"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

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
  selectedCardbackRef: string | null;
};

const SPELLBOOK_WIDTH = 375;
const SPELLBOOK_HEIGHT = 525;
const ATLAS_WIDTH = 525;
const ATLAS_HEIGHT = 375;

const PREVIEW_SCALE = 0.6;
const SPELLBOOK_PREVIEW_W = Math.round(SPELLBOOK_WIDTH * PREVIEW_SCALE);
const SPELLBOOK_PREVIEW_H = Math.round(SPELLBOOK_HEIGHT * PREVIEW_SCALE);
const ATLAS_PREVIEW_W = Math.round(ATLAS_WIDTH * PREVIEW_SCALE);
const ATLAS_PREVIEW_H = Math.round(ATLAS_HEIGHT * PREVIEW_SCALE);

function toBase64(blob: Blob): Promise<string> {
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

export default function CardbackSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cardbacks, setCardbacks] = useState<CardbackSummary[]>([]);
  const [selectedCardbackRef, setSelectedCardbackRef] = useState<string | null>(
    null
  );
  const [selecting, setSelecting] = useState(false);

  const [name, setName] = useState("My Sleeves");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [spellbookImg, setSpellbookImg] = useState<HTMLImageElement | null>(
    null
  );
  const [atlasImg, setAtlasImg] = useState<HTMLImageElement | null>(null);
  const [spellbookFile, setSpellbookFile] = useState<File | null>(null);
  const [atlasFile, setAtlasFile] = useState<File | null>(null);

  const spellbookCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const atlasCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const defaultRef = "standard:default";

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users/me/cardbacks", { cache: "no-store" });
      if (res.status === 401) {
        setError("This feature is available to Patrons.");
        setCardbacks([]);
        setSelectedCardbackRef(null);
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to load cardbacks (${res.status})`);
      }
      const json = (await res.json()) as CardbacksResponse;
      setCardbacks(Array.isArray(json.cardbacks) ? json.cardbacks : []);
      setSelectedCardbackRef(
        typeof json.selectedCardbackRef === "string"
          ? json.selectedCardbackRef
          : null
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load sleeves");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  const renderSpellbookPreview = useCallback(() => {
    const canvas = spellbookCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (spellbookImg) {
      ctx.drawImage(spellbookImg, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#64748b";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Spellbook", canvas.width / 2, canvas.height / 2);
      ctx.font = "11px sans-serif";
      ctx.fillText(
        `${SPELLBOOK_WIDTH}×${SPELLBOOK_HEIGHT}`,
        canvas.width / 2,
        canvas.height / 2 + 18
      );
    }
  }, [spellbookImg]);

  const renderAtlasPreview = useCallback(() => {
    const canvas = atlasCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (atlasImg) {
      ctx.drawImage(atlasImg, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#64748b";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Atlas", canvas.width / 2, canvas.height / 2);
      ctx.font = "11px sans-serif";
      ctx.fillText(
        `${ATLAS_WIDTH}×${ATLAS_HEIGHT}`,
        canvas.width / 2,
        canvas.height / 2 + 18
      );
    }
  }, [atlasImg]);

  useEffect(() => {
    renderSpellbookPreview();
  }, [renderSpellbookPreview]);

  useEffect(() => {
    renderAtlasPreview();
  }, [renderAtlasPreview]);

  const handleSpellbookFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploadError(null);
      setSpellbookFile(file);

      const img = new Image();
      img.onload = () => {
        if (
          img.naturalWidth !== SPELLBOOK_WIDTH ||
          img.naturalHeight !== SPELLBOOK_HEIGHT
        ) {
          setUploadError(
            `Spellbook must be ${SPELLBOOK_WIDTH}×${SPELLBOOK_HEIGHT} (got ${img.naturalWidth}×${img.naturalHeight})`
          );
          setSpellbookImg(null);
          setSpellbookFile(null);
          return;
        }
        setSpellbookImg(img);
      };
      img.onerror = () => {
        setUploadError("Failed to load spellbook image");
        setSpellbookImg(null);
        setSpellbookFile(null);
      };
      img.src = URL.createObjectURL(file);
    },
    []
  );

  const handleAtlasFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploadError(null);
      setAtlasFile(file);

      const img = new Image();
      img.onload = () => {
        if (
          img.naturalWidth !== ATLAS_WIDTH ||
          img.naturalHeight !== ATLAS_HEIGHT
        ) {
          setUploadError(
            `Atlas must be ${ATLAS_WIDTH}×${ATLAS_HEIGHT} (got ${img.naturalWidth}×${img.naturalHeight})`
          );
          setAtlasImg(null);
          setAtlasFile(null);
          return;
        }
        setAtlasImg(img);
      };
      img.onerror = () => {
        setUploadError("Failed to load atlas image");
        setAtlasImg(null);
        setAtlasFile(null);
      };
      img.src = URL.createObjectURL(file);
    },
    []
  );

  const setSelected = useCallback(async (ref: string | null) => {
    setSelecting(true);
    setUploadError(null);
    try {
      const res = await fetch("/api/users/me/cardbacks/selected", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedCardbackRef: ref }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data?.error || `Failed to update selection (${res.status})`
        );
      }
      setSelectedCardbackRef(ref);
    } catch (e: unknown) {
      setUploadError(
        e instanceof Error ? e.message : "Failed to update selection"
      );
    } finally {
      setSelecting(false);
    }
  }, []);

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

  const uploadCardback = useCallback(async () => {
    if (!spellbookFile || !atlasFile || !spellbookImg || !atlasImg) {
      setUploadError("Please select both spellbook and atlas images");
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const [spellbookBase64, atlasBase64] = await Promise.all([
        toBase64(spellbookFile),
        toBase64(atlasFile),
      ]);

      const res = await fetch("/api/users/me/cardbacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          spellbookBase64,
          atlasBase64,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Upload failed (${res.status})`);
      }

      setSpellbookImg(null);
      setAtlasImg(null);
      setSpellbookFile(null);
      setAtlasFile(null);
      setName("My Sleeves");
      await refresh();
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [spellbookFile, atlasFile, spellbookImg, atlasImg, name, refresh]);

  const selectedId =
    typeof selectedCardbackRef === "string" &&
    selectedCardbackRef.startsWith("custom:")
      ? selectedCardbackRef.slice("custom:".length)
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
            {/* Selection panel */}
            <div className="rounded-lg bg-slate-900 ring-1 ring-slate-800 p-4">
              <h2 className="text-base font-semibold">Selected</h2>

              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  disabled={selecting}
                  onClick={() => void setSelected(defaultRef)}
                  className={`w-full text-left px-3 py-2 rounded ring-1 transition-colors ${
                    selectedCardbackRef === defaultRef ||
                    selectedCardbackRef == null
                      ? "bg-emerald-500/10 ring-emerald-500/30"
                      : "bg-white/5 ring-white/10 hover:bg-white/10"
                  }`}
                >
                  <div className="text-sm font-medium">Default Sleeves</div>
                  <div className="text-[11px] text-slate-400">
                    Standard Sorcery sleeves
                  </div>
                </button>

                {cardbacks.map((c) => (
                  <div key={c.id} className="flex gap-2">
                    <button
                      type="button"
                      disabled={selecting}
                      onClick={() => void setSelected(`custom:${c.id}`)}
                      className={`flex-1 text-left px-3 py-2 rounded ring-1 transition-colors ${
                        selectedId === c.id
                          ? "bg-emerald-500/10 ring-emerald-500/30"
                          : "bg-white/5 ring-white/10 hover:bg-white/10"
                      }`}
                    >
                      <div className="text-sm font-medium truncate">
                        {c.name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {(c.spellbookSize / 1024).toFixed(0)} KB +{" "}
                        {(c.atlasSize / 1024).toFixed(0)} KB
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteCardback(c.id)}
                      className="px-3 py-2 rounded bg-rose-500/15 text-rose-200 hover:bg-rose-500/25 ring-1 ring-rose-500/20"
                      title="Delete"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>

              {uploadError && (
                <div className="mt-3 text-sm text-rose-300">{uploadError}</div>
              )}
            </div>

            {/* Upload panel */}
            <div className="rounded-lg bg-slate-900 ring-1 ring-slate-800 p-4">
              <h2 className="text-base font-semibold">Upload New Sleeves</h2>
              <p className="mt-1 text-xs text-slate-400">
                Both images are required. PNG or JPEG.
              </p>

              <div className="mt-4 flex gap-4 justify-center">
                {/* Spellbook preview */}
                <div className="flex flex-col items-center">
                  <canvas
                    ref={spellbookCanvasRef}
                    className="rounded ring-1 ring-slate-700"
                    style={{
                      width: SPELLBOOK_PREVIEW_W,
                      height: SPELLBOOK_PREVIEW_H,
                    }}
                  />
                  <label className="mt-2 cursor-pointer text-xs text-blue-300 hover:text-blue-200">
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={handleSpellbookFile}
                    />
                    {spellbookImg ? "Change Spellbook" : "Select Spellbook"}
                  </label>
                  <div className="text-[10px] text-slate-500">
                    {SPELLBOOK_WIDTH}×{SPELLBOOK_HEIGHT}
                  </div>
                </div>

                {/* Atlas preview */}
                <div className="flex flex-col items-center">
                  <canvas
                    ref={atlasCanvasRef}
                    className="rounded ring-1 ring-slate-700"
                    style={{
                      width: ATLAS_PREVIEW_W,
                      height: ATLAS_PREVIEW_H,
                    }}
                  />
                  <label className="mt-2 cursor-pointer text-xs text-blue-300 hover:text-blue-200">
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={handleAtlasFile}
                    />
                    {atlasImg ? "Change Atlas" : "Select Atlas"}
                  </label>
                  <div className="text-[10px] text-slate-500">
                    {ATLAS_WIDTH}×{ATLAS_HEIGHT}
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
                  placeholder="My Cardbacks"
                />
              </div>

              <button
                type="button"
                disabled={uploading || !spellbookImg || !atlasImg}
                onClick={() => void uploadCardback()}
                className="mt-4 w-full px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {uploading ? "Uploading…" : "Upload Sleeves"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
