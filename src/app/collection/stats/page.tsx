"use client";

import CollectionStats from "../CollectionStats";
import MissingCards from "../MissingCards";

export default function StatsPage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <CollectionStats />
      <MissingCards />
    </div>
  );
}
