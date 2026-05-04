---
paths:
  - "**/*profiler*"
  - "**/*profiling*"
  - "**/profiling/**"
  - "**/benchmark*"
---

# 06 — Профилирование GPU (ProfilingFacade v2)

> ⚠️ Старый `GPUProfiler` — `@deprecated` (до Phase D).
> В новом коде — **только `ProfilingFacade`**.
> **Полные примеры** → `@MemoryBank/.claude/specs/ProfilingFacade_Usage.md`
> **Механизм** → `@MemoryBank/.claude/specs/GPU_Profiling_Mechanism.md`

## Единая точка

```cpp
#include <core/services/profiling/profiling_facade.hpp>
using drv_gpu_lib::profiling::ProfilingFacade;
```

## Обязательный порядок

```
SetGPUInfo(gpu_id, info)   ← ДО Start()!
  → Start()
  → SetEnabled(true)
  → SetGPUEnabled(gpu_id, true)
  → Record / BatchRecord / ScopedProfileTimer
  → WaitEmpty()              ← ДО Export*!
  → PrintReport / ExportMarkdown / ExportJSON
  → Stop()
```

Пропуск `SetGPUInfo` → «Unknown GPU» в отчёте.
Пропуск `WaitEmpty()` перед Export → потерянные async-записи.

## Режимы записи

| Метод | Когда |
|-------|-------|
| `Record(gpu, module, name, data)` | Одиночное событие |
| `BatchRecord(gpu, module, vector<ProfEvent>)` | Много событий — **предпочтительно** |
| `ScopedProfileTimer t(gpu, "M", "Op");` | RAII — auto-Record при выходе |

## Паттерн CollectOrRelease

Event используется как wait **ДО** `CollectOrRelease`:

```cpp
hipEvent_t a = Op1();
hipEvent_t b = Op2(a);               // a — wait для Op2
CollectOrRelease(a, "Op1Name", pe);  // только теперь собираем/освобождаем
```

## 🚫 Запрещено

- `GetStats()` + цикл + `ConsoleOutput::Print()` — ломает формат.
- `std::cout` / `printf` для метрик.
- Свой «форматировщик таблиц» — всё есть в `Export*`.
- `GPUProfiler` в новом коде (`@deprecated`).

## Timing source (Q7)

`ProfilingFacade` поддерживает 2 источника GPU-clock данных:

| Source | Default | CMake-флаг | Поля |
|--------|---------|------------|------|
| `TimingSource::HipEvent`    | ✅ всегда | — | start_ns, end_ns (из `hipEventElapsedTime`) |
| `TimingSource::Rocprofiler` | opt-in | `-DDSP_PROFILING_ROCTRACER=ON` | + queued_ns, submit_ns, complete_ns, correlation_id, queue_id |

Переключение в runtime:

```cpp
auto& f = drv_gpu_lib::profiling::ProfilingFacade::GetInstance();
f.SetTimingSource(drv_gpu_lib::profiling::TimingSource::Rocprofiler);
// без флага — silent fallback на HipEvent (GetTimingSource() вернёт HipEvent).
```

**Когда брать Rocprofiler**:
- Микро-оптимизация hot-path: видим что pipeline теряет время вне kernel'а
- Нужны queue_delay (queued→submit) / submit_delay (submit→start) / exec (start→end) раздельно
- Multi-stream сценарии — `queue_id` различает потоки

**Когда HipEvent хватает**:
- Бенчмарк одного класса в изоляции (точность ±0.5 µs достаточна)
- Production hot-path без активного debug
- Нет ROCm 7+ или установка rocprofiler-sdk недоступна

Подробности → `MemoryBank/specs/Rocprofiler_API_2026-05-04.md`.

### Hardware counters (Q7.F)

Расширение Q7 — опционально подписаться на per-dispatch perf counters:

```cpp
auto& f = drv_gpu_lib::profiling::ProfilingFacade::GetInstance();
f.SetTimingSource(drv_gpu_lib::profiling::TimingSource::Rocprofiler);
f.SetCounters({"GPUBusy", "L2CacheHit", "LDSBankConflict", "FetchSize"});
// затем Record(...) — counters попадут в ProfilingRecord.counters[<name>]
```

| Свойство | Значение |
|----------|----------|
| Default | пустой набор (counters off) |
| Источник имён | `/opt/rocm/share/rocprofiler-sdk/counter_defs.yaml` (252 metric'а на ROCm 7.2) |
| Полезный минимум | `GPUBusy`, `L2CacheHit`, `LDSBankConflict`, `FetchSize`, `WriteSize` |
| Overhead | +10-50% per dispatch — **не для production hot-path** |
| Поведение на HipEvent | silent no-op (counters не поддерживаются) |
| Поведение без CMake-флага | silent no-op (Rocprofiler fallback на HipEvent) |
| Unsupported counter | silent skip (counter просто не появляется в результате) |

**Когда брать**: точечный сеанс микро-оптимизации kernel'а. Включил — измерил — выключил.

План реализации → `MemoryBank/tasks/TASK_Profiler_v2_Q7F_Counters.md`.

## Параллельный прогон тестов

`ProfilingFacade` — singleton с разделяемым state. Тесты, вызывающие
`Reset()` или пишущие в Facade, **нельзя** параллелить:

- `core/tests/test_golden_export.hpp` — пишет в Facade и сравнивает с golden JSON/MD
- `core/tests/test_quality_gates.hpp` — Phase E4 G8/G9/G10 (Record latency, mem, compute)

**Текущая модель** (Phase E Profiler v2 closeout, 2026-05-04): один бинарник
`test_core_main` запускает все тесты последовательно через `drvgpu_all_test::run()`.
**RUN_SERIAL property не нужен** — гонок нет by construction.

**Если меняем архитектуру** (отдельные ctest-target'ы или `ctest -j`):

```cmake
# в core/tests/CMakeLists.txt
add_test(NAME profiler_golden  COMMAND test_core_main --filter=Golden*)
add_test(NAME profiler_quality COMMAND test_core_main --filter=Quality*)
set_tests_properties(profiler_golden profiler_quality
  PROPERTIES RUN_SERIAL TRUE LABELS "profiler_v2;serial"
)
```

Без `RUN_SERIAL` под `ctest -j$(nproc)` записи разных тестов смешиваются в singleton
→ golden падает или quality-gates ловят чужие латенси. Не повторять урок.

## Бенчмарки

- `{repo}/tests/{name}_benchmark.hpp` через `GpuBenchmarkBase`.
- Только ROCm-версия.
- Сравнение с CPU-эталоном — **до** оптимизации.

## Куда складывать результаты

```
DSP/Results/Profiler/YYYY-MM-DD_HH-MM-SS.json
DSP/Results/Profiler/YYYY-MM-DD_HH-MM-SS.md
```

## Оптимизация после профилирования

- Гайд → `@MemoryBank/.claude/specs/ROCm_HIP_Optimization_Guide.md`
- Шпаргалка → `@MemoryBank/.claude/specs/ROCm_Optimization_Cheatsheet.md`
