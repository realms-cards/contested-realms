import { describe, expect, it } from "vitest";
import { fieldTargets, type FieldPickerState } from "@/lib/game/cpu/fieldTargets";

const state = (overrides: Partial<FieldPickerState>): FieldPickerState => ({tiles:[],glow:[],sources:[],selected:null,labels:{},...overrides});

describe("fieldTargets", () => {
  it("keeps only tile tokens for highlights, ranking candidates over targets over sources", () => {
    const {tiles} = fieldTargets(state({
      tiles:["1,1","2,2","unit:perm:a","hand:p1:x","dir:2,3:N"],
      glow:["2,2","3,3","unit:avatar:p2","opt:1,0:skip"],
      sources:["3,3","4,0","unit:perm:b","pile:p1:atlas"],
      selected:"2,2",
    }));
    expect(Object.fromEntries(tiles)).toEqual({"1,1":"candidate","2,2":"selected","3,3":"target","4,0":"source"});
  });

  it("builds one arrow per direction token, clickable only when offered", () => {
    const {arrows} = fieldTargets(state({tiles:["dir:2,3:N","dir:2,3:E","dir:2,3:X","dir:bad:S"],glow:["dir:2,3:W","dir:2,3:N"],selected:"dir:2,3:E"}));
    expect(arrows).toEqual([
      {token:"dir:2,3:N",at:"2,3",dir:"N",tone:"candidate",clickable:true},
      {token:"dir:2,3:E",at:"2,3",dir:"E",tone:"selected",clickable:true},
      {token:"dir:2,3:W",at:"2,3",dir:"W",tone:"target",clickable:false},
    ]);
  });

  it("groups option buttons per tile with labels, pressed state and a single gold commit", () => {
    const {rows} = fieldTargets(state({
      tiles:["opt:1,2:summon","opt:1,2:skip","opt:3,0:surface","opt:3,0:underground"],
      glow:["opt:3,0:underground"],
      labels:{"opt:1,2:summon":"Summon Foot Soldier (1)","opt:1,2:skip":"Skip","opt:3,0:surface":"Surface"},
    }));
    expect(rows).toEqual([
      {at:"1,2",options:[
        {token:"opt:1,2:summon",id:"summon",label:"Summon Foot Soldier (1)",pressed:false,clickable:true,variant:"commit"},
        {token:"opt:1,2:skip",id:"skip",label:"Skip",pressed:false,clickable:true,variant:"outline"},
      ]},
      {at:"3,0",options:[
        {token:"opt:3,0:surface",id:"surface",label:"Surface",pressed:false,clickable:true,variant:"quiet"},
        {token:"opt:3,0:underground",id:"underground",label:"underground",pressed:true,clickable:true,variant:"quiet"},
      ]},
    ]);
  });

  it("uses no gold when several tiles each offer an affirmative action", () => {
    const {rows} = fieldTargets(state({tiles:["opt:0,0:fight","opt:0,0:decline","opt:4,0:fight","opt:4,0:decline"],labels:{"opt:0,0:fight":"Fight","opt:4,0:fight":"Fight"}}));
    expect(rows.flatMap(row => row.options.map(option => option.variant))).toEqual(["quiet","outline","quiet","outline"]);
  });
});
