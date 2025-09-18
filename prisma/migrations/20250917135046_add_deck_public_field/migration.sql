-- AlterTable
ALTER TABLE "public"."Deck" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Deck_isPublic_createdAt_idx" ON "public"."Deck"("isPublic", "createdAt");
