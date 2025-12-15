# Changelog

## December 2025

### Dec 14 — Specific card support

- **Chaos Twister**: Dexterity based play for Chaos Twister

### Dec 14 — Gameplay & UI Updates

- **Simulator Manual**: Read the in-app manual from the lobby
- **Rubble Replacement**: When a site is sent to the cemetery, you can optionally replace it with a Rubble token
- **Cemetery Actions**: Banish cards from the cemetery; view opponent cemetery and request consent to draw from it in online play
- **Token Pile Permissions**: In online play, you can only interact with your own token pile
- **Leaderboard Accuracy**: Solo/hotseat matches no longer affect the global leaderboard
- **Harbinger Fixes**: Finally fix Harbinger in online play
- **Element/D20 Assets**: Updated element icons (including editor) and refreshed D20 visuals
- **Card Scanner**: Updated scanner to support Gothic
- **Admin**: New recent matches endpoint and improved health/threshold display
- **Search Index**: Updated local card search index to support Gothic

### Dec 11

- **Placement jank is gone** Cards and tokens place precise now when dropped
- **Persist Hotseat Mode** Hotseat mode is now persisted in local storage
- **Camera settings persist now**
- **Toolbox Peek**: Added follow-up interactions when peeking at piles
- **Mana Display**: Now shows spent mana during gameplay
- **Cemetery Interactions**: Cards can now be dragged from cemetery to hand
- **Spectator Mode**: Piles and hands are now visible; tokens are non-interactive
- **Ward Attachment**: Fixed attaching Ward to permanents
- **Avatar Tap Rules**: Avatar now correctly taps when drawing a site (except for Pathfinder; Geomancer can play sites from atlas directly to the board)
- **Hand Fly-in**: Adjusted hand entry animation zone positioning
- **Token Transport**: Token drags are now properly synced in online play
- **Collection Fix**: Resolved issue where cards couldn't be drawn from collection in online matches
- **Opponent Notifications**: Added notification when opponent plays a card
- **Added info links in lobby**: footer (Discord, Issues, Email, Changelog)
- **Fix mulligan cards not showing**
- **support Cardnexus** lists import and export to collection and decks
- **Drag cards from board to hand** implemented
- **Collection** is now next to toolbox as a button instead of a card pile on board

### Dec 8 — Gothic Fixes

- **Harbinger Portals**: Special phase for Harbinger portal placement
- **Magician Display**: Special display mode (only spellbook cardback, mixed pile, opponent cannot see landscape cards but you can in your own hand)
- **Asset Regeneration**: Regenerated all assets and checked routes for Curiosa naming changes
- **Random Spell Endpoint**: Added convenient endpoint at `/random-spell` (works logged out, supports Chaoswish)
- **Gothic Precons**: Added Gothic precons as public decks
- **Draftsim Memory**: Remembers set selections and player count
- **Gothic Default**: Gothic is now the default selection for sealed and draft modes
- **Curiosa Import**: Import decks directly from curiosa.io with a link (deck creation and constructed matches)
- **Image Preview Fix**: Fixed missing image preview
- **Replays**: Many improvements to replays
- **Lobby Chat**: Persist global chat
- **Collection CSV**: Fixed CSV import and made it blazing fast

### Dec 6 — Gothic is Here

- **Gothic Set**: Initial Gothic set support (limited testing due to Siege at the Core participation)

### Dec 3 — Card Lists, Scanner & Performance

**Collection**

- Users can now create/import/export arbitrary card lists in `/collection`

**Card Scanner**

- Added card scanner that works well for adding cards to collection or any list

**Gameplay**

- Right-click Sites to swap position with another site or move to a void (taking everything atop)
- Elementalist avatar now adds +1 to each threshold
- Added game setup phase for Harbinger

**Fixes**

- More stability for retaining replay data
- More stability for retaining leaderboard data

**Performance**

- Increased performance on tournament page
- Introduced service worker to cache cards with ability to download all for offline play
- Texture pipeline optimization
- React lazy loading
- Shared webpack chunks

### Dec 1 — Rise of the Dragonlord Champion

- **Dragonlord Champion Selection**: When Dragonlord is selected as avatar (import, construct, or draft), players can choose the champion
- **Mulligan Display**: Show Dragonlord champion in Mulligan screen
- **In-Game Display**: Show Dragonlord champion when right-clicking Dragonlord

## November 2025

### Nov 30 — Solo Draftsim Fixes

- Set default players to 4 for faster setup processing
- Fixed Cube booster display
- **Frogimago's Cube**: Now processed differently
- Removed Spellslinger from booster generation
- Added sideboard to booster generation
- Changed booster generation to treat card counts as absolute availability

### Nov 29 — Solo Hotseat Fixes

- Fixed patches (prevented player from moving cards on board)
- Added seat swap on end of turn
- Repaired undo and enabled it on production
- Highlighted solo play modes on main page again

### Nov 28 — Editor and Draft Improvements

**Draft to Editor Flow**

- If auto-stack is disabled in draft, cards carry over their position to the editor
- Cards in upper half of board auto-add to deck; lower half adds to sideboard

**Editor Free-Mode**

- Save button displayed more prominently
- Added auto-saving
- Added booster pack generation and opening

**Search**

- Blazing fast local search index
- Restyled search for easier closing
- Keyboard controls: SPACE to invoke, type to highlight first card, ENTER to add to deck, ESC to close

**Controls**

- Added arrow keys for board panning (mirrors WASD)

**Cube Fixes**

- Fixed cube extra cards (sideboard cards available for extra avatars, etc.)

---

_This changelog is updated regularly. Check back for the latest updates!_
