# Phase B3 Report — ProfileAnalyzer (L1/L2/L3)

- **Date**: 2026-04-20
- **Agent**: task-profiler-v2
- **Branch**: `new_profiler`
- **Commit**: `c1853eb` (HEAD)
- **Status**: ✅ PASS

---

## 🎯 Что сделано

### 1. Новые файлы
| Файл | Назначение |
|------|-----------|
| `core/include/core/services/profiling/profile_analysis_types.hpp` | Result-типы: EventSummary, PipelineBreakdown, HardwareProfile, BottleneckType (R6 enum), BottleneckThresholds (R5 struct) |
| `core/include/core/services/profiling/profile_analyzer.hpp` | API класса ProfileAnalyzer (static методы) |
| `core/src/services/profiling/profile_analyzer.cpp` | Реализация L1/L2/L3 компьюта |
| `core/tests/test_profile_analyzer.hpp` | 17 unit-тестов |

### 2. Изменённые файлы
| Файл | Изменение |
|------|----------|
| `core/CMakeLists.txt` | +1 строка `src/services/profiling/profile_analyzer.cpp` в target_sources |
| `core/tests/all_test.hpp` | +include + вызов `test_profile_analyzer::run()` |

---

## 🧠 Реализованные методы

### Level 2 (Statistics)
- `ComputeSummary(records)` — avg/min/max/median/p95/p99/stddev/total + bandwidth + queue/submit/complete delays
- `DetectOutliers(records, sigma)` — indexes где |x - mean| > sigma·σ
- `MovingAverage(records, window)` — скользящее среднее ExecTime

### Level 1 (Pipeline)
- `ComputePipelineBreakdown(module, events_map)` — entries отсортированы по avg ↓, проценты kernel/copy/barrier

### Level 3 (HW counters)
- `AggregateCounters(records)` — avg/min/max каждого counter по records с HasCounters()
- `DetectBottleneck(profile, thresholds={})` — verdict из enum BottleneckType
- `BottleneckTypeToString(t)` — human-readable

---

## ✅ Применённые решения ревью Round 3

| ID | Решение | Где реализовано |
|----|--------|-----------------|
| **C1** | Analyzer работает только со snapshot, без sync | Все методы `static`, нет shared state; контракт в doxygen |
| **C4** | std::sort для percentiles — ок (one-time) | `profile_analyzer.cpp`, строки с `std::sort(times_ms.begin(), ...)` |
| **R5** | `struct BottleneckThresholds` с RDNA 3.x defaults | `profile_analysis_types.hpp` |
| **R6** | `enum class BottleneckType { ComputeBound, MemoryBound, CacheMiss, Balanced, Unknown }` | `profile_analysis_types.hpp` |

---

## 🧪 Тесты (17)

| # | Name | Scope | Distribution |
|---|------|-------|--------------|
| 1 | TestComputeSummary_SingleRecord | L2 | singleton |
| 2 | TestComputeSummary_TenRecords | L2 | deterministic 1..10 |
| 3 | TestComputeSummary_Bandwidth | L2 | — |
| 4 | TestComputeSummary_Unimodal | L2 | **normal N(10, 1)** |
| 5 | TestComputeSummary_Bimodal | L2 | **bimodal skewed (800×N(1,0.05) + 200×N(100,1))** |
| 6 | TestComputeSummary_Outliers | L2 | **normal + 2 outliers (100ms)** |
| 7 | TestDetectOutliers | L2 | 3σ threshold, 100+2 |
| 8 | TestMovingAverage_Window | L2 | monotonic 1..5 |
| 9 | TestPipelineBreakdown_Percentages | L1 | 3 events, Σ% = 100 |
| 10 | TestPipelineBreakdown_KernelCopyRatio | L1 | 2 kernel + 1 copy → 80/20 |
| 11 | TestPipelineAggregation_Order | L1 | avg DESC: big/medium/small |
| 12 | TestAggregateCounters_OnlyWithCounters | L3 | 5 records, 3 с counters |
| 13 | **TestDetectBottleneck_ComputeBound** | L3 | VALU=85, Mem=30 |
| 14 | **TestDetectBottleneck_MemoryBound** | L3 | VALU=30, Mem=75 |
| 15 | **TestDetectBottleneck_CacheMiss** | L3 | L2=40 |
| 16 | TestDetectBottleneck_CustomThresholds | L3 | VALU=65 + lowered threshold → ComputeBound |
| 17 | TestDetectBottleneck_Unknown | L3 | sample_count=0 |

### Проверенные distributions
- **unimodal normal** ✅ (тест 4): |mean - median| < 0.15σ, σ_emp ≈ σ_req
- **bimodal** ✅ (тест 5): |mean - median| > 10 (разошлись), median в нижней моде
- **uniform-with-outliers** ✅ (тест 6): p95 < 10 (игнорирует), max ≥ 99 (видит)

### Проверенные BottleneckType
- **ComputeBound** ✅
- **MemoryBound** ✅
- **CacheMiss** ✅
- **Balanced** ✅ (внутри custom-thresholds тест)
- **Unknown** ✅

---

## 🏗️ Build & test

```
$ cmake --build build -j
[6/7] Linking CXX executable tests/test_core_main
(только pre-existing warnings в hipStreamDestroy nodiscard, не в новом коде)

$ ./build/tests/test_core_main
--- TEST SUITE: profile_analyzer (Phase B3) ---
... 17 tests ...
[PASS] profile_analyzer suite (17 tests)

EXIT=0
```

### Характерные measurement из тестов
- unimodal: avg=10.03, median=10.04, σ=1.05 (просили μ=10, σ=1)
- bimodal: mean=20.79, median=1.02, σ=39.57 (явно расходятся)
- outliers: p95=5.13, max=100.00, median=5.00

---

## 📋 Acceptance Criteria — проверка

| # | Критерий | Результат |
|---|----------|-----------|
| 1 | BottleneckType — enum | ✅ `enum class BottleneckType` в profile_analysis_types.hpp |
| 2 | BottleneckThresholds — struct | ✅ `struct BottleneckThresholds` там же |
| 3 | DetectBottleneck принимает thresholds | ✅ сигнатура `DetectBottleneck(profile, thresholds={})` |
| 4 | std::sort для percentiles | ✅ `std::sort(times_ms.begin(), times_ms.end())` в ComputeSummary |
| 5 | ≥ 12 тестов | ✅ 17 тестов |
| 6 | Все тесты зелёные | ✅ exit 0 |

---

## 🔜 Ready for: Phase B4

Следующая фаза использует:
- `ProfileStore::GetSnapshot()` + `ProfileAnalyzer::ComputeSummary/Pipeline/...`
- Совместно с `ReportPrinter` для финальных L1/L2/L3 отчётов.
