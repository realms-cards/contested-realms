"use client";

import { useEffect, useState } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
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
            })),
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

  // Debounced search - only trigger when search actually changes
  useEffect(() => {
    const currentSearch = filters.search || "";
    // Skip if search hasn't actually changed (handles "" vs undefined)
    if (search === currentSearch) return;

    const timeout = setTimeout(() => {
      onFiltersChange({ ...filters, search: search || undefined });
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, filters, onFiltersChange]);

  const handleFilterChange = (
    key: keyof FilterType,
    value: string | number | undefined,
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
        <CustomSelect
          value={filters.setId ? String(filters.setId) : ""}
          onChange={(v) =>
            handleFilterChange(
              "setId",
              v ? parseInt(v) : undefined,
            )
          }
          placeholder="All Sets"
          options={sets.map((set) => ({
            value: String(set.id),
            label: set.name,
          }))}
        />

        {/* Element Filter */}
        <CustomSelect
          value={filters.element || ""}
          onChange={(v) =>
            handleFilterChange("element", v || undefined)
          }
          placeholder="All Elements"
          options={ELEMENTS.map((el) => ({
            value: el,
            label: el,
          }))}
        />

        {/* Type Filter */}
        <CustomSelect
          value={filters.type || ""}
          onChange={(v) =>
            handleFilterChange("type", v || undefined)
          }
          placeholder="All Types"
          options={TYPES.map((type) => ({
            value: type,
            label: type,
          }))}
        />

        {/* Rarity Filter */}
        <CustomSelect
          value={filters.rarity || ""}
          onChange={(v) =>
            handleFilterChange("rarity", v || undefined)
          }
          placeholder="All Rarities"
          options={RARITIES.map((rarity) => ({
            value: rarity,
            label: rarity,
          }))}
        />

        {/* Sort */}
        <CustomSelect
          value={`${sort}:${order}`}
          onChange={(v) => {
            const [s, o] = v.split(":") as [
              CollectionSortField,
              SortOrder,
            ];
            onSortChange(s, o);
          }}
          options={[
            { value: "name:asc", label: "Name (A-Z)" },
            { value: "name:desc", label: "Name (Z-A)" },
            { value: "rarity:asc", label: "Rarity (Unique First)" },
            { value: "rarity:desc", label: "Rarity (Ordinary First)" },
            { value: "quantity:desc", label: "Quantity (High)" },
            { value: "quantity:asc", label: "Quantity (Low)" },
            { value: "recent:desc", label: "Recently Added" },
            { value: "recent:asc", label: "Oldest First" },
          ]}
        />

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
