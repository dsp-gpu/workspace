# Ref03 — Единая архитектура GPU-операций DSP-GPU

> **Статус**: ✅ **DONE** — мигрирован в репо-архитектуру DSP-GPU (2026-04)
> **Автор**: Alex + Кодо
> **Дата концепции**: 2026-03-14 | **Миграция завершена**: 2026-04
> **Применяется к**: ВСЕ репо — `stats`, `spectrum`, `signal_generators`, `heterodyne`, `linalg`, `radar`, `strategies`
> **Платформа**: Linux / AMD / ROCm 7.2+ / HIP (ветка `main`)

---

## 1. Проблема (историческая)

Каждый модуль в монолите GPUWorkLib — свой стиль. `StatisticsProcessor`: 10 kernel handles, 13 GPU буферов, 30+ полей в move semantics. Добавление histogram median потребовало правок в 6+ местах одного файла. Нет единой концепции — каждый новый модуль/алгоритм пишется «с нуля».

## 2. Цель (достигнута)

**Одна архитектура на весь проект.** Любой репо строится из маленьких Op-классов, объединённых Facade. Публичный API НЕ меняется. Вся инфраструктура живёт в репо `core`, каждый compute-репо подключает её через `#include <core/…>`.

---

## 3. Шестислойная модель

```
┌─────────────────────────────────────────────────────────┐
│  СЛОЙ 6: Facades + Strategies                           │
│  (в каждом compute-репо)                                │
│  statistics::StatisticsProcessor                        │
│  fft_processor::FFTProcessorROCm                        │
│  strategies::Pipeline + PipelineBuilder                  │
├─────────────────────────────────────────────────────────┤
│  СЛОЙ 5: Concrete Operations (маленькие классы)         │
│  (в {repo}/include/{repo}/operations/)                  │
│  MeanReductionOp, WelfordFusedOp, MedianHistogramOp     │
│  FirFilterOp, FFTForwardOp, PadDataOp, GemmStepOp       │
├─────────────────────────────────────────────────────────┤
│  СЛОЙ 4: BufferedGpuOp (base: buffer management)        │
│  BufferSet<N> — compile-time array, zero overhead        │
│  [core/include/core/services/buffer_set.hpp]            │
├─────────────────────────────────────────────────────────┤
│  СЛОЙ 3: GpuKernelOp (base: kernel compilation)         │
│  hiprtc compile, KernelCacheService                     │
│  [core/include/core/services/gpu_kernel_op.hpp]         │
├─────────────────────────────────────────────────────────┤
│  СЛОЙ 2: IGpuOperation (abstract interface)             │
│  Name(), Initialize(), IsReady(), Release()              │
│  [core/include/core/interface/i_gpu_operation.hpp]      │
├─────────────────────────────────────────────────────────┤
│  СЛОЙ 1: GpuContext (shared state per-module)           │
│  backend, stream, module, console, shared buffers        │
│  [core/include/core/interface/gpu_context.hpp]          │
└─────────────────────────────────────────────────────────┘
```

> 💡 **Слои 1–4 живут в репо `core`** (единая инфраструктура).
> **Слои 5–6 живут в compute-репо** (`stats/`, `spectrum/`, `strategies/`, …).

---

## 4. Ключевые классы

### 4.1 GpuContext (СЛОЙ 1) — per-repo

