# 🚧 IN PROGRESS

**Последнее обновление**: 2026-04-30 (Python migration tasks created)
**Прогресс**:
- 🆕 **Python tests migration** — Phase A0 DONE, Phase A1-A5 ready (Windows), Phase B (Debian) через 4 дня
- Task 2 (Profiler v2) — code DONE, остался Closeout (доки + опц. CI + Q7)
- Task 3 (KernelCache v2) — code DONE, остался **Closeout** (доки + git commit + опц. acceptance)

## 🆕 Python Tests Migration (2 таска) — приоритет

| # | Таск | Effort | GPU нужен | Платформа | Статус |
|---|------|-------:|-----------|-----------|--------|
| 1 | [TASK_python_migration_phase_A_2026-04-30.md](TASK_python_migration_phase_A_2026-04-30.md) — мигрировать 51 t_*.py с `gpuworklib` на `dsp_*` модули + `GPULoader.setup_path()` + удалить shim в A5 | ~10 ч (две сессии) | ❌ нет (Windows, только редактирование) | Windows | 📋 готов к старту (A0 ✅, ждёт OK на A1) |
| 2 | [TASK_python_migration_phase_B_debian_2026-05-03.md](TASK_python_migration_phase_B_debian_2026-05-03.md) — CMake-патч `auto-deploy` × 8 репо + проверка миграции на ROCm + снять SkipTest с heterodyne | ~3-6 ч | ✅ да (Debian + RX 9070) | Debian (работа) | 📋 ожидает 2026-05-03+, depends on Phase A |

**Что СДЕЛАНО** в текущей сессии (2026-04-29 / 2026-04-30):
- 60 переименований `test_*.py` → `t_*.py` (PyCharm autodetect fix)
- 7 conftest.py → factories.py
- 3 файла spectrum мигрированы на `dsp_*` API: `t_lch_farrow`, `t_lch_farrow_rocm`, `t_spectrum_find_all_maxima_rocm`
- Phase A0 preflight DONE: `DSP/Python/libs/.gitkeep` + `gpu_loader.py` `lib`→`libs`
- Глубокое ревью плана: `MemoryBank/specs/python/migration_plan_review_2026-04-30.md`

**Документы**: план [`migration_plan_2026-04-29.md`](../specs/python/migration_plan_2026-04-29.md), аудит [`pytest_audit_2026-04-29.md`](../specs/python/pytest_audit_2026-04-29.md), ревью [`migration_plan_review_2026-04-30.md`](../specs/python/migration_plan_review_2026-04-30.md).

## 🟡 KernelCache v2 Closeout (1 таск)

| # | Таск | Effort | GPU нужен | Статус |
|---|------|-------:|-----------|--------|
| 1 | [TASK_KernelCache_v2_Closeout_2026-04-27.md](TASK_KernelCache_v2_Closeout_2026-04-27.md) — MemoryBank sync + `core/Doc/Services/Full.md` + git commit (12 fixes + E1 CLI wire) + опц. tag v0.3.0 / rocm-smi leak / DSP Python smoke | 3-5 ч | ❌ нет (опц. да для leak/smoke) | 📋 готов к работе |

**Что СДЕЛАНО 2026-04-27** (для контекста — детали в Closeout-таске):
- Phase E1: `dsp-cache-list` CLI wired через `option(DSP_BUILD_CLI_TOOLS OFF)` в `core/CMakeLists.txt`
- Deep review by `deep-reviewer` agent → 12 issues → все исправлены (2 HIGH / 6 MED / 4 LOW)
- Golden hash regression test `TestFnv1aGoldenRegression` (G3 Gate locked: `0x937e8a99cd37b6dbULL`)
- Build + tests на Debian + RX 9070 (gfx1201): core compile_key 6/6 + kernel_cache 8/8, spectrum 10 PASS, signal_generators 6/6, linalg "ALL TESTS PASSED", strategies, radar, stats, heterodyne — все зелёные

**Архив старых TASK-файлов** (Phase A-E + INDEX + HANDOFF, 7 файлов): `MemoryBank/archive/kernel_cache_v2_2026-04-27/`. Все фазы смержены в main 5 репо ещё 2026-04-22 вечером, сборка/тесты подтверждены 2026-04-27.

