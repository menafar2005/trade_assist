import type { Pre, Result } from "./types";
import type { Completion } from "./components/ui";
import type { SectionId } from "./fa";

const level = (filled: number, total: number): Completion => (filled === 0 ? "empty" : filled >= total ? "full" : "partial");

/** Informational only: never blocks saving or status changes. */
export function sectionCompletion(pre: Pre): Record<SectionId, Completion> {
  const b = pre.basic, p = pre.plan, m = pre.mind, t = pre.thesis;
  const ev = (list: Pre["technical"]): Completion => {
    if (list.length === 0) return "empty";
    return list.some((e) => e.title.trim()) ? "full" : "partial";
  };
  return {
    basic: level([b.symbol, b.market, b.direction, b.timeframe, b.style].filter(Boolean).length, 5),
    plan: level([p.entry != null, p.stop != null, p.targets.length > 0, p.size != null].filter(Boolean).length, 4),
    thesis: level([t.summary.trim(), t.invalidation.trim()].filter(Boolean).length, 2),
    technical: ev(pre.technical),
    fundamental: ev(pre.fundamental),
    signals: ev(pre.signals),
    mind: level([m.confidence != null, m.mood !== "", m.onPlan != null].filter(Boolean).length, 3),
  };
}

export function resultCompletion(r: Result): Completion {
  return level([r.exitPrice != null, r.exitReason !== "", r.executionScore != null].filter(Boolean).length, 3);
}
