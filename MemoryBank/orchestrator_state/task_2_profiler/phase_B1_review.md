# Deep Review — Task 2 Phase B1 (ProfilingRecord unified type)

**Дата**: 2026-04-20
**Diff**: `4ab2f1e..3e79dcd` (ветка `new_profiler`, репо `core`)
**Commit**: `3e79dcd [profiler-v2] Phase B1: ProfilingRecord + record_from_rocm`
**Verdict**: **PASS**
**Thoughts used**: 7 (mcp__sequential-thinking__sequentialthinking)
**Issues (non-blocking)**: 5 observations/recommendations

---

## 1. Acceptance Criteria Check (TASK_Profiler_v2_PhaseB1)

| # | Критерий | Статус | Evidence |
|---|----------|:-----:|----------|
| 1 | `struct ProfilingRecord` в profiling_types.hpp | ✅ | `profiling_types.hpp:101` |
| 2 | Counters `std::map<std::string, double>` | ✅ | `profiling_types.hpp:131` |
| 3 | `record_from_rocm` free function в profiling_conversions.hpp | ✅ | `profiling_conversions.hpp:36`, namespace `drv_gpu_lib::profiling` |
| 4 | НЕТ `static ProfilingRecord FromROCm` | ✅ | `grep "static ProfilingRecord" include/` → пусто; `grep "FromROCm" include/` → пусто |
| 5 | Минимум 3 unit-теста | ✅ | Реализовано 4 (`AllFieldsCopied`, `ComputedHelpers`, `KindHelpers`, `MockMassProduction`) |
| 6 | Тесты зелёные | ✅ | По report: `test_core_main` 4/4 PASS для профиль-конверсии + pre-existing suites зелёные |
| 7 | Сборка зелёная | ✅ | 0 errors, только pre-existing nodiscard-warnings (hipStreamDestroy в test_rocm_external_context/test_hybrid_external_context — не связано с B1) |

Побочное наблюдение по AC #6: `ctest --test-dir build -R test_profiling_conversions` не находит тесты — это pre-existing характеристика проекта (нет `add_test()` в `core/tests/CMakeLists.txt`). Тест-агент **корректно** не трогал CMake (запрет CLAUDE.md), запуск выполняется через штатный entry point `test_core_main`. AC формально удовлетворён.

---

## 2. Round 3 REVIEW (Q/W/R) — применение решений

| Ruling | Решение Round 3 | Статус в B1 | Evidence |
|--------|-----------------|:-----------:|----------|
| **C3** | counters = `std::map<string,double>` | ✅ | `profiling_types.hpp:131` (+ уже было в `ROCmProfilingData:80`) |
| **R4** | `record_from_rocm` free function, отдельный header | ✅ | Новый файл `profiling_conversions.hpp`, namespace `drv_gpu_lib::profiling`, `inline` free function |
| **W4** | composite `record_index = (gpu_id << 48) \| local_idx` | ✅ | Поле объявлено (`profiling_types.hpp:136`), формула проверяется в тесте 4 (`test_profiling_conversions.hpp:207, 226-228`). Поле не заполняется фабрикой — комментарий 135 явно отправляет ответственность в `ProfileStore::Append()` (B2) |
| R5/R6/R7 | `BottleneckThresholds`, `BottleneckType`, `MaxRecordsPolicy` — enum/config | ⏳ Отложено | Легитимно — в план Phase C (Strategy + Timer), см. REVIEW:327 и TASK-B1 scope. B1 = только тип данных |

Откладывание R5-R7 в Phase C соответствует разбивке плана в REVIEW (строки 306-349). Scope TASK-B1 явно ограничен `ProfilingRecord` и factory — не содержит Strategy/BottleneckType. **Допустимо.**

---

## 3. Semantic Correctness

### ProfilingRecord fields
- Identity (3) + Timing 5-ns (5) + Classification (4) + Device (3) + Kernel (1) + Counters (1) + record_index (1) = 18 полей. Совпадает со спекой 13.1.
- Все default-значения (`= 0`, пустые строки/map) — ✅.

