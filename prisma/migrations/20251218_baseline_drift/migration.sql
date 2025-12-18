-- Baseline migration to capture drift from db push operations
-- These changes already exist in the database, this migration just records them in history

-- Add patronTier column to User (already exists in DB)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "patronTier" TEXT;

-- Add indexes that already exist in DB
CREATE INDEX IF NOT EXISTS "DeckCard_deckId_zone_idx" ON "DeckCard"("deckId", "zone");
CREATE INDEX IF NOT EXISTS "DeckCard_variantId_idx" ON "DeckCard"("variantId");
CREATE INDEX IF NOT EXISTS "HumanCardStats_format_plays_idx" ON "HumanCardStats"("format", "plays");
CREATE INDEX IF NOT EXISTS "Match_tournamentId_status_idx" ON "Match"("tournamentId", "status");
CREATE INDEX IF NOT EXISTS "PlayerStanding_tournamentId_matchPoints_idx" ON "PlayerStanding"("tournamentId", "matchPoints" DESC);
CREATE INDEX IF NOT EXISTS "Variant_typeText_idx" ON "Variant"("typeText");
