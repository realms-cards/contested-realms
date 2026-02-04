# Changelog

## February 2026

### Feb 18 - Garden of Eden and Reveal Overlay

- **Solo VS CPU mode added** not very smart, mostly for goldfishing purposes
- **add Garden of Eden custom resolver** - when active, players can only draw one card per turn
- **add toolbox and silver bullet resolvers**
- **add Silenced token** - when placed on a site, it prevents the sites ability
- **fix imposter masks not transporting to opponent**
- **fix Ether Core providing mana only when in void at beginning of turn!**
- **add Harbinger 1 mana discount** to first minion cast to a portal this turn
- **fix take card from cemetery**
- **add show revealed cards to opponent**
- **fix Discord bot lobby creation from queue**
- **save camera and playmat settings**
- **fix import list to collection** and make card display nicer

## January 2026

### Jan 28 - Tournament fixes and performance

- **Savior: add pay 1 to ward** to right click menu of minions cast this turn
- **correct player hand orientation**
- **when hand is hidden show a red hand icon**
- **allow card previews when ui is hidden**
- **smooth out Tournament flow** add round time setting, add tiebreaker rules and remove draw, better flow, add pods, add bracket view
- **add new lite mode** to support machines with old graphic chips
- **various perfomance improvements** for all graphic modes

### Jan 27 - Quality of Life

- **auto-banish rubble when placing a site** - placing a site on a tile with Rubble automatically banishes the Rubble

### Jan 26 - User requested fixes

- **add generate spectate link** from Match Info
- **add disable to site right click menu**
- **add custom resolvers for Sites** "Beacon" and "Annual Fair"
- **fix opponents moving my card to my cemetery**
- **fix patreon playmat display**
- **fix cancelling resolver moves card to cemetery**
- **avatar taps now when drawing a site via rightclick menu from avatar**
- **fix discord bot challenge and queue commands**
- **construct the tower of babel** by playing the apex on a base
- **harden D20 roll** for first player, should handle ties better
- **fix inspect hand follow up actions**
- **attack site** now only shows in right-click menu if "combat interaction guides" are on for both players
- **fix bug in health gauge component**
- **fix mana buttons not having an effect**
- **fix interrogator overlay** will only work if combat interactions are enabled
- **revisions and fixes for combat interactions** fix previews showing wrong attacker power, fix avatars attacking "here" on right click, fix avatar vs avatar combat
- **remove spectators seeing resolver overlays**
- **isolate pith imp state per instance** enabling correct resolution for multiple Imps on the board and correctly return card when it dies
- **fix Searing Truth** server patch
- **fix changing life not showing in console**
- **add sounds to health gauge**
- **fix imposter and pathfinder**
- **add guard against more than one click when swapping sites**

### Jan 22 - Legion of Gall

- **add custom resolver for Legion of Gall**
- **add HIDE UI with "u"** or by clicking on the eye icon
- **fix Mismanaged Mortuary** I totally got the rules wrong 😅
- **fix card names for peek and other scenarios being transported** to opponent
- **fix and put back Atlantean Fate resolver**
- **fix Trophy room resolver**
- **optimizations and fixes for mobile match view**
- **optimizations for the hand**

### Jan 21 - Fixes from GitHub issues

- **add automatic resolver for Mismanaged Mortuary**
- **add status effect icons** for various effects on the board
- **fix aura handling**
- **fix Player not having their mulligan if second player was faster**
- **add Gem tokens to toolbox** these can be used for various purposes
- **add RND button in toolbox** to generate a random number between 1 and x where we can choose x
- **fix core mana and treshold tracking**
- **fix problems with undo and activate it in main game** be careful with it! report if things go wrong
- **harden Pith Imp steal action**
- **fix Pathfinder not be able to play to the tile they are on**
- **fix Mephistopheles adjacency**
- **imported Decks can be reloaded now**

### Jan 20 - Autoresolvers and forfeits

- **REPLACE most MUSIC** - enjoy some Dungeonsynth from Knight of Cups instead
- **add Discord bot to connect Realms discord and platform** enables direct challenges and a constructed queue
- **attach token on right click for ward, stealth, lance**
- **add resolver for "Raise Dead"**
- **add browser notifications** enable them in user settings
- **add manual confirm for auto resolvers**
- **remove forfeit on disconnect** and harden forfeit on disconnect
- **fix zone patch for some resolvers**
- **fix Omphalos cards going to cemetery**
- **fix Assorted Animals staying on board when resolved**
- **fix counter rendering and buttons**
- **fix double duplicate bug for Harbinger portals**
- **fix attachment duplication when Avatars occupy same tile**
- **fix not transporting if opponent moves our avatar**
- **fix multiple emits for toolbox consent**

### Jan 14 - Atlantean Fate and token rendering

