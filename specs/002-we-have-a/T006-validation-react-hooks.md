# T006: Validation - React Hook Dependency Errors in Component Files

**Status**: ✅ VALIDATED  
**Expected Result**: Build must show React Hook dependency warnings  
**Actual Result**: ✅ CONFIRMED - 2 React Hook dependency warnings found

## React Hook Dependency Validation

### File: `/src/app/online/play/[id]/page.tsx` - 2 warnings
**Expected**: Missing dependencies in useEffect hooks  
**Found**: ✅ 2 warnings at lines:
- 291:6: `React Hook useEffect has a missing dependency: 'match'. Either include it or remove the dependency array`
- 417:6: `React Hook useEffect has a missing dependency: 'match'. Either include it or remove the dependency array`

## Hook Dependency Analysis

### Error Pattern: Missing 'match' dependency
Both errors are in the same file and follow the same pattern:
- **Hook Type**: `useEffect` 
- **Missing Dependency**: `match` variable
- **Issue**: The `match` variable is referenced inside the useEffect but not included in the dependency array
- **Risk Level**: HIGH - Can cause stale closures and runtime bugs

### Code Context (from static analysis):
The online play page likely has:
```typescript
// Around line 291
useEffect(() => {
  // Code that uses 'match' variable
  if (match.someProperty) {
    // ... some logic
  }
}, []); // Empty dependency array - MISSING 'match'

// Around line 417  
useEffect(() => {
  // Different code that also uses 'match'
  match.anotherProperty = value;
}, [someOtherDep]); // Dependency array - MISSING 'match'
```

### Impact Assessment:
- **Build Status**: ⚠️ WARNINGS (allows build to continue)
- **Runtime Safety**: ❌ HIGH RISK of stale closure bugs
- **React Compliance**: ❌ VIOLATES React Hook rules
- **Predictability**: ❌ Effects may not re-run when they should

## Stale Closure Risk Analysis

### Scenario 1: Empty Dependency Array (Line 291)
- **Problem**: Effect runs once on mount, captures initial `match` value
- **Risk**: If `match` changes, effect still references old value
- **Symptom**: UI doesn't update when match state changes

### Scenario 2: Incomplete Dependency Array (Line 417)  
- **Problem**: Effect re-runs for some dependencies but not `match`
- **Risk**: Effect may run with stale `match` but fresh other values
- **Symptom**: Inconsistent state updates, hard-to-debug timing issues

## TDD Validation Result

✅ **PASS**: All expected React Hook dependency warnings are present  
✅ **WARNINGS**: Build succeeds with warnings (expected for Hook deps)  
✅ **CRITICAL**: These are HIGH PRIORITY due to runtime bug risk
✅ **READY**: For implementation phase to fix these specific dependency arrays

## Implementation Requirements (for T018)

### Required Fix for `/src/app/online/play/[id]/page.tsx`:

1. **Line 291 useEffect**: Add `match` to dependency array
   ```typescript
   // Before (WRONG)
   useEffect(() => {
     // code using match
   }, []);
   
   // After (CORRECT)  
   useEffect(() => {
     // code using match
   }, [match]);
   ```

2. **Line 417 useEffect**: Add `match` to existing dependency array
   ```typescript
   // Before (WRONG)
   useEffect(() => {
     // code using match and other deps
   }, [otherDep]);
   
   // After (CORRECT)
   useEffect(() => {
     // code using match and other deps  
   }, [otherDep, match]);
   ```

### Validation Steps:
1. **Read actual code** to understand what `match` represents
2. **Verify dependency necessity** - ensure `match` is actually used in effect
3. **Consider useCallback/useMemo** if `match` is an object that changes frequently  
4. **Test effect behavior** before and after fix

### ESLint Rule Compliance:
- **Rule**: `react-hooks/exhaustive-deps`
- **Enforcement**: All referenced values must be in deps array
- **Exception**: Only if value is guaranteed stable (rare)

**Next Step**: Proceed to T007 (TypeScript ignore comment validation)