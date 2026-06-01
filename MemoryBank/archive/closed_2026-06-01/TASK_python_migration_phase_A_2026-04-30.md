# TASK: Python Tests Migration — Phase A (Windows, максимум подготовки)

**Дата создания**: 2026-04-30 · **Расширен**: 2026-04-30 (вынесли B2+B6 из Debian)
**Автор**: Кодо
**План-источник**: [`MemoryBank/specs/python/migration_plan_2026-04-29.md`](../specs/python/migration_plan_2026-04-29.md)
**Ревью**: [`MemoryBank/specs/python/migration_plan_review_2026-04-30.md`](../specs/python/migration_plan_review_2026-04-30.md)
**Связанный аудит**: [`MemoryBank/specs/python/pytest_audit_2026-04-29.md`](../specs/python/pytest_audit_2026-04-29.md)
**Парный таск**: [`TASK_python_migration_phase_B_debian_2026-05-03.md`](TASK_python_migration_phase_B_debian_2026-05-03.md) (минимум на Debian — только сборка + запуск)

> **Стратегия (запрос Alex 2026-04-30)**: на Windows делаем **по максимуму** — миграция Python + CMake-патч (B2) + обновление правил (B6). На Debian остаётся только реальная сборка, запуск и точечные правки tolerance.

---

## 🎯 Цель

Мигрировать **51 Python тест** `t_*.py` с legacy `import gpuworklib` на новую DSP-GPU архитектуру:

- Импорты через `dsp_*` модули (`dsp_core`, `dsp_spectrum`, `dsp_stats`, `dsp_signal_generators`, `dsp_heterodyne`, `dsp_linalg`, `dsp_radar`, `dsp_strategies`)
- `sys.exit(1)` (legacy) → `raise SkipTest(...)` (правило `04-testing-python.md`)
- `BUILD_PATHS`/ручные `sys.path.insert` → `GPULoader.setup_path()`
- Top-level `def test_*()` структура **сохраняется** (НЕ плодим классы)
- Удалить `DSP/Python/gpuworklib.py` shim после миграции (Phase A5)

**Платформа**: Windows (только редактирование, тесты НЕ запускаются — нет ROCm). Реальная проверка на Debian/работе через 4 дня (см. парный таск Phase B).

---

## 📊 Состояние (на 2026-04-30 после Phase A0)

| Показатель | Значение |
|-----------|----------|
| Всего `t_*.py` в проекте | 54 |
| Уже мигрировано (сессия 2026-04-29) | 3 (spectrum: `t_lch_farrow`, `t_lch_farrow_rocm`, `t_spectrum_find_all_maxima_rocm`) |
| Остаётся мигрировать | **51** |
| С `import gpuworklib` | 38 файлов |
| С `sys.exit(1)` (как замена SkipTest) | 15 файлов |
| `DSP/Python/libs/` | ✅ существует, `.gitkeep` создан (Phase A0) |
| `gpu_loader.py` ищет `libs/` | ✅ обновлён (Phase A0) |
| `gpuworklib.py` shim | существует, удалить в Phase A5 |

---

## 📋 Подфазы

### ✅ A0. Preflight — DONE 2026-04-30

- ✅ `DSP/Python/libs/.gitkeep` создан
- ✅ `gpu_loader.py:51` `lib` → `libs` + docstring обновлены
- ✅ `gpuworklib.py` error message обновлён под `libs/` + `DSP_LIB_DIR`
- ✅ Grep подтвердил: импорта `from t_gpuworklib import` нет; только 2 комментария в `integration/t_*.py`

---

### ✅ A1. Inventory API — DONE 2026-04-30 (~30 мин, не 2-3 ч)

**Результат**: раздел `## API Reference` + `## Legacy → DSP-GPU mapping` + `## Реальные проблемы миграции` в [migration_plan_2026-04-29.md](../specs/python/migration_plan_2026-04-29.md). Зафиксировано **30 классов** + 1 enum + module-level functions для 8 модулей.

**Главные находки**:
- 4 несуществующих в DSP-GPU класса используются в legacy-тестах: `HeterodyneDechirp` (6 мест), `SignalGenerator` (8 мест), `ScriptGenerator` (2 места), `FIRFilter` (только TODO-комментарий).
- Тесты **уже** используют правильные имена для `LfmAnalyticalDelayROCm`, `FMCorrelatorROCm` — shim был неточен, но никто его mismatch-полей не использовал.
- `t_gpuworklib.py` (887 строк, 9 проблемных мест) — рекомендация: SkipTest файл целиком (вариант A в плане).

**Цель** (для справки): Полная reference таблица «Класс → конструктор → методы → properties» для **всех** 8 модулей. Это база для механической миграции в A2.

**КРИТИЧНО**: `dsp_*_module.cpp` часто только зовёт `register_*(m)` — реальный API внутри `py_*.hpp`. Пример: `dsp_heterodyne_module.cpp:25` зовёт `register_heterodyne_rocm(m)` → нужно читать `py_heterodyne_rocm.hpp` для методов.

**Действия**:

1. Для каждого репо прочитать **ВСЕ** pybind-файлы (не только `dsp_*_module.cpp`):

| # | Репо | Файлы |
|---|------|-------|
| 1 | core | `core/python/dsp_core_module.cpp` + ВСЕ `core/python/py_*.hpp` |
| 2 | spectrum | `spectrum/python/dsp_spectrum_module.cpp` + ВСЕ `spectrum/python/py_*.hpp` |
| 3 | stats | `stats/python/dsp_stats_module.cpp` + `py_*.hpp` |
| 4 | signal_generators | `signal_generators/python/dsp_signal_generators_module.cpp` + `py_*.hpp` |
| 5 | heterodyne | `heterodyne/python/dsp_heterodyne_module.cpp` + `py_heterodyne_rocm.hpp` (✅ известен) |
| 6 | linalg | `linalg/python/dsp_linalg_module.cpp` + `py_*.hpp` |
| 7 | radar | `radar/python/dsp_radar_module.cpp` + `py_*.hpp` |
| 8 | strategies | `strategies/python/dsp_strategies_module.cpp` + `py_*.hpp` |

