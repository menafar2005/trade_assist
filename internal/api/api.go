// Package api implements the JSON HTTP API of the trade journal.
package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"tradejournal/internal/blob"
	"tradejournal/internal/model"
	"tradejournal/internal/store"
)

type Config struct {
	// Password protects the whole API. Empty means "not configured": every
	// protected route answers 503 unless AuthDisabled is set (local dev only).
	Password string
	// SessionSecret signs session cookies; falls back to Password.
	SessionSecret string
	AuthDisabled  bool
}

type API struct {
	st  *store.Store
	bl  blob.Store
	cfg Config
	mux *http.ServeMux
	// Now returns epoch milliseconds; replaceable in tests.
	Now func() int64
}

const (
	maxJSONBody  = 2 << 20
	maxImageBody = 8 << 20
	maxZipBody   = 40 << 20
)

func New(st *store.Store, bl blob.Store, cfg Config) *API {
	a := &API{st: st, bl: bl, cfg: cfg, mux: http.NewServeMux(),
		Now: func() int64 { return time.Now().UnixMilli() }}
	a.routes()
	return a
}

func (a *API) routes() {
	m := a.mux
	m.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) { writeJSON(w, 200, map[string]bool{"ok": true}) })
	m.HandleFunc("GET /api/session", a.handleSession)
	m.HandleFunc("POST /api/login", a.handleLogin)
	m.HandleFunc("POST /api/logout", a.handleLogout)

	m.HandleFunc("GET /api/positions", a.auth(a.listPositions))
	m.HandleFunc("POST /api/positions", a.auth(a.createPosition))
	m.HandleFunc("GET /api/positions/{id}", a.auth(a.getPosition))
	m.HandleFunc("PUT /api/positions/{id}", a.auth(a.updatePosition))
	m.HandleFunc("DELETE /api/positions/{id}", a.auth(a.deletePosition))
	m.HandleFunc("POST /api/positions/{id}/status", a.auth(a.changeStatus))
	m.HandleFunc("POST /api/positions/{id}/addenda", a.auth(a.addAddendum))
	m.HandleFunc("GET /api/symbols", a.auth(a.listSymbols))

	m.HandleFunc("GET /api/settings", a.auth(a.getSettings))
	m.HandleFunc("PUT /api/settings", a.auth(a.putSettings))

	m.HandleFunc("POST /api/images", a.auth(a.uploadImage))
	m.HandleFunc("GET /api/images/{id}", a.auth(a.getImage))

	m.HandleFunc("GET /api/export", a.auth(a.export))
	m.HandleFunc("POST /api/import", a.auth(a.importZip))

	m.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) { fail(w, 404, "not_found", "مسیر پیدا نشد") })
}

func (a *API) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodGet && r.Method != http.MethodHead && !sameOrigin(r) {
		fail(w, 403, "bad_origin", "origin مجاز نیست")
		return
	}
	a.mux.ServeHTTP(w, r)
}

// sameOrigin rejects cross-site writes (defence in depth next to SameSite cookies).
func sameOrigin(r *http.Request) bool {
	o := r.Header.Get("Origin")
	if o == "" {
		return true
	}
	// Workers may not populate Host; the request URL carries it then.
	host := r.Host
	if host == "" {
		host = r.URL.Host
	}
	return host != "" && strings.HasSuffix(o, "://"+host)
}

// ---- helpers ----

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func fail(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]string{"error": code, "message": msg})
}

func serverError(w http.ResponseWriter, err error) {
	log.Printf("internal error: %v", err)
	fail(w, 500, "internal", "خطای داخلی سرور")
}

func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBody)
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		fail(w, 400, "bad_json", "بدنه‌ی درخواست معتبر نیست")
		return false
	}
	return true
}

func newID() string {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func validID(id string) bool {
	if id == "" || len(id) > 64 {
		return false
	}
	for _, c := range id {
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F' || c == '-') {
			return false
		}
	}
	return true
}