```cpp
// core/include/core/interface/gpu_context.hpp
#if ENABLE_ROCM

#include <core/services/buffer_set.hpp>
#include <core/services/console_output.hpp>
#include <hip/hip_runtime.h>
#include <hip/hiprtc.h>

namespace drv_gpu_lib {

class IBackend;
class KernelCacheService;

class GpuContext {
public:
  GpuContext(IBackend* backend);

  // Immutable (thread-safe read)
  IBackend* backend() const;
  hipStream_t stream() const;
  ConsoleOutput& console() const;

  // Kernel compilation (lazy, one-time, thread-safe: per-repo instance)
  void CompileModule(const char* source, const std::vector<std::string>& kernel_names);
  hipFunction_t GetKernel(const char* name) const;

  // Shared GPU buffer pool — generic, max kMaxSharedBuffers (=8) слотов.
  // Репо определяет своё отображение слотов (см. 4.1.1).
  void* RequireShared(size_t slot, size_t bytes);
  void ReleaseShared();

private:
  IBackend* backend_;
  hipStream_t stream_;
  hipModule_t module_ = nullptr;
  std::unordered_map<std::string, hipFunction_t> kernels_;
  BufferSet<kMaxSharedBuffers> shared_;
  std::unique_ptr<KernelCacheService> cache_;
};

}  // namespace drv_gpu_lib

#endif  // ENABLE_ROCM
```

**Почему per-repo:**
- Каждый репо — свой stream → параллельное выполнение на одном GPU
- Thread-safe: репо не шарят mutable state
- Свой compiled module → независимая kernel compilation
- Свой kernel cache → независимая инвалидация при изменении исходников

#### 4.1.1 Слоты shared buffers — **per-repo**

`GpuContext` НЕ знает, что означает каждый слот. Каждый репо определяет свои:

```cpp
// stats/include/stats/shared_buf.hpp
namespace statistics::shared_buf {
  enum Slot { kInput, kMagnitudes, kResult, kMediansCompact, kCount };
}

// spectrum/include/spectrum/shared_buf.hpp
namespace fft_processor::shared_buf {
  enum Slot { kInput, kOutput, kPad, kCount };
}

// Использование:
ctx_.RequireShared(statistics::shared_buf::kInput, n * sizeof(float));
ctx_.RequireShared(fft_processor::shared_buf::kPad,  n_fft * sizeof(complex<float>));
```

> 💡 Эта гибкость — критичное отличие от прототипа: раньше enum был в `GpuContext`,
> все репо делили общий набор слотов. Теперь каждое репо независимо.

### 4.2 IGpuOperation (СЛОЙ 2)

```cpp
// core/include/core/interface/i_gpu_operation.hpp
namespace drv_gpu_lib {

class IGpuOperation {
public:
  virtual ~IGpuOperation() = default;
  virtual const char* Name() const = 0;
  virtual void Initialize(GpuContext& ctx) = 0;
  virtual bool IsReady() const = 0;
  virtual void Release() = 0;
};

}
```

### 4.3 GpuKernelOp (СЛОЙ 3)

```cpp
// core/include/core/services/gpu_kernel_op.hpp
namespace drv_gpu_lib {

class GpuKernelOp : public IGpuOperation {
protected:
  GpuContext* ctx_ = nullptr;

  // Get compiled kernel from GpuContext (Facade compiled module once)
  hipFunction_t kernel(const char* name) const {
    return ctx_->GetKernel(name);
  }

  hipStream_t stream() const { return ctx_->stream(); }

public:
  void Initialize(GpuContext& ctx) override { ctx_ = &ctx; OnInitialize(); }
  bool IsReady() const override { return ctx_ != nullptr; }
  void Release() override { OnRelease(); ctx_ = nullptr; }

protected:
  virtual void OnInitialize() {}  // Override for custom init
  virtual void OnRelease() {}     // Override for custom cleanup
};

}
```

### 4.4 BufferSet<N> (СЛОЙ 4)

