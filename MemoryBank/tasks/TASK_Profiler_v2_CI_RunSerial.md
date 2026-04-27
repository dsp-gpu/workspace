# TASK: Profiler v2 — CI workflow + RUN_SERIAL polish

> **Дата создания**: 2026-04-27
> **Effort**: 1-2 часа
> **Scope**: `core/tests/CMakeLists.txt` (RUN_SERIAL) + опционально `workspace/.github/workflows/`
> **Зависит от**: `TASK_Profiler_v2_RemoveLegacy DONE`
> **Требует**: явный OK Alex на CMake-правку И на CI-workflow (отдельные OK)

---

## 🎯 Цель

Закрыть два мелких build-system пункта Phase E, отложенных «до OK Alex»:

1. **RUN_SERIAL** для тестов которые трогают singleton `ProfilingFacade::Reset()` —
   `test_golden_export` + `test_quality_gates`. Без RUN_SERIAL под `ctest -j` они
   могут race'иться с другими тестами на singleton'е.
2. **CI workflow `new_profiler_integration.yml`** — было запланировано в Phase E (R8).
   Сейчас ветка `new_profiler` уже мёрджена → нужно решить: оставить workflow для
   будущих больших фич ProfilingFacade, или **закрыть как «неактуально»**.

Оба пункта **не блокируют** работу профайлера в production — это hygiene.

---

## 📋 Шаги

### CI1. RUN_SERIAL для golden / quality-gates тестов

**Файл**: `core/tests/CMakeLists.txt` (точное место — после `add_executable(test_core_main ...)`)

**Текущая проблема**:
- `test_golden_export.hpp` и `test_quality_gates.hpp` вызывают
  `ProfilingFacade::GetInstance().Reset()` и пишут в singleton.
- Если параллельно (под `ctest -j$(nproc)`) другой тест (например
  `test_profiling_facade.hpp`) тоже пишет в Facade — записи смешиваются → golden
  падает или quality-gates ловят чужие латенси.
- Под `test_core_main` сейчас всё в одном бинарнике с последовательным `run()`
  → race'а нет. Но если Alex когда-то разнесёт тесты по отдельным ctest-target'ам
  (или включит ctest parallel-by-test), словим race.

**Два варианта решения** (выбрать с Alex):

**Вариант A (минимально инвазивный) — RUN_SERIAL property**:

```cmake
# в core/tests/CMakeLists.txt после add_test(...)
if (TARGET test_core_main)
  set_tests_properties(test_core_main PROPERTIES
    LABELS "profiler_v2;serial"
  )
endif()
```

Если ctest-тестов несколько — пометить только профайлер-зависимые:

```cmake
add_test(NAME profiler_golden     COMMAND test_core_main --gtest_filter=Golden*)
add_test(NAME profiler_quality    COMMAND test_core_main --gtest_filter=Quality*)
set_tests_properties(profiler_golden profiler_quality PROPERTIES RUN_SERIAL TRUE)
```

**Вариант B (без CMake-правки) — отдельный label + документировать**:

В `06-profiling.md` или `core/tests/README.md` добавить раздел:
> ⚠️ Тесты, трогающие `ProfilingFacade::Reset()`, **не параллелятся**. Запускать
> через `ctest -L serial` или `ctest -j 1`.

И **не добавлять RUN_SERIAL в CMake**. Защищаемся документацией.

**Вариант C (зачем нам это вообще)**: текущее состояние (один бинарник
`test_core_main`, тесты вызываются последовательно из `drvgpu_all_test::run()`)
**уже** последовательное. RUN_SERIAL имеет смысл **только** если разнесём тесты
по отдельным ctest-target'ам. Возможно проще зафиксировать «один бинарник =
последовательный прогон» как архитектурное решение и **закрыть пункт без
правки**.

**Рекомендация**: Вариант **C** + Вариант **B** (доку пометить). Минимум кода,
максимум ясности.

**Шаги выполнения**:
1. Открыть `core/tests/CMakeLists.txt` — посмотреть текущую структуру
   (`Read core/tests/CMakeLists.txt`).
2. Если уже один `add_test(NAME ... COMMAND test_core_main)` — Вариант C, ничего
   не правим. Добавить комментарий в CMakeLists:
   ```cmake
   # Один бинарник test_core_main выполняет все тесты последовательно через
   # drvgpu_all_test::run() — RUN_SERIAL property не нужен. Тесты, трогающие
   # singleton ProfilingFacade (golden / quality-gates), безопасны в этой модели.
   ```
