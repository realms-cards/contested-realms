/*
  Warnings:

  - You are about to drop the column `selectedCardbackRef` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "selectedCardbackRef",
ADD COLUMN     "selectedAtlasRef" TEXT,
ADD COLUMN     "selectedSpellbookRef" TEXT;
