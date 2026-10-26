package model

import (
	"math"
	"testing"
)

func f(v float64) *float64 { return &v }

func near(t *testing.T, name string, got *float64, want float64) {
	t.Helper()
	if got == nil || math.Abs(*got-want) > 1e-9 {
		t.Fatalf("%s = %v, want %v", name, got, want)
	}
}

func TestComputeLong(t *testing.T) {
	d := Doc{}
	d.Pre.Basic.Direction = "long"
	d.Pre.Plan = Plan{Entry: f(100), Stop: f(95), Targets: []float64{110, 120}, Size: f(2), Balance: f(1000)}
	d.Result.ExitPrice = f(110)
	c := Compute(d)
	near(t, "riskPerUnit", c.RiskPerUnit, 5)
	near(t, "riskAmount", c.RiskAmount, 10)
	near(t, "riskPct", c.RiskPct, 1)
	near(t, "rr1", c.Targets[0].RR, 2)
	near(t, "rr2", c.Targets[1].RR, 4)
	near(t, "realizedR", c.RealizedR, 2)
	near(t, "pnl", c.PnL, 20)
	if len(c.Warnings) != 0 {
		t.Fatalf("unexpected warnings %v", c.Warnings)
	}
}

func TestComputeShortAndWarnings(t *testing.T) {
	d := Doc{}
	d.Pre.Basic.Direction = "short"
	d.Pre.Plan = Plan{Entry: f(100), Stop: f(95), Targets: []float64{90}, Size: f(1)}
	d.Result.ExitPrice = f(105)
	c := Compute(d)
	if len(c.Warnings) == 0 || c.Warnings[0] != "stop_wrong_side" {
		t.Fatalf("want stop_wrong_side, got %v", c.Warnings)
	}
	near(t, "rr", c.Targets[0].RR, 2)
	near(t, "realizedR", c.RealizedR, -1)
	near(t, "pnl", c.PnL, -5)
	if c.RiskPct != nil {
		t.Fatal("riskPct needs balance")
	}
}

func TestComputeEmpty(t *testing.T) {
	c := Compute(Doc{})
	if c.RiskPerUnit != nil || c.RealizedR != nil || c.PnL != nil || len(c.Warnings) != 0 {
		t.Fatalf("empty doc should compute nothing: %+v", c)
	}
}

func TestSanitizeNeverRejects(t *testing.T) {
	p := SanitizePre(Pre{
		Basic:     Basic{Symbol: " btcusdt ", Market: "bogus", Direction: "LONG"},
		Technical: []Evidence{{Title: "x", Direction: "?", Weight: "?"}},
		Mind:      Mind{Confidence: func() *int { v := 9; return &v }()},
	}, func() string { return "id" })
	if p.Basic.Symbol != "BTCUSDT" || p.Basic.Market != "" || p.Basic.Direction != "" {
		t.Fatalf("basic not normalised: %+v", p.Basic)
	}
	e := p.Technical[0]
	if e.ID != "id" || e.Direction != "neutral" || e.Weight != "mid" {
		t.Fatalf("evidence not defaulted: %+v", e)
	}
	if p.Mind.Confidence != nil {
		t.Fatal("out-of-range confidence kept")
	}
}
