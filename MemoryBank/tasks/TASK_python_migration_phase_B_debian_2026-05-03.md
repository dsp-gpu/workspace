# TASK: Python Tests Migration — Phase B (Debian, только сборка + запуск)

**Дата создания**: 2026-04-30 · **Сокращён**: 2026-04-30 (B2 + B6 перенесены в Phase A)
**Целевая дата выполнения**: **2026-05-03+** (на работе, через 4 дня)
**Платформа**: Debian Linux + ROCm 7.2+ + AMD Radeon RX 9070 (gfx1201)
**Автор**: Кодо
**План-источник**: [`MemoryBank/specs/python/migration_plan_2026-04-29.md`](../specs/python/migration_plan_2026-04-29.md)
**Парный таск**: [`TASK_python_migration_phase_A_2026-04-30.md`](TASK_python_migration_phase_A_2026-04-30.md) (всё что можно сделать на Windows)

> **Стратегия (запрос Alex 2026-04-30)**: на Debian — **только то, что НЕВОЗМОЖНО на Windows**: реальная сборка, запуск тестов, валидация POST_BUILD автокопирования. Всё остальное (миграция Python, CMake-патч, sync правил) сделано на Windows в Phase A.

---

## 🎯 Цель

После завершения Phase A (Windows: миграция + CMake-патч + правила) — на Debian/работе:

1. **B0** Pull актуального состояния всех 10 репо
2. **B1** Чистая `cmake --build` — убедиться что сборка проходит и POST_BUILD скопировал 8 `.so` в `DSP/Python/libs/`
3. **B2** Запустить ~51 t_*.py — выявить реальные API mismatch / численные расхождения
4. **B3** Точечные правки (tolerances, мелкие API правки в тестах)
5. **B4** Финальный коммит + push (если были правки)

> **Что УЖЕ сделано в Phase A** (не делать повторно): CMake-патч (бывший B2), обновление правил (бывший B6), `lib`→`libs`, удаление shim.

---

## 📋 Pre-conditions (что должно быть готово до начала)

После Phase A (Windows) запушено в github:
- ✅ 51 t_*.py мигрированы (A2-A4)
- ✅ `DSP/Python/gpuworklib.py` удалён (A5)
- ✅ `gpu_loader.py` обновлён `lib` → `libs` + `_load_gpuworklib()` удалён (A0+A5)
- ✅ `DSP/Python/libs/.gitkeep` запушен (A0)
- ✅ **8 файлов `{repo}/python/CMakeLists.txt`** имеют POST_BUILD-блок (A6)
- ✅ `.claude/rules/04-testing-python.md` + `11-python-bindings.md` синканы (A7)
- ✅ Все 10 репо запушены (A8)

На Debian машине:
- 🔄 Свежий `git pull` во всех 10 репо
- 🔄 Linux + ROCm 7.2+ настроены (`rocminfo` работает, `hipcc --version` отвечает)
- 🔄 Python 3.x + numpy ≥ 2.x + matplotlib (для plot-тестов)

---

## 📋 Подфазы

### 🔵 B0. Pull + sanity setup (~15 мин)

```bash
# 1. Обновить все 10 репо
cd /path/to/DSP-GPU
for repo in . core spectrum stats signal_generators heterodyne linalg radar strategies DSP; do
  git -C "$repo" fetch --all --prune
  git -C "$repo" pull --ff-only
done

# 2. Проверить что все 10 на актуальном main
for repo in . core spectrum stats signal_generators heterodyne linalg radar strategies DSP; do
  echo "== $repo =="
  git -C "$repo" log -1 --oneline
done

# 3. Sanity Phase A артефактов
ls DSP/Python/libs/.gitkeep                                    # ✅ должен быть
test -f DSP/Python/gpuworklib.py && echo "WARN: shim still exists" || echo "OK shim gone"
grep -q "libs" DSP/Python/common/gpu_loader.py && echo "OK libs/" || echo "FAIL: lib still"
grep -q "DSP_DEPLOY_PYTHON_LIB" core/python/CMakeLists.txt && echo "OK CMake patch" || echo "FAIL: no patch"
```

