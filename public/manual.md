# Realms.cards Simulator Manual

This manual documents keyboard shortcuts and core interaction flows for the Realms.cards simulator. All shortcuts are ignored while typing in inputs (chat/search/etc.) and when blocking overlays are open.

- _Spectator note: gameplay‑changing shortcuts (T, Enter, Space) are disabled for spectators._

## Keyboard Shortcuts

- **End Turn**

  - Press `Enter` (or Numpad Enter) to end your turn.
  - Only works on your turn and outside the Setup phase.

- **Tap / Untap**

  - Press `T` to tap/untap the currently selected permanent or your avatar.
  - Plays a flip sound and closes any open context menu.

- **Board Ping**

  - Press `Space` to ping the board at your current pointer position.
  - Also by double‑clicking on the board, a site, a permanent, or your avatar.

- **Camera Reset (Online Play)**

  - Press `Tab` to reset the camera to the current mode’s baseline.

- **Camera Pan / Tilt (2D & 3D)**

  - `W`/`A`/`S`/`D` pans the camera. In the editor we can also use the arrow keys.
  - `Q` / `E` tilts the camera up/down.

- **Hand Browsing**

  - With cursor over your hand, cycle focus with `ArrowRight` or `D`, and `ArrowLeft` or `A`.
  - Mouse wheel also cycles focus when the pointer is over your hand.

- **Quick Cancel / Cleanup**

  - Press `Escape` to close dialogs/overlays, dismiss hand hover/focus, and clear sticky hand drags.

- **Editor (Free Mode)**
  - Press `Space` to bring up the search overlay, start typing to search the card db - the first hit will be auto-highlighted
  - Press `Enter` to add a highlighted card to the deck
  - Press `Escape` to close the search overlay

## Mouse & Touch Basics

- **Select**

  - Left‑click a permanent/site to select it. Long‑press on touch to preview then open context menu.

- **Drag & Drop**

  - Drag from hand onto valid tiles/piles to play or reposition.
  - Drag permanents between tiles (snap to legal positions).
  - Drag to side piles to move to Spellbook/Atlas/Cemetery when allowed (placement dialog appears for Spellbook/Atlas).

- **Context Menu**

  - Right‑click a permanent/site/pile/avatar for available actions:
    - Tap/Untap
    - Transfer control
    - Move to Hand/Graveyard/Spellbook/Banished (context dependent)
    - Draw/Shuffle/Search piles
    - Attach/Detach token
    - Combat actions where applicable
  - Long‑press on touch to open the same menu.

- **Board Ping**
  - Double‑click the board, a site, a permanent, or your avatar to ping that location.

## Views and Camera

- **2D / 3D Toggle**

  - Use the on‑screen 2D/3D buttons to switch camera mode.
  - 2D is a top‑down view (stable, limited rotation). 3D uses orbit controls.

- **Orbit Controls**

  - Mouse: left‑drag to orbit (3D), middle‑drag to pan, scroll to zoom.
  - Keyboard: `W/A/S/D` to pan, `Q/E` to tilt. `Tab` resets (online play).

- **Spectating**
  - Spectator utilities are in the top‑right overlay. Pings (`Space`) are disabled.

## Combat Flow (HUD‑Driven)

- **Start Attack**

  - Move a unit into the target tile. A top HUD appears when an attack is possible.
  - Choose “Moves Only” or “Moves & Attacks”.

- **Select Target**

  - Click an enemy unit or site on that tile. HUD shows a preview; click Confirm to declare.

- **Defense / Intercept**

  - Defender selects units by clicking them on the attacked tile, then clicks Done.
  - With multiple defenders, the attacker may need to assign damage in the HUD.

- **Auto‑Resolve / Cancel**
  - Use HUD buttons to auto‑resolve or cancel as appropriate.

Note: Combat choices are HUD/click‑driven; no extra combat hotkeys.

## Casting Magic (HUD‑Driven)

- **Choose Caster**

  - When required, click a valid caster (highlighted unit or avatar).

- **Choose Target**

  - Click the highlighted legal target (unit/site/location). Projectile spells follow first‑hit along N/E/S/W from the caster.

- **Confirm**
  - Follow HUD prompts to commit or back out.

## Piles: Spellbook, Atlas, Cemetery

- **Click Top Card**

  - Click your Spellbook/Atlas to draw the top card (Cemetery is view‑only).

- **Right‑Click Piles**

  - Open actions for draw, shuffle (Spellbook/Atlas), search (Cemetery/own piles), tokens, etc.

- **Search Dialog**
  - Type to filter; click to select; `Escape` closes.

## Overlays and Dialogs

- **Common Controls**
  - Click outside to close where allowed.
  - Press `Escape` to close (e.g., search, attachment, hand peek, placement).

## Tips and Edge Cases

- **Shortcut Suspension**

  - Hotkeys are suspended when typing in inputs or when a blocking overlay is open.

- **Hand Hover Mode**

  - Hand navigation keys (`A/D`, `←/→`, wheel) work while the pointer hovers your hand.

- **Spectator Mode**

  - `T`, `Enter`, and `Space` shortcuts are disabled.

- **Double‑Click vs Drag**
  - Quick double‑click pings; click‑hold then move initiates drags.

## Quick Reference

- **End Turn**: `Enter`
- **Tap/Untap Selected**: `T`
- **Ping at Pointer**: `Space`
- **Reset Camera (Online)**: `Tab`
- **Camera Pan**: `W`/`A`/`S`/`D`
- **Camera Tilt**: `Q` / `E`
- **Hand Focus Next/Prev**: `→` or `D` / `←` or `A`
- **Close/Cancel**: `Escape`
