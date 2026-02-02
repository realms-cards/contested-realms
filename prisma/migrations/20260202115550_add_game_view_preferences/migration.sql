-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "cameraMode" TEXT NOT NULL DEFAULT 'topdown',
ADD COLUMN     "showGrid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showPlaymat" BOOLEAN NOT NULL DEFAULT true;
