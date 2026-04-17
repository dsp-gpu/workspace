# TASK Phase C: Strategy Exporters + ScopedProfileTimer + Facade wiring

> **Prerequisites**: B1, B2, B3, B4 выполнены
> **Effort**: 3-4 часа
> **Scope**: `core/` (exporters + facade)
> **Depends**: все B-фазы

---

## 🎯 Цель

1. Создать `IProfileExporter` (Strategy) + 3 реализации: JSON, Markdown, Console
2. Создать `ScopedProfileTimer` (W5 — для simple cases)
3. Создать `IProfilerRecorder` интерфейс (W1 — на будущее, опционально)
4. Создать `ProfilingFacade` — thin singleton, связать Collector+Store+Analyzer
5. Обернуть параллельный Export (`std::async` JSON+MD одновременно)

---

## 📋 Шаги

### C1. IProfileExporter interface

**Новый файл**: `core/include/core/services/profiling/i_profile_exporter.hpp`

```cpp
#pragma once

#include <string>

#include <core/services/profiling_types.hpp>
#include <core/services/profiling/profile_store.hpp>

namespace drv_gpu_lib::profiling {

/// Export strategy — pluggable output formats.
class IProfileExporter {
public:
    virtual ~IProfileExporter() = default;

    /// Export store snapshot to destination.
    /// destination — file path for json/md, ignored for console.
    virtual bool Export(const ProfileStore::StoreData& snapshot,
                        const GPUReportInfo& gpu_info,
                        const std::string& destination) = 0;

    virtual std::string Name() const = 0;
};

} // namespace
```

---

### C2. JsonExporter

**Файлы**:
- `core/include/core/services/profiling/json_exporter.hpp`
- `core/src/services/profiling/json_exporter.cpp`

JSON формируется вручную (spec: no new deps, G6 "no nlohmann"). Формат v2:

```json
{
  "schema_version": 2,
  "timestamp": "2026-04-17 14:30:00",
  "gpu": [
    {
      "gpu_id": 0,
      "device_name": "AMD Radeon RX 9070 XT",
      "modules": [
        {
          "name": "spectrum",
          "pipeline": {
            "total_avg_ms": 13.35,
            "kernel_percent": 100.0,
            "entries": [
              {"event":"FFT","kind":"kernel","avg_ms":12.5,"percent":93.6,"count":100}
            ]
          },
          "events": [
            {
              "name": "FFT_Execute",
              "kernel_name": "hipFFT_r2c",
              "kind": "kernel",
              "count": 100,
              "avg_ms": 12.5, "median_ms": 12.3, "p95_ms": 14.8,
              "stddev_ms": 0.9, "min_ms": 11.0, "max_ms": 15.2,
              "total_bytes": 104857600, "avg_bw_gbps": 8.4,
              "hardware": {
                "sample_count": 100,
                "avg_counters": { "GPUBusy": 92.3, "VALUBusy": 78.5 }
              }
            }
          ]
        }
      ]
    }
  ]
}
```

Реализация — использовать `std::ostringstream`, аккуратно экранировать строки, выводить в файл.

**Template метод**: `SerializeString(const std::string& s)` — экранирует `"` и `\`, обрамляет кавычками.

---

### C3. MarkdownExporter

**Файлы**:
- `core/include/core/services/profiling/markdown_exporter.hpp`
- `core/src/services/profiling/markdown_exporter.cpp`

Markdown формат v2 — повторяет console отчёт, но в markdown-таблицах:

```markdown
# GPU Profiling Report — 2026-04-17 14:30:00

## GPU 0: AMD Radeon RX 9070 XT

### Pipeline Breakdown — spectrum

| Event | Kind | Avg ms | % | Distribution |
|-------|------|-------:|--:|-------------|
| FFT   | kernel | 12.5 | 93.6% | ... |
| Pad   | kernel |  0.85 |  6.4% | ... |
| **TOTAL** | | **13.35** | **100%** | kernel: 100% |

### Statistical Summary — spectrum

| Event | N | Avg | Med | p95 | StdDev | Min | Max |
|-------|--:|----:|----:|----:|-------:|----:|----:|
| FFT   |100|12.5 |12.3 |14.8 | 0.9    |11.0 |15.2 |

### Hardware Counters — FFT_Execute

| Counter | Avg | Min | Max | Assessment |
|---------|----:|----:|----:|-----------|
| GPUBusy | 92.3% | 85.0% | 98.7% | EXCELLENT |

