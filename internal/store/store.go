// Package store persists journal data in SQLite (Cloudflare D1 in production).
// D1 has no multi-statement transactions, so every write is a single statement.
package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"

	"tradejournal/internal/model"
)

var (
	ErrNotFound = errors.New("not found")
	// ErrConflict means the row changed state since it was read.
	ErrConflict = errors.New("conflict")
)

type Store struct{ db *sql.DB }

func New(db *sql.DB) *Store { return &Store{db: db} }

const cols = `id, status, created_at, updated_at, locked_at, opened_at, closed_at, reviewed_at, doc`

type scanner interface{ Scan(dest ...any) error }

func scanPosition(s scanner) (*model.Position, error) {
	var (
		p                                  model.Position
		doc                                string
		locked, opened, closed, reviewedAt sql.NullInt64
	)
	if err := s.Scan(&p.ID, &p.Status, &p.CreatedAt, &p.UpdatedAt, &locked, &opened, &closed, &reviewedAt, &doc); err != nil {
		return nil, err
	}
	p.LockedAt, p.OpenedAt, p.ClosedAt, p.ReviewedAt = nullInt(locked), nullInt(opened), nullInt(closed), nullInt(reviewedAt)
	if err := json.Unmarshal([]byte(doc), &p.Doc); err != nil {
		return nil, err
	}
	normalize(&p.Doc)
	p.Calc = model.Compute(p.Doc)
	return &p, nil
}

func nullInt(n sql.NullInt64) *int64 {
	if !n.Valid {
		return nil
	}
	v := n.Int64
	return &v
}

// normalize makes sure slices serialise as [] rather than null.
func normalize(d *model.Doc) {
	nz := func(e *[]model.Evidence) {
		if *e == nil {
			*e = []model.Evidence{}
		}
	}
	nz(&d.Pre.Technical)
	nz(&d.Pre.Fundamental)
	nz(&d.Pre.Signals)
	if d.Pre.Plan.Targets == nil {
		d.Pre.Plan.Targets = []float64{}
	}
	if d.Pre.Mind.Checklist == nil {
		d.Pre.Mind.Checklist = []model.CheckItem{}
	}
	if d.Result.Mistakes == nil {
		d.Result.Mistakes = []string{}
	}
	if d.Addenda == nil {
		d.Addenda = []model.Addendum{}
	}
	for _, list := range [][]model.Evidence{d.Pre.Technical, d.Pre.Fundamental, d.Pre.Signals} {
		for i := range list {
			if list[i].Images == nil {
				list[i].Images = []string{}
			}
			if list[i].Links == nil {
				list[i].Links = []string{}
			}
			if list[i].Tags == nil {
				list[i].Tags = []string{}
			}
		}
	}
}

