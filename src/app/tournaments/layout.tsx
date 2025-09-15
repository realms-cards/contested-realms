"use client";

import React from "react";
import { RealtimeTournamentProvider } from "@/contexts/RealtimeTournamentContext";

export default function TournamentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <RealtimeTournamentProvider>
      {children}
    </RealtimeTournamentProvider>
  );
}