**Verdict**: compute-bound
```

---

### C4. ConsoleExporter

**Файлы**:
- `core/include/core/services/profiling/console_exporter.hpp`
- `core/src/services/profiling/console_exporter.cpp`

Делегирует в `ReportPrinter` (Phase B4). `destination` игнорируется, пишет в `std::cout`.

```cpp
bool ConsoleExporter::Export(const ProfileStore::StoreData& snapshot,
                              const GPUReportInfo& info,
                              const std::string&) {
    ReportPrinter printer(std::cout);
    for (const auto& [gpu_id, modules] : snapshot) {
        printer.PrintHeader(info, gpu_id);
        for (const auto& [mod_name, events] : modules) {
            auto pb = ProfileAnalyzer::ComputePipelineBreakdown(mod_name, events);
            printer.PrintPipelineBreakdown(pb);

            std::vector<EventSummary> sums;
            for (const auto& [evt, recs] : events)
                sums.push_back(ProfileAnalyzer::ComputeSummary(recs));
            printer.PrintStatisticalTable(mod_name, sums);

            // L3 only for events with counters
            for (const auto& [evt, recs] : events) {
                auto hp = ProfileAnalyzer::AggregateCounters(recs);
                if (hp.sample_count > 0) {
                    auto verdict = ProfileAnalyzer::DetectBottleneck(hp);
                    printer.PrintHardwareProfile(hp, verdict);
                }
            }
        }
        printer.PrintFooter();
    }
    return true;
}
```

---

### C5. IProfilerRecorder interface (W1 — на будущее)

**Новый файл**: `core/include/core/services/profiling/i_profiler_recorder.hpp`

```cpp
#pragma once

#include <string>

#include <core/services/profiling_types.hpp>

namespace drv_gpu_lib::profiling {

/// Recording interface — injectable alternative to ProfilingFacade::GetInstance().
/// Per W1 review: tiredured tests use this, production benchmarks keep singleton.
class IProfilerRecorder {
public:
    virtual ~IProfilerRecorder() = default;
    virtual void Record(int gpu_id,
                        const std::string& module,
                        const std::string& event,
                        const ROCmProfilingData& data) = 0;
};

} // namespace
```

`ProfilingFacade` в C6 будет его наследовать.

---

### C6. ProfilingFacade — thin singleton + orchestrator

**Файлы**:
- `core/include/core/services/profiling/profiling_facade.hpp`
- `core/src/services/profiling/profiling_facade.cpp`

```cpp
#pragma once

#include <memory>
#include <string>
#include <vector>

#include <core/services/async_service_base.hpp>
#include <core/services/profiling_types.hpp>
#include <core/services/profiling/i_profiler_recorder.hpp>
#include <core/services/profiling/profile_store.hpp>
#include <core/services/profiling/i_profile_exporter.hpp>

namespace drv_gpu_lib::profiling {

/// Thin singleton facade. Public entry point for modules.
/// CONTRACT (W2): Export() may only be called after WaitEmpty().
///
/// @warning For production benchmarks only.
///          Unit tests should use IProfilerRecorder* injection —
///          see test_profile_store.cpp for example.
class ProfilingFacade : public IProfilerRecorder {
public:
    static ProfilingFacade& GetInstance();

    void Enable(bool on);
    bool IsEnabled() const;

    void SetConfig(ProfileStoreConfig cfg);
    void SetGpuInfo(int gpu_id, GPUReportInfo info);

    // === Recording (hot path — goes to async queue) ===
    void Record(int gpu_id, const std::string& module,
                const std::string& event, const ROCmProfilingData& data) override;

    /// Batch helper — for ROCmProfEvents pattern in benchmarks.
    template<typename EventsContainer>
    void BatchRecord(int gpu_id, const std::string& module,
                     const EventsContainer& events) {
        for (const auto& [event_name, data] : events)
            Record(gpu_id, module, event_name, data);
    }

    /// Wait until async queue is drained.
    void WaitEmpty();

    /// Explicit reset — forbidden during active session.
    void Reset();

    // === Analysis + Export ===
    /// Export to file via chosen exporter. Call WaitEmpty() first!
    bool Export(IProfileExporter& exporter, const std::string& destination);