2. Для каждого `py::class_` зафиксировать:
   - Имя класса в Python (`m, "ClassName"` — берётся из второго аргумента `py::class_<T>(m, "Name", ...)`)
   - Сигнатура конструктора (`py::init<int>()` → `__init__(device_index: int)`)
   - **Полный список методов** с сигнатурами: `.def("method_name", &Class::method, py::arg("p1"), py::arg("p2") = default)`
   - Properties (`.def_property_readonly`, `.def_readwrite`)
   - **Какие numpy dtype** ожидаются (`py::array_t<std::complex<float>>` → `np.complex64`)

3. Записать в **новый раздел `## API Reference`** в `migration_plan_2026-04-29.md` (после «Известные API breaking changes»). Формат таблицы:

```markdown
### dsp_<module>

| Class | __init__ | Methods | Notes |
|-------|----------|---------|-------|
| ClassName | (ctx: ROCmGPUContext, size: int) | `set_params(...)`, `process(rx: np.complex64[N]) → np.float32[N]` | ⚠ legacy `OldName` removed |
```

4. **Дополнительно** — построить таблицу **legacy → new mapping** для всех известных классов (по shim `gpuworklib.py` + grep тестов на `gpuworklib.<X>`):

```markdown
### Legacy → DSP-GPU mapping

| Legacy (`gpuworklib.X`) | DSP-GPU | Module | Migration note |
|-------------------------|---------|--------|----------------|
| `ROCmGPUContext` | `ROCmGPUContext` | `dsp_core` | rename only |
| `HeterodyneDechirp` | `HeterodyneROCm` | `dsp_heterodyne` | API rewrite (см. §heterodyne pattern) |
| ... | | | |
```

**Критерий готовности**:
- [ ] Раздел `## API Reference` в `migration_plan_2026-04-29.md` (8 таблиц по модулю)
- [ ] Раздел `## Legacy → DSP-GPU mapping` (полная замена `gpuworklib.X`)
- [ ] Список «убрано / переименовано / breaking» — явно
- [ ] Зафиксированы все nontrivial типы (numpy dtype, py::list vs py::array)

**Возможные сюрпризы** (по предыдущим находкам):
- `HeterodyneDechirp` — убран (только `HeterodyneROCm`)
- `SignalGenerator` (legacy общий) — возможно убран; использовать `LfmAnalyticalDelayROCm` или NumPy
- Закомментированный `#include "py_*.hpp"` в module.cpp = класс не экспортируется (см. heterodyne case)

---

### ✅ A2.0. Pre-migration scan — DONE 2026-04-30

**Результаты** → [`MemoryBank/specs/python/sub_repo_tests_diff_2026-04-30.md`](../specs/python/sub_repo_tests_diff_2026-04-30.md)

Краткая сводка:
- Sub-репо тесты (4 файла) — все **уникальные**, не дубли
- Data файлы — скопированы в `DSP/Python/{linalg,signal_generators}/data/` (5 файлов: 4 R_*.csv + lagrange_matrix.json); создан `.gitkeep` в `{heterodyne,radar,stats}/data/`
- Cross-test imports — только `t_params.py` (helper, не тест) → переименовать в `_params.py` в A2.7
- ⚠ `api_keys.json` — найден в 2 тестах (`spectrum/t_ai_*`); добавлен в `.gitignore` обоих репо (workspace + DSP)
- Безопасность: добавлены `*.key`, `*.pem`, `.env*` в .gitignore

### 📚 Оригинальный план A2.0 (для справки)

**Цель**: устранить «слепые пятна» до начала механической миграции.

1. **Sub-репо vs DSP/Python diff** — для 4 файлов из A2.8:

```bash
# Если в DSP/Python/<module>/ есть файл с тем же именем — diff
diff -u linalg/python/t_linalg.py     DSP/Python/linalg/t_linalg.py     2>/dev/null
diff -u radar/python/t_radar.py       DSP/Python/radar/t_radar.py       2>/dev/null
diff -u spectrum/python/t_cpu_fft.py  DSP/Python/spectrum/t_cpu_fft.py  2>/dev/null
diff -u strategies/python/t_strategies.py DSP/Python/strategies/t_strategies.py 2>/dev/null
```

Записать результат в новый файл `MemoryBank/specs/python/sub_repo_tests_diff_2026-04-30.md`:
- Если **дубль** → удалить sub-репо версию (одну тестовую базу).
- Если **дополнение** → мигрировать обе по соответствующему шаблону.

2. **Data-файлы scan** — найти все ссылки на `.json/.csv/.npy/.npz` в `t_*.py`:

```bash
grep -rn "\.json\|\.csv\|\.npy\|\.npz" --include='t_*.py' E:/DSP-GPU/DSP/Python/ \
  E:/DSP-GPU/{linalg,radar,spectrum,strategies}/python/
```

Для каждого хита:
- Проверить наличие файла — если в `<repo>/src/...` или `<repo>/data/`, спланировать копию в `DSP/Python/<module>/data/`.
- Создать `data/` папки заранее (без файлов): `DSP/Python/{stats,signal_generators,heterodyne,linalg,radar}/data/.gitkeep`.

3. **`from t_X import Y` scan** — проверить, не импортируют ли тесты друг друга:

