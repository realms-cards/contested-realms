import { describe, expect, it } from "vitest";
import { goldfishCoverage, readGoldfishDeck, saveGoldfishDeck } from "./goldfishTesting";

describe("Goldfish deck testing", () => {
  it("counts copies without treating known precon cards as fully automated", () => {
    expect(goldfishCoverage({spellbook:[
      {cardId:1,name:"Fireball",type:"Magic"},{cardId:1,name:"Fireball",type:"Magic"},
      {cardId:2,name:"Flamecaller",type:"Avatar"},{cardId:3,name:"Unverified spell",type:"Magic"},
    ]})).toEqual([
      {name:"Fireball",count:2,level:"automated"},
      {name:"Flamecaller",count:1,level:"partial"},
      {name:"Unverified spell",count:1,level:"manual"},
    ]);
  });
  it("keeps an independent original list scoped to the player", () => {
    const data = new Map<string,string>();
    const storage = {getItem:(key: string) => data.get(key) || null,setItem:(key: string,value: string) => {data.set(key,value);}};
    const snapshot = {name:"My test",deck:{spellbook:[{cardId:1,name:"Fireball",type:"Magic"}],atlas:[]}};
    expect(saveGoldfishDeck(storage,"alice",snapshot)).toBe(true);
    snapshot.deck.spellbook.length = 0;
    expect(readGoldfishDeck(storage,"alice")?.deck.spellbook).toHaveLength(1);
    expect(readGoldfishDeck(storage,"bob")).toBeNull();
  });
  it("handles unavailable storage and corrupt snapshots without blocking play", () => {
    expect(readGoldfishDeck({getItem:() => "bad json"},"alice")).toBeNull();
    expect(readGoldfishDeck({getItem:() => JSON.stringify({name:"Bad",deck:{spellbook:[null]}})},"alice")).toBeNull();
    expect(saveGoldfishDeck({setItem:() => {throw new Error("blocked");}},"alice",{name:"Deck",deck:{}})).toBe(false);
  });
});