    /// Convenience — export JSON + Markdown.
    /// @param parallel  если true — `std::async` оба экспорта одновременно (быстрее,
    ///                  но занимает 2 CPU-потока; для GPU-benchmark'ов где важна
    ///                  детерминистичная latency — оставить false).
    ///                  Default = false (sequential).
    bool ExportJsonAndMarkdown(const std::string& json_path,
                                const std::string& md_path,
                                bool parallel = false);

    /// Direct snapshot access (for custom exporters / Jupyter).
    ProfileStore::StoreData GetSnapshot() const;

    /// Напечатать отчёт в консоль через ConsoleOutput (CLAUDE.md правило).
    /// Формирует отчёт в ostringstream → один вызов ConsoleOutput::Print().
    /// Используется вместо прямого std::cout — соответствует корпоративному
    /// правилу проекта «консоль только через ConsoleOutput::GetInstance()».
    void PrintReport();

private:
    ProfilingFacade();
    ~ProfilingFacade();
    ProfilingFacade(const ProfilingFacade&) = delete;
    ProfilingFacade& operator=(const ProfilingFacade&) = delete;

    class Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace
```

Реализация использует `AsyncServiceBase<ProfilingRecord>` как worker:
- `Record()` → `record_from_rocm` → `Enqueue`
- Worker thread pop → `store_.Append`
- `WaitEmpty()` → AsyncServiceBase waiter

**`ExportJsonAndMarkdown` (параллельный!)**:

```cpp
bool ProfilingFacade::ExportJsonAndMarkdown(const std::string& json_path,
                                             const std::string& md_path) {
    WaitEmpty();                       // barrier — no writes after
    auto snapshot = GetSnapshot();
    auto gpu_info = impl_->gpu_info_for_first_;

    auto fut_json = std::async(std::launch::async, [&] {
        JsonExporter je;
        return je.Export(snapshot, gpu_info, json_path);
    });
    auto fut_md = std::async(std::launch::async, [&] {
        MarkdownExporter me;
        return me.Export(snapshot, gpu_info, md_path);
    });
    return fut_json.get() && fut_md.get();
}
```

---

### C7. ScopedProfileTimer (W5 — только для simple cases)

**Новый файл**: `core/include/core/services/profiling/scoped_profile_timer.hpp`

```cpp
#pragma once

#include <hip/hip_runtime.h>
#include <string>

#include <core/services/scoped_hip_event.hpp>   // уже существует в core
#include <core/services/profiling_types.hpp>

namespace drv_gpu_lib::profiling {

/// RAII timer for simple benchmarks (one kernel = one timer).
/// @deprecated For production benchmarks with L1 pipeline breakdown,
///             use ROCmProfEvents + ProfilingFacade::BatchRecord instead.
class [[nodiscard]] ScopedProfileTimer {
public:
    ScopedProfileTimer(int gpu_id,
                       std::string module,
                       std::string event,
                       hipStream_t stream);
    ~ScopedProfileTimer();