## 🟡 Profiler v2 Closeout (3 таска)

| # | Таск | Effort | GPU нужен | Статус |
|---|------|-------:|-----------|--------|
| 1 | [TASK_Profiler_v2_Documentation.md](TASK_Profiler_v2_Documentation.md) — Full.md + spec archive + Doxygen + sessions_done + bench-комменты | 4-6 ч | ❌ нет (можно дома) | 📋 готов к работе |
| 2 | [TASK_Profiler_v2_CI_RunSerial.md](TASK_Profiler_v2_CI_RunSerial.md) — RUN_SERIAL polish + опц. CI workflow | 1-2 ч | ❌ нет | 📋 ждёт OK Alex по варианту |
| 3 | [TASK_Profiler_v2_Roctracer_Q7.md](TASK_Profiler_v2_Roctracer_Q7.md) — full 5-field GPU timing через roctracer | 16-24 ч | ✅ да (Debian + RX 9070 / MI100) | 📋 ждёт решения «когда» |

**Index**: [TASK_Profiler_v2_INDEX.md](TASK_Profiler_v2_INDEX.md) (актуализирован 2026-04-27, старые Phase A-E таски удалены как мусор).

## ✅ 2026-04-27 — Profiler v2 RemoveLegacy CLOSED

Финальный снос `@deprecated GPUProfiler`. ProfilingFacade — единственная точка
профилирования. core 123 PASS / 0 FAIL, все 7 dep-репо собраны зелёными.
Подробности → `sessions/2026-04-27.md` (late section).

## ⏸ 2026-04-20 PAUSE — завтра продолжаем

Состояние зафиксировано в `MemoryBank/orchestrator_state/STATE.md` секция "RESUME TOMORROW".

Коротко:
- ✅ 7 из 8 фаз Profiler v2 сделаны, все в origin на `new_profiler` (core + spectrum)
- ⏸ Осталось: Phase D для 5 репо (stats, signal_generators, heterodyne, linalg, strategies), Phase E, merge × 7, tag v0.3.0-rc1
- ⏸ Потом Task 3 KernelCache v2 (следующий день после финала Profiler v2)

---

## ✅ Фаза 4 — Linux GPU тестирование (DONE 2026-04-16)

Все 8 репо собраны на Linux (Debian + Radeon 9070 / ROCm 7.2+):

| Репо | libdsp*.a | Commit | Tests |
|------|-----------|--------|-------|
| core | libDspCore.a (10:14) | `5bbe654 docs` | ✅ |
| spectrum | libDspSpectrum.a (11:29) | `f1839e3 docs` + `19c8efa deep review fixes` | ✅ + pocketfft |
| stats | libDspStats.a (12:15) | `c00a82b deep review` | ✅ 21/21 + Python SNR |
| signal_generators | libDspSignalGenerators.a (12:25) | `d933ef5 deep review` | ✅ 11/11 + Python 4 |
| heterodyne | libDspHeterodyne.a (12:34) | `1550fae deep review` | ✅ 11/11 + Python 2 |
| linalg | libDspLinalg.a (14:17) | `119b8f5 deep review` | ✅ C++ + Python |
| radar | libDspRadar.a (14:50) | `a598ef0 deep review` | ✅ C++ + Python |
| strategies | libDspStrategies.a (15:03) | `f4e945b deep review` | ✅ C++ + Python |

Плюс: импорт документации из GPUWorkLib (8 коммитов `docs: импорт документации`).

---

## 🆕 2026-04-20 — Orchestrated execution (новый поток)

**Решение Alex**: 3 задачи делать оркестрантом в Opus 4.7, ревью после каждой через `sequential-thinking` (глубокий анализ). Push/tag автоматический — только после подтверждённого ревью + тестов.

### Порядок (по нарастанию сложности, с учётом зависимостей)

