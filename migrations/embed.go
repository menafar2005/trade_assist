// Package migrations embeds the SQL schema so the native server can apply it;
// on Cloudflare the same files are applied with `wrangler d1 migrations apply`.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
