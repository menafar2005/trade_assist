import { useRef } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Link as LinkIcon, Minus, Plus, Trash2, X } from "lucide-react";
import type { Evidence, EvDirection, Weight } from "../types";
import { evDirLabel, weightLabel } from "../fa";
import { imageUrl } from "../api";
import { ChipSelect, Field, MultiChips, useUI } from "./ui";

export function newEvidence(): Evidence {
  return { id: crypto.randomUUID(), title: "", direction: "for", weight: "mid", timeframe: "", source: "", images: [], links: [], note: "", tags: [] };
}

const dirIcon: Record<EvDirection, typeof ArrowUp> = { for: ArrowUp, against: ArrowDown, neutral: Minus };

export function EvidenceList({ items, onChange, kind, tags, sources, activeId, onFocusItem, onAttach }: {
  items: Evidence[];
  onChange: (items: Evidence[]) => void;
  kind: "technical" | "fundamental" | "signals";
  tags: string[];
  sources: string[];
  activeId: string | null;
  onFocusItem: (id: string) => void;
  onAttach: (id: string, file: Blob) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const attachTo = useRef<string>("");
  const { showImage } = useUI();

  const patch = (id: string, p: Partial<Evidence>) => onChange(items.map((e) => (e.id === id ? { ...e, ...p } : e)));

  return (
    <div className="stack">
      {items.map((e) => {
        const Icon = dirIcon[e.direction];
        return (
          <div key={e.id} data-evidence-id={e.id} tabIndex={-1} onFocusCapture={() => onFocusItem(e.id)}
            className={`evidence ${e.direction} ${activeId === e.id ? "focused" : ""}`}>
            <div className="stack">
              <div className="row">
                <span className={e.direction === "for" ? "pos" : e.direction === "against" ? "neg" : "muted"} title={evDirLabel[e.direction]}>
                  <Icon size={16} strokeWidth={1.5} aria-label={evDirLabel[e.direction]} />
                </span>
                <input className="input grow" aria-label="عنوان شاهد" placeholder="عنوان یک‌خطی؛ مثلاً شکست مقاومت ۶۴ هزار در ۴ ساعته"
                  value={e.title} onChange={(ev) => patch(e.id, { title: ev.target.value })} />
                <button type="button" className="btn icon ghost" aria-label="حذف شاهد" onClick={() => onChange(items.filter((x) => x.id !== e.id))}>
                  <Trash2 size={16} strokeWidth={1.5} />
                </button>
              </div>
              <div className="row wrap">
                <ChipSelect<EvDirection> options={(Object.keys(evDirLabel) as EvDirection[]).map((v) => ({ value: v, label: evDirLabel[v] }))}
                  value={e.direction} onChange={(v) => patch(e.id, { direction: v || "neutral" })} />
                <span className="muted small">وزن:</span>
                <ChipSelect<Weight> options={(Object.keys(weightLabel) as Weight[]).map((v) => ({ value: v, label: weightLabel[v] }))}
                  value={e.weight} onChange={(v) => patch(e.id, { weight: v || "mid" })} />
              </div>
              <div className="grid">
                {kind === "technical" && (
                  <Field label="تایم‌فریم">
                    <input className="input ltr" value={e.timeframe} placeholder="4h" onChange={(ev) => patch(e.id, { timeframe: ev.target.value })} />
                  </Field>
                )}
                <Field label={kind === "signals" ? "منبع سیگنال" : "منبع (اختیاری)"}>
                  <input className="input" list={`src-${e.id}`} value={e.source} onChange={(ev) => patch(e.id, { source: ev.target.value })} />
                  <datalist id={`src-${e.id}`}>{sources.map((s) => <option key={s} value={s} />)}</datalist>
                </Field>
              </div>
              {(e.images.length > 0 || e.links.length > 0) && (
                <div className="thumbs">
                  {e.images.map((img) => (
                    <div className="thumb" key={img}>
                      <img src={imageUrl(img)} alt="پیوست شاهد" loading="lazy" onClick={() => showImage(img)} />
                      <button type="button" aria-label="حذف تصویر" onClick={() => patch(e.id, { images: e.images.filter((x) => x !== img) })}>
                        <X size={14} strokeWidth={1.5} />
                      </button>
                    </div>
                  ))}
                  {e.links.map((l) => (
                    <span key={l} className="chip static tag ltr">
                      <LinkIcon size={14} strokeWidth={1.5} />
                      <a href={l} target="_blank" rel="noopener noreferrer">{l.replace(/^https?:\/\//, "").slice(0, 36)}</a>
                      <button type="button" className="btn icon ghost" style={{ minWidth: 20, minHeight: 20, padding: 0 }} aria-label="حذف لینک"
                        onClick={() => patch(e.id, { links: e.links.filter((x) => x !== l) })}><X size={12} strokeWidth={1.5} /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="row wrap">
                <button type="button" className="btn" onClick={() => { attachTo.current = e.id; fileRef.current?.click(); }}>
                  <ImagePlus size={16} strokeWidth={1.5} /> تصویر
                </button>
                <button type="button" className="btn" onClick={() => {
                  const url = window.prompt("لینک (http یا https):");
                  if (url && /^https?:\/\//i.test(url.trim())) patch(e.id, { links: [...e.links, url.trim()] });
                }}>
                  <LinkIcon size={16} strokeWidth={1.5} /> لینک
                </button>
                <span className="muted small">یا با Ctrl+V تصویر را پیست کنید</span>
              </div>
              <textarea className="textarea" aria-label="یادداشت" placeholder="یادداشت" value={e.note} onChange={(ev) => patch(e.id, { note: ev.target.value })} />
              {tags.length > 0 && <MultiChips options={tags} value={e.tags} onChange={(t) => patch(e.id, { tags: t })} />}
            </div>
          </div>
        );
      })}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(ev) => {
        const f = ev.target.files?.[0];
        if (f && attachTo.current) onAttach(attachTo.current, f);
        ev.target.value = "";
      }} />
      <div className="row">
        <button type="button" className="btn" onClick={() => onChange([...items, newEvidence()])}>
          <Plus size={16} strokeWidth={1.5} /> افزودن شاهد
        </button>
      </div>
    </div>
  );
}
