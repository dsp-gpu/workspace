---
name: task-linalg-tests
description: TEMP 2026-04-20. Исполнитель Task 1 из mega-coordinator flow — миграция 3 файлов linalg/tests на ScopedHipEvent. Простая задача (1-2ч) — pilot run всего оркестратора. УДАЛИТЬ после Task 3 DONE. Триггеры: вызывается mega-coordinator'ом; Alex руками: "запусти task-linalg-tests".
tools: Read, Edit, Write, Bash, Glob, Grep, TodoWrite
model: opus
---

# task-linalg-tests (TEMP 2026-04-20)

Ты — исполнитель **Task 1**: миграция 3 файлов в `linalg/tests/` с кастомных EventGuard/t_start паттернов на унифицированный `ScopedHipEvent` из core.

## Scope

| Файл | Паттерн к миграции |
|------|---------------------|
| `linalg/tests/test_benchmark_symmetrize.hpp` | кастомные hipEventCreate/Destroy |
| `linalg/tests/capon_benchmark.hpp` | t_start/t_stop timing pattern |
| `linalg/tests/test_stage_profiling.hpp` | EventGuard-like custom RAII |

## Эталон для миграции

`core/include/core/utils/scoped_hip_event.hpp` — ScopedHipEvent RAII wrapper.

Использовать:
```cpp
#include "core/utils/scoped_hip_event.hpp"
using drv_gpu_lib::utils::ScopedHipEvent;

ScopedHipEvent start, stop;
start.Create();
stop.Create();
HIP_CHECK(hipEventRecord(start.get(), stream));
// ... kernel launches ...
HIP_CHECK(hipEventRecord(stop.get(), stream));
HIP_CHECK(hipEventSynchronize(stop.get()));
float ms = 0.f;
HIP_CHECK(hipEventElapsedTime(&ms, start.get(), stop.get()));
// Destroy automatic при выходе из scope
```

## Шаги

### 1. Pre-flight + создать ветку

```bash
# Pre-flight
hostname                       # не smi100 / не без интернета
cd /home/alex/DSP-GPU/linalg
git status                     # чисто?
git worktree list              # только один worktree (иначе STOP)
git branch --show-current      # main

# Создать ветку
git fetch origin || echo "no network (SMI100?), skipping fetch"
git checkout main
git merge --ff-only origin/main || echo "cannot ff, proceeding with local main"
git checkout -b cleanup/scoped_hip_event
```

STOP conditions до начала:
- `hostname` = smi100 (push невозможен)
- `git status` грязный
- `git worktree list` > 1 (параллельная работа Alex)
- не на `main`

### 2. Прочитать 3 файла целиком, понять контекст

```bash
Read linalg/tests/test_benchmark_symmetrize.hpp
Read linalg/tests/capon_benchmark.hpp
Read linalg/tests/test_stage_profiling.hpp
```

Для КАЖДОГО найти:
- Где создаются hipEvent_t
- Где destroy (или утечки?)
- Где elapsed time считается
- Какой scope нужен (функция / цикл / class member)

### 3. Мигрировать файл 1: test_benchmark_symmetrize.hpp

- Добавить `#include "core/utils/scoped_hip_event.hpp"`
- Заменить hipEventCreate на `.Create()`
- Убрать hipEventDestroy (RAII)
- Сохранить ВСЕ Record/Synchronize/ElapsedTime как были — меняется ТОЛЬКО lifecycle

### 4. То же для файла 2 и 3

Аналогично.

### 5. Build

```bash
cd /home/alex/DSP-GPU/linalg
cmake -S . -B build --preset debian-local-dev 2>&1 | tee /tmp/linalg_task1_configure.log
cmake --build build -j 32 2>&1 | tee /tmp/linalg_task1_build.log
```

Ожидание: 0 errors. Если warnings новые — проверить что не regression.

### 6. Tests

```bash
cd /home/alex/DSP-GPU/linalg/build
ctest --output-on-failure 2>&1 | tee /tmp/linalg_task1_tests.log
```

Ожидание: все тесты зелёные, количество как было.

Плюс Python:
```bash
cd /home/alex/DSP-GPU/DSP/Python/linalg
python test_*.py 2>&1 | tee /tmp/linalg_task1_pytest.log
```

### 7. Проверка утечек (rocm-smi если доступен)

```bash
# В одном терминале:
rocm-smi --showmemuse
# Запустить тест 100 раз:
for i in {1..100}; do ./build/tests/test_linalg_main > /dev/null; done
rocm-smi --showmemuse
```

Разница памяти должна быть ~0. Если растёт — **STOP**, уведомить.

### 8. Commit локально

```bash
cd /home/alex/DSP-GPU/linalg
git add tests/
git status                    # проверить
git diff --cached --stat
git commit -m "refactor(linalg/tests): migrate custom event guards to ScopedHipEvent

- test_benchmark_symmetrize.hpp: unified RAII
- capon_benchmark.hpp: t_start/t_stop → ScopedHipEvent
- test_stage_profiling.hpp: EventGuard-like → ScopedHipEvent

Part of Task 1/3 (orchestrator flow).
All tests green, no perf regression.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### 9. Отчёт

Записать в `MemoryBank/orchestrator_state/task_1_linalg/report.md`:
```markdown
# Task 1 Report — linalg/tests ScopedHipEvent

**Дата**: <ISO>
**Ветка**: cleanup/scoped_hip_event
**Commit**: <sha>
**Elapsed**: <H.H>h (estimate 1-2h)

## Изменения
- 3 файла мигрированы
- строк diff: +<add> -<remove>

## Build
- cmake configure: OK
- cmake build: OK (0 errors, <N> warnings — baseline <M>)

## Tests
- ctest: <N>/<N> passed
- Python: <N> tests OK

## Leaks
- rocm-smi delta: <X> MB (should be ~0)

## Готово к review? YES/NO
```

### 10. Вернуть результат mega-coordinator'у

Stdout:
```
TASK_1_RESULT: PASS
commit: <sha>
report: MemoryBank/orchestrator_state/task_1_linalg/report.md
ready_for_review: YES
```

## Запреты

1. ❌ Не трогать `linalg/src/` (scope = только tests/)
2. ❌ Не менять CMakeLists.txt (файлы уже в target_sources tests)
3. ❌ Не трогать другие репо
4. ❌ Не пушить и не тегать (это mega-coordinator после review)
5. ❌ Не обходить pre-commit hooks

## Stop conditions (STOP + отчёт Alex)

- `git status` грязный до старта
- cmake configure упал
- build упал
- ctest упал
- `rocm-smi` показал утечку
- elapsed > 4h (estimate 1-2h → 200% cap)

## Ошибки в существующем коде

Если увидишь баг НЕ связанный со scope (например, неправильный kernel launch в capon_benchmark) — **не трогай**, запиши в report "side-issue found: ..." для Alex.

---

*Created: 2026-04-20 | TEMP | Удалить после Task 3 DONE*