func (a *API) loadPosition(w http.ResponseWriter, r *http.Request) *model.Position {
	p, err := a.st.Get(r.Context(), r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		fail(w, 404, "not_found", "پوزیشن پیدا نشد")
		return nil
	}
	if err != nil {
		serverError(w, err)
		return nil
	}
	return p
}

func (a *API) save(w http.ResponseWriter, ctx context.Context, p *model.Position, from string) bool {
	err := a.st.Save(ctx, p, from)
	if errors.Is(err, store.ErrConflict) {
		fail(w, 409, "conflict", "وضعیت پوزیشن در این فاصله تغییر کرده است؛ صفحه را تازه کنید")
		return false
	}
	if err != nil {
		serverError(w, err)
		return false
	}
	return true
}

// ---- positions ----

func (a *API) listPositions(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := store.Filter{
		Q: strings.TrimSpace(q.Get("q")), Outcome: q.Get("outcome"), Symbol: q.Get("symbol"),
		Tag: q.Get("tag"), Source: q.Get("source"),
	}
	if s := q.Get("status"); s != "" {
		f.Statuses = strings.Split(s, ",")
	}
	if v, err := strconv.ParseInt(q.Get("from"), 10, 64); err == nil {
		f.From = &v
	}
	if v, err := strconv.ParseInt(q.Get("to"), 10, 64); err == nil {
		f.To = &v
	}
	f.Limit, _ = strconv.Atoi(q.Get("limit"))
	f.Offset, _ = strconv.Atoi(q.Get("offset"))
	list, err := a.st.List(r.Context(), f)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, 200, list)
}

func (a *API) listSymbols(w http.ResponseWriter, r *http.Request) {
	s, err := a.st.Symbols(r.Context())
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, 200, s)
}

func (a *API) createPosition(w http.ResponseWriter, r *http.Request) {
	settings, err := a.st.GetSettings(r.Context())
	if err != nil {
		serverError(w, err)
		return
	}
	now := a.Now()
	p := &model.Position{ID: newID(), Status: model.StatusDraft, CreatedAt: now, UpdatedAt: now}
	for _, rule := range settings.Checklist {
		p.Pre.Mind.Checklist = append(p.Pre.Mind.Checklist, model.CheckItem{ID: rule.ID, Text: rule.Text})
	}
	if err := a.st.Create(r.Context(), p); err != nil {
		serverError(w, err)
		return
	}
	p, _ = a.st.Get(r.Context(), p.ID)
	writeJSON(w, 201, p)
}

func (a *API) getPosition(w http.ResponseWriter, r *http.Request) {
	if p := a.loadPosition(w, r); p != nil {
		writeJSON(w, 200, p)
	}
}

type updateReq struct {
	Pre    *model.Pre    `json:"pre"`
	Result *model.Result `json:"result"`
}

func (a *API) updatePosition(w http.ResponseWriter, r *http.Request) {
	var req updateReq
	if !decode(w, r, &req) {
		return
	}
	p := a.loadPosition(w, r)
	if p == nil {
		return
	}
	from := p.Status
	if req.Pre != nil {
		if p.Status != model.StatusDraft {
			fail(w, 409, "locked", "بخش‌های ۱ تا ۷ پس از ورود قفل هستند؛ فقط یادداشت تکمیلی ممکن است")
			return
		}
		p.Pre = model.SanitizePre(*req.Pre, newID)
	}
	if req.Result != nil {
		switch p.Status {
		case model.StatusClosed, model.StatusReviewed, model.StatusAbandoned:
			p.Result = model.SanitizeResult(*req.Result)
		default:
			fail(w, 409, "not_closed", "نتیجه فقط بعد از بستن پوزیشن ثبت می‌شود")
			return
		}
	}
	p.UpdatedAt = a.Now()
	if !a.save(w, r.Context(), p, from) {
		return
	}
	a.respondFresh(w, r, p.ID)
}

func (a *API) respondFresh(w http.ResponseWriter, r *http.Request, id string) {
	p, err := a.st.Get(r.Context(), id)
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, 200, p)
}

