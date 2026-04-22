# DSP-GPU — Архитектурный анализ проекта

> **Версия**: 2.0.0 | **Дата анализа**: 2026-04-22
> **Организация**: `github.com/dsp-gpu`
> **Инструмент**: Claude Code (Explore agent) + repomix
> **Ветка**: `main` (Linux / AMD GPU / ROCm 7.2+ / HIP)
> **Предшественник**: GPUWorkLib (монолит) → разбит на 10 независимых репозиториев

---

## 1. Общая статистика

### 1.1 По типам файлов (актуально 2026-04-22)

| Тип файла | Кол-во |
|-----------|--------|
| Заголовки (*.hpp) | 418 |
| Исходники (*.cpp) | 90 |
| HIP kernels (*.hip) | 10 |
| Python (*.py) | 118 |
| CMake (CMakeLists.txt, *.cmake, CMakePresets.json) | ~80 |

> Ветка `main` — только HIP/ROCm.

### 1.2 По репозиториям

| Репо | hpp | cpp | hip | py | Назначение |
|------|-----|-----|-----|-----|-----------|
| `core` | 133 | 36 | 0 | — | DrvGPU: backend, memory, profiler, logger |
| `spectrum` | 105 | 13 | 4 | 1 | FFT + filters + LCH Farrow |
| `stats` | 26 | 3 | 1 | — | Statistics + SNR estimator |
| `signal_generators` | 39 | 12 | 2 | — | CW/LFM/Noise/Script/FormSignal |
| `heterodyne` | 14 | 4 | 0 | — | LFM Dechirp, NCO, Mix |
| `linalg` | 31 | 7 | 0 | 1 | vector_algebra + capon (rocBLAS + rocSOLVER) |
| `radar` | 25 | 5 | 3 | 1 | range_angle + fm_correlator |
| `strategies` | 40 | 4 | 0 | 1 | Pipeline композиция (v1, v2...) |
| `DSP` | 5 | 6 | 0 | 114 | Мета-репо + Python API + Doc |
| **ИТОГО** | **418** | **90** | **10** | **118** | |

---

## 2. Репо-архитектура (git-организация)

DSP-GPU = **10 git-репозиториев** в организации `github.com/dsp-gpu/*`:

```
github.com/dsp-gpu/
├── workspace         ← корень: CLAUDE.md, MemoryBank, .vscode, ~!Doc
├── core              ← DrvGPU ядро (единственный базовый — все от него зависят)
├── spectrum          ← FFT + фильтры + LCH Farrow
├── stats             ← статистика + SNR (расчет отглшения сигнал/шум)
├── signal_generators ← генераторы сигналов
├── heterodyne        ← гетеродин (Dechirp/NCO/Mix)
├── linalg            ← вектор-алгебра + Capon
├── radar             ← range_angle + fm_correlator
├── strategies        ← pipeline композиции
└── DSP               ← мета-репо + Python API (gpuworklib.py)
```

**Workspace (`workspace`)** — не содержит C++ кода. Включает:
- `CLAUDE.md` — конфигурация ассистента
- `MemoryBank/` — управляющие данные (specs, tasks, changelog, архитектура, агенты, инструкуции для них)
- `.vscode/` — VSCode multi-folder workspace + MCP
- `.claude/` — настройки Claude Code
- `~!Doc/` — документация (CMake-GIT, архитектура, примеры)

---

## 3. Слоистая архитектура

