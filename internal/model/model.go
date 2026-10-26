// Package model holds the journal's data types, input sanitising and the
// automatic plan/result calculations.
package model

// Position statuses.
const (
	StatusDraft     = "draft"
	StatusOpen      = "open"
	StatusClosed    = "closed"
	StatusReviewed  = "reviewed"
	StatusAbandoned = "abandoned"
)

type Basic struct {
	Symbol    string `json:"symbol"`
	Market    string `json:"market"`
	Direction string `json:"direction"`
	Timeframe string `json:"timeframe"`
	Style     string `json:"style"`
	EntryTime *int64 `json:"entryTime"`
}

type Plan struct {
	Entry    *float64  `json:"entry"`
	Stop     *float64  `json:"stop"`
	Targets  []float64 `json:"targets"`
	Size     *float64  `json:"size"`
	Leverage *float64  `json:"leverage"`
	Balance  *float64  `json:"balance"`
}

type Thesis struct {
	Summary      string `json:"summary"`
	Invalidation string `json:"invalidation"`
}

// Evidence is the shared item type of sections 4, 5 and 6.
type Evidence struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Direction string   `json:"direction"` // for | against | neutral
	Weight    string   `json:"weight"`    // low | mid | high
	Timeframe string   `json:"timeframe"`
	Source    string   `json:"source"`
	Images    []string `json:"images"`
	Links     []string `json:"links"`
	Note      string   `json:"note"`
	Tags      []string `json:"tags"`
}

type CheckItem struct {
	ID      string `json:"id"`
	Text    string `json:"text"`
	Checked bool   `json:"checked"`
}

type Mind struct {
	Confidence *int        `json:"confidence"`
	Mood       string      `json:"mood"`
	OnPlan     *bool       `json:"onPlan"`
	Checklist  []CheckItem `json:"checklist"`
}

// Pre is sections 1-7: everything recorded before entry. It is frozen once the
// position leaves the draft state.
type Pre struct {
	Basic       Basic      `json:"basic"`
	Plan        Plan       `json:"plan"`
	Thesis      Thesis     `json:"thesis"`
	Technical   []Evidence `json:"technical"`
	Fundamental []Evidence `json:"fundamental"`
	Signals     []Evidence `json:"signals"`
	Mind        Mind       `json:"mind"`
}

// Result is section 8.
type Result struct {
	ExitPrice      *float64 `json:"exitPrice"`
	ExitTime       *int64   `json:"exitTime"`
	ExitReason     string   `json:"exitReason"`
	Mistakes       []string `json:"mistakes"`
	ExecutionScore *int     `json:"executionScore"`
	Lesson         string   `json:"lesson"`
}

type Addendum struct {
	ID   string `json:"id"`
	At   int64  `json:"at"`
	Text string `json:"text"`
}

type TargetCalc struct {
	Price float64  `json:"price"`
	RR    *float64 `json:"rr"`
}

// Calc is derived data; it is never trusted from clients.
type Calc struct {
	RiskPerUnit *float64     `json:"riskPerUnit"`
	RiskAmount  *float64     `json:"riskAmount"`
	RiskPct     *float64     `json:"riskPct"`
	Targets     []TargetCalc `json:"targets"`
	RealizedR   *float64     `json:"realizedR"`
	PnL         *float64     `json:"pnl"`
	Warnings    []string     `json:"warnings"`
}

// Doc is what is persisted in the positions.doc column.
type Doc struct {
	Pre     Pre        `json:"pre"`
	Result  Result     `json:"result"`
	Addenda []Addendum `json:"addenda"`
}

// Position is the full API representation.
type Position struct {
	ID         string `json:"id"`
	Status     string `json:"status"`
	CreatedAt  int64  `json:"createdAt"`
	UpdatedAt  int64  `json:"updatedAt"`
	LockedAt   *int64 `json:"lockedAt"`
	OpenedAt   *int64 `json:"openedAt"`
	ClosedAt   *int64 `json:"closedAt"`
	ReviewedAt *int64 `json:"reviewedAt"`
	Doc
	Calc Calc `json:"calc"`
}

// Summary is a list row.
type Summary struct {
	ID            string   `json:"id"`
	Status        string   `json:"status"`
	Symbol        string   `json:"symbol"`
	Direction     string   `json:"direction"`
	Market        string   `json:"market"`
	CreatedAt     int64    `json:"createdAt"`
	UpdatedAt     int64    `json:"updatedAt"`
	OpenedAt      *int64   `json:"openedAt"`
	ClosedAt      *int64   `json:"closedAt"`
	ReviewedAt    *int64   `json:"reviewedAt"`
	PnL           *float64 `json:"pnl"`
	R             *float64 `json:"r"`
	EvidenceCount int      `json:"evidenceCount"`
	AgainstCount  int      `json:"againstCount"`
	Mood          string   `json:"mood"`
}

type ChecklistRule struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

type Settings struct {
	MistakeTags   []string        `json:"mistakeTags"`
	EvidenceTags  []string        `json:"evidenceTags"`
	SignalSources []string        `json:"signalSources"`
	Checklist     []ChecklistRule `json:"checklist"`
	Currency      string          `json:"currency"`
}

func DefaultSettings() Settings {
	return Settings{
		MistakeTags: []string{
			"ورود زودهنگام", "ورود دیرهنگام", "جابه‌جایی حد ضرر", "FOMO",
			"خارج از پلن", "حجم بیش از حد", "خروج زودهنگام", "انتقام‌گیری",
		},
		EvidenceTags:  []string{},
		SignalSources: []string{},
		Checklist:     []ChecklistRule{},
		Currency:      "USDT",
	}
}
