import { useCallback, useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

/**
 * Debounced autosave. `schedule(value)` queues a save `delay` ms after the last
 * change; `flush()` saves immediately. Pending changes are flushed when the page
 * is hidden or the component unmounts so closing the window loses nothing.
 */
export function useAutosave<T>(save: (v: T) => Promise<void>, delay = 2000) {
  const [state, setState] = useState<SaveState>("idle");
  const pending = useRef<{ v: T } | null>(null);
  const timer = useRef<number>(0);
  const running = useRef<Promise<void>>(Promise.resolve());
  const saveRef = useRef(save);
  saveRef.current = save;

  const run = useCallback(() => {
    window.clearTimeout(timer.current);
    const job = pending.current;
    if (!job) return running.current;
    pending.current = null;
    setState("saving");
    running.current = running.current
      .then(() => saveRef.current(job.v))
      .then(() => setState(pending.current ? "dirty" : "saved"))
      .catch(() => {
        pending.current ??= job; // keep the change so the next attempt retries it
        setState("error");
      });
    return running.current;
  }, []);

  const schedule = useCallback((v: T) => {
    pending.current = { v };
    setState("dirty");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(run, delay);
  }, [delay, run]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") void run(); };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (pending.current) { void run(); e.preventDefault(); }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
      void run();
    };
  }, [run]);

  return { state, schedule, flush: run };
}

export const saveStateText: Record<SaveState, string> = {
  idle: "",
  dirty: "تغییرات ذخیره نشده…",
  saving: "در حال ذخیره…",
  saved: "ذخیره شد",
  error: "ذخیره نشد؛ دوباره تلاش می‌شود",
};
