# План миграции Python тестов на DSP-GPU API

**Дата**: 2026-04-29 · **Обновлён**: 2026-04-30 (правки по [migration_plan_review_2026-04-30.md](migration_plan_review_2026-04-30.md))
**Автор**: Кодо
**Платформа**: Debian Linux + ROCm 7.2+ (Windows только для редактирования, тесты НЕ запускаются)
**Контекст**: после первой волны (60 переименований + 3 миграции в `spectrum/`) + ревью + Phase A0 (preflight) выполнен 2026-04-30
**Связанные документы**: [`pytest_audit_2026-04-29.md`](pytest_audit_2026-04-29.md), [`migration_plan_review_2026-04-30.md`](migration_plan_review_2026-04-30.md)

---

## ✅ Статус согласования (всё утверждено)

| # | Тема | Решение |
|---|------|---------|
| 1 | API breaking changes | **B для известных** (переписывать на новый API), **A для прочих** (`SkipTest` + TODO-комментарий) |
| 2 | Порядок работы | ~~Одна волна (~5 ч)~~ → **Две сессии (~10 ч)** по ревью §5: A0+A1+A2.1-A2.4, потом A2.5-A5+commit |
| 3 | Тесты с проблемным API | Исправлять если возможно. Если нельзя без живого GPU — `TODO: rewrite for new API on Debian session 2026-05-03+` + `raise SkipTest(...)` |
| Q1 | CMake — где helper | **B**: дубль 5-7 строк в 8 файлах (автономно, надёжно, масштабируется при росте числа репо) |
| Q2 | CMake — путь к `libs/` | **B**: CACHE переменная, путь `${CMAKE_CURRENT_LIST_DIR}/../../DSP/Python/libs` (✏ ревью B4: `CMAKE_SOURCE_DIR` ломкий при супер-проекте) |
| Q3 | CMake — опция включения | **Да**: `option(DSP_DEPLOY_PYTHON_LIB "..." ON)` (на сервере можно отключить) |
| Q4 | Порядок CMake vs миграция | Миграция Python (Phase A) → потом CMake (Phase B) |
| Доп.1 | Имя папки | **`DSP/Python/libs/`** (не `lib/`) — ✅ переименовано в Phase A0 (2026-04-30) |
| Доп.2 | Папка должна пушиться | ✅ `.gitkeep` создан в Phase A0 (2026-04-30) |
| Доп.3 | Тесты на Windows | НЕ запускаем — только редактирование. Реальный запуск на работе через 4 дня |
| **R-B2** | **`gpuworklib.py` shim** | **Удалить** после Phase A4 (фаза A5 Cleanup). Это рудимент GPUWorkLib, в DSP-GPU не нужен |
| **R-B3** | **Heterodyne** | **Переписать** 4 файла на `HeterodyneROCm.dechirp/correct + np.fft + argmax` (см. §A2.6). SkipTest только как «pending Debian validation» |
| **R-B5** | **Sub-репо `python/t_*.py`** | Отдельный шаблон импорта (фаза A2.8). `dirname(dirname(...))` → корень репо, `common/` живёт в `DSP/Python/` соседнего репо |

---

## 🎯 Цель

Привести **все** Python тесты `t_*.py` в DSP-GPU к новой архитектуре:
- Импорты через `dsp_*` модули (правило [11-python-bindings](../../../.claude/rules/11-python-bindings.md))
- `sys.exit(1)` → `raise SkipTest(...)` (правило [04-testing-python](../../../.claude/rules/04-testing-python.md))
- Загрузка модулей через `GPULoader.setup_path()` → `DSP/Python/libs/` или `build/python/`
- Минимум правок — top-level `def test_*()` структура **сохраняется** как в legacy

---

## 📊 Состояние (на 2026-04-30, после Phase A0)

| Показатель | Значение |
|-----------|----------|
| Всего `t_*.py` в проекте | **54** |
| Уже мигрировано (сессия 2026-04-29) | **3** (spectrum: `t_lch_farrow`, `t_lch_farrow_rocm`, `t_spectrum_find_all_maxima_rocm`) |
| Остаётся мигрировать | **~51** |
| С `import gpuworklib` | 38 файлов |
| С `sys.exit(1)` (как замена SkipTest) | 15 файлов |
| Обе проблемы (пересечение) | ~12 файлов |
| `DSP/Python/libs/` | ✅ есть, `.gitkeep` создан (Phase A0) |
| `gpu_loader.py` ищет `libs/` | ✅ обновлён (Phase A0) |
| `DSP/Python/gpuworklib.py` (shim) | существует, удалить в Phase A5 |

