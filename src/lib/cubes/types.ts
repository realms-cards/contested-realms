export type CubeSummary = {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  imported: boolean;
  updatedAt: string;
  cardCount: number;
  /** Count of sideboard/extras cards (not in draft boosters) */
  sideboardCount: number;
  userName?: string;
  isOwner?: boolean;
};
