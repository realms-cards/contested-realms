-- AlterTable
ALTER TABLE "public"."MatchResult" ADD COLUMN     "isPrecon" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."OnlineMatchSession" ADD COLUMN     "isPrecon" BOOLEAN NOT NULL DEFAULT false;
