# Sorcery action sprites — v1 handoff

Ready-to-integrate dark fantasy pixel artwork for all 12 requested simulator actions. There are 15 state sequences and 90 frames, including separate Subsurface off/on, Concede armed, and Music muted sequences. HUD integration and gameplay logic are not implemented in this pack.

## Open and inspect

Open `preview.html` directly in a browser. It embeds its frame metadata, so the preview does not require a server or network access. Use Replay to inspect the one-shot sequences; use Pause for the resting states. Display sizes and the sample live count are adjustable. The portable preview uses a serif fallback; the simulator can retain its existing Font Fantaisie Artistique title styling.

## Contents

- `assets/atlas.png`: transparent RGBA atlas, 384 × 960 px, 6 columns × 15 rows.
- `assets/strips/*.png`: 15 separate horizontal animation strips, each 384 × 64 px.
- `assets/idle/*.png`: 15 resting state images, each 64 × 64 px.
- `assets/manifest.json`: authoritative frame coordinates, timings, state IDs, conditions, idle frames, and badge anchors.
- `assets/sources/sheet-*.png`: the three original generated sheets, each 1374 × 1145 px, with a regular 6 × 5 grid of 229 px source cells.
- `assets/generation.json`: exact prompts, built-in image generation provenance, and normalization details.
- `preview.html`: portable visual review and playback example.
- `checksums.sha256`: SHA-256 hashes for every pack file except the checksum file itself.

## Rendering contract

Every delivery frame is 64 × 64 px with no gutters. Frame indices and rows are zero-based. For the master atlas, frame `f` of state row `r` starts at `(f * 64, r * 64)`; for an individual strip it starts at `(f * 64, 0)`. Crop a 64 × 64 region in either case. Use integer display scales where possible and `image-rendering: pixelated`; disable texture interpolation / canvas image smoothing.

Use the `idleFrame` or the supplied idle PNG when inactive or when reduced motion is preferred. A one-shot sequence plays frames 0–5 at `frameDurationMs` intervals and then holds `idleFrame`. A looping sequence can loop while hovered or otherwise active. Do not run every animation continuously by default. Replay one-shot animations on hover, activation, or the relevant state transition.

Cemetery and Collection counts are live overlays, not baked into the artwork. The manifest suggests a lower-right 16 × 16 px badge region at `(48,48)`. Choose a solid dark badge background and readable text, expanding its width for multiple digits; the region is an overlay anchor, not a guaranteed empty artwork mask.

## States and suggested playback

| State ID | Atlas row | Frame duration | Loop | Idle frame | Badge | Visibility / state |
| --- | ---: | ---: | --- | ---: | --- | --- |
| `log` | 0 | 100 ms | No | 0 | — | always |
| `tools` | 1 | 90 ms | No | 0 | — | always |
| `subsurface-off` | 2 | 100 ms | No | 5 | — | always; toggle V |
| `subsurface-on` | 3 | 100 ms | No | 5 | — | always; toggle V |
| `undo` | 4 | 100 ms | No | 0 | — | undo available |
| `cemetery` | 5 | 140 ms | Yes | 0 | Live count | your main phase; castable cards there |
| `collection` | 6 | 110 ms | No | 0 | Live count | deck defines a fetch pool |
| `cancel` | 7 | 55 ms | No | 0 | — | mid multi-click action path |
| `confirm` | 8 | 85 ms | No | 5 | — | action fully picked |
| `end-turn` | 9 | 120 ms | No | 0 | — | your main phase; nothing pending |
| `concede` | 10 | 100 ms | No | 5 | — | game not over |
| `concede-armed` | 11 | 110 ms | Yes | 5 | — | concede confirmation armed |
| `leave` | 12 | 110 ms | No | 0 | — | always |
| `music` | 13 | 140 ms | Yes | 0 | — | always |
| `music-muted` | 14 | 140 ms | No | 0 | — | music muted |

## Integration handoff

1. Keep the assets under `public/sprites/actions-dark-v1/` in the simulator. The same assets already exist there in the source workspace. Serve them at `/sprites/actions-dark-v1/`; manifest file paths are relative to that directory.
2. Build a presentation component that takes a state ID, animation trigger, optional count, accessible label, and display size. Use manifest coordinates for atlas rendering or the per-state strip. Keep its animation clock local to presentation.
3. Preserve the existing action handlers and availability checks. Derive display states from the authoritative game state and existing UI store actions; components should not directly mutate game state. Keep Socket.IO actions and validation unchanged.
4. Map the Subsurface toggle to `subsurface-off` / `subsurface-on` and preserve hotkey V. Render the selected state's idle PNG when motion is reduced.
5. On the first Concede click, enter the existing confirmation path and show `concede-armed` with a live “Really?” label. The artwork does not provide confirmation logic. Only the explicit second confirmation should invoke the existing concede action; cancellation clears the armed state.
6. Map music playback to `music` / `music-muted`. Add Collection only when the deck defines a fetch pool; read its count from the appropriate existing state source.
7. Keep accessible text labels and focus indicators on the parent buttons. Treat decorative sprites as hidden from screen readers. Expose toggle state with `aria-pressed` and honor `prefers-reduced-motion`.

## Review and acceptance

All delivered strips and idle PNGs were checked for their expected dimensions and the presence of both visible pixels and transparent pixels. The atlas dimensions and preview JavaScript syntax were checked. The original simulator preview was opened and visually inspected in the in-app browser.

Before shipping, review actual playback at the intended HUD size, state transitions, badge overlap at 0/1/99/999, keyboard interaction, and reduced motion. Generated frames contain small shape and anchor variations; the sequence quality should be assessed in the final HUD. Reference game-icons IDs describe the requested motifs; these are generated raster interpretations, not exports of the original SVGs.

No application source files or gameplay behavior were changed. No font file or external dependency is required for the portable preview. Generation provenance is included; no additional asset licensing claims are made by this handoff.
