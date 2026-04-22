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
