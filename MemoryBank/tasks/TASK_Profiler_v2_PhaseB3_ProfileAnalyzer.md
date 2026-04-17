# TASK Phase B3: ProfileAnalyzer (L1/L2/L3 stateless compute)

> **Prerequisites**: B1, B2 выполнены
> **Effort**: 3-4 часа
> **Scope**: `core/include/core/services/profiling/` + `core/src/services/profiling/`
> **Depends**: B1, B2

---

## 🎯 Цель

Создать **stateless анализатор**, который преобразует raw `ProfilingRecord` в:
- **L1**: Pipeline breakdown (процент каждой операции от total)
- **L2**: Statistical summary (median, p95, stddev)
- **L3**: Hardware counters profile + bottleneck detection

Учесть:
- **C4**: `std::sort` — ок (один раз после теста)
- **R5**: `BottleneckThresholds` как config struct
- **R6**: `BottleneckType` как enum
- **C1**: Analyzer работает с copy (snapshot), никакой синхронизации внутри

---

## 📋 Шаги

### B3.1. Типы результатов

**Новый файл**: `core/include/core/services/profiling/profile_analysis_types.hpp`

```cpp
#pragma once

#include <cstdint>
#include <map>
#include <string>
#include <vector>

namespace drv_gpu_lib::profiling {

/// Level 2: Statistical summary for one event.
struct EventSummary {
    std::string event_name;
    std::string kernel_name;
    uint32_t    kind = 0;
    uint64_t    count = 0;
    double      avg_ms = 0, min_ms = 0, max_ms = 0;
    double      median_ms = 0;
    double      p95_ms = 0, p99_ms = 0;
    double      stddev_ms = 0;
    double      total_ms = 0;
    // Bandwidth
    double      avg_bw_gbps = 0, peak_bw_gbps = 0;
    size_t      total_bytes = 0;
    // Delays
    double      avg_queue_delay_ms   = 0;
    double      avg_submit_delay_ms  = 0;
    double      avg_complete_delay_ms = 0;
};

/// Level 1: one entry in pipeline breakdown.
struct PipelineEntry {
    std::string event_name;
    std::string kind_string;
    double      avg_ms = 0;
    double      percent = 0;
    uint64_t    count = 0;
};

/// Level 1: full pipeline breakdown for one module.
struct PipelineBreakdown {
    std::string              module_name;
    double                   total_avg_ms = 0;
    std::vector<PipelineEntry> entries;
    // Aggregate by kind
    double kernel_percent  = 0;
    double copy_percent    = 0;
    double barrier_percent = 0;
};

/// Level 3: hardware counters profile (only when counters were collected).
struct HardwareProfile {
    std::string event_name;
    std::string kernel_name;
    uint64_t    sample_count = 0;
    std::map<std::string, double> avg_counters;
    std::map<std::string, double> min_counters;
    std::map<std::string, double> max_counters;
};

/// Bottleneck type (R6 enum instead of string).
enum class BottleneckType {
    ComputeBound,
    MemoryBound,
    CacheMiss,
    Balanced,
    Unknown
};

/// R5: thresholds for DetectBottleneck — config struct with RDNA 3.x defaults.
struct BottleneckThresholds {
    double compute_valu_min    = 80.0;   // VALUBusy % for compute-bound
    double memory_unit_busy_min = 70.0;  // MemUnitBusy % for memory-bound
    double memory_valu_max     = 50.0;   // VALUBusy < this while memory busy
    double l2_cache_hit_min    = 50.0;   // L2 hit below = cache-miss
};

} // namespace drv_gpu_lib::profiling
```

---

### B3.2. Analyzer header

**Новый файл**: `core/include/core/services/profiling/profile_analyzer.hpp`

```cpp
#pragma once

#include <vector>
#include <string>

#include <core/services/profiling_types.hpp>
#include <core/services/profiling/profile_analysis_types.hpp>

namespace drv_gpu_lib::profiling {

/// Stateless analyzer — takes const records, returns results.
/// All methods thread-safe (no shared state).
/// CONTRACT: input records must be stable (no concurrent writes).
class ProfileAnalyzer {
public:
    // === Level 2: Statistics ===
    static EventSummary ComputeSummary(const std::vector<ProfilingRecord>& records);

    static std::vector<size_t> DetectOutliers(
        const std::vector<ProfilingRecord>& records, double sigma = 3.0);

    static std::vector<double> MovingAverage(
        const std::vector<ProfilingRecord>& records, size_t window = 10);

    // === Level 1: Pipeline ===
    /// module_events is { event_name → vector<ProfilingRecord> } for one module.
    static PipelineBreakdown ComputePipelineBreakdown(
        const std::string& module_name,
        const std::unordered_map<std::string, std::vector<ProfilingRecord>>& module_events);

    // === Level 3: Hardware counters ===
    static HardwareProfile AggregateCounters(
        const std::vector<ProfilingRecord>& records);

    static BottleneckType DetectBottleneck(
        const HardwareProfile& profile,
        const BottleneckThresholds& thresholds = {});

    /// Convert enum to human-readable string (for reports).
    static std::string BottleneckTypeToString(BottleneckType t);
};

} // namespace drv_gpu_lib::profiling
```