### Computed helpers
- `ExecTimeMs()` = (end-start)*1e-6 — без guard, т.к. start/end инварианты одного события (start≤end). ✅
- `QueueDelayMs / SubmitDelayMs / CompleteDelayMs` — все три с guard `>=`, возвращают 0 при инверсии (защита от underflow uint64). ✅
- `BandwidthGBps` — проверяет `ms>0 && bytes>0`, формула `(bytes / sec) / 1e9` корректна. ✅

### Kind helpers
- `IsKernel/Copy/Barrier/Marker` + `KindString()` с default "unknown" — все 4 известных значения покрыты. ✅
- `HasCounters()` — простой `!empty()`. ✅
- `kind` хранится как `uint32_t` (не enum class) — согласуется с `ROCmProfilingData.kind` (прямо из rocprofiler API). Design-decision, не проблема.

### record_from_rocm conversion
- Копирует 16 из 17 полей `ROCmProfilingData`. **`op_string` НЕ копируется** (т.к. поле отсутствует в `ProfilingRecord`). Это согласовано со спекой B1.1 — `op_string` не фигурирует в листинге ProfilingRecord. Сознательный gap, не баг.
- `counters` копируются через `map::operator=` (deep copy). ✅
- `record_index` НЕ заполняется фабрикой — комментарий 64 явно указывает на B2. ✅

### op_string — minor gap
Если в Phase C/D понадобится `op_string` для диагностики редких ROCm operations — придётся добавить поле + строку копирования. Рекомендация: либо явно отметить в `ROCmProfilingData.op_string` комментарий «opaque, не переносится в ProfilingRecord намеренно», либо предусмотреть в B2.

---

## 4. Mock tests — реальная семантика или smoke?

| Тест | Покрытие | Semantics / Smoke |
|------|----------|-------------------|
| `AllFieldsCopied` | 19 assertions на каждое поле + record_index=0 invariant | **Semantics** |
| `ComputedHelpers` | 5 формул + edge bytes=0 → bandwidth=0 | **Semantics** |
| `KindHelpers` | kind 0..3 → Is*/KindString + kind=99 → "unknown" + HasCounters true/false | **Semantics** |
| `MockMassProduction` | 1000 записей × 4 GPU, per-shard counter, composite index формирование и декомпозиция, балансировка 250/GPU, ExecTimeMs match | **Semantics** (реальный тест composite-индекса из W4, не smoke) |

**Gaps (минорные)**:
- Underflow guard'ы Queue/Submit/CompleteDelay не имеют edge-case теста с `submit_ns < queued_ns` — guard объявлен, но не покрыт (happy path only).
- Нет теста переноса пустого counters map через factory (покрыт частично через `HasCounters()` в тесте 3).

Эти gaps не блокируют PASS — основная семантика покрыта, W4 валидирован.

---

## 5. CLAUDE.md Compliance

