export interface DraftCard {
  id: string;
  name: string;
  cardName?: string;
  slug: string;
  type?: string | null;
  cost?: string | null;
  rarity?: string | null;
  setName?: string;
  [key: string]: unknown;
}

export interface DraftParticipantSummary {
  playerId: string;
  playerName: string;
  seatNumber: number;
  status?: string;
}
