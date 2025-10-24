# Proposal: Refine Lobby and Tournament Configuration

## Overview
Streamline game creation and tournament configuration by removing unnecessary pack size settings and adding flexible time limit controls for sealed and draft tournament phases.

## Motivation
Currently, the UI and configuration for lobbies and tournaments includes a "pack size" setting that is always 15 cards. This creates unnecessary complexity and confusion for users. Additionally, tournaments lack time limit warnings for sealed deck construction and draft picks, which are essential for maintaining tournament pacing and fairness.

## Goals
1. **Simplify configuration** - Remove fixed "pack size" setting from UI and configuration
2. **Add sealed time limits** - Allow tournament organizers to set time limits for sealed deck construction (warning-only)
3. **Add draft time limits** - Allow tournament organizers to set per-pick and construction time limits for draft phases (warning-only)

## Non-Goals
- Changing actual pack generation logic (packs remain 15 cards)
- Implementing hard enforcement of time limits (warnings only)
- Modifying lobby match time limit behavior (already working)

## Context
The application currently has:
- Lobby matches support sealed games with time limits (40 minutes default)
- Tournament configuration includes pack size setting in both UI and backend
- Draft configuration in tournaments lacks time limit controls
- Server code (server/features/lobby/index.js) uses fixed `pickCount: 15` internally

## Proposed Changes

### 1. Remove Pack Size Setting from Lobby/Tournament Creation UI
**Files affected:**
- `src/components/online/LobbiesCentral.tsx` (lines 343, 1371-1380, 1495, 1509)
- `src/app/online/lobby/page.tsx` (lines 329-343, 994-1005)

**Changes:**
- Remove `draftPackSize` state variable and related UI controls
- Remove "Pack Size" input field from draft configuration modal
- Use constant value of 15 for pack size in payload construction

### 2. Add Time Limit for Sealed Tournament Deck Construction
**Files affected:**
- `src/components/online/LobbiesCentral.tsx` (tournament creation modal, sealed config section lines 1308-1324)
- `src/app/api/tournaments/route.ts` (tournament creation endpoint, sealed config handling lines 166-171, 220)

**Changes:**
- Add `timeLimit` field to sealed configuration (default: 40 minutes, range: 10-90 minutes)
- Store in database via `settings.sealedConfig.timeLimit`
- Display in tournament detail pages for player reference

### 3. Add Time Limits for Draft Tournament Phases
**Files affected:**
- `src/components/online/LobbiesCentral.tsx` (tournament creation modal, draft config section)
- `src/app/api/tournaments/route.ts` (tournament creation endpoint, draft config handling lines 169-171, 221)

**Changes:**
- Add `pickTimeLimit` field to draft configuration (default: 1 minute per pick, warning-only)
- Add `constructionTimeLimit` field to draft configuration (default: 20 minutes, warning-only)
- Store in database via `settings.draftConfig.pickTimeLimit` and `settings.draftConfig.constructionTimeLimit`
- Display in tournament detail pages for player reference

## Implementation Plan
See `tasks.md` for detailed implementation steps.

## Success Criteria
- [ ] Pack size setting removed from all UI components
- [ ] Sealed tournaments can configure deck construction time limit
- [ ] Draft tournaments can configure per-pick and construction time limits
- [ ] Time limits display correctly on tournament pages
- [ ] Existing tournaments continue to work without migration
- [ ] All TypeScript compilation passes with 0 errors

## Rollout
- **Phase 1:** UI changes (remove pack size, add time limit controls)
- **Phase 2:** Backend changes (accept and store new time limit fields)
- **Phase 3:** Frontend display (show time limits on tournament pages)

## Risks and Mitigations
- **Risk:** Removing pack size might break existing code expecting it
  - **Mitigation:** Keep pack size in backend with constant value 15 for compatibility
- **Risk:** Time limit display might confuse users who expect enforcement
  - **Mitigation:** Clearly label as "warning only" in UI
