-- Lobby (global) chat log: durable copy of the Redis chat:global list, which
-- used to expire after 7 idle days and could be evicted under memory pressure.
CREATE TABLE "GlobalChatMessage" (
    "id" TEXT NOT NULL,
    "senderId" TEXT,
    "senderName" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlobalChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GlobalChatMessage_createdAt_idx" ON "GlobalChatMessage"("createdAt");