    ScopedProfileTimer(const ScopedProfileTimer&) = delete;
    ScopedProfileTimer& operator=(const ScopedProfileTimer&) = delete;

private:
    ScopedHipEvent start_, end_;
    hipStream_t    stream_;
    int            gpu_id_;
    std::string    module_;
    std::string    event_;
};

} // namespace
```

Реализация в `.cpp`: `start_.Record(stream_)` в ctor, `end_.Record(stream_)` + `hipEventSynchronize` + формирование `ROCmProfilingData` + `ProfilingFacade::GetInstance().Record(...)` в dtor.

---

### C8. Backward compat shim

**Файл**: `core/include/core/services/gpu_profiler.hpp` — уже существующий

Превратить в deprecated shim:

```cpp
#pragma once

#include <core/services/profiling/profiling_facade.hpp>

namespace drv_gpu_lib {

/// @deprecated Use drv_gpu_lib::profiling::ProfilingFacade::GetInstance().
///             This shim will be removed in v2.0.
using GPUProfiler [[deprecated("Use ProfilingFacade")]] = profiling::ProfilingFacade;

} // namespace
```

`core/src/services/gpu_profiler.cpp` — **удалить целиком** (логика переехала).
Обновить `core/src/CMakeLists.txt` — убрать из `target_sources` (очевидная правка).

---

### C9. Обновить GpuBenchmarkBase

**Файл**: `core/include/core/services/gpu_benchmark_base.hpp`

- Убрать `RecordEvent(cl_event)` — уже сделано в Phase A
- Обновить `RecordROCmEvent` чтобы шёл через `ProfilingFacade::GetInstance()`
- Добавить `InitProfiler()` которая делает `ProfilingFacade::GetInstance().Enable(true)` + опционально `ReserveHint`

---

### C10. Добавить все файлы в CMake

Разрешённая правка `core/src/CMakeLists.txt`:

```cmake
target_sources(core PRIVATE
    # ... existing ...
    src/services/profiling/json_exporter.cpp
    src/services/profiling/markdown_exporter.cpp
    src/services/profiling/console_exporter.cpp
    src/services/profiling/profiling_facade.cpp
    src/services/profiling/scoped_profile_timer.cpp
    # УДАЛИТЬ: src/services/gpu_profiler.cpp
)
```

---

### C11. Unit-тесты

**Новый файл**: `core/tests/test_exporters.hpp` — минимум:
- `TestJsonExporter_ValidJson` — парсится, содержит schema_version=2
- `TestJsonExporter_EscapesQuotes` — модуль с именем `a"b` экранируется
- `TestMarkdownExporter_TablesPresent` — содержит `|` + `---`
- `TestConsoleExporter_WritesToCout` — через редиректа `std::cout.rdbuf`

**Новый файл**: `core/tests/test_profiling_facade.hpp`:
- `TestFacade_EnableDisable`
- `TestFacade_RecordThenWaitEmpty_RecordsInStore`
- `TestFacade_ExportJsonAndMarkdown_BothFiles` — создать tmp dir, экспорт, проверить оба файла существуют и непустые
- `TestFacade_BatchRecord_PropagatesAll`

---

### C12. Build + test

```bash
cmake --build build --target core core_unit_tests -j
ctest --test-dir build -R "test_(exporters|profiling_facade|scoped_profile)" --output-on-failure
```

---

### C13. Commit

```
[profiler-v2] Phase C: Exporters + Facade + ScopedProfileTimer

- Add IProfileExporter (Strategy) + 3 implementations:
  - JsonExporter (manual JSON, no new deps — G6)
  - MarkdownExporter
  - ConsoleExporter (delegates to ReportPrinter)
- Add IProfilerRecorder interface (W1 — DI for future)
- Rewrite ProfilingFacade:
  - Thin singleton + AsyncServiceBase worker
  - BatchRecord template for ROCmProfEvents pattern (17a)
  - ExportJsonAndMarkdown (parallel via std::async — Round 3)
  - WaitEmpty() barrier before Export (C1 contract)
- Add ScopedProfileTimer (W5 — simple cases only, [[deprecated]] for pipeline)
- Deprecate gpu_profiler.hpp as shim → ProfilingFacade
- Remove src/services/gpu_profiler.cpp (logic moved)

Tests: 4 exporter tests, 4 facade tests.
```

---

## ✅ Acceptance Criteria

| # | Критерий | Проверка |
|---|----------|---------|
| 1 | IProfileExporter interface | grep interface header |
| 2 | 3 exporters работают | TestJsonExporter + TestMarkdown + TestConsole зелёные |
| 3 | JSON schema_version=2 | `grep "schema_version" src/services/profiling/json_exporter.cpp` |
| 4 | Parallel export | `grep "std::async" src/services/profiling/profiling_facade.cpp` |
| 5 | WaitEmpty перед Export | `grep -A3 "ExportJsonAndMarkdown" src/.../profiling_facade.cpp` содержит WaitEmpty |
| 6 | BatchRecord template | `grep "BatchRecord" include/.../profiling_facade.hpp` |
| 7 | Shim deprecated | `grep deprecated include/core/services/gpu_profiler.hpp` |
| 8 | ScopedProfileTimer маркер | `grep deprecated include/.../scoped_profile_timer.hpp` |
| 9 | Старый gpu_profiler.cpp удалён | `test ! -f src/services/gpu_profiler.cpp` |
| 10 | Все тесты зелёные | ctest exit 0 |

---

## 📖 Замечания

- **`ExportJsonAndMarkdown`** — это удобство. Отдельные `Export(JsonExporter, path)` и `Export(MarkdownExporter, path)` тоже работают, они просто будут последовательны.
- **Console exporter всегда один**: нет смысла в параллельном cout.
- **JSON parse** в тесте — можно использовать простой check через `rapidjson` если уже есть в core, иначе grep по ключевым строкам.

---

*Task created: 2026-04-17 | Phase C | Status: READY (after all B)*
