-- CreateEnum
CREATE TYPE "public"."InvitationStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired');

-- AlterTable
ALTER TABLE "public"."Tournament" ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."TournamentInvitation" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "inviterId" TEXT,
    "status" "public"."InvitationStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "TournamentInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CardEvaluation" (
    "id" SERIAL NOT NULL,
    "cardId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "evaluationFunction" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "synergies" JSONB NOT NULL,
    "antiSynergies" JSONB NOT NULL,
    "situational" BOOLEAN NOT NULL DEFAULT false,
    "complexity" TEXT NOT NULL,
    "generatedBy" TEXT NOT NULL,
    "model" TEXT,
    "validationStatus" TEXT NOT NULL DEFAULT 'pending',
    "validationError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentInvitation_tournamentId_idx" ON "public"."TournamentInvitation"("tournamentId");

-- CreateIndex
CREATE INDEX "TournamentInvitation_inviteeId_idx" ON "public"."TournamentInvitation"("inviteeId");

-- CreateIndex
CREATE INDEX "TournamentInvitation_status_idx" ON "public"."TournamentInvitation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentInvitation_tournamentId_inviteeId_key" ON "public"."TournamentInvitation"("tournamentId", "inviteeId");

-- CreateIndex
CREATE UNIQUE INDEX "CardEvaluation_cardId_key" ON "public"."CardEvaluation"("cardId");

-- CreateIndex
CREATE INDEX "CardEvaluation_cardId_idx" ON "public"."CardEvaluation"("cardId");

-- CreateIndex
CREATE INDEX "CardEvaluation_category_idx" ON "public"."CardEvaluation"("category");

-- CreateIndex
CREATE INDEX "CardEvaluation_validationStatus_idx" ON "public"."CardEvaluation"("validationStatus");

-- CreateIndex
CREATE INDEX "CardEvaluation_generatedBy_idx" ON "public"."CardEvaluation"("generatedBy");

-- CreateIndex
CREATE INDEX "Tournament_isPrivate_idx" ON "public"."Tournament"("isPrivate");

-- AddForeignKey
ALTER TABLE "public"."TournamentInvitation" ADD CONSTRAINT "TournamentInvitation_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TournamentInvitation" ADD CONSTRAINT "TournamentInvitation_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CardEvaluation" ADD CONSTRAINT "CardEvaluation_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