**Acceptance**:
- [ ] Все 10 репо на main, ahead=0, behind=0
- [ ] `DSP/Python/libs/` существует
- [ ] `DSP/Python/gpuworklib.py` **отсутствует**
- [ ] `gpu_loader.py` ссылается на `libs/`
- [ ] CMake-патч присутствует во всех 8 `python/CMakeLists.txt`

> ⚠ Если хоть один пункт FAIL — Phase A не доделан. Останавливаемся, возвращаемся в Phase A.

---

### 🔵 B1. Чистая сборка с CMake-патчем (~30-60 мин)

**Цель**: проверить что код Phase A собирается + POST_BUILD автокопирование работает.

```bash
# 1. Очистить старые артефакты
rm -rf build/
rm -f DSP/Python/libs/*.so

# 2. Configure + сборка
cmake --preset debian-local-dev
cmake --build --preset debian-release -j$(nproc)

# 3. Проверка POST_BUILD автокопирования
ls -la DSP/Python/libs/
# Ожидание: 8 .so файлов автоматически (без явного cmake --install)
```

**Если в `libs/` НЕ появились `.so`** — проблема в CMake-патче (Phase A6):
1. Проверить `cmake --build` логи на `Deploy dsp_<X>` сообщения.
2. Проверить что таргет `dsp_<X>` реально создаётся (в build/ есть `.so`).
3. Проверить путь `${CMAKE_CURRENT_LIST_DIR}/../../DSP/Python/libs` руками.

**Acceptance**:
- [ ] `cmake --build` успешен
- [ ] `DSP/Python/libs/` содержит 8 `.so` (автоматически через POST_BUILD)
- [ ] Логи сборки содержат `Deploy dsp_<module>` сообщения

---

### 🔵 B2. Smoke-запуск эталонов (~15 мин)

Перед полным прогоном — 2-3 эталонных теста (мигрированы первыми в Phase A, проверены руками):

```bash
python3 DSP/Python/spectrum/t_lch_farrow_rocm.py
python3 DSP/Python/spectrum/t_spectrum_find_all_maxima_rocm.py
python3 DSP/Python/signal_generators/t_lfm_analytical_delay.py
```

**Если эти 3 PASS** — паттерн Phase A работает, идём в B3 на полный прогон.
**Если падают** — паттерн миграции бажный → разобрать первый failure → определить нужны ли правки в шаблоне → fix and retry. Это самый ценный сигнал на этом этапе.

**Acceptance**:
- [ ] 3 эталонных теста PASS (или explicit SkipTest по causes отличным от миграции)

---

### 🔵 B3. Полный прогон + опция OFF (~1-2 ч)

```bash
# Полный прогон по модулям
for module in stats signal_generators spectrum linalg radar heterodyne strategies integration common; do
  echo "== $module =="
  for test in DSP/Python/$module/t_*.py DSP/Python/$module/**/t_*.py; do
    [ -f "$test" ] || continue
    echo "-- $test --"
    python3 "$test" 2>&1 | tail -3
  done
done

# Sub-репо тесты
python3 spectrum/python/t_cpu_fft.py
python3 linalg/python/t_linalg.py
python3 radar/python/t_radar.py
python3 strategies/python/t_strategies.py

# Проверка OFF-опции
rm -f DSP/Python/libs/*.so
rm -rf build/
cmake --preset debian-local-dev -DDSP_DEPLOY_PYTHON_LIB=OFF
cmake --build --preset debian-release -j$(nproc)
ls DSP/Python/libs/  # Ожидание: только .gitkeep, .so НЕТ
```

**Acceptance**:
- [ ] Все ~51 t_*.py запускаются (PASS / SkipTest / зафиксированный FAIL)
- [ ] `DSP_DEPLOY_PYTHON_LIB=OFF` отключает автокопирование

---

### 🔵 B4. Исправление API mismatches (~1-2 ч)

