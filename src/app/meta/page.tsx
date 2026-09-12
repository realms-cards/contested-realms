"use client";

import PublicMetaDashboard from "@/components/meta/PublicMetaDashboard";
import OnlinePageShell from "@/components/online/OnlinePageShell";
import { PageHeader } from "@/components/ui/page-header";

export default function MetaPage() {
  return (
    <OnlinePageShell>
      <div className="flex flex-col gap-7">
        <PageHeader
          eyebrow="statistics"
          title="The Meta"
          description="All statistics from matches played on this simulator."
        />
        <PublicMetaDashboard />
      </div>
    </OnlinePageShell>
  );
}
