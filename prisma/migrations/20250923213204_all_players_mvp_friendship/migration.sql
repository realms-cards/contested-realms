/*
  Warnings:

  - A unique constraint covering the columns `[shortId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "presenceHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shortId" TEXT;

-- CreateTable
CREATE TABLE "public"."Friendship" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Friendship_ownerUserId_idx" ON "public"."Friendship"("ownerUserId");

-- CreateIndex
CREATE INDEX "Friendship_targetUserId_idx" ON "public"."Friendship"("targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_ownerUserId_targetUserId_key" ON "public"."Friendship"("ownerUserId", "targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_shortId_key" ON "public"."User"("shortId");

-- AddForeignKey
ALTER TABLE "public"."Friendship" ADD CONSTRAINT "Friendship_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Friendship" ADD CONSTRAINT "Friendship_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
