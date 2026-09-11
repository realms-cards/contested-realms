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
    expect(pacing.delay("match","turn1",5100)).toBe(1500);
    pacing.pause();
    expect(pacing.delay("match","turn1",9000)).toBe(Infinity);
    pacing.ready("match",9000);
    expect(pacing.delay("match","turn1",9000)).toBe(2000);
    expect(pacing.delay("new","turn1",12000)).toBe(Infinity);
    pacing.ready("new",12000);
    expect(pacing.delay("new","turn1",12000)).toBe(5000);
  });
});