**Цель**: разобрать падения тестов на реальном GPU и поправить **точечно** в `t_*.py`.

**Известные точки внимания**:

1. **`heterodyne/t_*.py`** (4 файла) — переписаны на новый API на Windows, но **не проверены** на железе.
   - Если PASS — TODO-маркер в docstring можно оставить (документирует историю миграции).
   - Если FAIL по точности — подкрутить `atol` в `np.allclose(...)`.
   - Если FAIL по логике (неверная reshape, неверная axis для FFT) — поправить точечно.

2. **`integration/t_*.py`** — пайплайны через несколько репо. Возможны cascade failures: если модуль X сломан → все зависящие падают.

3. **Tests с tight tolerance** — на gfx1201 (RDNA4) численная точность float32 может отличаться от gfx908 (CDNA1) или Windows-моделей. Стратегия: при первом FAIL по точности — увеличить `atol` в **2-5×** от исходного, не больше.

4. **Data files** — проверить что все нужные скопированы в `DSP/Python/<module>/data/`. Если отсутствуют — поправить путь или донести.

5. **`_PT_DIR` в глубоких файлах** — если `import common.runner` падает, проверить количество `dirname()` (стандарт=2, `ai_pipeline/`=3, `common/io/`=3, sub-репо=другая логика).

**Стратегия**:
- Запускать тесты по одному, читать stack trace.
- Поправить точечно (одно изменение → перезапуск).
- **НЕ править pybind C++** — если нужна правка pybind, фиксируем в новом таске и SkipTest для затронутых тестов.

**Acceptance**:
- [ ] Все ~51 t_*.py запускаются → PASS или явный SKIP с понятной причиной
- [ ] Список «надо переписать pybind» (если есть) — в новый файл `MemoryBank/tasks/TASK_pybind_fixes_<date>.md`

---

### 🔵 B5. Commit & Push финальных правок (~15 мин)

Если в B4 правились тесты — коммит в DSP-репо (или sub-репо для `python/t_*.py`):

```bash
git -C DSP add Python/<module>/t_*.py
git -C DSP commit -m "test(<module>): tune atol / fix path on gfx1201 (Phase B validation)

- N tests: atol increased X→Y (float32 precision on RDNA4)
- M tests: fix data path / FFT axis"
```

**Если правок не было** — Phase B завершается без новых коммитов. Просто отчёт в audit:

```bash
# Обновить MemoryBank/specs/python/pytest_audit_2026-04-29.md:
# Финальный раздел «Phase B results 2026-05-XX»: PASS X / SKIP Y / FAIL Z
```

**Push** (если были правки) по правилу [16-github-sync](../../.claude/rules/16-github-sync.md) — переспрос Alex'а.

**Acceptance**:
- [ ] Если правки были — коммит + push в затронутые репо (через переспрос)
- [ ] `MemoryBank/specs/python/pytest_audit_2026-04-29.md` обновлён с финальной сводкой
- [ ] Если нашли pybind issues — отдельный таск создан

---

## ⏱️ Общая оценка (после переноса B2/B6 в Phase A)

| Подфаза | Время |
|---------|-------|
| B0. Pull + sanity setup | ~15 мин |
| B1. Чистая сборка с CMake-патчем | ~30-60 мин |
| B2. Smoke-запуск эталонов | ~15 мин |
| B3. Полный прогон + OFF-опция | ~1-2 ч |
| B4. Исправление API mismatches | ~1-2 ч (зависит) |
| B5. Финальный коммит + push (если нужен) | ~15 мин + переспрос |
| **Итого** | **~3-5 ч** на работе |

> Сравнение с предыдущей версией: было ~3-6 ч (с B2 CMake-patch + B6 правила), стало ~3-5 ч после переноса этих фаз в Windows. Главный win — нет ручной правки 8 CMakeLists.txt на Debian после долгой дороги.

---

## ⚠️ Риски и митигация

