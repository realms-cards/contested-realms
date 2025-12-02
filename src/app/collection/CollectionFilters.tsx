"use client";

import { useEffect, useState } from "react";
import type {
  CollectionFilters as FilterType,
  CollectionSortField,
  SortOrder,
} from "@/lib/collection/types";

interface CollectionFiltersProps {
  filters: FilterType;
  sort: CollectionSortField;
  order: SortOrder;
  onFiltersChange: (filters: FilterType) => void;
  onSortChange: (sort: CollectionSortField, order: SortOrder) => void;
}

interface SetOption {
  id: number;
  name: string;
}

const ELEMENTS = ["Air", "Earth", "Fire", "Water"];
const TYPES = ["Avatar", "Minion", "Magic", "Artifact", "Aura", "Site"];
const RARITIES = ["Ordinary", "Exceptional", "Elite", "Unique"];

export default function CollectionFilters({
  filters,
  sort,
  order,
  onFiltersChange,
  onSortChange,
}: CollectionFiltersProps) {
  const [sets, setSets] = useState<SetOption[]>([]);
  const [search, setSearch] = useState(filters.search || "");

  // Fetch available sets
  useEffect(() => {
    fetch("/api/cards/sets")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setSets(
            data.map((s: { id: number; name: string }) => ({
              id: s.id,
              name: s.name,
            }))
          );
        }
      })
      .catch(() => {
        // Fallback sets
        setSets([
          { id: 1, name: "Alpha" },
          { id: 2, name: "Beta" },
        ]);
      });
  }, []);

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (search !== filters.search) {
        onFiltersChange({ ...filters, search: search || undefined });
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, filters, onFiltersChange]);

  const handleFilterChange = (
    key: keyof FilterType,
    value: string | number | undefined
  ) => {
    onFiltersChange({
      ...filters,
      [key]: value || undefined,
    });
  };

  const clearFilters = () => {
    setSearch("");
    onFiltersChange({});
  };

  const hasActiveFilters = Object.values(filters).some(Boolean);

  return (
    <div className="bg-gray-800 rounded-lg p-4 space-y-4">
      {/* Search */}
      <div>
        <input
          type="text"
          placeholder="Search cards..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap gap-3">
        {/* Set Filter */}
        <select
          value={filters.setId || ""}
          onChange={(e) =>
            handleFilterChange(
              "setId",
              e.target.value ? parseInt(e.target.value) : undefined
            )
          }
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Sets</option>
          {sets.map((set) => (
            <option key={set.id} value={set.id}>
              {set.name}
            </option>
          ))}
        </select>

        {/* Element Filter */}
        <select
          value={filters.element || ""}
          onChange={(e) =>
            handleFilterChange("element", e.target.value || undefined)
          }
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Elements</option>
          {ELEMENTS.map((el) => (
            <option key={el} value={el}>
              {el}
            </option>
          ))}
        </select>

        {/* Type Filter */}
        <select
          value={filters.type || ""}
          onChange={(e) =>
            handleFilterChange("type", e.target.value || undefined)
          }
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Types</option>
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        {/* Rarity Filter */}
        <select
          value={filters.rarity || ""}
          onChange={(e) =>
            handleFilterChange("rarity", e.target.value || undefined)
          }
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All Rarities</option>
          {RARITIES.map((rarity) => (
            <option key={rarity} value={rarity}>
              {rarity}
            </option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={`${sort}:${order}`}
          onChange={(e) => {
            const [s, o] = e.target.value.split(":") as [
              CollectionSortField,
              SortOrder
            ];
            onSortChange(s, o);
          }}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm"
        >
          <option value="name:asc">Name (A-Z)</option>
          <option value="name:desc">Name (Z-A)</option>
          <option value="quantity:desc">Quantity (High)</option>
          <option value="quantity:asc">Quantity (Low)</option>
          <option value="recent:desc">Recently Added</option>
          <option value="recent:asc">Oldest First</option>
        </select>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="text-gray-400 hover:text-white text-sm underline"
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}
