# DSP-GPU — Архитектурный анализ проекта

> **Версия**: 2.1.0 | **Создан**: 2026-04-22 · **Обновлён**: 2026-04-30 (Python migration in progress)
> **Организация**: `github.com/dsp-gpu`
> **Инструмент**: Claude Code (Explore agent) + repomix + Grep
> **Ветка**: `main` (Linux / AMD GPU / ROCm 7.2+ / HIP)
> **Предшественник**: GPUWorkLib (монолит) → разбит на 10 независимых репозиториев

---

## 1. Общая статистика

### 1.1 По типам файлов (актуально 2026-04-30)

| Тип файла | Кол-во |
|-----------|--------|
| Заголовки (*.hpp) | 388 |
| Исходники (*.cpp) | 95 |
| HIP kernels (*.hip) | 10 |
| Python (*.py) | 123 |
| CMake (CMakeLists.txt, *.cmake, CMakePresets.json) | ~80 |

> Ветка `main` — только HIP/ROCm. Windows/OpenCL не поддерживается (даже в отдельной ветке — после переноса наследия из GPUWorkLib).
> Δ vs 2026-04-22: hpp -30 (cleanup в core/spectrum после Profiler v2 RemoveLegacy + KernelCache v2), cpp +5, py +5 (миграция/factories).

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
| `DSP` | 5 | 6 | 0 | 115 | Мета-репо + Python API + Doc + 51 `t_*.py` тестов |
| **ИТОГО** | **388** | **95** | **10** | **123** | |

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
- `MemoryBank/` — управляющие данные (specs, tasks, changelog, архитектура, агенты, инструкции)
- `.vscode/` — VSCode multi-folder workspace + MCP + extensions.json (Continue)
- `.claude/` — настройки Claude Code (rules, agents, hooks)
- `.continue/rules/` — правила для Continue/Qwen (parallel to .claude/rules/)

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
| `DSP` | 8 `dsp_*` модулей (auto-deploy в `libs/`) + `t_*.py` тесты + `gpuworklib.py` shim ⚠ DEPRECATED | — | все |

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
| `ProfilingFacade` | `profiling/profiling_facade.hpp` | **Profiler v2** — `BatchRecord()` (единственная точка профилирования; `GPUProfiler` legacy v1 удалён 2026-04-27) |
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

### 8.2 Структура `DSP/Python/`

```
DSP/Python/
├── libs/                  ← .so из 8 pybind модулей (auto-deploy в Phase B на Debian)
│   └── .gitkeep           ← пустая папка попадает в git
├── gpuworklib.py          ⚠ DEPRECATED — backward-compat shim, удаляется в Phase A5
├── common/                ← инфраструктура тестов
│   ├── runner.py          ← TestRunner + SkipTest (правило 04)
│   ├── base.py            ← TestBase (Template Method) — был test_base.py
│   ├── gpu_loader.py      ← GPULoader (Singleton, ищет dsp_* в libs/ или build/python/)
│   ├── result.py, configs.py, validators/, references/, io/, plotting/
│   └── {io,plotting,validators,references}/t_smoke.py ← smoke-тесты common-инфраструктуры
├── {module}/              ← {heterodyne, integration, linalg, radar, signal_generators, spectrum, stats, strategies}
│   ├── factories.py       ← factory functions (был conftest.py — pytest-магическое имя)
│   ├── {module}_base.py   ← специализация TestBase (был {module}_test_base.py)
│   ├── data/              ← test fixtures (json/csv/npy) — например spectrum/data/lagrange_matrix_48x5.json
│   └── t_*.py             ← Python тесты (TestRunner-style, top-level def test_*)
└── integration/           ← e2e пайплайны через несколько модулей
```

**Ключевые паттерны:**
- Файлы `t_*.py` (не `test_*.py`) — имя НЕ триггерит PyCharm pytest autodetect
- Загрузка модулей: `GPULoader.setup_path()` добавляет `libs/` в `sys.path`, потом `import dsp_<module> as <alias>`
- `class TestX:` НЕ обязателен — top-level `def test_*()` сохранён (как в legacy)
- Правило 04: `pytest` запрещён навсегда; используется `common.runner.TestRunner`

**Sub-репо тесты** (`{repo}/python/t_*.py`, 4 файла) — standalone smoke в каждом репо `linalg`/`radar`/`spectrum`/`strategies`. Импортят `common.runner` через путь `../../DSP/Python/`.

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

## 12. Параллельных веток нет — одна главная

| Ветка | Платформа | Сборка | FFT | BLAS |
|-------|-----------|--------|-----|------|
| **main** | Linux / AMD | Debian-Radeon9070 | ROCm/hipFFT | rocBLAS/rocSOLVER |

---

## 13. Python tests migration (in progress, 2026-04-29 / 2026-04-30)

### 13.1 Что уже сделано

