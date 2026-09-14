import { describe, expect, it } from "vitest";
import { ActionPacing } from "./action-pacing";

describe("human-visible CPU pacing", () => {
  it("waits for board readiness, then gives five seconds before turn one", () => {
    const pacing = new ActionPacing();
    expect(pacing.delay("match","turn1",0)).toBe(Infinity);
    pacing.ready("match",1000);
    expect(pacing.delay("match","turn1",1000)).toBe(5000);
    pacing.ready("match",3000);
    expect(pacing.delay("match","turn1",6000)).toBe(0);
  });
  it("spaces actions, pauses when hidden, and resets for a new match", () => {
    const pacing = new ActionPacing();
    pacing.ready("match",0);
    pacing.delay("match","turn1",0);
    pacing.acted(5000);
    expect(pacing.delay("match","turn1",5100)).toBe(1900);
    pacing.pause();
    expect(pacing.delay("match","turn1",9000)).toBe(Infinity);
    pacing.ready("match",9000);
    expect(pacing.delay("match","turn1",9000)).toBe(1000);
    expect(pacing.delay("new","turn1",12000)).toBe(Infinity);
    pacing.ready("new",12000);
    expect(pacing.delay("new","turn1",12000)).toBe(5000);
  });
  it("holds every new action through a reveal pause and resumes one short beat after it ends", () => {
    const pacing = new ActionPacing();
    pacing.ready("match",0);
    pacing.delay("match","turn1",0);
    pacing.acted(6000);
    // The reveal of that action pauses the bot well before its normal spacing is over.
    pacing.pause();
    expect(pacing.delay("match","turn1",8000)).toBe(Infinity);
    expect(pacing.delay("match","turn1",10000)).toBe(Infinity);
    // Periodic ready reports while still paused change nothing; the queue emptying resumes.
    pacing.ready("match",10000);
    expect(pacing.delay("match","turn1",10000)).toBe(1000);
    // Repeated visible reports do not push the next action further out.
    pacing.ready("match",10500);
    expect(pacing.delay("match","turn1",10500)).toBe(500);
    // A reveal ending before the normal spacing keeps that spacing.
    pacing.acted(20000);
    pacing.pause();
    pacing.ready("match",20500);
    expect(pacing.delay("match","turn1",20500)).toBe(1500);
  });
  it("gives a resolved effect its own beat before the next action", () => {
    const pacing = new ActionPacing();
    pacing.ready("match",0);
    pacing.delay("match","turn1",0);
    pacing.acted(6000);
    pacing.settled(7000);
    expect(pacing.delay("match","turn1",7000)).toBe(1800);
  });
});
