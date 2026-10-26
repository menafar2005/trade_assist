import { useState } from "react";
import { ArrowDown, ArrowUp, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { Addendum, Calc, Evidence, Pre, Status } from "../types";
import { evDirLabel, marketLabel, moodLabel, statusLabel, styleLabel, warningLabel, weightLabel } from "../fa";
import { fmtDateTime, fmtNum, fmtSigned } from "../format";
import { imageUrl } from "../api";
import { useUI } from "./ui";

export function StatusBadge({ status, reviewed }: { status: Status; reviewed?: boolean }) {
  const cls = status === "open" ? "accent" : status === "reviewed" || (status === "abandoned" && reviewed) ? "pos" : "";
  return <span className={`badge ${cls}`}>{statusLabel[status]}{status === "abandoned" && reviewed ? " · بازبینی‌شده" : ""}</span>;
}

/** Signed value with icon + sign so colour is never the only signal. */
export function SignedValue({ value, suffix = "", digits = 2 }: { value: number | null; suffix?: string; digits?: number }) {
  if (value == null) return <span className="muted">—</span>;
  const cls = value > 0 ? "pos" : value < 0 ? "neg" : "muted";
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  return (
    <span className={`${cls} num row`} style={{ display: "inline-flex", gap: 4 }} dir="ltr">
      <Icon size={14} strokeWidth={1.5} aria-hidden />
      <bdi>{fmtSigned(value, digits)}{suffix}</bdi>
    </span>
  );
}

export function CalcBox({ calc, currency, showResult }: { calc: Calc; currency: string; showResult?: boolean }) {
  const has = calc.riskPerUnit != null || calc.targets.some((t) => t.rr != null) || calc.realizedR != null;
  if (!has && calc.warnings.length === 0) {
    return <p className="muted small">با ورود قیمت ورود، حد ضرر و تارگت، ریسک و R:R خودکار محاسبه می‌شود.</p>;
  }
  return (
    <div className="stack">
      {calc.warnings.map((w) => <p key={w} className="warn" role="alert">{warningLabel[w] ?? w}</p>)}
      {has && (
        <dl className="calc">
          <div><dt>ریسک هر واحد</dt><dd className="num">{fmtNum(calc.riskPerUnit)}</dd></div>
          <div><dt>مبلغ ریسک</dt><dd className="num">{calc.riskAmount == null ? "—" : `${fmtNum(calc.riskAmount, 2)} ${currency}`}</dd></div>
          <div><dt>درصد ریسک حساب</dt><dd className="num">{calc.riskPct == null ? "—" : `${fmtNum(calc.riskPct, 2)}%`}</dd></div>
          {calc.targets.map((t, i) => (
            <div key={i}><dt>R:R تارگت {i + 1}</dt><dd className="num">{t.rr == null ? "—" : `1 : ${fmtNum(t.rr, 2)}`}</dd></div>
          ))}
          {showResult && (
            <>
              <div><dt>R محقق‌شده</dt><dd><SignedValue value={calc.realizedR} suffix="R" /></dd></div>
              <div><dt>سود و زیان</dt><dd><SignedValue value={calc.pnl} suffix={` ${currency}`} /></dd></div>
            </>
          )}
        </dl>
      )}
    </div>
  );
}

const dirIcon = { for: ArrowUp, against: ArrowDown, neutral: Minus };

function EvidenceView({ e }: { e: Evidence }) {
  const { showImage } = useUI();
  const Icon = dirIcon[e.direction];
  return (
    <div className={`evidence ${e.direction}`}>
      <div className="stack" style={{ gap: 8 }}>
        <div className="row wrap">
          <Icon size={16} strokeWidth={1.5} className={e.direction === "for" ? "pos" : e.direction === "against" ? "neg" : "muted"} aria-label={evDirLabel[e.direction]} />
          <strong className="grow">{e.title || "بدون عنوان"}</strong>
          <span className="badge">{evDirLabel[e.direction]}</span>
          <span className="badge">وزن {weightLabel[e.weight]}</span>
        </div>
        {(e.timeframe || e.source) && (
          <p className="muted small">
            {e.timeframe && <bdi className="ltr">{e.timeframe}</bdi>} {e.source && <>· منبع: {e.source}</>}
          </p>
        )}
        {(e.images.length > 0 || e.links.length > 0) && (
          <div className="thumbs">
            {e.images.map((id) => <div className="thumb" key={id}><img src={imageUrl(id)} alt="پیوست شاهد" loading="lazy" onClick={() => showImage(id)} /></div>)}
            {e.links.map((l) => <a key={l} className="chip static tag ltr" href={l} target="_blank" rel="noopener noreferrer">{l.replace(/^https?:\/\//, "").slice(0, 40)}</a>)}
          </div>
        )}
        {e.note && <p style={{ whiteSpace: "pre-wrap" }}>{e.note}</p>}
        {e.tags.length > 0 && <div className="chips">{e.tags.map((t) => <span key={t} className="chip static tag">{t}</span>)}</div>}
      </div>
    </div>
  );
}

function Block({ title, children, empty }: { title: string; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <h2>{title}</h2>
      {empty ? <p className="muted small">چیزی ثبت نشده است.</p> : children}
    </div>
  );
}

/** Read-only view of the frozen pre-entry sections 1-7. */
export function PreView({ pre, calc, currency }: { pre: Pre; calc: Calc; currency: string }) {
  const b = pre.basic, p = pre.plan, m = pre.mind;
  return (
    <div className="stack" style={{ gap: 20 }}>
      <Block title="اطلاعات پایه">
        <dl className="kv">
          <dt>نماد</dt><dd><bdi className="ltr">{b.symbol || "—"}</bdi></dd>
          <dt>بازار</dt><dd>{b.market ? marketLabel[b.market] : "—"}</dd>
          <dt>جهت</dt><dd>{b.direction === "long" ? "لانگ" : b.direction === "short" ? "شورت" : "—"}</dd>
          <dt>تایم‌فریم</dt><dd><bdi className="ltr">{b.timeframe || "—"}</bdi></dd>
          <dt>سبک</dt><dd>{b.style ? styleLabel[b.style] : "—"}</dd>
          <dt>زمان ورود</dt><dd className="num">{fmtDateTime(b.entryTime)}</dd>
        </dl>
      </Block>
      <Block title="پلن معامله">
        <dl className="kv">
          <dt>قیمت ورود</dt><dd className="num ltr">{fmtNum(p.entry)}</dd>
          <dt>حد ضرر</dt><dd className="num ltr">{fmtNum(p.stop)}</dd>
          <dt>تارگت‌ها</dt><dd className="num ltr">{p.targets.length ? p.targets.map((t) => fmtNum(t)).join("  ·  ") : "—"}</dd>
          <dt>حجم / اهرم</dt><dd className="num ltr">{fmtNum(p.size)} / {fmtNum(p.leverage)}</dd>
          <dt>موجودی حساب</dt><dd className="num ltr">{fmtNum(p.balance)}</dd>
        </dl>
        <CalcBox calc={calc} currency={currency} />
      </Block>
      <Block title="تز معامله" empty={!pre.thesis.summary && !pre.thesis.invalidation}>
        {pre.thesis.summary && <p style={{ whiteSpace: "pre-wrap" }}>{pre.thesis.summary}</p>}
        {pre.thesis.invalidation && <p className="muted" style={{ whiteSpace: "pre-wrap" }}>شرط باطل شدن: {pre.thesis.invalidation}</p>}
      </Block>
      {([["شواهد تکنیکال", pre.technical], ["شواهد فاندامنتال و خبری", pre.fundamental], ["سیگنال‌ها و سنتیمنت", pre.signals]] as const).map(([t, list]) => (
        <Block key={t} title={t} empty={list.length === 0}>
          <div className="stack">{list.map((e) => <EvidenceView key={e.id} e={e} />)}</div>
        </Block>
      ))}
      <Block title="وضعیت ذهنی و چک‌لیست">
        <dl className="kv">
          <dt>اطمینان</dt><dd>{m.confidence ?? "—"} از 5</dd>
          <dt>حال</dt><dd>{m.mood ? moodLabel[m.mood] : "—"}</dd>
          <dt>طبق پلن</dt><dd>{m.onPlan == null ? "—" : m.onPlan ? "بله" : "خیر"}</dd>
        </dl>
        {m.checklist.length > 0 && (
          <ul style={{ margin: 0, paddingInlineStart: 20 }}>
            {m.checklist.map((c) => <li key={c.id}>{c.checked ? "✓" : "✗"} {c.text}</li>)}
          </ul>
        )}
      </Block>
    </div>
  );
}

export function AddendaPanel({ addenda, onAdd, canAdd }: { addenda: Addendum[]; onAdd: (text: string) => Promise<void>; canAdd: boolean }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <h2>یادداشت‌های تکمیلی</h2>
      <p className="muted small">متن اصلی قفل است؛ هر اصلاح یا مشاهده‌ی تازه با زمان ثبت اینجا اضافه می‌شود.</p>
      <div className="timeline">
        {addenda.map((a) => (
          <div className="note" key={a.id}>
            <div className="muted small num">{fmtDateTime(a.at)}</div>
            <p style={{ whiteSpace: "pre-wrap" }}>{a.text}</p>
          </div>
        ))}
        {addenda.length === 0 && <p className="muted small">هنوز یادداشتی اضافه نشده است.</p>}
      </div>
      {canAdd && (
        <div className="stack" style={{ gap: 8 }}>
          <textarea className="textarea" aria-label="یادداشت تکمیلی" value={text} onChange={(e) => setText(e.target.value)} placeholder="چه چیزی تغییر کرد؟" />
          <div className="row">
            <button className="btn" disabled={busy || !text.trim()} onClick={async () => {
              setBusy(true);
              try { await onAdd(text.trim()); setText(""); } finally { setBusy(false); }
            }}>افزودن یادداشت</button>
          </div>
        </div>
      )}
    </div>
  );
}
