"use client";

import { PanelHeader } from "@/components/ui/page-header";
import CardBrowser from "../CardBrowser";

export default function BrowserPage() {
  return (
    <section className="rc-panel">
      <PanelHeader title="Browse All Cards" />
      <div className="px-[18px] py-3.5">
        <p className="mb-4 max-w-[68ch] font-rc-sans text-sm leading-relaxed text-rc-fg-muted">
          Search for any Sorcery card and add it to your collection.
        </p>
        <CardBrowser />
      </div>
    </section>
  );
}
