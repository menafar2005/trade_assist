import type { Calc, Pre, Result } from "./types";

const sign = (d: string) => (d === "long" ? 1 : d === "short" ? -1 : 0);
const fin = (n: number) => (Number.isFinite(n) ? n : null);

/** Mirrors internal/model/calc.go so the form can show results instantly; the server stays authoritative. */
export function compute(pre: Pre, result?: Result): Calc {
  const c: Calc = { riskPerUnit: null, riskAmount: null, riskPct: null, targets: [], realizedR: null, pnl: null, warnings: [] };
  const { entry, stop, targets, size, balance } = pre.plan;
  const s = sign(pre.basic.direction);
  let risk = 0;
  if (entry != null && stop != null) {
    risk = Math.abs(entry - stop);
    if (risk > 0) c.riskPerUnit = risk;
    if (s !== 0 && (stop - entry) * s > 0) c.warnings.push("stop_wrong_side");
  }
  if (c.riskPerUnit != null && size != null) {
    c.riskAmount = fin(risk * size);
    if (c.riskAmount != null && balance != null && balance > 0) c.riskPct = fin((c.riskAmount / balance) * 100);
  }
  let wrongTarget = false;
  for (const price of targets) {
    let rr: number | null = null;
    if (entry != null && s !== 0 && c.riskPerUnit != null) {
      const reward = (price - entry) * s;
      rr = fin(reward / risk);
      if (reward <= 0) wrongTarget = true;
    }
    c.targets.push({ price, rr });
  }
  if (wrongTarget) c.warnings.push("target_wrong_side");
  if (result && entry != null && result.exitPrice != null && s !== 0) {
    const move = (result.exitPrice - entry) * s;
    if (c.riskPerUnit != null) c.realizedR = fin(move / risk);
    if (size != null) c.pnl = fin(move * size);
  }
  return c;
}