```
┌─────────────────────────────────────────────────────────┐
│   Python API (DSP/Python/ + dsp_*_module.cpp)           │  10 классов → 8 модулей
├─────────────────────────────────────────────────────────┤
│   Repo Processors (Facade)                              │  FFTProcessorROCm, ...
├─────────────────────────────────────────────────────────┤
│   Operation Classes (GpuKernelOp)                       │  PadDataOp, MagPhaseOp, ...
├─────────────────────────────────────────────────────────┤
│   Profiling v2 (ProfilingFacade, BatchRecord)           │  core/services/profiling/
├─────────────────────────────────────────────────────────┤
│   Kernel Bindings & Services                            │  KernelCacheService, ServiceMgr
├─────────────────────────────────────────────────────────┤
│   DrvGPU Core Infrastructure (репо core)                │  GpuContext, MemoryManager
├─────────────────────────────────────────────────────────┤
│   Backend Implementations                                │  ROCmBackend (main), HybridBackend
├─────────────────────────────────────────────────────────┤
│   GPU APIs                                              │  HIP/ROCm 7.2+
└─────────────────────────────────────────────────────────┘
```

---

## 4. Репозитории — сводная таблица (детали)

| Репо | Основные классы | Namespace | Зависит от |
|------|-----------------|-----------|-----------|
| `core` | DrvGPU, ROCmBackend, MemoryManager, GPUProfiler, ProfilingFacade, GpuBenchmarkBase, ScopedHipEvent | `drv_gpu_lib`, `drv_gpu_lib::profiling` | hip |
| `spectrum` | FFTProcessorROCm, ComplexToMagPhaseROCm, FirFilterROCm, IirFilterROCm, KalmanFilterROCm, MovingAverageFilterROCm, LchFarrow, SpectrumMaximaFinder | `fft_processor`, `filters`, `lch_farrow`, `antenna_fft`, `spectrum_utils` | core + hipFFT |
| `stats` | StatisticsProcessor, WelfordOnline, RadixSortGPU, SNREstimator | `statistics`, `gpu_sort`, `snr_defaults` | core + spectrum + rocprim |
| `signal_generators` | SignalGenerator, LfmGenerator, CwGenerator, NoiseGenerator, ScriptGenerator, FormSignalGenerator, DelayedFormSignalGenerator | `signal_gen` | core + spectrum |
| `heterodyne` | HeterodyneDechirp, NCO, Mix | `heterodyne` | core + spectrum + signal_generators |
| `linalg` | VectorAlgebra, CaponProcessor, CholeskyInverter | `vector_algebra`, `capon` | core + rocBLAS + rocSOLVER |
| `radar` | RangeAngleProcessor, FMCorrelator | `range_angle`, `fm_correlator` | core + spectrum + stats |
| `strategies` | Pipeline, PipelineBuilder, IPipelineStep | `strategies` | все выше |
| `DSP` | `gpuworklib.py` (fасад Python API) | — | все |

---

## 5. DrvGPU Core (репо `core`) — ядро библиотеки

### 5.1 IBackend Interface

```cpp
namespace drv_gpu_lib {

class IBackend {
  // Lifecycle
  void Initialize(int device_index);
  void Cleanup();
  void SetOwnsResources(bool owns);

  // Device Info
  BackendType GetType() const;           // ROCm, Hybrid (main); OpenCL — только nvidia ветка
  GPUDeviceInfo GetDeviceInfo() const;
  std::string GetDeviceName() const;

  // Native Handles
  void* GetNativeContext() const;        // hipCtx_t (main)
  void* GetNativeDevice() const;         // hipDevice_t
  void* GetNativeQueue() const;          // hipStream_t

  // Memory
  void* Allocate(size_t bytes, unsigned flags);
  void* AllocateManaged(size_t bytes);   // hipMallocManaged
  void Free(void* ptr);
  void MemcpyHostToDevice(void* dst, const void* src, size_t bytes);
  void MemcpyDeviceToHost(void* dst, const void* src, size_t bytes);
  void MemcpyDeviceToDevice(void* dst, const void* src, size_t bytes);

  // Sync
  void Synchronize();
  void Flush();

  // Capabilities
  bool SupportsSVM() const;
  bool SupportsDoublePrecision() const;
  size_t GetMaxWorkGroupSize() const;
  size_t GetGlobalMemorySize() const;
  size_t GetLocalMemorySize() const;
};

}
```

