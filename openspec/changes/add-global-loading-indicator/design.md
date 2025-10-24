# Global Loading Indicator - Design Document

## Context

The application currently lacks consistent visual feedback during loading operations. Next.js provides a dev-only loading indicator in the bottom-left corner, but this is not available in production. Users experience delays during:
- Page navigation transitions
- API calls (tournaments, lobbies, matches)
- File uploads and data fetching
- Authentication flows

The loading indicator must work across the entire application without requiring changes to existing components.

## Goals / Non-Goals

**Goals:**
- Provide automatic loading indication during Next.js navigation
- Allow manual loading state control for async operations
- Position indicator consistently in bottom-left corner (like Next.js dev helper)
- Match existing ASCII/retro aesthetic
- Zero breaking changes to existing code
- Minimal performance overhead

**Non-Goals:**
- Replace component-specific loading states (e.g., button spinners)
- Track individual request progress (percentage complete)
- Queue multiple loading operations (simple on/off state)
- Provide loading messages or labels (visual indicator only)

## Decisions

### Decision 1: React Context + Router Integration
**What:** Use React Context for state management and integrate with Next.js router events for automatic navigation loading.

**Why:**
- Context provides global state without prop drilling
- Router events give automatic page transition detection
- Aligns with existing pattern (see ThemeContext, SoundContext in layout.tsx:46-47)

**Alternatives considered:**
- Zustand store: Overkill for simple boolean state
- Event emitter: Less React-idiomatic, harder to test
- Global variable: No reactivity, poor integration

### Decision 2: Component Placement in RootLayout
**What:** Add LoadingProvider above other providers and GlobalLoadingIndicator below children in layout.tsx.

**Why:**
- Ensures loading state available to all components
- Renders indicator on top of all content (z-index management)
- Follows existing provider nesting pattern

**Structure:**
```tsx
<LoadingProvider>
  <ThemeProvider>
    <SoundProvider>
      {/* other providers */}
      {children}
      <GlobalLoadingIndicator />
    </SoundProvider>
  </ThemeProvider>
</LoadingProvider>
```

### Decision 3: Manual Control via useLoading Hook
**What:** Expose `startLoading()` and `stopLoading()` functions via hook, with automatic cleanup.

**Why:**
- Simple imperative API for async operations
- Automatic cleanup prevents stuck indicators
- TypeScript-friendly with proper types

**Example usage:**
```tsx
const { startLoading, stopLoading } = useLoading();

async function handleSubmit() {
  startLoading();
  try {
    await api.createTournament(...);
  } finally {
    stopLoading();
  }
}
```

### Decision 4: Debouncing and Minimum Display Time
**What:**
- Debounce loading indicator appearance by 100ms
- Show indicator for minimum 300ms once visible

**Why:**
- Prevents flicker for fast operations (<100ms)
- Minimum time ensures users perceive the feedback
- Reduces visual noise for rapid state changes

**Trade-offs:**
- 100ms delay: Fast enough not to feel sluggish, slow enough to skip micro-operations
- 300ms minimum: Long enough to be perceived, short enough not to feel stuck

### Decision 5: Visual Design
**What:** ASCII-style animated spinner matching existing retro aesthetic.

**Design:**
```
Position: fixed bottom-4 left-4
Size: 32x32px
Animation: Rotating ASCII characters
Colors: Matches theme (slate-300 text on slate-900/80 background)
```

**Why:**
- Consistent with AsciiLogo.tsx, AsciiPanel.tsx, AsciiBottomArt.tsx
- Non-intrusive bottom-left position (doesn't block content)
- Fixed positioning works across all screen sizes

## Risks / Trade-offs

**Risk 1: Multiple concurrent loading operations**
- **Issue:** If multiple operations call startLoading(), how do we handle concurrent state?
- **Mitigation:** Use reference counting internally. Increment on start, decrement on stop. Show indicator while count > 0.

**Risk 2: Memory leaks from forgotten stopLoading()**
- **Issue:** Developer forgets to call stopLoading() in error path
- **Mitigation:**
  - Provide useLoadingEffect hook with automatic cleanup
  - Document best practice: always use try/finally
  - Add 30-second timeout fallback to auto-stop

**Risk 3: Conflicting with existing loading states**
- **Issue:** Pages like tournaments/page.tsx:343 have custom loading indicators
- **Mitigation:** Global indicator complements local indicators. Local = detailed state, Global = operation in progress.

**Trade-off: Simplicity vs Features**
- Decision: Start with simple on/off indicator
- Future enhancement: Add loading messages, progress bars if needed
- Rationale: YAGNI - solve the immediate problem first

## Migration Plan

**Phase 1: Add infrastructure (non-breaking)**
1. Create LoadingContext and GlobalLoadingIndicator
2. Add to layout.tsx without removing existing code
3. Test in development

**Phase 2: Automatic navigation (non-breaking)**
1. Integrate with Next.js router events
2. Deploy and monitor for issues
3. Collect user feedback

**Phase 3: Optional cleanup**
1. Identify redundant local loading states
2. Gradually remove if global indicator suffices
3. Keep local states where detailed feedback needed

**Rollback:** Remove LoadingProvider and GlobalLoadingIndicator from layout.tsx. No other changes needed.

## Open Questions

1. **Should we add configuration options?** (e.g., debounce time, position)
   - **Answer:** No, keep simple initially. Add if needed.

2. **Should we support loading messages?**
   - **Answer:** Not in v1. Global indicator is visual-only. Messages belong in component-specific UI.

3. **Should we track which component triggered loading?**
   - **Answer:** No. Simple boolean state. Use browser DevTools for debugging.

4. **How to handle 3D scenes with loading?**
   - **Answer:** Global indicator covers navigation. 3D scenes can still use their own internal loading (e.g., Suspense fallbacks).
