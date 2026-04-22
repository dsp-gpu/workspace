---
paths:
  - "**/python/**"
  - "**/*pybind*"
  - "**/dsp_*_module.cpp"
  - "**/DSP/Python/**"
---

# 11 — Python Bindings (pybind11)

> Все значимые C++ модули получают Python API через pybind11.
> CMake-шаблон `python/CMakeLists.txt` → `@MemoryBank/.claude/specs/CMake_Module_Template.md`.

## Политика

### ✅ Требуется Python API

- Генераторы сигналов (CW, LFM, Noise, Script, FormSignal)
- FFT / IFFT процессоры
- Фильтры (FIR, IIR)
- Статистика (mean, std, variance, median, SNR)
- Гетеродин (NCO, MixDown / MixUp, Dechirp)
- Linalg (Capon, SVD, eig)
- Утилиты (поиск максимума, оконные функции)

### ❌ НЕ требуется

- Внутренние helper-функции.
- HIP kernel-код.
- Low-level `DrvGPU` (экспонируется через `GPUContext` facade).
- Внутренняя инфра (`Logger`, `ConsoleOutput`, `ProfilingFacade` — доступны косвенно).

## Размещение

```
{repo}/python/dsp_{repo}_module.cpp    # основной binding
{repo}/python/py_helpers.hpp            # (опц.) конвертеры numpy ↔ C++
```

На выходе: `dsp_{repo}_pyd.cpython-3XX-<platform>.so` (Linux) / `.pyd` (Windows).

## Миграция с legacy

- **Было (GPUWorkLib)**: один большой `.pyd` на весь проект.
- **Стало (DSP-GPU)**: 8+ отдельных `.pyd` — независимо грузятся, легче отлаживать.

## Требования к API

- Принимает/возвращает **`numpy.ndarray`** (не Python list).
- Dtype эксплицитный: `np.complex64`, `np.float32`.
- Параметры именованные (kwargs-friendly).
- Исключения: `DspGpuError` + подклассы.

## Импорт из Python

```python
import dsp_spectrum_pyd as spectrum
import dsp_stats_pyd as stats

ctx = spectrum.GPUContext(gpu_id=0)
fft = spectrum.FFTProcessor(ctx, size=1024, mode=spectrum.MagPhase)
```

## GPULoader (singleton для тестов)

```python
from common.gpu_loader import GPULoader
ctx = GPULoader.get_instance().get_context(gpu_id=0)
```

Один GPU-контекст на процесс, переиспользуется во всех тестах.

## Документация API

- Место: `DSP/Doc/Python/{module}_api.md`
- Формат: Constructor / Methods / Properties.

## Тесты Python API

- Размещение: `DSP/Python/{module}/test_*.py`.
- Запуск — только **прямой вызов** `python3 test_*.py` (см. `04-testing-python.md`).
- Сравнение с эталоном: NumPy / SciPy.
- Графики: `DSP/Results/Plots/{module}/*.png`.
