# Tasks: add-global-shared-canvas

## Phase 1: Core Infrastructure

- [x] 1.1 Create `src/components/three/GlobalCanvas.tsx` with GlobalCanvasProvider
- [x] 1.2 Create SceneView component that renders into View
- [x] 1.3 Create test page at `/test-canvas` to validate architecture
- [x] 1.4 Test multiple views with independent OrbitControls ✓
- [x] 1.5 Test view show/hide without context loss ✓

## Phase 2: Integration (Skipped feature flag - direct integration)

- [x] 2.1 Create GlobalCanvasWrapper for root layout
- [x] 2.2 Add GlobalCanvasProvider to root layout
- [x] 2.3 Add noDefaultCamera prop to SceneView for custom cameras

## Phase 3: Page Migration (Simple)

- [x] 3.1 Migrate `/replay/[id]` page
- [x] 3.2 Migrate `/admin/replays/[matchId]` page
- [x] 3.3 Update `/test-canvas` to use root provider
- [x] 3.4 Validate build passes

## Phase 4: Page Migration (Complex)

- [x] 4.1 Migrate `/play` page (local play)
- [x] 4.2 Migrate `/online/play/[id]` page (online match)
- [x] 4.3 Migrate `/draft-3d` page
- [x] 4.4 Migrate `/decks/editor-3d/EditorCanvas.tsx`
- [x] 4.5 Migrate `EnhancedOnlineDraft3DScreen.tsx`
- [x] 4.6 Migrate `OnlineDraft3DScreen.tsx`

Note: Small modal components (GameToolbox, HandPeekDialog, OnlineD20Screen)
retain standalone Canvas instances as they don't benefit from shared context.

## Phase 5: Verification & Cleanup

- [ ] 5.1 Enable global canvas by default
- [ ] 5.2 Remove old Canvas imports from migrated pages
- [ ] 5.3 Update TEXTURE_OPTIMIZATION.md
- [ ] 5.4 Performance benchmarking
- [ ] 5.5 Remove feature flag (or keep for fallback)
