-- AlterTable: Make rarity nullable on CardSetMetadata
-- This allows cards without a defined rarity (e.g., promo cards) to be ingested
ALTER TABLE "public"."CardSetMetadata" ALTER COLUMN "rarity" DROP NOT NULL;
