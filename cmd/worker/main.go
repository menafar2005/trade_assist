//go:build js && wasm

// Command worker is the Cloudflare Workers entrypoint (Go compiled to WASM).
// Bindings: DB (D1), IMAGES (R2); secrets: APP_PASSWORD, SESSION_SECRET.
package main

import (
	"database/sql"
	"log"
	"net/http"

	workers "github.com/syumai/workers-go"
	"github.com/syumai/workers-go/cloudflare"
	_ "github.com/syumai/workers-go/cloudflare/d1"
	"github.com/syumai/workers-go/cloudflare/r2"

	"tradejournal/internal/api"
	"tradejournal/internal/blob"
	"tradejournal/internal/store"
)

func main() {
	workers.Serve(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Bindings are only reachable while a request is being served, so they
		// are opened per request instead of in main().
		db, err := sql.Open("d1", "DB")
		if err != nil {
			log.Printf("d1: %v", err)
			http.Error(w, "database binding missing", http.StatusInternalServerError)
			return
		}
		defer db.Close()
		bucket, err := r2.NewBucket("IMAGES")
		if err != nil {
			log.Printf("r2: %v", err)
			http.Error(w, "images bucket binding missing", http.StatusInternalServerError)
			return
		}
		cfg := api.Config{
			Password:      cloudflare.Getenv("APP_PASSWORD"),
			SessionSecret: cloudflare.Getenv("SESSION_SECRET"),
		}
		api.New(store.New(db), blob.R2{Bucket: bucket}, cfg).ServeHTTP(w, r)
	}))
}
