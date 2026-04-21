# Deep Review — Task 1 (linalg/tests ScopedHipEvent migration)

**Дата**: 2026-04-20
**Diff**: `main..cleanup/scoped_hip_event`
**Commit**: `f0582167ae09245d03b9937879ca04627c222da0`
**Verdict**: **PASS**
**Thoughts used**: 7 (через `mcp__sequential-thinking__sequentialthinking`)

---

## Acceptance Criteria Check (spec `task-linalg-tests.md` — Scope + Шаги)

| # | Критерий | Статус | Проверка |
|---|----------|--------|----------|
| 1 | `test_benchmark_symmetrize.hpp` — EvGuard → ScopedHipEvent | ✅ | diff: строки 101-114 — inline `struct EvGuard` удалён, заменён на `ScopedHipEvent ev_start, ev_stop;` |
| 2 | `capon_benchmark.hpp` — manual create/destroy → ScopedHipEvent (CaponRelief + CaponBeamform) | ✅ | diff: обе `ExecuteKernelTimed` функции мигрированы, manual `hipEventCreate/Destroy` удалены |
| 3 | `test_stage_profiling.hpp` — EventGuard8/8C → ScopedHipEvent[8] (RunStageProfiling + RunStageProfilingClean) | ✅ | diff: обе функции, `struct EventGuard8` и `EventGuard8C` удалены, заменены на `ScopedHipEvent e[8]` |
| 4 | include `<core/services/scoped_hip_event.hpp>` (не `utils/`!) | ✅ | все 3 файла содержат `#include <core/services/scoped_hip_event.hpp>` |
| 5 | Все Record/Synchronize/ElapsedTime сохранены (только lifecycle меняется) | ✅ | diff: логика неизменна — лишь `.get()` для передачи `hipEvent_t` |
| 6 | Scope = tests/ only (не `src/`, не `CMakeLists.txt`) | ✅ | `git diff --stat`: только 3 файла `tests/*.hpp` |
| 7 | Commit корректно оформлен, Co-Authored-By Claude | ✅ | `git show` подтверждает |

---

## RAII / Resource Safety
✅ **PASS** — `grep hipEventCreate|hipEventDestroy` по `linalg/tests/` → `No matches found`. Все raw-вызовы устранены, lifecycle через RAII-деструктор `ScopedHipEvent`. Exception-safe: при throw из `ComputeRelief`/`AdaptiveBeamform`/`Invert` события корректно освобождаются. Массив `ScopedHipEvent e[8]` — каждый элемент автоматически уничтожается (array destruction rule C++).

## Concurrency
✅ **PASS** — все события создаются локально в функциях (per-call/per-scope), без shared state между потоками. `ScopedHipEvent` — move-only (copy запрещён), случайный sharing невозможен. В benchmark-методах `ExecuteKernelTimed()` и stage-profiling функциях создание per-invocation — race-conditions исключены by design.

## CLAUDE.md Compliance
✅ **PASS**
- CMake: **не тронут** (`git log main..cleanup/scoped_hip_event -- CMakeLists.txt cmake/` → пусто)
- pytest: **не добавлен** (grep по diff — пусто)
- `#ifdef _WIN32`: отсутствует (main-ветка)
- `std::cout` в production: не добавлен (tests-only файлы, никаких новых cout)
- Секретов/токенов в diff нет

## Regressions / Semantic Equivalence
✅ **PASS**
- `ScopedHipEvent::Create()` внутри вызывает `hipEventCreate(&event_)` — семантически эквивалентно raw вызову
- `.get()` возвращает тот же `hipEvent_t` — все последующие вызовы `hipEventRecord/Synchronize/ElapsedTime` получают тот же дескриптор
- Количество и порядок Record/Synchronize/ElapsedTime сохранены полностью
- Commit message: `test_linalg_main: ALL TESTS PASSED (exit 0)`
- Python fails (2) — pre-existing на `main` до коммита (per review prompt), не regression

## Issues
**(нет блокеров)**

### Minor / Nice-to-have (не влияет на вердикт)
1. **Spec vs реальность**: spec ссылался на `core/utils/scoped_hip_event.hpp` + namespace `drv_gpu_lib::utils::ScopedHipEvent`, реальный путь `core/services/` + namespace `drv_gpu_lib` (без `utils::`). Исполнитель правильно адаптировался — это улучшение, не отклонение.
2. **Return value `.Create()`**: игнорируется (`hipError_t`) — semantically equivalent к оригиналу (raw `hipEventCreate` тоже не проверялся). *Suggestion*: рассмотреть `CreateOrThrow()` в будущем refactoring-проходе для defensive-coding.

---

## Summary

Чистая, аккуратная миграция 3 файлов `linalg/tests/` с трёх разных кастомных паттернов (`EvGuard`, manual create/destroy, `EventGuard8/8C`) на унифицированный `drv_gpu_lib::ScopedHipEvent`. Diff минимальный (+68/-84 строк), scope строго tests/, CMake не тронут, семантика идентична, RAII гарантирует cleanup при исключениях. Pilot run оркестратора прошёл корректно — готово к merge.

**TASK_1_REVIEW: PASS → ready_to_merge=YES**
