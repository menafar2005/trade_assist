package api

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	_ "modernc.org/sqlite"

	"tradejournal/internal/blob"
	"tradejournal/internal/model"
	"tradejournal/internal/store"
	"tradejournal/migrations"
)

func newTestAPI(t *testing.T, cfg Config) (*API, *httptest.Server) {
	t.Helper()
	db, err := sql.Open("sqlite", "file:"+filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { db.Close() })
	st := store.New(db)
	script, _ := migrations.FS.ReadFile("0001_init.sql")
	if err := st.Migrate(context.Background(), string(script)); err != nil {
		t.Fatal(err)
	}
	a := New(st, blob.FS{Dir: t.TempDir()}, cfg)
	srv := httptest.NewServer(a)
	t.Cleanup(srv.Close)
	return a, srv
}

type client struct {
	t    *testing.T
	base string
	c    *http.Client
}

func newClient(t *testing.T, srv *httptest.Server) *client {
	jar, _ := cookiejarNew()
	return &client{t: t, base: srv.URL, c: &http.Client{Jar: jar}}
}

func (c *client) do(method, path string, body any, out any) int {
	c.t.Helper()
	var rd io.Reader
	if b, ok := body.([]byte); ok {
		rd = bytes.NewReader(b)
	} else if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.base+path, rd)
	if body != nil {
		if _, raw := body.([]byte); !raw {
			req.Header.Set("Content-Type", "application/json")
		}
	}
	resp, err := c.c.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer resp.Body.Close()
	if out != nil {
		raw, _ := io.ReadAll(resp.Body)
		if p, ok := out.(*[]byte); ok {
			*p = raw
		} else if err := json.Unmarshal(raw, out); err != nil {
			c.t.Fatalf("decode %s %s: %v: %s", method, path, err, raw)
		}
	}
	return resp.StatusCode
}

func fp(v float64) *float64 { return &v }

func TestAuth(t *testing.T) {
	_, srv := newTestAPI(t, Config{Password: "s3cret"})
	c := newClient(t, srv)
	if code := c.do("GET", "/api/positions", nil, nil); code != 401 {
		t.Fatalf("unauthenticated list = %d", code)
	}
	if code := c.do("POST", "/api/login", map[string]string{"password": "nope"}, nil); code != 401 {
		t.Fatalf("bad login = %d", code)
	}
	if code := c.do("POST", "/api/login", map[string]string{"password": "s3cret"}, nil); code != 200 {
		t.Fatalf("login = %d", code)
	}
	if code := c.do("GET", "/api/positions", nil, nil); code != 200 {
		t.Fatalf("authenticated list = %d", code)
	}
	c.do("POST", "/api/logout", nil, nil)
	if code := c.do("GET", "/api/positions", nil, nil); code != 401 {
		t.Fatalf("after logout = %d", code)
	}
	// forged cookie
	req, _ := http.NewRequest("GET", srv.URL+"/api/positions", nil)
	req.AddCookie(&http.Cookie{Name: cookieName, Value: "9999999999.deadbeef"})
	resp, _ := http.DefaultClient.Do(req)
	if resp.StatusCode != 401 {
		t.Fatalf("forged cookie = %d", resp.StatusCode)
	}
	// cross-origin write is refused
	req, _ = http.NewRequest("POST", srv.URL+"/api/login", strings.NewReader(`{"password":"s3cret"}`))
	req.Header.Set("Origin", "https://evil.example")
	resp, _ = http.DefaultClient.Do(req)
	if resp.StatusCode != 403 {
		t.Fatalf("cross-origin login = %d", resp.StatusCode)
	}
}

func TestNotConfigured(t *testing.T) {
	_, srv := newTestAPI(t, Config{})
	c := newClient(t, srv)
	if code := c.do("GET", "/api/positions", nil, nil); code != 503 {
		t.Fatalf("unconfigured list = %d, want 503", code)
	}
}