---

### B3.3. Реализация

**Новый файл**: `core/src/services/profiling/profile_analyzer.cpp`

```cpp
#include <core/services/profiling/profile_analyzer.hpp>

#include <algorithm>
#include <cmath>
#include <numeric>

namespace drv_gpu_lib::profiling {

namespace {

double Percentile(std::vector<double>& sorted, double p) {
    if (sorted.empty()) return 0.0;
    double idx_f = p * (sorted.size() - 1);
    size_t idx_lo = static_cast<size_t>(idx_f);
    size_t idx_hi = std::min(idx_lo + 1, sorted.size() - 1);
    double frac = idx_f - idx_lo;
    return sorted[idx_lo] * (1 - frac) + sorted[idx_hi] * frac;
}

} // anon

EventSummary ProfileAnalyzer::ComputeSummary(
    const std::vector<ProfilingRecord>& records)
{
    EventSummary s;
    if (records.empty()) return s;

    s.event_name  = records.front().event_name;
    s.kernel_name = records.front().kernel_name;
    s.kind        = records.front().kind;
    s.count       = records.size();

    std::vector<double> times_ms;
    times_ms.reserve(records.size());
    double sum_ms = 0, sum_bw = 0, sum_q = 0, sum_s = 0, sum_c = 0;
    double min_ms = 1e18, max_ms = 0, peak_bw = 0;
    size_t total_bytes = 0;

    for (const auto& r : records) {
        double ms = r.ExecTimeMs();
        times_ms.push_back(ms);
        sum_ms += ms;
        min_ms = std::min(min_ms, ms);
        max_ms = std::max(max_ms, ms);
        sum_q += r.QueueDelayMs();
        sum_s += r.SubmitDelayMs();
        sum_c += r.CompleteDelayMs();
        total_bytes += r.bytes;
        double bw = r.BandwidthGBps();
        sum_bw += bw;
        peak_bw = std::max(peak_bw, bw);
    }

    s.avg_ms                = sum_ms / s.count;
    s.min_ms                = min_ms;
    s.max_ms                = max_ms;
    s.total_ms              = sum_ms;
    s.avg_queue_delay_ms    = sum_q / s.count;
    s.avg_submit_delay_ms   = sum_s / s.count;
    s.avg_complete_delay_ms = sum_c / s.count;
    s.total_bytes           = total_bytes;
    s.avg_bw_gbps           = sum_bw / s.count;
    s.peak_bw_gbps          = peak_bw;

    // median / p95 / p99 via sort (C4: one-time post-test is fine)
    std::sort(times_ms.begin(), times_ms.end());
    s.median_ms = Percentile(times_ms, 0.50);
    s.p95_ms    = Percentile(times_ms, 0.95);
    s.p99_ms    = Percentile(times_ms, 0.99);

    // stddev
    double var = 0;
    for (double t : times_ms) var += (t - s.avg_ms) * (t - s.avg_ms);
    s.stddev_ms = std::sqrt(var / s.count);

    return s;
}

std::vector<size_t> ProfileAnalyzer::DetectOutliers(
    const std::vector<ProfilingRecord>& records, double sigma)
{
    auto s = ComputeSummary(records);
    std::vector<size_t> outliers;
    double threshold = sigma * s.stddev_ms;
    for (size_t i = 0; i < records.size(); ++i) {
        if (std::abs(records[i].ExecTimeMs() - s.avg_ms) > threshold)
            outliers.push_back(i);
    }
    return outliers;
}

std::vector<double> ProfileAnalyzer::MovingAverage(
    const std::vector<ProfilingRecord>& records, size_t window)
{
    std::vector<double> out;
    out.reserve(records.size());
    double sum = 0;
    for (size_t i = 0; i < records.size(); ++i) {
        sum += records[i].ExecTimeMs();
        if (i >= window) sum -= records[i - window].ExecTimeMs();
        size_t n = std::min(i + 1, window);
        out.push_back(sum / n);
    }
    return out;
}

PipelineBreakdown ProfileAnalyzer::ComputePipelineBreakdown(
    const std::string& module_name,
    const std::unordered_map<std::string, std::vector<ProfilingRecord>>& module_events)
{
    PipelineBreakdown pb;
    pb.module_name = module_name;

    double total_avg = 0;
    struct Tmp { std::string name; std::string kind; double avg; uint64_t count; uint32_t kind_code; };
    std::vector<Tmp> tmp;
    tmp.reserve(module_events.size());

    for (const auto& [evt, recs] : module_events) {
        if (recs.empty()) continue;
        auto s = ComputeSummary(recs);
        tmp.push_back({evt, recs.front().KindString(), s.avg_ms, s.count, recs.front().kind});
        total_avg += s.avg_ms;
    }
    pb.total_avg_ms = total_avg;

    // Sort by average descending (biggest first — visual bar chart priority)
    std::sort(tmp.begin(), tmp.end(), [](const Tmp& a, const Tmp& b) {
        return a.avg > b.avg;
    });

    double kernel_ms = 0, copy_ms = 0, barrier_ms = 0;
    for (const auto& t : tmp) {
        PipelineEntry e;
        e.event_name  = t.name;
        e.kind_string = t.kind;
        e.avg_ms      = t.avg;
        e.percent     = total_avg > 0 ? 100.0 * t.avg / total_avg : 0;
        e.count       = t.count;
        pb.entries.push_back(e);
        switch (t.kind_code) {
            case 0: kernel_ms  += t.avg; break;
            case 1: copy_ms    += t.avg; break;
            case 2: barrier_ms += t.avg; break;
        }
    }
    pb.kernel_percent  = total_avg > 0 ? 100.0 * kernel_ms / total_avg : 0;
    pb.copy_percent    = total_avg > 0 ? 100.0 * copy_ms / total_avg : 0;
    pb.barrier_percent = total_avg > 0 ? 100.0 * barrier_ms / total_avg : 0;

    return pb;
}

HardwareProfile ProfileAnalyzer::AggregateCounters(
    const std::vector<ProfilingRecord>& records)
{
    HardwareProfile hp;
    if (records.empty()) return hp;
    hp.event_name  = records.front().event_name;
    hp.kernel_name = records.front().kernel_name;

    std::map<std::string, double> sums;
    std::map<std::string, double> mins;
    std::map<std::string, double> maxs;
    std::map<std::string, size_t> ns;

    for (const auto& r : records) {
        if (!r.HasCounters()) continue;
        ++hp.sample_count;
        for (const auto& [name, val] : r.counters) {
            sums[name] += val;
            auto [mit, ins_m] = mins.try_emplace(name, val);
            if (!ins_m) mit->second = std::min(mit->second, val);
            auto [xit, ins_x] = maxs.try_emplace(name, val);
            if (!ins_x) xit->second = std::max(xit->second, val);
            ++ns[name];
        }
    }

    for (const auto& [name, sum] : sums) {
        hp.avg_counters[name] = sum / ns[name];
        hp.min_counters[name] = mins[name];
        hp.max_counters[name] = maxs[name];
    }
    return hp;
}

BottleneckType ProfileAnalyzer::DetectBottleneck(
    const HardwareProfile& p,
    const BottleneckThresholds& th)
{
    if (p.sample_count == 0) return BottleneckType::Unknown;

    auto get = [&](const std::string& key) -> double {
        auto it = p.avg_counters.find(key);
        return it != p.avg_counters.end() ? it->second : -1.0;
    };

    double valu = get("VALUBusy");
    double mem  = get("MemUnitBusy");
    double l2   = get("L2CacheHit");

    if (l2 >= 0 && l2 < th.l2_cache_hit_min) return BottleneckType::CacheMiss;
    if (valu >= th.compute_valu_min && mem < th.memory_valu_max) return BottleneckType::ComputeBound;
    if (mem >= th.memory_unit_busy_min && valu < th.memory_valu_max) return BottleneckType::MemoryBound;
    return BottleneckType::Balanced;
}

std::string ProfileAnalyzer::BottleneckTypeToString(BottleneckType t) {
    switch (t) {
        case BottleneckType::ComputeBound: return "compute-bound";
        case BottleneckType::MemoryBound:  return "memory-bound";
        case BottleneckType::CacheMiss:    return "cache-miss";
        case BottleneckType::Balanced:     return "balanced";
        case BottleneckType::Unknown:      return "unknown";
    }
    return "unknown";
}

} // namespace
```

