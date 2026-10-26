export type Status = "draft" | "open" | "closed" | "reviewed" | "abandoned";
export type Market = "crypto" | "forex" | "stock" | "other" | "";
export type Direction = "long" | "short" | "";
export type Style = "scalp" | "day" | "swing" | "position" | "";
export type EvDirection = "for" | "against" | "neutral";
export type Weight = "low" | "mid" | "high";
export type Mood = "calm" | "hasty" | "tired" | "revenge" | "fomo" | "";
export type ExitReason = "target" | "stop" | "manual" | "trailing" | "";

export interface Basic {
  symbol: string;
  market: Market;
  direction: Direction;
  timeframe: string;
  style: Style;
  entryTime: number | null;
}
export interface Plan {
  entry: number | null;
  stop: number | null;
  targets: number[];
  size: number | null;
  leverage: number | null;
  balance: number | null;
}
export interface Thesis {
  summary: string;
  invalidation: string;
}
export interface Evidence {
  id: string;
  title: string;
  direction: EvDirection;
  weight: Weight;
  timeframe: string;
  source: string;
  images: string[];
  links: string[];
  note: string;
  tags: string[];
}
export interface CheckItem {
  id: string;
  text: string;
  checked: boolean;
}
export interface Mind {
  confidence: number | null;
  mood: Mood;
  onPlan: boolean | null;
  checklist: CheckItem[];
}
export interface Pre {
  basic: Basic;
  plan: Plan;
  thesis: Thesis;
  technical: Evidence[];
  fundamental: Evidence[];
  signals: Evidence[];
  mind: Mind;
}
export interface Result {
  exitPrice: number | null;
  exitTime: number | null;
  exitReason: ExitReason;
  mistakes: string[];
  executionScore: number | null;
  lesson: string;
}
export interface Addendum {
  id: string;
  at: number;
  text: string;
}
export interface Calc {
  riskPerUnit: number | null;
  riskAmount: number | null;
  riskPct: number | null;
  targets: { price: number; rr: number | null }[];
  realizedR: number | null;
  pnl: number | null;
  warnings: string[];
}
export interface Position {
  id: string;
  status: Status;
  createdAt: number;
  updatedAt: number;
  lockedAt: number | null;
  openedAt: number | null;
  closedAt: number | null;
  reviewedAt: number | null;
  pre: Pre;
  result: Result;
  addenda: Addendum[];
  calc: Calc;
}
export interface Summary {
  id: string;
  status: Status;
  symbol: string;
  direction: Direction;
  market: Market;
  createdAt: number;
  updatedAt: number;
  openedAt: number | null;
  closedAt: number | null;
  reviewedAt: number | null;
  pnl: number | null;
  r: number | null;
  evidenceCount: number;
  againstCount: number;
  mood: Mood;
}
export interface Settings {
  mistakeTags: string[];
  evidenceTags: string[];
  signalSources: string[];
  checklist: { id: string; text: string }[];
  currency: string;
}