---

## 🔧 Шаблон правок (минимум, как в spectrum/)

Для каждого файла — **5 точечных правок**:

### A) Замена импортов

**Было** (legacy GPUWorkLib):
```python
import sys, os
# ... ручное добавление в sys.path:
for p in BUILD_PATHS:
    if os.path.isdir(p):
        sys.path.insert(0, os.path.abspath(p))
        break

try:
    import gpuworklib
except ImportError:
    print("ERROR: gpuworklib not found...")
    sys.exit(1)
```

**Станет** (для тестов в `DSP/Python/<module>/t_*.py` — основной случай):
```python
import sys
import os

# DSP/Python/<module>/t_X.py → подняться 1 раз → DSP/Python/
_PT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PT_DIR not in sys.path:
    sys.path.insert(0, _PT_DIR)

from common.runner import TestRunner, SkipTest
from common.gpu_loader import GPULoader

GPULoader.setup_path()  # добавляет DSP/Python/libs/ (или build/python) в sys.path

try:
    import dsp_core as core
    import dsp_<module> as <alias>
    HAS_GPU = True
except ImportError:
    HAS_GPU = False
    core = None      # type: ignore
    <alias> = None   # type: ignore
```

**Альтернатива для sub-репо** `{repo}/python/t_*.py` (4 файла, см. §10) — другая структура путей:

```python
import sys
import os

# {repo}/python/t_X.py → корень репо → его sibling DSP/ → DSP/Python/
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DSP_PYTHON = os.path.join(os.path.dirname(_REPO_ROOT), "DSP", "Python")
if _DSP_PYTHON not in sys.path:
    sys.path.insert(0, _DSP_PYTHON)

from common.runner import TestRunner, SkipTest
from common.gpu_loader import GPULoader
GPULoader.setup_path()
# далее как обычно: try/except import dsp_core / dsp_<module>
```

**Альтернатива для тестов глубже** (`DSP/Python/common/io/t_smoke.py` — 3 уровня) — `dirname(dirname(dirname(__file__)))`. Проверять руками для каждой группы.

### B) Замена обращений к классам (через `Edit replace_all=true`)

| Старое | Новое |
|--------|-------|
| `gpuworklib.ROCmGPUContext(0)` | `core.ROCmGPUContext(0)` |
| `gpuworklib.LchFarrowROCm(ctx)` | `spectrum.LchFarrowROCm(ctx)` |
| `gpuworklib.<X>` для модуля Y | `<alias_Y>.X` |

### C) Guards в начале каждого теста

В legacy НЕТ class — нет `setUp()`. Используем helper-функцию + guard в каждой `def test_*()`:

```python
def _require_gpu():
    """Helper: единая точка проверки GPU/модулей. Не плодим строку 8 раз."""
    if not HAS_GPU:
        raise SkipTest("dsp_core/dsp_<module> not found — check build/libs")

def test_xxx():
    _require_gpu()
    # ... остальное как было
```

### D) Удаление `sys.exit(1)` блоков

Все блоки `if not gpuworklib: print(ERROR); sys.exit(1)` — удаляются (заменены try/except + флаг `HAS_GPU` + SkipTest).

### E) Data-файлы (json/csv/npy)

Если тест ссылается на `<repo>/modules/<X>/<file>.json` или подобное:
1. Найти реальное место в DSP-GPU (обычно `<repo_name>/src/<X>/`)
2. Скопировать в `DSP/Python/<module>/data/<file>.json`
3. Заменить `MATRIX_PATH` на `os.path.join(os.path.dirname(__file__), 'data', '<file>.json')`

(Сделано для `lagrange_matrix_48x5.json` в spectrum/.)

---

## 📁 Файлы по модулям (51 файл)

### 1. `DSP/Python/stats/` — 4 файла

| Файл | Импорты `dsp_*` |
|------|-----------------|
| `t_compute_all.py` | `dsp_core` + `dsp_stats` |
| `t_snr_estimator.py` | `dsp_core` + `dsp_stats` |
| `t_statistics_float_rocm.py` | `dsp_core` + `dsp_stats` |
| `t_statistics_rocm.py` | `dsp_core` + `dsp_stats` |

### 2. `DSP/Python/signal_generators/` — 4 файла