```bash
grep -rn "from t_\|import t_" --include='t_*.py' E:/DSP-GPU/
```

Если есть — отдельный список «cross-test imports»; либо удалить (тесты должны быть автономны), либо вынести в `_common.py`.

**Acceptance**:
- [ ] `sub_repo_tests_diff_2026-04-30.md` создан с решением по 4 файлам
- [ ] Список data-файлов с планом перемещения
- [ ] Cross-test imports — список (если есть) с решением

---

### ✅ A2. Migration files — DONE 2026-04-30 (~3 ч, не 6-8)

Все 8 групп (A2.1 - A2.8) мигрированы за один сеанс. Сводка:
- A2.1 signal_generators (4 файла) — стандартный паттерн
- A2.2 spectrum (12 файлов) — включая ai_pipeline/ (3 уровня глубины)
- A2.3 stats (4 файла) — 2 Python runners для C++ binary + 2 pybind тестов
- A2.4 linalg (3 файла) — copy R_*.csv в DSP/Python/linalg/data/
- A2.5 radar (3 файла) — `FMCorrelatorROCm` правильное имя в pybind (не FmCorrelatorROCm)
- A2.6 heterodyne (4 файла) — переписаны на `HeterodyneROCm.dechirp + np.fft + argmax` (см. helper `heterodyne_pipeline`)
- A2.7 strategies (2) + integration (5) + common (4) — в т.ч. микро-проект `t_signal_to_spectrum.py` (удалены тесты ScriptGenerator → перспективная задача)
- A2.8 sub-репо python/ (4 файла) — уже DSP-GPU smoke-scripts, не требуют миграции

**Результаты A3 Verify**:
- ✅ `0` файлов с `import gpuworklib`
- ✅ `0` файлов с `sys.exit(1)` как замена SkipTest
- ✅ `54/54` файлов syntax OK
- ✅ всё проверено через grep + ast.parse

Подробности → [pytest_audit_2026-04-29.md](../specs/python/pytest_audit_2026-04-29.md) §«Phase A2-A3 миграция»

### 📚 Оригинальный план A2 (для справки)

