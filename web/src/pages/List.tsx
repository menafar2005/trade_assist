import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, Image, Plus, Settings as Cog, SearchX } from "lucide-react";
import { api, ApiError, type Filters } from "../api";
import type { Summary } from "../types";
import { statusLabel } from "../fa";
import { fmtDate, positionTitle } from "../format";
import { useSettings } from "../settings";
import { SignedValue, StatusBadge } from "../components/View";
import { useUI } from "../components/ui";

const WEEK = 7 * 24 * 3600 * 1000;
const needsReview = (s: Summary) => (s.status === "closed" || s.status === "abandoned") && !s.reviewedAt;

const toMs = (d: string, endOfDay = false) => {
  if (!d) return undefined;
  const t = new Date(d + "T00:00:00").getTime();
  return endOfDay ? t + 24 * 3600 * 1000 : t;
};

export default function List() {
  const nav = useNavigate();
  const ui = useUI();
  const { settings } = useSettings();
  const [sp, setSp] = useSearchParams();
  const [items, setItems] = useState<Summary[] | null>(null);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [error, setError] = useState("");

  const q = sp.get("q") ?? "";
  const [qText, setQText] = useState(q);
  const get = (k: string) => sp.get(k) ?? "";
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v); else next.delete(k);
    setSp(next, { replace: true });
  };

  // debounce the text search into the URL
  useEffect(() => {
    const t = window.setTimeout(() => { if (qText !== q) setParam("q", qText); }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qText]);

  const filters: Filters = useMemo(() => ({
    q, status: get("status"), outcome: get("outcome"), symbol: get("symbol"), tag: get("tag"), source: get("source"),
    from: toMs(get("from")), to: toMs(get("to"), true),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [sp]);

  useEffect(() => {
    let alive = true;
    setError("");
    api.list(filters).then((r) => alive && setItems(r)).catch((e: ApiError) => alive && setError(e.message));
    return () => { alive = false; };
  }, [filters]);
  useEffect(() => { api.symbols().then(setSymbols).catch(() => {}); }, []);

  const create = useCallback(async () => {
    try {
      const p = await api.create();
      nav(`/p/${p.id}`);
    } catch (e) {
      ui.toast((e as Error).message, true);
    }
  }, [nav, ui]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key.toLowerCase() !== "n" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      void create();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [create]);

  // closed positions waiting more than 7 days for a review float to the top
  const sorted = useMemo(() => {
    if (!items) return null;
    const now = Date.now();
    const overdue = (s: Summary) => needsReview(s) && now - (s.closedAt ?? s.updatedAt) > WEEK;
    return [...items.filter(overdue), ...items.filter((s) => !overdue(s))];
  }, [items]);

  const tags = [...new Set([...settings.mistakeTags, ...settings.evidenceTags])];
  const hasFilter = [...sp.keys()].length > 0;

  return (
    <>
      <div className="topbar">
        <h1>ژورنال تحلیل پوزیشن</h1>
        <Link to="/settings" className="btn icon ghost" aria-label="تنظیمات"><Cog size={20} strokeWidth={1.5} /></Link>
        <button className="btn primary" onClick={create}><Plus size={16} strokeWidth={1.5} /> پوزیشن جدید <kbd className="hide-narrow muted small ltr">N</kbd></button>
      </div>

      <div className="filters" role="search">
        <input className="input search" type="search" placeholder="جستجو در عنوان‌ها، تز و یادداشت‌ها" aria-label="جستجو" value={qText} onChange={(e) => setQText(e.target.value)} />
        <select className="select" aria-label="وضعیت" value={get("status")} onChange={(e) => setParam("status", e.target.value)}>
          <option value="">همه‌ی وضعیت‌ها</option>
          {(Object.keys(statusLabel) as (keyof typeof statusLabel)[]).map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}
        </select>
        <select className="select" aria-label="نتیجه" value={get("outcome")} onChange={(e) => setParam("outcome", e.target.value)}>
          <option value="">سود و زیان</option>
          <option value="win">سودده</option>
          <option value="loss">زیان‌ده</option>
        </select>
        <select className="select" aria-label="نماد" value={get("symbol")} onChange={(e) => setParam("symbol", e.target.value)}>
          <option value="">همه‌ی نمادها</option>
          {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="select" aria-label="تگ" value={get("tag")} onChange={(e) => setParam("tag", e.target.value)}>
          <option value="">همه‌ی تگ‌ها</option>
          {tags.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="select" aria-label="منبع سیگنال" value={get("source")} onChange={(e) => setParam("source", e.target.value)}>
          <option value="">همه‌ی منابع</option>
          {settings.signalSources.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="input ltr" type="date" aria-label="از تاریخ" value={get("from")} onChange={(e) => setParam("from", e.target.value)} />
        <input className="input ltr" type="date" aria-label="تا تاریخ" value={get("to")} onChange={(e) => setParam("to", e.target.value)} />
        {hasFilter && <button className="btn" onClick={() => { setQText(""); setSp({}, { replace: true }); }}>پاک کردن فیلترها</button>}
      </div>

      {error && <p className="warn" role="alert">{error}</p>}
      {sorted === null && !error && <div className="empty">در حال بارگذاری…</div>}
      {sorted && sorted.length === 0 && (
        <div className="empty">
          <SearchX size={32} strokeWidth={1.5} />
          <p>{hasFilter ? "پوزیشنی با این فیلترها پیدا نشد." : "هنوز پوزیشنی ثبت نشده است. با دکمه‌ی «پوزیشن جدید» یا کلید N شروع کنید."}</p>
        </div>
      )}
      <div className="cards">
        {sorted?.map((s) => {
          const DirIcon = s.direction === "long" ? ArrowUp : s.direction === "short" ? ArrowDown : null;
          const overdue = needsReview(s) && Date.now() - (s.closedAt ?? s.updatedAt) > WEEK;
          return (
            <Link key={s.id} to={s.status === "closed" || s.status === "reviewed" || s.status === "abandoned" ? `/p/${s.id}/review` : `/p/${s.id}`} className="card link stack" style={{ gap: 8 }}>
              <div className="row">
                {DirIcon && <DirIcon size={16} strokeWidth={1.5} className={s.direction === "long" ? "pos" : "neg"} aria-label={s.direction === "long" ? "لانگ" : "شورت"} />}
                <strong className="grow"><bdi>{positionTitle(s.symbol, s.createdAt)}</bdi></strong>
                <StatusBadge status={s.status} reviewed={!!s.reviewedAt} />
              </div>
              <div className="row wrap">
                {s.r != null && <SignedValue value={s.r} suffix="R" />}
                {s.pnl != null && <SignedValue value={s.pnl} suffix={` ${settings.currency}`} />}
                {s.r == null && s.pnl == null && <span className="muted small">بدون نتیجه</span>}
              </div>
              <div className="row wrap small muted">
                <span className="num">{fmtDate(s.createdAt)}</span>
                <span className="row" style={{ gap: 4 }}><Image size={14} strokeWidth={1.5} aria-hidden />{s.evidenceCount} شاهد</span>
                {s.evidenceCount === 0 && <span className="badge">بدون شواهد</span>}
                {needsReview(s) && <span className={`badge ${overdue ? "neg" : "accent"}`}>{overdue ? "بازبینی نشده · بیش از ۷ روز" : "بازبینی نشده"}</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