| Риск | Митигация |
|------|-----------|
| `cmake --preset debian-local-dev` упал | Только Python тесты + CMake auto-deploy блок — C++ источники не менялись. Проверить что Phase A6 блок не имеет syntax-ошибок. |
| `DSP/Python/libs/` пустая после `cmake --build` | (1) Проверить `DSP_DEPLOY_PYTHON_LIB=ON` — это default; (2) Проверить логи на `Deploy dsp_<X>`; (3) Проверить путь `${CMAKE_CURRENT_LIST_DIR}/../../DSP/Python/libs` руками. |
| Heterodyne тесты падают на численной точности | Подкрутить `atol` в `np.allclose(..., atol=...)` — float32 на gfx1201 vs Windows-моделях может расходиться. Не больше 5× от исходного. |
| Какой-то класс из pybind не работает на gfx1201 | SkipTest + report в новый таск `TASK_pybind_fixes_<date>.md`; не блокировать Phase B. |
| Sub-репо тесты (`linalg/python/t_linalg.py`) не находят `common.runner` | Проверить `_PT_DIR` (sub-репо шаблон A2.8) — путь к `DSP/Python/`. |
| Эталонные spectrum-тесты падают | Phase A паттерн миграции бажный → срочно вернуться к Phase A, проверить Edit'ы. |
| `B0` показал что Phase A не доделан | СТОП — вернуться в Phase A, доделать (ничего на Debian пока не правим). |

---

## 🚫 Что НЕ делаем

- ❌ Не правим pybind C++ код (`py_*.hpp` / `dsp_*_module.cpp`) — отдельный таск
- ❌ Не правим C++ ядра (HIP) — совсем другая история
- ❌ **Не правим CMake** — это уже сделано в Phase A6. Если нужны правки CMake — отдельный OK Alex'а.
- ❌ **Не правим правила** — это уже сделано в Phase A7.
- ❌ Не делаем повторно миграцию `t_*.py` — Phase A это сделал.
- ❌ Не пушим без переспроса (правило 16-github-sync).

---

## 🔗 Связанные документы

- План: [`MemoryBank/specs/python/migration_plan_2026-04-29.md`](../specs/python/migration_plan_2026-04-29.md)
- Ревью: [`MemoryBank/specs/python/migration_plan_review_2026-04-30.md`](../specs/python/migration_plan_review_2026-04-30.md)
- Парный таск (Phase A): [`TASK_python_migration_phase_A_2026-04-30.md`](TASK_python_migration_phase_A_2026-04-30.md)
- Правила: [`.claude/rules/12-cmake-build.md`](../../.claude/rules/12-cmake-build.md), [`.claude/rules/16-github-sync.md`](../../.claude/rules/16-github-sync.md)

---

## 🚀 Старт

**Pre-conditions**:
- Phase A полностью завершён включая A6 (CMake) и A7 (rules) — см. парный таск
- Свежий pull всех 10 репо на Debian
- ROCm 7.2+ работает

**Порядок**: B0 (sanity) → B1 (build) → B2 (smoke 3 эталона) → B3 (полный прогон) → B4 (точечные правки) → B5 (commit + push если нужно)

**Первый шаг**: B0 — `git pull` + sanity-чек 5 артефактов Phase A (libs/, отсутствие shim, libs в gpu_loader.py, CMake-патч).

*Открывается на работе через 4 дня (2026-05-03+).*

---

## 📜 Changelog

| Дата | Изменение |
|------|-----------|
| 2026-04-30 | Создан таск (после ревью плана) |
| 2026-04-30 | Сокращён по запросу Alex «максимум на Windows»: B2 (CMake-патч) и B6 (rules) перенесены в Phase A. Здесь остались: B0 sanity, B1 чистая сборка, B2 smoke эталонов (новый), B3 полный прогон + OFF-опция, B4 точечные правки, B5 финальный коммит. Время: ~3-5 ч. |

---

*Created: 2026-04-30 | For: 2026-05-03+ (Debian) | Last updated: 2026-04-30 | Maintained by: Кодо*