```cpp
// core/include/core/services/buffer_set.hpp
namespace drv_gpu_lib {

template<size_t N>
class BufferSet {
  struct Entry { void* ptr = nullptr; size_t size = 0; };
  Entry entries_[N];

public:
  void* Require(size_t idx, size_t bytes) {
    auto& e = entries_[idx];
    if (e.size >= bytes) return e.ptr;  // reuse
    if (e.ptr) hipFree(e.ptr);
    hipMalloc(&e.ptr, bytes);
    e.size = bytes;
    return e.ptr;
  }

  void ReleaseAll() {
    for (auto& e : entries_) {
      if (e.ptr) { hipFree(e.ptr); e.ptr = nullptr; e.size = 0; }
    }
  }

  // Move: trivial (memcpy + zero source)
  BufferSet(BufferSet&& o) noexcept { std::memcpy(entries_, o.entries_, sizeof(entries_)); std::memset(o.entries_, 0, sizeof(o.entries_)); }
  BufferSet& operator=(BufferSet&& o) noexcept { ReleaseAll(); std::memcpy(entries_, o.entries_, sizeof(entries_)); std::memset(o.entries_, 0, sizeof(o.entries_)); return *this; }

  ~BufferSet() { ReleaseAll(); }
  BufferSet() = default;
};

}
```

**Свойства:**
- Zero overhead (stack array, no heap, no hash)
- Compile-time size → ошибки при компиляции
- Move = memcpy → тривиально
- Per-instance → thread-safe

### 4.5 Concrete Op (СЛОЙ 5, пример)

```cpp
// stats/include/stats/operations/median_histogram_op.hpp
#if ENABLE_ROCM

#include <core/services/gpu_kernel_op.hpp>
#include <core/services/buffer_set.hpp>

namespace statistics {

class MedianHistogramOp : public drv_gpu_lib::GpuKernelOp {
  enum Buf { kHist, kPrefix, kValue, kBufCount };
  drv_gpu_lib::BufferSet<kBufCount> bufs_;

public:
  const char* Name() const override { return "MedianHistogram"; }

  void Execute(size_t beam_count, size_t n_point, bool is_complex) {
    bufs_.Require(kHist,   beam_count * 256 * sizeof(uint32_t));
    bufs_.Require(kPrefix, beam_count * sizeof(uint32_t));
    bufs_.Require(kValue,  beam_count * sizeof(uint32_t));
    // ... 4-pass histogram logic ...
  }

protected:
  void OnRelease() override { bufs_.ReleaseAll(); }
};

}  // namespace statistics

#endif  // ENABLE_ROCM
```

### 4.6 Facade + Strategy (СЛОЙ 6)

```cpp
// stats/include/stats/statistics_processor.hpp
#if ENABLE_ROCM

#include <core/interface/gpu_context.hpp>
#include <stats/operations/mean_reduction_op.hpp>
#include <stats/operations/welford_fused_op.hpp>
#include <stats/operations/median_radix_sort_op.hpp>
#include <stats/operations/median_histogram_op.hpp>
#include <stats/operations/median_histogram_complex_op.hpp>
#include <stats/shared_buf.hpp>

namespace statistics {

class StatisticsProcessor {
  drv_gpu_lib::GpuContext  ctx_;             // per-repo context
  MeanReductionOp          mean_op_;         // lazy-init
  WelfordFusedOp           welford_op_;
  MedianRadixSortOp        median_sort_op_;
  MedianHistogramOp        median_hist_op_;
  MedianHistogramComplexOp median_hist_complex_op_;

  static constexpr size_t kHistogramThreshold = 100'000;

public:
  // ПУБЛИЧНЫЙ API НЕ МЕНЯЕТСЯ!
  std::vector<MedianResult> ComputeMedian(const std::vector<std::complex<float>>& data,
                                           const StatisticsParams& params) {
    ctx_.RequireShared(shared_buf::kInput, /* ... */);
    UploadData(/* ... */);

    if (params.n_point > kHistogramThreshold) {
      median_hist_complex_op_.Execute(params.beam_count, params.n_point);
    } else {
      median_sort_op_.Execute(params.beam_count, params.n_point);
    }
    return ReadMedianResults();
  }
};

}  // namespace statistics

#endif  // ENABLE_ROCM
```

---

## 5. Strategies Pipeline — гибкая архитектура (репо `strategies`)