| Чек | Статус | Evidence |
|-----|:------:|----------|
| pytest не используется | ✅ | `grep pytest|conftest` по `core/` → нет |
| `#ifdef _WIN32` в main | ✅ | нет в двух новых файлах |
| CMake вне `target_sources` | ✅ | diff **не содержит** правок CMakeLists / CMakePresets / cmake/*.cmake. Agent явно не правил CMake (согласно side issue в report) — заслуживает похвалы |
| `std::cout` в production | ⚠️ минор | `std::cout` используется в `test_profiling_conversions.hpp` для отчёта о прогрессе. Это **тестовый** код, соседи (test_services, test_gpu_profiler) используют тот же стиль. Не production, не блокер |
| find_package/FetchContent без «OK Alex» | ✅ | Не добавлено |
| hipEventCreate без ScopedHipEvent | ✅ | Новый код не работает с hipEvent_t |
| Чтение секретов | ✅ | Нет доступа к `.vscode/mcp.json`, `.env`, `~/.ssh/` |
| Git force-push на тег | ✅ | Обычный commit, без тегов |

---

## 6. Regressions

| Проверка | Статус | Evidence |
|----------|:------:|----------|
| Pre-existing тесты зелёные | ✅ | По report — ConsoleOutput 400/400, ServiceManager, PrintReport 320 events, Storage, ROCm backend |
| `Record()` latency не деградировал | ✅ | B1 **не меняет** hot path GPUProfiler::Record — новые типы ещё не подключены (B2) |
| Сборка зелёная | ✅ | 0 errors, pre-existing warnings сохранены |
| Diff size разумный | ✅ | +426 / -0 строк, 2 новых файла + 2 модифицированных (`profiling_types.hpp` расширен, `all_test.hpp` +4 строки регистрации) |
| CMake: find_package/FetchContent не добавлялись | ✅ | 0 изменений в CMake/CMakePresets/cmake/* |

Регрессий нет. B1 — чисто additive change.

---

## 7. Side Issue — допуск 2e-6 мс vs 1e-6

**Анализ**:
- В `MakeRocmFromDurationMs`: `d.end_ns = static_cast<uint64_t>(duration_ms * 1e6);`
- `static_cast<uint64_t>` — **truncation** (не round).
- Для `dur=1.49` ms: `1.49 * 1e6` в IEEE-754 double может дать `1489999.9999...` (т.к. 1.49 неточно представимо). После cast: `1489999`. Обратно `ExecTimeMs() = 1489999 * 1e-6 = 1.489999` — разница `1e-6 мс (1 нс)` от ожидаемого `1.49`.
- Для 99 из 100 dur'ов разница в 1 нс, что **укладывается в 2e-6 мс (2 нс)** с запасом.

**Вывод**: обоснование «truncation при uint64 cast» — **корректное** и **НЕ скрывает баг**:
1. Это артефакт test-utility `MakeRocmFromDurationMs`, а не `ExecTimeMs()`.
2. В production GPU timestamps уже целочисленные (hipEvent/rocprofiler) — проблемы нет.
3. Разница в 1 нс < любого реального разрешения GPU-таймера (~40 ns на RDNA).

**Рекомендация (не блокер)**: заменить `static_cast<uint64_t>(duration_ms * 1e6)` на `std::llround(duration_ms * 1e6)` в `MakeRocmFromDurationMs` — это устранит artifact и позволит вернуть допуск 1e-6 мс. Чистая косметика; не блокирует PASS B1.

---

## Issues (observations, NON-blocking)

| # | Severity | File | Note |
|---|:--------:|------|------|
| 1 | minor | `profiling_types.hpp` (ProfilingRecord) | `op_string` из ROCmProfilingData не перенесён в ProfilingRecord — согласовано со спекой, но документация этого решения отсутствует. Рекомендация: комментарий «op_string намеренно опущен — дубликат `op` + `kernel_name`» |
| 2 | minor | `test_profiling_conversions.hpp` | Underflow guard'ы `QueueDelayMs/SubmitDelayMs/CompleteDelayMs` не покрыты edge-case тестом (submit_ns < queued_ns) |
| 3 | cosmetic | `profiling_types.hpp:187` | `static_cast<uint64_t>(duration_ms * 1e6)` → лучше `std::llround(...)` для устранения артефакта в тестовом utility |
| 4 | cosmetic | `test_profiling_conversions.hpp` | `std::cout` вместо `ConsoleOutput` — проектная конвенция тестов, не регрессия |
| 5 | info | `core/tests/CMakeLists.txt` | ctest не находит suite (pre-existing) — tests запускаются через `test_core_main`. Вопрос вне scope B1, но стоит адресовать отдельно по согласованию с Alex |

Ни один из issue не блокирует PASS. Все — observations/minor polish для будущих фаз.

---

## Summary

Phase B1 выполнен **чисто и в рамках scope**. Все 7 acceptance criteria выполнены, все 3 Round-3 решения (C3, R4, W4) применены корректно. Mock-тест 4 (1000×4 GPU composite index) — реальный semantics-тест, валидирующий W4-формулу математически. Agent соблюл запрет CLAUDE.md на правку CMake, нет регрессий, сборка и pre-existing тесты зелёные. Отложенные R5-R7 легитимно отнесены к Phase C. Минорные замечания (op_string gap, guards edge-case, llround) — не блокеры, адресуемы в будущих фазах.

**VERDICT**: **PASS** — можно переходить к Phase B2 (ProfileStore::Append).

---

*Review by deep-reviewer | 2026-04-20 | mcp__sequential-thinking: 7 thoughts*
