import { describe, expect, it } from "vitest";
import { compute } from "./calc";
import type { Pre, Result } from "./types";

const base = (over: Partial<Pre["plan"]>, direction: "long" | "short" | ""): Pre => ({
  basic: { symbol: "", market: "", direction, timeframe: "", style: "", entryTime: null },
  plan: { entry: null, stop: null, targets: [], size: null, leverage: null, balance: null, ...over },
  thesis: { summary: "", invalidation: "" },
  technical: [], fundamental: [], signals: [],
  mind: { confidence: null, mood: "", onPlan: null, checklist: [] },
});
const res = (exitPrice: number): Result => ({ exitPrice, exitTime: null, exitReason: "", mistakes: [], executionScore: null, lesson: "" });

describe("compute", () => {
  it("matches the Go implementation for a long", () => {
    const c = compute(base({ entry: 100, stop: 95, targets: [110, 120], size: 2, balance: 1000 }, "long"), res(110));
    expect(c.riskPerUnit).toBe(5);
    expect(c.riskAmount).toBe(10);
    expect(c.riskPct).toBe(1);
    expect(c.targets.map((t) => t.rr)).toEqual([2, 4]);
    expect(c.realizedR).toBe(2);
    expect(c.pnl).toBe(20);
    expect(c.warnings).toEqual([]);
  });
  it("flips signs for a short and warns on a wrong-side stop", () => {
    const c = compute(base({ entry: 100, stop: 95, targets: [90], size: 1 }, "short"), res(105));
    expect(c.warnings).toContain("stop_wrong_side");
    expect(c.targets[0].rr).toBe(2);
    expect(c.realizedR).toBe(-1);
    expect(c.pnl).toBe(-5);
  });
  it("leaves empty inputs empty without failing", () => {
    const c = compute(base({}, ""));
    expect(c.riskPerUnit).toBeNull();
    expect(c.realizedR).toBeNull();
    expect(c.warnings).toEqual([]);
  });
});
