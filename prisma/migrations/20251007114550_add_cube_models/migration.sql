-- CreateTable
CREATE TABLE "public"."Cube" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Cube_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CubeCard" (
    "id" SERIAL NOT NULL,
    "cubeId" TEXT NOT NULL,
    "cardId" INTEGER NOT NULL,
    "setId" INTEGER,
    "variantId" INTEGER,
    "count" INTEGER NOT NULL,

    CONSTRAINT "CubeCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cube_userId_idx" ON "public"."Cube"("userId");

-- CreateIndex
CREATE INDEX "Cube_isPublic_createdAt_idx" ON "public"."Cube"("isPublic", "createdAt");

-- CreateIndex
CREATE INDEX "CubeCard_cubeId_idx" ON "public"."CubeCard"("cubeId");

-- CreateIndex
CREATE INDEX "CubeCard_cardId_idx" ON "public"."CubeCard"("cardId");

-- AddForeignKey
ALTER TABLE "public"."Cube" ADD CONSTRAINT "Cube_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CubeCard" ADD CONSTRAINT "CubeCard_cubeId_fkey" FOREIGN KEY ("cubeId") REFERENCES "public"."Cube"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CubeCard" ADD CONSTRAINT "CubeCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "public"."Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CubeCard" ADD CONSTRAINT "CubeCard_setId_fkey" FOREIGN KEY ("setId") REFERENCES "public"."Set"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CubeCard" ADD CONSTRAINT "CubeCard_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."Variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
