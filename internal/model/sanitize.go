package model

import (
	"math"
	"strings"
	"unicode/utf8"
)

const (
	maxShort    = 200
	maxLong     = 20000
	maxItems    = 100
	maxTargets  = 20
	maxURLLen   = 2000
	maxTagCount = 30
)

func oneOf(v string, allowed ...string) string {
	for _, a := range allowed {
		if v == a {
			return v
		}
	}
	return ""
}

func clip(s string, max int) string {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	r := []rune(s)
	return string(r[:max])
}

func finite(p *float64) *float64 {
	if p == nil || math.IsNaN(*p) || math.IsInf(*p, 0) {
		return nil
	}
	return p
}

func rating(p *int) *int {
	if p == nil || *p < 1 || *p > 5 {
		return nil
	}
	return p
}

func strs(in []string, max, each int) []string {
	out := []string{}
	seen := map[string]bool{}
	for _, s := range in {
		s = clip(s, each)
		if s == "" || seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
		if len(out) >= max {
			break
		}
	}
	return out
}

func evidence(in []Evidence, newID func() string) []Evidence {
	out := []Evidence{}
	for _, e := range in {
		if len(out) >= maxItems {
			break
		}
		e.ID = clip(e.ID, 64)
		if e.ID == "" {
			e.ID = newID()
		}
		e.Title = clip(e.Title, maxShort)
		e.Direction = oneOf(e.Direction, "for", "against", "neutral")
		if e.Direction == "" {
			e.Direction = "neutral"
		}
		e.Weight = oneOf(e.Weight, "low", "mid", "high")
		if e.Weight == "" {
			e.Weight = "mid"
		}
		e.Timeframe = clip(e.Timeframe, 20)
		e.Source = clip(e.Source, maxShort)
		e.Note = clip(e.Note, maxLong)
		e.Images = strs(e.Images, 20, 64)
		e.Links = strs(e.Links, 20, maxURLLen)
		e.Tags = strs(e.Tags, maxTagCount, 50)
		out = append(out, e)
	}
	return out
}

// SanitizePre normalises sections 1-7. It never rejects: invalid enum values
// become empty, over-long text is clipped, so saving cannot fail validation.
func SanitizePre(p Pre, newID func() string) Pre {
	b := &p.Basic
	b.Symbol = strings.ToUpper(clip(b.Symbol, 40))
	b.Market = oneOf(b.Market, "crypto", "forex", "stock", "other")
	b.Direction = oneOf(b.Direction, "long", "short")
	b.Timeframe = clip(b.Timeframe, 20)
	b.Style = oneOf(b.Style, "scalp", "day", "swing", "position")

	pl := &p.Plan
	pl.Entry, pl.Stop, pl.Size = finite(pl.Entry), finite(pl.Stop), finite(pl.Size)
	pl.Leverage, pl.Balance = finite(pl.Leverage), finite(pl.Balance)
	ts := []float64{}
	for _, t := range pl.Targets {
		if !math.IsNaN(t) && !math.IsInf(t, 0) && len(ts) < maxTargets {
			ts = append(ts, t)
		}
	}
	pl.Targets = ts

	p.Thesis.Summary = clip(p.Thesis.Summary, 2000)
	p.Thesis.Invalidation = clip(p.Thesis.Invalidation, 2000)

	p.Technical = evidence(p.Technical, newID)
	p.Fundamental = evidence(p.Fundamental, newID)
	p.Signals = evidence(p.Signals, newID)

	m := &p.Mind
	m.Confidence = rating(m.Confidence)
	m.Mood = oneOf(m.Mood, "calm", "hasty", "tired", "revenge", "fomo")
	cl := []CheckItem{}
	for _, c := range m.Checklist {
		if len(cl) >= 50 {
			break
		}
		c.Text = clip(c.Text, maxShort)
		if c.Text == "" {
			continue
		}
		c.ID = clip(c.ID, 64)
		if c.ID == "" {
			c.ID = newID()
		}
		cl = append(cl, c)
	}
	m.Checklist = cl
	return p
}

func SanitizeResult(r Result) Result {
	r.ExitPrice = finite(r.ExitPrice)
	r.ExitReason = oneOf(r.ExitReason, "target", "stop", "manual", "trailing")
	r.Mistakes = strs(r.Mistakes, maxTagCount, 50)
	r.ExecutionScore = rating(r.ExecutionScore)
	r.Lesson = clip(r.Lesson, maxLong)
	return r
}

// SanitizeSettings trims and de-duplicates user-defined lists.
func SanitizeSettings(s Settings, newID func() string) Settings {
	s.MistakeTags = strs(s.MistakeTags, 100, 50)
	s.EvidenceTags = strs(s.EvidenceTags, 100, 50)
	s.SignalSources = strs(s.SignalSources, 100, maxShort)
	rules := []ChecklistRule{}
	for _, r := range s.Checklist {
		r.Text = clip(r.Text, maxShort)
		if r.Text == "" || len(rules) >= 50 {
			continue
		}
		r.ID = clip(r.ID, 64)
		if r.ID == "" {
			r.ID = newID()
		}
		rules = append(rules, r)
	}
	s.Checklist = rules
	s.Currency = clip(s.Currency, 12)
	if s.Currency == "" {
		s.Currency = "USDT"
	}
	return s
}

// Index is the denormalised data kept next to the JSON document for filtering.
type Index struct {
	Symbol, Direction, Market, Mood string
	Confidence                      *int
	EvidenceCount, AgainstCount     int
	TagsIdx, SourcesIdx, SearchText string
}

func Indexes(d Doc) Index {
	ix := Index{
		Symbol:     d.Pre.Basic.Symbol,
		Direction:  d.Pre.Basic.Direction,
		Market:     d.Pre.Basic.Market,
		Mood:       d.Pre.Mind.Mood,
		Confidence: d.Pre.Mind.Confidence,
	}
	var tags, sources, text []string
	text = append(text, d.Pre.Basic.Symbol, d.Pre.Thesis.Summary, d.Pre.Thesis.Invalidation, d.Result.Lesson)
	tags = append(tags, d.Result.Mistakes...)
	for _, list := range [][]Evidence{d.Pre.Technical, d.Pre.Fundamental, d.Pre.Signals} {
		for _, e := range list {
			ix.EvidenceCount++
			if e.Direction == "against" {
				ix.AgainstCount++
			}
			tags = append(tags, e.Tags...)
			text = append(text, e.Title, e.Note)
			if e.Source != "" {
				sources = append(sources, e.Source)
			}
		}
	}
	for _, a := range d.Addenda {
		text = append(text, a.Text)
	}
	ix.TagsIdx = delimited(tags)
	ix.SourcesIdx = delimited(sources)
	ix.SearchText = strings.ToLower(strings.Join(text, "\n"))
	return ix
}

func delimited(items []string) string {
	if len(items) == 0 {
		return ""
	}
	return "|" + strings.Join(items, "|") + "|"
}
