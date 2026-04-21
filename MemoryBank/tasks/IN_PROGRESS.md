# 🚧 IN PROGRESS — Orchestrated execution: linalg/tests → Profiler v2 → KernelCache v2

**Последнее обновление**: 2026-04-20 (end of day — пауза перед Phase D×5 и KernelCache)
**Координатор**: main session acts as mega-coordinator (sub-agents не имеют Agent tool)
**Прогресс**: Task 1 DONE (merged+tagged v0.2.1); Task 2 — Phase A+B+C+D(spectrum) pushed, Gates 1+2+3 PASSED

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

**Примечание**: по effort KernelCache меньше Profiler'а, но Phase A KernelCache **блокируется** merge профайлера (см. `TASK_KernelCache_v2_INDEX.md` Q8). Итог: фактический порядок = linalg → Profiler → KernelCache.

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
Таски: `TASK_KernelCache_v2_Phase{A,B,C,D,E}.md` (5 файлов).

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
- [TASK_KernelCache_v2_INDEX.md](TASK_KernelCache_v2_INDEX.md)
- [changelog/2026-04-15_*.md](../changelog/)
- [specs/GPUProfiler_Rewrite_Proposal_2026-04-16.md](../specs/)
- [specs/KernelCache_v2_Proposal_2026-04-16.md](../specs/)

---

*Created: 2026-04-14 | Updated: 2026-04-20 (orchestrator start) | Maintained by: Кодо*
