---
schema_version: 1
repo: spectrum
class_fqn: fft_processor::FFTProcessorROCm
file: include/spectrum/fft_processor_rocm.hpp
line: 53
brief: "Layer-6 фасад для batch-FFT через hipFFT + hiprtc kernels"
maturity: stable

methods_total: 7
methods_ready: 1
methods_partial: 0
methods_no_tags: 6

ai_generated_at: 2026-05-01T20:00:00Z
ai_model: qwen3:8b
parser_version: 1
---

# `fft_processor::FFTProcessorROCm` — карточка класса

> **Этот файл генерируется автоматически** командой `dsp-asst manifest refresh --repo spectrum`.
> Не править руками — правки потеряются при следующем refresh.
> Источник правды — doxygen `@test*` теги в `include/spectrum/fft_processor_rocm.hpp` и связанных hpp.
> Связан с [_RAG.md](../_RAG.md) (если карточка лежит в `<repo>/.rag/test_params/`).

---

## Описание класса

```text
ЧТО:    Тонкий фасад над hipFFT + hiprtc kernels (pad_data + mag_phase). Реализует
        Layer-6 Ref03 Facade. Поддерживает 3 output-режима:
          - COMPLEX            → ProcessComplex
          - MAGNITUDE_PHASE    → ProcessMagPhase
          - MAGNITUDES_GPU     → ProcessMagnitudesToGPU (без D2H)
        Делает batch-FFT с zero-padding (nFFT = nextPow2(n_point) × repeat_count).

ЗАЧЕМ:  Скрывает hipFFT plan management, lazy-аллокацию device buffer'ов, выбор
        kernel-перегрузки. Python-биндинги работают через стабильный публичный API,
        не зная про hipfftHandle, hipfftPlan1d, BufferSet<4>, GpuContext.

ПОЧЕМУ: - Plan-кэш LRU-2 — пересоздание hipfftPlan1d стоит ~5 ms.
        - BufferSet<4> — переиспользование GPU buffer'ов между вызовами.
        - PadDataOp + MagPhaseOp вынесены в Op'ы (Layer 5).
        - Move-only (copy = delete) — owns hipfftHandle и device-память.
        - 2 перегрузки на каждый Process* — CPU-входы и GPU-входы.

ИСПОЛЬЗОВАНИЕ:
   auto proc = std::make_unique<FFTProcessorROCm>(rocm_backend);
   FFTProcessorParams p{.beam_count=128, .n_point=6000, .sample_rate=10e6f,
                         .output_mode=FFTOutputMode::COMPLEX, .repeat_count=1};
   auto results = proc->ProcessComplex(iq_data, p);

ИСТОРИЯ:
   - 2026-02-23  v1: создан как ROCm-port FFTProcessor.
   - 2026-03-14  v2: Ref03 Layer 6 Facade.
   - 2026-05-01  Шапка унифицирована под dsp-asst RAG-индексер.
```

---

## Method 1: `ProcessComplex(CPU input)` ✅ ready_for_autotest

**Сигнатура** (`fft_processor_rocm.hpp:74`):
```cpp
std::vector<FFTComplexResult> ProcessComplex(
    const std::vector<std::complex<float>>& data,
    const FFTProcessorParams& params,
    ROCmProfEvents* prof_events = nullptr);
```

**Doxygen-источник** (выдержка из `.hpp`):
```cpp
/**
 * @brief Прямой FFT C2C для batch-данных с CPU. H2D → pad → hipfftExecC2C → D2H.
 *
 * @param data Входные данные batch'ем [beam_count × n_point] complex<float>.
 *   @test { size=[100..1300000], value=6000, step=10000, unit="complex samples" }
 *
 * @param params Конфиг FFT (см. fft_params.hpp).
 *   @test_ref FFTProcessorParams        ← описание полей в fft_params.hpp
 *
 * @param prof_events Профиль (опционально).
 *   @test { values=[nullptr] }
 *
 * @return Массив [beam_count] результатов; magnitudes[nFFT] и phases[nFFT].
 *   @test_check result.size() == params.beam_count
 *   @test_check result[0].magnitudes.size() == nextPow2(n_point) * repeat_count
 *
 * @throws std::invalid_argument когда n_point == 0
 *   @test_check throws on params.n_point=0
 * @throws std::runtime_error на GPU OOM (hipError_t hipErrorOutOfMemory обёрнут)
 *   @test_check throws on beam_count*nFFT*8*4 > VRAM*memory_limit
 */
```

**Описание `FFTProcessorParams`** (подтянуто парсером из `fft_params.hpp` через `@test_ref`):
```cpp
struct FFTProcessorParams {
    /** @test { range=[1..50000], value=128, unit="лучей" } */
    uint32_t beam_count = 1;

    /** @test { range=[100..1300000], value=6000, pattern=any } */
    uint32_t n_point = 0;

    /** @test { range=[1.0..1e9], value=10e6, unit="Гц" } */
    float sample_rate = 1000.0f;

    /** @test { range=[1..16], value=1 } */
    uint32_t repeat_count = 1;

    /** @test { range=[0.1..0.95], value=0.80, unit="доля VRAM" } */
    float memory_limit = 0.80f;
};
```

