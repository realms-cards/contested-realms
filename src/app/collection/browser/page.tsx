"use client";

import CardBrowser from "../CardBrowser";

export default function BrowserPage() {
  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Browse All Cards</h2>
      <p className="text-gray-400 mb-6">
        Search for any Sorcery card and add it to your collection.
      </p>
      <CardBrowser />
    </div>
  );
}
