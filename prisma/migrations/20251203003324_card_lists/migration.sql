-- CreateTable
CREATE TABLE "public"."CardList" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "userId" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CardListCard" (
    "id" SERIAL NOT NULL,
    "listId" TEXT NOT NULL,
    "cardId" INTEGER NOT NULL,
    "setId" INTEGER,
    "variantId" INTEGER,
    "finish" "public"."Finish" NOT NULL DEFAULT 'Standard',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardListCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardList_userId_idx" ON "public"."CardList"("userId");

-- CreateIndex
CREATE INDEX "CardList_isPublic_createdAt_idx" ON "public"."CardList"("isPublic", "createdAt");

-- CreateIndex
CREATE INDEX "CardListCard_listId_idx" ON "public"."CardListCard"("listId");

-- CreateIndex
CREATE INDEX "CardListCard_cardId_idx" ON "public"."CardListCard"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "CardListCard_listId_cardId_variantId_finish_key" ON "public"."CardListCard"("listId", "cardId", "variantId", "finish");

-- AddForeignKey
ALTER TABLE "public"."CardList" ADD CONSTRAINT "CardList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CardListCard" ADD CONSTRAINT "CardListCard_listId_fkey" FOREIGN KEY ("listId") REFERENCES "public"."CardList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CardListCard" ADD CONSTRAINT "CardListCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CardListCard" ADD CONSTRAINT "CardListCard_setId_fkey" FOREIGN KEY ("setId") REFERENCES "public"."Set"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CardListCard" ADD CONSTRAINT "CardListCard_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."Variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