### Проблема (историческая)
Pipeline был жёстко захардкожен: Step0→Step1→Step2→Step3→Step4→Step5→Step6.
Нужно: добавлять/удалять шаги, профилировать каждый, ветвить pipeline.

### Решение: IPipelineStep + PipelineBuilder

```cpp
// strategies/include/strategies/i_pipeline_step.hpp
#include <core/interface/i_gpu_operation.hpp>

namespace strategies {

class IPipelineStep : public drv_gpu_lib::IGpuOperation {
public:
  virtual void Execute(PipelineContext& ctx) = 0;
  virtual bool IsEnabled(const AntennaProcessorConfig& cfg) const = 0;
};

// Concrete steps (strategies/include/strategies/steps/):
class GemmStep       : public IPipelineStep { ... };  // Step 2  ✅
class WindowFftStep  : public IPipelineStep { ... };  // Step 4  ✅
class OneMaxStep     : public IPipelineStep { ... };  // Step 6.1 ✅
class AllMaximaStep  : public IPipelineStep { ... };  // Step 6.2 ✅
class MinMaxStep     : public IPipelineStep { ... };  // Step 6.3 ✅

// Debug/Stats steps (optional):
class DebugStatsStep : public IPipelineStep {          // ✅
  enum DebugPoint { PRE_INPUT, POST_GEMM, POST_FFT };
  DebugPoint point_;
  StatisticsSet stat_fields_;
  // Пропускается если stat_fields_ == NONE
};

}  // namespace strategies
```

### PipelineBuilder

```cpp
// strategies/include/strategies/pipeline_builder.hpp
namespace strategies {

class PipelineBuilder {
public:
  PipelineBuilder& add(std::unique_ptr<IPipelineStep> step);
  PipelineBuilder& add_if(bool condition, std::unique_ptr<IPipelineStep> step);
  PipelineBuilder& add_parallel(std::vector<std::unique_ptr<IPipelineStep>> steps);
  std::unique_ptr<Pipeline> build();
};

}

// Usage (из теста/приложения):
auto pipeline = strategies::PipelineBuilder()
  .add(std::make_unique<strategies::DebugStatsStep>(PRE_INPUT, cfg.pre_input_stats))
  .add(std::make_unique<strategies::GemmStep>())
  .add(std::make_unique<strategies::DebugStatsStep>(POST_GEMM, cfg.post_gemm_stats))
  .add(std::make_unique<strategies::WindowFftStep>())
  .add(std::make_unique<strategies::DebugStatsStep>(POST_FFT, cfg.post_fft_stats))
  .add_parallel({
    std::make_unique<strategies::OneMaxStep>(),
    std::make_unique<strategies::AllMaximaStep>(),
    std::make_unique<strategies::MinMaxStep>()
  })
  .build();
```

### Per-Step профилирование (через ProfilingFacade v2)

```cpp
// strategies/include/strategies/pipeline.hpp
#include <core/services/profiling/profiling_facade.hpp>
#include <core/services/scoped_hip_event.hpp>

namespace strategies {

class Pipeline {
  std::vector<std::unique_ptr<IPipelineStep>> steps_;
  int gpu_id_ = 0;
  bool profile_ = false;

  AntennaResult Execute(PipelineContext& ctx) {
    using namespace drv_gpu_lib;

    ROCmProfEvents events;   // собираем все этапы одной пачкой

    for (auto& step : steps_) {
      if (!step->IsEnabled(ctx.config())) continue;

      ScopedHipEvent ev_start, ev_stop;  // RAII! голый hipEventCreate запрещён
      if (profile_) {
        ev_start.Create();
        ev_stop.Create();
        hipEventRecord(ev_start.get(), ctx.stream());
      }

      step->Execute(ctx);

      if (profile_) {
        hipEventRecord(ev_stop.get(), ctx.stream());
        events.push_back({step->Name(),
                          MakeROCmDataFromEvents(ev_start.get(), ev_stop.get(), 0, step->Name())});
      }
    }

    // BatchRecord: одно сообщение в async-очередь профайлера
    // (меньше contention vs per-step Record)
    if (profile_) {
      profiling::ProfilingFacade::GetInstance()
          .BatchRecord(gpu_id_, "strategies/pipeline", events);
    }

    return /* ... */;
  }
};

}  // namespace strategies
```