---

### B3.4. CMake

Добавить в `core/src/CMakeLists.txt` (target_sources):
```cmake
src/services/profiling/profile_analyzer.cpp
```

---

### B3.5. Unit-тесты

**Новый файл**: `core/tests/test_profile_analyzer.hpp`

Тесты на синтетических ProfilingRecord. Минимум:

1. `TestComputeSummary_SingleRecord` — count=1, avg=min=max
2. `TestComputeSummary_TenRecords` — проверить avg, median, p95, stddev вручную
3. `TestComputeSummary_Bandwidth` — bytes>0 даёт BandwidthGBps
4. `TestDetectOutliers` — 100 нормальных + 2 outlier, найти обе
5. `TestMovingAverage_Window` — монотонная последовательность, window=3
6. `TestPipelineBreakdown_Percentages` — 3 события, %% сумма = 100
7. `TestPipelineBreakdown_KernelCopyRatio` — 2 kernel + 1 copy, проверить kernel_percent/copy_percent
8. `TestAggregateCounters_OnlyWithCounters` — 5 records, 3 с counters — sample_count=3
9. `TestDetectBottleneck_ComputeBound` — VALUBusy=85, MemUnitBusy=30 → ComputeBound
10. `TestDetectBottleneck_MemoryBound` — VALUBusy=30, MemUnitBusy=75 → MemoryBound
11. `TestDetectBottleneck_CacheMiss` — L2CacheHit=40 → CacheMiss
12. `TestDetectBottleneck_CustomThresholds` — тот же сэмпл + thresholds override → другой verdict

