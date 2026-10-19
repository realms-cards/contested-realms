// The 12 official preconstructed decks (Alpha, Beta, Gothic — four each), as published by the official
// SorceryTCG account on sorcerytcg.com (each entry's `source`). Generated 2026-10-18 through the same
// sorceryToDeck importer the deck-link import uses. Precon mode: each player picks one of these, unedited —
// they are 53-card decks (avatar + 36 spells + 16 sites), so they bypass the constructed size minimums.
import type { DeckList } from '../engine/decks'

export type PreconSet = 'Alpha' | 'Beta' | 'Gothic'
export interface PreconDeck extends DeckList { id: string; set: PreconSet; source: string }

export const PRECONS: PreconDeck[] = [
  {
    "id": "precon:alpha-air",
    "name": "Alpha precon — Air (Avatar of Air)",
    "set": "Alpha",
    "source": "https://sorcerytcg.com/decks/clso3l1mg001q2w08qv1nexky",
    "avatar": "Avatar of Air",
    "spellbook": {
      "Sling Pixies": 1,
      "Snow Leopard": 2,
      "Blink": 2,
      "Chain Lightning": 2,
      "Cloud Spirit": 2,
      "Dead of Night Demon": 2,
      "Lightning Bolt": 3,
      "Spectral Stalker": 2,
      "Apprentice Wizard": 2,
      "Devil's Egg": 1,
      "Headless Haunt": 2,
      "Kite Archer": 1,
      "Midnight Rogue": 1,
      "Peregrine Apparition": 1,
      "Plumed Pegasus": 2,
      "Spire Lich": 1,
      "Waypoint Portal": 1,
      "Doomsday Device": 1,
      "Gyre Hippogriffs": 1,
      "Skirmishers of Mu": 1,
      "Thunderstorm": 1,
      "Roaming Monster": 1,
      "Grandmaster Wizard": 1,
      "Nimbus Jinn": 1,
      "Nightmare": 1
    },
    "atlas": {
      "Bottomless Pit": 1,
      "Cloud City": 1,
      "Dark Tower": 3,
      "Gothic Tower": 3,
      "Lone Tower": 3,
      "Mountain Pass": 2,
      "Observatory": 1,
      "Updraft Ridge": 2
    },
    "art": {
      "Avatar of Air": "001-avatar_of_air-pd-s"
    }
  },
  {
    "id": "precon:alpha-earth",
    "name": "Alpha precon — Earth (Avatar of Earth)",
    "set": "Alpha",
    "source": "https://sorcerytcg.com/decks/clso3lngx007lhb600v843gd7",
    "avatar": "Avatar of Earth",
    "spellbook": {
      "Overpower": 2,
      "Wild Boars": 2,
      "Frontier Settlers": 1,
      "Land Surveyor": 2,
      "Scent Hounds": 1,
      "Autumn Unicorn": 2,
      "Belmotte Longbowmen": 3,
      "Bury": 2,
      "Cave Trolls": 3,
      "Screaming Skull": 1,
      "Siege Ballista": 1,
      "Entangle Terrain": 1,
      "House Arn Bannerman": 2,
      "Pudge Butcher": 2,
      "Amazon Warriors": 2,
      "Earthquake": 1,
      "Queen of Midland": 1,
      "Spear of Destiny": 1,
      "Stone-gaze Gorgons": 1,
      "King of the Realm": 1,
      "Wraetannis Titan": 1,
      "Craterize": 1,
      "Midland Army": 1,
      "Mountain Giant": 1
    },
    "atlas": {
      "Holy Ground": 2,
      "Humble Village": 3,
      "Quagmire": 2,
      "Rustic Village": 3,
      "Simple Village": 3,
      "Vantage Hills": 3
    },
    "art": {
      "Avatar of Earth": "001-avatar_of_earth-pd-s"
    }
  },
  {
    "id": "precon:alpha-fire",
    "name": "Alpha precon — Fire (Avatar of Fire)",
    "set": "Alpha",
    "source": "https://sorcerytcg.com/decks/clso3l8ph005ihb60cxkus6mh",
    "avatar": "Avatar of Fire",
    "spellbook": {
      "Pit Vipers": 2,
      "Raal Dromedary": 2,
      "Wills-o'-the-Wisp": 1,
      "Firebolts": 1,
      "Rimland Nomads": 2,
      "Sacred Scarabs": 2,
      "Wayfaring Pilgrim": 2,
      "Blaze": 1,
      "Colicky Dragonettes": 1,
      "Heat Ray": 1,
      "Minor Explosion": 2,
      "Ogre Goons": 2,
      "Quarrelsome Kobolds": 1,
      "Clamor of Harpies": 2,
      "Fireball": 2,
      "Hillock Basilisk": 1,
      "Petrosian Cavalry": 1,
      "Sand Worm": 2,
      "Wildfire": 1,
      "Bull Demons of Adum": 1,
      "Doomsday Prophet": 1,
      "Drums of Doom": 1,
      "Incinerate": 1,
      "Infernal Legion": 1,
      "Ancient Dragon": 1,
      "Major Explosion": 1
    },
    "atlas": {
      "Arid Desert": 3,
      "Cornerstone": 1,
      "Red Desert": 3,
      "Remote Desert": 3,
      "River of Flame": 1,
      "Shifting Sands": 3,
      "Standing Stones": 1,
      "Vesuvius": 1
    },
    "art": {
      "Avatar of Fire": "001-avatar_of_fire-pd-s"
    }
  },
  {
    "id": "precon:alpha-water",
    "name": "Alpha precon — Water (Avatar of Water)",
    "set": "Alpha",
    "source": "https://sorcerytcg.com/decks/clso3lffd006jhb60hiwpltyc",
    "avatar": "Avatar of Water",
    "spellbook": {
      "Dodge Roll": 2,
      "Sedge Crabs": 1,
      "Swamp Buffalo": 2,
      "Marine Voyage": 1,
      "Polar Bears": 2,
      "Riptide": 1,
      "Swan Maidens": 1,
      "Tide Naiads": 2,
      "Brobdingnag Bullfrog": 2,
      "Coral-Reef Kelpie": 2,
      "Deep-Sea Mermaids": 2,
      "Drown": 2,
      "Guile Sirens": 1,
      "Ice Lance": 2,
      "Megamoeba": 1,
      "Sunken Treasure": 1,
      "Flood": 1,
      "Frost Nova": 1,
      "Pirate Ship": 1,
      "Sea Serpent": 2,
      "Upwelling": 1,
      "Anui Undine": 1,
      "Unland Angler": 1,
      "Mother Nature": 1,
      "Wrath of the Sea": 1,
      "Diluvian Kraken": 1
    },
    "atlas": {
      "Autumn River": 3,
      "Floodplain": 2,
      "Island Leviathan": 1,
      "Maelström": 1,
      "Spring River": 3,
      "Summer River": 3,
      "Tadpole Pool": 1,
      "Undertow": 2
    },
    "art": {
      "Avatar of Water": "001-avatar_of_water-pd-s"
    }
  },
  {
    "id": "precon:beta-air",
    "name": "Beta precon — Air (Sparkmage)",
    "set": "Beta",
    "source": "https://sorcerytcg.com/decks/clczbmbxb008av5ugml35rdwt",
    "avatar": "Sparkmage",
    "spellbook": {
      "Lucky Charm": 1,
      "Sling Pixies": 1,
      "Snow Leopard": 2,
      "Blink": 2,
      "Chain Lightning": 2,
      "Cloud Spirit": 2,
      "Dead of Night Demon": 2,
      "Lightning Bolt": 3,
      "Spectral Stalker": 2,
      "Teleport": 1,
      "Apprentice Wizard": 2,
      "Headless Haunt": 2,
      "Kite Archer": 1,
      "Midnight Rogue": 2,
      "Plumed Pegasus": 2,
      "Spire Lich": 1,
      "Gyre Hippogriffs": 1,
      "Raise Dead": 1,
      "Skirmishers of Mu": 1,
      "Thunderstorm": 1,
      "Roaming Monster": 1,
      "Grandmaster Wizard": 1,
      "Nimbus Jinn": 1,
      "Highland Clansmen": 1
    },
    "atlas": {
      "Cloud City": 1,
      "Dark Tower": 3,
      "Gothic Tower": 3,
      "Lone Tower": 3,
      "Mountain Pass": 2,
      "Observatory": 1,
      "Planar Gate": 1,
      "Updraft Ridge": 2
    }
  },
  {
    "id": "precon:beta-earth",
    "name": "Beta precon — Earth (Geomancer)",
    "set": "Beta",
    "source": "https://sorcerytcg.com/decks/clczbmbxb008hv5uggpws66fe",
    "avatar": "Geomancer",
    "spellbook": {
      "Divine Healing": 1,
      "Overpower": 2,
      "Wild Boars": 2,
      "Land Surveyor": 2,
      "Scent Hounds": 2,
      "Autumn Unicorn": 2,
      "Belmotte Longbowmen": 3,
      "Border Militia": 1,
      "Bury": 2,
      "Cave Trolls": 3,
      "Siege Ballista": 1,
      "Slumbering Giantess": 1,
      "Cave-In": 1,
      "Dalcean Phalanx": 1,
      "Entangle Terrain": 1,
      "House Arn Bannerman": 2,
      "Pudge Butcher": 1,
      "Rolling Boulder": 1,
      "Amazon Warriors": 2,
      "Payload Trebuchet": 1,
      "King of the Realm": 1,
      "Wraetannis Titan": 1,
      "Craterize": 1,
      "Mountain Giant": 1
    },
    "atlas": {
      "Bedrock": 1,
      "Holy Ground": 1,
      "Humble Village": 3,
      "Quagmire": 2,
      "Rustic Village": 3,
      "Simple Village": 3,
      "Sinkhole": 1,
      "Vantage Hills": 2
    }
  },
  {
    "id": "precon:beta-fire",
    "name": "Beta precon — Fire (Flamecaller)",
    "set": "Beta",
    "source": "https://sorcerytcg.com/decks/clczbmbxb0085v5ug7eyxn2dk",
    "avatar": "Flamecaller",
    "spellbook": {
      "Pit Vipers": 2,
      "Raal Dromedary": 2,
      "Firebolts": 2,
      "Lava Salamander": 1,
      "Mad Dash": 1,
      "Rimland Nomads": 2,
      "Sacred Scarabs": 2,
      "Wayfaring Pilgrim": 2,
      "Blaze": 1,
      "Colicky Dragonettes": 1,
      "Heat Ray": 1,
      "Minor Explosion": 2,
      "Ogre Goons": 3,
      "Quarrelsome Kobolds": 1,
      "Clamor of Harpies": 1,
      "Fireball": 1,
      "Hillock Basilisk": 1,
      "Petrosian Cavalry": 1,
      "Sand Worm": 2,
      "Wildfire": 1,
      "Askelon Phoenix": 1,
      "Incinerate": 1,
      "Cone of Flame": 1,
      "Escyllion Cyclops": 1,
      "Infernal Legion": 1,
      "Major Explosion": 1
    },
    "atlas": {
      "Arid Desert": 4,
      "Cornerstone": 1,
      "Red Desert": 4,
      "Remote Desert": 4,
      "Shifting Sands": 2,
      "Vesuvius": 1
    }
  },
  {
    "id": "precon:beta-water",
    "name": "Beta precon — Water (Waveshaper)",
    "set": "Beta",
    "source": "https://sorcerytcg.com/decks/clczbmbxb008ev5ugiovmxcw1",
    "avatar": "Waveshaper",
    "spellbook": {
      "Porcupine Pufferfish": 1,
      "Sedge Crabs": 1,
      "Swamp Buffalo": 2,
      "Polar Bears": 2,
      "Riptide": 2,
      "Swan Maidens": 1,
      "Tide Naiads": 2,
      "Brobdingnag Bullfrog": 1,
      "Coral-Reef Kelpie": 2,
      "Deep-Sea Mermaids": 2,
      "Drown": 2,
      "Font of Life": 1,
      "Guile Sirens": 1,
      "Ice Lance": 2,
      "Mariner's Curse": 1,
      "Sunken Treasure": 1,
      "Tufted Turtles": 1,
      "Flood": 1,
      "Pirate Ship": 2,
      "Sea Serpent": 2,
      "Stormy Seas": 1,
      "Anui Undine": 2,
      "Seirawan Hydra": 1,
      "Wrath of the Sea": 1,
      "Diluvian Kraken": 1
    },
    "atlas": {
      "Autumn River": 3,
      "Floodplain": 2,
      "Island Leviathan": 1,
      "Maelström": 1,
      "Spring River": 3,
      "Summer River": 3,
      "Undertow": 3
    }
  },
  {
    "id": "precon:gothic-necromancer",
    "name": "Gothic precon — Necromancer",
    "set": "Gothic",
    "source": "https://sorcerytcg.com/decks/cmip2vh9y00kal204778yzvbd",
    "avatar": "Necromancer",
    "spellbook": {
      "Bone Jumble": 1,
      "Bone Spear": 3,
      "Detonate": 1,
      "Fowl Bones": 2,
      "Bitter Departed": 1,
      "Ignited": 2,
      "Novice Necromancer": 2,
      "Noxious Corpse": 1,
      "Carrionette": 1,
      "Khamaseen Mummy": 1,
      "Kiss of Death": 2,
      "Order of the Pale Worm": 1,
      "Panpipes of Pnom": 1,
      "Screamer": 3,
      "Snallygaster": 2,
      "Stygian Archers": 1,
      "Witching Hour": 1,
      "Hotwheel": 2,
      "Corpse Catapult": 1,
      "Dreadwing": 1,
      "Master Necromancer": 1,
      "Necronomiconcert": 1,
      "Vesper Swarm": 1,
      "Those Who Linger": 1,
      "Draconian Bonekite": 1,
      "Stitched Abomination": 1
    },
    "atlas": {
      "Accursed Desert": 1,
      "Accursed Tower": 1,
      "Darkest Dungeon": 1,
      "Den of Evil": 1,
      "Desert Bloom": 1,
      "Dread Thicket": 1,
      "Forsaken Crypt": 1,
      "Open Mausoleum": 2,
      "Sold-out Cemetery": 1,
      "Spire": 2,
      "Twilight Bloom": 1,
      "Vast Desert": 1,
      "Wasteland": 2
    },
    "collection": {
      "Ghoul": 2
    },
    "art": {
      "Necromancer": "006-necromancer-pd-s"
    }
  },
  {
    "id": "precon:gothic-harbinger",
    "name": "Gothic precon — Harbinger",
    "set": "Gothic",
    "source": "https://sorcerytcg.com/decks/cmip2w8qa002mjl04intv339z",
    "avatar": "Harbinger",
    "spellbook": {
      "Aaj-kegon Ghost Crabs": 1,
      "Forsaken": 2,
      "Gift of the Frog": 2,
      "Sea Witch": 2,
      "Static Servant": 1,
      "Willing Tribute": 2,
      "Ice Shards": 2,
      "Mesmer Demon": 2,
      "Monstermorphosis": 1,
      "Nommo Monitor": 2,
      "Swap": 1,
      "Abyssal Assault": 1,
      "Bound Spirit": 2,
      "Falling Star": 1,
      "Into the Abyss": 1,
      "Frozen Horror": 1,
      "Lacuna Entity": 1,
      "Regurgitator": 1,
      "Slimy Mutants": 1,
      "Call of the Sea": 1,
      "Gnarled Wendigo": 1,
      "Hearkening Kraken": 1,
      "Shoggoth": 2,
      "Dormant Monstrosity": 1,
      "Ten-tonne Slug": 2,
      "Yog-Sothoth": 1
    },
    "atlas": {
      "Accursed Tower": 1,
      "Algae Bloom": 1,
      "Croaking Swamp": 2,
      "Dark Alley": 1,
      "Deep Sea": 1,
      "Den of Evil": 1,
      "Elder Ruins": 1,
      "Peculiar Port": 1,
      "Spire": 2,
      "Stinging Kelp": 2,
      "Stream": 2,
      "Twilight Bloom": 1
    },
    "collection": {
      "Horrible Hybrids": 1,
      "Shoggoth": 2
    },
    "art": {
      "Harbinger": "006-harbinger-pd-s",
      "Swap": "999-swap-op-s"
    }
  },
  {
    "id": "precon:gothic-persecutor",
    "name": "Gothic precon — Persecutor",
    "set": "Gothic",
    "source": "https://sorcerytcg.com/decks/cmip2vwc100khl2043cgtpae7",
    "avatar": "Persecutor",
    "spellbook": {
      "Bind Evil": 2,
      "One-shot Wizard": 1,
      "Flagellant": 1,
      "Flaming Skull": 1,
      "Holy Warrior": 2,
      "Holy Water": 1,
      "Kissers of Wounds": 1,
      "Lesser Blood Demon": 2,
      "Redmane Hyena": 1,
      "Wild Fanatic": 2,
      "Blade of Thorns": 1,
      "Blaze of Glory": 1,
      "Flame Strike": 2,
      "Intrepid Hero": 1,
      "Lash": 1,
      "Martyrs of Tomorrow": 1,
      "Màzuj Ifrit": 1,
      "Peacemaker Arbalest": 1,
      "Trial by Fire": 2,
      "Angry Mob": 1,
      "Fallen Angel": 1,
      "Flayer": 1,
      "Greater Blood Demon": 1,
      "Shackled Demon": 1,
      "Wreathed in Righteousness": 1,
      "Zeppelin of Zealots": 2,
      "Cherubim": 1,
      "Undesirables": 1,
      "Release the Hounds": 1
    },
    "atlas": {
      "Active Volcano": 1,
      "Autumn Bloom": 1,
      "Blessed Village": 1,
      "Consecrated Ground": 1,
      "Desert Bloom": 2,
      "Hillside Chapel": 1,
      "Molten Maar": 1,
      "Purgatory": 1,
      "Road to Perdition": 1,
      "Valley": 2,
      "Vast Desert": 2,
      "Wasteland": 2
    },
    "collection": {
      "Hellhounds": 3
    },
    "art": {
      "Persecutor": "006-persecutor-pd-s"
    }
  },
  {
    "id": "precon:gothic-savior",
    "name": "Gothic precon — Savior",
    "set": "Gothic",
    "source": "https://sorcerytcg.com/decks/cmip2v28500k6l204a5bxo5oh",
    "avatar": "Savior",
    "spellbook": {
      "Eltham Townsfolk": 1,
      "Revered Revenant": 2,
      "Serava Townsfolk": 1,
      "Town Priest": 1,
      "Angel Ascendant": 1,
      "Enduring Faith": 1,
      "Flame of the First Ones": 1,
      "Muddy Pigs": 2,
      "Survivors of Serava": 2,
      "Virgin in Prayer": 2,
      "Wave of Eviction": 1,
      "Baptize": 1,
      "Divine Lance": 1,
      "Makeshift Barricade": 1,
      "Mayor of Milborne": 1,
      "Nightwatchmen": 1,
      "Order of the White Wing": 1,
      "Rowdy Boys": 1,
      "Search Party": 3,
      "Guardian Angel": 1,
      "Holy Nova": 1,
      "Monks of Kobalsa": 2,
      "Smite": 2,
      "Weathered Trunks": 2,
      "Faith Incarnate": 1,
      "Malakhim": 1,
      "Golden Dawn": 1
    },
    "atlas": {
      "Algae Bloom": 1,
      "Autumn Bloom": 2,
      "Blessed Village": 2,
      "Blessed Well": 1,
      "Consecrated Ground": 1,
      "Fertile Earth": 1,
      "Forlorn Keep": 1,
      "Mudslide": 1,
      "Stream": 2,
      "Troubled Town": 2,
      "Valley": 2
    },
    "collection": {
      "Eltham Townsfolk": 1,
      "Serava Townsfolk": 1,
      "Penitent Knight": 1
    },
    "art": {
      "Savior": "006-savior-pd-s"
    }
  }
]

const sameCounts = (a: Record<string, number> | undefined, b: Record<string, number> | undefined): boolean => {
  const pa = Object.entries(a ?? {}).filter(([, n]) => n > 0)
  const pb = Object.entries(b ?? {}).filter(([, n]) => n > 0)
  return pa.length === pb.length && pa.every(([k, n]) => (b ?? {})[k] === n)
}

/** the precon this deck IS — same avatar and exactly the same spellbook, atlas and collection (name, id
 *  and alternate art are ignored) — or null. Precon rooms accept only a deck that matches one. */
export function matchPrecon(deck: Pick<DeckList, 'avatar' | 'spellbook' | 'atlas' | 'collection'> | null | undefined): PreconDeck | null {
  if (!deck) return null
  return PRECONS.find((p) => p.avatar === deck.avatar && sameCounts(p.spellbook, deck.spellbook)
    && sameCounts(p.atlas, deck.atlas) && sameCounts(p.collection, deck.collection)) ?? null
}
