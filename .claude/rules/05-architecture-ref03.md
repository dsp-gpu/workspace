# 05 — Единая архитектура GPU-операций (Ref03)

> Все модули DSP-GPU строятся по единой **6-слойной модели**.
> **Полное описание** → `@MemoryBank/.claude/specs/Ref03_Unified_Architecture.md`

## Слои (коротко)

| # | Класс | Назначение |
|---|-------|-----------|
| 1 | `GpuContext` | Per-module: backend, stream, compiled module, shared buffers |
| 2 | `IGpuOperation` | Интерфейс: `Name()`, `Initialize()`, `IsReady()`, `Release()` |
| 3 | `GpuKernelOp` | Базовый: доступ к compiled kernels через `GpuContext` |
| 4 | `BufferSet<N>` | Compile-time буферный массив (enum-индексы, trivial move) |
| 5 | Concrete Ops | Маленькие классы в `operations/`: `MeanReductionOp`, `MedianHistogramOp`, ... |
| 6 | Facade + Strategy | Тонкий фасад (`StatisticsProcessor`) + авто-выбор (`MedianStrategy`) |

## Ключевые правила

- **Один класс — один файл** (Op → `operations/`, Step → `steps/`).
- `BufferSet<N>` вместо raw `void*` — enum-индексы, compile-time size.
- `GpuContext` per-module → thread-safe, параллельные streams.
- **Facade API не меняется** → Python bindings не ломаются.
- **Strategies**: `IPipelineStep` + `PipelineBuilder` для гибких pipeline'ов.

## Структура модуля

```
{repo}/
├── include/dsp/{repo}/
│   ├── {repo}_processor.hpp   # Layer 6 — Facade
│   ├── gpu_context.hpp         # Layer 1
│   ├── i_gpu_operation.hpp     # Layer 2
│   ├── operations/             # Layer 5
│   │   └── *.hpp
│   └── strategies/             # Layer 6
├── src/
│   └── operations/*.cpp
├── kernels/rocm/*.hip          # HIP-ядра (не inline!)
├── tests/                      # C++ тесты (см. 15-cpp-testing.md)
│   ├── all_test.hpp
│   └── test_*.hpp
└── python/
    └── dsp_{repo}_module.cpp   # pybind11
```

## Вызов тестов из main

Главный `main` **не вызывает тесты напрямую** — только через `all_test.hpp` каждого модуля.

```
src/main.cpp
  → core/tests/all_test.hpp
  → spectrum/tests/all_test.hpp
  → stats/tests/all_test.hpp
  → ...
```

## Ссылки

- Детальное описание → `@MemoryBank/.claude/specs/Ref03_Unified_Architecture.md`
- C4-диаграммы → `@MemoryBank/.architecture/DSP-GPU_Design_C4_Full.md`
- Анализ → `@MemoryBank/.architecture/DSP-GPU_Architecture_Analysis.md`
