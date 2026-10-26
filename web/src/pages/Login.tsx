import { useState } from "react";
import { api, ApiError } from "../api";

export default function Login({ configured, onDone }: { configured: boolean; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="center">
      <form className="card stack" style={{ width: "min(360px, 100%)" }} onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try { await api.login(password); onDone(); } catch (x) { setErr(x instanceof ApiError ? x.message : "ورود ناموفق بود"); } finally { setBusy(false); }
      }}>
        <h1>ژورنال تحلیل پوزیشن</h1>
        {!configured ? (
          <p className="warn" role="alert">رمز عبور روی سرور تنظیم نشده است. مقدار APP_PASSWORD را به‌عنوان secret تعریف کنید.</p>
        ) : (
          <>
            <label className="field"><span className="label">رمز عبور</span>
              <input className="input ltr" type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {err && <p className="neg" role="alert">{err}</p>}
            <button className="btn primary" disabled={busy || !password}>ورود</button>
          </>
        )}
      </form>
    </div>
  );
}