func TestPositionLifecycle(t *testing.T) {
	a, srv := newTestAPI(t, Config{AuthDisabled: true})
	c := newClient(t, srv)

	// settings with a checklist rule flow into new positions
	var st model.Settings
	c.do("PUT", "/api/settings", model.Settings{MistakeTags: []string{"FOMO"}, Checklist: []model.ChecklistRule{{Text: "طبق پلن"}}}, &st)

	var p model.Position
	if code := c.do("POST", "/api/positions", map[string]any{}, &p); code != 201 {
		t.Fatalf("create = %d", code)
	}
	if p.Status != "draft" || len(p.Pre.Mind.Checklist) != 1 {
		t.Fatalf("new position: %+v", p)
	}

	// empty save is fine, no validation errors
	if code := c.do("PUT", "/api/positions/"+p.ID, map[string]any{"pre": model.Pre{}}, &p); code != 200 {
		t.Fatalf("empty save = %d", code)
	}

	pre := p.Pre
	pre.Basic = model.Basic{Symbol: "btcusdt", Market: "crypto", Direction: "long"}
	pre.Plan = model.Plan{Entry: fp(100), Stop: fp(95), Targets: []float64{110}, Size: fp(2), Balance: fp(1000)}
	pre.Technical = []model.Evidence{
		{Title: "breakout", Direction: "for", Weight: "high", Tags: []string{"price-action"}},
		{Title: "divergence", Direction: "against"},
	}
	pre.Signals = []model.Evidence{{Title: "channel call", Source: "Alpha"}}
	if code := c.do("PUT", "/api/positions/"+p.ID, map[string]any{"pre": pre}, &p); code != 200 {
		t.Fatalf("save = %d", code)
	}
	if p.Pre.Basic.Symbol != "BTCUSDT" || p.Calc.RiskPct == nil || *p.Calc.RiskPct != 1 {
		t.Fatalf("calc/normalise: %+v %+v", p.Pre.Basic, p.Calc)
	}
	if p.Pre.Technical[0].ID == "" {
		t.Fatal("evidence id not assigned")
	}

	// result cannot be written before the position is closed
	if code := c.do("PUT", "/api/positions/"+p.ID, map[string]any{"result": model.Result{}}, nil); code != 409 {
		t.Fatalf("result on draft = %d", code)
	}
	if code := c.do("POST", "/api/positions/"+p.ID+"/addenda", map[string]string{"text": "x"}, nil); code != 409 {
		t.Fatalf("addendum on draft = %d", code)
	}

	// open -> locks
	if code := c.do("POST", "/api/positions/"+p.ID+"/status", map[string]string{"status": "open"}, &p); code != 200 {
		t.Fatalf("open = %d", code)
	}
	if p.Status != "open" || p.LockedAt == nil || p.Pre.Basic.EntryTime == nil {
		t.Fatalf("not locked: %+v", p)
	}
	locked := p.Pre
	pre.Thesis.Summary = "rewritten history"
	if code := c.do("PUT", "/api/positions/"+p.ID, map[string]any{"pre": pre}, nil); code != 409 {
		t.Fatalf("editing locked pre = %d, want 409", code)
	}
	if code := c.do("POST", "/api/positions/"+p.ID+"/status", map[string]string{"status": "draft"}, nil); code != 409 {
		t.Fatalf("open->draft = %d, want 409", code)
	}

	var p2 model.Position
	if code := c.do("POST", "/api/positions/"+p.ID+"/addenda", map[string]string{"text": "moved to breakeven"}, &p2); code != 200 {
		t.Fatalf("addendum = %d", code)
	}
	a1, _ := json.Marshal(locked)
	a2, _ := json.Marshal(p2.Pre)
	if string(a1) != string(a2) || len(p2.Addenda) != 1 {
		t.Fatal("addendum changed the frozen section or was not stored")
	}

	// close with result
	res := model.Result{ExitPrice: fp(110), ExitReason: "target"}
	if code := c.do("POST", "/api/positions/"+p.ID+"/status", map[string]any{"status": "closed", "result": res}, &p); code != 200 {
		t.Fatalf("close = %d", code)
	}
	if p.Calc.RealizedR == nil || *p.Calc.RealizedR != 2 || p.Calc.PnL == nil || *p.Calc.PnL != 20 {
		t.Fatalf("realised calc: %+v", p.Calc)
	}
	res.Mistakes = []string{"FOMO"}
	score := 4
	res.ExecutionScore = &score
	if code := c.do("PUT", "/api/positions/"+p.ID, map[string]any{"result": res}, &p); code != 200 {
		t.Fatalf("review edit = %d", code)
	}
	if code := c.do("POST", "/api/positions/"+p.ID+"/status", map[string]string{"status": "reviewed"}, &p); code != 200 || p.ReviewedAt == nil {
		t.Fatalf("reviewed = %d", code)
	}

	// an abandoned idea
	var idea model.Position
	c.do("POST", "/api/positions", nil, &idea)
	c.do("PUT", "/api/positions/"+idea.ID, map[string]any{"pre": model.Pre{Basic: model.Basic{Symbol: "ETHUSDT"}, Thesis: model.Thesis{Summary: "idea"}}}, nil)
	if code := c.do("POST", "/api/positions/"+idea.ID+"/status", map[string]string{"status": "abandoned"}, &idea); code != 200 || idea.LockedAt == nil {
		t.Fatalf("abandon = %d", code)
	}
	if code := c.do("POST", "/api/positions/"+idea.ID+"/status", map[string]string{"status": "reviewed"}, &idea); code != 200 || idea.Status != "abandoned" || idea.ReviewedAt == nil {
		t.Fatalf("review abandoned: %d %+v", code, idea.Status)
	}

	// filters
	list := func(q string) []model.Summary {
		var out []model.Summary
		if code := c.do("GET", "/api/positions?"+q, nil, &out); code != 200 {
			t.Fatalf("list %q = %d", q, code)
		}
		return out
	}
	if n := len(list("")); n != 2 {
		t.Fatalf("all = %d", n)
	}
	if n := len(list("outcome=win")); n != 1 {
		t.Fatalf("win = %d", n)
	}
	if n := len(list("outcome=loss")); n != 0 {
		t.Fatalf("loss = %d", n)
	}
	if n := len(list("tag=FOMO")); n != 1 {
		t.Fatalf("tag = %d", n)
	}
	if n := len(list("tag=price-action")); n != 1 {
		t.Fatalf("evidence tag = %d", n)
	}
	if n := len(list("source=Alpha")); n != 1 {
		t.Fatalf("source = %d", n)
	}
	if n := len(list("status=abandoned")); n != 1 {
		t.Fatalf("status = %d", n)
	}
	if n := len(list("q=divergence")); n != 1 {
		t.Fatalf("search evidence = %d", n)
	}
	if n := len(list("q=BREAKEVEN")); n != 1 {
		t.Fatalf("search addendum = %d", n)
	}
	if n := len(list("q=%25")); n != 0 {
		t.Fatalf("LIKE wildcard must be escaped, got %d", n)
	}
	if n := len(list("symbol=ethusdt")); n != 1 {
		t.Fatalf("symbol = %d", n)
	}
	got := list("")
	for _, s := range got {
		if s.ID == p.ID && (s.EvidenceCount != 3 || s.AgainstCount != 1) {
			t.Fatalf("counts: %+v", s)
		}
	}
	_ = a
}

