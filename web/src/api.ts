import type { Position, Pre, Result, Settings, Summary } from "./types";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, raw?: Blob): Promise<T> {
  const init: RequestInit = { method, credentials: "same-origin", headers: {} };
  if (raw) {
    init.body = raw;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, "network", "اتصال به سرور برقرار نشد");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event("tj-unauthorized"));
    throw new ApiError(res.status, data?.error ?? "error", data?.message ?? "خطای ناشناخته");
  }
  return data as T;
}

export interface Filters {
  q?: string;
  status?: string;
  outcome?: string;
  symbol?: string;
  tag?: string;
  source?: string;
  from?: number;
  to?: number;
}

export const api = {
  session: () => request<{ authenticated: boolean; configured: boolean }>("GET", "/api/session"),
  login: (password: string) => request<{ authenticated: boolean }>("POST", "/api/login", { password }),
  logout: () => request<unknown>("POST", "/api/logout"),

  list: (f: Filters) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "") p.set(k, String(v));
    return request<Summary[]>("GET", `/api/positions?${p}`);
  },
  symbols: () => request<string[]>("GET", "/api/symbols"),
  create: () => request<Position>("POST", "/api/positions", {}),
  get: (id: string) => request<Position>("GET", `/api/positions/${id}`),
  savePre: (id: string, pre: Pre) => request<Position>("PUT", `/api/positions/${id}`, { pre }),
  saveResult: (id: string, result: Result) => request<Position>("PUT", `/api/positions/${id}`, { result }),
  setStatus: (id: string, status: string, result?: Result) =>
    request<Position>("POST", `/api/positions/${id}/status`, { status, result }),
  addAddendum: (id: string, text: string) => request<Position>("POST", `/api/positions/${id}/addenda`, { text }),
  remove: (id: string) => request<void>("DELETE", `/api/positions/${id}`),

  settings: () => request<Settings>("GET", "/api/settings"),
  saveSettings: (s: Settings) => request<Settings>("PUT", "/api/settings", s),

  uploadImage: (blob: Blob) => request<{ id: string; url: string }>("POST", "/api/images", undefined, blob),
  importZip: (file: Blob) => request<{ positions: number; images: number }>("POST", "/api/import", undefined, file),
};

export const imageUrl = (id: string) => `/api/images/${id}`;
