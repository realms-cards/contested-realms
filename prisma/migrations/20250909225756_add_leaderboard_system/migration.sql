-- CreateTable
CREATE TABLE "LeaderboardEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "timeFrame" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "winRate" REAL NOT NULL DEFAULT 0.0,
    "rating" INTEGER NOT NULL DEFAULT 1200,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "tournamentWins" INTEGER NOT NULL DEFAULT 0,
    "lastActive" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LeaderboardEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "lobbyName" TEXT,
    "winnerId" TEXT,
    "loserId" TEXT,
    "isDraw" BOOLEAN NOT NULL DEFAULT false,
    "format" TEXT NOT NULL,
    "tournamentId" TEXT,
    "players" JSONB NOT NULL,
    "duration" INTEGER,
    "completedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchResult_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MatchResult_loserId_fkey" FOREIGN KEY ("loserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LeaderboardEntry_format_timeFrame_rating_idx" ON "LeaderboardEntry"("format", "timeFrame", "rating");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_format_timeFrame_winRate_idx" ON "LeaderboardEntry"("format", "timeFrame", "winRate");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_rank_idx" ON "LeaderboardEntry"("rank");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardEntry_playerId_format_timeFrame_key" ON "LeaderboardEntry"("playerId", "format", "timeFrame");

-- CreateIndex
CREATE INDEX "MatchResult_winnerId_idx" ON "MatchResult"("winnerId");

-- CreateIndex
CREATE INDEX "MatchResult_loserId_idx" ON "MatchResult"("loserId");

-- CreateIndex
CREATE INDEX "MatchResult_format_idx" ON "MatchResult"("format");

-- CreateIndex
CREATE INDEX "MatchResult_tournamentId_idx" ON "MatchResult"("tournamentId");

-- CreateIndex
CREATE INDEX "MatchResult_completedAt_idx" ON "MatchResult"("completedAt");