func (a *API) deletePosition(w http.ResponseWriter, r *http.Request) {
	err := a.st.Delete(r.Context(), r.PathValue("id"))
	if errors.Is(err, store.ErrNotFound) {
		fail(w, 404, "not_found", "پوزیشن پیدا نشد")
		return
	}
	if err != nil {
		serverError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type statusReq struct {
	Status string        `json:"status"`
	Result *model.Result `json:"result"`
}

func (a *API) changeStatus(w http.ResponseWriter, r *http.Request) {
	var req statusReq
	if !decode(w, r, &req) {
		return
	}
	p := a.loadPosition(w, r)
	if p == nil {
		return
	}
	from, now := p.Status, a.Now()
	bad := func() {
		fail(w, 409, "bad_transition", "این تغییر وضعیت مجاز نیست")
	}
	switch {
	case from == model.StatusDraft && req.Status == model.StatusOpen:
		if p.Pre.Basic.EntryTime == nil {
			p.Pre.Basic.EntryTime = &now
		}
		p.Status, p.OpenedAt, p.LockedAt = model.StatusOpen, &now, &now
	case from == model.StatusDraft && req.Status == model.StatusAbandoned:
		p.Status, p.LockedAt = model.StatusAbandoned, &now
	case from == model.StatusOpen && req.Status == model.StatusClosed:
		if req.Result != nil {
			p.Result = model.SanitizeResult(*req.Result)
			p.Result.ExitTime = req.Result.ExitTime
		}
		if p.Result.ExitTime == nil {
			p.Result.ExitTime = &now
		}
		p.Status, p.ClosedAt = model.StatusClosed, &now
	case from == model.StatusClosed && req.Status == model.StatusReviewed:
		p.Status, p.ReviewedAt = model.StatusReviewed, &now
	case from == model.StatusAbandoned && req.Status == model.StatusReviewed:
		// an idea that was never entered stays "abandoned" but counts as reviewed
		p.ReviewedAt = &now
	case from == model.StatusReviewed && req.Status == model.StatusClosed:
		p.Status, p.ReviewedAt = model.StatusClosed, nil
	default:
		bad()
		return
	}
	p.UpdatedAt = now
	if !a.save(w, r.Context(), p, from) {
		return
	}
	a.respondFresh(w, r, p.ID)
}

func (a *API) addAddendum(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Text string `json:"text"`
	}
	if !decode(w, r, &req) {
		return
	}
	text := strings.TrimSpace(req.Text)
	if text == "" {
		fail(w, 400, "empty", "متن یادداشت خالی است")
		return
	}
	if len([]rune(text)) > 5000 {
		text = string([]rune(text)[:5000])
	}
	p := a.loadPosition(w, r)
	if p == nil {
		return
	}
	if p.Status == model.StatusDraft {
		fail(w, 409, "not_locked", "در حالت پیش‌نویس مستقیم ویرایش کنید؛ یادداشت تکمیلی بعد از ورود است")
		return
	}
	if len(p.Addenda) >= 200 {
		fail(w, 409, "too_many", "تعداد یادداشت‌ها به سقف رسیده است")
		return
	}
	now := a.Now()
	p.Addenda = append(p.Addenda, model.Addendum{ID: newID(), At: now, Text: text})
	p.UpdatedAt = now
	if !a.save(w, r.Context(), p, p.Status) {
		return
	}
	a.respondFresh(w, r, p.ID)
}

// ---- settings ----

func (a *API) getSettings(w http.ResponseWriter, r *http.Request) {
	s, err := a.st.GetSettings(r.Context())
	if err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, 200, s)
}

func (a *API) putSettings(w http.ResponseWriter, r *http.Request) {
	var s model.Settings
	if !decode(w, r, &s) {
		return
	}
	s = model.SanitizeSettings(s, newID)
	if err := a.st.PutSettings(r.Context(), s); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, 200, s)
}
