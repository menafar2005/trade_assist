import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, X } from "lucide-react";
import { imageUrl } from "../api";

/* ---------- global UI: toast, confirm, lightbox ---------- */

interface ConfirmOpts {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}
interface UICtx {
  toast: (msg: string, isError?: boolean) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
  showImage: (id: string) => void;
}
const Ctx = createContext<UICtx>(null as unknown as UICtx);
export const useUI = () => useContext(Ctx);

export function UIProvider({ children }: { children: ReactNode }) {
  const [toastMsg, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const [dlg, setDlg] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [img, setImg] = useState<string | null>(null);
  const timer = useRef<number>(0);

  const toast = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setDlg({ ...o, resolve })), []);
  const showImage = useCallback((id: string) => setImg(id), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setImg(null);
      setDlg((d) => {
        d?.resolve(false);
        return null;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Ctx.Provider value={{ toast, confirm, showImage }}>
      {children}
      {toastMsg && (
        <div className={`toast ${toastMsg.err ? "err" : ""}`} role="status" aria-live="polite">
          <div>{toastMsg.msg}</div>
        </div>
      )}
      {dlg && (
        <div className="overlay" onClick={() => { dlg.resolve(false); setDlg(null); }}>
          <div className="dialog" role="alertdialog" aria-modal="true" aria-label={dlg.title} onClick={(e) => e.stopPropagation()}>
            <h2>{dlg.title}</h2>
            {dlg.body && <div className="muted">{dlg.body}</div>}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => { dlg.resolve(false); setDlg(null); }}>انصراف</button>
              <button autoFocus className={`btn ${dlg.danger ? "danger" : "primary"}`} onClick={() => { dlg.resolve(true); setDlg(null); }}>
                {dlg.confirmLabel ?? "تأیید"}
              </button>
            </div>
          </div>
        </div>
      )}
      {img && (
        <div className="overlay lightbox" role="dialog" aria-modal="true" aria-label="تصویر" onClick={() => setImg(null)}>
          <button className="btn icon" style={{ position: "absolute", top: 16, insetInlineStart: 16 }} aria-label="بستن" onClick={() => setImg(null)}>
            <X size={20} strokeWidth={1.5} />
          </button>
          <img src={imageUrl(img)} alt="" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </Ctx.Provider>
  );
}

/* ---------- fields ---------- */

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className="field" style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

/** Numeric input holding a nullable number; keeps what the user typed (e.g. "0.") while editing. */
export function NumField({ value, onChange, unit, disabled, placeholder }: {
  value: number | null;
  onChange: (v: number | null) => void;
  unit?: string;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => {
    const parsed = parse(text);
    if (parsed !== value) setText(value == null ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const input = (
    <input
      className="input num-in num"
      inputMode="decimal"
      dir="ltr"
      disabled={disabled}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parse(e.target.value));
      }}
    />
  );
  return unit ? <div className="unit">{input}<span>{unit}</span></div> : input;
}

function parse(s: string): number | null {
  const t = s.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776)).replace(/[٬,]/g, "").replace("٫", ".");
  if (t === "" || t === "-" || t === ".") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Single choice; clicking the active chip clears it. */
export function ChipSelect<T extends string>({ options, value, onChange, disabled }: {
  options: { value: T; label: string }[];
  value: T | "";
  onChange: (v: T | "") => void;
  disabled?: boolean;
}) {
  return (
    <div className="chips" role="group">
      {options.map((o) => (
        <button key={o.value} type="button" className="chip" disabled={disabled} aria-pressed={value === o.value}
          onClick={() => onChange(value === o.value ? "" : o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MultiChips({ options, value, onChange, disabled }: {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const all = [...options, ...value.filter((v) => !options.includes(v))];
  return (
    <div className="chips" role="group">
      {all.map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" className="chip" disabled={disabled} aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}>
            {o}
          </button>
        );
      })}
    </div>
  );
}

export function Scale({ value, onChange, disabled, label }: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="scale" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" disabled={disabled} aria-pressed={value === n} onClick={() => onChange(value === n ? null : n)}>
          {n}
        </button>
      ))}
    </div>
  );
}

/* ---------- collapsible section ---------- */

export type Completion = "empty" | "partial" | "full";
const completionText: Record<Completion, string> = { empty: "خالی", partial: "بخشی", full: "کامل" };

export function CompletionDot({ state }: { state: Completion }) {
  return <span className={`dot ${state === "empty" ? "" : state}`} role="img" aria-label={completionText[state]} title={completionText[state]} />;
}

export function Section({ id, title, completion, locked, open, onToggle, children }: {
  id: string;
  title: string;
  completion: Completion;
  locked?: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section id={`sec-${id}`} data-section={id} className={`section ${open ? "open" : ""} ${locked ? "locked" : ""}`}>
      <header onClick={onToggle}>
        <CompletionDot state={completion} />
        <h2>
          <button type="button" className="btn ghost" style={{ padding: 0, minHeight: 0, font: "inherit", fontWeight: 600 }}
            aria-expanded={open} aria-controls={`body-${id}`} onClick={(e) => { e.stopPropagation(); onToggle(); }}>
            {title}
          </button>
        </h2>
        <span className="small muted">{completionText[completion]}</span>
        <ChevronDown className="chev" size={16} strokeWidth={1.5} />
      </header>
      <div className="collapse" id={`body-${id}`}>
        <div>
          <div className="body">{children}</div>
        </div>
      </div>
    </section>
  );
}
