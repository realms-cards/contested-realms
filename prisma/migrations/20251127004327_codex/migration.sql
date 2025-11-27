-- CreateTable
CREATE TABLE "public"."CodexEntry" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "cardRefs" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodexEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CodexEntry_title_key" ON "public"."CodexEntry"("title");

-- CreateIndex
CREATE INDEX "CodexEntry_title_idx" ON "public"."CodexEntry"("title");
