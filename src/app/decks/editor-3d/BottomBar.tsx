"use client";

import Image from "next/image";
import { CustomSelect } from "@/components/ui/CustomSelect";
import type { SearchResult, SearchType } from "@/lib/deckEditor/search";
import { getBoosterAssetName } from "@/lib/utils/booster-assets";

type Pack = { id: string; set: string; opened: boolean; cards: unknown[] };
type CubeSummary = {
  id: string;
  name: string;
  cardCount: number;
  creatorName?: string;
};

type BottomBarProps = {
  isSealed: boolean;
  isDraftMode: boolean;
  // Free mode booster props
  isFreeMode?: boolean;
  showBoosterControls?: boolean;
  onToggleBoosterControls?: () => void;
  freeBoosterSet?: string;
  onFreeBoosterSetChange?: (set: string) => void;
  freeBoosterCubeId?: string;
  onFreeBoosterCubeChange?: (cubeId: string) => void;
  availableCubes?: CubeSummary[];
  onOpenFreeBooster?: () => void;
  freeBoosterLoading?: boolean;
  searchExpanded: boolean;
  setSearchExpanded: (v: boolean) => void;
  q: string;
  setQ: (v: string) => void;
  typeFilter: SearchType;
  setTypeFilter: (v: SearchType) => void;
  searchSetName: string;
  setSearchSetName: (v: string) => void;
  doSearch: () => void;
  results: SearchResult[];
  addCardAuto: (r: SearchResult) => void;
  addToSideboardFromSearch: (r: SearchResult) => void;
  pick3DLength: number;
  tournamentControlsVisible: boolean;
  tournamentControlsMode?: "standard" | "cube" | null;
  cubeExtrasAvailable?: boolean;
  onShowStandardCards: () => void;
  onShowCubeExtras: () => void;
  packs: Pack[];
  openPack: (packId: string) => void;
  openAllPacks: () => Promise<void>;
  packCardCache: Record<string, SearchResult[]>;
  packLoadProgress: { processed: number; total: number; inProgress: boolean };
  timeRemaining: number;
  formatTime: (ms: number) => string;
  // Live search props for free mode
  liveSearchQuery?: string;
  onLiveSearchChange?: (q: string) => void;
  liveSearchResults?: SearchResult[];
  liveSearchLoading?: boolean;
  // Callback for adding cards from live search (reuse addCardAuto from props)
  onAddFromLiveSearch?: (r: SearchResult) => void;
  // Dragonlord champion props
  hasDragonlordAvatar?: boolean;
  champion?: {
    cardId: number;
    name: string;
    slug: string | null;
  } | null;
  onOpenChampionModal?: () => void;
  // Cube name for display (when packs are from a cube)
  cubeName?: string | null;
  // Card preview callbacks
  onHoverPreview?: (slug: string, name: string, type: string | null) => void;
  onHoverClear?: () => void;
};

