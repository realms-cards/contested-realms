export type CubeSummary = {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  imported: boolean;
  updatedAt: string;
  cardCount: number;
  userName?: string;
  isOwner?: boolean;
};
