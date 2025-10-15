#!/bin/bash

# Script to fix failed migration on production
# This marks the failed migration as rolled back so it can be retried

set -e

echo "⚠️  This script will mark the failed migration as rolled back"
echo "⚠️  Make sure you have a backup before proceeding!"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    exit 1
fi

echo "📋 Checking migration status..."
npx prisma migrate status

echo ""
echo "🔧 Marking failed migration as rolled back..."
# This SQL marks the migration as rolled back in the _prisma_migrations table
PGPASSWORD="${DATABASE_PASSWORD}" psql -h "${DATABASE_HOST}" -p "${DATABASE_PORT}" -U "${DATABASE_USER}" -d "${DATABASE_NAME}" << EOF
UPDATE _prisma_migrations
SET rolled_back_at = NOW(),
    finished_at = NULL,
    logs = 'Manually marked as rolled back to retry'
WHERE migration_name = '20251014230734_add_card_evaluation_table'
  AND rolled_back_at IS NULL;
EOF

echo "✅ Migration marked as rolled back"
echo ""
echo "🔄 Now running migrate deploy to retry..."
npx prisma migrate deploy

echo ""
echo "✅ Done! Check migration status:"
npx prisma migrate status