### 5.2 Backends

| Backend | Расположение | Описание | FFT | BLAS |
|---------|--------------|----------|-----|------|
| `ROCmBackend` | `core/backends/rocm/` | AMD ROCm/HIP (main) | hipFFT | rocBLAS + rocSOLVER |
| `HybridBackend` | `core/backends/hybrid/` | Композиция бэкендов | hipFFT | rocBLAS |
| `ZeroCopyBridge` | `core/backends/rocm/zero_copy_bridge.hpp` | HSA interop, zero-copy | — | — |

### 5.3 Services (`core/include/core/services/`)

| Сервис | Файл | Назначение |
|--------|------|-----------|
| `GPUProfiler` | `gpu_profiler.hpp` | Профилирование GPU (legacy v1) |
| `ProfilingFacade` | `profiling/profiling_facade.hpp` | **Profiler v2** — `BatchRecord()` (меньше contention) |
| `ProfileStore` | `profiling/profile_store.hpp` | Хранилище измерений |
| `ReportPrinter` | `profiling/report_printer.hpp` | Консольный вывод отчётов |
| `JSONExporter` / `MarkdownExporter` | `profiling/` | Экспорт результатов |
| `GpuBenchmarkBase` | `gpu_benchmark_base.hpp` | Базовый класс бенчмарков |
| `GpuKernelOp` | `gpu_kernel_op.hpp` | Базовый класс GPU-операций |
| `KernelCacheService` | `kernel_cache_service.hpp` | Кеш скомпилированных kernels |
| `ServiceManager` | `service_manager.hpp` | Реестр сервисов (Service Locator) |
| `BatchManager` | `batch_manager.hpp` | Пакетная обработка |
| `AsyncServiceBase` | `async_service_base.hpp` | Async task queue |
| `BufferSet` | `buffer_set.hpp` | Управление наборами буферов |
| `ConsoleOutput` | `console_output.hpp` | Multi-GPU safe консоль |
| `FilterConfigService` | `filter_config_service.hpp` | Конфигурации фильтров |
| `CacheDirResolver` | `cache_dir_resolver.hpp` | Путь к кешу kernel'ов |
| `ScopedHipEvent` | `scoped_hip_event.hpp` | **RAII для hipEvent_t (обязателен!)** |

### 5.4 Memory / Common / Storage

```
core/include/core/
├── memory/           ← MemoryManager, HIPBuffer, SVMBuffer, StreamPool
├── common/           ← ScopedHipEvent (RAII), общие утилиты
├── config/           ← GPUConfig (configGPU.json)
├── interface/        ← IBackend, IGpuContext
├── logger/           ← plog per-GPU
└── services/storage/ ← персистентное хранилище
```

---

## 6. Граф зависимостей между репо

```
                           ┌──────────┐
                           │  core    │ ← все репо зависят
                           │ (DrvGPU) │
                           └─────┬────┘
              ┌──────────────────┼──────────────────────────┐
              │                  │                          │
        ┌─────┴──────┐    ┌─────┴──────┐    ┌──────────────┴──────────┐
        │ spectrum   │    │   stats    │    │       linalg             │
        │ (hipFFT +  │    │ (Welford + │    │ (rocBLAS + rocSOLVER)    │
        │  filters + │    │  rocprim + │    │ vector_algebra + capon   │
        │  lch_farrow)│    │  SNR)      │    └──────────┬──────────────┘
        └─────┬──────┘    └─────┬──────┘               │
              │                 │                       │
              │                 │                       │
      ┌───────┼────────┐        │                       │
      │       │        │        │                       │
      ▼       ▼        ▼        ▼                       ▼
┌──────────┐ ┌──────────────┐ ┌──────────────┐
│ signal_  │ │  heterodyne  │ │    radar     │    (+ использует stats)
│generators│ │ (Dechirp+NCO)│ │(range_angle+ │
└────┬─────┘ └──────┬───────┘ │ fm_correlator│
     │              │          └───────┬──────┘
     └──────────────┴──────────────────┘
                    │
                    ▼
              ┌─────────────┐
              │ strategies  │ ← композирует все выше
              │  (Pipeline) │
              └─────┬───────┘
                    │
                    ▼
              ┌──────────────┐
              │     DSP      │ ← Python API (gpuworklib.py)
              │ (мета-репо)  │
              └──────────────┘
```