| Файл | Импорты `dsp_*` |
|------|-----------------|
| `t_delayed_form_signal.py` | `dsp_core` + `dsp_signal_generators` |
| `t_form_signal.py` | `dsp_core` + `dsp_signal_generators` |
| `t_form_signal_rocm.py` | `dsp_core` + `dsp_signal_generators` |
| `t_lfm_analytical_delay.py` | `dsp_core` + `dsp_signal_generators` |

### 3. `DSP/Python/heterodyne/` — 4 файла ⚠️ API изменён

| Файл | Импорты `dsp_*` | Замечание |
|------|-----------------|-----------|
| `t_heterodyne.py` | `dsp_core` + `dsp_heterodyne` | использует `HeterodyneDechirp` → переписать на `HeterodyneROCm.dechirp/correct` |
| `t_heterodyne_comparison.py` | то же | то же |
| `t_heterodyne_rocm.py` | то же | то же |
| `t_heterodyne_step_by_step.py` | то же | то же |

### 4. `DSP/Python/linalg/` — 3 файла

| Файл | Импорты `dsp_*` |
|------|-----------------|
| `t_capon.py` | `dsp_core` + `dsp_linalg` |
| `t_cholesky_inverter_rocm.py` | `dsp_core` + `dsp_linalg` |
| `t_matrix_csv_comparison.py` | `dsp_core` + `dsp_linalg` |

### 5. `DSP/Python/radar/` — 3 файла

| Файл | Импорты `dsp_*` |
|------|-----------------|
| `t_fm_correlator.py` | `dsp_core` + `dsp_radar` |
| `t_fm_correlator_rocm.py` | `dsp_core` + `dsp_radar` |
| `t_range_angle.py` | `dsp_core` + `dsp_radar` |

### 6. `DSP/Python/spectrum/` (оставшиеся) — 11 файлов

| Файл | Импорты `dsp_*` |
|------|-----------------|
| `t_ai_filter_pipeline.py` | `dsp_core` + `dsp_spectrum` |
| `t_ai_fir_demo.py` | `dsp_core` + `dsp_spectrum` |
| `t_filters_stage1.py` | `dsp_core` + `dsp_spectrum` |
| `t_fir_filter_rocm.py` | `dsp_core` + `dsp_spectrum` |
| `t_iir_filter_rocm.py` | `dsp_core` + `dsp_spectrum` |
| `t_iir_plot.py` | `dsp_core` + `dsp_spectrum` |
| `t_kalman_rocm.py` | `dsp_core` + `dsp_spectrum` |
| `t_kaufman_rocm.py` | `dsp_core` + `dsp_spectrum` |
| `t_moving_average_rocm.py` | `dsp_core` + `dsp_spectrum` |
| `t_process_magnitude_rocm.py` | `dsp_core` + `dsp_spectrum` |
| `t_spectrum_maxima_finder_rocm.py` | `dsp_core` + `dsp_spectrum` |
| `ai_pipeline/t_ai_pipeline.py` | `dsp_core` + `dsp_spectrum` |

### 7. `DSP/Python/strategies/` — 2 файла (с `gpuworklib`)

| Файл | Импорты `dsp_*` |
|------|-----------------|
| `t_strategies_pipeline.py` | `dsp_core` + `dsp_strategies` |
| `t_strategies_step_by_step.py` | `dsp_core` + `dsp_strategies` |

> Прочие в `strategies/` (`t_base_pipeline.py`, `t_debug_steps.py`, `t_farrow_pipeline.py`, `t_params.py`, `t_scenario_builder.py`, `t_timing_analysis.py`) — пока без `gpuworklib`, проверю при работе с модулем.

### 8. `DSP/Python/integration/` — 5 файлов

| Файл | Импорты `dsp_*` | Замечание |
|------|-----------------|-----------|
| `t_fft_integration.py` | `dsp_core` + `dsp_spectrum` (+ `dsp_signal_generators`?) | пайплайн |
| `t_gpuworklib.py` | `dsp_core` + почти все | **имя файла содержит `gpuworklib`** — рассмотреть переименование (`t_e2e.py`?) |
| `t_hybrid_backend.py` | `dsp_core` (HybridGPUContext) | `sys.exit` |
| `t_signal_gen_integration.py` | `dsp_core` + `dsp_signal_generators` | пайплайн |
| `t_zero_copy.py` | `dsp_core` (HybridGPUContext) | `sys.exit` |

