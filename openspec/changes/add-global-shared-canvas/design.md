## Context

Browser WebGL context limits (8-16) cause context loss when navigating between 3D-heavy pages. Each Canvas creates a new context, and contexts can't share resources.

## Goals / Non-Goals

**Goals:**

- Eliminate WebGL context loss from page navigation
- Share GPU resources (textures, shaders) across all views
- Maintain existing camera/controls behavior per page
- Enable incremental migration (old Canvas and new SceneView can coexist)

**Non-Goals:**

- Change game logic or state management
- Modify texture loading strategies (handled separately)
- Support multiple simultaneous 3D views on same page (future enhancement)

## Decisions

### Decision 1: Use drei's View API

- **What:** Use `<View>` from @react-three/drei with `<View.Port>` in a single global Canvas
- **Why:** Official pmndrs recommendation, handles scissoring automatically, supports independent cameras per view
- **Alternative:** react-three-scissor → Deprecated, recommends View API
- **Alternative:** Multiple Canvas with context sharing → Not possible in WebGL

### Decision 2: Provider Pattern with Context

- **What:** GlobalCanvasProvider wraps the app, provides context for SceneView components
- **Why:** Clean separation, easy to test, backward compatible
- **Alternative:** Global singleton → Harder to test, React anti-pattern

### Decision 3: Incremental Migration

- **What:** Support both Canvas and SceneView during transition
- **Why:** Reduces risk, allows page-by-page validation
- **Alternative:** Big bang migration → Too risky for complex app

## Architecture

```
┌─────────────────────────────────────────────┐
│ GlobalCanvasProvider                        │
│ ┌─────────────────────────────────────────┐ │
│ │ HTML Layer (z-index: 1)                 │ │
│ │ ┌─────────┐ ┌─────────┐ ┌─────────┐    │ │
│ │ │ Page    │ │ SceneView│ │ SceneView│   │ │
│ │ │ Content │ │ (tracks) │ │ (tracks) │   │ │
│ │ └─────────┘ └─────────┘ └─────────┘    │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ Canvas Layer (z-index: 0)               │ │
│ │ <Canvas>                                │ │
│ │   <View.Port /> ← renders all Views     │ │
│ │ </Canvas>                               │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

## Component API

```tsx
// Root layout
<GlobalCanvasProvider>
  {children}
</GlobalCanvasProvider>

// Page component
<SceneView className="w-full h-screen" interactive>
  <OrbitControls />
  <Board />
  <Hand3D />
  <ambientLight />
</SceneView>
```

## Risks / Trade-offs

| Risk                          | Mitigation                                   |
| ----------------------------- | -------------------------------------------- |
| OrbitControls event conflicts | eventSource + eventPrefix handle this        |
| Performance regression        | Single context should be faster; monitor FPS |
| Complex migration             | Incremental approach, test each page         |
| Nested Canvas breaks          | Detect and warn in development               |

## Migration Plan

1. ✅ Create GlobalCanvasProvider and SceneView
2. Create test page to validate architecture
3. Integrate provider into root layout (disabled by default)
4. Migrate simple pages first (replay, admin replays)
5. Migrate complex pages (game, draft, editor)
6. Remove old Canvas references
7. Enable by default, remove feature flag

## Open Questions

- Should we support multiple SceneViews on the same page? (e.g., minimap + main view)
- How to handle Physics (rapier) with shared context?
- Should texture cache be aware of global vs local Canvas?
