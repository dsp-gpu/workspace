# TASK — Phase B B4: разбор FAIL после полного прогона t_*.py

> **Создано**: 2026-05-04 (после Phase B B3 на Debian + RX 9070 gfx1201)
> **Обновлено**: 2026-05-13 — после namespace migration acceptance + полного re-run 50 t_*.py
> **Статус**: 📋 active (продолжение Phase B)
> **Effort**: ~3-6 ч (зависит от глубины каждой категории)
> **Платформа**: Debian Linux + ROCm 7.2 + AMD Radeon RX 9070 (gfx1201)
> **Парный таск**: [`TASK_python_migration_phase_B_debian_2026-05-03.md`](TASK_python_migration_phase_B_debian_2026-05-03.md) (B0/B1/Bs/B3 ✅ DONE 2026-05-13)

---

## 🆕 2026-05-13 — Re-run после namespace migration acceptance

**После полного fix'а namespace migration (G1-G8 + 26/26 acceptance PASS)** — повторный прогон 50 t_*.py через `/tmp/run_python_tests_v2.py` с точной TestRunner-парсёром (regex `Total: N passed, M failed, K skipped`).

### Итог (42.8 сек на 50 файлов)

| Категория | Кол-во |
|-----------|-------:|
| ✅ **PASS** | **43** (86%) |
| ⏭️ all-SKIP (только skipped, без failure) | 1 |
| ❌ **FAIL** (`failed > 0` в TestRunner output) | **6** |
| ❌ error-exit / timeout | 0 |

### 6 FAIL (deferred — НЕ блокеры миграции)

