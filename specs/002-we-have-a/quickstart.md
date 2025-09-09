# Quick Start: Fix TypeScript Build Errors

## Prerequisites
- Node.js 18+ installed
- npm dependencies installed (`npm install`)
- Project cloned and on branch `002-we-have-a`

## Verification Steps

### 1. Confirm Current Build State
```bash
# Should show 122 lint/type errors
npm run build
```

**Expected Result**: Build fails with TypeScript compilation errors and ESLint violations

### 2. Run Error Analysis
```bash
# Get detailed error breakdown
npm run lint > lint-errors.log 2>&1
wc -l lint-errors.log  # Should show ~122 error lines
```

**Expected Result**: Log file containing all current errors with file locations

### 3. Category Verification
```bash
# Check for explicit any types
grep -n "Unexpected any" lint-errors.log | wc -l
# Should show ~32 instances

# Check for unused variables  
grep -n "is assigned a value but never used" lint-errors.log | wc -l
# Should show ~40+ instances

# Check for missing dependencies
grep -n "missing dependency" lint-errors.log | wc -l
# Should show a few instances
```

**Expected Result**: Error counts match analysis in research.md

## Fix Validation Process

### 1. Run Tests Before Changes
```bash
# Ensure baseline functionality
npm run test
```

**Expected Result**: Tests should pass (existing functionality works)

### 2. Apply Fixes Incrementally
```bash
# Fix a batch of errors (to be implemented in tasks)
# Then validate immediately:
npm run build

# Should show fewer errors after each batch
```

**Expected Result**: Error count decreases after each fix batch

### 3. Final Validation
```bash
# All builds should pass
npm run build
echo "Build exit code: $?"  # Should be 0

# All linting should pass
npm run lint  
echo "Lint exit code: $?"   # Should be 0

# All tests should continue passing
npm run test
echo "Test exit code: $?"   # Should be 0
```

**Expected Result**: All commands exit with code 0 (success)

## Manual Testing Checklist

### 3D Editor Functionality
1. Navigate to `/decks/editor-3d`
2. Verify 3D scene loads correctly
3. Test card dragging and dropping
4. Verify hover previews work (this was the previous feature)

### Draft Interface  
1. Navigate to `/draft-3d`
2. Verify draft interface loads
3. Test card selection and hover functionality
4. Ensure no runtime TypeScript errors in browser console

### General Application
1. Test login/authentication flow
2. Navigate between major sections
3. Check browser console for TypeScript errors
4. Verify responsive design still works

## Rollback Procedure

If any step fails:

### 1. Identify Failing Change
```bash
git log --oneline -10
# Find the commit that broke functionality
```

### 2. Rollback Bad Changes
```bash
git revert <commit-hash>
# Or for multiple commits:
git reset --hard <good-commit-hash>
```

### 3. Re-validate
```bash
npm run build && npm run test
# Ensure rollback restored functionality
```

## Success Metrics

### Quantitative Targets
- TypeScript errors: 122 → 0
- ESLint violations: 122 → 0  
- Build time: Should not significantly increase
- Test coverage: Should remain the same

### Qualitative Targets
- All existing functionality preserved
- No new runtime errors introduced
- Better IDE type inference and autocompletion
- Cleaner codebase with no unused code

## Troubleshooting

### Build Still Failing
- Check if new errors were introduced
- Verify all dependencies are correct versions
- Look for circular import issues after refactoring

### Tests Failing
- Ensure test type definitions are correct
- Check if test utilities need type updates
- Verify mock objects have proper typing

### Runtime Errors
- Check browser console for new TypeScript errors
- Verify proper null checking was maintained
- Look for overly strict typing breaking dynamic code

## Next Steps After Completion
1. Update CLAUDE.md with any new patterns discovered
2. Consider adding stricter TypeScript config for future prevention
3. Document any complex type solutions for team knowledge
4. Set up pre-commit hooks to prevent regression