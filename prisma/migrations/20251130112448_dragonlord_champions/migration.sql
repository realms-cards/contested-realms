-- AlterTable
ALTER TABLE "public"."Deck" ADD COLUMN     "championCardId" INTEGER;

-- AddForeignKey
ALTER TABLE "public"."Deck" ADD CONSTRAINT "Deck_championCardId_fkey" FOREIGN KEY ("championCardId") REFERENCES "public"."Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;
