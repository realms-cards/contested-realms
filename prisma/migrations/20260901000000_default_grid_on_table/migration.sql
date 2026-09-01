-- New accounts default to grid-on-table (playmat hidden) — it reads nicer than
-- the playmat art. Only column defaults change; existing users keep whatever
-- value their row already holds.
ALTER TABLE "User" ALTER COLUMN "showPlaymat" SET DEFAULT false;
ALTER TABLE "User" ALTER COLUMN "showGrid" SET DEFAULT true;
