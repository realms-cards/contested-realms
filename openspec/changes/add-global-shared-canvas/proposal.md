## Why

The application currently has 10+ separate Canvas instances across pages (lobby, draft, game, replay, editor). Each Canvas creates its own WebGL context, leading to:

- **Context loss** when exceeding browser limits (8-16 contexts)
- **Memory waste** from duplicated textures and shaders
- **Slow page transitions** (new context initialization)

## What Changes

- **Add GlobalCanvasProvider** - Single Canvas at root layout level using drei's View API
- **Add SceneView component** - Replacement for Canvas that renders into the global context
- **Migrate pages incrementally** - Convert existing Canvas usages to SceneView
- **Share textures/shaders** - All views benefit from cached GPU resources

## Impact

- Affected specs: rendering (new capability)
- Affected code:
  - `src/components/three/GlobalCanvas.tsx` (new)
  - `src/app/layout.tsx` (wrap with provider)
  - All pages with Canvas components (migrate to SceneView)
  - `src/components/game/dynamic-3d.tsx` (update for View compatibility)