### 9. `DSP/Python/common/` — 4 файла (без `gpuworklib`, но с `sys.exit`)

| Файл | Что делает |
|------|-----------|
| `common/io/t_smoke.py` | smoke-тест I/O утилит |
| `common/plotting/t_smoke.py` | smoke-тест plotters |
| `common/validators/t_smoke.py` | smoke-тест validators |
| `common/references/t_references_smoke.py` | smoke-тест reference-функций |

> Эти тесты **не используют GPU** — только Python инфраструктуру. `sys.exit(1)` → `raise SkipTest(...)` если зависимости (matplotlib?) недоступны.

### 10. Sub-репо `python/t_*.py` — 4 файла

| Файл | Репо | Импорты `dsp_*` |
|------|------|-----------------|
| `linalg/python/t_linalg.py` | `linalg` | `dsp_core` + `dsp_linalg` |
| `radar/python/t_radar.py` | `radar` | `dsp_core` + `dsp_radar` |
| `spectrum/python/t_cpu_fft.py` | `spectrum` | `dsp_core` + `dsp_spectrum` |
| `strategies/python/t_strategies.py` | `strategies` | `dsp_core` + `dsp_strategies` |

> Standalone тесты в каждом репо.

---

## ⚠️ Известные API breaking changes

Найдены при миграции 3 файлов в spectrum/ + ревью `dsp_heterodyne_module.cpp`:

| Старое API (legacy) | Новое API (DSP-GPU) | Затрагивает |
|---------------------|---------------------|-------------|
| `gpuworklib.HeterodyneDechirp(ctx).process(rx)` → `dict {success, antennas[].f_beat_hz}` | `dsp_heterodyne.HeterodyneROCm` + раздельные `dechirp/correct` + **CPU-FFT/argmax своими силами** | 4 файла в `heterodyne/` + `integration/t_fft_integration.py` |
| `gpuworklib.SignalGenerator(ctx).generate_lfm(...)` | NumPy `np.exp(1j * phase)` или `LfmAnalyticalDelayROCm` | возможно в `integration/`, `radar/` |

> ⚠️ **`HeterodyneDechirp` НЕ экспортируется в `dsp_heterodyne`** — `dsp_heterodyne_module.cpp:18-19` имеет `#include "py_heterodyne.hpp"` **закомментирован** (там legacy OpenCL `GPUContext` от nvidia-ветки). В ROCm-сборке доступен **только** `HeterodyneROCm`. Shim `gpuworklib.py:85` падает на `from dsp_heterodyne import HeterodyneDechirp` (под `try/except`, не виден).

### Канонический паттерн замены `HeterodyneDechirp.process()` (см. [py_heterodyne_rocm.hpp:39-55](../../../heterodyne/python/py_heterodyne_rocm.hpp#L39-L55))

