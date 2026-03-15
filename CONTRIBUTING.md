# Contributing to Sorcery Client

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

1. **Fork the repository** and clone your fork
2. **Set up your dev environment** following the [README](README.md#quick-start)
3. **Create a branch** for your work: `git checkout -b feat/your-feature` or `fix/your-bug`

## Development Workflow

### Before You Start

- Check [Issues](../../issues) for existing reports or discussions
- For larger features, open an issue first to discuss the approach
- Look at the [changelog](public/changelog.md) to understand recent changes

### Code Standards

This project uses strict TypeScript with ESLint enforcement:

- **No `any` types** - Use proper interfaces, generics, or `unknown` with type guards
- **Strict mode enabled** - All TypeScript strict options are on
- **ESLint rules enforced** - `prefer-const`, `object-shorthand`, `import/order`
- **Import order** - External libs first, then `@/` sorted alphabetically

```bash
# Check your code
npm run lint           # ESLint
npm run build          # TypeScript compilation + Next.js build
npm run test           # Run tests
```

All three must pass before submitting a PR.

### Commit Messages

Write clear, descriptive commit messages:

```
feat: add card search filtering by element type
fix: prevent duplicate toast messages in hotseat mode
refactor: extract pairing logic into dedicated module
```

Use conventional prefixes: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.

### Pull Requests

1. **Keep PRs focused** - One feature or fix per PR
2. **Write a clear description** - What changed and why
3. **Include screenshots** for UI changes
4. **Add tests** for new functionality where applicable
5. **Update the changelog** at `public/changelog.md` if your change is user-facing

## Project Architecture

### Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/app/` | Next.js App Router pages and API routes |
| `src/components/game/` | Game board, cards, overlays, HUD |
| `src/components/ui/` | Shared UI components |
| `src/lib/game/store/` | Zustand game state store |
| `src/lib/tutorial/` | Tutorial engine and lessons |
| `server/` | Standalone Socket.IO game server |
| `server/modules/` | Server modules (tournament, draft, standings) |
| `server/rules/` | Game rule validation and enforcement |
| `bots/engine/` | CPU bot AI engine |
| `prisma/` | Database schema and migrations |

### State Management

- **Game state**: Zustand store at `src/lib/game/store/`
- **Server authority**: Socket.IO server is authoritative for online matches
- **Optimistic updates**: Client applies changes immediately, server confirms/rejects

### 3D Rendering

- Built with React Three Fiber + drei
- Each screen has its own Canvas (no shared global context)
- Card textures use KTX2 compression with automatic caching

## Common Tasks

### Adding a Custom Card Resolver

Custom resolvers handle cards with unique abilities that the generic engine can't process automatically.

1. Add your resolver in the appropriate server-side handler
2. Cards with custom resolvers display a purple glow indicator
3. Test with both online and hotseat modes

### Adding a Tutorial Lesson

1. Create `src/lib/tutorial/lessons/lesson-XX-topic.ts`
2. Follow the existing lesson structure (see `lesson-01-welcome.ts` for reference)
3. Register it in `src/lib/tutorial/lessons/index.ts`
4. Step types: `narration`, `highlight`, `forced_action`, `scripted_action`, `checkpoint`

### Database Changes

1. Modify `prisma/schema.prisma`
2. Run `npm run prisma:migrate:dev -- --name describe_your_change`
3. Run `npm run prisma:generate`
4. Test migration applies cleanly on a fresh database

## Testing

```bash
npm run test              # All tests
npm run test:watch        # Watch mode
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests (requires DB)
npm run test:coverage     # Coverage report
```

Tests use Vitest and React Testing Library. Place test files adjacent to source files with `.test.ts(x)` extension.

## Environment Variables

See [.env.example](.env.example) for all available configuration options. The file is organized by section with documentation for each variable.

Key sections for contributors:
- **Feature Flags** - Toggle features on/off during development
- **Rules Engine** - Configure game rule enforcement
- **Debug** - Enable debugging aids

## Need Help?

- Open an issue for bugs or feature requests
- Check existing issues and PRs for context on ongoing work
- Read the in-game manual (`public/manual.md`) to understand game mechanics

Thank you for contributing!
