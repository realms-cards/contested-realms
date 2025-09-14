-- CreateEnum
CREATE TYPE "public"."Rarity" AS ENUM ('Ordinary', 'Exceptional', 'Elite', 'Unique');

-- CreateEnum
CREATE TYPE "public"."Finish" AS ENUM ('Standard', 'Foil');

-- CreateEnum
CREATE TYPE "public"."TournamentFormat" AS ENUM ('sealed', 'draft', 'constructed');

-- CreateEnum
CREATE TYPE "public"."TournamentStatus" AS ENUM ('registering', 'preparing', 'active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "public"."PreparationStatus" AS ENUM ('notStarted', 'inProgress', 'completed');

-- CreateEnum
CREATE TYPE "public"."RoundStatus" AS ENUM ('pending', 'active', 'completed');

-- CreateEnum
CREATE TYPE "public"."MatchStatus" AS ENUM ('pending', 'active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "public"."GameFormat" AS ENUM ('constructed', 'sealed', 'draft');

-- CreateEnum
CREATE TYPE "public"."TimeFrame" AS ENUM ('all_time', 'monthly', 'weekly');

-- CreateEnum
CREATE TYPE "public"."OnlineMatchStatus" AS ENUM ('waiting', 'deck_construction', 'in_progress', 'ended');

-- CreateEnum
CREATE TYPE "public"."DraftStatus" AS ENUM ('waiting', 'active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "public"."ParticipantStatus" AS ENUM ('waiting', 'active', 'completed', 'disconnected');

-- CreateTable
CREATE TABLE "public"."Set" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "Set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Card" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "elements" TEXT,
    "subTypes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CardSetMetadata" (
    "id" SERIAL NOT NULL,
    "cardId" INTEGER NOT NULL,
    "setId" INTEGER NOT NULL,
    "rarity" "public"."Rarity" NOT NULL,
    "type" TEXT NOT NULL,
    "rulesText" TEXT,
    "cost" INTEGER,
    "attack" INTEGER,
    "defence" INTEGER,
    "life" INTEGER,
    "thresholds" JSONB,

    CONSTRAINT "CardSetMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Variant" (
    "id" SERIAL NOT NULL,
    "cardId" INTEGER NOT NULL,
    "setId" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "finish" "public"."Finish" NOT NULL,
    "product" TEXT NOT NULL,
    "artist" TEXT,
    "flavorText" TEXT,
    "typeText" TEXT,
    "imageBasename" TEXT,

    CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PackConfig" (
    "id" SERIAL NOT NULL,
    "setId" INTEGER NOT NULL,
    "ordinaryCount" INTEGER NOT NULL,
    "exceptionalCount" INTEGER NOT NULL,
    "eliteOrUniqueCount" INTEGER NOT NULL,
    "uniqueChance" DOUBLE PRECISION NOT NULL,
    "siteOrAvatarCount" INTEGER NOT NULL DEFAULT 0,
    "foilChance" DOUBLE PRECISION,
    "foilUniqueWeight" INTEGER NOT NULL DEFAULT 1,
    "foilEliteWeight" INTEGER NOT NULL DEFAULT 3,
    "foilExceptionalWeight" INTEGER NOT NULL DEFAULT 6,
    "foilOrdinaryWeight" INTEGER NOT NULL DEFAULT 7,
    "foilReplacesOrdinary" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PackConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Deck" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'Constructed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Deck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeckCard" (
    "id" SERIAL NOT NULL,
    "deckId" TEXT NOT NULL,
    "cardId" INTEGER NOT NULL,
    "setId" INTEGER,
    "variantId" INTEGER,
    "zone" TEXT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "DeckCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "isPro" BOOLEAN NOT NULL DEFAULT false,
    "stats" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "public"."Tournament" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "format" "public"."TournamentFormat" NOT NULL,
    "status" "public"."TournamentStatus" NOT NULL DEFAULT 'registering',
    "maxPlayers" INTEGER NOT NULL,
    "settings" JSONB NOT NULL,
    "featureFlags" JSONB,
    "startedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TournamentRegistration" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preparationStatus" "public"."PreparationStatus" NOT NULL DEFAULT 'notStarted',
    "deckSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "preparationData" JSONB,

    CONSTRAINT "TournamentRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlayerStanding" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "matchPoints" INTEGER NOT NULL DEFAULT 0,
    "gameWinPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "opponentMatchWinPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "isEliminated" BOOLEAN NOT NULL DEFAULT false,
    "currentMatchId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerStanding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TournamentRound" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "status" "public"."RoundStatus" NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "pairingData" JSONB,

    CONSTRAINT "TournamentRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Match" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT,
    "roundId" TEXT,
    "status" "public"."MatchStatus" NOT NULL DEFAULT 'pending',
    "players" JSONB NOT NULL,
    "results" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TournamentStatistics" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "matchPoints" INTEGER NOT NULL DEFAULT 0,
    "tiebreakers" JSONB NOT NULL,
    "finalRanking" INTEGER,

    CONSTRAINT "TournamentStatistics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeaderboardEntry" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "format" "public"."GameFormat" NOT NULL,
    "timeFrame" "public"."TimeFrame" NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "rating" INTEGER NOT NULL DEFAULT 1200,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "tournamentWins" INTEGER NOT NULL DEFAULT 0,
    "lastActive" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaderboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OnlineMatchSession" (
    "id" TEXT NOT NULL,
    "lobbyId" TEXT,
    "lobbyName" TEXT,
    "playerIds" TEXT[],
    "status" "public"."OnlineMatchStatus" NOT NULL DEFAULT 'waiting',
    "seed" TEXT NOT NULL,
    "turn" TEXT,
    "winnerId" TEXT,
    "matchType" "public"."GameFormat" NOT NULL,
    "sealedConfig" JSONB,
    "draftConfig" JSONB,
    "draftState" JSONB,
    "playerDecks" JSONB,
    "sealedPacks" JSONB,
    "game" JSONB,
    "lastTs" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnlineMatchSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OnlineMatchAction" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "timestamp" BIGINT NOT NULL,
    "patch" JSONB NOT NULL,

    CONSTRAINT "OnlineMatchAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MatchResult" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "lobbyName" TEXT,
    "winnerId" TEXT,
    "loserId" TEXT,
    "isDraw" BOOLEAN NOT NULL DEFAULT false,
    "format" "public"."GameFormat" NOT NULL,
    "tournamentId" TEXT,
    "players" JSONB NOT NULL,
    "duration" INTEGER,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DraftSession" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "status" "public"."DraftStatus" NOT NULL DEFAULT 'waiting',
    "packConfiguration" JSONB NOT NULL,
    "settings" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DraftParticipant" (
    "id" TEXT NOT NULL,
    "draftSessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "seatNumber" INTEGER NOT NULL,
    "status" "public"."ParticipantStatus" NOT NULL DEFAULT 'waiting',
    "pickData" JSONB,
    "deckData" JSONB,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Set_name_key" ON "public"."Set"("name");

-- CreateIndex
CREATE INDEX "Set_name_idx" ON "public"."Set"("name");

-- CreateIndex
CREATE INDEX "Card_name_idx" ON "public"."Card"("name");

-- CreateIndex
CREATE INDEX "CardSetMetadata_setId_rarity_idx" ON "public"."CardSetMetadata"("setId", "rarity");

-- CreateIndex
CREATE UNIQUE INDEX "CardSetMetadata_cardId_setId_key" ON "public"."CardSetMetadata"("cardId", "setId");

-- CreateIndex
CREATE UNIQUE INDEX "Variant_slug_key" ON "public"."Variant"("slug");

-- CreateIndex
CREATE INDEX "Variant_setId_idx" ON "public"."Variant"("setId");

-- CreateIndex
CREATE INDEX "Variant_cardId_idx" ON "public"."Variant"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "PackConfig_setId_key" ON "public"."PackConfig"("setId");

-- CreateIndex
CREATE INDEX "Deck_userId_idx" ON "public"."Deck"("userId");

-- CreateIndex
CREATE INDEX "DeckCard_deckId_idx" ON "public"."DeckCard"("deckId");

-- CreateIndex
CREATE INDEX "DeckCard_cardId_idx" ON "public"."DeckCard"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "public"."Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "public"."Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "public"."VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "public"."VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Tournament_status_idx" ON "public"."Tournament"("status");

-- CreateIndex
CREATE INDEX "Tournament_createdAt_idx" ON "public"."Tournament"("createdAt");

-- CreateIndex
CREATE INDEX "Tournament_creatorId_idx" ON "public"."Tournament"("creatorId");

-- CreateIndex
CREATE INDEX "TournamentRegistration_tournamentId_idx" ON "public"."TournamentRegistration"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentRegistration_tournamentId_playerId_key" ON "public"."TournamentRegistration"("tournamentId", "playerId");

-- CreateIndex
CREATE INDEX "PlayerStanding_tournamentId_idx" ON "public"."PlayerStanding"("tournamentId");

-- CreateIndex
CREATE INDEX "PlayerStanding_matchPoints_idx" ON "public"."PlayerStanding"("matchPoints");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerStanding_tournamentId_playerId_key" ON "public"."PlayerStanding"("tournamentId", "playerId");

-- CreateIndex
CREATE INDEX "TournamentRound_tournamentId_idx" ON "public"."TournamentRound"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentRound_tournamentId_roundNumber_key" ON "public"."TournamentRound"("tournamentId", "roundNumber");

-- CreateIndex
CREATE INDEX "Match_tournamentId_idx" ON "public"."Match"("tournamentId");

-- CreateIndex
CREATE INDEX "Match_roundId_idx" ON "public"."Match"("roundId");

-- CreateIndex
CREATE INDEX "Match_status_idx" ON "public"."Match"("status");

-- CreateIndex
CREATE INDEX "TournamentStatistics_tournamentId_idx" ON "public"."TournamentStatistics"("tournamentId");

-- CreateIndex
CREATE INDEX "TournamentStatistics_matchPoints_idx" ON "public"."TournamentStatistics"("matchPoints");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentStatistics_tournamentId_playerId_key" ON "public"."TournamentStatistics"("tournamentId", "playerId");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_format_timeFrame_rating_idx" ON "public"."LeaderboardEntry"("format", "timeFrame", "rating");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_format_timeFrame_winRate_idx" ON "public"."LeaderboardEntry"("format", "timeFrame", "winRate");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_rank_idx" ON "public"."LeaderboardEntry"("rank");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardEntry_playerId_format_timeFrame_key" ON "public"."LeaderboardEntry"("playerId", "format", "timeFrame");

-- CreateIndex
CREATE INDEX "OnlineMatchSession_status_idx" ON "public"."OnlineMatchSession"("status");

-- CreateIndex
CREATE INDEX "OnlineMatchSession_createdAt_idx" ON "public"."OnlineMatchSession"("createdAt");

-- CreateIndex
CREATE INDEX "OnlineMatchAction_matchId_idx" ON "public"."OnlineMatchAction"("matchId");

-- CreateIndex
CREATE INDEX "OnlineMatchAction_timestamp_idx" ON "public"."OnlineMatchAction"("timestamp");

-- CreateIndex
CREATE INDEX "MatchResult_winnerId_idx" ON "public"."MatchResult"("winnerId");

-- CreateIndex
CREATE INDEX "MatchResult_loserId_idx" ON "public"."MatchResult"("loserId");

-- CreateIndex
CREATE INDEX "MatchResult_format_idx" ON "public"."MatchResult"("format");

-- CreateIndex
CREATE INDEX "MatchResult_tournamentId_idx" ON "public"."MatchResult"("tournamentId");

-- CreateIndex
CREATE INDEX "MatchResult_completedAt_idx" ON "public"."MatchResult"("completedAt");

-- CreateIndex
CREATE INDEX "DraftSession_tournamentId_idx" ON "public"."DraftSession"("tournamentId");

-- CreateIndex
CREATE INDEX "DraftSession_status_idx" ON "public"."DraftSession"("status");

-- CreateIndex
CREATE INDEX "DraftParticipant_draftSessionId_idx" ON "public"."DraftParticipant"("draftSessionId");

-- CreateIndex
CREATE INDEX "DraftParticipant_playerId_idx" ON "public"."DraftParticipant"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftParticipant_draftSessionId_playerId_key" ON "public"."DraftParticipant"("draftSessionId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftParticipant_draftSessionId_seatNumber_key" ON "public"."DraftParticipant"("draftSessionId", "seatNumber");

-- AddForeignKey
ALTER TABLE "public"."CardSetMetadata" ADD CONSTRAINT "CardSetMetadata_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CardSetMetadata" ADD CONSTRAINT "CardSetMetadata_setId_fkey" FOREIGN KEY ("setId") REFERENCES "public"."Set"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Variant" ADD CONSTRAINT "Variant_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Variant" ADD CONSTRAINT "Variant_setId_fkey" FOREIGN KEY ("setId") REFERENCES "public"."Set"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PackConfig" ADD CONSTRAINT "PackConfig_setId_fkey" FOREIGN KEY ("setId") REFERENCES "public"."Set"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Deck" ADD CONSTRAINT "Deck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeckCard" ADD CONSTRAINT "DeckCard_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "public"."Deck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeckCard" ADD CONSTRAINT "DeckCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeckCard" ADD CONSTRAINT "DeckCard_setId_fkey" FOREIGN KEY ("setId") REFERENCES "public"."Set"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeckCard" ADD CONSTRAINT "DeckCard_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."Variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Tournament" ADD CONSTRAINT "Tournament_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TournamentRegistration" ADD CONSTRAINT "TournamentRegistration_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TournamentRegistration" ADD CONSTRAINT "TournamentRegistration_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlayerStanding" ADD CONSTRAINT "PlayerStanding_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlayerStanding" ADD CONSTRAINT "PlayerStanding_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TournamentRound" ADD CONSTRAINT "TournamentRound_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Match" ADD CONSTRAINT "Match_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Match" ADD CONSTRAINT "Match_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "public"."TournamentRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TournamentStatistics" ADD CONSTRAINT "TournamentStatistics_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TournamentStatistics" ADD CONSTRAINT "TournamentStatistics_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeaderboardEntry" ADD CONSTRAINT "LeaderboardEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OnlineMatchAction" ADD CONSTRAINT "OnlineMatchAction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "public"."OnlineMatchSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MatchResult" ADD CONSTRAINT "MatchResult_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MatchResult" ADD CONSTRAINT "MatchResult_loserId_fkey" FOREIGN KEY ("loserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DraftSession" ADD CONSTRAINT "DraftSession_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DraftParticipant" ADD CONSTRAINT "DraftParticipant_draftSessionId_fkey" FOREIGN KEY ("draftSessionId") REFERENCES "public"."DraftSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DraftParticipant" ADD CONSTRAINT "DraftParticipant_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
