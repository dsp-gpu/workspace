# Legacy GPUWorkLib → DSP-GPU mapping (cheatsheet)

**Дата**: 2026-04-30 (после Phase A миграции и удаления `gpuworklib.py` shim)
**Назначение**: быстрая справка при разборе старого кода — куда переехал каждый класс/функция

---

## Таблица соответствий

| Legacy (`gpuworklib.X`) | Реальный API DSP-GPU | Module | Status |
|-------------------------|----------------------|--------|--------|
| `GPUContext` | `dsp_core.GPUContext` | core | ✅ rename only (OpenCL) |
| `ROCmGPUContext` | `dsp_core.ROCmGPUContext` | core | ✅ rename only |
| `HybridGPUContext` | `dsp_core.HybridGPUContext` | core | ✅ rename only |
| `get_gpu_count()` | `dsp_core.get_gpu_count()` | core | ✅ rename |
| `list_gpus()` | `dsp_core.list_gpus()` | core | ✅ rename |
| `FFTProcessor` (alias) | `dsp_spectrum.FFTProcessorROCm` | spectrum | ✅ rename + suffix ROCm |
| `FFTProcessorROCm` | `dsp_spectrum.FFTProcessorROCm` | spectrum | ✅ rename only |
| `SpectrumMaximaFinderROCm` | `dsp_spectrum.SpectrumMaximaFinderROCm` | spectrum | ✅ rename only |
| `ComplexToMagROCm` | `dsp_spectrum.ComplexToMagROCm` | spectrum | ✅ rename only |
| `FirFilter` / `IirFilter` | `dsp_spectrum.FirFilter` / `IirFilter` | spectrum | ⚠ OpenCL — нужен `GPUContext`, не `ROCmGPUContext` |
| `FirFilterROCm` / `IirFilterROCm` | `dsp_spectrum.{Fir,Iir}FilterROCm` | spectrum | ✅ rename only |
| `LchFarrow` / `LchFarrowROCm` | `dsp_spectrum.LchFarrow` / `LchFarrowROCm` | spectrum | ✅ rename only |
| `StatisticsProcessor` | `dsp_stats.StatisticsProcessor` | stats | ✅ rename only |
| `FormSignalGeneratorROCm` | `dsp_signal_generators.FormSignalGeneratorROCm` | signal_generators | ✅ rename only |
| `DelayedFormSignalGeneratorROCm` | `dsp_signal_generators.DelayedFormSignalGeneratorROCm` | signal_generators | ✅ rename only |
| **`LfmAnalyticalDelayGeneratorROCm`** | **`dsp_signal_generators.LfmAnalyticalDelayROCm`** | signal_generators | 🔴 **rename: убрать `Generator`** |
| `LfmAnalyticalDelayGenerator` (CPU/legacy) | **НЕ ЗАРЕГИСТРИРОВАН** в DSP-GPU | — | 🔴 заменить на `LfmAnalyticalDelayROCm.generate_cpu()` или NumPy fallback |
| **`HeterodyneDechirp`** | **НЕ ЗАРЕГИСТРИРОВАН** в `dsp_heterodyne` | heterodyne | 🔴 **полный rewrite** на `HeterodyneROCm.dechirp/correct + np.fft + argmax` (см. [api_reference_2026-04-30.md](api_reference_2026-04-30.md#dsp_heterodyne) §canonical pattern) |
| `HeterodyneROCm` | `dsp_heterodyne.HeterodyneROCm` | heterodyne | ✅ rename only |
| `CholeskyInverterROCm` | `dsp_linalg.CholeskyInverterROCm` | linalg | ⚠ конструктор требует `SymmetrizeMode` (раньше мог быть default) |
| `CaponProcessor` (если был в shim) | `dsp_linalg.CaponProcessor` | linalg | ✅ rename only |
| **`FmCorrelatorROCm`** | **`dsp_radar.FMCorrelatorROCm`** | radar | 🔴 **rename: `Fm` → `FM` (заглавные)** |
| `RangeAngleProcessor` | `dsp_radar.RangeAngleProcessor` | radar | ✅ rename only |
| `AntennaProcessorTest` | `dsp_strategies.AntennaProcessorTest` | strategies | ⚠ конструктор требует 6 параметров (ctx, n_ant, n_samples, f_start, f_end, with_diag_capon) |
| **`WeightGenerator`** | **НЕ КЛАСС** — module-level `dsp_strategies.generate_delay_and_sum_weights()` | strategies | 🔴 **переписать импорт + вызов** |
| `SignalGenerator` (legacy CW/LFM/Noise) | **НЕ ЗАРЕГИСТРИРОВАН** в DSP-GPU | — | NumPy fallback: `np.exp(1j * 2π * f * t)` или `FormSignalGeneratorROCm` (см. `integration/factories.py`) |
| `ScriptGenerator` (runtime DSL → kernel) | **НЕ ЗАРЕГИСТРИРОВАН** в DSP-GPU | — | Перспектива: [`MemoryBank/.future/TASK_script_dsl_rocm.md`](../../.future/TASK_script_dsl_rocm.md) (hipRTC) |

---

## Шаблон импортов в новом стиле

**Было** (legacy):
```python
import gpuworklib
ctx = gpuworklib.ROCmGPUContext(0)
fft = gpuworklib.FFTProcessor(ctx)        # alias на FFTProcessorROCm
```

**Стало** (DSP-GPU после Phase A 2026-04-30):
```python
from common.gpu_loader import GPULoader
GPULoader.setup_path()  # добавляет DSP/Python/libs/ в sys.path

import dsp_core as core
import dsp_spectrum as spectrum

ctx = core.ROCmGPUContext(0)
fft = spectrum.FFTProcessorROCm(ctx)
```

---

## Критические находки 🔴

После grep тестов 2026-04-30:

**Хорошая новость**: тесты **уже используют правильные имена** для большинства классов:
- `LfmAnalyticalDelayROCm` (без `Generator`) ✅ — никто не использовал legacy `LfmAnalyticalDelayGeneratorROCm`
- `FMCorrelatorROCm` (FM заглавными) ✅ — никто не использовал legacy `FmCorrelatorROCm`
- `WeightGenerator` ✅ — никто не использовал legacy имя

То есть **shim был неточен**, но тесты ходили мимо — поэтому проблем не возникало при миграции.

**Реальные проблемы** (4 класса которых **нет** в DSP-GPU):

| # | Класс legacy | Где встречался | Mitigation |
|---|--------------|----------------|------------|
| 1 | `gpuworklib.HeterodyneDechirp` | `heterodyne/t_*.py` (3 файла, 6 мест) | A2.6: переписали на `HeterodyneROCm.dechirp + np.fft + argmax` |
| 2 | `gpuworklib.SignalGenerator` (CW/LFM/Noise) | `integration/t_*.py` (8 мест), `spectrum/t_ai_fir_demo.py` (1) | NumPy fallback (`np.exp(1j * 2π * f * t)`) или `FormSignalGeneratorROCm` |
| 3 | `gpuworklib.ScriptGenerator` (runtime DSL) | `integration/t_*.py` (2 места — удалены) | `.future/TASK_script_dsl_rocm.md` (hipRTC) |
| 4 | `gpuworklib.FIRFilter` (заглавные FIR) | `spectrum/t_ai_fir_demo.py:279` | TODO-комментарий, не реальный вызов — игнорируем |

---

## NumPy SignalGenerator wrapper (для legacy compat)

После удаления `gpuworklib.SignalGenerator` в `DSP/Python/integration/factories.py` создан wrapper:

```python
from integration.factories import _NumpySignalGenerator as _SignalGenerator

sig = _SignalGenerator()
cw  = sig.generate_cw(freq=1000, fs=44100, length=4096)
lfm = sig.generate_lfm(f_start=200, f_end=1500, fs=8000, length=8192)
noise = sig.generate_noise(fs=8000, length=8192, power=1.0)
```

API совместим со старым `gpuworklib.SignalGenerator.generate_*`.

---

*Created: 2026-04-30 (Phase A1 + grep тестов) by Кодо.*
