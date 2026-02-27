"use client";

import OnlinePageShell from "@/components/online/OnlinePageShell";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <OnlinePageShell>{children}</OnlinePageShell>;
}
