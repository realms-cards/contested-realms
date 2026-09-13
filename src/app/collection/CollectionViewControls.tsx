"use client";

import { LayoutGrid, List } from "lucide-react";

export type ViewMode = "grid" | "list";

interface CollectionViewControlsProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

export default function CollectionViewControls({
  viewMode,
  onViewModeChange,
  zoom,
  onZoomChange,
}: CollectionViewControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* View Mode Toggle */}
      <div className="rc-segment">
        <button
          type="button"
          aria-pressed={viewMode === "grid"}
          aria-label="Grid view"
          onClick={() => onViewModeChange("grid")}
          title="Grid view"
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-pressed={viewMode === "list"}
          aria-label="List view"
          onClick={() => onViewModeChange("list")}
          title="List view"
        >
          <List className="h-4 w-4" />
        </button>
      </div>

      {/* Zoom Slider - Only show in grid mode */}
      {viewMode === "grid" && (
        <div className="flex items-center gap-2">
          <span className="rc-hint">Size</span>
          <input
            type="range"
            min="50"
            max="150"
            step="10"
            value={zoom}
            onChange={(e) => onZoomChange(Number(e.target.value))}
            aria-label="Card size"
            className="rc-range w-24"
          />
          <span className="rc-hint w-8 tabular-nums">{zoom}%</span>
        </div>
      )}
    </div>
  );
}
