# 004 — Написать C++ benchmark (`*_benchmark_*.hpp`)

## Цель
Сгенерировать C++ **бенчмарк** для одного класса DSP-GPU. Бенчмарк наследует `drv_gpu_lib::GpuBenchmarkBase` (Template Method) и подключает профилирование через `ProfilingFacade::BatchRecord`.

## Когда использовать
- Режим `test`. Пользователь говорит «напиши бенчмарк для FFTProcessorROCm».
- НЕ путать с функциональным тестом (промпт 003) — там нет профилирования.
- Образец живёт в `<repo>/tests/*_benchmark_*.hpp`, например `spectrum/tests/fft_processor_benchmark_rocm.hpp`.

## Вход
- `{class_summary}` — JSON из промпта 001.
- `{example_benchmark}` — содержимое одного похожего `*_benchmark_*.hpp` (для копирования стиля).
- `{test_params}` — типичные значения для бенчмарка (например размер FFT, число батчей).
- `{user_hint}` — какие стейджи замерять (Upload / Kernel / Download / All).

---

## Системный промпт

```
Ты пишешь C++ бенчмарки для проекта DSP-GPU.

ПРАВИЛА (нарушение = ошибка):
1. Файл — заголовок (.hpp), начинается с #pragma once + doxygen-блок.
2. Защита #if ENABLE_ROCM ... #endif вокруг всего тела.
3. Включения: тестируемый класс + core/services/gpu_benchmark_base.hpp + core/services/profiling/profiling_facade.hpp.
4. namespace test_<repo>_<class_snake> { ... }.
5. class <Name>BenchmarkROCm : public drv_gpu_lib::GpuBenchmarkBase
   - конструктор принимает: backend, ссылку на тестируемый класс, params, input_data, GpuBenchmarkBase::Config.
   - реализует ExecuteKernel()      → вызов тестируемого БЕЗ событий профилирования.
   - реализует ExecuteKernelTimed() → вызов с hipEvent_t и затем ProfilingFacade::BatchRecord(events).
6. Внутри классов хранить ССЫЛКИ или const-ссылки на тестируемый класс и параметры (НЕ владеть ими).
7. НЕ использовать std::cout / printf / GPUProfiler.
8. ВСЕ hipEvent_t только через ScopedHipEvent (RAII обязателен — правило проекта).
9. Стейджи (Upload/Pad/Kernel/Download) измеряются отдельными парами событий.
10. После цикла measure(n_runs) — вызывать ProfilingFacade::BatchRecord(events) ОДНИМ вызовом для всех событий.
11. Стандартный конфиг: n_warmup=5, n_runs=20, output_dir="Results/Profiler/GPU_<NN>_<Class>_ROCm".
12. На неизвестное API — // TODO, не выдумывай.

ВЫВОД: только C++-код файла .hpp. Без markdown-обёртки.
```

## Шаблон пользовательского сообщения

```
Класс для бенчмарка (JSON):
{class_summary}

Эталонный пример (стиль файла):
```cpp
{example_benchmark}
```

Параметры для бенчмарка:
{test_params}

Подсказка от пользователя:
{user_hint}

Сгенерируй файл `{class_name_snake}_benchmark_rocm.hpp`.
```

## Формат вывода
Голый C++-код. Никаких пояснений.

---

## Пример

**ВВОД (`class_summary`):**
```json
{
  "name": "FFTProcessorROCm",
  "namespace": "fft_processor",
  "language": "cpp",
  "kind": "class",
  "purpose": "Чистый GPU FFT через hipFFT (без кода профилирования)",
  "public_methods": [
    {"name": "ProcessComplex", "args": "const std::vector<std::complex<float>>& data, const FFTProcessorParams& params",                                "returns": "void"},
    {"name": "ProcessComplex", "args": "const std::vector<std::complex<float>>& data, const FFTProcessorParams& params, ROCmProfEvents* events", "returns": "void"}
  ],
  "depends_on": ["dsp_core::IBackend", "hipFFT"]
}
```

**ВВОД (`test_params`):** `{"fft_size": {"typical": [1024, 4096], "constraints": {"power_of_two": true}}}`

