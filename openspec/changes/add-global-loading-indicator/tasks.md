# Implementation Tasks

## 1. Create Loading Context Infrastructure
- [x] 1.1 Create `src/lib/contexts/LoadingContext.tsx` with LoadingProvider component
- [x] 1.2 Implement reference counting for concurrent loading operations
- [x] 1.3 Add debouncing logic (100ms delay before showing indicator)
- [x] 1.4 Add minimum display time logic (300ms minimum once visible)
- [x] 1.5 Implement 30-second timeout fallback with console warning
- [x] 1.6 Export TypeScript interfaces for context value

## 2. Create Loading Indicator Component
- [x] 2.1 Create `src/components/ui/GlobalLoadingIndicator.tsx`
- [x] 2.2 Implement ASCII-style animated spinner (rotating characters)
- [x] 2.3 Style with fixed positioning (bottom-left corner)
- [x] 2.4 Add CSS transitions for smooth fade in/out
- [x] 2.5 Set z-index to 9999 to appear above all content
- [x] 2.6 Ensure responsive design (works on mobile and desktop)

## 3. Create useLoading Hook
- [x] 3.1 Create `src/hooks/useLoading.ts`
- [x] 3.2 Implement `startLoading()` function with reference counting
- [x] 3.3 Implement `stopLoading()` function with reference decrement
- [x] 3.4 Return `isLoading` boolean state
- [x] 3.5 Ensure functions have stable references (useCallback)
- [x] 3.6 Add automatic cleanup on component unmount

## 4. Integrate with Next.js Router
- [x] 4.1 Add navigation detection in LoadingContext using usePathname/useSearchParams
- [x] 4.2 Detect route changes and trigger loading automatically
- [x] 4.3 Auto-stop loading after navigation completes (100ms timeout)
- [x] 4.4 Handle navigation cleanup and prevent stuck indicators
- [x] 4.5 Clean up timers on unmount

## 5. Integrate with Root Layout
- [x] 5.1 Import LoadingProvider in `src/app/layout.tsx`
- [x] 5.2 Wrap existing providers with LoadingProvider (outermost wrapper)
- [x] 5.3 Import GlobalLoadingIndicator in `src/app/layout.tsx`
- [x] 5.4 Add GlobalLoadingIndicator component after children
- [x] 5.5 Verify no TypeScript errors after integration

## 6. Testing and Validation
- [ ] 6.1 Test automatic loading during page navigation
- [ ] 6.2 Test manual loading with useLoading hook
- [ ] 6.3 Test concurrent loading operations (multiple startLoading calls)
- [ ] 6.4 Test debouncing (fast operations don't show indicator)
- [ ] 6.5 Test minimum display time (indicator visible for 300ms minimum)
- [ ] 6.6 Test timeout fallback (stuck loading auto-clears after 30s)
- [ ] 6.7 Test component unmount cleanup
- [x] 6.8 Verify TypeScript compilation with strict mode
- [x] 6.9 Verify ESLint passes with no new warnings
- [ ] 6.10 Test on mobile and desktop viewports

## 7. Documentation
- [x] 7.1 Add JSDoc comments to LoadingContext
- [x] 7.2 Add JSDoc comments to useLoading hook
- [x] 7.3 Add usage examples in component docstrings
- [ ] 7.4 Update CLAUDE.md with loading indicator information
