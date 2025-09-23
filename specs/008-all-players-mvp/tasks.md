# Tasks: All Players MVP for Online Lobby

**Input**: Design documents from `/specs/008-all-players-mvp/`
**Prerequisites**: plan.md (required), research.md, data-model.md, contracts/

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → Extract: tech stack, libraries, structure
2. Load optional design documents:
   → data-model.md: Extract entities → model tasks
   → contracts/: Each file → contract test task
   → research.md: Extract decisions → setup tasks
3. Generate tasks by category:
   → Setup: env, DB migration stubs
   → Tests: contract tests, integration tests
   → Core: models, services, endpoints, UI
   → Integration: wiring, CORS, env
   → Polish: unit tests, performance, docs
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file = sequential (no [P])
   → Tests before implementation (TDD)
5. Number tasks sequentially (T001, T002...)
6. Create parallel execution examples
7. Validate task completeness and dependencies
8. Return: SUCCESS (tasks ready for execution)
```

## Phase 3.1: Setup
- [x] T001 Prisma schema: add Friendship model, User.shortId (unique), User.presenceHidden (default false)
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/prisma/schema.prisma`
  - Friendship fields: id (cuid, id), ownerUserId (String), targetUserId (String), createdAt (now)
  - Unique: @@unique([ownerUserId, targetUserId])
- [x] T002 [P] Run Prisma generate and create a dev migration
  - Commands: `npm run prisma:generate` then `npm run prisma:migrate`
- [x] T003 [P] Backfill shortId for existing users (script)
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/scripts/backfill-short-userids.js`
  - Logic: for users missing shortId, set an 8-char base36 ID; ensure uniqueness
- [x] T004 Update example.env and README with server HTTP origin for API fetches
  - Files: `/Users/geleeroyale/CascadeProjects/sorcery-client/example.env`, `/Users/geleeroyale/CascadeProjects/sorcery-client/README.md`
  - Add: `NEXT_PUBLIC_WS_HTTP_ORIGIN` (e.g., http://localhost:3001)

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
- [x] T005 [P] Flesh contract test for GET available players
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/specs/008-all-players-mvp/contracts/tests/players.api.test.ts`
  - Assert: 200 OK; items with {userId, shortUserId, displayName, presence.online=false|true, presence.inMatch=false|true}; hidden users excluded; limit ≤100; cursor present when more
- [x] T006 [P] Flesh contract test for POST add friend
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/specs/008-all-players-mvp/contracts/tests/friends.api.test.ts`
  - Assert: 201 created on new; 200/409 on duplicate; 401 unauthorized
- [x] T007 [P] Flesh contract test for POST invite to play
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/specs/008-all-players-mvp/contracts/tests/invites.api.test.ts`
  - Assert: 202 accepted when target available; 409 when target unavailable; 401 unauthorized
- [ ] T008 [P] Integration test: recent opponents prioritized (frequency→recency)
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/tests/integration/online-all-players-priority.test.ts`
  - Simulate list data; verify comparator and ordering
- [ ] T009 [P] Integration test: sorting toggle “Recent first” vs “Alphabetical”
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/tests/integration/online-all-players-sorting.test.ts`
- [ ] T010 [P] Integration test: search by display name (case-insensitive)
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/tests/integration/online-all-players-search.test.ts`
- [ ] T011 [P] Integration test: presence hiding excludes hidden users
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/tests/integration/online-all-players-privacy.test.ts`
- [ ] T012 [P] Integration test: initial 100 + progressive loading
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/tests/integration/online-all-players-pagination.test.ts`

## Phase 3.3: Core Implementation (ONLY after tests are failing)
- [ ] T013 Prisma: implement Friendship, shortId, presenceHidden in schema
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/prisma/schema.prisma`
- [ ] T014 [P] Script: implement shortId backfill
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/scripts/backfill-short-userids.js`
- [x] T015 Server (HTTP): implement GET `/players/available`
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/server/index.js`
  - Criteria: online=true, inMatch=false, presenceVisible=true; supports `sort=recent|alphabetical`, `q`, `limit<=100`, `cursor`
  - Sorting: recent group from last 10 matches (frequency desc, then most recent), else alphabetical by displayName
  - Response: `{ items: PlayerListItem[], nextCursor: string|null }` with shortUserId, avatarUrl, isFriend