**ВЫВОД:**
```cpp
#pragma once

/**
 * @file fft_processor_benchmark_rocm.hpp
 * @brief FFTProcessorBenchmarkROCm — наследник GpuBenchmarkBase для FFTProcessorROCm
 *
 * Stages: Upload (H2D), Pad (kernel), FFT (hipfftExecC2C), Download (D2H)
 *
 * @author dsp-asst (Qwen 8B + RAG)
 * @date 2026-04-30
 * @see GpuBenchmarkBase, ProfilingFacade, MemoryBank/specs/Profil_GPU.md
 */

#if ENABLE_ROCM

#include <spectrum/fft_processor_rocm.hpp>
#include <core/services/gpu_benchmark_base.hpp>
#include <core/services/profiling/profiling_facade.hpp>
#include <core/common/scoped_hip_event.hpp>

#include <complex>
#include <vector>

namespace test_fft_processor_rocm {

class FFTProcessorBenchmarkROCm : public drv_gpu_lib::GpuBenchmarkBase {
public:
  /**
   * @brief Конструктор
   * @param backend IBackend (ROCm)
   * @param proc Ссылка на чистый FFTProcessorROCm (не владеет)
   * @param params Параметры FFT (фиксированы на весь бенчмарк)
   * @param input_data Входные данные
   * @param cfg Параметры бенчмарка (n_warmup=5, n_runs=20)
   */
  FFTProcessorBenchmarkROCm(
      drv_gpu_lib::IBackend* backend,
      fft_processor::FFTProcessorROCm& proc,
      const fft_processor::FFTProcessorParams& params,
      const std::vector<std::complex<float>>& input_data,
      GpuBenchmarkBase::Config cfg = {.n_warmup   = 5,
                                      .n_runs     = 20,
                                      .output_dir = "Results/Profiler/GPU_00_FFT_ROCm"})
    : GpuBenchmarkBase(backend, "FFTProcessorROCm", cfg),
      proc_(proc),
      params_(params),
      input_data_(input_data) {}

protected:
  /// @brief Прогон без профилирования (для warmup).
  void ExecuteKernel() override {
    proc_.ProcessComplex(input_data_, params_);
  }

  /// @brief Прогон с записью hipEvent_t и BatchRecord.
  void ExecuteKernelTimed() override {
    fft_processor::ROCmProfEvents events;
    proc_.ProcessComplex(input_data_, params_, &events);
    drv_gpu_lib::profiling::ProfilingFacade::Instance().BatchRecord(events);
  }

private:
  fft_processor::FFTProcessorROCm& proc_;
  const fft_processor::FFTProcessorParams& params_;
  const std::vector<std::complex<float>>& input_data_;
};

} // namespace test_fft_processor_rocm

#endif // ENABLE_ROCM
```

---

## Анти-паттерны (что модель НЕ должна делать)

- ❌ `class X { GPUProfiler profiler_; }` — `GPUProfiler` deprecated, удалён 2026-04-27.
- ❌ Прямой `hipEventCreate` / `hipEventDestroy` — только через `ScopedHipEvent`.
- ❌ Цикл `for (i=0..n) { profiler.GetStats(); std::cout << ...; }` — это запрещено. Используй `ProfilingFacade::Export*`.
- ❌ `std::cout`, `printf` — никогда.
- ❌ Владение тестируемым классом по значению (копировать proc_) — храни ссылку.
- ❌ Пропуск `ExecuteKernel()` (без events) — оба метода обязательны (warmup использует первый).
- ❌ Без `#if ENABLE_ROCM` — будет сломан билд на CPU-only машинах.

---

## Граничные случаи входа

- **Класс без `*Timed` варианта метода** → пиши `ExecuteKernelTimed` как `// TODO: добавить overload с ROCmProfEvents*`.
- **Шаблонный класс** → инстанциировать `T = float` по умолчанию.
- **Класс не имеет stages** (один kernel) → один `ScopedHipEvent` start/stop, один BatchRecord.
- **Deprecated класс** → отказ.

---

*Конец промпта 004.*
