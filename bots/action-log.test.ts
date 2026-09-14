import { describe, expect, it } from "vitest";
import { abilityLog, castLog, combatLog, endTurnLog, playLog } from "./action-log";

const size = {w:5,h:4};
const card = (name: string) => ({name});

describe("CPU event log lines", () => {
  it("names a site or unit played from hand with its tile", () => {
    expect(playLog({board:{sites:{"2,0":{owner:2,card:card("Arid Desert")}}}},"p2",size)).toBe("[p2:PLAYER] plays [p2card:Arid Desert] at Tile #3");
    expect(playLog({permanents:{"1,1":[{card:card("Ogre Goons")},{card:card("Pit Vipers")}]},zones:{p2:{}}},"p2",size)).toBe("[p2:PLAYER] plays [p2card:Pit Vipers] at Tile #7");
  });

  it("leaves moves, attacks and spells to their own lines", () => {
    expect(playLog({permanents:{"1,1":[{card:card("Ogre Goons")}]},_attackMeta:{toKey:"1,1"}},"p2",size)).toBeNull();
    expect(playLog({zones:{p2:{}},_spellCast:true},"p2",size)).toBeNull();
    expect(playLog({permanents:{"1,1":[{card:card("Ogre Goons")}]}},"p2",size)).toBeNull();
  });

  it("describes a move, or an attack on the opponent's unit, avatar or site", () => {
    const game = {avatars:{p1:{card:card("Flamecaller")}},permanents:{"2,2":[{card:card("Ogre Goons")}]},board:{sites:{"2,2":{owner:1,card:card("Lone Tower")}}}};
    const attacker = {card:card("Pit Vipers"),at:"2,2"};
    expect(combatLog(game,attacker,undefined,"p2",size)).toBe("[p2card:Pit Vipers] moves to Tile #13");
    expect(combatLog(game,attacker,{kind:"permanent",at:"2,2",index:0},"p2",size)).toBe("[p2card:Pit Vipers] attacks [p1card:Ogre Goons] at Tile #13");
    expect(combatLog(game,attacker,{kind:"avatar",at:"2,2",index:null},"p2",size)).toBe("[p2card:Pit Vipers] attacks [p1card:Flamecaller] at Tile #13");
    expect(combatLog(game,attacker,{kind:"site",at:"2,2",index:null},"p2",size)).toBe("[p2card:Pit Vipers] attacks [p1card:Lone Tower] at Tile #13");
  });

  it("marks up casts, abilities and the end of the turn", () => {
    expect(castLog("p2","Fireball")).toBe("[p2:PLAYER] casts [p2card:Fireball]");
    expect(abilityLog("p2","Vesuvius")).toBe("[p2:PLAYER] activates [p2card:Vesuvius]");
    expect(endTurnLog("p2")).toBe("[p2:PLAYER] ends the turn");
  });
});
