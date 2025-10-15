-- Manual fix for the failed migration
-- This handles the case where InvitationStatus enum already exists

-- First, mark the migration as rolled back again
UPDATE _prisma_migrations
SET rolled_back_at = NOW(),
    finished_at = NULL
WHERE migration_name = '20251014230734_add_card_evaluation_table';

-- Now manually apply each part, with error handling

-- 1. Create enum only if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InvitationStatus') THEN
        CREATE TYPE "public"."InvitationStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired');
    END IF;
END $$;

-- 2. Add column to Tournament if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'Tournament'
        AND column_name = 'isPrivate'
    ) THEN
        ALTER TABLE "public"."Tournament" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- 3. Create TournamentInvitation table if it doesn't exist
CREATE TABLE IF NOT EXISTS "public"."TournamentInvitation" (
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

-- 4. Create CardEvaluation table if it doesn't exist
CREATE TABLE IF NOT EXISTS "public"."CardEvaluation" (
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

-- 5. Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS "TournamentInvitation_tournamentId_idx" ON "public"."TournamentInvitation"("tournamentId");
CREATE INDEX IF NOT EXISTS "TournamentInvitation_inviteeId_idx" ON "public"."TournamentInvitation"("inviteeId");
CREATE INDEX IF NOT EXISTS "TournamentInvitation_status_idx" ON "public"."TournamentInvitation"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "TournamentInvitation_tournamentId_inviteeId_key" ON "public"."TournamentInvitation"("tournamentId", "inviteeId");

CREATE UNIQUE INDEX IF NOT EXISTS "CardEvaluation_cardId_key" ON "public"."CardEvaluation"("cardId");
CREATE INDEX IF NOT EXISTS "CardEvaluation_cardId_idx" ON "public"."CardEvaluation"("cardId");
CREATE INDEX IF NOT EXISTS "CardEvaluation_category_idx" ON "public"."CardEvaluation"("category");
CREATE INDEX IF NOT EXISTS "CardEvaluation_validationStatus_idx" ON "public"."CardEvaluation"("validationStatus");
CREATE INDEX IF NOT EXISTS "CardEvaluation_generatedBy_idx" ON "public"."CardEvaluation"("generatedBy");

CREATE INDEX IF NOT EXISTS "Tournament_isPrivate_idx" ON "public"."Tournament"("isPrivate");

-- 6. Add foreign keys if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'TournamentInvitation_tournamentId_fkey'
    ) THEN
        ALTER TABLE "public"."TournamentInvitation"
        ADD CONSTRAINT "TournamentInvitation_tournamentId_fkey"
        FOREIGN KEY ("tournamentId") REFERENCES "public"."Tournament"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'TournamentInvitation_inviteeId_fkey'
    ) THEN
        ALTER TABLE "public"."TournamentInvitation"
        ADD CONSTRAINT "TournamentInvitation_inviteeId_fkey"
        FOREIGN KEY ("inviteeId") REFERENCES "public"."User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'CardEvaluation_cardId_fkey'
    ) THEN
        ALTER TABLE "public"."CardEvaluation"
        ADD CONSTRAINT "CardEvaluation_cardId_fkey"
        FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- 7. Mark migration as completed
UPDATE _prisma_migrations
SET applied_steps_count = 1,
    finished_at = NOW(),
    rolled_back_at = NULL,
    logs = 'Manually fixed after InvitationStatus enum already existed'
WHERE migration_name = '20251014230734_add_card_evaluation_table';
