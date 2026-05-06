<!-- type:build_orchestration repo:dsp_gpu source:CMakeLists.txt -->

# Build Orchestration — DSP-GPU

Граф зависимостей репо построен через `fetch_dsp_*()` вызовы в `<repo>/CMakeLists.txt` (определены в `<repo>/cmake/fetch_deps.cmake`).

## Прямые зависимости (repo → depends_on)

```
core                 → (no dsp deps)
spectrum             → core
stats                → core, spectrum
signal_generators    → core, spectrum
heterodyne           → core, signal_generators, spectrum
linalg               → core
radar                → core, spectrum, stats
strategies           → core, heterodyne, linalg, signal_generators, spectrum, stats
```

## Кто зависит от меня (repo ← dependents)

```
core                 ← heterodyne, linalg, radar, signal_generators, spectrum, stats, strategies
spectrum             ← heterodyne, radar, signal_generators, stats, strategies
stats                ← radar, strategies
signal_generators    ← heterodyne, strategies
heterodyne           ← strategies
linalg               ← strategies
radar                ← (никто)
strategies           ← (никто)
```

## Топологический порядок сборки

Базовый: **core** → (`spectrum`, `signal_generators`, `linalg`) → (`stats`, `heterodyne`) → (`radar`, `strategies`).

## Рекомендации по типовым задачам

### FFT batch на GPU + Python

```
Репо:   core, spectrum
Флаги:  -DDSP_SPECTRUM_BUILD_TESTS=OFF -DDSP_SPECTRUM_BUILD_PYTHON=ON
Сборка: cmake --build . --target DspSpectrum dsp_spectrum_module
```

### Range-angle radar pipeline

```
Репо:   core, spectrum, linalg, radar
Флаги:  -D<REPO>_BUILD_TESTS=OFF -D<REPO>_BUILD_PYTHON=ON
Стек:   ROCm 7.2+, hipFFT, rocBLAS, rocSOLVER
```

### Полный smoke всех модулей

```
Репо:   все 8 + DSP
Флаги:  -D<REPO>_BUILD_TESTS=ON -D<REPO>_BUILD_PYTHON=ON
GPU:    AMD Radeon RX 9070 (gfx1201) или MI100 (gfx908)
```