> 💡 Переход c `GPUProfiler::Record` на `ProfilingFacade::BatchRecord` — часть
> profiler v2 (см. `DSP-GPU/MemoryBank/.claude/specs/GPU_Profiling_Mechanism.md`).

### Ветвление (branch)

```cpp
// Добавить ветку с дополнительными расчётами:
auto pipeline_extended = strategies::PipelineBuilder()
  .add(std::make_unique<strategies::GemmStep>())
  .add(std::make_unique<strategies::WindowFftStep>())
  // Основная ветка:
  .add(std::make_unique<strategies::OneMaxStep>())
  // Дополнительная ветка (параллельно):
  .add_parallel({
    std::make_unique<strategies::AllMaximaStep>(),
    std::make_unique<CustomAnalysisStep>(),   // ← НОВОЕ
    std::make_unique<strategies::MinMaxStep>()
  })
  .build();
```

---

## 6. Многопоточность

### Правило: per-repo GpuContext

```
GPU_00
├── statistics::StatisticsProcessor   → GpuContext(stream_A)  // Thread A
├── filters::FirFilterROCm            → GpuContext(stream_B)  // Thread B (параллельно!)
└── fft_processor::FFTProcessorROCm   → GpuContext(stream_C)  // Thread C (параллельно!)
```

### Правило: операции внутри репо — последовательны

```
statistics::StatisticsProcessor.ComputeMedian()
  → statistics::MeanReductionOp.Execute()    // stream_A
  → statistics::MedianHistogramOp.Execute()  // stream_A (после mean)
  // НЕ параллельно — один stream на репо
```

### Исключение: strategies с parallel steps

```
AntennaProcessor.process()
  → GemmStep          // stream_main
  → WindowFftStep     // stream_main
  → [parallel]:
      OneMaxStep       // stream_bench3a
      AllMaximaStep    // stream_bench3b
      MinMaxStep       // stream_bench3c
```

---

## 7. Файловая структура (реализована)

### 7.1 Репо `core` (инфраструктура — слои 1–4)

```
core/
├── include/core/
│   ├── interface/
│   │   ├── i_gpu_operation.hpp          ✅
│   │   └── gpu_context.hpp              ✅  (generic slots — per-repo enum)
│   └── services/
│       ├── gpu_kernel_op.hpp            ✅
│       ├── buffer_set.hpp               ✅
│       ├── scoped_hip_event.hpp         ✅  (RAII для hipEvent_t — обязателен!)
│       └── profiling/
│           └── profiling_facade.hpp      ✅  (v2 — BatchRecord)
└── src/
    ├── gpu_context.cpp                  ✅
    └── gpu_kernel_op.cpp                ✅
```

### 7.2 Репо `stats` (слои 5–6)

```
stats/
└── include/stats/
    ├── statistics_processor.hpp        ✅  (thin Facade)
    ├── shared_buf.hpp                  ✅  (per-repo slot enum)
    └── operations/
        ├── mean_reduction_op.hpp        ✅
        ├── welford_fused_op.hpp         ✅
        ├── welford_float_op.hpp         ✅
        ├── median_radix_sort_op.hpp     ✅
        ├── median_histogram_op.hpp      ✅
        ├── median_histogram_complex_op.hpp ✅
        └── snr_estimator_op.hpp         ✅  (новый — SNR бонус)
```

### 7.3 Репо `spectrum` (слои 5–6)

