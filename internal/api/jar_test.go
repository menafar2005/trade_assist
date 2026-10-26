package api

import (
	"net/http"
	"net/http/cookiejar"
)

func cookiejarNew() (http.CookieJar, error) { return cookiejar.New(nil) }
