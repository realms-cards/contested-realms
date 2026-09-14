"use client";

import { Icon } from "@iconify/react";
import Image from "next/image";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { RcButton } from "@/components/ui/rc-button";
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
  // Owned cards filter
  ownedOnly?: boolean;
  onOwnedOnlyChange?: (v: boolean) => void;
  ownedFilterAvailable?: boolean;
  // Zoom slider for search results
  searchZoom?: number;
  onSearchZoomChange?: (v: number) => void;
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
    // Owned cards filter
    ownedOnly = false,
    onOwnedOnlyChange,
    ownedFilterAvailable = false,
    // Zoom slider
    searchZoom = 100,
    onSearchZoomChange,
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

  // Compute grid columns based on zoom level
  const liveGridCols =
    searchZoom <= 70
      ? "grid-cols-6 sm:grid-cols-8 md:grid-cols-10"
      : searchZoom <= 100
      ? "grid-cols-4 sm:grid-cols-6 md:grid-cols-8"
      : searchZoom <= 130
      ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-6"
      : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4";

  const serverGridCols =
    searchZoom <= 70
      ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8"
      : searchZoom <= 100
      ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      : searchZoom <= 130
      ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4"
      : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3";

  return (
    <div
      className={`absolute bottom-0 left-0 right-0 ${
        searchExpanded ? "p-4" : "p-2"
      } pointer-events-none`}
    >
      <div className="max-w-7xl">
        <div
          className={`${
            searchExpanded
              ? "p-2"
              : "p-0"
          } rounded-rc-lg`}
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
                      className={`h-10 px-4 rounded-rc-md border flex items-center gap-2 font-rc-mono font-medium tabular-nums shadow-rc-sm ${
                        timeRemaining <= 60000
                          ? "border-rc-danger-hover bg-rc-danger text-rc-fg-strong"
                          : timeRemaining <= 300000
                          ? "border-rc-accent-press bg-rc-warning text-rc-accent-fg"
                          : "border-rc-line/22 bg-[rgba(7,10,20,0.85)] text-rc-fg-strong"
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
                          <div className="font-rc-sans text-sm font-medium text-rc-fg-strong">
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
                                  className={`w-16 h-24 rounded-rc-md overflow-hidden ring-1 transition-all duration-200 shadow-rc-md relative group ${
                                    ready
                                      ? "ring-rc-line/22 hover:ring-rc-accent"
                                      : "ring-rc-line/12 opacity-60 cursor-wait"
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
                                    <div className="w-full h-full bg-gradient-to-b from-rc-accent/22 to-rc-accent/8 flex items-center justify-center font-rc-mono font-bold text-rc-spark">
                                      {setPacks.indexOf(pack) + 1}
                                    </div>
                                  )}
                                  {pack.opened && (
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                      <span className="font-rc-mono text-xs font-bold text-rc-fg-strong">
                                        OPENED
                                      </span>
                                    </div>
                                  )}
                                  {!ready && !pack.opened && (
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                      <span className="font-rc-mono text-[10px] font-semibold tracking-wide text-rc-fg-strong">
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
                            <div className="flex items-center gap-3 px-3 py-2 rounded-rc-md border border-rc-line/22 bg-[rgba(7,10,20,0.85)] font-rc-sans text-sm text-rc-fg">
                              <div className="flex flex-col leading-tight">
                                <span className="font-semibold text-rc-fg-strong">
                                  Loading packs…
                                </span>
                                <span className="font-rc-mono text-xs tabular-nums text-rc-fg-muted">
                                  {packLoadProgress.processed} /{" "}
                                  {packLoadProgress.total} ready
                                </span>
                              </div>
                              <div className="rc-progress w-32">
                                <span
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
                                  className="w-5 h-5 animate-spin text-rc-fg-muted"
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
                            <RcButton
                              variant="quiet"
                              onClick={openAllPacks}
                              disabled={openAllDisabled}
                              className="h-10 px-4 text-rc-fg"
                              title="Open all remaining packs"
                            >
                              Open All Packs
                            </RcButton>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-center gap-2">
                      <RcButton
                        variant="quiet"
                        tone="success"
                        onClick={onShowStandardCards}
                        aria-pressed={standardActive}
                        className="h-10 px-4 text-sm text-rc-fg"
                        title="Show tournament legal cards"
                      >
                        Add Standard Cards
                      </RcButton>
                      {cubeExtrasAvailable && (
                        <RcButton
                          variant="quiet"
                          tone="moonlight"
                          onClick={onShowCubeExtras}
                          aria-pressed={cubeActive}
                          className="h-10 px-4 text-sm text-rc-fg"
                          title="Show cube extras from this cube"
                        >
                          Cube Extras
                        </RcButton>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex justify-center items-center gap-2">
                    {!isDraftMode && (
                      <RcButton
                        variant="quiet"
                        onClick={() => setSearchExpanded(true)}
                        className="h-10 px-4 text-rc-fg"
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
                      </RcButton>
                    )}
                    {/* Free mode booster toggle */}
                    {isFreeMode && onToggleBoosterControls && (
                      <RcButton
                        variant="quiet"
                        size="sm"
                        tone="ember"
                        onClick={onToggleBoosterControls}
                        aria-pressed={Boolean(showBoosterControls)}
                        className="gap-1.5 bg-black/40 text-sm"
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
                      </RcButton>
                    )}
                    {/* Free mode booster opening */}
                    {isFreeMode && showBoosterControls && onOpenFreeBooster && (
                      <div className="flex items-center gap-2 rounded-rc-md border border-rc-line/22 bg-[rgba(7,10,20,0.85)] px-3 py-1.5">
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
                        <RcButton
                          variant="outline"
                          size="sm"
                          onClick={onOpenFreeBooster}
                          disabled={freeBoosterLoading}
                          className="gap-1.5"
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
                        </RcButton>
                      </div>
                    )}
                    {pick3DLength > 0 && (
                      <div className="flex justify-center gap-2">
                        <RcButton
                          variant="quiet"
                          tone="success"
                          onClick={onShowStandardCards}
                          aria-pressed={standardActive}
                          className="h-10 px-4 text-sm text-rc-fg"
                          title="Show tournament legal cards"
                        >
                          Add Standard Cards
                        </RcButton>
                        {cubeExtrasAvailable && (
                          <RcButton
                            variant="quiet"
                            tone="moonlight"
                            onClick={onShowCubeExtras}
                            aria-pressed={cubeActive}
                            className="h-10 px-4 text-sm text-rc-fg"
                            title="Show cube extras from this cube"
                          >
                            Cube Extras
                          </RcButton>
                        )}
                        {/* Dragonlord Champion button */}
                        {hasDragonlordAvatar && onOpenChampionModal && (
                          <RcButton
                            variant="quiet"
                            onClick={onOpenChampionModal}
                            className={`h-10 px-4 text-sm border-rc-accent/60 bg-rc-accent/14 text-rc-spark ${
                              champion ? "" : "animate-pulse"
                            }`}
                            title={
                              champion
                                ? `Champion: ${champion.name} (click to change)`
                                : "Select your Dragonlord champion"
                            }
                          >
                            {champion ? (
                              <>
                                <Icon icon="game-icons:crossed-swords" width={16} height={16} />
                                {champion.name}
                              </>
                            ) : (
                              <>
                                <Icon icon="game-icons:spiked-dragon-head" width={16} height={16} />
                                Select Champion
                              </>
                            )}
                          </RcButton>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : !isDraftMode ? (
              <div className="w-full flex justify-start">
                <div className="relative flex flex-col gap-3 p-3 rounded-rc-lg backdrop-blur-sm border border-rc-line/18 max-w-4xl w-full">
                  {/* Close button in upper right */}
                  <RcButton
                    variant="quiet"
                    size="icon-xs"
                    onClick={() => setSearchExpanded(false)}
                    className="absolute top-2 right-2 h-8 w-8 font-bold text-sm z-10"
                    title="Close search (Esc)"
                    aria-label="Close search"
                  >
                    ✕
                  </RcButton>
                  <div className="flex items-center gap-3 pr-10">
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
                          className="rc-input h-9 w-full"
                          placeholder="Search cards... (Enter to add first result)"
                          autoFocus
                        />
                        {liveSearchLoading && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <svg
                              className="w-4 h-4 animate-spin text-rc-accent"
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
                        className="rc-input h-9 flex-1 min-w-64"
                        placeholder="Search all cards..."
                        autoFocus
                      />
                    )}
                    {/* Owned cards filter */}
                    {ownedFilterAvailable && (
                      <label className="rc-check gap-1.5 whitespace-nowrap transition-colors hover:text-rc-fg">
                        <input
                          type="checkbox"
                          checked={ownedOnly}
                          onChange={(e) => onOwnedOnlyChange?.(e.target.checked)}
                          className="w-4 h-4 cursor-pointer"
                        />
                        Owned
                      </label>
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
                        { value: "Promotional", label: "Promotional" },
                      ]}
                    />
                    {/* Zoom slider */}
                    {onSearchZoomChange && (
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <span className="rc-hint">Size</span>
                        <input
                          type="range"
                          min="60"
                          max="150"
                          step="10"
                          value={searchZoom}
                          onChange={(e) => onSearchZoomChange(Number(e.target.value))}
                          className="rc-range w-16"
                        />
                      </div>
                    )}
                  </div>
                  {/* Live search results - show inline for free mode */}
                  {isFreeMode && liveSearchResults.length > 0 && (
                    <div className={`thin-scrollbar overflow-y-auto ${searchZoom <= 100 ? "max-h-56" : searchZoom <= 130 ? "max-h-72" : "max-h-96"}`}>
                      <div className={`grid ${liveGridCols} gap-2`}>
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
                              className={`group relative rounded-rc-sm overflow-hidden bg-black/40 border transition-all ${
                                isSite ? "aspect-[4/3]" : "aspect-[3/4]"
                              } ${
                                idx === 0
                                  ? "border-rc-accent ring-2 ring-rc-accent/45 shadow-[0_0_14px_rgba(243,207,106,0.25)]"
                                  : "border-rc-line/22 hover:border-rc-accent"
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
                                <span className="font-rc-display text-[11px] leading-tight text-rc-fg-strong truncate max-w-full px-1">
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
            <div className="thin-scrollbar mt-4 pointer-events-auto max-h-[60vh] overflow-y-auto pr-2">
              <div className={`grid ${serverGridCols} gap-3`}>
                {results.map((r) => {
                  const isSite = (r.type || "").toLowerCase().includes("site");
                  return (
                    <div
                      key={r.variantId}
                      className={`rounded-rc-md border border-rc-line/22 p-2 bg-[rgba(9,13,25,0.85)] text-rc-fg text-xs${
                        isSite ? " col-span-2" : ""
                      }`}
                    >
                      <div
                        className={`${
                          isSite
                            ? "relative aspect-[3/2] mb-1"
                            : "relative aspect-[3/4] mb-2"
                        } rounded-rc-sm overflow-hidden bg-black/40 group`}
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
                            className="w-1/2 h-full opacity-0 group-hover:opacity-100 transition bg-gradient-to-r from-black/0 to-black/40 text-rc-fg text-xs flex items-end justify-start p-2"
                            title="Add to sideboard"
                          >
                            <span className="rounded-rc-sm border border-rc-line/22 bg-[rgba(7,10,20,0.85)] px-2 py-1 font-rc-mono">
                              + Side
                            </span>
                          </button>
                          <button
                            onClick={() => addCardAuto(r)}
                            className="w-1/2 h-full opacity-0 group-hover:opacity-100 transition bg-gradient-to-l from-black/0 to-black/40 text-rc-fg text-xs flex items-end justify-end p-2"
                            title="Add to deck"
                          >
                            <span className="rounded-rc-sm border border-rc-line/22 bg-[rgba(7,10,20,0.85)] px-2 py-1 font-rc-mono">
                              + Deck
                            </span>
                          </button>
                        </div>
                      </div>
                      <div className="font-rc-display text-[15px] leading-tight text-rc-fg-strong line-clamp-1 mb-1">
                        {r.cardName}
                      </div>
                      <div className="font-rc-sans text-rc-fg-muted line-clamp-1 mb-2">
                        {r.type || ""}
                      </div>
                      <div className="flex gap-1 sm:hidden">
                        <RcButton
                          variant="quiet"
                          size="xs"
                          className="px-2"
                          onClick={() => addCardAuto(r)}
                        >
                          + Deck
                        </RcButton>
                        <RcButton
                          variant="quiet"
                          size="xs"
                          className="px-2"
                          onClick={() => addToSideboardFromSearch(r)}
                        >
                          + Side
                        </RcButton>
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
