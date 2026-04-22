# Шаблон C++ тестов DSP-GPU (для правила 15)

> Вынесенные подробности из `MemoryBank/.claude/rules/15-cpp-testing.md`.
> Сам стиль + правила размещения → `15-cpp-testing.md`.

## Полный шаблон `test_*.hpp`

```cpp
#pragma once
#include <dsp/spectrum/fft_processor.hpp>
#include <core/drv_gpu.hpp>
#include <core/services/console_output.hpp>

class TestFFTProcessor {
public:
    void RunAll() {
        SetUp();
        test_basic_fft();
        test_ifft_roundtrip();
        test_batch_processing();
        TearDown();
    }

private:
    void SetUp() {
        drv_ = drv_gpu_lib::DrvGPU::Create(0);
        ctx_ = std::make_unique<dsp::spectrum::GpuContext>(*drv_);
    }

    void TearDown() {
        ctx_.reset();
        drv_.reset();
    }

    void test_basic_fft() {
        dsp::spectrum::FFTProcessor fft(*ctx_, 1024);
        std::vector<float> input(1024), output(2048);
        fft.Process(input.data(), output.data());
        // сравнение с эталоном (FFTW / NumPy), tol = 1e-5 для float32
    }

    void test_ifft_roundtrip() { /* ... */ }
    void test_batch_processing() { /* ... */ }

    std::unique_ptr<drv_gpu_lib::DrvGPU> drv_;
    std::unique_ptr<dsp::spectrum::GpuContext> ctx_;
};
```

## `all_test.hpp` расширенный

```cpp
#pragma once

// Включены:
#include "test_fft_processor.hpp"
#include "test_spectrum_maxima.hpp"
#include "test_windows.hpp"

// Временно отключены (причина):
// #include "test_lch_farrow.hpp"   // DISABLED: requires RX 9070, MI100 не тянет

inline void RunAllSpectrumTests() {
    TestFFTProcessor().RunAll();
    TestSpectrumMaxima().RunAll();
    TestWindows().RunAll();
}
```

## `main.cpp` модуля

```cpp
#include "all_test.hpp"
#include <core/services/console_output.hpp>

int main() {
    drv_gpu_lib::ConsoleOutput::GetInstance().Start();
    RunAllSpectrumTests();
    drv_gpu_lib::ConsoleOutput::GetInstance().Stop();
    return 0;
}
```

## Главный `src/main.cpp` (корневой)

```cpp
#include "../core/tests/all_test.hpp"
#include "../spectrum/tests/all_test.hpp"
#include "../stats/tests/all_test.hpp"
// ... и так далее для всех 8 модулей

int main() {
    drv_gpu_lib::ConsoleOutput::GetInstance().Start();

    RunAllCoreTests();
    RunAllSpectrumTests();
    RunAllStatsTests();
    // ...

    drv_gpu_lib::ConsoleOutput::GetInstance().Stop();
    return 0;
}
```

## Бенчмарк-класс

```cpp
#pragma once
#include <core/bench/gpu_benchmark_base.hpp>

class FFTBenchmark : public GpuBenchmarkBase {
public:
    void Run(dsp::spectrum::GpuContext& ctx, size_t n_iter = 100) {
        StartProfiling();
        for (size_t i = 0; i < n_iter; ++i) {
            // operation to benchmark
        }
        StopProfiling();
    }
};
```