3. В `06-profiling.md` дописать раздел «Параллельный прогон» (Вариант B).
4. Если структура другая (несколько add_test) — выбрать Вариант A с Alex.

**Acceptance**:
- `cmake --build core/build` зелёный после правки (если правка была)
- `ctest --test-dir core/build` (всё ещё) зелёный
- Комментарий + документация на месте

---

### CI2. CI workflow `new_profiler_integration.yml` — решение

**Контекст**: в `TASK_Profiler_v2_PhaseE_Polish.md` (удалён в Closeout) был пункт
E6 — добавить workflow для ветки `new_profiler`. На момент 2026-04-27 ветка уже
мёрджена в main, теги `v0.3.0` стоят.

**Решение нужно от Alex**: оставить workflow «на будущие большие фичи» или
закрыть как done by elimination?

**Вариант A — оставить и ввести в работу**:

`workspace/.github/workflows/profiler_integration.yml` (переименовать из старого):

```yaml
name: profiler-v2 cross-repo integration
on:
  push:
    branches: [main]
    paths:
      - 'core/include/core/services/profiling/**'
      - 'core/src/services/profiling/**'
      - 'core/include/core/services/profiling_types.hpp'
  workflow_dispatch:

jobs:
  build_all_repos:
    runs-on: [self-hosted, rocm, debian]
    steps:
      - uses: actions/checkout@v4
        with: { path: workspace }

      - name: Clone all repos
        run: |
          for repo in core spectrum stats signal_generators heterodyne \
                     linalg strategies radar DSP; do
            git clone https://github.com/dsp-gpu/$repo.git $repo
          done

      - name: Build core
        run: |
          cd core
          cmake --preset debian-local-dev
          cmake --build build -j$(nproc)
          ctest --test-dir build --output-on-failure

      - name: Build dep-repos
        run: |
          for repo in spectrum stats signal_generators heterodyne \
                     linalg strategies radar; do
            cd $repo
            cmake --preset debian-local-dev
            cmake --build build -j$(nproc)
            ctest --test-dir build --output-on-failure || exit 1
            cd -
          done
```

**Зачем это нужно**:
- Любая правка в `core/services/profiling/**` автоматически проверяется на
  всех 8 dep-репо
- Видим регрессии до того как Alex вручную билдит каждый репо

**Вариант B — закрыть как «не нужен»**:
- ProfilingFacade стабилизирован, фазы A→E DONE, изменения будут редкие
- Self-hosted runner с ROCm стоит ресурсов
- Регрессии ловятся `repo-sync agent`'ом по требованию

**Рекомендация**: Вариант **B** (закрыть). Workflow добавить **только** если
пойдём в Q7 (roctracer) — это будет крупная переписка collector'а с риском
регрессий.

**Шаги** (если Вариант A):
1. Спросить Alex: «делаем CI?» (один вопрос, один ответ).
2. Если да — создать `workspace/.github/workflows/profiler_integration.yml`.
3. **Перед push** — DIFF в чат, ждать OK.
4. Push в workspace репо. Дождаться первого прогона (manual trigger).
5. Если зелёный — закрыть пункт. Если красный — диагностировать (отдельный таск).

**Acceptance** (Вариант A):
- Workflow создан и запущен вручную
- Первый прогон зелёный
- В `MemoryBank/sessions/profiler_v2_done_*.md` есть упоминание workflow

**Acceptance** (Вариант B):
- В `TASK_Profiler_v2_INDEX.md` пункт E6 переведён в «closed by elimination»
- В `MemoryBank/sessions/profiler_v2_done_*.md` обоснование решения

---

## 🚦 Порядок

```
CI1 (RUN_SERIAL) — быстрый, дешёвый, можно делать сейчас (Вариант C — нулевая инвазия)
   ↓
CI2 (workflow) — спросить Alex, скорее закрыть как «не нужен сейчас»
```

---

## 🚫 Запреты

- **`.github/workflows/` НЕ создавать** без OK Alex (CI billing + runner-минуты).
- **CMake не трогать** без OK Alex (правило `12-cmake-build.md`).
- **Не отключать** `test_golden_export` / `test_quality_gates` — это безопасные
  guard'ы Phase E4.

---

## 📞 Когда спрашивать Alex

- **Перед** началом — короткий вопрос «CI1 Вариант C ок? CI2 — Вариант B (закрыть)?»
- **Перед** любой CMake / .github правкой — DIFF в чат + ожидание явного OK.

---

*Created: 2026-04-27 by Кодо. Owner: любая следующая сессия (минимум GPU).*
