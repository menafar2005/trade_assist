package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"strconv"
	"strings"
)

const (
	cookieName = "tj_session"
	sessionTTL = 30 * 24 * 60 * 60 // seconds
)

func (a *API) secret() []byte {
	s := a.cfg.SessionSecret
	if s == "" {
		s = "tj-session:" + a.cfg.Password
	}
	return []byte(s)
}

func (a *API) sign(exp int64) string {
	m := hmac.New(sha256.New, a.secret())
	m.Write([]byte(strconv.FormatInt(exp, 10)))
	return strconv.FormatInt(exp, 10) + "." + hex.EncodeToString(m.Sum(nil))
}

func (a *API) validSession(r *http.Request) bool {
	c, err := r.Cookie(cookieName)
	if err != nil {
		return false
	}
	exp, _, ok := strings.Cut(c.Value, ".")
	n, err := strconv.ParseInt(exp, 10, 64)
	if !ok || err != nil || n < a.Now()/1000 {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(c.Value), []byte(a.sign(n))) == 1
}

// authenticated reports whether the request may use protected routes.
// The second value is false when the server has no password configured.
func (a *API) authenticated(r *http.Request) (ok, configured bool) {
	if a.cfg.AuthDisabled {
		return true, true
	}
	if a.cfg.Password == "" {
		return false, false
	}
	return a.validSession(r), true
}

func (a *API) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ok, configured := a.authenticated(r)
		switch {
		case !configured:
			fail(w, 503, "not_configured", "رمز عبور سرور تنظیم نشده است (APP_PASSWORD)")
		case !ok:
			fail(w, 401, "unauthorized", "ابتدا وارد شوید")
		default:
			next(w, r)
		}
	}
}

func (a *API) handleSession(w http.ResponseWriter, r *http.Request) {
	ok, configured := a.authenticated(r)
	writeJSON(w, 200, map[string]bool{"authenticated": ok, "configured": configured})
}

func (a *API) handleLogin(w http.ResponseWriter, r *http.Request) {
	if a.cfg.Password == "" {
		fail(w, 503, "not_configured", "رمز عبور سرور تنظیم نشده است (APP_PASSWORD)")
		return
	}
	var req struct {
		Password string `json:"password"`
	}
	if !decode(w, r, &req) {
		return
	}
	// compare hashes so length differences do not leak through timing
	got, want := sha256.Sum256([]byte(req.Password)), sha256.Sum256([]byte(a.cfg.Password))
	if subtle.ConstantTimeCompare(got[:], want[:]) != 1 {
		fail(w, 401, "bad_password", "رمز عبور نادرست است")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: a.sign(a.Now()/1000 + sessionTTL), Path: "/",
		MaxAge: sessionTTL, HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: isHTTPS(r),
	})
	writeJSON(w, 200, map[string]bool{"authenticated": true})
}

func (a *API) handleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", MaxAge: -1,
		HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: isHTTPS(r)})
	writeJSON(w, 200, map[string]bool{"authenticated": false})
}

func isHTTPS(r *http.Request) bool {
	return r.TLS != nil || r.URL.Scheme == "https" || r.Header.Get("X-Forwarded-Proto") == "https"
}
