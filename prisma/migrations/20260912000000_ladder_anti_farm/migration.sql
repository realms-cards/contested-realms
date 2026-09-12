-- Ladder anti-farm overhaul: ratings are now a deterministic replay of
-- MatchResult history (decay, per-opponent caps, provisional gating), so the
-- result row needs to carry everything the replay decides on.

-- One row per match. Older code deduplicated with a racy findFirst, so drop
-- any duplicates (keep the oldest cuid) before adding the unique index.
DELETE FROM "MatchResult" a USING "MatchResult" b
  WHERE a."matchId" = b."matchId" AND a."id" > b."id";

ALTER TABLE "MatchResult"
  ADD COLUMN "rated" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "ratedMode" TEXT NOT NULL DEFAULT 'full',
  ADD COLUMN "unratedReason" TEXT,
  ADD COLUMN "endReason" TEXT,
  ADD COLUMN "turnCount" INTEGER,
  ADD COLUMN "ipHashes" JSONB,
  ADD COLUMN "sameNetwork" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "MatchResult_matchId_key" ON "MatchResult"("matchId");
CREATE INDEX "MatchResult_format_rated_completedAt_idx"
  ON "MatchResult"("format", "rated", "completedAt");

-- Rows that lost a participant (deleted account, or the old nulling bug) can
-- no longer be attributed and must not move anyone's rating.
UPDATE "MatchResult"
  SET "rated" = false, "unratedReason" = 'missing_user'
  WHERE "isDraw" = false AND ("winnerId" IS NULL OR "loserId" IS NULL);

-- Precon matches were always excluded from the ladder; make that explicit.
UPDATE "MatchResult"
  SET "rated" = false, "unratedReason" = 'precon'
  WHERE "isPrecon" = true AND "rated" = true;

-- Replay outputs stored on the entry so the API no longer counts opponents
-- per row. Every row starts provisional; the first replay fills it in.
ALTER TABLE "LeaderboardEntry"
  ADD COLUMN "uniqueOpponents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ratedGames" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "provisional" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "lastRatedAt" TIMESTAMP(3);

CREATE INDEX "LeaderboardEntry_format_timeFrame_provisional_rating_idx"
  ON "LeaderboardEntry"("format", "timeFrame", "provisional", "rating");

-- Admin switch: every game of an excluded user is skipped by the replay.
ALTER TABLE "User" ADD COLUMN "ladderExcluded" BOOLEAN NOT NULL DEFAULT false;
