# Research: TypeScript Build Error Fixes and Type Safety

## Error Analysis

### Current Error Categories
1. **Explicit `any` types**: 32 violations across test files and source code
2. **Unused variables/imports**: 40+ warnings in various components
3. **React Hook dependency issues**: Missing dependencies in useEffect arrays
4. **Variable declaration issues**: `let` vs `const` violations
5. **TypeScript ignore comments**: Should be `@ts-expect-error` instead of `@ts-ignore`

### Files Requiring Attention
- `/src/app/decks/editor-3d/page.tsx` - Multiple unused variables
- `/src/app/draft-3d/page.tsx` - Unused imports and explicit `any` 
- `/src/app/online/lobby/page.tsx` - Explicit `any` and unused variables
- Test files in `/tests/` - Extensive `any` usage and unused variables
- Contract files in `/specs/001-fix-card-preview/contracts/` - `any` types

## TypeScript Best Practices Research

### Decision: Strict Type Definitions over `any`
- **Rationale**: TypeScript's value comes from compile-time type safety
- **Implementation**: Create proper interfaces for complex objects
- **Pattern**: Use union types, generics, and conditional types instead of `any`

### Decision: Proper Variable Declarations
- **Rationale**: `const` prevents accidental reassignment and improves readability
- **Implementation**: Use `const` for values that don't change, `let` for variables that do
- **Pattern**: Default to `const`, only use `let` when reassignment is needed

### Decision: Complete Hook Dependencies
- **Rationale**: React Hook dependencies ensure proper reactivity and prevent stale closures
- **Implementation**: Include all referenced variables in dependency arrays
- **Pattern**: Use ESLint react-hooks/exhaustive-deps rule for enforcement

## ESLint Configuration Analysis

### Current Configuration
- Uses ESLint 9.x with Next.js config
- TypeScript-specific rules enabled
- React hooks rules active

### Fixes Strategy
- Remove unused imports/variables where truly unused
- Add proper usage where variables are needed but not used
- Replace `@ts-ignore` with `@ts-expect-error` for intentional suppressions

## Testing Strategy

### Red-Green-Refactor Approach
1. **RED**: Verify current build failures (122 errors documented)
2. **GREEN**: Fix errors systematically, verifying build passes after each group
3. **REFACTOR**: Clean up any remaining code quality issues

### Validation Process
1. Run `npm run build` to verify no TypeScript errors
2. Run `npm run lint` to verify no ESLint violations  
3. Run `npm run test` to ensure functionality unchanged
4. Manual testing of key features (3D editor, draft interface)

## Implementation Order

### Phase 1: Critical Build Blockers
- Fix explicit `any` types that prevent compilation
- Resolve missing TypeScript declarations

### Phase 2: Code Quality Issues
- Remove unused variables and imports
- Fix `let` vs `const` declarations
- Update `@ts-ignore` to `@ts-expect-error`

### Phase 3: React-Specific Issues
- Fix React Hook dependency arrays
- Ensure proper component prop typing

### Phase 4: Test File Cleanup
- Fix test file type issues
- Remove unused test variables
- Proper mock typing

## Risk Mitigation

### Functionality Preservation
- No changes to business logic
- Only type annotations and unused code removal
- Thorough testing after each change group

### Build Pipeline Safety
- Incremental fixes with build validation
- Rollback strategy if build breaks
- Separate commits for different error categories

## Tools and Utilities

### TypeScript Utilities
- Use `Partial<T>` for optional properties
- Use `Record<K, V>` for object maps
- Use conditional types for complex scenarios

### ESLint Integration
- Leverage `--fix` for automatic fixes where safe
- Manual review of all auto-generated changes
- Custom rules for project-specific patterns

## Success Criteria

### Quantitative Measures
- Build completes without TypeScript errors (0 errors)
- ESLint passes without violations blocking build
- Test suite continues to pass (no regressions)

### Qualitative Measures
- Improved developer experience with better type safety
- Cleaner codebase with no unused code
- Better IDE support with proper type inference