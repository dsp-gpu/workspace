# 10 — Модули DSP-GPU (10 репозиториев)

> DSP-GPU разбит на **10 независимых git-репозиториев** под org `github.com/dsp-gpu/`.
> Каждый собирается отдельно, cross-repo через CMake `find_package` / FetchContent.

## Список репозиториев

| # | Репо | Назначение | Ключевые классы |
|---|------|-----------|-----------------|
| 1 | **workspace** | Мета: общие CMake-пресеты, docker, workspace-корень | — |
| 2 | **core** | DrvGPU: backend, context, ProfilingFacade, ConsoleOutput, Logger | `DrvGPU`, `ROCmBackend`, `ProfilingFacade`, `ConsoleOutput`, `Logger` |
| 3 | **spectrum** | FFT / IFFT, оконные функции, поиск максимума, фильтры, lch_farrow | `FFTProcessor`, `SpectrumMaximaFinder`, `FirFilter` |
| 4 | **stats** | Статистика: welford, median, radix sort, histogram, SNR | `StatisticsProcessor`, `SNREstimator` |
| 5 | **signal_generators** | CW, LFM, Noise, Script, FormSignal | `SignalGenerator`, `FormSignalGenerator`, `ScriptGenerator` |
| 6 | **heterodyne** | NCO, MixDown / MixUp, LFM Dechirp | `HeterodyneDechirp` |
| 7 | **linalg** | Matrix ops, SVD, eig, Capon | `MatrixOpsROCm`, `CaponProcessor` |
| 8 | **radar** | Высокоуровневые пайплайны РЛС: range_angle, fm_correlator | `RadarPipeline`, `BeamFormer` |
| 9 | **strategies** | `IPipelineStep` + `PipelineBuilder` + выбор реализаций | `MedianStrategy`, `PipelineBuilder` |
| 10 | **DSP** | Мета-репо: `Python/`, `Doc/`, `Examples/`, `Results/`, `Logs/` | — |

## Каноничные имена

| Каноничное | Не использовать (legacy) |
|-----------|--------------------------|
| **`spectrum`** | ~~`fft_func`~~, ~~`fft_processor`~~ (spectrum — более общее понятие) |
| `stats` | ~~`statistics`~~ |
| `signal_generators` | ~~`signal_gen`~~ |
| `heterodyne` | — |
| `linalg` | ~~`matrix_ops`~~, ~~`capon`~~ |
| `radar` | ~~`range_angle`~~, ~~`fm_correlator`~~ (они внутри) |

## Структура одного репо

```
{repo}/
├── CMakeLists.txt
├── README.md
├── CLAUDE.md                   ← короткий (~40 строк), специфика репо
├── include/dsp/{repo}/         ← public headers (namespace dsp::{repo})
├── src/                        ← impl (*.cpp / *.hip)
├── kernels/rocm/               ← HIP-ядра (PRIVATE)
├── tests/                      ← C++ тесты (*.hpp + all_test.hpp)
├── python/                     ← pybind11 (dsp_{repo}_module.cpp)
└── Doc/                        ← документация модуля
```

## Граф зависимостей

```
workspace (супер-проект)
    ↓
core ←── spectrum, stats, signal_generators, heterodyne, linalg
                 ↓
             strategies
                 ↓
               radar ──→ DSP (примеры, доки, Python)
```

- **core** — единственное, от чего зависят все.
- **radar** собирает всё вместе.
- **DSP** — читает (примеры, доки, Python-биндинги).

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

Старый `drv_gpu_lib::*` остаётся только в `core/` для инфраструктуры
(`DrvGPU`, `Logger`, `ConsoleOutput`, `ProfilingFacade`).

## Статус миграции (legacy → DSP-GPU)

| Модуль | DSP-GPU статус |
|--------|----------------|
| DrvGPU → core | ✅ Код + CMake + Python binding |
| fft+filters+lch_farrow → spectrum | ✅ Код + CMake + Python binding |
| statistics → stats | ✅ Код + CMake + Python binding |
| signal_generators → signal_generators | ✅ Код + CMake + Python binding |
| heterodyne → heterodyne | ✅ Код + CMake + Python binding |
| vector_algebra+capon → linalg | ✅ Код + CMake + Python binding |
| range_angle+fm_correlator → radar | ✅ Код + CMake + Python binding |
| strategies → strategies | ✅ Код + CMake + Python binding |

Текущая фаза → `4: Testing on Debian GPU`.
