# TASK Phase B4: ReportPrinter (block-based console output)

> **Prerequisites**: B3 выполнена (types из profile_analysis_types.hpp готовы)
> **Effort**: 2-3 часа
> **Scope**: `core/include/core/services/profiling/` + `core/src/services/profiling/`
> **Depends**: B3

---

## 🎯 Цель

Вынести 170 строк `std::cout` из текущего `gpu_profiler.cpp::PrintReport()` в **тестируемый block-based класс**.
- Injectable `std::ostream&` (для тестов capture через stringstream)
- Блоки: Header / L1 Pipeline / L2 Stats / L3 Hardware / Footer
- ASCII bar chart для L1

> ⚠️ **Про ConsoleOutput (CLAUDE.md требование)**: `ReportPrinter` пишет в `std::ostream&` — это корректно для unit-тестов (stringstream) и для файлов. В **production-вызове** из `ProfilingFacade::PrintReport()`:
> 1. создать `std::ostringstream buf;`
> 2. `ReportPrinter rp(buf); rp.PrintXxx(...);`
> 3. финальный вывод через `drv_gpu_lib::ConsoleOutput::GetInstance().Print(gpu_id, "Profiler", buf.str());`
>
> Это соответствует правилу проекта: «Консоль только через ConsoleOutput». Прямой `std::cout` — только внутри tests/CLI-утилит (не production).

---

## 📋 Шаги

### B4.1. Header

**Новый файл**: `core/include/core/services/profiling/report_printer.hpp`

```cpp
#pragma once

#include <iosfwd>
#include <string>
#include <vector>

#include <core/services/profiling_types.hpp>                    // GPUReportInfo
#include <core/services/profiling/profile_analysis_types.hpp>   // L1/L2/L3 types

namespace drv_gpu_lib::profiling {

/// Block-based report printer. Replaces raw std::cout in GPUProfiler.
/// Injectable ostream for testability (stringstream in tests, cout/file in production).
class ReportPrinter {
public:
    explicit ReportPrinter(std::ostream& out);

    // === Blocks ===
    void PrintHeader(const GPUReportInfo& info, int gpu_id);
    void PrintPipelineBreakdown(const PipelineBreakdown& breakdown);
    void PrintStatisticalTable(const std::string& module_name,
                                const std::vector<EventSummary>& summaries);
    void PrintHardwareProfile(const HardwareProfile& profile,
                               BottleneckType verdict = BottleneckType::Unknown);
    void PrintFooter();

    void PrintSeparator(char ch = '-', int width = 110);

    // === Configuration ===
    void SetWidth(int width);
    void SetVerbose(bool v);
    void SetColorEnabled(bool c);   // reserved for future ANSI colors

private:
    std::ostream& out_;
    int  width_   = 110;
    bool verbose_ = false;
    bool color_   = false;

    // Helpers
    std::string Pad(const std::string& s, int w, bool left_align = true) const;
    std::string FmtMs(double val, int prec = 3) const;
    std::string FmtPct(double val, int prec = 1) const;
    std::string BarChart(double percent, int max_width = 50) const;
    std::string AssessCounter(const std::string& name, double val) const;
};

} // namespace
```

---

### B4.2. Реализация

**Новый файл**: `core/src/services/profiling/report_printer.cpp`