**Циклические зависимости**: НЕ ОБНАРУЖЕНЫ ✅ (чистый DAG)

---

## 7. Kernel Inventory (HIP/ROCm — 10 файлов)

| Репо | Файл | Расположение |
|------|------|--------------|
| **spectrum** | `fft_processor_kernels.hip` | `spectrum/kernels/rocm/` |
| | `c2mp_kernels.hip` | `spectrum/kernels/rocm/` |
| **stats** | `statistics_sort_gpu.hip` | `stats/src/statistics/src/` |
| **signal_generators** | `form_signal.hip` | `signal_generators/kernels/rocm/` |
| **radar** | `dechirp_window_kernel.hip` | `radar/src/range_angle/src/` |
| | `fftshift2d_kernel.hip` | `radar/src/range_angle/src/` |
| | `transpose_kernel.hip` | `radar/src/range_angle/src/` |

> 💡 OpenCL ядра (*.cl) остаются в ветке `nvidia` (Windows). В ветке `main` — только HIP.

---

## 8. Python Bindings (pybind11)

### 8.1 Репо-нативные модули

Каждый C++-репо содержит свой pybind11-модуль:

| Репо | Python модуль | Файл | py::class_ |
|------|---------------|------|------------|
| `core` | `dsp_core` | `core/python/dsp_core_module.cpp` | 3 |
| `spectrum` | `dsp_spectrum` | `spectrum/python/dsp_spectrum_module.cpp` | 1 |
| `stats` | `dsp_stats` | `stats/python/dsp_stats_module.cpp` | 1 |
| `signal_generators` | `dsp_signal_generators` | `signal_generators/python/dsp_signal_generators_module.cpp` | 1 |
| `heterodyne` | `dsp_heterodyne` | `heterodyne/python/dsp_heterodyne_module.cpp` | 1 |
| `linalg` | `dsp_linalg` | `linalg/python/dsp_linalg_module.cpp` | 1 |
| `radar` | `dsp_radar` | `radar/python/dsp_radar_module.cpp` | 1 |
| `strategies` | `dsp_strategies` | `strategies/python/dsp_strategies_module.cpp` | 1 |

### 8.2 Фасад (репо `DSP`)

Единый Python API — `DSP/Python/gpuworklib.py`. Агрегирует все `dsp_*` модули под одним именем для совместимости с приложениями-потребителями.

```
DSP/Python/
├── gpuworklib.py          ← фасад (backward compat)
├── common/                ← общие утилиты
├── spectrum/              ← тесты/примеры spectrum
├── stats/                 ← тесты/примеры stats
├── signal_generators/     ← ...
├── heterodyne/
├── linalg/
├── radar/
├── strategies/
├── integration/           ← интеграционные тесты
└── lib/                   ← shared Python utilities
```

---

## 9. Паттерны проектирования

| Паттерн | Где используется |
|---------|-----------------|
| **Bridge** | `IBackend` → ROCm / Hybrid |
| **Factory** | `SpectrumProcessorFactory`, `SignalGeneratorFactory` |
| **Strategy** | `IPipelineStep`, `IPostFftScenario`, `IMatrixRegularizer` |
| **Pipeline** | `Pipeline` + `PipelineBuilder` (репо `strategies`) |
| **Builder** | `PipelineBuilder` |
| **Template Method** | `GpuBenchmarkBase`, `AsyncServiceBase` |
| **Service Locator** | `ServiceManager`, `ModuleRegistry` |
| **Facade** | `DrvGPU`, `CaponProcessor`, `HeterodyneDechirp`, `gpuworklib.py` |
| **Operation** | `GpuKernelOp` → все `*Op` классы |
| **RAII** | `ScopedHipEvent` (обязателен для hipEvent_t!) |