```python
import dsp_heterodyne as het_mod
import numpy as np

het = het_mod.HeterodyneROCm(ctx)
het.set_params(f_start=0.0, f_end=2e6, sample_rate=12e6,
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

Затраты: ~1 ч на 4 файла `heterodyne/t_*.py` (паттерн один). На Windows **API стабилен** — пишем без запуска. Запуск/корректность — на Debian 2026-05-03+.

---

## 📖 API Reference (Phase A1, выполнено 2026-04-30)

> **Вынесено в отдельный файл** для discoverability:
> 👉 [`api_reference_2026-04-30.md`](api_reference_2026-04-30.md) — все 30 классов 8 модулей, методы, properties, enums.

### dsp_core (краткая выжимка)

| Class | __init__ | Methods / Properties |
|-------|----------|----------------------|
| `GPUContext` | `(device_index: int = 0)` | `device_name` (ro), `__repr__`, `__enter__`, `__exit__` — **OpenCL** для interop |
| `ROCmGPUContext` | `(device_index: int = 0)` | `device_name`, `device_index` (ro), `__repr__`, ctx-mgr |
| `HybridGPUContext` | `(device_index: int = 0)` | `device_name`, `device_index`, `opencl_device_name`, `rocm_device_name`, `zero_copy_method`, `is_zero_copy_supported` (ro) |

**Module-level functions**: `get_gpu_count() → int`, `list_gpus() → list[dict {index, name, memory_mb}]`

---

## 🔁 Legacy → DSP-GPU mapping

> **Вынесено** → [`legacy_to_dsp_gpu_mapping_2026-04-30.md`](legacy_to_dsp_gpu_mapping_2026-04-30.md): все 25+ mappings + критические находки + NumPy SignalGenerator wrapper.

---

## 📅 Фазы работы

### Phase A — Миграция Python тестов (~10 ч, две сессии)

#### A0. Preflight (~5 мин) — ✅ ВЫПОЛНЕНО 2026-04-30

- ✅ `DSP/Python/libs/.gitkeep` создан
- ✅ `gpu_loader.py:51` `lib` → `libs` + docstring обновлены
- ✅ `gpuworklib.py` error message обновлён под `libs/` + `DSP_LIB_DIR`
- ✅ Grep подтвердил: импорта `from t_gpuworklib import` нет; только 2 комментария в `integration/t_*.py`

#### A1. Inventory API (~1.5-2 ч)

Прочитать pybind binding каждого репо, составить таблицу «Класс → правильное имя в DSP-GPU + методы»:

| Репо | Pybind file | Что зарегистрировано |
|------|-------------|----------------------|
| core | `core/python/dsp_core_module.cpp` | GPUContext, ROCmGPUContext, HybridGPUContext, ... |
| spectrum | `spectrum/python/dsp_spectrum_module.cpp` | ✅ известно (LchFarrowROCm, FFTProcessorROCm, FirFilterROCm, IirFilterROCm, SpectrumMaximaFinderROCm, ComplexToMagROCm) |
| stats | `stats/python/dsp_stats_module.cpp` | StatisticsProcessor (?) |
| signal_generators | `signal_generators/python/dsp_signal_generators_module.cpp` | LfmAnalyticalDelayROCm ✅, FormSignalGeneratorROCm, DelayedFormSignalGeneratorROCm |
| heterodyne | `heterodyne/python/dsp_heterodyne_module.cpp` | ✅ HeterodyneROCm (НЕ Dechirp) |
| linalg | `linalg/python/dsp_linalg_module.cpp` | CholeskyInverterROCm (?), CaponProcessor (?) |
| radar | `radar/python/dsp_radar_module.cpp` | FmCorrelatorROCm (?), RangeAngleProcessor (?) |
| strategies | `strategies/python/dsp_strategies_module.cpp` | AntennaProcessorTest, WeightGenerator (?) |

**Результат A1**: добавить раздел «API Reference» в этот файл.

#### A2. Migration files (~6-8 ч) — порядок «быстрые победы → сложное»

Сессия 1 (~5 ч):
1. **A2.1 signal_generators** (4 файла) — `LfmAnalyticalDelayROCm` уже знаем, паттерн самый простой.
2. **A2.2 spectrum** оставшиеся (11+1 файлов) — есть 3 готовых эталона из этой же сессии (`t_lch_farrow*`).
3. **A2.3 stats** (4 файла) — небольшая группа, после A1 inventory.

Сессия 2 (~5 ч):
4. **A2.4 linalg** (3 файла) — Cholesky/Capon.
5. **A2.5 radar** (3 файла) — FmCorrelator/RangeAngle.
6. **A2.6 heterodyne** (4 файла) — ⚠️ переписать на `HeterodyneROCm.dechirp/correct + FFT/argmax` по канон. паттерну (см. §«API breaking changes»). + `SkipTest("pending Debian validation")` в начале каждого теста.
7. **A2.7 strategies** (2), **integration** (5), **common** (4 smoke).
8. **A2.8 sub-репо** `{repo}/python/t_*.py` (4) — **другой шаблон импорта** (см. §«Шаблон A»). Перед миграцией — `diff` каждого против `DSP/Python/<module>/` (дубль или дополнение?).

#### A3. Verify (~30 мин)

```bash
# Нет import gpuworklib в t_*.py
grep -lrn "import gpuworklib\|from gpuworklib" --include='t_*.py' \
  --exclude-dir='.git' --exclude-dir='.claude' E:/DSP-GPU
# Ожидание: пусто (включая sub-репо; shim DSP/Python/gpuworklib.py пока на месте — удалится в A5)

# sys.exit как замена SkipTest (только non-zero exits) — оставшиеся вычистить
grep -rn "sys\.exit" --include='t_*.py' E:/DSP-GPU | grep -v "sys\.exit(0)"
# Ожидание: пусто

# Все 10 репо чистые / понятные
for repo in workspace core spectrum stats signal_generators heterodyne linalg radar strategies DSP; do
  echo "== $repo =="
  git -C "$repo" status --short
