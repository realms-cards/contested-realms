# Add Global Loading Indicator

## Why

The Next.js dev helper shows a loading indicator in the bottom-left corner during development, but this indicator is not available in production builds. Additionally, API calls, navigation transitions, and async operations lack visual feedback for users, creating an inconsistent and potentially confusing user experience when operations take longer than expected.

## What Changes

- Add a custom global loading indicator component positioned in the bottom-left corner (similar to Next.js dev helper)
- Create a React context to manage loading state across the application
- Integrate loading state with navigation events (Next.js router)
- Provide hooks for components to trigger loading state during async operations
- Style the indicator to match the existing UI theme (ASCII/retro aesthetic)
- Ensure the indicator appears automatically during page transitions and can be manually triggered

## Impact

- **Affected specs**: Creates new capability `ui-loading-state`
- **Affected code**:
  - `src/app/layout.tsx` - Add LoadingProvider and GlobalLoadingIndicator
  - `src/lib/contexts/LoadingContext.tsx` - New context for loading state management
  - `src/components/ui/GlobalLoadingIndicator.tsx` - New loading indicator component
  - `src/hooks/useLoading.ts` - New hook for component-level loading control
- **User experience**: Improved feedback during all loading operations
- **Performance**: Minimal overhead (context updates only when loading state changes)