```
spectrum/
└── include/spectrum/
    ├── fft_processor_rocm.hpp           ✅  (Facade)
    ├── complex_to_mag_phase_rocm.hpp    ✅
    ├── lch_farrow_rocm.hpp              ✅
    └── operations/
        ├── pad_data_op.hpp              ✅
        ├── magnitude_op.hpp             ✅
        ├── mag_phase_op.hpp             ✅
        ├── compute_magnitudes_op.hpp    ✅
        ├── spectrum_pad_op.hpp          ✅
        └── spectrum_post_op.hpp         ✅
```

### 7.4 Репо `strategies` (композиция)

```
strategies/
└── include/strategies/
    ├── i_pipeline_step.hpp              ✅
    ├── pipeline_builder.hpp             ✅
    ├── pipeline.hpp                     ✅
    └── steps/
        ├── gemm_step.hpp                ✅
        ├── window_fft_step.hpp          ✅
        ├── debug_stats_step.hpp         ✅
        ├── one_max_step.hpp             ✅
        ├── all_maxima_step.hpp          ✅
        └── minmax_step.hpp              ✅
```

---

## 8. Порядок реализации (история)

| Ref | Репо | Статус | Дата |
|-----|------|--------|------|
| **Ref03-A** | `core` — Foundation (слои 1–4) | ✅ DONE | 2026-03 |
| **Ref03-B** | `stats` (слои 5–6) | ✅ DONE | 2026-03 |
| **Ref03-C** | `strategies` (pipeline + builder + 6 steps) | ✅ DONE | 2026-03 |
| **Ref03-D** | `spectrum` — filters (слои 5–6) | ✅ DONE | 2026-04 |
| **Ref03-E** | `spectrum` — fft_processor + lch_farrow | ✅ DONE | 2026-04 |
| **Ref03-F** | `signal_generators`, `heterodyne`, `linalg`, `radar` | ✅ DONE | 2026-04 |

---

## 9. Правила, закреплённые проектом

1. **ScopedHipEvent** обязателен для всех `hipEvent_t` — голые `hipEventCreate` запрещены
   (закрыто ~38 утечек 15.04, правило в `CLAUDE.md`).
2. **ProfilingFacade v2** (`BatchRecord`) для замеров — не прямой `GPUProfiler::Record`
   на каждое событие (меньше contention на warp-мьютексе).
3. **Публичный API не меняется** при рефакторинге — только внутренняя декомпозиция на Op-ы.
4. **Каждый репо — свой `GpuContext`** и свой `shared_buf::Slot` enum.
5. **Слои 1–4 только в `core`** — compute-репо их не дублируют, подключают через `<core/...>`.

---

## 10. Ссылки

- [CLAUDE.md](../../CLAUDE.md) — правила проекта
- [~!Doc/~Разобрать/DSP-GPU_Architecture_Analysis.md](../~Разобрать/DSP-GPU_Architecture_Analysis.md) — статистика и граф зависимостей
- [~!Doc/~Разобрать/DSP-GPU_Design_C4_Full.md](../~Разобрать/DSP-GPU_Design_C4_Full.md) — C4 модель
- [~!Doc/~Разобрать/GPU_Profiling_Mechanism.md](../~Разобрать/GPU_Profiling_Mechanism.md) — профилирование v2 (BatchRecord + ScopedHipEvent)
- [MemoryBank/.architecture/CMake-GIT/](../CMake-GIT/) — архитектура CMake + Git (DSP-GPU ↔ SMI100 ↔ LocalProject)

---

*Updated: 2026-04-22 | Status: ✅ DONE (мигрирован в DSP-GPU)*
*Changes from v1 (GPUWorkLib, 2026-03-14): "модули" → "репо"; пути `DrvGPU/…` → `core/include/core/…`, `modules/{x}/…` → `{x}/include/{x}/…`; namespace `drv_gpu_lib` + per-repo namespaces (`statistics`, `fft_processor`, …); `SharedBuf` enum вынесен из `GpuContext` в per-repo `shared_buf::Slot`; профилирование обновлено на `ProfilingFacade::BatchRecord` + `ScopedHipEvent`.*