**Сгенерированный YAML**:
```yaml
target: fft_processor::FFTProcessorROCm::ProcessComplex
file: include/spectrum/fft_processor_rocm.hpp
line: 74
overload: cpu_input
signature: |
  std::vector<FFTComplexResult> ProcessComplex(
      const std::vector<std::complex<float>>& data,
      const FFTProcessorParams& params,
      ROCmProfEvents* prof_events = nullptr)
brief: "Прямой FFT C2C для batch-данных с CPU. H2D → pad → hipfftExecC2C → D2H."

params:
  data:
    type: "std::vector<std::complex<float>>"
    test:
      size: { range: [100, 1300000], value: 6000, step: 10000 }
      unit: "complex samples"

  params:
    type: "FFTProcessorParams"
    test_ref: FFTProcessorParams           # парсер подтянул поля автоматически
    fields_resolved:                       # развёрнуто из @test_ref
      beam_count:    { type: uint32_t, test: { range: [1, 50000],     value: 128,     unit: "лучей" } }
      n_point:       { type: uint32_t, test: { range: [100, 1300000], value: 6000,    pattern: any } }
      sample_rate:   { type: float,    test: { range: [1.0, 1.0e9],   value: 10.0e6,  unit: "Гц" } }
      repeat_count:  { type: uint32_t, test: { range: [1, 16],        value: 1 } }
      memory_limit:  { type: float,    test: { range: [0.1, 0.95],    value: 0.80,    unit: "доля VRAM" } }

  prof_events:
    type: "ROCmProfEvents*"
    test: { values: [nullptr] }

return_checks:
  - "result.size() == params.beam_count"
  - "result[0].magnitudes.size() == nextPow2(n_point) * repeat_count"

expected_throws:
  - { type: std::invalid_argument, when: "params.n_point=0" }
  - { type: std::runtime_error,    when: "beam_count*nFFT*8*4 > VRAM*memory_limit (GPU OOM)" }

coverage:
  total_params: 3
  with_test_tag: 3
  return_checks: 2
  throw_checks: 2
  status: ready_for_autotest

auto_extracted: true
human_verified: false
ai_model: qwen3:8b
parser_version: 1
updated_at: 2026-05-01T20:00:00Z
```

### Что AI сгенерирует — основной стиль (`gpu_test_utils::TestRunner`)

Файл: `<repo>/tests/auto/test_fft_processor_rocm_processcomplex.hpp`

```cpp
// auto-generated from @test tags. DO NOT EDIT — правь теги в hpp.
#pragma once

#include <core/test_utils/test_runner.hpp>
#include <core/test_utils/test_result.hpp>
#include <core/services/console_output.hpp>
#include <spectrum/fft_processor_rocm.hpp>

namespace test_fft_processor_processcomplex {

using namespace gpu_test_utils;
using fft_processor::FFTProcessorROCm;
using fft_processor::FFTProcessorParams;
using fft_processor::FFTOutputMode;

inline void RegisterTests(TestRunner& runner, drv_gpu_lib::IBackend* backend) {

  // ──────────────────────────────────────────────────────────────
  // Smoke (базовая проверка работоспособности на типичных значениях)
  // ──────────────────────────────────────────────────────────────
  runner.test("ProcessComplex_Smoke", [&]() -> TestResult {
    TestResult tr{"ProcessComplex_Smoke"};

    FFTProcessorROCm proc(backend);
    std::vector<std::complex<float>> data(6000);                 // ← @test value=6000
    FFTProcessorParams params;
    params.beam_count   = 128;                                    // ← @test_ref → value=128
    params.n_point      = 6000;
    params.sample_rate  = 10.0e6f;
    params.repeat_count = 1;
    params.memory_limit = 0.80f;
    params.output_mode  = FFTOutputMode::COMPLEX;

    auto result = proc.ProcessComplex(data, params, nullptr);

    // ← @test_check result.size() == params.beam_count
    if (result.size() != 128u)
      return tr.add(FailResult("result.size", static_cast<double>(result.size()), 128.0));
    tr.add(PassResult("result.size", 128.0, 128.0));

    // ← @test_check result[0].magnitudes.size() == nextPow2(n_point) * repeat_count
    const double expected_mag = 8192.0;  // nextPow2(6000)
    const double actual_mag   = static_cast<double>(result[0].magnitudes.size());
    tr.add(ValidationResult{actual_mag == expected_mag, "magnitudes.size",
                             actual_mag, expected_mag, ""});
    return tr;
  });

  // ──────────────────────────────────────────────────────────────
  // Negative — throws on n_point == 0
  // ──────────────────────────────────────────────────────────────
  runner.test("ProcessComplex_ThrowsOnZeroNPoint", [&]() -> TestResult {
    TestResult tr{"ProcessComplex_ThrowsOnZeroNPoint"};

    FFTProcessorROCm proc(backend);
    std::vector<std::complex<float>> data(6000);
    FFTProcessorParams params;
    params.beam_count = 128;
    params.n_point    = 0;                                        // ← @test_check throws

    try {
      proc.ProcessComplex(data, params, nullptr);
      tr.add(FailResult("throws", 0.0, 1.0, "ожидался std::invalid_argument"));
    } catch (const std::invalid_argument&) {
      tr.add(PassResult("throws"));
    }
    return tr;
  });

  // ──────────────────────────────────────────────────────────────
  // Stress — OOM на огромном batch
  // ──────────────────────────────────────────────────────────────
  runner.test("ProcessComplex_OomOnHugeBatch", [&]() -> TestResult {
    TestResult tr{"ProcessComplex_OomOnHugeBatch"};

    FFTProcessorROCm proc(backend);
    FFTProcessorParams params;
    params.beam_count = 50000;                                    // ← граница из @test_ref
    params.n_point    = 1300000;

    try {
      // Не выделяем 50000*1300000 на CPU — сразу запросим обработку,
      // GPU OOM поднимется на первом hipMalloc внутри FFTProcessor.
      std::vector<std::complex<float>> data(64);  // dummy, FFTProcessor проверит params
      proc.ProcessComplex(data, params, nullptr);
      tr.add(FailResult("throws", 0.0, 1.0, "ожидался std::runtime_error (GPU OOM)"));
    } catch (const std::runtime_error&) {
      tr.add(PassResult("throws"));
    } catch (const std::bad_alloc&) {
      tr.add(PassResult("throws"));  // допустимо если CPU vector не получился
    }
    return tr;
  });
}

} // namespace test_fft_processor_processcomplex
```

