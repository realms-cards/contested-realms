-- Baseline migration to capture drift from db push operations
-- These changes already exist in the database, this migration just records them in history

-- Add Rainbow to Finish enum
ALTER TYPE "Finish" ADD VALUE IF NOT EXISTS 'Rainbow';

-- Make CardSetMetadata.rarity nullable
ALTER TABLE "CardSetMetadata" ALTER COLUMN "rarity" DROP NOT NULL;

-- Add patronTier column to User (already exists in DB)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "patronTier" TEXT;

-- Add selectedPlaymatRef and selectedCardbackRef to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "selectedPlaymatRef" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "selectedCardbackRef" TEXT;

-- Add isFixedPack to PackConfig
ALTER TABLE "PackConfig" ADD COLUMN IF NOT EXISTS "isFixedPack" BOOLEAN NOT NULL DEFAULT false;

-- Create CustomPlaymat table
CREATE TABLE IF NOT EXISTS "CustomPlaymat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomPlaymat_pkey" PRIMARY KEY ("id")
);

-- Create CustomCardback table
CREATE TABLE IF NOT EXISTS "CustomCardback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spellbookMime" TEXT NOT NULL,
    "spellbookWidth" INTEGER NOT NULL,
    "spellbookHeight" INTEGER NOT NULL,
    "spellbookSize" INTEGER NOT NULL,
    "spellbookData" BYTEA NOT NULL,
    "atlasMime" TEXT NOT NULL,
    "atlasWidth" INTEGER NOT NULL,
    "atlasHeight" INTEGER NOT NULL,
    "atlasSize" INTEGER NOT NULL,
    "atlasData" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomCardback_pkey" PRIMARY KEY ("id")
);

-- Add indexes
CREATE INDEX IF NOT EXISTS "DeckCard_deckId_zone_idx" ON "DeckCard"("deckId", "zone");
CREATE INDEX IF NOT EXISTS "DeckCard_variantId_idx" ON "DeckCard"("variantId");
CREATE INDEX IF NOT EXISTS "HumanCardStats_format_plays_idx" ON "HumanCardStats"("format", "plays");
CREATE INDEX IF NOT EXISTS "Match_tournamentId_status_idx" ON "Match"("tournamentId", "status");
CREATE INDEX IF NOT EXISTS "PlayerStanding_tournamentId_matchPoints_idx" ON "PlayerStanding"("tournamentId", "matchPoints" DESC);
CREATE INDEX IF NOT EXISTS "Variant_typeText_idx" ON "Variant"("typeText");
CREATE INDEX IF NOT EXISTS "CustomPlaymat_userId_idx" ON "CustomPlaymat"("userId");
CREATE INDEX IF NOT EXISTS "CustomPlaymat_createdAt_idx" ON "CustomPlaymat"("createdAt");
CREATE INDEX IF NOT EXISTS "CustomCardback_userId_idx" ON "CustomCardback"("userId");
CREATE INDEX IF NOT EXISTS "CustomCardback_createdAt_idx" ON "CustomCardback"("createdAt");

-- Add foreign keys (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomPlaymat_userId_fkey') THEN
        ALTER TABLE "CustomPlaymat" ADD CONSTRAINT "CustomPlaymat_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomCardback_userId_fkey') THEN
        ALTER TABLE "CustomCardback" ADD CONSTRAINT "CustomCardback_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
