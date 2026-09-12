"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useOnline } from "@/app/online/online-context";
import AppShell from "@/components/ui/AppShell";
import { PageHeader } from "@/components/ui/page-header";
import { RcLinkButton } from "@/components/ui/rc-button";

export default function OnlinePlayPage() {
  const router = useRouter();
  const { match } = useOnline();

  useEffect(() => {
    if (match?.id)
      router.replace(`/online/play/${encodeURIComponent(match.id)}`);
  }, [match?.id, router]);

  return (
    <AppShell width="narrow">
      <PageHeader
        eyebrow="online"
        title="Online Play"
        description="No active match. Use the Lobby to join or create one."
        actions={
          <RcLinkButton variant="outline" href="/online/lobby">
            Go to Lobby
          </RcLinkButton>
        }
      />
    </AppShell>
  );
}
