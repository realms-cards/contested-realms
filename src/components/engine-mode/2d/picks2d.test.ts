import { describe, expect, it } from "vitest";
import type { AvatarState, CardRef, PermanentItem } from "@/lib/game/store/types";
import { ARROW_MIN, areaAnchorPoints, areaHitSize, areaTap, arrowBox, arrowSize, cellBox, crowdedTiles, inspectorItems, popoverPlacement, tileNumber, unitCandidatesByTile } from "./picks2d";

const card = (name: string, type = "Minion"): CardRef => ({cardId:1,name,type,slug:null});
const perm = (name: string, owner: 1 | 2, instanceId: string | null, extra: Partial<PermanentItem> = {}): PermanentItem => ({card:card(name),owner,instanceId,...extra});
const avatar = (name: string, pos: [number, number] | null): AvatarState => ({card:card(name,"Avatar"),pos});

const overlaps = (a: {left: number; top: number; width: number; height: number}, b: typeof a) =>
  a.left < b.left+b.width && b.left < a.left+a.width && a.top < b.top+b.height && b.top < a.top+a.height;

describe("2D picks geometry", () => {
  it("maps cells to board pixels and log tile numbers", () => {
    expect(cellBox("2,3",{w:74,h:74})).toEqual({left:148,top:222,width:74,height:74});
    expect(tileNumber("0,0")).toBe(1);
    expect(tileNumber("2,3")).toBe(18);
    expect(tileNumber("4,3")).toBe(20);
  });

  it("follows a stretched tile: x by its width, y by its height", () => {
    const tile = {w:100,h:60};
    expect(cellBox("2,3",tile)).toEqual({left:200,top:180,width:100,height:60});
    expect(areaAnchorPoints({"1,1":["1,1","2,1","1,2","2,2"]},tile)[0]).toEqual({token:"1,1",x:200,y:120});
    expect(popoverPlacement("4,0",tile)).toEqual({left:500,top:60,alignX:"end",below:true});
    const boxes = (["N","E","S","W"] as const).map(dir => arrowBox("2,1",dir,tile));
    for (let i = 0; i < boxes.length; i++) for (let j = i+1; j < boxes.length; j++) expect(overlaps(boxes[i],boxes[j])).toBe(false);
    expect(boxes[0].left+boxes[0].width/2).toBe(250);
    expect(boxes[3].top+boxes[3].height/2).toBe(90);
  });

  it("keeps arrows at least a touch target and the four arrows of a phone tile apart", () => {
    expect(arrowSize(40)).toBe(ARROW_MIN);
    expect(arrowSize(200)).toBe(44);
    for (const tile of [68,74,82,96]) {
      const boxes = (["N","E","S","W"] as const).map(dir => arrowBox("2,1",dir,{w:tile,h:tile}));
      for (const box of boxes) expect(box.width).toBeGreaterThanOrEqual(ARROW_MIN);
      for (let i = 0; i < boxes.length; i++) for (let j = i+1; j < boxes.length; j++) expect(overlaps(boxes[i],boxes[j])).toBe(false);
    }
  });

  it("straddles the edge an arrow points through, and stays on the board at the rim", () => {
    const tile = 74, size = arrowSize(tile), sq = {w:tile,h:tile};
    const north = arrowBox("2,1","N",sq);
    expect(north.top).toBeLessThan(tile);
    expect(north.top+size).toBeGreaterThan(tile);
    expect(north.left+size/2).toBe(2.5*tile);
    const rim = arrowBox("0,0","W",sq);
    expect(rim.left).toBe(0);
    const rimNorth = arrowBox("4,0","N",sq);
    expect(rimNorth.top).toBe(0);
    const rimSouth = arrowBox("4,3","E",sq);
    expect(rimSouth.left).toBe(5*tile-size);
  });

  it("puts an area marker on the centre of its squares: the crossing of a 2x2", () => {
    const [point] = areaAnchorPoints({"1,1":["1,1","2,1","1,2","2,2"]},{w:50,h:50});
    expect(point).toEqual({token:"1,1",x:100,y:100});
    const [cross] = areaAnchorPoints({"2,1":["2,0","1,1","2,1","3,1","2,2"]},{w:50,h:50});
    expect(cross).toEqual({token:"2,1",x:125,y:75});
    expect(areaHitSize({w:74,h:74})).toBe(59);
    expect(areaHitSize({w:40,h:40})).toBe(40);
    // a stretched tile: the hit box follows its smaller edge
    expect(areaHitSize({w:120,h:74})).toBe(59);
  });

  it("previews an area on a finger's first tap and places it on the second; a mouse places on click", () => {
    expect(areaTap("1,1",null,"touch")).toBe("preview");
    expect(areaTap("1,1","2,1","touch")).toBe("preview");
    expect(areaTap("1,1","1,1","touch")).toBe("select");
    expect(areaTap("1,1",null,"mouse")).toBe("select");
  });

  it("keeps option popovers on the board: below on the top row, flush on the side columns", () => {
    expect(popoverPlacement("2,2",{w:80,h:80})).toEqual({left:200,top:160,alignX:"center",below:false});
    expect(popoverPlacement("0,0",{w:80,h:80})).toEqual({left:0,top:80,alignX:"start",below:true});
    expect(popoverPlacement("4,3",{w:80,h:80})).toEqual({left:400,top:240,alignX:"end",below:false});
  });
});


