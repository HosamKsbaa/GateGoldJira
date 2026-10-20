package performance

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"testing"
	"time"
)

type Measurement struct {
	Action   string  `json:"action"`
	Trials   int     `json:"trials"`
	P50MS    float64 `json:"p50Ms"`
	P99MS    float64 `json:"p99Ms"`
	P95MS    float64 `json:"p95Ms"`
	MaxMS    float64 `json:"maxMs"`
	BudgetMS float64 `json:"localBudgetMs"`
}
type Report struct {
	Errors                map[string]int `json:"errors,omitempty"`
	Environment           string         `json:"environment"`
	CloudAcceptance       bool           `json:"cloudAcceptance"`
	GeneratedAt           time.Time      `json:"generatedAt"`
	GoVersion             string         `json:"goVersion"`
	Workload              map[string]int `json:"workload"`
	Measurements          []Measurement  `json:"measurements"`
	HeapPeakBytes         uint64         `json:"observedHeapPeakBytes"`
	PoolMax               int32          `json:"poolMaxConnections"`
	PoolAcquireCount      int64          `json:"poolAcquireCount"`
	PoolAcquireMS         float64        `json:"poolAcquireMs"`
	PoolEmptyAcquireCount int64          `json:"poolEmptyAcquireCount"`
	LocksWaiting          int            `json:"locksWaitingAtEnd"`
}

func measure(t *testing.T, report *Report, action string, trials int, budget time.Duration, fn func(int)) {
	t.Helper()
	fn(-1) // Record warmed actions separately from instance startup.
	values := make([]float64, 0, trials)
	for i := 0; i < trials; i++ {
		start := time.Now()
		fn(i)
		values = append(values, float64(time.Since(start).Microseconds())/1000)
		var memory runtime.MemStats
		runtime.ReadMemStats(&memory)
		report.HeapPeakBytes = max(report.HeapPeakBytes, memory.HeapAlloc)
	}
	slices.Sort(values)
	m := Measurement{
		Action:   action,
		Trials:   trials,
		P50MS:    values[(trials-1)/2],
		P95MS:    values[(95*trials+99)/100-1],
		P99MS:    values[(99*trials+99)/100-1],
		MaxMS:    values[trials-1],
		BudgetMS: float64(budget.Milliseconds()),
	}
	report.Measurements = append(report.Measurements, m)
	t.Logf("%s: n=%d p50=%.2fms p95=%.2fms max=%.2fms budget=%.0fms", action, trials, m.P50MS, m.P95MS, m.MaxMS, m.BudgetMS)
	if m.P95MS > m.BudgetMS {
		t.Errorf("%s exceeds local regression budget", action)
	}
}
func writeReport(t *testing.T, report Report) {
	t.Helper()
	destination := os.Getenv("GATEGOLD_PERFORMANCE_REPORT")
	if destination == "" {
		return
	}
	if !filepath.IsAbs(destination) {
		t.Fatal("Report path must be absolute")
	}
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err = os.MkdirAll(filepath.Dir(destination), 0700); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(destination, append(data, '\n'), 0600); err != nil {
		t.Fatal(err)
	}
	t.Log(fmt.Sprintf("Local evidence written to %s; Cloud acceptance remains pending", destination))
}

func recordDurations(t *testing.T, report *Report, action string, durations []time.Duration, budget time.Duration) {
	t.Helper()
	values := make([]float64, len(durations))
	for i, d := range durations {
		values[i] = float64(d.Microseconds()) / 1000
	}
	slices.Sort(values)
	n := len(values)
	m := Measurement{
		Action:   action,
		Trials:   n,
		P50MS:    values[(n-1)/2],
		P95MS:    values[(95*n+99)/100-1],
		P99MS:    values[(99*n+99)/100-1],
		MaxMS:    values[n-1],
		BudgetMS: float64(budget.Milliseconds()),
	}
	report.Measurements = append(report.Measurements, m)
	t.Logf("%s: n=%d p95=%.2fms", action, n, m.P95MS)
	if m.P95MS > m.BudgetMS {
		t.Errorf("%s exceeds local regression budget", action)
	}
}
