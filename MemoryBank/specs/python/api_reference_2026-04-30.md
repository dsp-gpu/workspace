# DSP-GPU Python API Reference (cheatsheet)

**Дата inventory**: 2026-04-30 (Phase A1 миграции)
**Источник**: pybind11 заголовки `{repo}/python/dsp_*_module.cpp` + `py_*.hpp`
**Назначение**: быстрая справка для разработчика — что есть в каждом модуле + сигнатуры

> Один модуль `dsp_<repo>` = один `.so` файл в `DSP/Python/libs/` после `cmake --build` (см. правило `11-python-bindings.md`).

---

## Каждый модуль регистрирует свой ROCmGPUContext

Каждый pybind модуль независим — `ROCmGPUContext` зарегистрирован в **каждом** из 8 модулей (не reuse из dsp_core). Можно использовать любой из них:

```python
import dsp_core as core
import dsp_spectrum as spectrum

ctx1 = core.ROCmGPUContext(0)        # ← или
ctx2 = spectrum.ROCmGPUContext(0)    # ← одно и то же
```

---

## dsp_core (`core/python/dsp_core_module.cpp` + `py_gpu_context.hpp`)

| Class | __init__ | Methods / Properties |
|-------|----------|----------------------|
| `GPUContext` | `(device_index: int = 0)` | `device_name` (ro), `__repr__`, `__enter__`, `__exit__` — **OpenCL** для interop |
| `ROCmGPUContext` | `(device_index: int = 0)` | `device_name`, `device_index` (ro), `__repr__`, ctx-mgr |
| `HybridGPUContext` | `(device_index: int = 0)` | `device_name`, `device_index`, `opencl_device_name`, `rocm_device_name`, `zero_copy_method`, `is_zero_copy_supported` (ro) |

**Module-level functions**: `get_gpu_count() → int`, `list_gpus() → list[dict {index, name, memory_mb}]`

---

## dsp_spectrum (8 классов + CPU FFT функции)

| Class | __init__ | Key methods |
|-------|----------|-------------|
| `ROCmGPUContext` | `(device_index: int = 0)` | как в core (продублирован) |
| `FFTProcessorROCm` | `(ctx: ROCmGPUContext)` | `process_complex(data, sample_rate=...) → np.complex64`, `process_mag_phase(data, sample_rate=...) → (mag, phase)`, `get_profiling()`, `nfft` (ro) |
| `SpectrumMaximaFinderROCm` | `(ctx)` | `process(spectrum, ...) → list`, `find_all_maxima(spectrum, ...)`, `find_all_maxima_from_signal(...)`, `initialized` (ro), `get_params()` |
| `ComplexToMagROCm` | `(ctx)` | `process_magnitude(data) → np.float32` |
| `FirFilter` | `(ctx: GPUContext)` ⚠ **OpenCL** | `load_config(json)`, `set_coefficients(taps)`, `process(signal)`, `num_taps`, `coefficients` (ro) |
| `IirFilter` | `(ctx: GPUContext)` ⚠ **OpenCL** | `load_config`, `set_sections(biquads)`, `process`, `num_sections`, `sections` (ro) |
| `FirFilterROCm` | `(ctx: ROCmGPUContext)` | то же что FirFilter, но ROCm |
| `IirFilterROCm` | `(ctx: ROCmGPUContext)` | то же что IirFilter, но ROCm |
| `MovingAverageFilterROCm` | `(ctx)` | `set_params(...)`, `process(data, ...)`, `is_ready`, `get_window_size`, `get_type` |
| `KalmanFilterROCm` | `(ctx)` | `set_params(...)`, `process(data)`, `is_ready`, `get_params()` |
| `KaufmanFilterROCm` | `(ctx)` | `set_params(...)`, `process(data)`, `is_ready`, `get_params()` |
| `LchFarrow` | `(ctx: GPUContext)` ⚠ **OpenCL** | `set_delays`, `set_sample_rate`, `set_noise`, `load_matrix`, `process(signal)`, `sample_rate`, `delays` (ro) |
| `LchFarrowROCm` | `(ctx: ROCmGPUContext)` | то же что LchFarrow, но ROCm |

