import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { SettingsProvider } from "./settings";
import Login from "./pages/Login";
import List from "./pages/List";
import Editor from "./pages/Editor";
import Review from "./pages/Review";
import SettingsPage from "./pages/Settings";

export default function App() {
  const [auth, setAuth] = useState<{ authenticated: boolean; configured: boolean } | null>(null);
  const refresh = useCallback(() => api.session().then(setAuth).catch(() => setAuth({ authenticated: false, configured: true })), []);

  useEffect(() => {
    void refresh();
    const on = () => setAuth((a) => (a ? { ...a, authenticated: false } : a));
    window.addEventListener("tj-unauthorized", on);
    return () => window.removeEventListener("tj-unauthorized", on);
  }, [refresh]);

  if (!auth) return <div className="center muted">در حال بارگذاری…</div>;
  if (!auth.authenticated) return <Login configured={auth.configured} onDone={refresh} />;

  return (
    <SettingsProvider>
      <main className="app">
        <Routes>
          <Route path="/" element={<List />} />
          <Route path="/p/:id" element={<Editor />} />
          <Route path="/p/:id/review" element={<Review />} />
          <Route path="/settings" element={<SettingsPage onLogout={async () => { await api.logout(); await refresh(); }} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </SettingsProvider>
  );
}
