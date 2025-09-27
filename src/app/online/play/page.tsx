"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useOnline } from "@/app/online/online-context";

export default function OnlinePlayPage() {
  const router = useRouter();
  const { match } = useOnline();

  useEffect(() => {
    if (match?.id)
      router.replace(`/online/play/${encodeURIComponent(match.id)}`);
  }, [match?.id, router]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      <div className="max-w-5xl mx-auto p-6 space-y-4">
        <h2 className="text-lg font-semibold">Online Play</h2>
        <p className="text-sm opacity-70">
          No active match. Use the Lobby to join or create one.
        </p>
        <Link
          className="text-sm underline text-slate-300/80 hover:text-slate-200"
          href="/online/lobby"
        >
          Go to Lobby
        </Link>
      </div>
    </div>
  );
}