```cpp
#include <core/services/profiling/report_printer.hpp>
#include <core/services/profiling/profile_analyzer.hpp>   // BottleneckTypeToString

#include <algorithm>
#include <cstdio>
#include <iomanip>
#include <ostream>
#include <sstream>

namespace drv_gpu_lib::profiling {

ReportPrinter::ReportPrinter(std::ostream& out) : out_(out) {}

void ReportPrinter::SetWidth(int w)         { width_ = w; }
void ReportPrinter::SetVerbose(bool v)      { verbose_ = v; }
void ReportPrinter::SetColorEnabled(bool c) { color_ = c; }

std::string ReportPrinter::Pad(const std::string& s, int w, bool left) const {
    if (static_cast<int>(s.size()) >= w) return s.substr(0, w);
    return left ? s + std::string(w - s.size(), ' ')
                : std::string(w - s.size(), ' ') + s;
}

std::string ReportPrinter::FmtMs(double v, int prec) const {
    char buf[32];
    std::snprintf(buf, sizeof(buf), "%.*f", prec, v);
    return buf;
}

std::string ReportPrinter::FmtPct(double v, int prec) const {
    char buf[32];
    std::snprintf(buf, sizeof(buf), "%.*f%%", prec, v);
    return buf;
}

std::string ReportPrinter::BarChart(double pct, int max_w) const {
    int n = static_cast<int>(std::clamp(pct / 100.0 * max_w, 0.0, double(max_w)));
    return std::string(n, '#');
}

void ReportPrinter::PrintSeparator(char ch, int w) {
    out_ << std::string(w, ch) << '\n';
}

void ReportPrinter::PrintHeader(const GPUReportInfo& info, int gpu_id) {
    PrintSeparator('=', width_);
    out_ << " GPU " << gpu_id << ": " << info.device_name
         << "  |  " << info.driver_version
         << "  |  " << info.timestamp
         << '\n';
    PrintSeparator('=', width_);
}

void ReportPrinter::PrintPipelineBreakdown(const PipelineBreakdown& b) {
    out_ << '\n' << "  " << b.module_name << "  |  avg total: "
         << FmtMs(b.total_avg_ms) << " ms\n";
    PrintSeparator('-', width_);
    out_ << "  | " << Pad("Event", 26) << " | " << Pad("Kind", 8)
         << " | " << Pad("Avg ms", 8, false) << " | "
         << Pad("%", 6, false) << " | Distribution\n";
    PrintSeparator('-', width_);

    for (const auto& e : b.entries) {
        out_ << "  | " << Pad(e.event_name, 26)
             << " | " << Pad(e.kind_string, 8)
             << " | " << Pad(FmtMs(e.avg_ms), 8, false)
             << " | " << Pad(FmtPct(e.percent), 6, false)
             << " | " << BarChart(e.percent) << '\n';
    }

    PrintSeparator('-', width_);
    out_ << "  | " << Pad("TOTAL", 26) << " | " << Pad("", 8)
         << " | " << Pad(FmtMs(b.total_avg_ms), 8, false)
         << " | " << Pad("100.0%", 6, false) << " | "
         << "kernel: " << FmtPct(b.kernel_percent)
         << "  copy: " << FmtPct(b.copy_percent)
         << "  barrier: " << FmtPct(b.barrier_percent) << '\n';
    PrintSeparator('-', width_);
}

void ReportPrinter::PrintStatisticalTable(
    const std::string& module,
    const std::vector<EventSummary>& summaries)
{
    out_ << '\n' << "  " << module << " — Statistical Summary\n";
    PrintSeparator('-', width_);
    out_ << "  | " << Pad("Event", 20) << " | " << Pad("Kind", 7)
         << " | " << Pad("N", 5, false)
         << " | " << Pad("Avg", 8, false)
         << " | " << Pad("Med", 8, false)
         << " | " << Pad("p95", 8, false)
         << " | " << Pad("StdDev", 7, false)
         << " | " << Pad("Min", 8, false)
         << " | " << Pad("Max", 8, false) << '\n';
    PrintSeparator('-', width_);

    for (const auto& s : summaries) {
        out_ << "  | " << Pad(s.event_name, 20)
             << " | " << Pad(s.kind == 0 ? "kernel" :
                              s.kind == 1 ? "copy"   :
                              s.kind == 2 ? "barrier": "other", 7)
             << " | " << Pad(std::to_string(s.count), 5, false)
             << " | " << Pad(FmtMs(s.avg_ms),    8, false)
             << " | " << Pad(FmtMs(s.median_ms), 8, false)
             << " | " << Pad(FmtMs(s.p95_ms),    8, false)
             << " | " << Pad(FmtMs(s.stddev_ms, 2), 7, false)
             << " | " << Pad(FmtMs(s.min_ms),    8, false)
             << " | " << Pad(FmtMs(s.max_ms),    8, false) << '\n';

        if (verbose_ && s.total_bytes > 0) {
            out_ << "  |   " << Pad("Kernel:", 18) << Pad(s.kernel_name, 30)
                 << " | MB: " << FmtMs(s.total_bytes / (1024.0 * 1024.0), 1)
                 << " | BW: " << FmtMs(s.avg_bw_gbps, 2) << " GB/s"
                 << " | q_d: " << FmtMs(s.avg_queue_delay_ms)
                 << " | s_d: " << FmtMs(s.avg_submit_delay_ms)
                 << " | c_d: " << FmtMs(s.avg_complete_delay_ms) << '\n';
        }
    }
    PrintSeparator('-', width_);
}

std::string ReportPrinter::AssessCounter(const std::string& name, double v) const {
    if (name == "GPUBusy")         return v > 85 ? "EXCELLENT" : v > 60 ? "GOOD" : "LOW";
    if (name == "VALUBusy")        return v > 70 ? "GOOD" : "LOW";
    if (name == "L2CacheHit")      return v > 80 ? "EXCELLENT" : v > 50 ? "OK" : "POOR";
    if (name == "LDSBankConflict") return v < 5  ? "OK" : "HIGH";
    if (name == "MemUnitStalled")  return v < 15 ? "OK" : "HIGH";
    return "";
}

void ReportPrinter::PrintHardwareProfile(const HardwareProfile& p, BottleneckType verdict) {
    out_ << '\n' << "  " << p.event_name
         << " (" << p.sample_count << " samples with counters)\n";
    PrintSeparator('-', width_);
    out_ << "  | " << Pad("Counter", 22)
         << " | " << Pad("Avg", 9, false)
         << " | " << Pad("Min", 9, false)
         << " | " << Pad("Max", 9, false)
         << " | Assessment\n";
    PrintSeparator('-', width_);

    for (const auto& [name, avg] : p.avg_counters) {
        double mn = p.min_counters.count(name) ? p.min_counters.at(name) : 0.0;
        double mx = p.max_counters.count(name) ? p.max_counters.at(name) : 0.0;
        out_ << "  | " << Pad(name, 22)
             << " | " << Pad(FmtMs(avg, 2), 9, false)
             << " | " << Pad(FmtMs(mn,  2), 9, false)
             << " | " << Pad(FmtMs(mx,  2), 9, false)
             << " | " << AssessCounter(name, avg) << '\n';
    }
    PrintSeparator('-', width_);
    if (verdict != BottleneckType::Unknown) {
        out_ << "  VERDICT: " << ProfileAnalyzer::BottleneckTypeToString(verdict) << '\n';
    }
    PrintSeparator('-', width_);
}

void ReportPrinter::PrintFooter() {
    PrintSeparator('=', width_);
    out_ << "  End of report\n";
    PrintSeparator('=', width_);
}

} // namespace
```