| Действие | Статус | Когда |
|----------|--------|-------|
| Удаление worktrees (`E:/DSP-GPU/.claude/worktrees/`, ~739 MB legacy pytest-кода) | ✅ done | 2026-04-29 |
| Переименование `test_*.py` → `t_*.py` (PyCharm autodetect fix) | ✅ done (54 файла) | 2026-04-29 |
| Переименование `*_test_base.py` → `*_base.py` (5 framework-классов) | ✅ done | 2026-04-29 |
| Переименование `conftest.py` → `factories.py` (7 файлов) | ✅ done | 2026-04-29 |
| Миграция 3 spectrum-тестов на `dsp_*` API (эталоны) | ✅ done | 2026-04-29 |
| Phase A0 Preflight: `lib/` → `libs/`, `.gitkeep`, `gpu_loader.py` обновлён | ✅ done | 2026-04-30 |
| Phase A1 Inventory API (8 pybind binding) | ✅ done | 2026-04-30 |
| `GPUProfiler` legacy v1 удалён | ✅ done | 2026-04-27 |

### 13.2 Что осталось

| Фаза | Описание | Платформа | Время |
|------|----------|-----------|-------|
| Phase A2 | Миграция 51 `t_*.py` (8 групп: stats, signal_generators, spectrum, linalg, radar, heterodyne, strategies/integration/common, sub-репо) | Windows | ~6-8 ч |
| Phase A3 | Verify (grep `gpuworklib`/`sys.exit` → 0) | Windows | ~30 мин |
| Phase A4 | Commit (без push) | Windows | ~30 мин |
| Phase A5 | Cleanup: удалить `gpuworklib.py` shim + выпилить `_load_gpuworklib()` из `gpu_loader.py` + общий push 6 репо | Windows | ~20 мин |
| Phase B1-B2 | CMake `auto-deploy` блок в 8 `{repo}/python/CMakeLists.txt` (PRE_BUILD remove + POST_BUILD copy в `DSP/Python/libs/`) | Debian | ~30 мин |
| Phase B3 | Реальный запуск 51 `t_*.py` на ROCm gfx1201 + tolerances/API fixes | Debian | ~1-3 ч |

### 13.3 Известные API breaking changes (legacy → DSP-GPU)

| Legacy `gpuworklib.X` | DSP-GPU | Статус |
|----------------------|---------|--------|
| `ROCmGPUContext` | `dsp_core.ROCmGPUContext` | ✅ rename only |
| `LchFarrowROCm` (`set_sample_rate`/`set_delays`/`process`) | `dsp_spectrum.LchFarrowROCm` | ✅ полное совпадение API |
| `LfmAnalyticalDelayROCm` | `dsp_signal_generators.LfmAnalyticalDelayROCm` | ✅ совпадение |
| **`HeterodyneDechirp.process(rx)`** → `dict {success, antennas[].f_beat_hz}` | **`HeterodyneROCm.dechirp/correct`** + ручной `np.fft + argmax` | ⚠ API rewrite (4 теста) |
| `SignalGenerator.generate_lfm()` (legacy общий) | NumPy fallback `np.exp(1j * phase)` или `LfmAnalyticalDelayROCm` | ⚠ убран (использовать NumPy) |
| `ScriptGenerator` (runtime DSL → kernel) | ❌ не портирован | SkipTest + `MemoryBank/.future/TASK_script_dsl_rocm.md` |

### 13.4 Документы

- План: [`MemoryBank/specs/python/migration_plan_2026-04-29.md`](../specs/python/migration_plan_2026-04-29.md)
- Аудит pytest: [`MemoryBank/specs/python/pytest_audit_2026-04-29.md`](../specs/python/pytest_audit_2026-04-29.md)
- Ревью плана: [`MemoryBank/specs/python/migration_plan_review_2026-04-30.md`](../specs/python/migration_plan_review_2026-04-30.md)
- Sub-репо diff: [`MemoryBank/specs/python/sub_repo_tests_diff_2026-04-30.md`](../specs/python/sub_repo_tests_diff_2026-04-30.md)
- Tasks: [`TASK_python_migration_phase_A_2026-04-30.md`](../tasks/TASK_python_migration_phase_A_2026-04-30.md), [`TASK_python_migration_phase_B_debian_2026-05-03.md`](../tasks/TASK_python_migration_phase_B_debian_2026-05-03.md)

---

## 📜 Changelog

| Версия | Дата | Изменение |
|--------|------|-----------|
| 1.1.0 | (legacy) | GPUWorkLib монолит — анализ модулей |
| 2.0.0 | 2026-04-22 | "модули" → "репозитории" (10 репо `github.com/dsp-gpu/`); удалён OpenCL (перенесён в ветку `nvidia`); добавлен `ProfilingFacade` v2 и `ScopedHipEvent`; обновлены пути (`DrvGPU/…` → `core/…`); маппинг legacy-модулей → новые репо |
| 2.1.0 | 2026-04-30 | `GPUProfiler` legacy v1 удалён (2026-04-27); `lib/` → `libs/`; Python tests миграция в процессе (54 переименований + 3 spectrum мигрированы как эталон + 51 осталось); `gpuworklib.py` shim deprecated; ветка `nvidia` упразднена (полностью ROCm-only); статистика обновлена (388 hpp / 95 cpp / 123 py); добавлен раздел 13 «Python tests migration» |
