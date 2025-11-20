# Implementation Tasks

## 1. Data Model and Persistence

- [ ] 1.1 Add `colorBlindMode` (boolean or enum) field to `User` in `prisma/schema.prisma` with a sensible default (e.g., false).
- [ ] 1.2 Create and apply a Prisma migration; regenerate Prisma Client.
- [ ] 1.3 Extend user settings/profile API(s) to read and update `colorBlindMode`.
- [ ] 1.4 Define localStorage key for guests (e.g., `sorcery:colorBlindMode`) and document its values.

## 2. Client Context and Bootstrap

- [ ] 2.1 Extend existing `ThemeContext` or create a dedicated `AccessibilityContext` that exposes:
- [ ]      - `colorBlindEnabled: boolean`
- [ ]      - `setColorBlindEnabled(next: boolean): void`
- [ ] 2.2 Initialize the context from:
- [ ]      - Server-provided session/user (for authenticated users).
- [ ]      - LocalStorage for guests or when user data is unavailable.
- [ ] 2.3 In `src/app/layout.tsx`, wrap the app with the new/extended provider.
- [ ] 2.4 Apply a root class or data attribute on `<body>` (e.g., `.colorblind-ui` or `data-colorblind="true"`), updated whenever `colorBlindEnabled` changes.

## 3. Semantic Color Tokens and CSS

- [ ] 3.1 Introduce semantic CSS variables in globals (e.g., `globals.css`) for:
- [ ]      - Ally/enemy, success/error/warning/info
- [ ]      - Selection, hover, target-legal, target-illegal
- [ ]      - Positive/negative highlights
- [ ] 3.2 Define default-mode values under `:root` that preserve current visual identity (where reasonable).
- [ ] 3.3 Define Color blind mode overrides under `.colorblind-ui` (or equivalent) using color-blind-friendly pairs.
- [ ] 3.4 Where practical, create Tailwind utilities or classes that map to these CSS variables for consistent usage.

## 4. User Badge Toggle UI

- [ ] 4.1 Update `src/components/auth/UserBadge.tsx` to include a "Color blind mode" toggle in the advanced/gear menu.
- [ ] 4.2 Ensure the toggle reflects the effective `colorBlindEnabled` value when the menu opens.
- [ ] 4.3 Wire toggle changes to `setColorBlindEnabled` so the UI updates immediately.
- [ ] 4.4 On toggle change:
- [ ]      - Persist to user profile via the appropriate API when authenticated.
- [ ]      - Persist to localStorage when unauthenticated or if the API call fails gracefully.
- [ ] 4.5 Verify `GlobalUserBadge` (if present) renders the same control or otherwise surfaces the toggle accessibly.

## 5. Apply Semantic Colors and Non-Color Cues

- [ ] 5.1 Audit core overlays and HUD components to replace hard-coded red/green and similar hues with semantic tokens:
- [ ]      - Life/health indicators, damage/heal flashes.
- [ ]      - Turn/phase indicators.
- [ ]      - Death’s Door and other severe statuses.
- [ ]      - Ally/enemy markers (player HUD, avatars, board indicators).
- [ ] 5.2 Update selection and targeting visuals:
- [ ]      - Use `target-legal` and `target-illegal` tokens for outlines/glows.
- [ ]      - Introduce outline style differences (solid vs dashed or thickness) between legal and illegal states.
- [ ] 5.3 Update status/toast/alert components:
- [ ]      - Use semantic success/error/warning/info tokens.
- [ ]      - Add icons (check, cross, warning) so messages remain understandable in grayscale.
- [ ] 5.4 Update draft/deck/tournament UI where color encodes state:
- [ ]      - Deck validity/legality chips, ready/locked states, error/warning banners.
- [ ]      - Tournament status badges (ready, playing, bye, etc.).
- [ ]      - Draft overlays that show pick/disabled/selected states.
- [ ] 5.5 Confirm that in Color blind mode, these states remain distinguishable by both color and non-color cues.

## 6. Testing and QA

- [ ] 6.1 Add unit tests for:
- [ ]      - Context initialization from user + localStorage.
- [ ]      - Toggle behavior (on/off) and persistence for authenticated and guest users.
- [ ] 6.2 Manually verify:
- [ ]      - Toggling Color blind mode updates UI without full reload.
- [ ]      - Setting persists across reloads and, for authenticated users, across devices.
- [ ]      - Critical flows (gameplay, draft, decks, tournaments) remain readable in both modes.
- [ ] 6.3 Perform ad-hoc checks with a color-blind simulator or grayscale mode to ensure ally/enemy, legal/illegal, and success/error/warning are distinguishable.
- [ ] 6.4 Ensure no global CSS filter or post-processing is introduced that alters card art or the entire 3D scene.

## 7. Documentation

- [ ] 7.1 Document Color blind mode behavior and limitations in project docs (e.g., README, spec.md, or a dedicated accessibility section).
- [ ] 7.2 Document the semantic color tokens and how new UI elements should adopt them.
- [ ] 7.3 Note localStorage keys and user preference field in developer documentation.
