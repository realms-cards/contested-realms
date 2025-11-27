-- CreateTable
CREATE TABLE "public"."CollectionCard" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" INTEGER NOT NULL,
    "setId" INTEGER,
    "variantId" INTEGER,
    "finish" "public"."Finish" NOT NULL DEFAULT 'Standard',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollectionCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CollectionCard_userId_idx" ON "public"."CollectionCard"("userId");

-- CreateIndex
CREATE INDEX "CollectionCard_cardId_idx" ON "public"."CollectionCard"("cardId");

-- CreateIndex
CREATE INDEX "CollectionCard_userId_setId_idx" ON "public"."CollectionCard"("userId", "setId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionCard_userId_cardId_variantId_finish_key" ON "public"."CollectionCard"("userId", "cardId", "variantId", "finish");

-- AddForeignKey
ALTER TABLE "public"."CollectionCard" ADD CONSTRAINT "CollectionCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CollectionCard" ADD CONSTRAINT "CollectionCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CollectionCard" ADD CONSTRAINT "CollectionCard_setId_fkey" FOREIGN KEY ("setId") REFERENCES "public"."Set"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CollectionCard" ADD CONSTRAINT "CollectionCard_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."Variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