- **tokens render great in the stack now**
- **smaller hand fly-in zone** to make the hand less distracting when doing things on the board, also show only the very top of cards in hand when collapsed
- **add Mephitopheles and Atlantean fate** automatic resolver
- **add Pathfinder right click tap and move**
- **add flood and silence to site right-click**
- **add copy** to cards on board, copies get banished and can not go to cemetery
- **made camera dolly smoother**
- **fix some online match forfeits not counting as wins for the remaining player**
- **add tap to draw a site** for avatars that actually tap to draw a site
- **fixes for carryable artifacts** and token units can carry them as well now
- **fix bug with voice enabling only when user badge is open**

### Jan 11 - Smooth hands and board dragging

- **allow Magician to put sites back into spellbook**
- **optimize playing cards from hand** especially playing to backrow is much smoother as any card drags now completely hide the hand while dragging
- **fix actor seat for hotseat** there were some problems because hotseat fundamentally works differently than online mode
- **fix spectator permissions** they no longer can see Morgana and Omphalos hands and can not end the match
- **card can not be dragged outside the playmat zone anymore**
- **implement bug report button** its located in toolbox, next to the "Toolbox" title

### Jan 9 - Optimize and fix

- **much much better feeling hands**
- **turn off all custom resolvers from toolbox** (kinda TTS mode)
- **add face down play from hand and spellbook** (when dropping the card to the board keep “f” pressed or the right mouse button)
- **tokens are now banishable** with right-click, only lance can be dropped
- **D20 can now be rolled by pressing “2” and D6 by pressing “6”**
- **add goldfish mode to hotseat games toolbox** (every start of turn the acting players old cards are shuffled back and a full new hand is drawn, )

### Jan 7 — Gameplay fixes

- **allow modifying both players health in hotseat only**
- **let headless haunt and hauntless head go to random location on turn start** with support for Kythera Mechanism to choose their location
- **support Doomsday cult natively**
- **alert player when they end their turn with avatar untapped**
- **pretty piles and cards** optimized 3d objects used for cards
- **optimizations around auth requests and remove lock down mode** should reduce overall queries
- **be able to set font size for console & toolbox**
- **fix snapshot persistence**
- **allow more actions when not on the turn**
- **add follow up actions to inspect hand**
- **Resolver polish & hardening**: add preview controls to resolver overlays, tightened mulligan flow, fixed carryable artifacts miscounting mana thresholds, and patched Submerge
- **pressing space now hides the hand** in matches

### Jan 6 — Playmat hardening & preview control

- **Custom playmat failsafe** added SafePlaymat + error boundary so broken/slow textures fall back to default instead of black/blue screens (helps Xbox browser)
- **Grid fallback** when playmat fails to load for any reason, the grid overlay is shown automatically
- **Card preview size slider** new User Settings slider (50–150%) to scale preview popups

### Jan 5 - More card resolvers and more fixed

- **add Reveal to toolbox**
- **fixes for toolbox** standard setting for peek/scry/draw is now 1 and we support player names
- **special resolvers for Lilith, Mother Nature,Accusation, Black Mass, Highland Princess, Call to War, Assorted Animals added** as well as Haystack 😉
- **fix WebGL errors** mipmaps are not regenerated needlessly

### Jan 3 — Stability & Offline Play

- **Searing Truth, Call to War resolvers** added
- **added Animist can cast Magics as spirits** to automatically circumvent magic resolvers and make it known to the other player

## December 2025

### Dec 30 - Engine improvements

- **welcome to the table** if you don't like it, disable it in user settings! I recommend to hide the playmat and only show the grid on it(button on top)
- **added proper visual candy to board views** cards have bodym, materials, light, shadow and improved selection outline now. you can go back to flat view in settings
- **fixed Morgana/Omphalos hand cards being duplicated** to the top of stack
- **fix monuments and automatons triggering attachment** they should never have ...
- **fix burrowing/submerging minions**

### Dec 29 - Druid and Hardening

- **fix booster rarity** they were a bit too good, sorry
- **add deck export for TTS** export realms decks as TTS json objects
- **add omphalos and morgana hand card preview** these also get card previews now as they are quite small
- **add missing Dragonlord champions**
- **better health and mana manipulation in hotseat**
- **improve create tournament** user experience
- **Druid can now flip** to summon Bruin "here" and flip the card art
- **Harbinger portals hardening** it was possible before to begin a match with less than three portals which should be fixed now
- **harden replay recording** if the server was rebuilt during a match (I push changes to production), it was possible to break replay recording

### Dec 28 - Collection improvements, Fix Mephistopheles