**Module-level CPU FFT** (pocketfft): `cpu_fft_c2c(x)`, `cpu_ifft_c2c(X)`, `cpu_fft_r2c(x)`, `cpu_fft_r2c_full(x)`, `magnitude(X, kind="abs"|"abs2")`

---

## dsp_stats

| Class | __init__ | Methods |
|-------|----------|---------|
| `ROCmGPUContext` | `(device_index)` | как в core |
| `BranchThresholds` | `()` | `low_to_mid_db`, `mid_to_high_db`, `hysteresis_db` (rw) |
| `SnrEstimationConfig` | `()` | `target_n_fft`, `step_samples`, `step_antennas`, `guard_bins`, `ref_bins`, `search_full_spectrum`, `with_dechirp`, `thresholds` (rw); `validate() → ValidationResult` |
| `SnrEstimationResult` | `()` | `snr_db_global`, `snr_db_per_antenna`, `used_antennas`, `used_bins`, `actual_step_samples`, `n_actual` (ro) |
| `BranchSelector` | `()` | `select(snr_db) → branch`, `current()`, `reset()` |
| `BranchType` | enum | `Low`, `Mid`, `High` |
| `StatisticsProcessor` | `(ctx: ROCmGPUContext)` | `compute_mean(data)`, `compute_median(data)`, `compute_statistics(data, beam_count)`, `compute_all(data, ...)`, `compute_all_float(data, ...)`, `compute_statistics_float(data, ...)`, `compute_median_float(data)`, `compute_snr_db(spectrum, config) → SnrEstimationResult` |

---

## dsp_signal_generators

| Class | __init__ | Methods |
|-------|----------|---------|
| `ROCmGPUContext` | `(device_index)` | как в core |
| `FormSignalGeneratorROCm` | `(ctx)` | `set_params(...)`, `set_params_from_string(json_str)`, `generate() → np.complex64`, `get_params() → dict`, `antennas`, `points` (ro) |
| `DelayedFormSignalGeneratorROCm` | `(ctx)` | `set_params(...)`, `set_delays(delays_arr)`, `load_matrix(json_path)`, `generate() → np.complex64`, `get_params() → dict`, `antennas`, `points`, `fs`, `delays` (ro) |
| **`LfmAnalyticalDelayROCm`** ⚠ | `(ctx, f_start: float, f_end: float, sample_rate: float)` | `set_sampling(...)`, `set_delays(d)`, `set_params(...)`, `generate_gpu()`, `generate_cpu()`, `get_params() → dict`, `antennas`, `length`, `fs`, `delays` (ro) |

⚠ **Имя класса — `LfmAnalyticalDelayROCm`** (БЕЗ `Generator`). Старое имя `LfmAnalyticalDelayGeneratorROCm` (с `Generator`) — **не существует** в DSP-GPU.

---

## dsp_heterodyne

| Class | __init__ | Methods |
|-------|----------|---------|
| `ROCmGPUContext` | `(device_index)` | как в core |
| `HeterodyneROCm` | `(ctx: ROCmGPUContext)` | `set_params(f_start, f_end, sample_rate, num_samples, num_antennas)`, `dechirp(rx, ref) → np.complex64`, `correct(dc, f_beat_list) → np.complex64`, `params` (ro dict) |

⚠ **`HeterodyneDechirp` НЕ зарегистрирован** (закомментирован `#include "py_heterodyne.hpp"` в `dsp_heterodyne_module.cpp:18-19` — он на legacy OpenCL `GPUContext`). Только `HeterodyneROCm`.

**Канонический паттерн замены legacy `HeterodyneDechirp.process(rx)`** (используется в Phase A2.6):

```python
import dsp_heterodyne as het_mod
import numpy as np

het = het_mod.HeterodyneROCm(ctx)
het.set_params(f_start=0, f_end=2e6, sample_rate=12e6,
               num_samples=8000, num_antennas=5)

# 1. Dechirp на GPU: rx * conj(ref)
dc = het.dechirp(rx, ref)            # complex64 ndarray

# 2. FFT + поиск пика — на CPU своими силами (NumPy)
spec = np.fft.fft(dc.reshape(num_antennas, num_samples), axis=-1)
mag  = np.abs(spec)
peaks = np.argmax(mag, axis=-1)
f_beat_hz = peaks.astype(np.float32) * (sample_rate / num_samples)

# 3. (Опционально) Correct на GPU: exp(j*2pi*f_beat/fs * n)
out = het.correct(dc, list(f_beat_hz))   # complex64 ndarray
```