> **GoogleTest variant** для проектов на GTest — отдельный pipeline,
> сейчас отключён. См. `MemoryBank/.future/TASK_gtest_variant_for_external_projects.md`.

---

## Method 2: `ProcessComplex(GPU input)` ⏸ skipped (no @test tags)

**Сигнатура** (`fft_processor_rocm.hpp:79`):
```cpp
std::vector<FFTComplexResult> ProcessComplex(
    void* gpu_data,
    const FFTProcessorParams& params,
    size_t gpu_memory_bytes = 0);
```

**Coverage**: 0% — нет `@test` тегов в doxygen.
**Action**: добавь `@test`/`@test_ref` к параметрам в hpp, чтобы AI сгенерировала тест.

---

## Method 3: `ProcessMagPhase(CPU input)` ⏸ skipped

**Сигнатура** (`fft_processor_rocm.hpp:88`):
```cpp
std::vector<FFTMagPhaseResult> ProcessMagPhase(
    const std::vector<std::complex<float>>& data,
    const FFTProcessorParams& params,
    ROCmProfEvents* prof_events = nullptr);
```

**Coverage**: 0%. Аналогичен Method 1, но output_mode=MAGNITUDE_PHASE.

---

## Method 4: `ProcessMagPhase(GPU input)` ⏸ skipped

**Сигнатура** (`fft_processor_rocm.hpp:93`):
```cpp
std::vector<FFTMagPhaseResult> ProcessMagPhase(
    void* gpu_data,
    const FFTProcessorParams& params,
    size_t gpu_memory_bytes = 0);
```

**Coverage**: 0%.

---

## Method 5: `ProcessMagnitudesToGPU` ⏸ skipped

**Сигнатура** (`fft_processor_rocm.hpp:118`):
```cpp
void ProcessMagnitudesToGPU(
    void* gpu_data,
    void* gpu_out_magnitudes,
    const FFTProcessorParams& params,
    bool squared = false,
    WindowType window = WindowType::None,
    ROCmProfEvents* prof_events = nullptr);
```

**Coverage**: 0%. Используется `SnrEstimatorOp` — magnitudes сразу на GPU без D2H.

---

## Method 6: `FFTProcessorROCm(IBackend*)` (ctor) ⏸ skipped (trivial)

**Сигнатура** (`fft_processor_rocm.hpp:59`):
```cpp
explicit FFTProcessorROCm(drv_gpu_lib::IBackend* backend);
```

**Coverage**: тривиальный конструктор, парсер пропускает.

---

## Method 7: `~FFTProcessorROCm()` (dtor) ⏸ skipped (destructor)

**Сигнатура** (`fft_processor_rocm.hpp:60`):
```cpp
~FFTProcessorROCm();
```

**Coverage**: деструктор, парсер пропускает.

---

## Сводка по классу

```yaml
class_summary:
  total_methods: 7
  ready_for_autotest: 1               # ProcessComplex (CPU input)
  partial_coverage:   0
  no_tags:            4               # 4 публичных метода без @test
  skipped_trivial:    2               # ctor + dtor

  next_actions:
    - "Добавить @test/@test_ref к ProcessComplex(GPU input) в строке 79"
    - "Добавить @test/@test_ref к ProcessMagPhase (обе перегрузки) в строках 88, 93"
    - "Добавить @test/@test_ref к ProcessMagnitudesToGPU в строке 118"
```

---

*Конец карточки класса.*
