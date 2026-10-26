package model

import "math"

func sign(direction string) float64 {
	switch direction {
	case "long":
		return 1
	case "short":
		return -1
	}
	return 0
}

func ptr(v float64) *float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return nil
	}
	return &v
}

// Compute derives risk, R:R, realised R and P&L. Missing inputs leave the
// corresponding outputs nil; it never fails.
func Compute(d Doc) Calc {
	c := Calc{Targets: []TargetCalc{}, Warnings: []string{}}
	p := d.Pre.Plan
	s := sign(d.Pre.Basic.Direction)

	var risk float64
	hasRisk := false
	if p.Entry != nil && p.Stop != nil {
		risk = math.Abs(*p.Entry - *p.Stop)
		if risk > 0 {
			hasRisk = true
			c.RiskPerUnit = ptr(risk)
		}
		if s != 0 && (*p.Stop-*p.Entry)*s > 0 {
			c.Warnings = append(c.Warnings, "stop_wrong_side")
		}
	}
	if hasRisk && p.Size != nil {
		c.RiskAmount = ptr(risk * *p.Size)
		if c.RiskAmount != nil && p.Balance != nil && *p.Balance > 0 {
			c.RiskPct = ptr(*c.RiskAmount / *p.Balance * 100)
		}
	}
	wrongTarget := false
	for _, t := range p.Targets {
		tc := TargetCalc{Price: t}
		if p.Entry != nil && s != 0 && hasRisk {
			reward := (t - *p.Entry) * s
			tc.RR = ptr(reward / risk)
			if reward <= 0 {
				wrongTarget = true
			}
		}
		c.Targets = append(c.Targets, tc)
	}
	if wrongTarget {
		c.Warnings = append(c.Warnings, "target_wrong_side")
	}

	r := d.Result
	if p.Entry != nil && r.ExitPrice != nil && s != 0 {
		move := (*r.ExitPrice - *p.Entry) * s
		if hasRisk {
			c.RealizedR = ptr(move / risk)
		}
		if p.Size != nil {
			c.PnL = ptr(move * *p.Size)
		}
	}
	return c
}