func pngBytes() []byte {
	return []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7\x9a\xa0\xa0\x00\x00\x00\x00IEND\xaeB`\x82")
}

func TestImagesAndBackupRoundTrip(t *testing.T) {
	_, srv := newTestAPI(t, Config{AuthDisabled: true})
	c := newClient(t, srv)

	var bad map[string]string
	if code := c.do("POST", "/api/images", []byte("<svg onload=alert(1)>"), &bad); code != 415 {
		t.Fatalf("svg upload = %d", code)
	}
	var up struct{ ID, URL string }
	if code := c.do("POST", "/api/images", pngBytes(), &up); code != 201 {
		t.Fatalf("upload = %d", code)
	}
	resp, err := http.Get(srv.URL + up.URL)
	if err != nil || resp.StatusCode != 200 || resp.Header.Get("Content-Type") != "image/png" {
		t.Fatalf("get image: %v %v", err, resp)
	}
	if code := c.do("GET", "/api/images/..%2f..%2fetc", nil, nil); code != 404 {
		t.Fatalf("traversal = %d", code)
	}

	var p model.Position
	c.do("POST", "/api/positions", nil, &p)
	pre := model.Pre{Basic: model.Basic{Symbol: "SOLUSDT"}, Technical: []model.Evidence{{Title: "chart", Images: []string{up.ID}}}}
	c.do("PUT", "/api/positions/"+p.ID, map[string]any{"pre": pre}, nil)
	c.do("POST", "/api/settings", nil, nil)
	c.do("PUT", "/api/settings", model.Settings{MistakeTags: []string{"custom"}}, nil)

	var zipBytes []byte
	if code := c.do("GET", "/api/export", nil, &zipBytes); code != 200 {
		t.Fatalf("export = %d", code)
	}
	zr, err := zip.NewReader(bytes.NewReader(zipBytes), int64(len(zipBytes)))
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, f := range zr.File {
		names[f.Name] = true
	}
	if !names["journal.json"] || !names["images/"+up.ID] {
		t.Fatalf("zip contents: %v", names)
	}

	// import into a fresh instance
	_, srv2 := newTestAPI(t, Config{AuthDisabled: true})
	c2 := newClient(t, srv2)
	var summary map[string]int
	if code := c2.do("POST", "/api/import", zipBytes, &summary); code != 200 || summary["positions"] != 1 || summary["images"] != 1 {
		t.Fatalf("import = %d %v", code, summary)
	}
	var got model.Position
	if code := c2.do("GET", "/api/positions/"+p.ID, nil, &got); code != 200 || got.Pre.Basic.Symbol != "SOLUSDT" {
		t.Fatalf("imported position: %d %+v", code, got.Pre.Basic)
	}
	r2, _ := http.Get(srv2.URL + "/api/images/" + up.ID)
	if r2.StatusCode != 200 {
		t.Fatalf("imported image = %d", r2.StatusCode)
	}
	var s2 model.Settings
	c2.do("GET", "/api/settings", nil, &s2)
	if len(s2.MistakeTags) != 1 || s2.MistakeTags[0] != "custom" {
		t.Fatalf("imported settings: %+v", s2)
	}
	if code := c2.do("POST", "/api/import", []byte("not a zip"), nil); code != 400 {
		t.Fatalf("garbage import = %d", code)
	}
}
