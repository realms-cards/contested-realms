Let us build a full featured, beautiful online game client to play the trading card game “Sorcery Contested Realm”.
Main functions we need to accomplish:

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
  Here is a link to the rules for sorcery:https://drive.google.com/file/d/1sgQo0xf0N2teIR0zlyl91g9j6LVncZnr/view
- The actual game UI should feature life counting, mana counting, threshold counting, a game board according to the rules, virtual dice, players hand shown on the bottom, opponents hand hidden on top
- Game UI should leverage a 3D engine to render the game board and the cards
- We can focus on sealed and draft mode where each deck has a minimum of 24 spellbook cards and 12 sites
- It would be great to be able to save and retrieve drafted decks

Fixes:

- Sites have a landscape layout and should be displayed rotated 90 degrees clockwise
