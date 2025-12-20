-- Production reconciliation migration
-- This migration brings prod schema in sync with the Prisma schema
-- It handles the case where CustomCardback table and sleeve ref columns don't exist in prod

-- Add selectedSpellbookRef and selectedAtlasRef to User (these are the new separate columns)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "selectedSpellbookRef" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "selectedAtlasRef" TEXT;

-- Create CustomCardback table if it doesn't exist
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

-- Add indexes for CustomCardback
CREATE INDEX IF NOT EXISTS "CustomCardback_userId_idx" ON "CustomCardback"("userId");
CREATE INDEX IF NOT EXISTS "CustomCardback_createdAt_idx" ON "CustomCardback"("createdAt");

-- Add foreign key for CustomCardback (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomCardback_userId_fkey') THEN
        ALTER TABLE "CustomCardback" ADD CONSTRAINT "CustomCardback_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Drop selectedCardbackRef if it exists (cleanup from old schema)
ALTER TABLE "User" DROP COLUMN IF EXISTS "selectedCardbackRef";
