-- AlterTable
ALTER TABLE "public"."HumanCardStats" ADD COLUMN     "inDeck" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "inDeckDraws" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "inDeckLosses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "inDeckWins" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."HumanCardStatsPeriod" (
    "id" TEXT NOT NULL,
    "cardId" INTEGER NOT NULL,
    "format" "public"."GameFormat" NOT NULL,
    "period" TEXT NOT NULL,
    "plays" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "inDeck" INTEGER NOT NULL DEFAULT 0,
    "inDeckWins" INTEGER NOT NULL DEFAULT 0,
    "inDeckLosses" INTEGER NOT NULL DEFAULT 0,
    "inDeckDraws" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HumanCardStatsPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HumanCardStatsPeriod_format_period_idx" ON "public"."HumanCardStatsPeriod"("format", "period");

-- CreateIndex
CREATE UNIQUE INDEX "HumanCardStatsPeriod_cardId_format_period_key" ON "public"."HumanCardStatsPeriod"("cardId", "format", "period");