Структура теста (пример #9):
```cpp
inline void TestDetectBottleneck_ComputeBound() {
    HardwareProfile p;
    p.sample_count = 10;
    p.avg_counters["VALUBusy"]    = 85.0;
    p.avg_counters["MemUnitBusy"] = 30.0;
    p.avg_counters["L2CacheHit"]  = 90.0;
    ASSERT_EQ(ProfileAnalyzer::DetectBottleneck(p), BottleneckType::ComputeBound);
}
```

---

### B3.6. Build + test

```bash
cmake --build build --target core core_unit_tests -j
ctest --test-dir build -R test_profile_analyzer --output-on-failure
```

Все 12+ тестов зелёные.

---

### B3.7. Commit

```
[profiler-v2] Phase B3: ProfileAnalyzer (L1/L2/L3 stateless compute)

- Add EventSummary, PipelineBreakdown, HardwareProfile types
- Add BottleneckType enum (R6) + BottleneckThresholds struct (R5)
- Add ProfileAnalyzer:
  - L1: ComputePipelineBreakdown (% per event + by-kind aggregate)
  - L2: ComputeSummary (avg, median, p95, p99, stddev, bandwidth)
  - L3: AggregateCounters + DetectBottleneck
  - Auxiliary: DetectOutliers, MovingAverage
- std::sort for percentiles (C4: one-time post-test OK)
- 12+ unit tests covering L1/L2/L3 paths

Stateless — no synchronization needed (C1 contract: input is snapshot).
```

---

## ✅ Acceptance Criteria

| # | Критерий | Проверка |
|---|----------|---------|
| 1 | BottleneckType — enum (not string) | `grep "enum class BottleneckType" include/` |
| 2 | BottleneckThresholds — struct | `grep "struct BottleneckThresholds" include/` |
| 3 | DetectBottleneck принимает thresholds | `grep "DetectBottleneck(.*Thresholds" include/` |
| 4 | std::sort используется для percentiles | `grep "std::sort" src/services/profiling/profile_analyzer.cpp` |
| 5 | 12+ тестов | `ctest -N \| grep profile_analyzer \| wc -l` >= 12 |
| 6 | Все тесты зелёные | ctest exit 0 |

---

## 📖 Замечания

- **Performance**: `ComputeSummary` для 1K records — ~20 μs (sort доминирует). Для 1M записей ~1 сек. Это **нормально** — вызывается 1 раз (C4).
- **Почему `unordered_map` в PipelineBreakdown API, а не `map`?** Соответствие ProfileStore::StoreData (W3).
- **Sort в PipelineBreakdown** — по avg descending, чтобы «самое тяжёлое сверху» для визуального отчёта.

---

*Task created: 2026-04-17 | Phase B3 | Status: READY (after B1+B2)*