func (s *Store) Get(ctx context.Context, id string) (*model.Position, error) {
	p, err := scanPosition(s.db.QueryRowContext(ctx, `SELECT `+cols+` FROM positions WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return p, err
}

// writeArgs returns the denormalised column values for p, in the order used by
// the INSERT/UPDATE statements below.
func writeArgs(p *model.Position) []any {
	normalize(&p.Doc)
	p.Calc = model.Compute(p.Doc)
	ix := model.Indexes(p.Doc)
	doc, _ := json.Marshal(p.Doc)
	var conf any
	if ix.Confidence != nil {
		conf = int64(*ix.Confidence)
	}
	return []any{
		p.Status, p.UpdatedAt, ptrInt(p.LockedAt), ptrInt(p.OpenedAt), ptrInt(p.ClosedAt), ptrInt(p.ReviewedAt),
		ix.Symbol, ix.Direction, ix.Market, ptrFloat(p.Calc.PnL), ptrFloat(p.Calc.RealizedR),
		int64(ix.EvidenceCount), int64(ix.AgainstCount), ix.Mood, conf,
		ix.TagsIdx, ix.SourcesIdx, ix.SearchText, string(doc),
	}
}

func ptrInt(p *int64) any {
	if p == nil {
		return nil
	}
	return *p
}

func ptrFloat(p *float64) any {
	if p == nil {
		return nil
	}
	return *p
}

const setClause = `status=?, updated_at=?, locked_at=?, opened_at=?, closed_at=?, reviewed_at=?,
 symbol=?, direction=?, market=?, pnl=?, r=?, evidence_count=?, against_count=?, mood=?, confidence=?,
 tags_idx=?, sources_idx=?, search_text=?, doc=?`

func (s *Store) Create(ctx context.Context, p *model.Position) error {
	args := append([]any{p.ID, p.CreatedAt}, writeArgs(p)...)
	_, err := s.db.ExecContext(ctx, `INSERT INTO positions (id, created_at, status, updated_at, locked_at, opened_at, closed_at,
 reviewed_at, symbol, direction, market, pnl, r, evidence_count, against_count, mood, confidence,
 tags_idx, sources_idx, search_text, doc) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, args...)
	return err
}

// Save writes p only if the stored status still equals fromStatus.
func (s *Store) Save(ctx context.Context, p *model.Position, fromStatus string) error {
	args := append(writeArgs(p), p.ID, fromStatus)
	res, err := s.db.ExecContext(ctx, `UPDATE positions SET `+setClause+` WHERE id = ? AND status = ?`, args...)
	if err != nil {
		return err
	}
	if n, err := res.RowsAffected(); err == nil && n == 0 {
		return ErrConflict
	}
	return nil
}

// Upsert inserts or replaces a position (used by import).
func (s *Store) Upsert(ctx context.Context, p *model.Position) error {
	args := append([]any{p.ID, p.CreatedAt}, writeArgs(p)...)
	_, err := s.db.ExecContext(ctx, `INSERT INTO positions (id, created_at, status, updated_at, locked_at, opened_at, closed_at,
 reviewed_at, symbol, direction, market, pnl, r, evidence_count, against_count, mood, confidence,
 tags_idx, sources_idx, search_text, doc) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
 ON CONFLICT(id) DO UPDATE SET created_at=excluded.created_at, `+upsertSet, args...)
	return err
}

const upsertSet = `status=excluded.status, updated_at=excluded.updated_at, locked_at=excluded.locked_at,
 opened_at=excluded.opened_at, closed_at=excluded.closed_at, reviewed_at=excluded.reviewed_at,
 symbol=excluded.symbol, direction=excluded.direction, market=excluded.market, pnl=excluded.pnl, r=excluded.r,
 evidence_count=excluded.evidence_count, against_count=excluded.against_count, mood=excluded.mood,
 confidence=excluded.confidence, tags_idx=excluded.tags_idx, sources_idx=excluded.sources_idx,
 search_text=excluded.search_text, doc=excluded.doc`

func (s *Store) Delete(ctx context.Context, id string) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM positions WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, err := res.RowsAffected(); err == nil && n == 0 {
		return ErrNotFound
	}
	return nil
}

