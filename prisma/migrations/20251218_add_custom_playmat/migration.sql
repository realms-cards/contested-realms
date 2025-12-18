-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomPlaymat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomPlaymat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomPlaymat_userId_idx" ON "CustomPlaymat"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomPlaymat_createdAt_idx" ON "CustomPlaymat"("createdAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CustomPlaymat_userId_fkey'
    ) THEN
        ALTER TABLE "CustomPlaymat"
        ADD CONSTRAINT "CustomPlaymat_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