---

## dsp_linalg

| Class | __init__ | Methods |
|-------|----------|---------|
| `ROCmGPUContext` | `(device_index)` | как в core |
| `CaponParams` | `()` или `(p, n, dir, mu)` | `n_channels`, `n_samples`, `n_directions`, `mu` (rw) |
| `CholeskyInverterROCm` | `(ctx, mode: SymmetrizeMode)` | `invert_cpu(matrix)`, `invert_batch_cpu(matrices)`, `set_symmetrize_mode(mode)`, `get_symmetrize_mode()` |
| `CaponProcessor` | `(ctx)` | `compute_relief(...)`, `adaptive_beamform(...)`, `compute_relief_gpu(...)`, `adaptive_beamform_gpu(...)` |

**Enum**: `dsp_linalg.SymmetrizeMode` — `py::enum_<vector_algebra::SymmetrizeMode>` со значениями `Roundtrip`, `GpuKernel` ([py_vector_algebra_rocm.hpp:139-143](../../../linalg/python/py_vector_algebra_rocm.hpp#L139-L143)). Использование: `dsp_linalg.CholeskyInverterROCm(ctx, dsp_linalg.SymmetrizeMode.GpuKernel)`.

---

## dsp_radar

| Class | __init__ | Methods |
|-------|----------|---------|
| `ROCmGPUContext` | `(device_index)` | как в core |
| `RangeAngleParams` | `()` | `n_ant_az`, `n_ant_el`, `n_samples`, `f_start`, `f_end`, `sample_rate`, `nfft_range`, `carrier_freq`, `antenna_spacing`, `peak_mode`, `n_peaks`, `n_range_bins`, `range_res_m` (rw); `get_n_antennas()`, `get_bandwidth()`, `get_duration()`, `get_chirp_rate()` |
| `TargetInfo` | `()` | `range_m`, `angle_az_deg`, `angle_el_deg`, `range_bin`, `az_bin`, `el_bin`, `power_db`, `snr_db` (rw) |
| `RangeAngleResult` | `()` | (см. py_range_angle_rocm.hpp:223+, поля результата) |
| `RangeAngleProcessor` | `(ctx)` | (см. файл; основной API процессор range-angle map) |
| **`FMCorrelatorROCm`** ⚠ | `(ctx)` | `set_params(...)`, `generate_msequence(...)`, `prepare_reference(ref)`, `prepare_reference_from_data(rx)`, `process(rx) → result`, `run_test_pattern()` |

⚠ **Имя класса — `FMCorrelatorROCm`** (FM **заглавными**). Старое имя `FmCorrelatorROCm` (только F заглавная) — **не существует** в DSP-GPU. Регистр критичен для Python.

---

## dsp_strategies

| Class | __init__ | Methods |
|-------|----------|---------|
| `ROCmGPUContext` | `(device_index)` | как в core |
| `AntennaProcessorTest` | `(ctx, n_ant: uint32, n_samples: uint32, f_start: float, f_end: float, with_diag_capon: bool)` | `step_0_prepare_input`, `step_1_debug_input`, `step_2_gemm`, `step_3_debug_post_gemm`, `step_4_window_fft`, `step_5_debug_post_fft`, `step_6_1_one_max_parabola`, `step_6_2_all_maxima`, `step_6_3_global_minmax`, `process_full(...)`, `set_external_weights(w)`, `step_0_signal_only(...)`, `process_full_managed_w(...)`, `nFFT`, `n_ant`, `n_samples`, `sample_rate` (ro) |

**Module-level**: `m.def("generate_delay_and_sum_weights", ...)` — это **функция** (не класс).

⚠ **`WeightGenerator` НЕ зарегистрирован как класс** — в реальности это module-level function `generate_delay_and_sum_weights()`.

---

*Created: 2026-04-30 (Phase A1 inventory) by Кодо. Источник: фактический grep `py::class_` по всем `{repo}/python/py_*.hpp`.*