// All returns every position, oldest first (for export).
func (s *Store) All(ctx context.Context) ([]*model.Position, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+cols+` FROM positions ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*model.Position{}
	for rows.Next() {
		p, err := scanPosition(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

type Filter struct {
	Q        string
	Statuses []string
	Outcome  string // win | loss
	Symbol   string
	Tag      string
	Source   string
	From, To *int64
	Limit    int
	Offset   int
}

func likeEscape(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

func (s *Store) List(ctx context.Context, f Filter) ([]model.Summary, error) {
	var where []string
	var args []any
	if f.Q != "" {
		where = append(where, `search_text LIKE ? ESCAPE '\'`)
		args = append(args, "%"+likeEscape(strings.ToLower(f.Q))+"%")
	}
	if len(f.Statuses) > 0 {
		where = append(where, `status IN (`+strings.TrimSuffix(strings.Repeat("?,", len(f.Statuses)), ",")+`)`)
		for _, st := range f.Statuses {
			args = append(args, st)
		}
	}
	switch f.Outcome {
	case "win":
		where = append(where, `COALESCE(pnl, r) > 0`)
	case "loss":
		where = append(where, `COALESCE(pnl, r) < 0`)
	}
	if f.Symbol != "" {
		where = append(where, `symbol = ?`)
		args = append(args, strings.ToUpper(f.Symbol))
	}
	if f.Tag != "" {
		where = append(where, `tags_idx LIKE ? ESCAPE '\'`)
		args = append(args, "%|"+likeEscape(f.Tag)+"|%")
	}
	if f.Source != "" {
		where = append(where, `sources_idx LIKE ? ESCAPE '\'`)
		args = append(args, "%|"+likeEscape(f.Source)+"|%")
	}
	if f.From != nil {
		where = append(where, `created_at >= ?`)
		args = append(args, *f.From)
	}
	if f.To != nil {
		where = append(where, `created_at < ?`)
		args = append(args, *f.To)
	}
	q := `SELECT id, status, symbol, direction, market, created_at, updated_at, opened_at, closed_at, reviewed_at,
 pnl, r, evidence_count, against_count, mood FROM positions`
	if len(where) > 0 {
		q += ` WHERE ` + strings.Join(where, ` AND `)
	}
	if f.Limit <= 0 || f.Limit > 500 {
		f.Limit = 200
	}
	q += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`
	args = append(args, f.Limit, f.Offset)

	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Summary{}
	for rows.Next() {
		var (
			m                          model.Summary
			opened, closed, reviewedAt sql.NullInt64
			pnl, r                     sql.NullFloat64
		)
		if err := rows.Scan(&m.ID, &m.Status, &m.Symbol, &m.Direction, &m.Market, &m.CreatedAt, &m.UpdatedAt,
			&opened, &closed, &reviewedAt, &pnl, &r, &m.EvidenceCount, &m.AgainstCount, &m.Mood); err != nil {
			return nil, err
		}
		m.OpenedAt, m.ClosedAt, m.ReviewedAt = nullInt(opened), nullInt(closed), nullInt(reviewedAt)
		if pnl.Valid {
			m.PnL = &pnl.Float64
		}
		if r.Valid {
			m.R = &r.Float64
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// Distinct lists symbols and tag/source values present, for filter dropdowns.
func (s *Store) Symbols(ctx context.Context) ([]string, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT DISTINCT symbol FROM positions WHERE symbol <> '' ORDER BY symbol`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

func (s *Store) GetSettings(ctx context.Context) (model.Settings, error) {
	var raw string
	err := s.db.QueryRowContext(ctx, `SELECT value FROM settings WHERE key = 'main'`).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return model.DefaultSettings(), nil
	}
	if err != nil {
		return model.Settings{}, err
	}
	st := model.DefaultSettings()
	if err := json.Unmarshal([]byte(raw), &st); err != nil {
		return model.Settings{}, err
	}
	return st, nil
}

func (s *Store) PutSettings(ctx context.Context, st model.Settings) error {
	b, _ := json.Marshal(st)
	_, err := s.db.ExecContext(ctx, `INSERT INTO settings (key, value) VALUES ('main', ?)
 ON CONFLICT(key) DO UPDATE SET value = excluded.value`, string(b))
	return err
}

type Image struct {
	ID          string `json:"id"`
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
	CreatedAt   int64  `json:"createdAt"`
}

func (s *Store) PutImage(ctx context.Context, im Image) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO images (id, content_type, size, created_at) VALUES (?,?,?,?)
 ON CONFLICT(id) DO UPDATE SET content_type=excluded.content_type, size=excluded.size`,
		im.ID, im.ContentType, im.Size, im.CreatedAt)
	return err
}

func (s *Store) GetImage(ctx context.Context, id string) (*Image, error) {
	var im Image
	err := s.db.QueryRowContext(ctx, `SELECT id, content_type, size, created_at FROM images WHERE id = ?`, id).
		Scan(&im.ID, &im.ContentType, &im.Size, &im.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &im, err
}

func (s *Store) Images(ctx context.Context) ([]Image, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, content_type, size, created_at FROM images ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Image{}
	for rows.Next() {
		var im Image
		if err := rows.Scan(&im.ID, &im.ContentType, &im.Size, &im.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, im)
	}
	return out, rows.Err()
}

// Migrate applies the given SQL script statement by statement (native server and tests only).
func (s *Store) Migrate(ctx context.Context, script string) error {
	for _, stmt := range strings.Split(script, ";") {
		var lines []string
		for _, l := range strings.Split(stmt, "\n") {
			if !strings.HasPrefix(strings.TrimSpace(l), "--") {
				lines = append(lines, l)
			}
		}
		stmt = strings.TrimSpace(strings.Join(lines, "\n"))
		if stmt == "" {
			continue
		}
		if _, err := s.db.ExecContext(ctx, stmt); err != nil {
			return err
		}
	}
	return nil
}