done
```

#### A4. Commit (~30 мин, БЕЗ push)

6 репо имеют изменения (workspace, spectrum, linalg, radar, strategies, DSP). Коммитим **локально** по одному репо. **Push не делаем** на этом шаге — это будет общий push после A5 Cleanup.

Сообщения коммитов по образцу:
```
python: migrate t_*.py to dsp_<module> imports + GPULoader.setup_path
```

#### A5. Cleanup (~20 мин) — выпиливание shim

После A3 (зеро `import gpuworklib`) shim становится мёртвым кодом:

1. Удалить `DSP/Python/gpuworklib.py`.
2. В `DSP/Python/common/gpu_loader.py`:
   - Удалить метод `_load_gpuworklib()` (строки ~159-169).
   - Удалить вызовы `cls._load_gpuworklib()` в `_try_load()` (4 места).
   - Удалить поле `_gpuworklib`, метод `get()`, метод `is_available()` (если больше нигде не используется — сначала grep).
   - Оставить только: `setup_path()`, `loaded_from()`, `reset()`.
3. Обновить docstring модуля — убрать «Legacy» секцию.
4. Verify: `grep -rn "gpuworklib" DSP/Python/` → пусто.
5. Коммит: `python: remove gpuworklib shim (no longer used after migration)`.

После A5 — **общий push** по правилу [16-github-sync](../../../.claude/rules/16-github-sync.md) (с переспросом). Затронуто 6 репо.

---

### Phase B — CMake механизм автокопирования (на работе через 4 дня)

> **Делается на Debian/работе** (есть рабочая сборка для проверки). На Windows только подготовка кода.

#### B1. Переименование `lib` → `libs` — ✅ ВЫПОЛНЕНО в Phase A0 (2026-04-30)

| Что | Статус |
|-----|--------|
| Создать пустую папку `DSP/Python/libs/` | ✅ существовала до A0 |
| Добавить `.gitkeep` | ✅ A0 |
| Удалить старую `lib/` | ✅ её уже не было |
| Обновить `gpu_loader.py` | ✅ A0 (строка 51 + docstring + Usage) |
| Обновить документацию `gpuworklib.py` | ✅ A0 (error message) |

#### B2. CMake механизм автокопирования (на работе) — ✏ исправлено B4

В каждом из 8 файлов `{repo}/python/CMakeLists.txt` добавить блок (5-7 строк):

```cmake
# ── Auto-deploy to DSP/Python/libs/ ─────────────────────────────────
# Опция определена в 8 файлах (Q1=B, автономность модуля);
# первое определение создаёт CACHE-переменную, остальные — no-op.
option(DSP_DEPLOY_PYTHON_LIB "Auto-copy .so to DSP/Python/libs/" ON)

# Путь от {repo}/python/CMakeLists.txt → корень репо → sibling DSP/Python/libs/
# (НЕ ${CMAKE_SOURCE_DIR} — он ломкий при супер-проекте, см. ревью B4)
set(DSP_PYTHON_LIB_DIR "${CMAKE_CURRENT_LIST_DIR}/../../DSP/Python/libs"
    CACHE PATH "Where to deploy compiled .so for tests")

if(DSP_DEPLOY_PYTHON_LIB)
  # PRE_BUILD: удалить старую версию (даже если сборка упадёт — не будет stale)
  add_custom_command(TARGET dsp_<module> PRE_BUILD
    COMMAND ${CMAKE_COMMAND} -E rm -f
      "${DSP_PYTHON_LIB_DIR}/$<TARGET_FILE_NAME:dsp_<module>>"
    COMMENT "Remove stale dsp_<module> from DSP/Python/libs/")

  # POST_BUILD: скопировать новую (только при успешной сборке)
  add_custom_command(TARGET dsp_<module> POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory "${DSP_PYTHON_LIB_DIR}"
    COMMAND ${CMAKE_COMMAND} -E copy
      "$<TARGET_FILE:dsp_<module>>" "${DSP_PYTHON_LIB_DIR}/"
    COMMENT "Deploy dsp_<module> to DSP/Python/libs/")
