// Command server runs the journal natively (SQLite file + local image folder)
// for development; production runs cmd/worker on Cloudflare Workers.
package main

import (
	"context"
	"database/sql"
	"flag"
	"log"
	"net/http"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"

	"tradejournal/internal/api"
	"tradejournal/internal/blob"
	"tradejournal/internal/store"
	"tradejournal/migrations"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8787", "listen address")
	data := flag.String("data", "./.devdata", "directory for the SQLite file and images")
	web := flag.String("web", "./web/dist", "built frontend directory")
	flag.Parse()

	if err := os.MkdirAll(*data, 0o755); err != nil {
		log.Fatal(err)
	}
	db, err := sql.Open("sqlite", "file:"+filepath.Join(*data, "journal.db")+"?_pragma=busy_timeout(5000)")
	if err != nil {
		log.Fatal(err)
	}
	st := store.New(db)
	script, err := migrations.FS.ReadFile("0001_init.sql")
	if err != nil {
		log.Fatal(err)
	}
	if err := st.Migrate(context.Background(), string(script)); err != nil {
		log.Fatal(err)
	}

	cfg := api.Config{
		Password:      os.Getenv("APP_PASSWORD"),
		SessionSecret: os.Getenv("SESSION_SECRET"),
		AuthDisabled:  os.Getenv("AUTH_DISABLED") == "true",
	}
	if cfg.Password == "" && !cfg.AuthDisabled {
		log.Print("APP_PASSWORD is not set: set it, or run with AUTH_DISABLED=true for local development")
	}
	mux := http.NewServeMux()
	mux.Handle("/api/", api.New(st, blob.FS{Dir: filepath.Join(*data, "images")}, cfg))
	mux.Handle("/", spa(*web))

	log.Printf("listening on http://%s", *addr)
	log.Fatal(http.ListenAndServe(*addr, mux))
}

// spa serves static files and falls back to index.html for client-side routes.
func spa(dir string) http.Handler {
	files := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := filepath.Join(dir, filepath.Clean("/"+r.URL.Path))
		if st, err := os.Stat(p); err != nil || st.IsDir() {
			r.URL.Path = "/"
		}
		files.ServeHTTP(w, r)
	})
}
