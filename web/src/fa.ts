import type { EvDirection, ExitReason, Market, Mood, Status, Style, Weight } from "./types";

export const statusLabel: Record<Status, string> = {
  draft: "پیش‌نویس",
  open: "باز",
  closed: "بسته",
  reviewed: "بازبینی‌شده",
  abandoned: "منصرف‌شده",
};
export const marketLabel: Record<Exclude<Market, "">, string> = { crypto: "کریپتو", forex: "فارکس", stock: "بورس", other: "سایر" };
export const styleLabel: Record<Exclude<Style, "">, string> = { scalp: "اسکالپ", day: "دی", swing: "سوئینگ", position: "پوزیشن" };
export const moodLabel: Record<Exclude<Mood, "">, string> = { calm: "آرام", hasty: "عجول", tired: "خسته", revenge: "انتقام‌جو", fomo: "FOMO" };
export const exitLabel: Record<Exclude<ExitReason, "">, string> = { target: "تارگت", stop: "حد ضرر", manual: "دستی", trailing: "تریلینگ" };
export const evDirLabel: Record<EvDirection, string> = { for: "موافق پوزیشن", against: "مخالف پوزیشن", neutral: "خنثی" };
export const weightLabel: Record<Weight, string> = { low: "کم", mid: "متوسط", high: "زیاد" };

export const warningLabel: Record<string, string> = {
  stop_wrong_side: "حد ضرر در سمت اشتباه ورود است (برای لانگ باید پایین‌تر، برای شورت بالاتر).",
  target_wrong_side: "حداقل یک تارگت در جهت مخالف پوزیشن قرار دارد.",
};

export const SECTIONS = [
  { id: "basic", title: "اطلاعات پایه" },
  { id: "plan", title: "پلن معامله" },
  { id: "thesis", title: "تز معامله" },
  { id: "technical", title: "شواهد تکنیکال" },
  { id: "fundamental", title: "شواهد فاندامنتال و خبری" },
  { id: "signals", title: "سیگنال‌ها و سنتیمنت" },
  { id: "mind", title: "وضعیت ذهنی و چک‌لیست" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];
