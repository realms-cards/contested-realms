# Tasks: Refine Lobby and Tournament Configuration

## Phase 1: Remove Pack Size Setting from UI

### Task 1.1: Remove Pack Size from Lobby Draft Configuration
**File:** `src/app/online/lobby/page.tsx`
**Lines:** 329-343, 994-1005

**Steps:**
1. Remove `draftPackSize` state variable (line 343 area)
2. Remove "Pack Size" label and input field from draft configuration modal (lines 994-1005)
3. Update `draftConfig` payload to always use `packSize: 15` (around lines 1221-1230)
4. Test: Verify draft matches start correctly with 15-card packs

**Validation:**
- TypeScript compiles with 0 errors
- Lobby draft configuration modal no longer shows pack size input
- Draft matches generate 15-card packs correctly

### Task 1.2: Remove Pack Size from Tournament Draft Configuration
**File:** `src/components/online/LobbiesCentral.tsx`
**Lines:** 343, 1371-1380, 1495, 1509

**Steps:**
1. Remove `draftPackSize` state variable (line 343)
2. Remove "Pack Size" input section from tournament draft configuration modal (lines 1371-1380)
3. Update tournament creation payload to always use `packSize: 15` (lines 1495, 1509)
4. Test: Verify draft tournaments are created correctly

**Validation:**
- TypeScript compiles with 0 errors
- Tournament draft configuration modal no longer shows pack size input
- Draft tournaments generate 15-card packs correctly

## Phase 2: Add Time Limit for Sealed Tournaments

### Task 2.1: Add Sealed Time Limit to Tournament Creation UI
**File:** `src/components/online/LobbiesCentral.tsx`
**Lines:** 1308-1324 (sealed config section)

**Steps:**
1. Add `sealedTimeLimit` state variable (default: 40)
2. Add "Deck Construction Time Limit (minutes)" input field after sealed pack configuration
3. Set input range: min=10, max=90, step=5
4. Include `timeLimit: sealedTimeLimit` in sealed config payload (line 1486 area)
5. Test: Verify time limit is included in tournament creation payload

**Validation:**
- UI displays time limit input with proper constraints
- Default value is 40 minutes
- Input validation works (10-90 range)

### Task 2.2: Update Tournament API to Accept Sealed Time Limit
**File:** `src/app/api/tournaments/route.ts`
**Lines:** 166-171 (sealed config extraction), 220-222 (settings storage)

**Steps:**
1. Extract `timeLimit` from `sealedConfig` in POST handler (lines 166-171)
2. Ensure `timeLimit` is stored in `settings.sealedConfig.timeLimit` (line 220-222 area)
3. Add validation: if provided, must be 10-90 inclusive
4. Use default of 40 if not provided
5. Test API with curl/Postman to verify time limit is stored

**Validation:**
- API accepts `sealedConfig.timeLimit` parameter
- Invalid values (< 10 or > 90) are rejected with 400 error
- Time limit is stored in database correctly
- GET `/api/tournaments` returns time limit in response

## Phase 3: Add Time Limits for Draft Tournaments

### Task 3.1: Add Draft Time Limits to Tournament Creation UI
**File:** `src/components/online/LobbiesCentral.tsx`
**Lines:** 1327-1434 (draft config section)

**Steps:**
1. Add state variables:
   - `draftPickTimeLimit` (default: 60 seconds)
   - `draftConstructionTimeLimit` (default: 20 minutes)
2. Add "Pick Time Limit (seconds)" input field in draft configuration section
   - Range: min=30, max=300, step=15
3. Add "Deck Construction Time Limit (minutes)" input field in draft configuration section
   - Range: min=10, max=60, step=5
4. Include both time limits in draft config payload (line 1492-1511 area)
5. Test: Verify time limits are included in tournament creation payload

**Validation:**
- UI displays both time limit inputs with proper constraints
- Default values are 60 seconds and 20 minutes
- Input validation works for both fields

### Task 3.2: Update Tournament API to Accept Draft Time Limits
**File:** `src/app/api/tournaments/route.ts`
**Lines:** 169-171 (draft config extraction), 221 (settings storage)

**Steps:**
1. Extract `pickTimeLimit` and `constructionTimeLimit` from `draftConfig` in POST handler
2. Ensure both time limits are stored in `settings.draftConfig`
3. Add validation:
   - `pickTimeLimit`: if provided, must be 30-300 inclusive
   - `constructionTimeLimit`: if provided, must be 10-60 inclusive
4. Use defaults (60 seconds, 20 minutes) if not provided
5. Test API with curl/Postman to verify time limits are stored

**Validation:**
- API accepts both draft time limit parameters
- Invalid values are rejected with 400 error
- Time limits are stored in database correctly
- GET `/api/tournaments` returns time limits in response

## Phase 4: Display Time Limits on Tournament Pages

### Task 4.1: Display Time Limits in Tournament Details
**File:** `src/app/tournaments/[id]/page.tsx` (or relevant tournament detail component)

**Steps:**
1. Fetch tournament settings including time limits
2. Display sealed time limit if matchType is "sealed"
   - Format: "Deck Construction: 40 minutes (warning only)"
3. Display draft time limits if matchType is "draft"
   - Format: "Pick Time: 60 seconds per pick (warning only)"
   - Format: "Deck Construction: 20 minutes (warning only)"
4. Add tooltip or help text explaining "warning only" means no hard enforcement
5. Test: Verify time limits display correctly for sealed and draft tournaments

**Validation:**
- Time limits display correctly for sealed tournaments
- Time limits display correctly for draft tournaments
- "Warning only" label is clear and prominent
- Constructed tournaments do not show time limit warnings

## Phase 5: Testing and Validation

### Task 5.1: Manual Testing
**Steps:**
1. Create lobby draft match without pack size setting
2. Create sealed tournament with custom time limit (30 minutes)
3. Create draft tournament with custom time limits (90 seconds, 25 minutes)
4. Verify all tournaments display time limits correctly
5. Verify pack generation works correctly (15 cards always)

**Validation:**
- No TypeScript errors
- No runtime errors in browser console
- All tournaments create successfully
- Time limits persist across page refreshes

### Task 5.2: Build Verification
**Steps:**
1. Run `npm run build` to verify production build
2. Run `npm run typecheck` to verify TypeScript compilation
3. Run `npm run lint` to check for code quality issues
4. Fix any errors that arise

**Validation:**
- Build completes successfully
- TypeScript compiles with 0 errors
- ESLint warnings only (no errors)

## Dependencies
- None (all tasks are independent and can be implemented in parallel if needed)

## Estimated Time
- Phase 1: 1-2 hours (straightforward removal)
- Phase 2: 2-3 hours (new UI + API changes)
- Phase 3: 2-3 hours (similar to Phase 2)
- Phase 4: 1-2 hours (display logic)
- Phase 5: 1 hour (testing)
- **Total:** 7-11 hours

## Rollback Plan
If issues arise:
1. Revert UI changes (pack size can be re-added if needed)
2. Make time limit fields optional in API (backward compatible)
3. Remove time limit display from tournament pages
4. All changes are additive or removals of unused features, so rollback risk is low