---

### B4.3. CMake

Добавить в `core/src/CMakeLists.txt`:
```cmake
src/services/profiling/report_printer.cpp
```

---

### B4.4. Unit-тесты

**Новый файл**: `core/tests/test_report_printer.hpp`

Используем `std::ostringstream` для capture — основной плюс нового дизайна.

```cpp
#pragma once
#include "test_framework.hpp"
#include <core/services/profiling/report_printer.hpp>
#include <sstream>

namespace drv_gpu_lib::profiling::tests {

inline void TestReportPrinter_PipelineBlock_ContainsBarChart() {
    std::ostringstream oss;
    ReportPrinter p(oss);

    PipelineBreakdown b;
    b.module_name  = "heterodyne";
    b.total_avg_ms = 10.0;
    b.entries = {
        {"FFT",      "kernel",  7.0, 70.0, 100},
        {"Multiply", "kernel",  2.0, 20.0, 100},
        {"Upload",   "copy",    1.0, 10.0, 100}
    };
    b.kernel_percent = 90.0;
    b.copy_percent   = 10.0;

    p.PrintPipelineBreakdown(b);
    auto s = oss.str();
    ASSERT_TRUE(s.find("heterodyne") != std::string::npos);
    ASSERT_TRUE(s.find("FFT") != std::string::npos);
    ASSERT_TRUE(s.find("70.0%") != std::string::npos);
    ASSERT_TRUE(s.find("####") != std::string::npos);    // bar chart present
    ASSERT_TRUE(s.find("kernel: 90.0%") != std::string::npos);
}

inline void TestReportPrinter_StatsTable_AllColumns() {
    std::ostringstream oss;
    ReportPrinter p(oss);
    std::vector<EventSummary> sums(1);
    sums[0].event_name = "FFT_Execute";
    sums[0].kind       = 0;
    sums[0].count      = 100;
    sums[0].avg_ms     = 12.5;
    sums[0].median_ms  = 12.3;
    sums[0].p95_ms     = 14.8;
    sums[0].stddev_ms  = 0.9;
    sums[0].min_ms     = 11.0;
    sums[0].max_ms     = 15.2;

    p.PrintStatisticalTable("spectrum", sums);
    auto s = oss.str();
    ASSERT_TRUE(s.find("FFT_Execute") != std::string::npos);
    ASSERT_TRUE(s.find("12.500") != std::string::npos);    // avg
    ASSERT_TRUE(s.find("12.300") != std::string::npos);    // median
    ASSERT_TRUE(s.find("14.800") != std::string::npos);    // p95
}

inline void TestReportPrinter_HardwareProfile_WithVerdict() {
    std::ostringstream oss;
    ReportPrinter p(oss);
    HardwareProfile hp;
    hp.event_name = "FFT_Execute";
    hp.sample_count = 100;
    hp.avg_counters["GPUBusy"]  = 92.3;
    hp.avg_counters["VALUBusy"] = 78.5;
    hp.min_counters["GPUBusy"]  = 85.0;
    hp.max_counters["GPUBusy"]  = 98.7;

    p.PrintHardwareProfile(hp, BottleneckType::ComputeBound);
    auto s = oss.str();
    ASSERT_TRUE(s.find("GPUBusy") != std::string::npos);
    ASSERT_TRUE(s.find("92.30") != std::string::npos);
    ASSERT_TRUE(s.find("compute-bound") != std::string::npos);   // verdict
    ASSERT_TRUE(s.find("EXCELLENT") != std::string::npos);       // assessment
}

inline void TestReportPrinter_VerboseShowsBandwidth() {
    std::ostringstream oss;
    ReportPrinter p(oss);
    p.SetVerbose(true);
    std::vector<EventSummary> sums(1);
    sums[0].event_name   = "Copy";
    sums[0].kind         = 1;
    sums[0].count        = 10;
    sums[0].total_bytes  = 100ull * 1024 * 1024;
    sums[0].avg_bw_gbps  = 8.5;
    sums[0].kernel_name  = "hipMemcpy";
    p.PrintStatisticalTable("mod", sums);
    auto s = oss.str();
    ASSERT_TRUE(s.find("hipMemcpy") != std::string::npos);
    ASSERT_TRUE(s.find("8.50") != std::string::npos);   // BW
}

} // namespace
```

