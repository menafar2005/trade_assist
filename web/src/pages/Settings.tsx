import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, LogOut, Plus, Upload, X } from "lucide-react";
import { api } from "../api";
import type { Settings } from "../types";
import { useSettings } from "../settings";
import { saveStateText, useAutosave } from "../useAutosave";
import { Field, useUI } from "../components/ui";

function ListEditor({ title, hint, items, onChange }: { title: string; hint?: string; items: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (t && !items.includes(t)) onChange([...items, t]);
    setText("");
  };
  return (
    <div className="card stack">
      <h2>{title}</h2>
      {hint && <p className="muted small">{hint}</p>}
      <div className="chips">
        {items.map((t) => (
          <span key={t} className="chip static">
            {t}
            <button type="button" className="btn icon ghost" style={{ minWidth: 20, minHeight: 20, padding: 0 }} aria-label={`حذف ${t}`} onClick={() => onChange(items.filter((x) => x !== t))}>
              <X size={12} strokeWidth={1.5} />
            </button>
          </span>
        ))}
        {items.length === 0 && <span className="muted small">موردی تعریف نشده است.</span>}
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input className="input grow" aria-label={`افزودن به ${title}`} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn" type="submit" disabled={!text.trim()}><Plus size={16} strokeWidth={1.5} /> افزودن</button>
      </form>
    </div>
  );
}

export default function SettingsPage({ onLogout }: { onLogout: () => void }) {
  const { settings, set } = useSettings();
  const ui = useUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const autosave = useAutosave<Settings>(async (s) => { set(await api.saveSettings(s)); }, 800);

  const update = (p: Partial<Settings>) => {
    const next = { ...settings, ...p };
    set(next);
    autosave.schedule(next);
  };

  return (
    <>
      <div className="topbar">
        <Link to="/" className="btn icon ghost" aria-label="بازگشت به لیست"><ArrowLeft className="flip" size={20} strokeWidth={1.5} /></Link>
        <h1>تنظیمات</h1>
        <span className="savestate" role="status">{saveStateText[autosave.state]}</span>
      </div>
      <div className="stack">
        <ListEditor title="تگ اشتباهات" hint="در بازبینی پوزیشن‌های بسته انتخاب می‌شوند." items={settings.mistakeTags} onChange={(v) => update({ mistakeTags: v })} />
        <ListEditor title="تگ شواهد" items={settings.evidenceTags} onChange={(v) => update({ evidenceTags: v })} />
        <ListEditor title="منابع سیگنال" hint="کانال، شخص یا ربات؛ در شواهد سیگنال و فیلتر لیست استفاده می‌شود." items={settings.signalSources} onChange={(v) => update({ signalSources: v })} />
        <ListEditor title="چک‌لیست قوانین شخصی" hint="در بخش ۷ هر پوزیشن جدید تیک زده می‌شود." items={settings.checklist.map((c) => c.text)}
          onChange={(texts) => update({ checklist: texts.map((t) => settings.checklist.find((c) => c.text === t) ?? { id: crypto.randomUUID(), text: t }) })} />
        <div className="card stack">
          <h2>واحد پول</h2>
          <Field label="واحد نمایش مبلغ ریسک و سود و زیان">
            <input className="input ltr" style={{ maxWidth: 160 }} value={settings.currency} maxLength={12} onChange={(e) => update({ currency: e.target.value })} />
          </Field>
        </div>
        <div className="card stack">
          <h2>پشتیبان‌گیری</h2>
          <p className="muted small">خروجی کامل شامل همه‌ی پوزیشن‌ها، تنظیمات و تصاویر در یک فایل ZIP است. ورودی با پوزیشن‌های هم‌شناسه ادغام می‌شود.</p>
          <div className="row wrap">
            <a className="btn" href="/api/export" download><Download size={16} strokeWidth={1.5} /> دریافت پشتیبان</a>
            <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={16} strokeWidth={1.5} /> بازیابی از فایل</button>
            <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const r = await api.importZip(f);
                ui.toast(`${r.positions} پوزیشن و ${r.images} تصویر بازیابی شد`);
                const s = await api.settings();
                set(s);
              } catch (err) {
                ui.toast((err as Error).message, true);
              }
            }} />
          </div>
        </div>
        <div className="row"><button className="btn danger" onClick={onLogout}><LogOut size={16} strokeWidth={1.5} /> خروج</button></div>
      </div>
    </>
  );
}
