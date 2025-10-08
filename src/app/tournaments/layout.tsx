// RealtimeTournamentProvider is already provided at root level in app/layout.tsx
// No need to nest providers here - it causes duplicate socket connections
export default function TournamentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
