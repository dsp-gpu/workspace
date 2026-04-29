# 02 — Архитектура (Ref03, единая для всех модулей)

## 6-слойная модель

| # | Класс | Назначение |
|---|-------|-----------|
| 1 | `GpuContext` | Per-module: backend, stream, compiled module, shared buffers |
| 2 | `IGpuOperation` | Интерфейс: `Name()`, `Initialize()`, `IsReady()`, `Release()` |
| 3 | `GpuKernelOp` | Базовый: доступ к compiled kernels через `GpuContext` |
| 4 | `BufferSet<N>` | Compile-time массив (enum-индексы, trivial move) |
| 5 | Concrete Ops | Маленькие классы в `operations/`: `MeanReductionOp`, `MedianHistogramOp`, ... |
| 6 | Facade + Strategy | Тонкий фасад (`StatisticsProcessor`) + авто-выбор (`MedianStrategy`) |

## Структура одного репо

```
{repo}/
├── CMakeLists.txt
├── README.md
├── CLAUDE.md                   ← короткий, специфика репо
├── include/dsp/{repo}/         ← public headers (namespace dsp::{repo})
│   ├── {repo}_processor.hpp   # Layer 6 — Facade
│   ├── gpu_context.hpp         # Layer 1
│   ├── i_gpu_operation.hpp     # Layer 2
│   ├── operations/*.hpp        # Layer 5
│   └── strategies/             # Layer 6
├── src/operations/*.cpp
├── kernels/rocm/*.hip          ← HIP-ядра (PRIVATE, не inline в .hpp!)
├── tests/                      ← C++ (header-only .hpp + all_test.hpp)
└── python/dsp_{repo}_module.cpp  ← pybind11
```

## Namespace

```cpp
namespace dsp {
    namespace spectrum { ... }
    namespace stats { ... }
    namespace signal_generators { ... }
    namespace heterodyne { ... }
    namespace linalg { ... }
    namespace radar { ... }
    namespace strategies { ... }
}
```

Старый `drv_gpu_lib::*` — только в `core/` для инфраструктуры
(`DrvGPU`, `Logger`, `ConsoleOutput`, `ProfilingFacade`).

## Граф зависимостей

```
core ←── spectrum, stats, signal_generators, heterodyne, linalg
                 ↓
             strategies
                 ↓
               radar ──→ DSP (примеры, доки, Python)
```

- **core** — единственное, от чего зависят все
- **radar** собирает всё вместе
- **DSP** — мета-репо (примеры, доки, Python-биндинги)

## Internal / External GPU контекст

- **Internal**: `DrvGPU::Create(gpu_id)` — сам создаёт hip stream (**owns**)
- **External**: `DrvGPU::CreateFromExternalStream(gpu_id, stream)` — интеграция с чужим кодом (**не owns** — не разрушать)
- Паттерн: `owns_resources_ = false` → backend не уничтожает чужие хэндлы

## Профилирование hipEvent_t (RAII обязателен)

```cpp
// ✅ правильно
ScopedHipEvent start, stop;
hipEventRecord(start.get(), stream);
my_kernel<<<grid, block, 0, stream>>>(args...);
hipEventRecord(stop.get(), stream);
ROCmProfilingData data{.start_event=start.get(), .stop_event=stop.get()};

// ❌ запрещено — голый hipEventCreate без RAII
hipEvent_t e;
hipEventCreate(&e);   // утечка при exception
```

## Тесты — вызов из main (не напрямую)

Главный `main` НЕ вызывает тесты напрямую — только через `all_test.hpp` каждого модуля:

```
src/main.cpp
  → core/tests/all_test.hpp
  → spectrum/tests/all_test.hpp
  → stats/tests/all_test.hpp
  → ...
```
