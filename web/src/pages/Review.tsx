import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api, ApiError } from "../api";
import type { ExitReason, Position, Result } from "../types";
import { compute } from "../calc";
import { exitLabel } from "../fa";
import { fromLocalInput, positionTitle, toLocalInput } from "../format";
import { resultCompletion } from "../completion";
import { useSettings } from "../settings";
import { useMedia } from "../useMedia";
import { saveStateText, useAutosave } from "../useAutosave";
import { ChipSelect, CompletionDot, Field, MultiChips, NumField, Scale, useUI } from "../components/ui";
import { AddendaPanel, PreView, SignedValue, StatusBadge } from "../components/View";

export default function Review() {
  const { id = "" } = useParams();
  const { settings } = useSettings();
  const ui = useUI();
  const wide = useMedia("(min-width: 900px)");
  const [tab, setTab] = useState<"result" | "evidence">("result");
  const [pos, setPos] = useState<Position | null>(null);
  const [result, setResultState] = useState<Result | null>(null);
  const resultRef = useRef<Result | null>(null);
  const [error, setError] = useState("");
  const [customTag, setCustomTag] = useState("");

  const autosave = useAutosave<Result>(async (r) => {
    const u = await api.saveResult(id, r);
    setPos((cur) => (cur ? { ...cur, calc: u.calc, updatedAt: u.updatedAt } : cur));
  });

  useEffect(() => {
    let alive = true;
    api.get(id).then((p) => {
      if (!alive) return;
      resultRef.current = p.result;
      setResultState(p.result);
      setPos(p);
    }).catch((e: ApiError) => alive && setError(e.status === 404 ? "این پوزیشن پیدا نشد." : e.message));
    return () => { alive = false; };
  }, [id]);

  const calc = useMemo(() => (pos && result ? compute(pos.pre, result) : null), [pos, result]);

  if (error) return <div className="empty"><p>{error}</p><Link to="/">بازگشت به لیست</Link></div>;
  if (!pos || !result || !calc) return <div className="empty">در حال بارگذاری…</div>;

  const edit = (p: Partial<Result>) => {
    const next = { ...resultRef.current!, ...p };
    resultRef.current = next;
    setResultState(next);
    autosave.schedule(next);
  };

  const mark = async (status: "reviewed" | "closed") => {
    try {
      await autosave.flush();
      setPos(await api.setStatus(id, status));
      if (status === "reviewed") ui.toast("بازبینی ثبت شد");
    } catch (e) {
      ui.toast((e as Error).message, true);
    }
  };

  const abandoned = pos.status === "abandoned";
  const isOpen = pos.status === "open" || pos.status === "draft";
  const canReview = !isOpen;
  const reviewed = pos.status === "reviewed" || (abandoned && !!pos.reviewedAt);
  const allTags = settings.mistakeTags;

  const resultPane = (
    <div className="card stack">
      <div className="row">
        <CompletionDot state={resultCompletion(result)} />
        <h2 className="grow">نتیجه و بازبینی</h2>
        <span className="savestate" role="status">{saveStateText[autosave.state]}</span>
      </div>
      {isOpen ? (
        <p className="muted">این پوزیشن هنوز بسته نشده است. بعد از بستن، نتیجه را اینجا ثبت و بازبینی کنید. <Link to={`/p/${id}`}>بازگشت به پوزیشن</Link></p>
      ) : (
        <>
          {!abandoned && (
            <>
              <div className="grid">
                <Field label="قیمت خروج"><NumField value={result.exitPrice} onChange={(v) => edit({ exitPrice: v })} /></Field>
                <Field label="زمان خروج"><input type="datetime-local" className="input ltr" value={toLocalInput(result.exitTime)} onChange={(e) => edit({ exitTime: fromLocalInput(e.target.value) })} /></Field>
              </div>
              <div className="field"><span className="label">دلیل خروج</span>
                <ChipSelect<ExitReason> options={(Object.keys(exitLabel) as Exclude<ExitReason, "">[]).map((v) => ({ value: v, label: exitLabel[v] }))} value={result.exitReason} onChange={(v) => edit({ exitReason: v })} /></div>
              <dl className="calc">
                <div><dt>R محقق‌شده</dt><dd><SignedValue value={calc.realizedR} suffix="R" /></dd></div>
                <div><dt>سود و زیان</dt><dd><SignedValue value={calc.pnl} suffix={` ${settings.currency}`} /></dd></div>
              </dl>
            </>
          )}
          <div className="field"><span className="label">تگ اشتباهات</span>
            <MultiChips options={allTags} value={result.mistakes} onChange={(m) => edit({ mistakes: m })} />
            <form className="row" onSubmit={(e) => {
              e.preventDefault();
              const t = customTag.trim();
              if (t && !result.mistakes.includes(t)) edit({ mistakes: [...result.mistakes, t] });
              setCustomTag("");
            }}>
              <input className="input grow" aria-label="تگ جدید" placeholder="تگ دلخواه" value={customTag} onChange={(e) => setCustomTag(e.target.value)} />
              <button className="btn" type="submit" disabled={!customTag.trim()}>افزودن</button>
            </form>
          </div>
          {!abandoned && (
            <div className="field"><span className="label">امتیاز اجرا (۱ تا ۵) — اجرا چقدر طبق پلن بود، جدا از نتیجه</span>
              <Scale label="امتیاز اجرا" value={result.executionScore} onChange={(v) => edit({ executionScore: v })} /></div>
          )}
          <Field label="درس این معامله" wide>
            <textarea className="textarea" value={result.lesson} onChange={(e) => edit({ lesson: e.target.value })} />
          </Field>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            {reviewed && pos.status === "reviewed" ? (
              <button className="btn" onClick={() => mark("closed")}>بازگرداندن به «بازبینی نشده»</button>
            ) : (
              <button className="btn primary" disabled={!canReview || reviewed} onClick={() => mark("reviewed")}>{reviewed ? "بازبینی شده" : "بازبینی شد"}</button>
            )}
          </div>
        </>
      )}
    </div>
  );

  const evidencePane = (
    <div className="stack">
      <div className="card">
        <p className="muted small" style={{ marginBottom: 12 }}>
          اینها دقیقاً همان چیزی است که قبل از ورود ثبت شده؛ ویرایش‌شدنی نیست.
        </p>
        <PreView pre={pos.pre} calc={pos.calc} currency={settings.currency} />
      </div>
      <div className="card">
        <AddendaPanel addenda={pos.addenda} canAdd={pos.status !== "draft"} onAdd={async (text) => {
          try { setPos(await api.addAddendum(id, text)); } catch (e) { ui.toast((e as Error).message, true); throw e; }
        }} />
      </div>
    </div>
  );

  return (
    <>
      <div className="topbar">
        <Link to="/" className="btn icon ghost" aria-label="بازگشت به لیست"><ArrowLeft className="flip" size={20} strokeWidth={1.5} /></Link>
        <h1><bdi>{positionTitle(pos.pre.basic.symbol, pos.createdAt)}</bdi></h1>
        <StatusBadge status={pos.status} reviewed={!!pos.reviewedAt} />
      </div>
      <div className="row wrap" style={{ marginBottom: 16 }}>
        <SignedValue value={calc.realizedR} suffix="R" />
        <SignedValue value={calc.pnl} suffix={` ${settings.currency}`} />
      </div>
      {wide ? (
        <div className="review two">{resultPane}{evidencePane}</div>
      ) : (
        <>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === "result"} className="chip" aria-pressed={tab === "result"} onClick={() => setTab("result")}>نتیجه و بازبینی</button>
            <button role="tab" aria-selected={tab === "evidence"} className="chip" aria-pressed={tab === "evidence"} onClick={() => setTab("evidence")}>شواهد قفل‌شده</button>
          </div>
          {tab === "result" ? resultPane : evidencePane}
        </>
      )}
    </>
  );
}