**Шаблон правок** для каждого файла (5 точечных Edit'ов):

#### A) Замена импортов (для DSP/Python/<module>/t_*.py)

```python
# ── DSP/Python в sys.path ───────────────────────────────────────────
_PT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PT_DIR not in sys.path:
    sys.path.insert(0, _PT_DIR)

from common.runner import TestRunner, SkipTest
from common.gpu_loader import GPULoader
GPULoader.setup_path()

try:
    import dsp_core as core
    import dsp_<module> as <alias>
    HAS_GPU = True
except ImportError:
    HAS_GPU = False
    core = None      # type: ignore
    <alias> = None   # type: ignore
```

**Альтернатива для sub-репо** `{repo}/python/t_*.py` (4 файла) — другой `_PT_DIR`:

```python
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DSP_PYTHON = os.path.join(os.path.dirname(_REPO_ROOT), "DSP", "Python")
if _DSP_PYTHON not in sys.path:
    sys.path.insert(0, _DSP_PYTHON)
# далее как обычно
```

**Альтернатива для глубже вложенных** (`DSP/Python/common/io/t_smoke.py` — 3 уровня) — `dirname(dirname(dirname(__file__)))`.

#### B) Замена обращений к классам (через `Edit replace_all=true`)

| Старое | Новое |
|--------|-------|
| `gpuworklib.ROCmGPUContext(0)` | `core.ROCmGPUContext(0)` |
| `gpuworklib.LchFarrowROCm(ctx)` | `spectrum.LchFarrowROCm(ctx)` |
| `gpuworklib.<X>` для модуля Y | `<alias_Y>.X` |

#### C) Helper `_require_gpu()` + guard в каждом тесте

```python
def _require_gpu():
    """Helper: единая точка проверки. Не плодим строку 8 раз."""
    if not HAS_GPU:
        raise SkipTest("dsp_core/dsp_<module> not found — check build/libs")

def test_xxx():
    _require_gpu()
    # ... остальное как было
```

#### D) Удаление `sys.exit(1)` блоков

Все `if not gpuworklib: print(ERROR); sys.exit(1)` — удалить (заменены try/except + флаг + SkipTest).

#### E) Data-файлы (json/csv/npy)

Если есть ссылка на data — перенести в `DSP/Python/<module>/data/`, обновить путь.

---

#### Сессия 1 (~4-5 ч): A2.1 — A2.3

##### **A2.1 — `DSP/Python/signal_generators/`** (4 файла, ~30 мин)

| Файл | Импорты | API status |
|------|---------|-----------|
| `t_delayed_form_signal.py` | `dsp_core` + `dsp_signal_generators` | проверить `DelayedFormSignalGeneratorROCm` |
| `t_form_signal.py` | то же | проверить `FormSignalGenerator` |
| `t_form_signal_rocm.py` | то же | проверить `FormSignalGeneratorROCm` |
| `t_lfm_analytical_delay.py` | то же | ✅ `LfmAnalyticalDelayROCm` известен |

**Почему первым**: уже знаем pybind (`LfmAnalyticalDelayROCm`), паттерн самый простой.

**Acceptance**:
- [ ] 0 `gpuworklib` в этих 4 файлах
- [ ] 0 `sys.exit` в этих 4 файлах
- [ ] Все используют `dsp_core` + `dsp_signal_generators`
- [ ] `_require_gpu()` helper + guard в каждом `def test_*()`

##### **A2.2 — `DSP/Python/spectrum/` (оставшиеся 11+1 файлов)** (~2 ч)

Список (12 файлов):
- **2 уровня глубины** (`DSP/Python/spectrum/t_*.py`) — стандартный шаблон A:
  - `t_ai_filter_pipeline.py`, `t_ai_fir_demo.py`, `t_filters_stage1.py`
  - `t_fir_filter_rocm.py`, `t_iir_filter_rocm.py`, `t_iir_plot.py`
  - `t_kalman_rocm.py`, `t_kaufman_rocm.py`, `t_moving_average_rocm.py`
  - `t_process_magnitude_rocm.py`, `t_spectrum_maxima_finder_rocm.py`
- ⚠ **3 уровня глубины** (`DSP/Python/spectrum/ai_pipeline/t_*.py`) — нужен `dirname(dirname(dirname(__file__)))`:
  - `ai_pipeline/t_ai_pipeline.py`

```python
# Для ai_pipeline/ — на 1 уровень глубже, чем стандарт
_PT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
```

**Эталоны** (уже мигрированы): `t_lch_farrow.py`, `t_lch_farrow_rocm.py`, `t_spectrum_find_all_maxima_rocm.py` — копировать паттерн. ⚠ Эталоны **НЕ проверены на Debian** — если в них баг, унаследуют все 12. После миграции 1-2 файлов сделать sanity-чек руками.

**Acceptance**:
- [ ] 0 `gpuworklib` в этих 12 файлах
- [ ] Все используют `dsp_core` + `dsp_spectrum`
- [ ] `ai_pipeline/t_ai_pipeline.py` использует 3-уровневый `_PT_DIR`

##### **A2.3 — `DSP/Python/stats/`** (4 файла, ~1 ч)

| Файл | Импорты |
|------|---------|
| `t_compute_all.py` | `dsp_core` + `dsp_stats` |
| `t_snr_estimator.py` | то же |
| `t_statistics_float_rocm.py` | то же |
| `t_statistics_rocm.py` | то же |

**Acceptance**:
- [ ] 0 `gpuworklib` в этих 4 файлах

---

#### Сессия 2 (~4-5 ч): A2.4 — A2.8

##### **A2.4 — `DSP/Python/linalg/`** (3 файла, ~45 мин)

| Файл | Импорты |
|------|---------|
| `t_capon.py` | `dsp_core` + `dsp_linalg` |
| `t_cholesky_inverter_rocm.py` | то же |
| `t_matrix_csv_comparison.py` | то же |

##### **A2.5 — `DSP/Python/radar/`** (3 файла, ~45 мин)

| Файл | Импорты |
|------|---------|
| `t_fm_correlator.py` | `dsp_core` + `dsp_radar` |
| `t_fm_correlator_rocm.py` | то же |
| `t_range_angle.py` | то же (+ `dsp_signal_generators`?) |

##### **A2.6 — `DSP/Python/heterodyne/`** ⚠️ API убран (4 файла, ~1.5 ч)

| Файл | Что переписать |
|------|---------------|
| `t_heterodyne.py` | `HeterodyneDechirp.process()` → `HeterodyneROCm.dechirp + np.fft + argmax` |
| `t_heterodyne_comparison.py` | то же |
| `t_heterodyne_rocm.py` | то же |
| `t_heterodyne_step_by_step.py` | то же |

**Канонический паттерн** (из `migration_plan_2026-04-29.md` §Heterodyne):

```python
import dsp_heterodyne as het_mod
import numpy as np

het = het_mod.HeterodyneROCm(ctx)
het.set_params(f_start, f_end, sample_rate, num_samples, num_antennas)

# 1. Dechirp на GPU
dc = het.dechirp(rx, ref)

# 2. FFT + поиск пика — на CPU своими силами
spec = np.fft.fft(dc.reshape(num_antennas, num_samples), axis=-1)
mag = np.abs(spec)
peaks = np.argmax(mag, axis=-1)
f_beat_hz = peaks.astype(np.float32) * (sample_rate / num_samples)

# 3. (Опц.) Correct
out = het.correct(dc, list(f_beat_hz))
```

**В каждом тесте** — обычный паттерн (БЕЗ дополнительного SkipTest):
```python
def test_xxx():
    _require_gpu()
    # ... переписанный код по канон. паттерну выше
```

> ⚠ **БЕЗ** дополнительного `SkipTest("pending Debian validation")`. Обоснование (изменено 2026-04-30):
> - Двойной SkipTest = тест **всегда** skip → переписывание бессмысленно.
> - На Debian `_require_gpu()` пропустит при отсутствии GPU; при наличии — реально запустится.
> - Если на Debian упадёт по точности → подкрутка `atol` в Phase B4 (~5 мин).
> - Если упадёт по логике API → значит при переписывании что-то упустили — поправим точечно (это и есть смысл валидации).

В **docstring файла** добавить TODO-маркер:
```python
"""
TODO(Debian 2026-05-03+): первый запуск после миграции с HeterodyneDechirp на
HeterodyneROCm.dechirp/correct + np.fft. Подкрутить atol если float32 даст
расхождение vs legacy.
"""
```

##### **A2.7 — `DSP/Python/strategies/` + `integration/` + `common/`** (~1.5 ч)

**strategies** (2 с `gpuworklib`):
- `t_strategies_pipeline.py`, `t_strategies_step_by_step.py`

**integration** (5 файлов):
- `t_fft_integration.py`, `t_hybrid_backend.py`, `t_signal_gen_integration.py`, `t_zero_copy.py` — стандартная миграция
- `t_gpuworklib.py` → **`t_signal_to_spectrum.py`** (отдельный микро-проект, см. ниже)

**Микро-план для `t_gpuworklib.py` → `t_signal_to_spectrum.py`** (согласовано Alex 2026-04-30, ~3-4 ч):

1. **Удалить тесты 8, 9** (`test_script_generator`, `test_script_fft_pipeline`, ~360 строк) — runtime DSL→kernel компилятор. Перспективная задача → [`MemoryBank/.future/TASK_script_dsl_rocm.md`](../.future/TASK_script_dsl_rocm.md) ✅ создан.
2. **Анализ дублей** для тестов 1, 2, 3, 6 — diff с `DSP/Python/{spectrum,signal_generators}/t_*.py`. Дубль = удалить из файла. Уникальное = переписать.
3. **Переписать 4, 5, 7** на `FormSignalGeneratorROCm.set_params_from_string(json)` (DSL уже есть в DSP-GPU API).
4. **matplotlib-код сохранить** — графики на Debian создадут PNG для документации.
5. **Переименовать**: `t_gpuworklib.py` → `t_signal_to_spectrum.py`.
6. **Обновить ссылки** в `t_fft_integration.py:5` и `t_signal_gen_integration.py:5` (комментарии «из оригинального test_gpuworklib.py» → «...t_signal_to_spectrum.py»).

Полный план в [migration_plan_2026-04-29.md §«Стратегия для integration/t_gpuworklib.py»](../specs/python/migration_plan_2026-04-29.md).

**common smoke** (4 файла, без GPU):
- `common/io/t_smoke.py`, `common/plotting/t_smoke.py`, `common/validators/t_smoke.py`, `common/references/t_references_smoke.py`
- НЕ используют `gpuworklib`. Только `sys.exit(1)` → `raise SkipTest(...)` если зависимости (matplotlib?) недоступны.
- `_PT_DIR` глубже на 1 уровень (3 уровня вверх).

##### **A2.8 — Sub-репо `{repo}/python/t_*.py`** (4 файла, ~30 мин)

| Файл | Репо |
|------|------|
| `linalg/python/t_linalg.py` | `linalg` |
| `radar/python/t_radar.py` | `radar` |
| `spectrum/python/t_cpu_fft.py` | `spectrum` |
| `strategies/python/t_strategies.py` | `strategies` |

**Шаблон импорта** — другой (см. §A2 «Альтернатива для sub-репо»):

```python
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DSP_PYTHON = os.path.join(os.path.dirname(_REPO_ROOT), "DSP", "Python")
if _DSP_PYTHON not in sys.path:
    sys.path.insert(0, _DSP_PYTHON)
```

**Перед миграцией** — `diff` каждого против `DSP/Python/<module>/t_*.py` (могут быть дублями или дополнениями).

---

### ✅ A3. Verify — DONE 2026-04-30 (см. A2 итоги выше)

### 📚 Оригинальный план A3 (для справки)

```bash
# 1. Нет import gpuworklib в t_*.py
grep -lrn "import gpuworklib\|from gpuworklib" --include='t_*.py' \
  --exclude-dir='.git' --exclude-dir='.claude' E:/DSP-GPU
# Ожидание: пусто (shim DSP/Python/gpuworklib.py пока на месте — удалится в A5)

# 2. sys.exit как замена SkipTest — оставшиеся вычистить
grep -rn "sys\.exit" --include='t_*.py' E:/DSP-GPU | grep -v "sys\.exit(0)"
# Ожидание: пусто

# 3. Все t_*.py с _require_gpu() guard
grep -L "_require_gpu" --include='t_*.py' E:/DSP-GPU/DSP/Python/
# Ожидание: только common/ (4 smoke без GPU)

# 4. Все 10 репо чистые
for repo in workspace core spectrum stats signal_generators heterodyne linalg radar strategies DSP; do
  echo "== $repo =="
  if [ "$repo" = "workspace" ]; then path="E:/DSP-GPU"; else path="E:/DSP-GPU/$repo"; fi
  git -C "$path" status --short
done
```

**Критерий готовности**:
- [ ] 0 `import gpuworklib` в t_*.py
- [ ] 0 `sys.exit` (кроме `sys.exit(0)`) в t_*.py
- [ ] Все `def test_*()` имеют guard
- [ ] Data-файлы перенесены (если были)

---

### 🔵 A4. Pre-commit: обновить audit + Commit (~30 мин, БЕЗ push)

**Перед коммитом** обновить `MemoryBank/specs/python/pytest_audit_2026-04-29.md` финальной сводкой:
- Сколько файлов мигрировано по группам
- Список файлов где есть TODO-маркеры (heterodyne)
- Все API breaking changes найденные в A1
- Ссылка на `sub_repo_tests_diff_2026-04-30.md` (из A2.0)

---

**Распределение коммитов по репо** (важно — какие файлы куда):

| Репо | Что коммитим |
|------|-------------|
| **DSP** | `Python/{stats,signal_generators,heterodyne,linalg,radar,spectrum,strategies,integration,common}/t_*.py` (большая часть миграции). Также `data/` папки если создали. |
| **spectrum** | `python/t_cpu_fft.py` (sub-репо тест) |
| **linalg** | `python/t_linalg.py` |
| **radar** | `python/t_radar.py` |
| **strategies** | `python/t_strategies.py` |
| **workspace** | `MemoryBank/specs/python/*.md` (план + ревью + audit + sub-repo diff) и `MemoryBank/tasks/TASK_*.md` |
| **core / stats / signal_generators / heterodyne** | НЕТ изменений в Phase A (если не правили sub-репо тесты) |

**Шаблон сообщения для DSP-репо** (главный коммит):
```
python: migrate t_*.py to dsp_<module> API + GPULoader.setup_path

- 47 files migrated: import gpuworklib → dsp_core + dsp_<module>
- sys.exit(1) → raise SkipTest (rule 04-testing-python)
- BUILD_PATHS → GPULoader.setup_path()
- _require_gpu() helper + guard в каждом def test_*()
- heterodyne/ (4 files) переписаны на HeterodyneROCm.dechirp/correct + np.fft
- Data files moved to DSP/Python/<module>/data/

Rules tested on Debian: 2026-05-03+ (Phase B)
```

**Шаблон для sub-репо** (`spectrum/linalg/radar/strategies`):
```
python: migrate python/t_<name>.py to dsp_<module> API
```

**Шаблон для workspace**:
```
memorybank: python migration plan + review + sub-repo diff + Phase A audit
```

**Acceptance**:
- [ ] `pytest_audit_2026-04-29.md` обновлён финальной сводкой
- [ ] 6 локальных коммитов созданы (DSP + 4 sub-репо + workspace)
- [ ] `git status` всех 10 репо чистый
- [ ] Push НЕ выполнен (общий push после A7)

---

### 🔵 A5. Cleanup — выпиливание `gpuworklib.py` shim (~20 мин)

После A3 (зеро `import gpuworklib`) shim становится мёртвым кодом.

**Действия**:

1. **Удалить файл**:
   ```
   rm DSP/Python/gpuworklib.py
   ```

2. **В `DSP/Python/common/gpu_loader.py`** (минимальное хирургическое вмешательство):
   - Удалить метод `_load_gpuworklib()` (строки ~159-169) — не имеет цели без shim
   - Удалить вызовы `cls._load_gpuworklib()` в `_try_load()` (4 места)
   - **Оставить** `get()` и `is_available()` — пометить `# DEPRECATED: returns None always after shim removal`. Не удаляем чтобы не сломать utility-скрипты. Полное удаление — в отдельном таске «cleanup deprecated GPULoader API».
   - **Оставить** `setup_path()`, `loaded_from()`, `reset()` без изменений.
   - Удалить поле `_gpuworklib` (всегда None) — но безопаснее оставить с комментарием.

3. **Обновить docstring модуля** — убрать «Legacy» секцию из Usage.

4. **Verify**:
   ```bash
   # 1. Полное отсутствие в Python коде (.py)
   grep -rn "gpuworklib" --include='*.py' DSP/Python/
   # Ожидание: только закомментированные DEPRECATED-маркеры в gpu_loader.py

   # 2. Импорты shim — точно нет
   grep -rn "import gpuworklib\|from gpuworklib" --include='*.py' E:/DSP-GPU/
   # Ожидание: пусто
   ```

5. **Коммит** в DSP-репо:
   ```
   python: remove gpuworklib shim (no longer used after migration)

   - rm DSP/Python/gpuworklib.py
   - gpu_loader.py: remove _load_gpuworklib(); deprecate get()/is_available()
   - setup_path() остаётся главным API
   ```

**Acceptance**:
- [ ] `DSP/Python/gpuworklib.py` удалён
- [ ] `gpu_loader.py` без `_load_gpuworklib()`
- [ ] `grep -rn "import gpuworklib" DSP/Python/` → пусто
- [ ] DEPRECATED-маркеры на `get()`/`is_available()` стоят
- [ ] Push НЕ делаем здесь — после A7 общий

---

### 🔵 A6. CMake auto-deploy patch (~45 мин) — ПЕРЕНЕСЕНО ИЗ B2

**Цель**: Применить CMake POST_BUILD patch в 8 файлах `{repo}/python/CMakeLists.txt` **на Windows** — чтобы на Debian оставалось только `cmake --build` (он сам разложит `.so` в `DSP/Python/libs/`).

**Это правка текста — никакой Debian-специфики.**

**8 файлов** (для каждого подставить своё имя таргета):

| Файл | TARGET name |
|------|-------------|
| `core/python/CMakeLists.txt` | `dsp_core` |
| `spectrum/python/CMakeLists.txt` | `dsp_spectrum` |
| `stats/python/CMakeLists.txt` | `dsp_stats` |
| `signal_generators/python/CMakeLists.txt` | `dsp_signal_generators` |
| `heterodyne/python/CMakeLists.txt` | `dsp_heterodyne` |
| `linalg/python/CMakeLists.txt` | `dsp_linalg` |
| `radar/python/CMakeLists.txt` | `dsp_radar` |
| `strategies/python/CMakeLists.txt` | `dsp_strategies` |

**Блок для добавления** (в конец `python/CMakeLists.txt`, после `pybind11_add_module(...)` и `target_link_libraries(...)`):

```cmake
# ── Auto-deploy to DSP/Python/libs/ ─────────────────────────────────
# Опция определена в 8 файлах (Q1=B, автономность модуля);
# первое определение создаёт CACHE-переменную, остальные — no-op.
option(DSP_DEPLOY_PYTHON_LIB "Auto-copy .so to DSP/Python/libs/" ON)

# Путь от {repo}/python/CMakeLists.txt → корень репо → sibling DSP/Python/libs/
# CMAKE_CURRENT_LIST_DIR — устойчив к супер-проекту (см. ревью §B4)
set(DSP_PYTHON_LIB_DIR "${CMAKE_CURRENT_LIST_DIR}/../../DSP/Python/libs"
    CACHE PATH "Where to deploy compiled .so for tests")

if(DSP_DEPLOY_PYTHON_LIB)
  # PRE_BUILD: удалить старую версию (даже если сборка упадёт — не будет stale)
  add_custom_command(TARGET dsp_<MODULE> PRE_BUILD
    COMMAND ${CMAKE_COMMAND} -E rm -f
      "${DSP_PYTHON_LIB_DIR}/$<TARGET_FILE_NAME:dsp_<MODULE>>"
    COMMENT "Remove stale dsp_<MODULE> from DSP/Python/libs/")

  # POST_BUILD: скопировать новую (только при успешной сборке)
  add_custom_command(TARGET dsp_<MODULE> POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory "${DSP_PYTHON_LIB_DIR}"
    COMMAND ${CMAKE_COMMAND} -E copy
      "$<TARGET_FILE:dsp_<MODULE>>" "${DSP_PYTHON_LIB_DIR}/"
    COMMENT "Deploy dsp_<MODULE> to DSP/Python/libs/")
endif()
```

**Валидация на Windows** (без полной сборки):

```bash
# Базовая проверка синтаксиса CMake (поднятие parsing-ошибок)
cmake -P /dev/stdin <<'EOF'
# ничего, просто синтаксис проверим через include
include("${CMAKE_CURRENT_LIST_DIR}/spectrum/python/CMakeLists.txt" OPTIONAL RESULT_VARIABLE r)
EOF
```

⚠ Полную проверку (что POST_BUILD реально срабатывает) — только на Debian (Phase B).

**Коммиты** (отдельный коммит в каждом из 8 репо):
```
cmake(python): auto-deploy dsp_<module>.so to DSP/Python/libs/

PRE_BUILD remove + POST_BUILD copy. Опция DSP_DEPLOY_PYTHON_LIB ON
по умолчанию, отключается через -DDSP_DEPLOY_PYTHON_LIB=OFF.
Path via CMAKE_CURRENT_LIST_DIR (устойчив к супер-проекту).
```

> ⚠ **Это правка CMake** — по правилу [12-cmake-build.md](../../.claude/rules/12-cmake-build.md) требует явный OK Alex'а (см. CLAUDE.md). Перед применением — показать diff-preview Alex'у.

**Acceptance**:
- [ ] OK от Alex на правку 8 CMakeLists.txt получен
- [ ] 8 файлов получили блок auto-deploy
- [ ] `<MODULE>` корректно подставлен в каждом файле
- [ ] Базовый `cmake -P` синтаксис-чек прошёл (если возможно)
- [ ] 8 локальных коммитов в core/spectrum/stats/signal_generators/heterodyne/linalg/radar/strategies

---

### 🔵 A7. Sync `.claude/rules/` (~30 мин) — ПЕРЕНЕСЕНО ИЗ B6

**Цель**: Привести правила Кодо в соответствие с реальностью DSP-GPU.

1. **`MemoryBank/.claude/rules/04-testing-python.md`** (canonical):
   - Заменить `test_*.py` → `t_*.py` в примерах размещения и запуска
   - Добавить заметку: «top-level `def test_*()` структура — допустима для legacy-style тестов; `class TestX:` — для новых»
   - Шаблоны кода обновить (helper `_require_gpu()` + guard)

2. **`MemoryBank/.claude/rules/11-python-bindings.md`** (canonical):
   - Убрать суффикс `_pyd` из примеров (`dsp_spectrum_pyd` → `dsp_spectrum`)
   - Указать `DSP/Python/libs/` (не `lib/`)
   - Упомянуть `DSP_DEPLOY_PYTHON_LIB` опцию из A6
   - Обновить пример `GPULoader`: убрать `get_instance().get_context(...)` (это ложь — нет такого API)

3. **Sync canonical → working** через `MemoryBank/sync_rules.py`:

```bash
python3 MemoryBank/sync_rules.py
# Должен скопировать MemoryBank/.claude/rules/*.md → .claude/rules/*.md
```

⚠ Если sync_rules.py упадёт на Windows — сделать руками:
```bash
cp MemoryBank/.claude/rules/04-testing-python.md .claude/rules/
cp MemoryBank/.claude/rules/11-python-bindings.md .claude/rules/
```

4. **Verify**:
```bash
diff MemoryBank/.claude/rules/04-testing-python.md .claude/rules/04-testing-python.md
diff MemoryBank/.claude/rules/11-python-bindings.md .claude/rules/11-python-bindings.md
# Ожидание: пусто (или identical)
```

5. **Коммит** в workspace:
```
rules: sync 04-testing-python + 11-python-bindings with reality

- 04: t_*.py prefix (was test_*.py); top-level def test_* allowed
- 11: removed _pyd suffix from examples; libs/ instead of lib/
- 11: GPULoader.setup_path() (corrected API)
- 11: added DSP_DEPLOY_PYTHON_LIB CMake option
```

**Acceptance**:
- [ ] `04-testing-python.md` обновлён в canonical + working
- [ ] `11-python-bindings.md` обновлён в canonical + working
- [ ] sync прошёл без ошибок
- [ ] коммит в workspace

---

### 🔵 A8. Общий push (~15 мин) — переспрос Alex

После A0-A7 — единый push по всем затронутым репо по правилу [16-github-sync](../../.claude/rules/16-github-sync.md).

**Затронутые репо** (предварительная оценка):

| Репо | Что менялось |
|------|-------------|
| **workspace** | MemoryBank (план/ревью/audit/sub-repo diff) + .claude/rules/ |
| **DSP** | Python/t_*.py + удаление gpuworklib.py + gpu_loader.py + libs/.gitkeep + data/ |
| **core** | python/CMakeLists.txt (A6) |
| **spectrum** | python/CMakeLists.txt (A6) + python/t_cpu_fft.py |
| **stats** | python/CMakeLists.txt (A6) |
| **signal_generators** | python/CMakeLists.txt (A6) |
| **heterodyne** | python/CMakeLists.txt (A6) |
| **linalg** | python/CMakeLists.txt (A6) + python/t_linalg.py |
| **radar** | python/CMakeLists.txt (A6) + python/t_radar.py |
| **strategies** | python/CMakeLists.txt (A6) + python/t_strategies.py |

**Все 10 репо** имеют изменения после Phase A.

**Action**:
```
Запушу по всем 10 репо (workspace + 9 sub).
Изменения: миграция Python тестов + CMake auto-deploy + sync rules.
Делаю? (да/нет)
```

После явного «да» — push по правилу 16.

**Acceptance**:
- [ ] OK от Alex
- [ ] 10 репо запушены, `git log origin/main..HEAD` пусто везде
- [ ] Отчёт-таблица «репо | HEAD | запушено?» создан

---

## ⏱️ Общая оценка

| Подфаза | Время | Где |
|---------|-------|-----|
| A0. Preflight | ✅ done (5 мин) | Windows |
| A1. Inventory API (расширенный) | ~2-3 ч | Windows |
| A2.0. Pre-migration scan | ~30 мин | Windows |
| A2. Migration (8 групп × 51 файл) | ~6-8 ч | Windows |
| A3. Verify | ~30 мин | Windows |
| A4. Audit + Commit (без push) | ~45 мин | Windows |
| A5. Cleanup shim | ~20 мин | Windows |
| **A6. CMake patch ×8** (← из B2) | ~45 мин | Windows |
| **A7. Sync rules** (← из B6) | ~30 мин | Windows |
| A8. Общий push | ~15 мин + переспрос | Windows |
| **Итого Phase A** | **~12-13 ч** | 2 сессии Windows |

---

## 🚫 Что НЕ делаем

- ❌ Не плодим `class TestX:` — top-level `def test_*()` сохраняем
- ❌ Не создаём `factories.py` для тестов
- ❌ Не используем pytest / conftest / декораторы
- ❌ Не мигрируем тесты которых нет в legacy `E:/C++/GPUWorkLib`
- ❌ Не трогаем **pybind C++** (`py_*.hpp` / `dsp_*_module.cpp`) — это отдельный таск
- ❌ Не правим C++ ядра / HIP — совсем другая история
- ❌ Не запускаем тесты на Windows (нет ROCm)
- ❌ Push НЕ делаем после каждого репо — только общий A8 (после переспроса)
- ❌ **CMake — только A6 шаблонный блок**; никаких других правок без отдельного OK

---

## ⚠️ Риски и митигация

| Риск | Митигация |
|------|-----------|
| Класс убран в новом API (как `HeterodyneDechirp`) | A1 inventory должен это найти; TODO-маркер в docstring (без двойного SkipTest) |
| Class есть, но методы переименованы | Прочитать `py_*.hpp`, поправить точечно |
| Data-файл (json/csv) пропущен | A2.0 scan + сверка с `E:/C++/GPUWorkLib/Python_test/<module>/data/` |
| Сломанные импорты `from t_X import Y` | A2.0 grep + список cross-test imports |
| Сломанный `_PT_DIR` в глубоких файлах | A2.2 явно отметил `ai_pipeline/` (3 уровня); A2.7 common/* тоже 3 уровня |
| `_require_gpu()` пропущен в каком-то тесте | A3 `grep -L "_require_gpu"` отлавливает |
| Эталоны (3 spectrum) бажные | Sanity-чек 1-2 файла в A2.2 руками; на Debian — первый прогон именно эталона |
| CMake-патч не сработал | Базовый syntax-чек в A6 + полная валидация в Phase B3 |
| `sync_rules.py` упал на Windows | Fallback `cp` руками (см. A7) |
| Sub-репо тест дублирует DSP/Python версию | A2.0 diff-step → решение «удалить или дополнить» **до** миграции |

---

## 🔗 Связанные документы

- План: [`MemoryBank/specs/python/migration_plan_2026-04-29.md`](../specs/python/migration_plan_2026-04-29.md)
- Ревью: [`MemoryBank/specs/python/migration_plan_review_2026-04-30.md`](../specs/python/migration_plan_review_2026-04-30.md)
- Аудит pytest: [`MemoryBank/specs/python/pytest_audit_2026-04-29.md`](../specs/python/pytest_audit_2026-04-29.md)
- Парный таск (Phase B): [`TASK_python_migration_phase_B_debian_2026-05-03.md`](TASK_python_migration_phase_B_debian_2026-05-03.md)
- Правила: [`.claude/rules/04-testing-python.md`](../../.claude/rules/04-testing-python.md), [`.claude/rules/11-python-bindings.md`](../../.claude/rules/11-python-bindings.md), [`.claude/rules/16-github-sync.md`](../../.claude/rules/16-github-sync.md)

---

## 🚀 Старт

**Pre-conditions** (всё ✅):
- A0 preflight DONE (libs/.gitkeep, gpu_loader.py обновлён)
- План и ревью утверждены Alex'ом
- 3 spectrum-файла мигрированы как эталон (⚠ не проверены на Debian)

**Порядок**: A1 → A2.0 → A2.1-A2.8 → A3 → A4 → A5 → **A6** (CMake, нужен OK Alex) → **A7** (rules) → **A8** (push, нужен OK Alex)

**Первый шаг**: Phase A1 (Inventory API) — читаем все pybind файлы 8 модулей, формируем reference + legacy mapping.

*Ожидаю команду «старт A1» от Alex'а.*

---

## 📜 Changelog

| Дата | Изменение |
|------|-----------|
| 2026-04-30 | Создан таск (после ревью плана) |
| 2026-04-30 | Расширен по запросу Alex «максимум на Windows»: A1 углублён (все py_*.hpp + legacy mapping), добавлен A2.0 (pre-scan), A2.2 явно про `ai_pipeline/` 3-уровневый путь, A2.6 убран двойной SkipTest, A4 разбит по репо + audit pre-commit, A5 мягче (deprecate, не удалять `get()`), **новые A6 (CMake patch ← B2) и A7 (sync rules ← B6)**, A8 (общий push). Phase B сократилась до сборки+запуска. |

---

*Created: 2026-04-30 | Last updated: 2026-04-30 | Maintained by: Кодо*
