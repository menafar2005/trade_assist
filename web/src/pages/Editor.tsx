import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Trash2, X } from "lucide-react";
import { api, ApiError } from "../api";
import type { CheckItem, Direction, Evidence, Market, Mood, Position, Pre, Style } from "../types";
import { compute } from "../calc";
import { sectionCompletion } from "../completion";
import { SECTIONS, type SectionId, marketLabel, moodLabel, styleLabel, exitLabel } from "../fa";
import { fromLocalInput, fmtNum, positionTitle, toLocalInput } from "../format";
import { useSettings } from "../settings";
import { saveStateText, useAutosave } from "../useAutosave";
import { ChipSelect, Field, NumField, Scale, Section, useUI } from "../components/ui";
import { EvidenceList, newEvidence } from "../components/EvidenceList";
import { AddendaPanel, CalcBox, PreView, SignedValue, StatusBadge } from "../components/View";
import type { ExitReason } from "../types";

type EvKind = "technical" | "fundamental" | "signals";
const isEvKind = (s: string | null): s is EvKind => s === "technical" || s === "fundamental" || s === "signals";

export default function Editor() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { settings } = useSettings();
  const ui = useUI();

  const [pos, setPos] = useState<Position | null>(null);
  const [pre, setPreState] = useState<Pre | null>(null);
  const preRef = useRef<Pre | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({ basic: true, plan: true, thesis: true, technical: true, fundamental: true, signals: true, mind: true });
  const [activeEv, setActiveEv] = useState<string | null>(null);
  const activeSection = useRef<string | null>(null);
  const [closing, setClosing] = useState<null | { exitPrice: number | null; exitTime: number | null; exitReason: ExitReason }>(null);
  const [busy, setBusy] = useState(false);

  const autosave = useAutosave<Pre>(async (p) => {
    const updated = await api.savePre(id, p);
    setPos((cur) => (cur ? { ...cur, calc: updated.calc, updatedAt: updated.updatedAt } : cur));
  });

  useEffect(() => {
    let alive = true;
    api.get(id).then((p) => {
      if (!alive) return;
      let loaded = p.pre;
      if (p.status === "draft") {
        // rules added to settings after this draft was created
        const have = new Set(loaded.mind.checklist.map((c) => c.id));
        const missing = settings.checklist.filter((r) => !have.has(r.id)).map((r): CheckItem => ({ ...r, checked: false }));
        if (missing.length) loaded = { ...loaded, mind: { ...loaded.mind, checklist: [...loaded.mind.checklist, ...missing] } };
      }
      preRef.current = loaded;
      setPreState(loaded);
      setPos(p);
    }).catch((e: ApiError) => alive && setError(e.status === 404 ? "این پوزیشن پیدا نشد." : e.message));
    return () => { alive = false; };
    // settings.checklist is only needed on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const update = useCallback((fn: (p: Pre) => Pre) => {
    if (!preRef.current) return;
    const next = fn(preRef.current);
    preRef.current = next;
    setPreState(next);
    autosave.schedule(next);
  }, [autosave]);

  const attach = useCallback(async (evId: string | null, kind: EvKind | null, file: Blob) => {
    try {
      const up = await api.uploadImage(file);
      update((p) => {
        const add = (list: Evidence[]) => list.map((e) => (e.id === evId ? { ...e, images: [...e.images, up.id] } : e));
        if (evId && [...p.technical, ...p.fundamental, ...p.signals].some((e) => e.id === evId)) {
          return { ...p, technical: add(p.technical), fundamental: add(p.fundamental), signals: add(p.signals) };
        }
        const k = kind ?? "technical";
        const e = { ...newEvidence(), images: [up.id] };
        return { ...p, [k]: [...p[k], e] };
      });
      ui.toast("تصویر اضافه شد");
    } catch (e) {
      ui.toast(e instanceof ApiError ? e.message : "آپلود تصویر ناموفق بود", true);
    }
  }, [update, ui]);

  // Ctrl+V of a clipboard image attaches it to the focused evidence item, or creates one in the focused section.
  const draft = pos?.status === "draft";
  useEffect(() => {
    if (!draft) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.kind === "file" && i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      const kind = isEvKind(activeSection.current) ? activeSection.current : null;
      if (!activeEv && !kind) {
        ui.toast("ابتدا داخل یکی از بخش‌های شواهد کلیک کنید، بعد پیست کنید", true);
        return;
      }
      void attach(activeEv, kind, file);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [draft, activeEv, attach, ui]);

  const calc = useMemo(() => (pre ? compute(pre) : null), [pre]);
  const completion = useMemo(() => (pre ? sectionCompletion(pre) : null), [pre]);

  if (error) return <div className="empty"><p>{error}</p><Link to="/">بازگشت به لیست</Link></div>;
  if (!pos || !pre || !calc || !completion) return <div className="empty">در حال بارگذاری…</div>;

  const title = positionTitle(pre.basic.symbol, pos.createdAt);
  const set = <K extends keyof Pre>(k: K, v: Pre[K]) => update((p) => ({ ...p, [k]: v }));
  const toggle = (sid: string) => setOpen((o) => ({ ...o, [sid]: !o[sid] }));

  const changeStatus = async (status: string, result?: Parameters<typeof api.setStatus>[2]) => {
    setBusy(true);
    try {
      await autosave.flush();
      const updated = await api.setStatus(id, status, result);
      setPos(updated);
      preRef.current = updated.pre;
      setPreState(updated.pre);
      return updated;
    } catch (e) {
      ui.toast(e instanceof ApiError ? e.message : "تغییر وضعیت ناموفق بود", true);
    } finally {
      setBusy(false);
    }
  };

  const goOpen = async () => {
    const ok = await ui.confirm({
      title: "ورود به پوزیشن",
      body: "با تغییر وضعیت به «باز»، بخش‌های ۱ تا ۷ قفل و با زمان ثبت می‌شوند. بعد از آن فقط یادداشت تکمیلی اضافه می‌شود.",
      confirmLabel: "وارد شدم",
    });
    if (ok) await changeStatus("open");
  };
  const abandon = async () => {
    const ok = await ui.confirm({ title: "منصرف شدم", body: "ایده با همین شواهد قفل و برای بازبینی نگه داشته می‌شود.", confirmLabel: "ثبت انصراف" });
    if (ok) {
      const u = await changeStatus("abandoned");
      if (u) nav(`/p/${id}/review`);
    }
  };
  const remove = async () => {
    const ok = await ui.confirm({ title: "حذف پوزیشن", body: "این کار برگشت‌پذیر نیست.", confirmLabel: "حذف", danger: true });
    if (!ok) return;
    try { await api.remove(id); nav("/"); } catch (e) { ui.toast((e as Error).message, true); }
  };
  const doClose = async () => {
    if (!closing) return;
    const u = await changeStatus("closed", {
      exitPrice: closing.exitPrice, exitTime: closing.exitTime, exitReason: closing.exitReason,
      mistakes: [], executionScore: null, lesson: "",
    });
    if (u) nav(`/p/${id}/review`);
  };

  const sectionProps = (sid: SectionId) => ({
    id: sid,
    title: SECTIONS.find((s) => s.id === sid)!.title,
    completion: completion[sid],
    open: !!open[sid],
    onToggle: () => toggle(sid),
  });

  const saveClass = autosave.state === "error" ? "savestate err" : "savestate";

  return (
    <>
      <div className="topbar">
        <Link to="/" className="btn icon ghost" aria-label="بازگشت به لیست"><ArrowLeft className="flip" size={20} strokeWidth={1.5} /></Link>
        <h1><bdi>{title}</bdi></h1>
        <StatusBadge status={pos.status} reviewed={!!pos.reviewedAt} />
      </div>

      {pos.status !== "draft" ? (
        <div className="stack" style={{ gap: 20 }}>
          <p className="muted">این پوزیشن قفل است؛ شواهد دقیقاً همان‌طور که قبل از ورود ثبت شدند نمایش داده می‌شوند.</p>
          <div className="card"><PreView pre={pos.pre} calc={pos.calc} currency={settings.currency} /></div>
          <div className="card"><AddendaPanel addenda={pos.addenda} canAdd onAdd={async (text) => {
            try { setPos(await api.addAddendum(id, text)); } catch (e) { ui.toast((e as Error).message, true); throw e; }
          }} /></div>
        </div>
      ) : (
        <div className="editor">
          <nav className="sidenav" aria-label="بخش‌ها">
            <ul>
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#sec-${s.id}`} onClick={(e) => {
                    e.preventDefault();
                    setOpen((o) => ({ ...o, [s.id]: true }));
                    document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}>
                    <span className={`dot ${completion[s.id] === "empty" ? "" : completion[s.id]}`} />{s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div onFocusCapture={(e) => {
            const sec = (e.target as HTMLElement).closest("[data-section]")?.getAttribute("data-section") ?? null;
            activeSection.current = sec;
            if (!(e.target as HTMLElement).closest("[data-evidence-id]")) setActiveEv(null);
          }}>
            <Section {...sectionProps("basic")}>
              <div className="grid">
                <Field label="نماد"><input className="input ltr" value={pre.basic.symbol} placeholder="BTCUSDT" onChange={(e) => set("basic", { ...pre.basic, symbol: e.target.value })} /></Field>
                <Field label="تایم‌فریم تحلیل"><input className="input ltr" value={pre.basic.timeframe} placeholder="4h" onChange={(e) => set("basic", { ...pre.basic, timeframe: e.target.value })} /></Field>
                <Field label="زمان ورود"><input type="datetime-local" className="input ltr" value={toLocalInput(pre.basic.entryTime)} onChange={(e) => set("basic", { ...pre.basic, entryTime: fromLocalInput(e.target.value) })} /></Field>
              </div>
              <div className="field"><span className="label">بازار</span>
                <ChipSelect<Market> options={(Object.keys(marketLabel) as Exclude<Market, "">[]).map((v) => ({ value: v, label: marketLabel[v] }))} value={pre.basic.market} onChange={(v) => set("basic", { ...pre.basic, market: v })} /></div>
              <div className="field"><span className="label">جهت</span>
                <ChipSelect<Direction> options={[{ value: "long", label: "لانگ" }, { value: "short", label: "شورت" }]} value={pre.basic.direction} onChange={(v) => set("basic", { ...pre.basic, direction: v })} /></div>
              <div className="field"><span className="label">سبک</span>
                <ChipSelect<Style> options={(Object.keys(styleLabel) as Exclude<Style, "">[]).map((v) => ({ value: v, label: styleLabel[v] }))} value={pre.basic.style} onChange={(v) => set("basic", { ...pre.basic, style: v })} /></div>
            </Section>

            <Section {...sectionProps("plan")}>
              <div className="grid">
                <Field label="قیمت ورود"><NumField value={pre.plan.entry} onChange={(v) => set("plan", { ...pre.plan, entry: v })} /></Field>
                <Field label="حد ضرر"><NumField value={pre.plan.stop} onChange={(v) => set("plan", { ...pre.plan, stop: v })} /></Field>
                <Field label="حجم (واحد)"><NumField value={pre.plan.size} onChange={(v) => set("plan", { ...pre.plan, size: v })} /></Field>
                <Field label="اهرم"><NumField value={pre.plan.leverage} unit="x" onChange={(v) => set("plan", { ...pre.plan, leverage: v })} /></Field>
                <Field label="موجودی حساب"><NumField value={pre.plan.balance} unit={settings.currency} onChange={(v) => set("plan", { ...pre.plan, balance: v })} /></Field>
              </div>
              <div className="field"><span className="label">تارگت‌ها</span>
                <div className="stack" style={{ gap: 8 }}>
                  {pre.plan.targets.map((t, i) => (
                    <div className="row" key={i}>
                      <span className="muted small" style={{ minWidth: 56 }}>تارگت {i + 1}</span>
                      <div className="grow">
                        <NumField value={t} onChange={(v) => {
                          const targets = [...pre.plan.targets];
                          if (v == null) targets.splice(i, 1); else targets[i] = v;
                          set("plan", { ...pre.plan, targets });
                        }} />
                      </div>
                      <button type="button" className="btn icon ghost" aria-label="حذف تارگت" onClick={() => set("plan", { ...pre.plan, targets: pre.plan.targets.filter((_, j) => j !== i) })}><X size={16} strokeWidth={1.5} /></button>
                    </div>
                  ))}
                  <div className="row"><button type="button" className="btn" onClick={() => set("plan", { ...pre.plan, targets: [...pre.plan.targets, pre.plan.entry ?? 0] })}><Plus size={16} strokeWidth={1.5} /> تارگت</button></div>
                </div>
              </div>
              <CalcBox calc={calc} currency={settings.currency} />
            </Section>

            <Section {...sectionProps("thesis")}>
              <Field label="خلاصه‌ی دلیل ورود (۱ تا ۳ جمله)" wide>
                <textarea className="textarea" value={pre.thesis.summary} onChange={(e) => set("thesis", { ...pre.thesis, summary: e.target.value })} />
              </Field>
              <Field label="شرط باطل شدن تز (Invalidation)" wide>
                <textarea className="textarea" value={pre.thesis.invalidation} onChange={(e) => set("thesis", { ...pre.thesis, invalidation: e.target.value })} />
              </Field>
            </Section>

            {(["technical", "fundamental", "signals"] as const).map((k) => (
              <Section key={k} {...sectionProps(k)}>
                <EvidenceList kind={k} items={pre[k]} onChange={(items) => set(k, items)} tags={settings.evidenceTags} sources={settings.signalSources}
                  activeId={activeEv} onFocusItem={setActiveEv} onAttach={(evId, f) => attach(evId, k, f)} />
              </Section>
            ))}

            <Section {...sectionProps("mind")}>
              <div className="field"><span className="label">میزان اطمینان (۱ تا ۵)</span>
                <Scale label="اطمینان" value={pre.mind.confidence} onChange={(v) => set("mind", { ...pre.mind, confidence: v })} /></div>
              <div className="field"><span className="label">حال ذهنی</span>
                <ChipSelect<Mood> options={(Object.keys(moodLabel) as Exclude<Mood, "">[]).map((v) => ({ value: v, label: moodLabel[v] }))} value={pre.mind.mood} onChange={(v) => set("mind", { ...pre.mind, mood: v })} /></div>
              <div className="field"><span className="label">آیا طبق پلن است؟</span>
                <ChipSelect<"yes" | "no"> options={[{ value: "yes", label: "بله" }, { value: "no", label: "خیر" }]}
                  value={pre.mind.onPlan == null ? "" : pre.mind.onPlan ? "yes" : "no"} onChange={(v) => set("mind", { ...pre.mind, onPlan: v === "" ? null : v === "yes" })} /></div>
              <div className="field"><span className="label">چک‌لیست قوانین شخصی</span>
                {pre.mind.checklist.length === 0 && <p className="muted small">قوانین را در <Link to="/settings">تنظیمات</Link> تعریف کنید.</p>}
                {pre.mind.checklist.map((c) => (
                  <label key={c.id} className="row">
                    <input type="checkbox" checked={c.checked} onChange={(e) => set("mind", { ...pre.mind, checklist: pre.mind.checklist.map((x) => (x.id === c.id ? { ...x, checked: e.target.checked } : x)) })} />
                    <span>{c.text}</span>
                  </label>
                ))}
              </div>
            </Section>
          </div>
        </div>
      )}

      <div className="statusbar">
        <div>
          <StatusBadge status={pos.status} reviewed={!!pos.reviewedAt} />
          {draft && <span className={saveClass} role="status">{saveStateText[autosave.state]}</span>}
          <span className="grow" />
          {draft && (
            <>
              <button className="btn danger icon" aria-label="حذف" onClick={remove}><Trash2 size={16} strokeWidth={1.5} /></button>
              <button className="btn" disabled={busy} onClick={abandon}>منصرف شدم</button>
              <button className="btn primary" disabled={busy} onClick={goOpen}>وارد شدم</button>
            </>
          )}
          {pos.status === "open" && (
            <button className="btn primary" disabled={busy} onClick={() => setClosing({ exitPrice: null, exitTime: Date.now(), exitReason: "" })}>بستم و ثبت نتیجه</button>
          )}
          {pos.status !== "draft" && pos.status !== "open" && (
            <Link className="btn primary" to={`/p/${id}/review`}>صفحه‌ی بازبینی</Link>
          )}
        </div>
      </div>

      {closing && pre && (
        <div className="overlay" onClick={() => setClosing(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="ثبت نتیجه" onClick={(e) => e.stopPropagation()}>
            <h2>بستن پوزیشن</h2>
            <Field label="قیمت خروج"><NumField value={closing.exitPrice} onChange={(v) => setClosing({ ...closing, exitPrice: v })} /></Field>
            <Field label="زمان خروج"><input type="datetime-local" className="input ltr" value={toLocalInput(closing.exitTime)} onChange={(e) => setClosing({ ...closing, exitTime: fromLocalInput(e.target.value) })} /></Field>
            <div className="field"><span className="label">دلیل خروج</span>
              <ChipSelect<ExitReason> options={(Object.keys(exitLabel) as Exclude<ExitReason, "">[]).map((v) => ({ value: v, label: exitLabel[v] }))} value={closing.exitReason} onChange={(v) => setClosing({ ...closing, exitReason: v })} /></div>
            {(() => {
              const c = compute(pre, { exitPrice: closing.exitPrice, exitTime: null, exitReason: "", mistakes: [], executionScore: null, lesson: "" });
              return <p className="muted">R محقق‌شده: <SignedValue value={c.realizedR} suffix="R" /> · سود و زیان: <SignedValue value={c.pnl} suffix={` ${settings.currency}`} /> {c.riskPerUnit == null && <span className="small">(برای محاسبه‌ی R ورود و حد ضرر لازم است: <bdi className="num">{fmtNum(pre.plan.entry)}</bdi>)</span>}</p>;
            })()}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => setClosing(null)}>انصراف</button>
              <button className="btn primary" disabled={busy} onClick={doClose}>ثبت و رفتن به بازبینی</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