---

### B4.5. Build + test

```bash
cmake --build build --target core core_unit_tests -j
ctest --test-dir build -R test_report_printer --output-on-failure
```

---

### B4.6. Commit

```
[profiler-v2] Phase B4: ReportPrinter (block-based console output)

- Add ReportPrinter with injectable std::ostream (testable!)
- Blocks: Header / L1 Pipeline / L2 Stats / L3 Hardware / Footer
- ASCII bar chart for L1 pipeline breakdown
- Verbose mode shows kernel_name, bandwidth, delays
- 4 unit tests via std::ostringstream capture

Not yet wired into GPUProfiler — Phase C (exporters) will use it.
```

---

## ✅ Acceptance Criteria

| # | Критерий | Проверка |
|---|----------|---------|
| 1 | ReportPrinter принимает std::ostream& в ctor | `grep "explicit ReportPrinter(std::ostream" include/` |
| 2 | 5 block-методов | grep все PrintHeader/PrintPipelineBreakdown/etc в хедере |
| 3 | BarChart рисует `#` | поиск `###` в теле теста TestPipelineBlock |
| 4 | 4+ тестов зелёные | ctest |
| 5 | cmake --build зелёный | exit 0 |

---

## 📖 Замечания

- **Ширина по умолчанию 110** — как в текущем PrintReport.
- **Verbose скрывает лишние колонки по умолчанию** — рендер простой таблицы всегда.
- **AssessCounter** — простая эвристика. В будущем можно config-driven, пока hardcoded OK.

---

*Task created: 2026-04-17 | Phase B4 | Status: READY (after B3)*