endif()
```

**Поведение:**
- ✅ Сборка успех → новая `.so` в `DSP/Python/libs/`
- ✅ Сборка упала → `libs/` пустая → тесты упадут с ImportError → разработчик сразу видит проблему
- ✅ На сервере можно отключить: `cmake -DDSP_DEPLOY_PYTHON_LIB=OFF ..`
- ✅ Только Linux (`.so`) — `$<TARGET_FILE_NAME:...>` корректно подставит расширение
- ✅ Все пути относительные (`../DSP/Python/libs` от каждого репо)

**Затрагиваемые файлы (8):**
- `core/python/CMakeLists.txt`
- `spectrum/python/CMakeLists.txt`
- `stats/python/CMakeLists.txt`
- `signal_generators/python/CMakeLists.txt`
- `heterodyne/python/CMakeLists.txt`
- `linalg/python/CMakeLists.txt`
- `radar/python/CMakeLists.txt`
- `strategies/python/CMakeLists.txt`

**Масштабируемость**: при добавлении нового репо — копируешь те же 7 строк в его `python/CMakeLists.txt`. Дубль кода (вариант B) выбран ради автономности — каждый репо самодостаточен.

#### B3. Проверка на работе (Debian/ROCm)

```bash
# 1. Чистая сборка
cmake --preset debian-local-dev
cmake --build --preset debian-release -j$(nproc)

# 2. Проверка что .so появились в libs/
ls DSP/Python/libs/
# Ожидание: dsp_core.cpython-XX.so, dsp_spectrum.*.so, ... (8 шт.)

