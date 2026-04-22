# Механизм профилирования GPU-репозиториев: ROCm/HIP

> **Версия**: 2.0 | **Дата**: 2026-04-22
> **Автор**: Кодо (AI Assistant)
> **Референс-реализация**: `spectrum/tests/fft_processor_benchmark_rocm.hpp`, `spectrum/tests/test_fft_benchmark_rocm.hpp`
> **Платформа**: Linux / AMD GPU / ROCm 7.2+ / HIP (ветка `main`)

---

## Содержание

1. [Принцип работы](#1-принцип-работы)
2. [Архитектура потока](#2-архитектура-потока)
3. [ROCm: шаг за шагом](#3-rocm-шаг-за-шагом)
   - [Шаг 1 — production-класс: добавить ROCmProfEvents](#шаг-1--production-класс-добавить-rocmprofevents)
   - [Шаг 2 — helper функции для timing](#шаг-2--helper-функции-для-timing)
   - [Шаг 3 — benchmark-класс](#шаг-3--benchmark-класс)
   - [Шаг 4 — test runner](#шаг-4--test-runner)
   - [Шаг 5 — all_test.hpp](#шаг-5--all_testhpp)
4. [Структура файлов репо](#4-структура-файлов-репо)
5. [Чеклист добавления профилирования](#5-чеклист-добавления-профилирования)
6. [Частые ошибки](#6-частые-ошибки)
7. [Референс-реализации](#7-референс-реализации)

---

## 1. Принцип работы

**Ключевой принцип**: production-класс репо — **чистый** (ноль кода профилирования).
Весь код профилирования изолирован в тест-файлах (`{repo}/tests/`).

```
Production-класс            Benchmark-класс (тест)
─────────────────           ──────────────────────────────
MyModule::Process()         ExecuteKernel()      → warmup (без timing)
  - делает полезную работу  ExecuteKernelTimed() → BatchRecord() → ProfilingFacade
  - prof_events = nullptr
    → ноль overhead
  - prof_events = &vec      GpuBenchmarkBase::Run()
    → собирает события        1. warmup × n_warmup
                              2. Reset profiler
                              3. measure × n_runs
```

**Профилирование включается в `configGPU.json`** (поле `is_prof: true`).
Если `is_prof: false` — `Run()` и `Report()` — полные no-op, ноль overhead в production.

---

## 2. Архитектура потока

```
main.cpp
  └── all_test.hpp
        └── test_my_module_benchmark_rocm::run()           [test runner]
              ├── ROCmBackend init                          [core/backends/rocm]
              ├── MyModuleROCm proc(&backend)               [production объект]
              └── MyModuleBenchmarkROCm bench(&backend, proc, ...)
                    │
                    ├── bench.Run()
                    │     ├── warmup × n_warmup
                    │     │     └── ExecuteKernel()
                    │     │           └── proc.Process(data)   ← без prof_events
                    │     │
                    │     ├── ProfilingFacade::Reset()
                    │     │
                    │     └── measure × n_runs
                    │           └── ExecuteKernelTimed()
                    │                 ├── proc.Process(data, &events)
                    │                 └── BatchRecord(gpu_id, tag, events)  ← → ProfilingFacade
                    │
                    └── bench.Report()
                          ├── profiler.WaitEmpty()       ← дождаться async очереди
                          ├── profiler.PrintReport()
                          ├── profiler.ExportJSON(...)
                          └── profiler.ExportMarkdown(...)
```

---

## 3. ROCm: шаг за шагом

### Шаг 1 — production-класс: добавить ROCmProfEvents

В заголовке (`{repo}/include/{repo}/my_module_rocm.hpp`) объявить тип и добавить параметр:

```cpp
#include <core/services/profiling/profiling_types.hpp>   // ROCmProfilingData
#include <vector>
#include <utility>

namespace my_module {

// Тип для сбора ROCm событий (имя → данные)
using ROCmProfEvents = std::vector<std::pair<const char*, drv_gpu_lib::ROCmProfilingData>>;

class MyModuleROCm {
public:
  // prof_events = nullptr → production, ноль overhead
  std::vector<Result> Process(const std::vector<float>& data,
                               const Params& params,
                               ROCmProfEvents* prof_events = nullptr);
};

}  // namespace my_module
```

---

### Шаг 2 — helper функции для timing

В реализации (`{repo}/src/my_module_rocm.cpp`) добавить два helper'а:

```cpp
#include <chrono>
#include "hip/hip_runtime.h"
#include <core/common/scoped_hip_event.hpp>   // ScopedHipEvent — RAII

// Helper A: для async GPU операций (hipEvent_t → hipEventElapsedTime)
static drv_gpu_lib::ROCmProfilingData MakeROCmDataFromEvents(
    hipEvent_t ev_start, hipEvent_t ev_end,
    uint32_t kind,           // 0=kernel, 1=copy, 2=barrier
    const char* op_string = "")
{
    hipEventSynchronize(ev_end);
    float elapsed_ms = 0.0f;
    hipEventElapsedTime(&elapsed_ms, ev_start, ev_end);
    // Владельцы hipEvent_t — ScopedHipEvent (RAII), destroy автоматически

    drv_gpu_lib::ROCmProfilingData d{};
    uint64_t elapsed_ns = static_cast<uint64_t>(elapsed_ms * 1e6f);
    d.start_ns    = 0;
    d.end_ns      = elapsed_ns;
    d.complete_ns = elapsed_ns;
    d.kind        = kind;
    d.op_string   = op_string;
    return d;
}

// Helper B: для sync CPU/GPU операций (wall-clock через std::chrono)
static drv_gpu_lib::ROCmProfilingData MakeROCmDataFromClock(
    std::chrono::high_resolution_clock::time_point t_start,
    std::chrono::high_resolution_clock::time_point t_end,
    uint32_t kind,
    const char* op_string = "")
{
    uint64_t elapsed_ns = static_cast<uint64_t>(
        std::chrono::duration_cast<std::chrono::nanoseconds>(t_end - t_start).count());

    drv_gpu_lib::ROCmProfilingData d{};
    d.start_ns    = 0;
    d.end_ns      = elapsed_ns;
    d.complete_ns = elapsed_ns;
    d.kind        = kind;
    d.op_string   = op_string;
    return d;
}
```

> ⚠️ **ScopedHipEvent обязателен!** Голые `hipEventCreate` запрещены (правило проекта).
> Все hipEvent_t оборачиваются в RAII — см. `core/common/scoped_hip_event.hpp`.

**Когда что использовать:**

| Операция | Helper | Причина |
|----------|--------|---------|
| `hipMemcpyHtoD` (async + stream) | `MakeROCmDataFromEvents` | hipEvent захватывает GPU timeline |
| Запуск ядра (`hipLaunchKernelGGL`) | `MakeROCmDataFromEvents` | hipEvent на GPU |
| `hipfftExecC2C` / `rocblas_*` / `rocsolver_*` | `MakeROCmDataFromEvents` | async GPU операции |
| `hipMemcpyDtoH` (sync) | `MakeROCmDataFromClock` | hipEvent для синхронной DtoH ненадёжен |
| любая синхронная операция | `MakeROCmDataFromClock` | wall-clock точен для sync |

---

**Паттерн в теле метода Process():**

```cpp
std::vector<Result> MyModuleROCm::Process(const std::vector<float>& data,
                                           const Params& params,
                                           ROCmProfEvents* prof_events)
{
    // ── Upload (H2D, async) ───────────────────────────────────────────
    drv_gpu_lib::ScopedHipEvent ev_up_start, ev_up_end;
    if (prof_events) {
        ev_up_start.Create();
        ev_up_end.Create();
        hipEventRecord(ev_up_start.get(), stream_);
    }

    hipMemcpyAsync(d_buf_, data.data(), data.size() * sizeof(float),
                   hipMemcpyHostToDevice, stream_);

    if (prof_events) {
        hipEventRecord(ev_up_end.get(), stream_);
    }

    // ── Kernel ────────────────────────────────────────────────────────
    drv_gpu_lib::ScopedHipEvent ev_k_start, ev_k_end;
    if (prof_events) {
        ev_k_start.Create();
        ev_k_end.Create();
        hipEventRecord(ev_k_start.get(), stream_);
    }

    hipLaunchKernelGGL(my_kernel, grid, block, 0, stream_, d_buf_, params.n_samples);

    if (prof_events) {
        hipEventRecord(ev_k_end.get(), stream_);
    }

    // ── Download (D2H, sync) ──────────────────────────────────────────
    auto t_dl_start = std::chrono::high_resolution_clock::now();

    hipMemcpy(result.data(), d_buf_, result.size() * sizeof(float),
              hipMemcpyDeviceToHost);   // ← синхронная!

    auto t_dl_end = std::chrono::high_resolution_clock::now();

    // ── Собрать prof_events ───────────────────────────────────────────
    if (prof_events) {
        prof_events->push_back({"Upload",   MakeROCmDataFromEvents(ev_up_start.get(), ev_up_end.get(), 1, "H2D")});
        prof_events->push_back({"Kernel",   MakeROCmDataFromEvents(ev_k_start.get(),  ev_k_end.get(),  0, "my_kernel")});
        prof_events->push_back({"Download", MakeROCmDataFromClock(t_dl_start,        t_dl_end,        1, "D2H")});
    }

    return result;
}
```

---

### Шаг 3 — benchmark-класс

Создать файл `{repo}/tests/my_module_benchmark_rocm.hpp`:

```cpp
#pragma once

#if ENABLE_ROCM

#include <{repo}/my_module_rocm.hpp>
#include <core/services/gpu_benchmark_base.hpp>
#include <core/services/profiling/profiling_facade.hpp>

#include <vector>

namespace test_my_module_rocm {

class MyModuleBenchmarkROCm : public drv_gpu_lib::GpuBenchmarkBase {
public:
  MyModuleBenchmarkROCm(
      drv_gpu_lib::IBackend* backend,
      my_module::MyModuleROCm& proc,
      const my_module::Params& params,
      const std::vector<float>& input_data,
      GpuBenchmarkBase::Config cfg = {.n_warmup   = 5,
                                      .n_runs     = 20,
                                      .output_dir = "Results/Profiler/GPU_00_MyModule_ROCm"})
    : GpuBenchmarkBase(backend, "MyModuleROCm", cfg),
      proc_(proc),
      params_(params),
      input_data_(input_data) {}

protected:
  void ExecuteKernel() override {
    proc_.Process(input_data_, params_);   // prof_events = nullptr → warmup
  }

  void ExecuteKernelTimed() override {
    my_module::ROCmProfEvents events;
    proc_.Process(input_data_, params_, &events);

    // BatchRecord — одно сообщение в queue вместо N (меньше contention)
    drv_gpu_lib::profiling::ProfilingFacade::GetInstance()
        .BatchRecord(gpu_id_, "{repo}/my_module", events);
  }

private:
  my_module::MyModuleROCm&  proc_;
  my_module::Params         params_;
  std::vector<float>        input_data_;
};

}  // namespace test_my_module_rocm

#endif  // ENABLE_ROCM
```

> 💡 **BatchRecord vs RecordROCmEvent**: `BatchRecord()` передаёт все события одним
> сообщением в async-очередь профайлера — меньше contention под warp-мьютексом.
> Паттерн закреплён в profiler v2 (`ProfilingFacade`).

---

### Шаг 4 — test runner

Создать файл `{repo}/tests/test_my_module_benchmark_rocm.hpp`:

```cpp
#pragma once

#if ENABLE_ROCM

#include "my_module_benchmark_rocm.hpp"
#include <core/backends/rocm/rocm_backend.hpp>
#include <core/backends/rocm/rocm_core.hpp>

#include <iostream>
#include <vector>
#include <stdexcept>

namespace test_my_module_benchmark_rocm {

inline int run() {
  std::cout << "\n";
  std::cout << "============================================================\n";
  std::cout << "  MyModuleROCm Benchmark (GpuBenchmarkBase)\n";
  std::cout << "============================================================\n";

  // Проверка наличия ROCm-устройств
  int device_count = drv_gpu_lib::ROCmCore::GetAvailableDeviceCount();
  std::cout << "  Available ROCm devices: " << device_count << "\n";
  if (device_count == 0) {
    std::cout << "  [SKIP] No ROCm devices found\n";
    return 0;
  }

  try {
    // ── ROCm backend ──────────────────────────────────────────────────
    drv_gpu_lib::ROCmBackend backend;
    backend.Initialize(0);

    // ── Параметры ─────────────────────────────────────────────────────
    my_module::Params params;
    params.n_samples = 1024;
    // ... заполнить параметры ...

    std::vector<float> input_data(params.n_samples, 1.0f);
    // ... заполнить данные ...

    // ── Создать модуль и бенчмарк ─────────────────────────────────────
    my_module::MyModuleROCm proc(&backend);

    test_my_module_rocm::MyModuleBenchmarkROCm bench(
        &backend, proc, params, input_data,
        {.n_warmup   = 5,
         .n_runs     = 20,
         .output_dir = "Results/Profiler/GPU_00_MyModule_ROCm"});

    // ── Запуск ────────────────────────────────────────────────────────
    if (!bench.IsProfEnabled()) {
      std::cout << "  [SKIP] is_prof=false in configGPU.json\n";
    } else {
      bench.Run();     // warmup(5) + measure(20) → ProfilingFacade
      bench.Report();  // PrintReport + ExportJSON + ExportMarkdown
      std::cout << "  [OK] Benchmark complete\n";
    }

    return 0;

  } catch (const std::exception& e) {
    std::cerr << "  FATAL: " << e.what() << "\n";
    return 1;
  }
}

}  // namespace test_my_module_benchmark_rocm

#endif  // ENABLE_ROCM
```

---

### Шаг 5 — all_test.hpp

```cpp
#if ENABLE_ROCM
#include "test_my_module_benchmark_rocm.hpp"
#endif

namespace my_module_all_test {
inline void run() {
    // ...другие тесты...

    // MyModuleROCm Benchmark (hipEvent timing)
#if ENABLE_ROCM
    test_my_module_benchmark_rocm::run();
#endif
}
}
```

---

## 4. Структура файлов репо

> В DSP-GPU каждый репозиторий (`core`, `spectrum`, `stats`, `heterodyne`, `linalg`, `radar`, ...)
> — отдельный git. Единица миграции/тестирования — **репо**, не модуль.

```
{repo}/                                 ← e.g. spectrum/, stats/, heterodyne/
├── CMakeLists.txt
├── CMakePresets.json
├── include/
│   └── {repo}/
│       ├── my_module_rocm.hpp          ← prod ROCm: Process(..., prof_events*)
│       └── kernels/...                 ← device-код (HIP)
├── src/
│   ├── my_module_rocm.cpp              ← impl + MakeROCmDataFromEvents/Clock()
│   └── kernels/...
└── tests/
    ├── CMakeLists.txt
    ├── all_test.hpp                    ← точка входа, вызывается из main
    ├── main.cpp                        ← main → all_test::run()
    ├── my_module_benchmark_rocm.hpp    ← класс (: GpuBenchmarkBase) [ENABLE_ROCM]
    ├── test_my_module_benchmark_rocm.hpp ← test runner              [ENABLE_ROCM]
    └── README.md                       ← описание всех тестов
```

**Инфраструктура профилирования живёт в репо `core`**:

```
core/include/core/
├── backends/rocm/
│   ├── rocm_backend.hpp                ← ROCmBackend — init, stream pool
│   ├── rocm_core.hpp                   ← GetAvailableDeviceCount()
│   └── stream_pool.hpp
├── common/
│   └── scoped_hip_event.hpp            ← RAII для hipEvent_t (ОБЯЗАТЕЛЬНО!)
└── services/
    ├── gpu_benchmark_base.hpp          ← GpuBenchmarkBase — базовый класс
    └── profiling/
        ├── profiling_facade.hpp        ← ProfilingFacade::BatchRecord() [v2]
        ├── profiling_types.hpp         ← ROCmProfilingData
        ├── profile_store.hpp
        ├── report_printer.hpp
        ├── json_exporter.hpp
        └── markdown_exporter.hpp
```

---

## 5. Чеклист добавления профилирования

### Production-класс

- [ ] Добавить `prof_events*` параметр к каждому публичному методу (default = `nullptr`)
- [ ] Обернуть `hipEventCreate/Record` в `ScopedHipEvent` (RAII) — голые `hipEventCreate` запрещены
- [ ] Оборачивать создание event'ов в `if (prof_events)` — при `nullptr` ноль overhead
- [ ] Убедиться: при `prof_events = nullptr` — **ноль дополнительного overhead**

### Benchmark-класс (: GpuBenchmarkBase)

- [ ] Унаследовать от `drv_gpu_lib::GpuBenchmarkBase`
- [ ] Реализовать `ExecuteKernel()` — вызов без prof_events (warmup)
- [ ] Реализовать `ExecuteKernelTimed()` — вызов с prof_events + `ProfilingFacade::BatchRecord(gpu_id_, "{repo}/module", events)`
- [ ] Задать `output_dir = "Results/Profiler/GPU_NN_ModuleName_ROCm"`
- [ ] Wrapped в `#if ENABLE_ROCM` весь файл

### Test runner

- [ ] Проверить `ROCmCore::GetAvailableDeviceCount()` перед запуском
- [ ] Проверить `bench.IsProfEnabled()` перед вызовом `Run()`
- [ ] Wrapped в `#if ENABLE_ROCM`

### configGPU.json

- [ ] Убедиться что `"is_prof": true` для нужного GPU
  ```json
  {
    "gpus": [
      { "gpu_id": 0, "is_prof": true, ... }
    ]
  }
  ```

### CMake

- [ ] Новый benchmark-файл добавлен в `{repo}/tests/CMakeLists.txt` по существующему шаблону
  (⚠️ CMake-структуру **не менять** — только добавлять по образцу)

### Результаты

- [ ] Вывод только через `bench.Report()` → `ProfilingFacade::PrintReport()`
- [ ] **ЗАПРЕЩЕНО**: `GetStats()` + цикл + `con.Print` / `std::cout` напрямую

### Автоматическая проверка

```bash
python scripts/check_profiling.py {repo}       # один репо
python scripts/check_profiling.py --all         # все репо DSP-GPU
```

---

## 6. Частые ошибки

### ❌ `is_prof = false` → бенчмарк — no-op, нет вывода

**Причина A**: `GPUConfig` не загружен (тест обходит стандартный DrvGPU init).
**Причина B**: `backend->GetDeviceIndex()` возвращает `-1` (external context) → `IsProfilingEnabled(-1) = false`.

**Исправление**: `GpuBenchmarkBase` автоматически:
1. Маппит `gpu_id = -1` → `gpu_id = 0`
2. Загружает `configGPU.json` если ещё не загружен

```cpp
// Конструктор GpuBenchmarkBase (уже реализовано):
if (gpu_id_ < 0) gpu_id_ = 0;
if (!GPUConfig::GetInstance().IsLoaded())
    GPUConfig::GetInstance().LoadOrCreate("configGPU.json");
is_prof_ = GPUConfig::GetInstance().IsProfilingEnabled(gpu_id_);
```

---

### ❌ N = 19 вместо 20 в отчёте

**Причина**: `Report()` был вызван до того как последнее сообщение обработала async очередь ProfilingFacade.

**Исправление**: `GpuBenchmarkBase::Report()` вызывает `profiler.WaitEmpty()` перед `PrintReport()` (уже реализовано).

---

### ❌ ИТОГО N = 57 (неправильно), Всего = 2.18 ms (слишком большое)

**Причина**: Старая логика суммировала `total_calls` по всем событиям (`3 events × 20 runs = 60`) и `total_time_ms` (raw sum вместо avg per run).

**Правильные значения**:
- `N` = `ModuleStats::GetRunCount()` — число прогонов одного бенчмарка (= 20)
- `Всего` = `ModuleStats::GetAvgRunTimeMs()` — среднее время одного полного прогона (сумма avg по всем этапам)

---

### ❌ ROCm: hipEventElapsedTime для синхронной hipMemcpyDtoH

**Причина**: `hipMemcpyDeviceToHost` (синхронный) возвращает управление только после завершения — `hipEventRecord` после него не имеет смысла (event сразу в состоянии "complete").

**Решение**: Для синхронных операций использовать `MakeROCmDataFromClock()` (wall-clock).

---

### ❌ Утечка hipEvent_t

**Причина**: Голый `hipEventCreate` без `hipEventDestroy` при early-return / exception.

**Решение**: Только `ScopedHipEvent` (RAII). Проектное правило — голые `hipEventCreate` запрещены (~38 утечек закрыто 15.04).

```cpp
// ❌ ЗАПРЕЩЕНО:
hipEvent_t ev;
hipEventCreate(&ev);
// ...  early return / throw → утечка
hipEventDestroy(ev);

// ✅ ПРАВИЛЬНО:
drv_gpu_lib::ScopedHipEvent ev;
ev.Create();
// ... destroy автоматически в деструкторе
```

---

### ❌ Множественные экземпляры ProfilingFacade пишут в один файл

`ProfilingFacade` — singleton. Если запускать несколько бенчмарков подряд без `Reset()` между ними — данные смешаются. `GpuBenchmarkBase::Run()` вызывает `profiler.Reset()` в начале (в `InitProfiler()`), поэтому **каждый бенчмарк начинает с чистого листа**.

---

### ❌ BatchRecord с пустым gpu_id

**Причина**: `gpu_id_` в `GpuBenchmarkBase` ещё не инициализирован к моменту вызова `ExecuteKernelTimed()`.

**Исправление**: конструктор базового класса маппит `-1 → 0` автоматически. Если в кастомном коде — проверить `gpu_id_ >= 0` перед BatchRecord.

---

## 7. Референс-реализации

| Что | Файл |
|-----|------|
| ROCm benchmark-класс | `spectrum/tests/fft_processor_benchmark_rocm.hpp` |
| ROCm test runner | `spectrum/tests/test_fft_benchmark_rocm.hpp` |
| GpuBenchmarkBase | `core/include/core/services/gpu_benchmark_base.hpp` |
| ProfilingFacade (v2) | `core/include/core/services/profiling/profiling_facade.hpp` |
| Profiling types | `core/include/core/services/profiling/profiling_types.hpp` |
| ScopedHipEvent (RAII) | `core/include/core/common/scoped_hip_event.hpp` |
| ROCmBackend | `core/include/core/backends/rocm/rocm_backend.hpp` |
| Проверка соответствия | `python scripts/check_profiling.py {repo}` |

---

*Updated: 2026-04-22 | Version: 2.0 | Author: Кодо*
*Changes from v1.0: удалён OpenCL раздел (только ROCm/main), пути адаптированы под репо-структуру DSP-GPU, `RecordROCmEvent` → `ProfilingFacade::BatchRecord` (profiler v2), добавлен раздел про `ScopedHipEvent`.*