describe("2D picks: crowded tiles and the inspector", () => {
  const permanents = {
    "2,3":[perm("Pudge Butcher",1,"a"),perm("Kite Archer",2,"b",{tapped:true}),perm("Sacred Scarabs",1,null,{attachedTo:{at:"2,3",index:0}})],
    "1,1":[perm("Wayfaring Pilgrim",2,null,{faded:true})],
  };
  const avatars = {p1:avatar("Sorcerer",[2,3]),p2:avatar("Spellslinger",[4,0])};

  it("groups clickable unit tokens per tile in drawing order, avatars first", () => {
    const byTile = unitCandidatesByTile({tiles:["unit:perm:b","unit:avatar:p1","unit:slot:1,1:0","unit:avatar:p2","2,3"]},permanents,avatars);
    expect(Object.fromEntries(byTile)).toEqual({"2,3":["unit:avatar:p1","unit:perm:b"],"1,1":["unit:slot:1,1:0"],"4,0":["unit:avatar:p2"]});
    expect(unitCandidatesByTile({tiles:["2,3","hand:p1:x"]},permanents,avatars).size).toBe(0);
  });

  it("sends only tiles with two or more candidates to the inspector, and only on small tiles", () => {
    const byTile = new Map([["2,3",["unit:avatar:p1","unit:perm:b"]],["1,1",["unit:slot:1,1:0"]]]);
    expect(crowdedTiles(byTile,{w:74,h:74})).toEqual(["2,3"]);
    expect(crowdedTiles(byTile,{w:88,h:88})).toEqual([]);
  });

  it("resolves tokens to their cards with seat, tapped and layer notes", () => {
    expect(inspectorItems("2,3",["unit:avatar:p1","unit:perm:b","unit:perm:gone"],permanents,avatars).map(({token,card:{name},seat,avatar:isAvatar,tapped,faded}) => ({token,name,seat,isAvatar,tapped,faded}))).toEqual([
      {token:"unit:avatar:p1",name:"Sorcerer",seat:"p1",isAvatar:true,tapped:false,faded:false},
      {token:"unit:perm:b",name:"Kite Archer",seat:"p2",isAvatar:false,tapped:true,faded:false},
    ]);
    expect(inspectorItems("1,1",["unit:slot:1,1:0"],permanents,avatars)).toMatchObject([{token:"unit:slot:1,1:0",seat:"p2",faded:true}]);
  });
});