| # | Файл | Падений | Категория |
|---|------|---------|-----------|
| 1 | `heterodyne/t_heterodyne.py` | 0P/**4F** | полный провал — нужно расследовать |
| 2 | `linalg/t_capon.py` | ?P/?F | посмотреть детали |
| 3 | `radar/t_fm_correlator.py` | 11P/**1F** | `test_gpu_vs_numpy_correlation`: max_error=1023.0 >> tol 0.05 — численный mismatch GPU vs NumPy |
| 4 | `radar/t_range_angle.py` | 6P/**1F** | `test_range_basic`: range 78575 m vs ref 75000 m (off 3575 m, > tol 1000 m) |
| 5 | `spectrum/ai_pipeline/t_ai_pipeline.py` | 15P/**4F** | API mismatch: `IirFilterROCm(ctx, b, a)` not supported — только `(ctx)`. Test код устарел |
| 6 | `spectrum/t_spectrum_maxima_finder_rocm.py` | 13P/**1F** | `test_process_multi_beam_list`: Beam 2 expected 234375, got 109375 — численное расхождение |

**Что отличается от B4 2026-05-04 (18 FAIL)**:
Большая часть из 18 закрыта намeспейс-миграцией + apt'ом ROCm devkit. Остались 6 — *реальные* проблемы (numerical / API mismatch), не infrastructure.

**Артефакты**:
- Отчёт: `/tmp/python_tests_report_v2.json`
- Полный лог: `/tmp/p1_v2_full.log`
- Скрипт прогона: `/tmp/run_python_tests_v2.py`

**Категории для разбора**:
- 🔴 **Heterodyne полный провал** (1 file × 4 fails) — высокий приоритет, явно регрессия
- 🟡 **Numerical mismatch** (3 файла, 3 fails) — radar correlator/range, spectrum maxima multi-beam
- 🟡 **API mismatch ai_pipeline IirFilterROCm** (1 file × 4 fails) — тест устарел
- ⚪ linalg capon (1 file) — глянуть

---

---

## Контекст

После сегодняшней сессии 2026-05-04:

- ✅ B0 sanity Phase A артефактов
- ✅ B1 чистая сборка через `cmake --preset debian-local-dev` + 8 `.so` в `DSP/Python/libs/`
- ✅ Bs smoke 3 эталонных тестов PASS
- ✅ B3 полный прогон 50 `t_*.py` запустился, **18 FAIL** на gfx1201

**Что было сделано в B1 для разблокировки сборки** (уже запушено):
1. Doxygen `*/` pitfall в `spectrum_processor_rocm.hpp` (×3) и `cholesky_inverter_rocm.hpp` (×1) — спека `MemoryBank/specs/doxygen_pitfall_star_slash_2026-05-04.md`
2. CMake `CMAKE_SOURCE_DIR` → `PROJECT_SOURCE_DIR` в 4 sub-репо (spectrum, signal_generators, stats, heterodyne)
3. Pybind11 `ROCmGPUContext` дедупликация в 7 не-core модулях (replaced with `py::module_::import("dsp_core")`)
4. Билд-флаги при configure: `-DENABLE_ROCM=1` + 8 `-DDSP_<X>_BUILD_PYTHON=ON`

После этого: 11 PASS / 20 OK? (silent exit=0) / 1 SKIP / **18 FAIL**.

---

## 18 FAIL — категории и корневые причины

### A. Path-ошибки (relative imports / file not found) — 4 теста

| Тест | Сообщение | Корневая причина |
|------|-----------|------------------|
| `strategies/t_strategies_pipeline.py` | `ImportError: attempted relative import with no known parent package` | `from .numpy_reference import` без `__init__.py` |
| `strategies/t_strategies_step_by_step.py` | (вероятно та же) | (та же) |
| `strategies/t_farrow_pipeline.py` | `FileNotFoundError: '/home/alex/DSP-GPU/DSP/modules/lch_farrow/lagrange_matrix_48x5.json'` | путь должен быть `DSP/Python/spectrum/data/` |
| `spectrum/ai_pipeline/t_ai_pipeline.py` | (вероятно path) | глубокая директория, `_PT_DIR` сломан |

**Стратегия**: точечно поправить пути, добавить `_require_gpu()` обёртки если нужно.

### B. Конструктор-mismatch HybridGPUContext vs ROCmGPUContext — 1 тест (+цепочка)

| Тест | Сообщение | Корневая причина |
|------|-----------|------------------|
| `stats/t_snr_estimator.py` | `TypeError: incompatible constructor arguments... Invoked with: <GPUContext device='gfx1201'>` | передаётся HybridGPUContext, ожидается ROCmGPUContext |

**Стратегия**: разобраться какой контекст реально нужен — может быть тест должен использовать `dsp_core.ROCmGPUContext(0)` напрямую, не Hybrid.

### C. Логика теста / API mismatch — 3 теста

| Тест | Сообщение | Корневая причина |
|------|-----------|------------------|
| `heterodyne/t_heterodyne_comparison.py` | `RuntimeError: Dechirp: ref_data size mismatch: expected 8000, got 40000` | `ref_multi.ravel()` даёт 5×8000=40000, нужен один антенный ref или per-antenna |
| `heterodyne/t_heterodyne_step_by_step.py` | Traceback | (диагностировать) |
| `integration/t_hybrid_backend.py` | `AssertionError: Statistics result missing 'mean'` (6 PASS / 2 FAIL) | API изменился — `stats.compute_all()` возвращает другую структуру |

**Стратегия**: подкрутить API-вызовы под текущий C++ API.

### D. Native crashes (C++ exceptions / segfault) — 5 тестов

| Тест | Сообщение | Корневая причина |
|------|-----------|------------------|
| `spectrum/t_process_magnitude_rocm.py` | `terminate: std::bad_variant_access` | C++ `std::variant` не содержит ожидаемый тип |
| `integration/t_fft_integration.py` | (segfault, лог пустой) | (диагностировать через `strace`/`gdb`) |
| `integration/t_signal_gen_integration.py` | (segfault) | (та же) |
| `signal_generators/t_form_signal_rocm.py` | (segfault) | (та же) |
| `stats/t_statistics_float_rocm.py` | (segfault) | (та же) |

**Стратегия**: сложная — нужен gdb или python `faulthandler`. **Опасно**, может потребовать правок C++.

### E. Path-ошибки + другие — 5 тестов

| Тест | Сообщение | Категория |
|------|-----------|-----------|
| `common/io/t_smoke.py` | 8 PASS / 1 FAIL: `repo_root_valid=0 > tol=1` (find_repo_root not seeing .git) | мелкая path-проверка |
| `integration/t_signal_to_spectrum.py` | Traceback | (диагностировать) |
| `integration/t_zero_copy.py` | `AssertionError: Unknown ZeroCopy method: 'HSA Probe (GPU V...'` | строковое сравнение, новый метод не учтён |
| `spectrum/t_filters_stage1.py` | Traceback | (диагностировать) |
| `spectrum/t_iir_plot.py` | Traceback | (диагностировать) |

---

## План работы

### Шаг 1 (~30 мин) — категория A (path) + E (мелкие)
- 4 теста: точечная правка путей или `_PT_DIR`
- 1 тест `common/io/t_smoke.py` — глянуть find_repo_root логику
- 1 тест `integration/t_zero_copy.py` — добавить новую строку в whitelist методов

### Шаг 2 (~1 ч) — категория C (API mismatch)
- `heterodyne_comparison.py` — починить `ref_data` reshape
- `integration/t_hybrid_backend.py` — обновить ожидания на `compute_all()` API

### Шаг 3 (~1 ч) — категория B
- Разобрать почему `stats/t_snr_estimator.py` использует HybridGPUContext

### Шаг 4 (~1-2 ч) — категория D (segfault, опасно)
- Запустить каждый под `python3 -X faulthandler t_*.py` или gdb
- Если корень в C++ — может потребовать правок pybind11 биндингов или kernel
- Если не получается за разумное время — SkipTest + добавить в `MemoryBank/.future/TASK_pybind_review.md`

### Шаг 5 (~30 мин) — финальный отчёт + commit + push
- Обновить `MemoryBank/specs/python/pytest_audit_2026-04-29.md` с финальной сводкой
- Commit правок per-репо, push после OK

---

## Acceptance

- [ ] Каждый из 18 FAIL: либо PASS, либо явный `SkipTest` с причиной
- [ ] Сводный отчёт в audit: PASS X / SKIP Y / FAIL Z (где Z = только то что unfixable без серьёзной работы)
- [ ] Если найдены C++ баги — отдельный таск `TASK_native_fixes_<date>.md`
- [ ] Phase B B5 (commit + push) выполнен

## Артефакты сессии 2026-05-04

- Логи прогона: `/tmp/b3_logs/*.log` (50 файлов)
- Сводка: `/tmp/b3_summary.txt`
- Список тестов: `/tmp/python_tests.txt`

> ⚠ Эти `/tmp/` файлы **не попадают** в git и **исчезают при reboot**. Если решено хранить — перенести в `MemoryBank/specs/python/phase_b_run_logs_2026-05-04/`.

---

*Created: 2026-05-04 by Кодо. Продолжение Phase B после успешного B0/B1/Bs/B3.*