| # | Задача | Effort | Ветка | Depends |
|---|--------|-------:|-------|---------|
| 1 | **linalg/tests** — 3 файла ScopedHipEvent | 1-2 ч | `linalg/cleanup` (new) | — |
| 2 | **GPUProfiler v2** — 8 фаз (A→E) | 28-40 ч | `new_profiler` (все 7 репо: core+6) | task 1 |
| 3 | **KernelCache v2** — 5 фаз (A→E) | 15-22 ч | `kernel_cache_v2` (core + 4 репо) | task 2 merged |

**Примечание**: по effort KernelCache меньше Profiler'а, но Phase A KernelCache **блокируется** merge профайлера (см. `archive/kernel_cache_v2_2026-04-27/TASK_KernelCache_v2_INDEX.md` Q8). Итог: фактический порядок = linalg → Profiler → KernelCache.

### Scope task 1 (linalg/tests — найдено grep'ом 2026-04-20)

- `linalg/tests/test_benchmark_symmetrize.hpp`
- `linalg/tests/capon_benchmark.hpp`
- `linalg/tests/test_stage_profiling.hpp`

Перевести кастомные EventGuard/t_start паттерны на унифицированный `ScopedHipEvent` из core.

### Scope task 2 (Profiler v2)

Spec: `MemoryBank/specs/GPUProfiler_Rewrite_Proposal_2026-04-16.md` + Round 3 review.
Таски: `TASK_Profiler_v2_Phase{A,B1,B2,B3,B4,C,D,E}.md` (8 файлов).
**Эмуляция** (по Alex): каркас — mock-интерфейс с fake-данными → проверка full pipeline → потом реальное подключение в `spectrum/`.

### Scope task 3 (KernelCache v2)

Spec: `MemoryBank/specs/KernelCache_v2_Proposal_2026-04-16.md` (v3 clean-slate).
Таски: `MemoryBank/archive/kernel_cache_v2_2026-04-27/TASK_KernelCache_v2_Phase{A,B,C,D,E}.md` (5 файлов, **completed** + смержены в main 2026-04-22, проверены 2026-04-27).

---

## 🤖 Оркестрант — дизайн (в работе)

**Архитектура**: 3 temp task-агента + 1 meta-coordinator (удалить после).

```
.claude/agents/
├── mega-coordinator.md       ← оркестратор 3 задач, review-gate, push/tag
├── task-linalg-tests.md      ← temp-агент для задачи 1
├── task-profiler-v2.md       ← temp-агент для задачи 2 (Profiler, 8 фаз)
└── task-kernelcache-v2.md    ← temp-агент для задачи 3 (KernelCache, 5 фаз)
```

**Review через sequential-thinking**: после каждой задачи — глубокий анализ (риски, корректность, регрессии).

**Push/tag автономный** при условиях:
1. Все тесты зелёные (ctest + Python)
2. sequential-thinking review = PASS
3. Нет запрошенных CMake-правок за пределами `target_sources`

Если какое-то условие не выполнено → orchestrator STOP, пишет отчёт в `sessions/` и ждёт Alex.

---

## ⏸ Отложено (не блокирует поток)

| # | Задача | Почему |
|---|--------|--------|
| 1 | Doxygen Фаза 5 | После KernelCache v2 merge |
| 2 | Git tag v0.2.0 | После KernelCache v2 merge (финальный tag на все репо) |

---

## 🔗 Сопутствующие документы

- [MASTER_INDEX.md](../MASTER_INDEX.md)
- [TASK_Profiler_v2_INDEX.md](TASK_Profiler_v2_INDEX.md)
- [TASK_KernelCache_v2_Closeout_2026-04-27.md](TASK_KernelCache_v2_Closeout_2026-04-27.md) (active)
- [archive/kernel_cache_v2_2026-04-27/](../archive/kernel_cache_v2_2026-04-27/) (closed phases)
- [changelog/2026-04.md](../changelog/2026-04.md)
- [specs/GPUProfiler_Rewrite_Proposal_2026-04-16.md](../specs/)
- [specs/KernelCache_v2_Proposal_2026-04-16.md](../specs/)

---

*Created: 2026-04-14 | Updated: 2026-04-20 (orchestrator start) | Maintained by: Кодо*
