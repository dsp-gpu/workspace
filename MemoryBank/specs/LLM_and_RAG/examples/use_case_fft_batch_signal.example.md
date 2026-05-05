---
schema_version: 1
kind: use_case
id: fft_batch_signal
repo: spectrum
title: "Прямой FFT для batch-сигнала с антенного массива"

# ── Семантические синонимы — для лучшего retrieval ────────────────
synonyms:
  ru:
    - "Как посчитать БПФ батчем"
    - "FFT для антенн на GPU"
    - "Спектр сигнала с массива антенн"
    - "Параллельный FFT для нескольких лучей"
  en:
    - "How to compute batch FFT on GPU"
    - "FFT for antenna array signal"
    - "Parallel FFT for multiple beams"
    - "hipFFT batch processing"

# ── Связи ─────────────────────────────────────────────────────────
primary_class: fft_processor::FFTProcessorROCm
primary_method: ProcessComplex
related_classes:
  - fft_processor::FFTProcessorParams      # конфиг
  - spectrum::SpectrumProcessorROCm        # обёртка верхнего уровня
  - spectrum::ComputeMagnitudesOp          # если нужны амплитуды
related_use_cases:
  - fft_batch_to_magnitudes                # FFT + |X|² на GPU без D2H
  - filter_apply_fir_batch                 # FIR-фильтр на тех же данных
  - antenna_pipeline_full                  # полный pipeline антенны

# ── Метаданные ────────────────────────────────────────────────────
maturity: stable
language: cpp                              # cpp | python | both
tags: [fft, hipfft, batch, antenna, gpu, rocm, beamforming]
ai_generated: false                        # написан человеком
human_verified: true
operator: alex
updated_at: 2026-05-01
---

# Use-case: Прямой FFT для batch-сигнала с антенного массива

## Когда применять

Есть массив антенн (например, 128 элементов), на каждой записан IQ-сигнал
длиной `n_point` сэмплов. Нужно посчитать прямое БПФ независимо для каждой
антенны (batch) на GPU. Результат — комплексный спектр `[beam_count × nFFT]`,
где `nFFT = nextPow2(n_point) × repeat_count`.

## Решение

Класс — `fft_processor::FFTProcessorROCm`, метод `ProcessComplex` (CPU input).

```cpp
#include <spectrum/fft_processor_rocm.hpp>
#include <core/drv_gpu.hpp>

using fft_processor::FFTProcessorROCm;
using fft_processor::FFTProcessorParams;
using fft_processor::FFTOutputMode;

void example() {
    auto gpu = drv_gpu_lib::DrvGPU::CreateROCm(/*gpu_id=*/0);

    FFTProcessorROCm proc(gpu.GetBackend());

    FFTProcessorParams p;
    p.beam_count   = 128;          // антенн в массиве
    p.n_point      = 6000;         // сэмплов на антенну
    p.sample_rate  = 10.0e6f;      // 10 МГц
    p.repeat_count = 1;            // без zero-padding сверх nextPow2
    p.output_mode  = FFTOutputMode::COMPLEX;
    p.memory_limit = 0.80f;        // не больше 80% свободного VRAM

    // data: [128 × 6000] complex<float>, layout = beam-major
    std::vector<std::complex<float>> data(p.beam_count * p.n_point);
    // ... заполнить data ...

    auto results = proc.ProcessComplex(data, p);
    // results.size() == 128
    // results[i].magnitudes.size() == 8192   // nextPow2(6000) = 8192
}
```

## Параметры (из `_RAG_TEST_PARAMS.md`)

| Параметр | Диапазон | Дефолт | Pattern |
|---|---|---|---|
| `beam_count` | 1..50000 | 128 | int |
| `n_point` | 100..1300000 | 6000 | any |
| `sample_rate` | 1..1e9 Hz | 10e6 | float |
| `repeat_count` | 1..16 | 1 | int |

## Граничные случаи

- `n_point == 0` → `std::invalid_argument`
- `beam_count * nFFT * 8 * 4 > VRAM * memory_limit` → `std::runtime_error` (OOM)
- `beam_count > 50000` — физически нереально, никто не тестирует

## Что делать дальше

- Получить **амплитуды** без D2H: `ProcessMagnitudesToGPU` → see `fft_batch_to_magnitudes`
- Применить **окно** (Hann/Hamming/Blackman): передать в `params.window`
- **Несколько GPU**: использовать `DrvGPU::CreateMultiGpu`, см. use-case `multi_gpu_fft`

## Ссылки

- Карточка класса: [test_params/fft_processor_FFTProcessorROCm.md](../test_params/fft_processor_FFTProcessorROCm.md)
- Полный пример: [../../examples/cpp/fft_basic.cpp](../../examples/cpp/fft_basic.cpp)
- Python-эквивалент: [../../examples/python/fft_basic.py](../../examples/python/fft_basic.py)