- **Collection** has now a list view for bulk card commands and import can take into account not adding cards already present, also deleting the whole collection is now possible
- **Fix Mephistopheles** Mephistopheles tagline tripped our algorithm, which is fixed now
- **add lazy loading for chat**
- **persist webrtc sessions** from lobby to match
- **better handling for auth sessions** exponential backoff after disconnect
- **increase size of sites card preview** for some views

### Dec 27 - Necromancer, Earthquake

- **Necromancer can spawn Skeleton** added an option to Necromancers right click menu to summon a skeleton "here" for one mana
- **Earthquake implemented** probably not needed as it was perfectly resolvable before, but lmk

### Dec 23 - Performance, Sorcerers at the Core

- **add easy tournament mode** for Sorcerers at the Core. You can now easily find other players participating in monthly tournament by their badge and can create new matches with **a link to pass to discord**
- **super fast curiosa import** direct import from curiosa.io deck url is much faster, more reliable and has better user experience now
- **indefinite storage for replays** although we can download replays, they are small, so I chose to keep them around a long time if we can (before they would be deleted after 2 weeks)
- **less requests, more caching, more performance** we try to request less, cache more

### Dec 21 — Morgana, Omphalos & Reliability

- **free Avatar mode** A special mode for sealed games. No avatars in booster, but you can freely select which one to play during deck construction
- **allow Tournaments with irregular and changing player counts** Before we only allowed a fixed number to start, now the host decides when to start
- **Leave and join for Tournaments in progress** The idea is to have mechanisms for replacing disconnected players (invite others who take over the disconnected players deck)
- **readd second Seer to limited modes**
- **Common Sense** will now show all ordinaries in your spellbook for you to choose from
- **Browse** fixed the overlay to easily resolve it
- **Morgana le Fay** gains her Genesis private hand: draw 3 hidden spells, castable via a new Morgana hand overlay.
- **Omphalos artifacts** now keep a private spell hand (drawn end of turn) with per-Omphalos casting UI and enforced summon-at-source for minions.
- **Pith Imp** steals a random card, shows it and then hides it underneath
- **Game fixes**: fixed Submerge handling multiple minions correctly, fixed peek follow up action
- **Toolbox Goodies** You can now search and draw any card in the game to hand, a scaling slider has been added that enables you do scale down all permanents
- **Improve UX of deck import**
- **Auth hardening**: Email login reliability improvements (edge-safe token handling, fallback flows).
- **Mobile polish**: Added top-bar button for touch devices, fixed health display, and improved music playback/autoplay in hotseat.
- **Hide automatic card previews** Just press "p" on keyboard to enable/disable card previews in matches (or find the toggle in Info in top bar)
- **Special mana and treshold tracking** These sites now are fully implemented: Valley of Delight, Avalon, Pristine Paradise, The Colour Out of Space, The Empyrean, City of Glass/Plenty/Souls/Traitors, Myrrh's Trophy Room, Bloom Sites,Ghost Town
- **Add TOS and privacy policy** These seem to be required ...

### Dec 18 — Scry & Visual Polish

- **Proper dice models!** Damn they look great!
- **Custom Playmats for Patrons** Supporters of the [Realms.cards Patreon](https://www.patreon.com/realmscards) can now upload custom playmats
- **Add D6 to toolbox**
- **Add "free drag mode" for sites to toolbox** to resolve Rift Valley and other cards that need easy site manipulation
- **Second player seer improved**
- **Easy token deletion** Press "del", "backspace" to delete a highlighted token from the board
- **Switch Playmat for Grid**: Change to a simple Grid for playing

### Dec 17 — UI & Gameplay Fixes

- **Spectator mode** Ongoing matches can be spectated (if they are not private), spectators do not see hands
- **Add Shortcuts** Zoom is now also "+" and "-", quick help is "h" and "?"
- **Second Player Seer** is now guarded against early game start
- **Hand Inspect**: Added follow-up actions when inspecting the hand
- **Flip cards**: Added flip cards to cards on the board
- **Patron Shoutout**: Display all Patrons and make them stand out in Chat and the Players tab
- **Better invites** Invites from lobby now are now overlays
- **Lobby polish**: Cleaner lobby layout and less confusing game creation
- **Quick Play**: Revised quick play flow
- **Online Players indicator** fixed to display only connected players
- **Imposter**: Fixed Imposter behavior and deck import
- **Site Preview**: Increased card preview size for sites

### Dec 16 — Replays & Auth Reliability

- **Replays**: Save and load replays
- **Email Auth**: Reliability fixes (verification token reuse; disable clicktracking/link processing)
- **Auth Cookies**: Sanitized JWT token to prevent cookie bloat
- **Meta Stats**: Added meta statistics page and fixed previews/orientation in dashboard
- **Quick Play**: Expanded quick play and made Constructed the default selection
- **Manual**: Added video tutorial to manual
- **Performance**: Optimized queries and fixed backend error on player fetch

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