# 3. Запуск тестов
python3 DSP/Python/spectrum/t_lch_farrow.py
python3 DSP/Python/stats/t_compute_all.py
# ...
```

---

## 🚫 Что НЕ делаем

- ❌ Не плодим `class TestX:` — top-level `def test_*()` остаются как в legacy
- ❌ Не создаём `factories.py` для тестов
- ❌ Не используем pytest / conftest / декораторы
- ❌ Не мигрируем тесты которых нет в legacy `E:/C++/GPUWorkLib`
- ❌ Не трогаем pybind / CMake / C++ **на этой Windows машине** — только подготовка кода
- ❌ Не запускаем тесты на Windows (нет ROCm)
- ❌ Не делаем «улучшения» — только то что прямо нужно

---

## ⚠️ Риски

| Риск | Митигация |
|------|-----------|
| Класс убран в новом API (как `HeterodyneDechirp`) | `raise SkipTest("API removed; rewrite to <new_API>")` + TODO в docstring |
| Class есть, но методы переименованы | Прочитать pybind hpp, поправить точечно |
| Data-файл (json/csv/npy) пропущен | Перед миграцией — поиск ссылок на data, сверка с `E:/C++/GPUWorkLib/Python_test/<module>/data/` |
| Сломанные импорты `from t_X import Y` | После каждого модуля — `grep "from t_"` |
| Изменился порядок параметров в pybind | Сверка с pybind hpp перед заменами |
| `lib` ↔ `libs` несовместимость | Обновить **одновременно**: имя папки + `gpu_loader.py` + CMake-патч |

---

## ⏱️ Оценка времени (после ревью)

| Phase | Время | Где | Статус |
|-------|-------|-----|--------|
| A0. Preflight (libs/.gitkeep, gpu_loader.py) | ~5 мин | Windows | ✅ DONE 2026-04-30 |
| A1. Inventory API | ~1.5-2 ч | Windows | pending |
| A2. Migration files (8 групп) | ~6-8 ч | Windows | pending |
| A3. Verify | ~30 мин | Windows | pending |
| A4. Commit (без push) | ~30 мин | Windows | pending |
| A5. Cleanup (выпил shim) + push | ~20 мин + переспрос | Windows | pending |
| **Итого Phase A** | **~10 ч** | Две сессии | |
| B1. (rename libs) | ~10 мин | — | ✅ объединено с A0 |
| B2. CMake патч × 8 файлов | ~15 мин | Debian (работа) | через 4 дня |
| B3. Проверка на Debian | ~15-30 мин | Debian (работа) | через 4 дня |
| **Итого Phase B** | **~30 мин** | На работе | |

**Итого**: ~10 ч на Windows (две сессии) + ~30 мин на работе.

---

## 📋 План действий на работу (через 4 дня)

> Отдельный task-файл будет создан после старта миграции — `MemoryBank/tasks/TASK_python_migration_debian_2026-05-03.md`

**Что делать на Debian после `git pull`:**

1. **Сборка**:
   ```bash
   cmake --preset debian-local-dev
   cmake --build --preset debian-release -j$(nproc)
   ```

2. **Проверка `libs/`**:
   ```bash
   ls DSP/Python/libs/  # должно быть 8 .so файлов
   ```

3. **Запуск тестов поочерёдно** (по модулям, для отладки):
   ```bash
   python3 DSP/Python/stats/t_compute_all.py
   python3 DSP/Python/spectrum/t_lch_farrow.py
   # ... и т.д.
   ```

4. **Если падает по API** — посмотреть TODO-комментарии в docstring тестов (там список «надо переписать» + указание класса/метода).

5. **CMake механизм** (если ещё не применён):
   - Применить патч из Phase B2 в каждый из 8 `python/CMakeLists.txt`
   - Пересобрать
   - Проверить что `libs/` обновляется при сборке

6. **При успехе** — полный прогон всех тестов, ревью результатов.

---

## 🎯 Критерии готовности

После завершения **Phase A** (миграция Python):

- [ ] 0 файлов `t_*.py` с `import gpuworklib` (sub-репо включая)
- [ ] 0 файлов `t_*.py` где `sys.exit` используется как замена `SkipTest` (т.е. при отсутствии GPU/модуля). `sys.exit(0)` для legitimate exit разрешён.
- [ ] Все ~51 файлов используют `import dsp_<module> as <alias>` через `GPULoader.setup_path()`
- [ ] Все `def test_*()` начинаются с `_require_gpu()` (или эквивалентного guard)
- [ ] Data-файлы перенесены в `DSP/Python/<module>/data/`
- [ ] `git status` всех 10 репо чистый
- [ ] `DSP/Python/gpuworklib.py` **удалён** (Phase A5)
- [ ] `DSP/Python/common/gpu_loader.py` — выпилен `_load_gpuworklib()` и legacy-методы (Phase A5)
- [ ] `grep -rn "gpuworklib" DSP/Python/` → пусто
- [x] `DSP/Python/libs/` создана + `.gitkeep` (Phase A0 ✅)
- [x] `gpu_loader.py` обновлён (`lib` → `libs`) (Phase A0 ✅)
- [ ] Все 6 затронутых репо запушены (workspace + 5 sub) — после A5
- [ ] `pytest_audit_2026-04-29.md` обновлён с финальной сводкой

После завершения **Phase B** (на работе):

- [ ] CMake-патч применён в 8 `python/CMakeLists.txt` (с `${CMAKE_CURRENT_LIST_DIR}/../../DSP/Python/libs`)
- [ ] `cmake --build` собирает все 8 `dsp_*.so` в `DSP/Python/libs/`
- [ ] Все ~51 t_*.py запускаются (или явно SKIP с TODO «pending Debian validation» для heterodyne — снимется после первого успешного прогона на gfx1201)

**После Phase B** — отдельный мини-TASK:
- [ ] Обновить `.claude/rules/04-testing-python.md`: `test_*` → `t_*`, top-level `def`
- [ ] Обновить `.claude/rules/11-python-bindings.md`: убрать суффикс `_pyd` из примеров

---

## 🚀 Старт работы

После финального OK Alex'а:

0. ✅ **Phase A0** (Preflight) — DONE 2026-04-30 (libs/.gitkeep + gpu_loader.py + gpuworklib.py docstring)
1. **Phase A1** (Inventory API) — читаю 8 pybind binding, собираю таблицу «класс → методы»
2. **Phase A2** (Migration) — 8 групп по плану A2.1-A2.8 (signal_generators первым)
3. **Phase A3** (Verify) — grep + sanity-check
4. **Phase A4** (Commit БЕЗ push) — по 6 репо локально
5. **Phase A5** (Cleanup) — удалить shim, выпилить `_load_gpuworklib()`, общий push (с переспросом по [16-github-sync](../../../.claude/rules/16-github-sync.md))
6. **B2-B3** (CMake patch + проверка) — на Debian через 4 дня

*Ожидаю финальный OK и приступаю с A1.*

---

## 📜 Changelog плана

| Дата | Изменение |
|------|-----------|
| 2026-04-29 | Создан план (после согласования Q1-Q4 + Доп.1-3) |
| 2026-04-30 | Глубокое ревью → [migration_plan_review_2026-04-30.md](migration_plan_review_2026-04-30.md). Phase A0 выполнен. План обновлён: A0 added, A2 переупорядочен (signal_generators первым), A5 Cleanup added (выпил shim), B4 fix (CMAKE_CURRENT_LIST_DIR), heterodyne получил готовый паттерн, шаблон A для sub-репо добавлен, helper `_require_gpu()` в шаблоне C. Время → ~10 ч (две сессии). |
