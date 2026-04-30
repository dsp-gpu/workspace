# A2.0 Pre-migration scan — результаты

**Дата**: 2026-04-30
**Phase**: A2.0 (pre-migration scan для Python tests migration)
**Связано**: [migration_plan_2026-04-29.md](migration_plan_2026-04-29.md), [TASK_python_migration_phase_A_2026-04-30.md](../../tasks/TASK_python_migration_phase_A_2026-04-30.md)

---

## 1. Sub-репо тесты vs `DSP/Python/<module>/`

| Sub-репо файл | DSP/Python/<module>/ — есть аналог? | Решение |
|---------------|-------------------------------------|---------|
| `linalg/python/t_linalg.py` | ❌ НЕТ (есть `t_capon.py`, `t_cholesky_inverter_rocm.py`, `t_matrix_csv_comparison.py`) | **Уникальный** — мигрировать как A2.8 sub-репо шаблон |
| `radar/python/t_radar.py` | ❌ НЕТ (есть `t_fm_correlator.py`, `t_fm_correlator_rocm.py`, `t_range_angle.py`) | **Уникальный** — мигрировать |
| `spectrum/python/t_cpu_fft.py` | ❌ НЕТ (есть FFT через GPU, но не CPU FFT тесты) | **Уникальный** — мигрировать |
| `strategies/python/t_strategies.py` | ❌ НЕТ (есть `t_base_pipeline.py`, `t_strategies_pipeline.py` etc) | **Уникальный** — мигрировать |

**Итог**: все 4 sub-репо файла **уникальные** (не дубли). Все 4 идут в Phase A2.8 со специальным шаблоном импорта.

---

## 2. Data файлы

### 2.1. Найденные data ссылки

| Файл | Data references | Где реально |
|------|----------------|-------------|
| `DSP/Python/linalg/t_matrix_csv_comparison.py` | `R_85 (1).csv`, `R_341 (1).csv`, `R_inv_85.csv`, `R_inv_341.csv` | `e:/DSP-GPU/linalg/tests/Data/` (legacy путь `modules/vector_algebra/tests/Data/` мёртвый) |
| `DSP/Python/signal_generators/t_delayed_form_signal.py` | `lagrange_matrix_48x5.json` | `e:/DSP-GPU/spectrum/src/lch_farrow/lagrange_matrix_48x5.json` (ссылается как relative) |
| `DSP/Python/spectrum/t_lch_farrow.py` + `t_lch_farrow_rocm.py` | `lagrange_matrix_48x5.json` | ✅ Уже в `DSP/Python/spectrum/data/` (мигрировано) |
| `DSP/Python/strategies/t_farrow_pipeline.py` | `.npy`/`.json` checkpoints | Runtime-сгенерированные, копировать НЕ нужно |
| `DSP/Python/common/io/t_smoke.py` | `.npz` тесты | Runtime, smoke-тест I/O |
| `DSP/Python/spectrum/t_ai_filter_pipeline.py` + `t_ai_fir_demo.py` | `api_keys.json` (root) | ⚠ Credentials — **НЕ в git** (см. ниже §4) |

### 2.2. Выполненные действия

✅ Созданы папки + скопированы файлы:

```
DSP/Python/signal_generators/data/lagrange_matrix_48x5.json    (копия из spectrum/src/lch_farrow/)
DSP/Python/linalg/data/R_85 (1).csv                            (копия из linalg/tests/Data/)
DSP/Python/linalg/data/R_341 (1).csv                           (копия)
DSP/Python/linalg/data/R_inv_85.csv                            (копия)
DSP/Python/linalg/data/R_inv_341.csv                           (копия)
DSP/Python/heterodyne/data/.gitkeep                            (заготовка — пока нет data)
DSP/Python/radar/data/.gitkeep                                 (заготовка)
DSP/Python/stats/data/.gitkeep                                 (заготовка)
```

### 2.3. Что менять в тестах при миграции

При миграции каждого упомянутого теста — заменить путь:

```python
# Было (legacy, путь к GPUWorkLib):
DATA_DIR = os.path.join(_REPO_ROOT, "modules", "vector_algebra", "tests", "Data")
r_inv_path = os.path.join(DATA_DIR, "R_inv_85.csv")

# Станет (DSP-GPU, локальная data/):
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
r_inv_path = os.path.join(DATA_DIR, "R_inv_85.csv")
```

