-- CreateTable
CREATE TABLE "public"."HumanCardStats" (
    "id" TEXT NOT NULL,
    "cardId" INTEGER NOT NULL,
    "format" "public"."GameFormat" NOT NULL,
    "plays" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HumanCardStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HumanCardStats_cardId_idx" ON "public"."HumanCardStats"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "HumanCardStats_cardId_format_key" ON "public"."HumanCardStats"("cardId", "format");