export default function BottomBar(props: BottomBarProps) {
  const {
    isSealed,
    isDraftMode,
    searchExpanded,
    setSearchExpanded,
    q,
    setQ,
    typeFilter,
    setTypeFilter,
    searchSetName,
    setSearchSetName,
    doSearch,
    results,
    addCardAuto,
    addToSideboardFromSearch,
    pick3DLength,
    tournamentControlsVisible,
    tournamentControlsMode,
    cubeExtrasAvailable = false,
    onShowStandardCards,
    onShowCubeExtras,
    packs,
    openPack,
    openAllPacks,
    packCardCache,
    packLoadProgress,
    timeRemaining,
    formatTime,
    // Free mode props
    isFreeMode = false,
    showBoosterControls = false,
    onToggleBoosterControls,
    freeBoosterSet = "Gothic",
    onFreeBoosterSetChange,
    freeBoosterCubeId = "",
    onFreeBoosterCubeChange,
    availableCubes = [],
    onOpenFreeBooster,
    freeBoosterLoading = false,
    // Live search props
    liveSearchQuery = "",
    onLiveSearchChange,
    liveSearchResults = [],
    liveSearchLoading = false,
    onAddFromLiveSearch,
    // Dragonlord champion props
    hasDragonlordAvatar = false,
    champion = null,
    onOpenChampionModal,
    // Cube name for display
    cubeName,
    // Card preview callbacks
    onHoverPreview,
    onHoverClear,
  } = props;

  const standardActive =
    tournamentControlsVisible && tournamentControlsMode === "standard";
  const cubeActive =
    tournamentControlsVisible && tournamentControlsMode === "cube";

  const unopenedPacks = packs.filter((p) => !p.opened);
  const allUnopenedReady = unopenedPacks.every((pack) =>
    Boolean(packCardCache[pack.id])
  );
  const showOpenAll = unopenedPacks.length > 0;
  const showLoadingBar =
    unopenedPacks.length > 0 &&
    packLoadProgress.total > 0 &&
    (packLoadProgress.inProgress ||
      packLoadProgress.processed < packLoadProgress.total);
  const openAllDisabled = packLoadProgress.inProgress || !allUnopenedReady;

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 ${
        searchExpanded ? "p-4" : "p-2"
      } pointer-events-none`}
    >
      <div className="max-w-7xl mx-auto">
        <div
          className={`${
            searchExpanded
              ? "bg-black/80 backdrop-blur-sm p-4"
              : "bg-transparent backdrop-blur-0 p-0"
          } rounded-lg`}
        >
          <div
            className={`flex flex-wrap items-center ${
              searchExpanded ? "gap-4" : "gap-2"
            } pointer-events-auto`}
          >
            {!searchExpanded || isSealed ? (
              <div className="flex items-center gap-2 flex-1">
                {isSealed ? (
                  <div className="flex items-center gap-2 w-full">
                    <div
                      className={`h-10 px-4 rounded-lg flex items-center gap-2 font-medium ${
                        timeRemaining <= 60000
                          ? "bg-red-600 text-white"
                          : timeRemaining <= 300000
                          ? "bg-yellow-600 text-white"
                          : "bg-blue-600 text-white"
                      }`}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      {formatTime(timeRemaining)}
                    </div>
                    <div className="flex flex-col gap-3 flex-1">
                      {Object.entries(
                        packs
                          .filter((p) => !p.opened)
                          .reduce((groups, pack) => {
                            if (!groups[pack.set])
                              groups[pack.set] = [] as Pack[];
                            groups[pack.set].push(pack);
                            return groups;
                          }, {} as Record<string, Pack[]>)
                      ).map(([setName, setPacks]) => (
                        <div
                          key={setName}
                          className="flex flex-col items-center gap-2"
                        >
                          <div className="text-white text-sm font-medium">
                            {/* Display cube name instead of 'cube' when available */}
                            {setName.toLowerCase() === "cube" && cubeName
                              ? cubeName
                              : setName}
                          </div>
                          <div className="flex gap-1">
                            {setPacks.map((pack) => {
                              const ready = Boolean(packCardCache[pack.id]);
                              const assetName = getBoosterAssetName(pack.set);
                              return (
                                <button
                                  key={pack.id}
                                  onClick={() => ready && openPack(pack.id)}
                                  className={`w-16 h-24 rounded-lg overflow-hidden ring-1 transition-all duration-200 shadow-lg relative group ${
                                    ready
                                      ? "ring-white/20 hover:ring-white/40"
                                      : "ring-white/10 opacity-60 cursor-wait"
                                  }`}
                                  title={
                                    ready
                                      ? `Open ${pack.set} pack`
                                      : "Loading pack…"
                                  }
                                  disabled={!ready}
                                >
                                  {assetName ? (
                                    <Image
                                      src={`/api/assets/${assetName}`}
                                      alt={`${pack.set} booster pack`}
                                      width={64}
                                      height={96}
                                      className="object-cover w-full h-full group-hover:scale-105 transition-transform"
                                      unoptimized
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-gradient-to-r from-green-600 to-emerald-600 flex items-center justify-center text-white font-bold">
                                      {setPacks.indexOf(pack) + 1}
                                    </div>
                                  )}
                                  {pack.opened && (
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                      <span className="text-white text-xs font-bold">
                                        OPENED
                                      </span>
                                    </div>
                                  )}
                                  {!ready && !pack.opened && (
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                      <span className="text-white text-[10px] font-semibold tracking-wide">
                                        Loading…
                                      </span>
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      {(showLoadingBar || showOpenAll) && (
                        <div className="flex items-center gap-3 flex-wrap">
                          {showLoadingBar && (
                            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-sm">
                              <div className="flex flex-col leading-tight">
                                <span className="font-semibold">
                                  Loading packs…
                                </span>
                                <span className="text-xs text-white/80">
                                  {packLoadProgress.processed} /{" "}
                                  {packLoadProgress.total} ready
                                </span>
                              </div>
                              <div className="w-32 h-2 rounded bg-white/10 overflow-hidden">
                                <div
                                  className="h-full bg-emerald-400 transition-all duration-300"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      packLoadProgress.total === 0
                                        ? 0
                                        : (packLoadProgress.processed /
                                            packLoadProgress.total) *
                                            100
                                    ).toFixed(2)}%`,
                                  }}
                                />
                              </div>
                              {packLoadProgress.inProgress && (
                                <svg
                                  className="w-5 h-5 animate-spin text-white/80"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M4 12a8 8 0 018-8"
                                  />
                                </svg>
                              )}
                            </div>
                          )}
                          {showOpenAll && (
                            <button
                              onClick={openAllPacks}
                              disabled={openAllDisabled}
                              className={`h-10 px-4 rounded-lg font-semibold transition-colors ${
                                openAllDisabled
                                  ? "bg-white/10 text-white/50 cursor-not-allowed"
                                  : "bg-emerald-600 text-white hover:bg-emerald-500"
                              }`}
                              title="Open all remaining packs"
                            >
                              Open All Packs
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={onShowStandardCards}
                        className={`h-10 px-4 rounded font-medium transition-colors ${
                          standardActive
                            ? "bg-yellow-600 text-white hover:bg-yellow-500"
                            : "bg-white/10 text-white hover:bg-white/20"
                        }`}
                        title="Show tournament legal cards"
                      >
                        Add Standard Cards
                      </button>
                      {cubeExtrasAvailable && (
                        <button
                          onClick={onShowCubeExtras}
                          className={`h-10 px-4 rounded font-medium transition-colors ${
                            cubeActive
                              ? "bg-purple-600 text-white hover:bg-purple-500"
                              : "bg-purple-700 text-white hover:bg-purple-600"
                          }`}
                          title="Show cube extras from this cube"
                        >
                          Cube Extras
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex justify-center items-center gap-2">
                    {!isDraftMode && (
                      <button
                        onClick={() => setSearchExpanded(true)}
                        className="flex items-center gap-2 h-10 px-4 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500 transition-all duration-200 shadow-lg"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                        Add Cards
                      </button>
                    )}
                    {/* Free mode booster toggle */}
                    {isFreeMode && onToggleBoosterControls && (
                      <button
                        onClick={onToggleBoosterControls}
                        className={`flex items-center gap-1.5 h-8 px-3 rounded text-sm font-medium transition-colors ${
                          showBoosterControls
                            ? "bg-amber-600 hover:bg-amber-500 text-white"
                            : "bg-black/40 hover:bg-black/60 text-white/70 hover:text-white border border-white/10"
                        }`}
                        title={
                          showBoosterControls
                            ? "Hide booster controls"
                            : "Show booster controls"
                        }
                      >
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                          />
                        </svg>
                        Boosters
                      </button>
                    )}
                    {/* Free mode booster opening */}
                    {isFreeMode && showBoosterControls && onOpenFreeBooster && (
                      <div className="flex items-center gap-2 bg-black/40 rounded-lg px-3 py-1.5 border border-white/10">
                        <CustomSelect
                          value={
                            freeBoosterCubeId
                              ? `cube:${freeBoosterCubeId}`
                              : freeBoosterSet || ""
                          }
                          onChange={(val) => {
                            // Check if it's a cube ID (starts with non-set prefix)
                            if (val.startsWith("cube:")) {
                              onFreeBoosterCubeChange?.(
                                val.replace("cube:", "")
                              );
                              onFreeBoosterSetChange?.("");
                            } else {
                              onFreeBoosterSetChange?.(val);
                              onFreeBoosterCubeChange?.("");
                            }
                          }}
                          options={[
                            { value: "Gothic", label: "Gothic" },
                            { value: "Arthurian Legends", label: "Arthurian Legends" },
                            { value: "Beta", label: "Beta" },
                            { value: "Alpha", label: "Alpha" },
                            ...availableCubes.map((cube) => ({
                              value: `cube:${cube.id}`,
                              label: `[Cube] ${cube.name} (${cube.cardCount})`,
                            })),
                          ]}
                        />
                        <button
                          onClick={onOpenFreeBooster}
                          disabled={freeBoosterLoading}
                          className="flex items-center gap-1.5 h-8 px-3 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-wait"
                          title="Open a booster pack and add cards to your deck"
                        >
                          {freeBoosterLoading ? (
                            <svg
                              className="w-4 h-4 animate-spin"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4 12a8 8 0 018-8"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-4 h-4"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                              />
                            </svg>
                          )}
                          Open Booster
                        </button>
                      </div>
                    )}
                    {pick3DLength > 0 && (
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={onShowStandardCards}
                          className={`h-10 px-4 rounded font-medium transition-colors ${
                            standardActive
                              ? "bg-yellow-600 text-white hover:bg-yellow-500"
                              : "bg-white/10 text-white hover:bg-white/20"
                          }`}
                          title="Show tournament legal cards"
                        >
                          Add Standard Cards
                        </button>
                        {cubeExtrasAvailable && (
                          <button
                            onClick={onShowCubeExtras}
                            className={`h-10 px-4 rounded font-medium transition-colors ${
                              cubeActive
                                ? "bg-purple-600 text-white hover:bg-purple-500"
                                : "bg-purple-700 text-white hover:bg-purple-600"
                            }`}
                            title="Show cube extras from this cube"
                          >
                            Cube Extras
                          </button>
                        )}
                        {/* Dragonlord Champion button */}
                        {hasDragonlordAvatar && onOpenChampionModal && (
                          <button
                            onClick={onOpenChampionModal}
                            className={`h-10 px-4 rounded font-medium transition-colors flex items-center gap-2 ${
                              champion
                                ? "bg-amber-600 text-white hover:bg-amber-500"
                                : "bg-amber-700 text-white hover:bg-amber-600 animate-pulse"
                            }`}
                            title={
                              champion
                                ? `Champion: ${champion.name} (click to change)`
                                : "Select your Dragonlord champion"
                            }
                          >
                            {champion ? (
                              <>
                                <span className="text-amber-200">⚔️</span>
                                {champion.name}
                              </>
                            ) : (
                              <>
                                <span>🐉</span>
                                Select Champion
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : !isDraftMode ? (
              <div className="w-full flex justify-center">
                <div className="relative flex flex-col gap-3 p-4 bg-gradient-to-br from-slate-800/90 to-slate-900/90 rounded-lg backdrop-blur-sm border border-blue-500/20 shadow-xl max-w-3xl w-full">
                  {/* Close button in upper right */}
                  <button
                    onClick={() => setSearchExpanded(false)}
                    className="absolute top-2 right-2 h-8 w-8 grid place-items-center rounded-full bg-red-500/20 hover:bg-red-500/40 text-red-400 hover:text-red-300 border border-red-500/30 font-bold text-sm transition-colors z-10"
                    title="Close search (Esc)"
                    aria-label="Close search"
                  >
                    ✕
                  </button>
                  <div className="flex items-center gap-3">
                    {isFreeMode && onLiveSearchChange ? (
                      /* Free mode: live search with instant results */
                      <div className="relative flex-1">
                        <input
                          type="search"
                          name="q"
                          autoComplete="off"
                          role="searchbox"
                          inputMode="search"
                          data-1p-ignore
                          data-lpignore="true"
                          data-bwignore="true"
                          data-dashlane-ignore="true"
                          data-np-ignore="true"
                          data-keeper-lock="true"
                          value={liveSearchQuery}
                          onChange={(e) => onLiveSearchChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              liveSearchResults.length > 0
                            ) {
                              e.preventDefault();
                              onAddFromLiveSearch?.(liveSearchResults[0]);
                            } else if (e.key === "Escape") {
                              setSearchExpanded(false);
                            }
                          }}
                          className="w-full border rounded-lg px-4 py-2 bg-black/60 text-white border-white/20 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
                          placeholder="Search cards... (Enter to add first result)"
                          autoFocus
                        />
                        {liveSearchLoading && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <svg
                              className="w-4 h-4 animate-spin text-blue-400"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4 12a8 8 0 018-8"
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                    ) : (
                      <input
                        type="search"
                        name="q"
                        autoComplete="off"
                        role="searchbox"
                        inputMode="search"
                        data-1p-ignore
                        data-lpignore="true"
                        data-bwignore="true"
                        data-dashlane-ignore="true"
                        data-np-ignore="true"
                        data-keeper-lock="true"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && doSearch()}
                        className="flex-1 border rounded-lg px-4 py-2 bg-black/60 text-white border-white/20 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all min-w-64"
                        placeholder="Search all cards..."
                        autoFocus
                      />
                    )}
                    <CustomSelect
                      value={typeFilter}
                      onChange={(v) => setTypeFilter(v as SearchType)}
                      options={[
                        { value: "all", label: "All Types" },
                        { value: "avatar", label: "Avatars" },
                        { value: "site", label: "Sites" },
                        { value: "spell", label: "Spells" },
                      ]}
                    />
                    <CustomSelect
                      value={searchSetName}
                      onChange={(v) => setSearchSetName(v)}
                      placeholder="All Sets"
                      options={[
                        { value: "Alpha", label: "Alpha" },
                        { value: "Beta", label: "Beta" },
                        { value: "Arthurian Legends", label: "Arthurian Legends" },
                        { value: "Dragonlord", label: "Dragonlord" },
                      ]}
                    />
                  </div>
                  {/* Live search results - show inline for free mode */}
                  {isFreeMode && liveSearchResults.length > 0 && (
                    <div className="max-h-48 overflow-y-auto">
                      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                        {liveSearchResults.map((r, idx) => {
                          const isSite = (r.type || "")
                            .toLowerCase()
                            .includes("site");
                          return (
                            <button
                              key={r.variantId}
                              onClick={() => onAddFromLiveSearch?.(r)}
                              onMouseEnter={() =>
                                onHoverPreview?.(r.slug, r.cardName, r.type)
                              }
                              onMouseLeave={() => onHoverClear?.()}
                              className={`group relative rounded overflow-hidden bg-black/40 border transition-all ${
                                isSite ? "aspect-[4/3]" : "aspect-[3/4]"
                              } ${
                                idx === 0
                                  ? "border-green-400 ring-2 ring-green-400/50 shadow-lg shadow-green-400/20"
                                  : "border-white/20 hover:border-blue-400"
                              }`}
                              title={`${idx === 0 ? "[Enter] " : ""}Add ${
                                r.cardName
                              } to deck`}
                            >
                              <Image
                                src={`/api/images/${r.slug}`}
                                alt={r.cardName}
                                fill
                                className={
                                  isSite
                                    ? "object-contain rotate-90"
                                    : "object-cover"
                                }
                                sizes="80px"
                                unoptimized
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-1">
                                <span className="text-[10px] text-white font-medium truncate max-w-full px-1">
                                  {r.cardName}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* Search results grid */}
          {searchExpanded && !isDraftMode && (
            <div className="mt-4 pointer-events-auto max-h-[60vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {results.map((r) => {
                  const isSite = (r.type || "").toLowerCase().includes("site");
                  return (
                    <div
                      key={r.variantId}
                      className={`border border-white/30 rounded p-2 bg-black/70 text-white text-xs${
                        isSite ? " col-span-2" : ""
                      }`}
                    >
                      <div
                        className={`${
                          isSite
                            ? "relative aspect-[3/2] mb-1"
                            : "relative aspect-[3/4] mb-2"
                        } rounded overflow-hidden bg-black/40 group`}
                      >
                        <Image
                          src={`/api/images/${r.slug}`}
                          alt={r.cardName}
                          fill
                          className={
                            isSite
                              ? "object-contain object-center rotate-90"
                              : "object-cover"
                          }
                          sizes="120px"
                          unoptimized
                        />
                        <div className="hidden sm:flex absolute inset-0">
                          <button
                            onClick={() => addToSideboardFromSearch(r)}
                            className="w-1/2 h-full opacity-0 group-hover:opacity-100 transition bg-gradient-to-r from-black/0 to-black/40 text-white text-xs flex items-end justify-start p-2"
                            title="Add to sideboard"
                          >
                            <span className="bg-black/60 px-2 py-1 rounded border border-white/20">
                              + Side
                            </span>
                          </button>
                          <button
                            onClick={() => addCardAuto(r)}
                            className="w-1/2 h-full opacity-0 group-hover:opacity-100 transition bg-gradient-to-l from-black/0 to-black/40 text-white text-xs flex items-end justify-end p-2"
                            title="Add to deck"
                          >
                            <span className="bg-black/60 px-2 py-1 rounded border border-white/20">
                              + Deck
                            </span>
                          </button>
                        </div>
                      </div>
                      <div className="font-semibold line-clamp-1 mb-1">
                        {r.cardName}
                      </div>
                      <div className="opacity-80 line-clamp-1 mb-2">
                        {r.type || ""}
                      </div>
                      <div className="flex gap-1 sm:hidden">
                        <button
                          className="px-2 py-1 border border-white/30 rounded hover:bg-white/10"
                          onClick={() => addCardAuto(r)}
                        >
                          + Deck
                        </button>
                        <button
                          className="px-2 py-1 border border-white/30 rounded hover:bg-white/10"
                          onClick={() => addToSideboardFromSearch(r)}
                        >
                          + Side
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