- [x] T016 Server (HTTP): enable CORS on HTTP endpoints using `SOCKET_CORS_ORIGIN`
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/server/index.js`
  - Headers: `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials`, handle OPTIONS
- [x] T017 Next.js API: POST `/api/friends` to add friend (manual only)
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/src/app/api/friends/route.ts`
  - Behavior: requires auth; upsert Friendship; return 201 new, 200 already friend
- [x] T018 Next.js API: POST `/api/invites` (shim)
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/src/app/api/invites/route.ts`
  - Behavior: requires auth; forwards invite to Socket server/lobby control; return 202 or 409
- [x] T019 Online context: fetch available players from server and support infinite scroll
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/src/app/online/online-context.tsx`
  - Add: `requestPlayers({ q, sort, cursor })`, store `players`, merge deduping, handle loading state
- [x] T020 PlayersInvitePanel: show Avatar, Display Name, shortUserId, Friend button
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/src/components/online/PlayersInvitePanel.tsx`
  - Add: search input, sort toggle (Recent/Alphabetical), empty state, “Load more” on scroll
  - Hook: call `POST /api/friends` on Add Friend; disable if already friend
- [x] T021 Lobby page: wire sorting/search and progressive loading
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/src/app/online/lobby/page.tsx`
  - On Friends tab select: call `requestPlayers()`; pass props to `PlayersInvitePanel`
- [x] T022 Discoverability control: first‑run prompt with default Visible; toggle presenceHidden
  - Files:
    - UI: `/Users/geleeroyale/CascadeProjects/sorcery-client/src/app/online/lobby/page.tsx` (prompt)
    - API: `/Users/geleeroyale/CascadeProjects/sorcery-client/src/app/api/users/me/presence/route.ts` (PATCH)
    - Server: ensure presenceHidden respected in `/players/available`
- [x] T023 Recent opponents computation on server
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/server/index.js`
  - Derive last 10 matches per requesting user from Prisma `MatchResult`; build frequency + lastPlayedAt map

## Phase 3.4: Integration
- [ ] T024 Env/plumbing: expose `NEXT_PUBLIC_WS_HTTP_ORIGIN`; derive fallback from `NEXT_PUBLIC_WS_URL` (ws→http)
  - Files: `/Users/geleeroyale/CascadeProjects/sorcery-client/src/app/online/online-context.tsx`, `.env*`
- [ ] T025 Error handling and user feedback for invite/add-friend edge cases
  - Files: `online-context.tsx`, `PlayersInvitePanel.tsx`
- [ ] T026 Logging: server info logs for `/players/available` queries (q, sort, limit) and invite/friend actions
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/server/index.js`

## Phase 3.5: Polish
- [ ] T027 [P] Unit tests for sort comparator (frequency→recency→alpha)
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/tests/unit/online-all-players-sort.test.ts`
- [ ] T028 [P] Unit tests for shortUserId formatting and display
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/tests/unit/online-all-players-id.test.ts`
- [ ] T029 [P] Update quickstart.md with validation steps
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/specs/008-all-players-mvp/quickstart.md`
- [ ] T030 [P] Update README with feature overview and env var
  - File: `/Users/geleeroyale/CascadeProjects/sorcery-client/README.md`

## Dependencies
- **Tests first**: T005–T012 must be written and failing before T013–T026
- **DB first**: T013 blocks T017 and T022
- **Server endpoints**: T015 & T016 block T019–T021
- **Discoverability**: T022 (API) links to T015 eligibility
- **UI wiring**: T019 blocks T021, and T020 depends on T017
- **Polish after core**: T027–T030 after core impl

## Parallel Execution Examples
```
# Kick off all contract & integration tests in parallel
Task: "T005 players.api contract test" [P]
Task: "T006 friends.api contract test" [P]
Task: "T007 invites.api contract test" [P]
Task: "T008 priority integration" [P]
Task: "T009 sorting integration" [P]
Task: "T010 search integration" [P]
Task: "T011 privacy integration" [P]
Task: "T012 pagination integration" [P]

# After DB migration
Task: "T014 backfill short IDs" [P]
Task: "T016 server CORS" [P]
```

## Validation Checklist
- [ ] All contracts have corresponding tests (T005–T007)
- [ ] All entities have model tasks (User, Friendship, presence flags)
- [ ] All tests come before implementation
- [ ] Parallel tasks only touch independent files
- [ ] Each task specifies exact file path
- [ ] No [P] tasks modify the same file