---

## 10. Сборка (CMake 3.24+)

### 10.1 Порядок сборки репо

```
1.  core              (обязательный, все от него зависят)
2.  spectrum          (core + hipFFT)
3.  stats             (core + spectrum + rocprim)
4.  signal_generators (core + spectrum)
5.  heterodyne        (core + spectrum + signal_generators)
6.  linalg            (core + rocBLAS + rocSOLVER)
7.  radar             (core + spectrum + stats)
8.  strategies        (все выше)
9.  DSP               (Python API, фасад над всеми)
```

### 10.2 Стек технологий

| Компонент | Технология |
|-----------|-----------|
| Язык | C++17 |
| Сборка | CMake 3.24+ (FIND_PACKAGE_ARGS для каскада FetchContent) |
| GPU API | **HIP/ROCm 7.2+** (main); OpenCL 3.0 (ветка nvidia) |
| Линейная алгебра | rocBLAS, rocSOLVER |
| FFT | **rocFFT / hipFFT** (main); clFFT (ветка nvidia) |
| Sort/Reduce | rocprim |
| Python | pybind11 |
| Профилирование | `ProfilingFacade` v2 (custom async, BatchRecord) |
| Логирование | plog (per-GPU) |

### 10.3 Git-стратегия зависимостей

`FetchContent` с `FIND_PACKAGE_ARGS` (CMake 3.24+): каждый репо объявляет зависимости,
верхний проект (LocalProject) — только нужные. Подробности — в `DSP-GPU/MemoryBank/.architecture/CMake-GIT/`.

---

## 11. Ключевые характеристики

1. **Репо-first**: 10 независимых git-репо в `github.com/dsp-gpu` (вместо монолита)
2. **ROCm-Only в main**: kernels оптимизированы под AMD RDNA3/RDNA4 (gfx1100/gfx1201)
3. **Независимые namespace**: `fft_processor`, `filters`, `statistics`, … (не `drv_gpu_lib` кроме core)
4. **Profiler v2**: `ProfilingFacade::BatchRecord()` — одно сообщение в queue вместо N (меньше contention)
5. **RAII обязателен**: `ScopedHipEvent` для всех `hipEvent_t` (закрыто ~38 утечек 15.04)
6. **Pipeline**: `strategies` композирует FFT + statistics + kernels + линалгебру
7. **Python API**: каждый репо → свой `dsp_*` модуль + фасад `gpuworklib.py` в репо `DSP`
8. **Zero-Copy**: `ZeroCopyBridge`, SVM буферы, HSA interop
9. **Kernel Caching**: `KernelCacheService` (compile-once)
10. **Batch Processing**: `BatchManager` для throughput
11. **Независимая версионность**: каждый репо имеет свой semver (`v1.x.y`)
12. **Нет циклических зависимостей** — чистый DAG

---

## 12. Параллельных веток нет - одна главная

| Ветка | Платформа | Сборка | FFT | BLAS |
|-------|-----------|--------|-----|------|
| **main** | Linux / AMD | Debian-Radeon9070 | ROCm/hipFFT | rocBLAS/rocSOLVER |

---

*Обновлено: 2026-04-22 | Version: 2.0.0 | Маппинг: GPUWorkLib монолит → DSP-GPU 10 репо*
*Changes from v1.1.0 (GPUWorkLib): "модули" → "репозитории"; удалён OpenCL (перенесён в ветку `nvidia`); добавлен `ProfilingFacade` v2 и `ScopedHipEvent`; обновлены пути (`DrvGPU/…` → `core/…`); маппинг legacy-модулей → новые репо.*