---

## 3. Cross-test imports

```bash
$ grep -rn "from t_\|^import t_" --include='t_*.py'
DSP/Python/strategies/t_base_pipeline.py:31:from t_params import AntennaTestParams, SignalVariant
DSP/Python/strategies/t_debug_steps.py:35:from t_params import AntennaTestParams, SignalVariant
```

**Находка**: `t_params.py` — это **НЕ тест**, а **dataclass-helper** (содержит `AntennaTestParams`, `SignalVariant`). Импортируется двумя реальными тестами.

**Проблема**: TestRunner может попытаться запустить `t_params.py` как тест (по префиксу `t_`).

**Варианты решения** (НЕ блокер для текущей миграции, отложить):

| Вариант | Описание | Когда |
|---------|----------|-------|
| A | Переименовать `t_params.py` → `_params.py` (явно не тест) | Можно сделать в A2.7 |
| B | Оставить, добавить ранний return / SkipTest при попытке запуска как тест | Минимум правок |
| C | Вынести в `common/strategies_helpers.py` | Большой рефакторинг |

**Рекомендация**: вариант A в A2.7 (5 минут — переименовать + поменять `from t_params` на `from _params` в 2 местах).

---

## 4. Безопасность (api_keys.json)

⚠ **Find**: 2 теста используют `api_keys.json` (для AI provider — GigaChat/OpenAI):
- `DSP/Python/spectrum/t_ai_filter_pipeline.py:86`
- `DSP/Python/spectrum/t_ai_fir_demo.py:68`

Файл НЕ присутствует в репо (хорошо), но **НЕ был** в `.gitignore` — потенциальная утечка.

✅ **Выполнено**:
- workspace `.gitignore` — добавлено: `api_keys.json`, `**/api_keys.json`, `*.key`, `*.pem`, `.env`, `.env.*`
- DSP `.gitignore` — то же + `Python/libs/*.so` / `*.pyd` (для CMake POST_BUILD автокопирования)

При миграции этих 2 тестов:
- Обернуть load `api_keys.json` в try/except
- Если файла нет → `raise SkipTest("api_keys.json not found — set up AI provider credentials")`
- НЕ ломать запуск других тестов

---

## 5. Таблица решений для A2.x

| Group | Файл | Спец-действие |
|-------|------|---------------|
| A2.1 signal_generators | `t_delayed_form_signal.py` | Поменять путь к `lagrange_matrix_48x5.json` на локальный `data/` |
| A2.2 spectrum | `ai_pipeline/t_ai_pipeline.py` | 3-уровневый `_PT_DIR` (отмечено в плане) |
| A2.2 spectrum | `t_ai_filter_pipeline.py` | api_keys.json через try/except + SkipTest |
| A2.2 spectrum | `t_ai_fir_demo.py` | то же + строка 480 содержит `gpuworklib.SignalGenerator` — заменить на `FormSignalGeneratorROCm` или NumPy |
| A2.4 linalg | `t_matrix_csv_comparison.py` | Поменять `DATA_DIR` на локальный `data/` (4 файла .csv скопированы) |
| A2.7 strategies | `t_params.py` | Переименовать → `_params.py` + поправить 2 импорта (B-вариант или A — на твой выбор Alex) |
| A2.7 integration | `t_gpuworklib.py` → `t_signal_to_spectrum.py` | Микро-проект (см. план) — удалить scripts 8/9 + переписать 4/5/7 + анализ дублей 1/2/3/6 |
| A2.7 common | `common/{io,plotting,validators,references}/t_smoke.py` | 3-уровневый `_PT_DIR` (3 dirname вверх) |
| A2.8 sub-репо | 4 файла в `{linalg,radar,spectrum,strategies}/python/` | Sub-репо шаблон импорта (3-уровневый через sibling DSP/Python/) |

---

## 6. Что НЕ нашлось (хорошие новости)

- ❌ **Нет** дублей sub-репо vs DSP/Python — все 4 уникальные
- ❌ **Нет** скрытых cross-test imports вне strategies (только `t_params`)
- ❌ **Нет** binary data (npy/npz) которые надо копировать сейчас (всё runtime-генерируемое)

---

*Created: 2026-04-30 (Phase A2.0) by Кодо*
