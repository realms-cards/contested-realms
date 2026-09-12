"use client";

import type { ReactNode } from "react";
import AppShell from "@/components/ui/AppShell";

interface OnlinePageShellProps {
  children: ReactNode;
  className?: string;
  showNav?: boolean;
}

/**
 * Standard content-column page: the site AppShell with the default width.
 * Pages own their heading (see PageHeader); the nav carries the section.
 */
export default function OnlinePageShell({
  children,
  className,
  showNav = true,
}: OnlinePageShellProps) {
  return (
    <AppShell width="wide" showNav={showNav} className={className}>
      {children}
    </AppShell>
  );
}
