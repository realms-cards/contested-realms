# UI Loading State - Specification

## ADDED Requirements

### Requirement: Global Loading Context
The application SHALL provide a global loading state context that allows any component to indicate loading operations are in progress.

#### Scenario: Component starts loading
- **WHEN** a component calls `startLoading()`
- **THEN** the global loading indicator becomes visible
- **AND** subsequent calls to `startLoading()` increment an internal reference count

#### Scenario: Component stops loading
- **WHEN** a component calls `stopLoading()`
- **THEN** the internal reference count decrements
- **AND** the global loading indicator remains visible while count > 0
- **AND** the global loading indicator hides when count reaches 0

#### Scenario: Multiple concurrent operations
- **WHEN** multiple components call `startLoading()` concurrently
- **THEN** the loading indicator remains visible until all components call `stopLoading()`

### Requirement: Automatic Navigation Loading
The application SHALL automatically display the loading indicator during Next.js page navigation transitions.

#### Scenario: Navigation starts
- **WHEN** the user navigates to a new page (router.push, Link click)
- **THEN** the loading indicator becomes visible automatically

#### Scenario: Navigation completes
- **WHEN** the new page finishes loading
- **THEN** the loading indicator hides automatically

#### Scenario: Navigation error
- **WHEN** navigation fails or is cancelled
- **THEN** the loading indicator hides within 1 second

### Requirement: Visual Loading Indicator
The application SHALL display a loading indicator in the bottom-left corner of the viewport when loading operations are active.

#### Scenario: Indicator appearance
- **WHEN** loading state becomes active
- **THEN** an animated ASCII-style spinner appears at fixed position (bottom: 1rem, left: 1rem)
- **AND** the spinner uses theme-appropriate colors (slate-300 text on slate-900/80 background)
- **AND** the spinner has a z-index of 9999 to appear above all content

#### Scenario: Indicator animation
- **WHEN** the loading indicator is visible
- **THEN** it displays a rotating animation using ASCII characters
- **AND** the animation runs smoothly at 60fps

#### Scenario: Indicator dismissal
- **WHEN** loading state becomes inactive
- **THEN** the indicator fades out and removes from DOM
- **AND** the dismissal is smooth with CSS transition

### Requirement: Debouncing and Minimum Display Time
The application SHALL debounce loading indicator appearance and enforce minimum display time to prevent visual flicker.

#### Scenario: Fast operation completes before debounce
- **WHEN** `startLoading()` is called followed by `stopLoading()` within 100ms
- **THEN** the loading indicator never appears

#### Scenario: Minimum display time
- **WHEN** the loading indicator becomes visible
- **THEN** it remains visible for at least 300ms even if loading completes sooner

### Requirement: Automatic Cleanup
The application SHALL automatically clean up loading state to prevent stuck indicators.

#### Scenario: Timeout fallback
- **WHEN** a loading operation exceeds 30 seconds without calling `stopLoading()`
- **THEN** the loading state automatically resets
- **AND** a warning is logged to the console

#### Scenario: Component unmount
- **WHEN** a component that called `startLoading()` unmounts without calling `stopLoading()`
- **THEN** the loading state reference count decrements automatically

### Requirement: Developer API
The application SHALL provide a React hook `useLoading()` that returns functions to control loading state.

#### Scenario: Hook returns control functions
- **WHEN** a component calls `useLoading()`
- **THEN** it receives `startLoading()` and `stopLoading()` functions
- **AND** both functions are stable references (do not change on re-render)

#### Scenario: Hook provides loading state
- **WHEN** a component calls `useLoading()`
- **THEN** it receives a boolean `isLoading` indicating current state
- **AND** the value updates reactively when loading state changes

### Requirement: TypeScript Type Safety
The application SHALL provide full TypeScript type definitions for all loading state APIs.

#### Scenario: Context type exports
- **WHEN** importing LoadingContext types
- **THEN** TypeScript provides autocomplete for `startLoading`, `stopLoading`, and `isLoading`
- **AND** type errors are caught at compile time for incorrect usage

#### Scenario: Hook type safety
- **WHEN** using `useLoading()` hook
- **THEN** returned functions have correct TypeScript signatures
- **AND** no `any` types are used in the implementation
