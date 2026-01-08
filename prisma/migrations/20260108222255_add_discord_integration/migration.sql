/*
  Warnings:

  - A unique constraint covering the columns `[discordId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."DiscordChallengeStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired');

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "discordId" TEXT,
ADD COLUMN     "discordUsername" TEXT;

-- CreateTable
CREATE TABLE "public"."DiscordLinkToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "discordTag" TEXT NOT NULL,
    "guildId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiscordLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DiscordChallenge" (
    "id" TEXT NOT NULL,
    "challengerId" TEXT NOT NULL,
    "challengeeId" TEXT NOT NULL,
    "format" "public"."GameFormat" NOT NULL DEFAULT 'constructed',
    "guildId" TEXT,
    "channelId" TEXT,
    "status" "public"."DiscordChallengeStatus" NOT NULL DEFAULT 'pending',
    "matchId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "DiscordChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordLinkToken_token_key" ON "public"."DiscordLinkToken"("token");

-- CreateIndex
CREATE INDEX "DiscordLinkToken_token_idx" ON "public"."DiscordLinkToken"("token");

-- CreateIndex
CREATE INDEX "DiscordLinkToken_discordId_idx" ON "public"."DiscordLinkToken"("discordId");

-- CreateIndex
CREATE INDEX "DiscordLinkToken_expiresAt_idx" ON "public"."DiscordLinkToken"("expiresAt");

-- CreateIndex
CREATE INDEX "DiscordChallenge_challengerId_idx" ON "public"."DiscordChallenge"("challengerId");

-- CreateIndex
CREATE INDEX "DiscordChallenge_challengeeId_idx" ON "public"."DiscordChallenge"("challengeeId");

-- CreateIndex
CREATE INDEX "DiscordChallenge_status_idx" ON "public"."DiscordChallenge"("status");

-- CreateIndex
CREATE INDEX "DiscordChallenge_expiresAt_idx" ON "public"."DiscordChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_discordId_key" ON "public"."User"("discordId");
