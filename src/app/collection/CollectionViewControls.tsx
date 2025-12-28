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
    <div className="flex items-center gap-4">
      {/* View Mode Toggle */}
      <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
        <button
          onClick={() => onViewModeChange("grid")}
          className={`p-2 rounded transition-colors ${
            viewMode === "grid"
              ? "bg-gray-600 text-white"
              : "text-gray-400 hover:text-white"
          }`}
          title="Grid view"
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
        <button
          onClick={() => onViewModeChange("list")}
          className={`p-2 rounded transition-colors ${
            viewMode === "list"
              ? "bg-gray-600 text-white"
              : "text-gray-400 hover:text-white"
          }`}
          title="List view"
        >
          <List className="w-4 h-4" />
        </button>
      </div>

      {/* Zoom Slider - Only show in grid mode */}
      {viewMode === "grid" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">Size:</span>
          <input
            type="range"
            min="50"
            max="150"
            step="10"
            value={zoom}
            onChange={(e) => onZoomChange(Number(e.target.value))}
            className="w-24 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <span className="text-xs text-gray-400 w-8">{zoom}%</span>
        </div>
      )}
    </div>
  );
}
