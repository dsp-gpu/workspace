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
{repo}/python/dsp_{repo}_module.cpp    # основной binding (PYBIND11_MODULE(dsp_{repo}, m))
{repo}/python/py_*.hpp                 # детальные binding-ы (один py_ файл = один класс)
{repo}/python/py_helpers.hpp           # (опц.) конвертеры numpy ↔ C++
```

На выходе: `dsp_{repo}.cpython-3XX-<platform>.so` (Linux) / `.pyd` (Windows).
**Без суффикса `_pyd`** — `PYBIND11_MODULE(dsp_<repo>, m)` создаёт модуль с именем `dsp_<repo>`.

> ⚠ Часто `dsp_<repo>_module.cpp` только зовёт `register_*(m)` — реальные `py::class_<...>` определены в `py_*.hpp`. При inventory читать ВСЕ `py_*.hpp`.

## Auto-deploy в DSP/Python/libs/ (CMake POST_BUILD)

Каждый `{repo}/python/CMakeLists.txt` имеет блок (Phase A6 2026-04-30):

```cmake
option(DSP_DEPLOY_PYTHON_LIB "Auto-copy .so to DSP/Python/libs/" ON)
set(DSP_PYTHON_LIB_DIR "${CMAKE_CURRENT_LIST_DIR}/../../DSP/Python/libs"
    CACHE PATH "Where to deploy compiled .so for tests")

if(DSP_DEPLOY_PYTHON_LIB)
  add_custom_command(TARGET dsp_<MODULE> PRE_BUILD ...)   # remove stale
  add_custom_command(TARGET dsp_<MODULE> POST_BUILD ...)  # copy after success
endif()
```

После `cmake --build` все 8 `.so` автоматически попадают в `DSP/Python/libs/`. Отключить: `cmake -DDSP_DEPLOY_PYTHON_LIB=OFF`.

## Миграция с legacy

- **Было (GPUWorkLib)**: один большой `.pyd` на весь проект.
- **Стало (DSP-GPU)**: 8+ отдельных `.so` — независимо грузятся, легче отлаживать.
- **Shim `gpuworklib.py`**: удалён в Phase A5 2026-04-30. Все тесты используют прямой `import dsp_<module>`.

## Требования к API

- Принимает/возвращает **`numpy.ndarray`** (не Python list).
- Dtype эксплицитный: `np.complex64`, `np.float32`.
- Параметры именованные (kwargs-friendly).
- Исключения: `DspGpuError` + подклассы.

## Импорт из Python

```python
from common.gpu_loader import GPULoader
GPULoader.setup_path()  # добавляет DSP/Python/libs/ в sys.path

import dsp_core as core
import dsp_spectrum as spectrum
import dsp_stats as stats

ctx = core.ROCmGPUContext(0)
fft = spectrum.FFTProcessorROCm(ctx)
```

## GPULoader API

```python
from common.gpu_loader import GPULoader

# Основной API (после Phase A5 2026-04-30):
ok = GPULoader.setup_path()    # bool: добавляет libs/ в sys.path, ищет dsp_core.so
path = GPULoader.loaded_from() # str | None: где найден dsp_core
GPULoader.reset()              # сброс синглтона (для тестирования GPULoader)

# DEPRECATED после Phase A5 (gpuworklib shim удалён):
gw = GPULoader.get()           # ВСЕГДА None — НЕ использовать
ok = GPULoader.is_available()  # = setup_path() — для совместимости
```

## Документация API

- Место: `DSP/Doc/Python/{module}_api.md`
- Формат: Constructor / Methods / Properties.

## Тесты Python API

- Размещение: `DSP/Python/{module}/t_*.py` (с 2026-04-29: префикс `t_`, не `test_`)
- Запуск — только **прямой вызов** `python3 t_*.py` (см. `04-testing-python.md`).
- Сравнение с эталоном: NumPy / SciPy.
- Графики: `DSP/Results/Plots/{module}/*.png`.
- Data-файлы: `DSP/Python/{module}/data/`.
