-- CreateTable
CREATE TABLE "public"."League" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discordGuildId" TEXT NOT NULL,
    "apiEndpoint" TEXT,
    "apiKeyEnvVar" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "iconUrl" TEXT,
    "badgeColor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeagueMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LeagueMatchReport" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "winnerId" TEXT,
    "loserId" TEXT,
    "isDraw" BOOLEAN NOT NULL DEFAULT false,
    "reportPayload" JSONB NOT NULL,
    "reportStatus" TEXT NOT NULL DEFAULT 'pending',
    "responseCode" INTEGER,
    "responseBody" TEXT,
    "errorMessage" TEXT,
    "reportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeagueMatchReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "League_slug_key" ON "public"."League"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "League_discordGuildId_key" ON "public"."League"("discordGuildId");

-- CreateIndex
CREATE INDEX "League_enabled_idx" ON "public"."League"("enabled");

-- CreateIndex
CREATE INDEX "LeagueMembership_userId_idx" ON "public"."LeagueMembership"("userId");

-- CreateIndex
CREATE INDEX "LeagueMembership_leagueId_idx" ON "public"."LeagueMembership"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueMembership_userId_leagueId_key" ON "public"."LeagueMembership"("userId", "leagueId");

-- CreateIndex
CREATE INDEX "LeagueMatchReport_leagueId_idx" ON "public"."LeagueMatchReport"("leagueId");

-- CreateIndex
CREATE INDEX "LeagueMatchReport_reportStatus_idx" ON "public"."LeagueMatchReport"("reportStatus");

-- CreateIndex
CREATE INDEX "LeagueMatchReport_createdAt_idx" ON "public"."LeagueMatchReport"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueMatchReport_matchId_leagueId_key" ON "public"."LeagueMatchReport"("matchId", "leagueId");

-- AddForeignKey
ALTER TABLE "public"."LeagueMembership" ADD CONSTRAINT "LeagueMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeagueMembership" ADD CONSTRAINT "LeagueMembership_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "public"."League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LeagueMatchReport" ADD CONSTRAINT "LeagueMatchReport_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "public"."League"("id") ON DELETE CASCADE ON UPDATE CASCADE;
