# Add Color Blind UI Mode

## Why

Some players have difficulty distinguishing red/green and other hue-based cues used in overlays and interface pieces (ally/enemy, success/error, legal/illegal targets, warnings). Today the client relies heavily on color alone to convey meaning, and there is no per-user setting to adjust the UI for color vision deficiencies.

We want a per-user "Color blind mode" toggle in the User Badge advanced options that switches the UI to a color-blind-friendly semantic palette and adds redundant, non-color cues in critical places, without altering card art.

## What Changes

- Add a per-user Color blind mode setting:
  - Persisted on the user record for authenticated users.
  - Stored in localStorage for guests or when the user record is unavailable.
- Expose a `colorBlindEnabled` flag via a shared client context (e.g., AccessibilityContext or extended ThemeContext) and a root body class / data-attribute.
- Introduce semantic color tokens (CSS variables / Tailwind tokens) for:
  - Ally vs enemy / my vs opponent.
  - Success / error / warning / info.
  - Selection, hover, target-legal, target-illegal.
  - Positive / negative highlights in overlays and HUD.
- Implement a Color blind mode palette that remaps these semantics to color-blind-friendly pairs (e.g., blue/orange/yellow/purple) with good luminance contrast.
- Add non-color cues (icons, outline styles) in critical views where color is currently the only signal (e.g., target legality, status badges).
- Add a "Color blind mode" toggle to the User Badge gear/advanced options UI, wired to:
  - Update context immediately.
  - Persist to user profile and/or localStorage.
- Apply the semantic tokens + non-color cues to key overlays and interface pieces:
  - Game HUD and overlays (status bars, life/health indicators, damage/heal flashes, selection/target lines, DD state).
  - Draft/tournament/deck editor overlays (ready/locked, valid/invalid, state badges, chips).
  - Global toasts and status messages.

## Impact

- **Affected specs**: Creates new capability `ui-accessibility` (Color blind mode).
- **Affected code (likely)**:

  - Backend:
    - `prisma/schema.prisma` (add user preference field, e.g. `colorBlindMode`).
    - User settings / profile APIs that read/write user preferences.
  - Frontend:
    - Contexts: extend existing `ThemeContext` or add `AccessibilityContext` to expose `colorBlindEnabled`.
    - Root layout: `src/app/layout.tsx` (provider + body class / data attribute).
    - User Badge: `src/components/auth/UserBadge.tsx` and `GlobalUserBadge.tsx` (advanced options toggle).
    - Shared UI: badges, chips, alerts, status indicators (CSS vars / Tailwind tokens).
    - Game overlays / HUD: selection and target outlines, DD state, damage/heal, ally/enemy markers.
    - Draft / deck / tournament UI: statuses, legality/validity, ready/locked chips.
  - Storage:
    - LocalStorage key for guests (e.g. `sorcery:colorBlindMode`).

- **User experience**:

  - Players can opt into a Color blind mode that makes ally/enemy, success/error, legal/illegal targets, and warning states more distinguishable by color and by secondary cues.
  - Card art colors remain untouched; only UI chrome / overlays and interface components change.
  - Setting persists per user and across sessions/devices when signed in.

- **Non-goals (for this change)**:
  - Supporting multiple named color-vision profiles (e.g. separate modes for deuteranopia vs protanopia vs tritanopia).
  - Recoloring or post-processing card art or 3D scene textures.
  - General-purpose color-blind simulation or debugger tooling.
