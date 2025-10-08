-- CreateTable
CREATE TABLE "public"."TournamentBroadcastEvent" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emittedBy" TEXT,
    "roomTarget" TEXT NOT NULL,

    CONSTRAINT "TournamentBroadcastEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SocketBroadcastHealth" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" TEXT NOT NULL,
    "tournamentId" TEXT,
    "targetUrl" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "statusCode" INTEGER,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL,

    CONSTRAINT "SocketBroadcastHealth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentBroadcastEvent_tournamentId_timestamp_idx" ON "public"."TournamentBroadcastEvent"("tournamentId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "TournamentBroadcastEvent_eventType_idx" ON "public"."TournamentBroadcastEvent"("eventType");

-- CreateIndex
CREATE INDEX "SocketBroadcastHealth_timestamp_idx" ON "public"."SocketBroadcastHealth"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "SocketBroadcastHealth_success_idx" ON "public"."SocketBroadcastHealth"("success");

-- CreateIndex
CREATE INDEX "SocketBroadcastHealth_eventType_idx" ON "public"."SocketBroadcastHealth"("eventType");

-- T029: Add check constraint for PlayerStanding.matchPoints validation
-- Ensures matchPoints always equals (wins * 3) + draws
ALTER TABLE "public"."PlayerStanding"
  ADD CONSTRAINT "PlayerStanding_matchPoints_check"
  CHECK ("matchPoints" = ("wins" * 3) + "draws");
