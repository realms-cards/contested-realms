# Sorcery Client - Development Context

See `AGENTS.md` for architecture overview, conventions, commands, and common tasks.

## Constitutional Requirements

**NEVER use `any` types - this is constitutionally forbidden:**

- Using `any` type annotations: `function foo(data: any)` - NO
- Casting to `any`: `value as any` - NO
- Always use proper interfaces, generics, or `unknown` with type guards

**Follow strict TypeScript and ESLint rules:**

- All TypeScript strict mode options must remain enabled
- Import order must follow ESLint rules (builtin -> external -> internal -> relative)
- Use `const` for immutable values, object shorthand syntax
- Build must pass with 0 TypeScript errors, 0 ESLint errors

**Type Error Recovery Pattern:**

1. Investigate: Understand the root type mismatch
2. Define: Create proper interfaces/types
3. Transform: Use mapping functions, not `any` casts
4. Validate: Ensure type safety is maintained

**Development Guidelines:**

- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary for achieving your goal
- ALWAYS prefer editing an existing file to creating a new one, except if the old file becomes too huge to be handled by AI context in which case we want to properly refactor the large file
- NEVER proactively create documentation files unless explicitly requested
- ALWAYS look up existing variables, types, and interfaces before creating new ones. When dealing with the database, always reference the schema at `prisma/schema.prisma` to ensure correct model names, field types, and relations

### Server Patch & Custom Message Rules

When building `trySendPatch()` calls or custom message handlers for avatar abilities, follow these rules to avoid server rejection, data loss, and race conditions. See `.windsurf/workflows/custom-resolver.md` § "Server Patch Safety Rules" for detailed examples.

1. **Only send actor's own avatar** — never spread both avatars (`{ ...state.avatars, [who]: ... }`). The server rejects patches containing `tapped` on the opponent's avatar key.
2. **Only send affected permanents cells** — use `{ [cellKey]: arr }`, never `{ ...state.permanents, ... }`. Sending the full map overwrites concurrent changes on other tiles.
3. **Use `__remove: true` to delete permanents** — the merge function preserves base items not in the patch. Include `{ ...perm, __remove: true }` to actually remove a permanent.
4. **Send only delta `board.sites`** — use `board: { sites: { [cellKey]: siteData } }`, not `board: { ...board, sites: ... }`.
5. **Never depend on `pending` state in resolve handlers** — server patch and custom message can arrive in either order. Always include `ownerSeat` in resolve messages.

## Architectural Decisions

### WebGL Context Management

Each screen/page has its own `<Canvas>` - no shared global canvas. We tried drei's `View.Port` for a single shared canvas but it's designed for simultaneous multi-view rendering (split-screen), not page-to-page navigation. Next.js + R3F handle WebGL context cleanup automatically on unmount, so we never hit the browser's 8-16 context limit in practice.

### Bot AI (Phase 1 Complete)

CPU bot engine at `bots/engine/` with rule enforcement (mana cost, thresholds, placement), strategic evaluation (board development, mana efficiency, threat deployment, life pressure), and phase-based strategy. See `bots/engine/README.md` for full details.

**Known bot limitations** (deferred to Phase 2): regions, instants, triggered/activated abilities, full keyword evaluation, stack mechanics, graveyard interactions, deck construction.

**Training/QA tools:**

```bash
node scripts/training/selfplay.js --smoke-test --rounds 10  # Smoke test
node scripts/training/analyze-logs.js --detect-regressions <logs>  # Regression detection
node scripts/training/champion-gating.js <logs>  # Champion quality gating
node tests/bot/bot-rules-validation.js  # Rules compliance
```

### Server Modules

The Socket.IO server (`server/index.ts`, ~6k lines) has extracted modules:

- `server/modules/tournament/broadcast.js` - Room-scoped event emission with deduplication
- `server/modules/draft/config.js` - Draft config hydration from DraftSession
- `server/modules/tournament/standings.js` - Atomic standings updates with transactions

### Tournament System

Swiss pairing for Sealed, Draft, and Constructed formats. API routes under `/api/tournaments/[id]/`. Pairing algorithm at `src/lib/tournament/pairing.ts`. Real-time updates via Socket.IO room broadcasts.

### Tutorial System

8 lessons in `src/lib/tutorial/lessons/`. Engine at `src/lib/tutorial/TutorialEngine.ts`. Step types: narration, highlight, forced_action, scripted_action, checkpoint. State patches applied when leaving a step. Progress stored in localStorage.
