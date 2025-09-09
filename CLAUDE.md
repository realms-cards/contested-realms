# Sorcery Client - Development Context

## Current Focus: TypeScript Build Error Fixes (Branch: 002-we-have-a)

The application has 122 TypeScript compilation errors and ESLint violations that prevent clean builds. This includes explicit `any` types, unused variables, React Hook dependency issues, and improper variable declarations across ~15-20 source files.

**Goal**: Achieve zero build errors while maintaining all existing functionality and improving type safety.

## Technical Context
**Language/Version**: TypeScript 5.x, React 19.1.0, Next.js 15.5.0  
**Primary Dependencies**: ESLint 9.x, React Three Fiber 9.3.0, Three.js 0.179.1, Vitest 2.0.5  
**Testing**: Vitest for unit/integration tests, React Testing Library for components  
**Storage**: Prisma ORM with database, local files for assets  
**Project Type**: Next.js web application with integrated API routes and 3D components

## Commands
```bash
npm run dev        # Start development server
npm run build      # Build for production (currently failing)
npm run test       # Run tests
npm run lint       # Run linter (shows 122 errors)
```

## Recent Changes
- 002-we-have-a: TypeScript build error fixes - eliminate `any` types, fix unused variables, React Hook deps
- 001-fix-card-preview: Fixed card preview hover issues by enabling raycasting in DraggableCard3D
- Previous: Hand component differences between draft-3d and editor-3d causing preview issues

**Last updated**: 2025-09-09