-- CreateTable
CREATE TABLE "public"."MetaStatsSnapshot" (
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaStatsSnapshot_pkey" PRIMARY KEY ("key")
);
