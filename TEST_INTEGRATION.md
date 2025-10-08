# Integration Test Setup Guide

This guide explains how to run the full integration test suite (42 tests currently skipped in CI).

## Overview

**Test Categories:**
- **Unit/Contract Tests**: 640 tests - Run in CI automatically ✅
- **Integration Tests**: 38 tests - Require infrastructure setup ⏭️
- **Performance Tests**: 4 tests - Require infrastructure setup ⏭️

## Quick Start (Local Development)

### Prerequisites
- Docker and Docker Compose installed
- Node.js 18+ installed
- PostgreSQL client (optional, for debugging)

### Step 1: Start Test Infrastructure

```bash
# Start postgres and socket server in containers
docker-compose -f docker-compose.test.yml up -d

# Wait for services to be healthy
docker-compose -f docker-compose.test.yml ps
```

### Step 2: Configure Test Environment

```bash
# Copy example env file
cp .env.test.example .env.test

# Edit .env.test with test values:
# DATABASE_URL=postgresql://sorcery_test:test_password@localhost:5433/sorcery_test
# SOCKET_SERVER_URL=http://localhost:3010
# NEXT_PUBLIC_WS_URL=http://localhost:3010
# NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 3: Run Database Migrations

```bash
# Run migrations on test database
DATABASE_URL="postgresql://sorcery_test:test_password@localhost:5433/sorcery_test" \
  npx prisma migrate deploy

# Seed test data (optional)
DATABASE_URL="postgresql://sorcery_test:test_password@localhost:5433/sorcery_test" \
  npx prisma db seed
```

### Step 4: Run Integration Tests

```bash
# Run all integration tests
npm run test:integration

# Or run specific test files
npm test tests/integration/tournament/phase-transition.test.ts
npm test tests/performance/broadcast-latency.test.ts
```

## Test Scripts (Add to package.json)

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run --exclude '**/integration/**' --exclude '**/performance/**'",
    "test:integration": "vitest run tests/integration tests/performance",
    "test:integration:watch": "vitest tests/integration tests/performance",
    "test:ci": "npm run test:unit",
    "docker:test:up": "docker-compose -f docker-compose.test.yml up -d",
    "docker:test:down": "docker-compose -f docker-compose.test.yml down -v",
    "docker:test:logs": "docker-compose -f docker-compose.test.yml logs -f"
  }
}
```

## CI Setup (GitHub Actions Example)

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run test:ci  # Only unit tests

  integration-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: docker-compose -f docker-compose.test.yml up -d
      - run: npm ci
      - run: npm run test:integration
      - run: docker-compose -f docker-compose.test.yml down -v
```

## Re-enabling Integration Tests

To run integration tests instead of skipping them:

### Option 1: Environment Variable

```bash
# Set env var to enable integration tests
export RUN_INTEGRATION_TESTS=true
npm test
```

### Option 2: Remove `.skip`

Edit test files and change:
```typescript
describe.skip('Integration: Phase Transition', () => {
// TO:
describe('Integration: Phase Transition', () => {
```

## Troubleshooting

### Services Not Starting

```bash
# Check service health
docker-compose -f docker-compose.test.yml ps

# View logs
docker-compose -f docker-compose.test.yml logs postgres-test
docker-compose -f docker-compose.test.yml logs socket-server-test

# Restart services
docker-compose -f docker-compose.test.yml restart
```

### Database Connection Issues

```bash
# Test postgres connection
psql postgresql://sorcery_test:test_password@localhost:5433/sorcery_test -c "SELECT 1"

# Reset database
docker-compose -f docker-compose.test.yml down -v
docker-compose -f docker-compose.test.yml up -d
```

### Socket Server Not Responding

```bash
# Check socket server is running
curl http://localhost:3010/health

# View server logs
docker-compose -f docker-compose.test.yml logs -f socket-server-test

# Restart socket server
docker-compose -f docker-compose.test.yml restart socket-server-test
```

## Test Data Management

### Reset Test Database

```bash
# Drop and recreate database
docker-compose -f docker-compose.test.yml down -v
docker-compose -f docker-compose.test.yml up -d

# Wait for postgres to be ready
sleep 5

# Run migrations
DATABASE_URL="postgresql://sorcery_test:test_password@localhost:5433/sorcery_test" \
  npx prisma migrate deploy
```

### Cleanup After Tests

```bash
# Stop all services
docker-compose -f docker-compose.test.yml down

# Stop and remove volumes (full cleanup)
docker-compose -f docker-compose.test.yml down -v
```

## Test Coverage Goals

| Category | Current | Target |
|----------|---------|--------|
| Unit Tests | 640 passing | Maintain 100% |
| Contract Tests | 26 passing | Maintain 100% |
| Integration Tests | 38 skipped | 38 passing (manual) |
| Performance Tests | 4 skipped | 4 passing (manual) |
| **Total** | **640/682** | **682/682** |

## Contributing

When adding new integration tests:

1. **Default to `.skip`** - Don't break CI for contributors without docker
2. **Document requirements** - Add comments about what infrastructure is needed
3. **Add to this guide** - Update this document with new test requirements
4. **Test locally first** - Run with docker-compose before committing

## Architecture Decisions

### Why Skip Integration Tests in CI?

**Pros of Skipping:**
- ✅ Fast CI (unit tests run in ~10s)
- ✅ No infrastructure dependencies
- ✅ Contributors can run tests without docker
- ✅ Cheaper CI (no database spinning up)

**Cons of Skipping:**
- ❌ Integration bugs not caught in CI
- ❌ Manual testing required before deploy
- ❌ Two-tier testing strategy

### When to Run Integration Tests?

**Automatically:**
- On main branch only (post-merge)
- Nightly builds
- Before releases

**Manually:**
- During feature development
- Before submitting PR
- Debugging production issues

## Related Documentation

- [CLAUDE.md](./CLAUDE.md) - Project context and architecture
- [specs/009-audit-transport-and/](./specs/009-audit-transport-and/) - Audit specification
- [tests/contract/](./tests/contract/) - Contract test examples
