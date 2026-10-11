import type { DeckList } from '../engine/decks'
import { communityDecks } from './communityDecks'

// Two ready-to-play decks built entirely from engine-supported cards.

const baseDecks: DeckList[] = [
  {
    name: 'Earthfire Warband (Beginner)',
    avatar: 'Avatar of Earth',
    atlas: {
      'Humble Village': 4,
      'Rustic Village': 4,
      'Simple Village': 4,
      'Arid Desert': 4,
      'Red Desert': 4,
      'Remote Desert': 4,
      'Steppe': 3,
      'Holy Ground': 3,
    },
    spellbook: {
      'Cave Trolls': 4,
      'Sirocco Scorpions': 4,
      'Pit Vipers': 4,
      'Petrosian Cavalry': 4,
      'Sand Worm': 4,
      'Land Surveyor': 4,
      'Älvalinne Dryads': 4,
      'Mage Slayer': 3,
      'Belmotte Longbowmen': 4,
      'House Arn Bannerman': 3,
      'Shield Maidens': 3,
      'Monster Hunter': 3,
      'Wicked Witch': 2,
      'Wraetannis Titan': 1,
      'Death Dealer': 1,
      'Overpower': 4,
      'Minor Explosion': 4,
      'Divine Healing': 3,
      'Immolation': 1,
    },
  },
  {
    name: "Tidecaller's Grimoire (Beginner)",
    avatar: 'Sorcerer',
    atlas: {
      'Autumn River': 4,
      'Spring River': 4,
      'Summer River': 4,
      'Winter River': 4,
      'Dark Tower': 4,
      'Gothic Tower': 4,
      'Lone Tower': 4,
      'Lighthouse': 2,
    },
    spellbook: {
      'Apprentice Wizard': 4,
      'Plumed Pegasus': 4,
      'Spectral Stalker': 4,
      'Dead of Night Demon': 4,
      'Midnight Rogue': 3,
      'Cloud Spirit': 3,
      'Swan Maidens': 4,
      'Coral-Reef Kelpie': 4,
      'Porcupine Pufferfish': 4,
      'Muck Lampreys': 4,
      'Sea Serpent': 4,
      'Deep-Sea Mermaids': 4,
      'Grandmaster Wizard': 1,
      'Blink': 4,
      'Lightning Bolt': 4,
      'Rain of Arrows': 4,
      'Frost Nova': 1,
    },
  },
]

export const starterDecks: DeckList[] = [...baseDecks, ...communityDecks]
