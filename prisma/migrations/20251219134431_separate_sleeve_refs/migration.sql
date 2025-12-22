-- Separate sleeve refs: split cardback selection into spellbook + atlas refs.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "selectedSpellbookRef" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "selectedAtlasRef" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'User'
      AND column_name = 'selectedCardbackRef'
  ) THEN
    EXECUTE 'UPDATE "User"
      SET "selectedSpellbookRef" = COALESCE("selectedSpellbookRef", "selectedCardbackRef"),
          "selectedAtlasRef" = COALESCE("selectedAtlasRef", "selectedCardbackRef")
      WHERE "selectedCardbackRef" IS NOT NULL';
    EXECUTE 'ALTER TABLE "User" DROP COLUMN IF EXISTS "selectedCardbackRef"';
  END IF;
END $$;
