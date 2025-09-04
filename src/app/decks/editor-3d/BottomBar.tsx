"use client";

import Image from "next/image";
import type { SearchResult, SearchType } from "@/lib/deckEditor/search";

type Pack = { id: string; set: string; opened: boolean; cards: unknown[] };

type BottomBarProps = {
  isSealed: boolean;
  isDraftMode: boolean;
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
  toggleTournamentControls: () => void;
  packs: Pack[];
  openPack: (packId: string) => void;
  timeRemaining: number;
  formatTime: (ms: number) => string;
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
    toggleTournamentControls,
    packs,
    openPack,
    timeRemaining,
    formatTime,
  } = props;

  return (
    <div className={`absolute bottom-0 left-0 right-0 ${searchExpanded ? "p-4" : "p-2"} pointer-events-none`}>
      <div className="max-w-7xl mx-auto">
        <div className={`${searchExpanded ? "bg-black/80 backdrop-blur-sm p-4" : "bg-transparent backdrop-blur-0 p-0"} rounded-lg`}>
          <div className={`flex flex-wrap items-center ${searchExpanded ? "gap-4" : "gap-2"} pointer-events-auto`}>
            {!searchExpanded || isSealed ? (
              <div className="flex items-center gap-2 flex-1">
                {isSealed ? (
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-10 px-4 rounded-lg flex items-center gap-2 font-medium ${
                        timeRemaining <= 60000 ? "bg-red-600 text-white" : timeRemaining <= 300000 ? "bg-yellow-600 text-white" : "bg-blue-600 text-white"
                      }`}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {formatTime(timeRemaining)}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(
                        packs
                          .filter((p) => !p.opened)
                          .reduce((groups, pack) => {
                            if (!groups[pack.set]) groups[pack.set] = [] as Pack[];
                            groups[pack.set].push(pack);
                            return groups;
                          }, {} as Record<string, Pack[]>)
                      ).map(([setName, setPacks]) => (
                        <div key={setName} className="flex flex-col items-center gap-2">
                          <div className="text-white text-sm font-medium">{setName}</div>
                          <div className="flex gap-1">
                            {setPacks.map((pack) => {
                              const assetName = (() => {
                                const s = (pack.set || "").toLowerCase();
                                if (s.includes("arthur")) return "arthurian-booster.png";
                                if (s.includes("alpha")) return "alphabeta-booster.png";
                                if (s.includes("beta")) return "alphabeta-booster.png";
                                return null;
                              })();
                              return (
                                <button
                                  key={pack.id}
                                  onClick={() => openPack(pack.id)}
                                  className="w-16 h-24 rounded-lg overflow-hidden ring-1 ring-white/20 hover:ring-white/40 transition-all duration-200 shadow-lg relative group"
                                  title={`Open ${pack.set} pack`}
                                >
                                  {assetName ? (
                                    <Image src={`/api/assets/${assetName}`} alt={`${pack.set} booster pack`} width={64} height={96} className="object-cover w-full h-full group-hover:scale-105 transition-transform" />
                                  ) : (
                                    <div className="w-full h-full bg-gradient-to-r from-green-600 to-emerald-600 flex items-center justify-center text-white font-bold">
                                      {setPacks.indexOf(pack) + 1}
                                    </div>
                                  )}
                                  {pack.opened && (
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                      <span className="text-white text-xs font-bold">OPENED</span>
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex justify-center items-center gap-2">
                    <button
                      onClick={() => setSearchExpanded(true)}
                      className="flex items-center gap-2 h-10 px-4 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-500 hover:to-purple-500 transition-all duration-200 shadow-lg"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      Add Cards
                    </button>
                    {pick3DLength > 0 && (
                      <button
                        onClick={toggleTournamentControls}
                        className={`h-10 px-4 rounded font-medium transition-colors ${
                          tournamentControlsVisible ? "bg-yellow-600 text-white hover:bg-yellow-500" : "bg-white/10 text-white hover:bg-white/20"
                        }`}
                        title="Show tournament legal cards"
                      >
                        Add Standard Cards
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full flex justify-center">
                <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-gray-800/50 to-gray-700/50 rounded-lg backdrop-blur-sm border border-white/10 shadow-xl max-w-3xl w-full">
                  {!isDraftMode ? (
                    <>
                      <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && doSearch()}
                        className="flex-1 border rounded-lg px-4 py-2 bg-black/60 text-white border-white/20 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all min-w-64"
                        placeholder="Search all cards..."
                        autoFocus
                      />
                      <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value as SearchType)}
                        className="border rounded-lg px-3 py-2 bg-black/60 text-white border-white/20 focus:border-blue-400 focus:outline-none transition-all"
                      >
                        <option value="all">All Types</option>
                        <option value="avatar">Avatars</option>
                        <option value="site">Sites</option>
                        <option value="spell">Spells</option>
                      </select>
                      <select
                        value={searchSetName}
                        onChange={(e) => setSearchSetName(e.target.value)}
                        className="border rounded-lg px-3 py-2 bg-black/60 text-white border-white/20 focus:border-blue-400 focus:outline-none transition-all"
                        title="Select set to search"
                      >
                        <option value="">All Sets</option>
                        <option value="Alpha">Alpha</option>
                        <option value="Beta">Beta</option>
                        <option value="Arthurian Legends">Arthurian Legends</option>
                        <option value="Dragonlord">Dragonlord</option>
                      </select>
                    </>
                  ) : (
                    <>
                      <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && doSearch()}
                        className="flex-1 border rounded-lg px-4 py-2 bg-black/60 text-white border-white/20 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all min-w-64"
                        placeholder="Search spells and sites..."
                        autoFocus
                      />
                      <select
                        value={typeFilter === "all" || typeFilter === "avatar" ? "spell" : typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value as SearchType)}
                        className="border rounded-lg px-3 py-2 bg-black/60 text-white border-white/20 focus:border-blue-400 focus:outline-none transition-all"
                      >
                        <option value="spell">Spells</option>
                        <option value="site">Sites</option>
                      </select>
                      <select
                        value={searchSetName}
                        onChange={(e) => setSearchSetName(e.target.value)}
                        className="border rounded-lg px-3 py-2 bg-black/60 text-white border-white/20 focus:border-blue-400 focus:outline-none transition-all"
                        title="Select set to search"
                      >
                        <option value="">All Sets</option>
                        <option value="Alpha">Alpha</option>
                        <option value="Beta">Beta</option>
                        <option value="Arthurian Legends">Arthurian Legends</option>
                        <option value="Dragonlord">Dragonlord</option>
                      </select>
                    </>
                  )}
                </div>
              </div>
            )}
            {searchExpanded && (
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => setSearchExpanded(false)}
                  className="h-9 w-9 grid place-items-center rounded bg-white/10 hover:bg-white/20 text-white/80 hover:text-white"
                  title="Close search"
                  aria-label="Close search"
                >
                  ×
                </button>
              </div>
            )}
          </div>

          {/* Search results grid */}
          {searchExpanded && (
            <div className="mt-4 pointer-events-auto max-h-[60vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {results.map((r) => {
                  const isSite = (r.type || "").toLowerCase().includes("site");
                  return (
                    <div key={r.variantId} className={`border border-white/30 rounded p-2 bg-black/70 text-white text-xs${isSite ? " col-span-2" : ""}`}>
                      <div className={`${isSite ? "relative aspect-[3/2] mb-1" : "relative aspect-[3/4] mb-2"} rounded overflow-hidden bg-black/40 group`}>
                        <Image
                          src={`/api/images/${r.slug}`}
                          alt={r.cardName}
                          fill
                          className={isSite ? "object-contain object-center rotate-90" : "object-cover"}
                          sizes="120px"
                        />
                        <div className="hidden sm:flex absolute inset-0">
                          <button onClick={() => addToSideboardFromSearch(r)} className="w-1/2 h-full opacity-0 group-hover:opacity-100 transition bg-gradient-to-r from-black/0 to-black/40 text-white text-xs flex items-end justify-start p-2" title="Add to sideboard">
                            <span className="bg-black/60 px-2 py-1 rounded border border-white/20">+ Side</span>
                          </button>
                          <button onClick={() => addCardAuto(r)} className="w-1/2 h-full opacity-0 group-hover:opacity-100 transition bg-gradient-to-l from-black/0 to-black/40 text-white text-xs flex items-end justify-end p-2" title="Add to deck">
                            <span className="bg-black/60 px-2 py-1 rounded border border-white/20">+ Deck</span>
                          </button>
                        </div>
                      </div>
                      <div className="font-semibold line-clamp-1 mb-1">{r.cardName}</div>
                      <div className="opacity-80 line-clamp-1 mb-2">{r.type || ""}</div>
                      <div className="flex gap-1 sm:hidden">
                        <button className="px-2 py-1 border border-white/30 rounded hover:bg-white/10" onClick={() => addCardAuto(r)}>+ Deck</button>
                        <button className="px-2 py-1 border border-white/30 rounded hover:bg-white/10" onClick={() => addToSideboardFromSearch(r)}>+ Side</button>
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
