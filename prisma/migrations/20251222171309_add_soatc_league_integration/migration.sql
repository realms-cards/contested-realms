-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "soatcAutoDetect" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "soatcUuid" TEXT;

-- CreateTable
CREATE TABLE "public"."SoatcMatchResult" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "tournamentName" TEXT NOT NULL,
    "player1Id" TEXT NOT NULL,
    "player1SoatcId" TEXT NOT NULL,
    "player2Id" TEXT NOT NULL,
    "player2SoatcId" TEXT NOT NULL,
    "winnerId" TEXT,
    "winnerSoatcId" TEXT,
    "isDraw" BOOLEAN NOT NULL DEFAULT false,
    "format" "public"."GameFormat" NOT NULL,
    "resultJson" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoatcMatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SoatcMatchResult_matchId_key" ON "public"."SoatcMatchResult"("matchId");

-- CreateIndex
CREATE INDEX "SoatcMatchResult_player1Id_idx" ON "public"."SoatcMatchResult"("player1Id");

-- CreateIndex
CREATE INDEX "SoatcMatchResult_player2Id_idx" ON "public"."SoatcMatchResult"("player2Id");

-- CreateIndex
CREATE INDEX "SoatcMatchResult_tournamentId_idx" ON "public"."SoatcMatchResult"("tournamentId");

-- CreateIndex
CREATE INDEX "SoatcMatchResult_completedAt_idx" ON "public"."SoatcMatchResult"("completedAt");

-- AddForeignKey
ALTER TABLE "public"."SoatcMatchResult" ADD CONSTRAINT "SoatcMatchResult_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SoatcMatchResult" ADD CONSTRAINT "SoatcMatchResult_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
