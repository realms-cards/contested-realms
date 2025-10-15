-- Run this SQL in production to diagnose the failed migration

-- 1. Check migration status
SELECT
  migration_name,
  started_at,
  finished_at,
  applied_steps_count,
  LEFT(logs, 200) as error_preview
FROM _prisma_migrations
WHERE migration_name = '20251014230734_add_card_evaluation_table';

-- 2. Check if enum exists
SELECT typname, typtype
FROM pg_type
WHERE typname = 'InvitationStatus';

-- 3. Check if tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('TournamentInvitation', 'CardEvaluation');

-- 4. Check if Tournament.isPrivate column exists
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'Tournament'
  AND column_name = 'isPrivate';
