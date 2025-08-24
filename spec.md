Let us build a full featured, beautiful online game client to play the trading card game “Sorcery Contested Realm”.
Main functions we need to accomplish:

CONSIDER THESE DONE:

- luckily there is an api to get all the card texts: https://api.sorcerytcg.com/
- also there is an official folder with all card images:
  https://drive.google.com/drive/folders/17IrJkRGmIU9fDSTU2JQEU9JlFzb5liLJ?usp=sharing
- we should download and save the cards to files on our server
- we should make a database linking the text from the cards with the pictures
- sealed mode (draft a deck from 6 booster packs)
- draft mode (select number of players, each player can open 3 boosters one by one, each player picks a card from their draw to build their deck - then passes to the next player)
- for all modes we should be able to select which card pool the booster pack comes from
- the booster pack generation should be as close as possible to real packs: Each 15-card booster reportedly includes 11 Ordinary cards, 3 Exceptional cards, and 1 Elite or Unique card without having duplicate cards in one pack
- we do want players to be able to play against each other online- most importantly we need a mode vs cpu
- we should be able to import and export decklists in a format compatible with curiosa deck lists
- The actual game UI should feature life counting, mana counting, threshold counting, a game board according to the rules, virtual dice, players hand shown on the bottom, opponents hand hidden on top
- Game UI should leverage a 3D engine to render the game board and the cards
- We can focus on sealed and draft mode where each deck has a minimum of 24 spellbook cards and 12 sites
- It would be great to be able to save and retrieve drafted decks
- Sites have a landscape layout and should be displayed rotated 90 degrees clockwise
- It is fine to group sites and spellbook cards to different areas to help with the mixed layout of landscape and portrait oriented cards
- The draft mode is expertly reading the data from the database image and text

TODO:

- hand magnification on hover can be way smaller, magnification on click is a problem because it can inadvertedly lead to playing a card we should disable playing cards from hand with a click and use drag only
- we should be able to move and scale the big card preview
- for cards on the board the preview should appear much faster, maybe when the pointer lingers on a card for 1 second
- there is still no undo button, but I think undo has been implemented
- sometimes a card moves when clicked, they should only move when dragged!
- cards still snap to the grid, but placement should be free (while still showing which grid the card is occupying)
- it would be cool if cards on the board would randomly tilt just a little bit on play so they never fully obstruct each other
- I added a skybox picture for use in the game mode (data/skybox.png)
- Sorcery is played on a 5x4 grid!! You can center it on the playmat
- Initially we need to have a game setup screen that needs to take more screen real estate than the current one, where we can select the decks
- After deck selection the game board should be prepared by shuffling the spellbook and putting it down, same with the atlas - both players need to do this. Their Avatar is placed on the board into their respective places
- Then players are able to do a mulligan
- We do not need manual transition through the game phases, we only need end turn and resolve the rest according to the rules
- We need a console on screen with transparency and collapsable, tracking all game events
- we can also make moves to hand and cemetary part of the context menu
- can we disable the browser menu right click on the canvas and replace right-click with context menu?
- context menu should appear at the cursor position
- can we disable any text selection on the whole play page?
- can we leave a card on the board exactly where the ghost was when the button of the mouse was released?
- are there physics coming with this engine? can we not place the cards on the board by applying gravity?
- I out png images named after the 4 elements in the data folder, we want to use them in place of the strings for the tresholds in console and UI
- draw piles should be placed in zones next to the grid in 3d view, not the HUD
- draw piles should be simulated containing cards in the order they were shuffled in
- draw piles should be able to be shuffled
- draw piles and cemetary needs to be searchable to retrieve cards
- cards can also be banished which is a different zone than the cemetary
- players mana should be counted according to the sites they played
- players mana and treshold should be displayed in the 3D viewport at the side of the respective player, not in the HUD
- when a site is moved to the cemetary, hand or is banished treshold and mana should be updated accordingly
- we want to enable the context menu only on right click, so we can left click to select a card for dragging more easily
- Sites might need to be dragged to in rare cases
- our card "containers" should be fully transparent, as the card art has rounded edges
- if more than one card are overlapping a site card, we should give the site card the lowest priority for catching a selection
- instead of the circle objects to indicate a selected card, it would be better to have a glowing outline on the card
- when releasing a dragged card it seems to (unnecessarily) jump a little before being played down, we can remove that
- I would really like for the hand, the draw piles and the graveyard to be part of the 3d engine instead of the HUD - can you assess a possible implementation and prepare
- The controls to slide and zoom the board are actually more important than the current orbit view, I would love a toggle between the current orbit controls and another mode that seems only 2d topdown, where player can only zoom and slide
- We can remove the toggle for the playmat
  the area of the site itself seems to not allow right clicks at all
  I can not drag the avatar
  I also realized that on hover magnification is not workin for avatars but other card types

EDITOR:

- Sites should never be added to the spellbook
- Spells should never be added to the atlas
- Avatars should never be added to the spellbook or the atlas
- We need an edit mode for decks - right now when we draft we only pick but we end up with too many cards.
- Decks should be separated into three piles: Avatars (min-max 1), Atlas (min 12), Spellbook (min 24).
- When editing decks we should include the option to set the Avatar to "Spellslinger"
- Deck editing needs to contain an option to add standard sites for all four colors (Spire, Stream, Valley, Wasteland)
- Adding a standard site should be a button with the picture of the card for each, selectable independently
- Current iteration is very clunky, we need a drag and drop interface, less whitespace and more focus on the cards
- Cards are sorted automatically into avatar, spellbook and atlas according to their card type!! This distinction is more important for the game engine than the player.
- For the editor we basically need two zones for the UI: Deck (with Avatar, Spellbook and Atlas) and Sideboard (all cards not selected for inclusion in the deck)
- The editor should be visited when a draft is complete
- When entering the editor in this way, we should not be able to remove or add cards to the deck (except standard sites and the avatar)
- There should be something at the /decks route, listing all available decks

REFERENCE:

- it is possible to completely eliminate snapping in place of dragged cards and exactly leave them at the positon of the ghost on mouse button lift?
- site cards are never tapped
- site cards always should be landscape 4:3, not portrait 3:4
- spells and sites have different orientations but the same card size
- I added a reference folder with a csv inside containing explanations of all keywords we can use to define the rules engine
- A full copy of the rules can be found here:
  https://drive.google.com/file/d/1sgQo0xf0N2teIR0zlyl91g9j6LVncZnr/view
- Max life in Sorcery is 20
- Once a player reaches 0 life, they are considered to be at deaths door (symbolized by DD), can not heal anymore and become immune to damage for the rest of the round, they can only be killed by taking another damage directly to their avatar in subsequent turns

ONLINE MULTIPLAYER:

- First we need a way for players to register in the database, including their player name
- We should save decks in the players store (including automatically saved bot decks for their draft sessions)
- Then we need a lobby system to be able to find players to play with
- Then we need to fork our play client (which we want to preserve for offline play) and make it work with the online lobby and multiplayer over the network
- There should be chat in a second tab of the console
- when a player ends a turn we need a big visual signal for the other player that it is their turn now
- We want some form of pinging the opponent on the board to signal various things in context (like a flag or a down pointing arrow)

PLACEMENT:
its actually both - placement and orientation on the grid. For example - in IRL play I would play a site to the bottom of a grid cell and a creature to the top of a grid cell, all of those cards would be oriented so I can read them. My opponent would play their cards so that they can read them (which is upside down from my perspective and expected - its very easy to track ownership of a card this way)
