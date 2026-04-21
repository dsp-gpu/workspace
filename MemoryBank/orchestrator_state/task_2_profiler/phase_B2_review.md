# Phase B2 REVIEW — ProfileStore (thread-safe record storage)

> **Reviewer**: deep-reviewer (Кодо)
> **Date**: 2026-04-20
> **Commit**: `dbcef5dea328ed92d037bfa366800e3a0f32517a` (branch `new_profiler`)
> **Diff**: `3e79dcd..dbcef5d` (+658 lines, 5 files)
> **Method**: sequential-thinking (7 thoughts) + статический анализ + прогон тест-рянера
> **Verdict**: ✅ **PASS** (3 минорных замечания, блокеров нет)

---

## 1. Краткий итог

Phase B2 реализована корректно. Thread-safe `ProfileStore` с per-GPU шардингом работает согласно Round 3 REVIEW (C1, C2, W2, W3, W4, R3, R7 все применены). Build чистый, 6/6 unit-тестов зелёные (включая multi-thread stress на 40K записей). Несколько мелких отклонений от спеки — задокументированы в report'е исполнителя, некритичны, могут быть закрыты в B3.

---

## 2. Round 3 REVIEW compliance

| Пункт | Требование | Статус | Подтверждение |
|-------|-----------|:-----:|--------------|
| **C1** | Analyzer/Collector race — snapshot + WaitEmpty контракт | ✅ | Комментарий CONTRACT в header (lines 17-22). `AsyncServiceBase::WaitEmpty()` уже существует (async_service_base.hpp:259), готов к интеграции в B3. На уровне ProfileStore метод не нужен — это storage-примитив. |
| **C2** | `GetSnapshot()` full copy | ✅ | `StoreData GetSnapshot() const` — deep-copy через `unordered_map::operator=` (profile_store.cpp:120-129). Тест `TestAppendAndSnapshot` явно проверяет заморозку snapshot после последующего `Append`. |
| **W2** | Lock order documented | ✅ | LOCK ORDER comment в header (lines 66-72). В коде нигде нет обратного порядка (shard→map). На практике в `Append` вложения нет — map mutex освобождается до захвата shard mutex. Deadlock невозможен. |
| **W3** | `std::unordered_map` для modules/events | ✅ | profile_store.hpp:91-93 — все три уровня (`EventsByName`, `ModulesByName`, `StoreData`) — `std::unordered_map`. |
| **W4** | Composite index `(gpu_id << 48) \| local_idx` + assert | ✅ | `assert(record.gpu_id >= 0 && record.gpu_id < 0x10000)` на profile_store.cpp:45. Composite на line 55-56 с **бонусной маской** `& 0x0000FFFFFFFFFFFFULL` — защита от overflow в верхние 16 бит. |
| **R3** | Memory enforcement + `kMapNodeOverheadBytes = 56` | ✅ | profile_store.cpp:171 — `constexpr std::size_t kMapNodeOverheadBytes = 56;` (не magic 50). Тест TotalBytesLimit: 100K записей → 23.65 MB (< 200 MB). |
| **R7** | `MaxRecordsPolicy` enum: RingBuffer / RejectWithWarning / Abort | ⚠️ | Все три реализованы в `EnforceLimit` (profile_store.cpp:82-98). Но **unit-тест есть только для RingBuffer**. RejectWithWarning/Abort не тестируются. → см. замечание 3.1. |

---

## 3. Минорные замечания (не блокеры)

### 3.1. Отсутствует `TestRejectPolicy` 🟡

Спека (TASK_Profiler_v2_PhaseB2_ProfileStore.md:372-386) явно определяет тест для `MaxRecordsPolicy::RejectWithWarning`. В реализации он **отсутствует**:

- RingBuffer → покрыт (`TestMaxRecordsPolicy_RingBuffer`)
- RejectWithWarning → **нет теста**
- Abort → нет теста (но он вызывает `std::terminate()`, тестируется только через death test)

`RejectWithWarning` — тестируемая ветка (warning + no-push, без terminate). Рекомендация: добавить простой тест в B3 или хотфикс-коммит в B2. Ожидаемая форма:

```cpp
inline bool TestMaxRecordsPolicy_Reject() {
    ProfileStoreConfig cfg;
    cfg.max_records_per_event = 2;
    cfg.policy = MaxRecordsPolicy::RejectWithWarning;
    ProfileStore store(cfg);
    for (int i = 0; i < 5; ++i) store.Append(MakeRec(0, "m", "e", i*100));
    auto r = store.GetRecords(0, "m", "e");
    PS_ASSERT_EQ(r.size(), 2u, "reject: first two kept");
    PS_ASSERT_EQ(r[0].start_ns, 0u,   "first = oldest");
    PS_ASSERT_EQ(r[1].start_ns, 100u, "second = next");
    return true;
}
```

### 3.2. `TestTotalBytesLimit` не нагружает ветку counters 🟡

Тест заполняет 100K записей через `MakeRec`, которая создаёт `ROCmProfilingData` без counters. В итоге `counters.size()=0` у каждой записи, и строка 181 (`bytes += rec.counters.size() * kMapNodeOverheadBytes`) добавляет 0. Полученные 23.65 MB — это фактически только `sizeof(ProfilingRecord)*100K` + map overhead.

Отчёт честно пишет: «Даже с 12 counters на запись (~672 байт overhead) получаем ~90 MB — всё ещё в пределах гейта». Математика правильная, но не проверена в runtime. Рекомендация — один sub-test с populated counters (12 штук как в спеке 13.1:353-365), чтобы реально упереть `kMapNodeOverheadBytes`. Не критично.

### 3.3. `ASSERT_DEATH` заменён на boundary smoke 🟡

Спека предлагает `ASSERT_DEATH(store.Append(rec), "gpu_id вне допустимого диапазона")` для `gpu_id = -1`. Реализация честно пишет: «наш runner не форкает», и проверяет только положительный boundary (`0xFFFF` работает без abort). Отрицательный путь (gpu_id < 0 или ≥ 0x10000) runtime-гарантий не имеет — только статический assert при вызове.

Акцептабельно — спека сама оговаривает «или ручной try/abort handler». Death test потребовал бы GoogleTest, что выходит за scope. Фиксирую как notice, не issue.

---

## 4. Concurrency-анализ (подробно)

### 4.1. Lock order stability (W2) — безопасно

| Метод | Порядок | Вложенность | Status |
|-------|---------|-------------|:-----:|
| `Append` | map (кратко) → **освобождается** → shard | **НЕТ вложения** | ✅ deadlock невозможен |
| `ReserveHint` | map → **освобождается** → shard | **НЕТ вложения** | ✅ |
| `GetSnapshot` | map → shard (вложено) | да, map→shard | ✅ прямой порядок |
| `GetRecords` | map → shard (вложено) | да, map→shard | ✅ прямой порядок |
| `TotalRecords` | map → shard (вложено) | да, map→shard | ✅ прямой порядок |
| `TotalBytesEstimate` | map → shard (вложено) | да, map→shard | ✅ прямой порядок |
| `Reset` | map (только) | — | ✅ |

**Обратный порядок (shard → map) в коде отсутствует.** Поиск по `profile_store.cpp` это подтверждает. Даже если кто-то в будущем добавит writer-пул, текущий инвариант «Append не держит map mutex при захвате shard mutex» гарантирует отсутствие deadlock'а.

### 4.2. Стабильность `GpuShard&` ссылки

`GetOrCreateShard()` возвращает `GpuShard&`, ссылку на элемент, которым владеет `std::unique_ptr<GpuShard>` внутри `std::unordered_map`. При rehash'e `unordered_map` перемещает сами `unique_ptr` (buckets/nodes), но **`GpuShard` на heap'е остаётся на месте** — `unique_ptr` держит его по указателю. Таким образом ссылка остаётся валидной даже при параллельных вставках под map mutex'ом. ✅ Корректный дизайн.

### 4.3. Race `Append` vs `Append` (same gpu)

- `shard.local_index.fetch_add(std::memory_order_relaxed)` — каждому writer'у уникальный индекс.
- `push_back` под `shard.mutex` — серилизуется.
- TestMultiThreadStress (4 потока × 10000 на gpu=0 = 40000) **проверяет** это: min_local=0, max_local=39999, total=40000 → ни одной потери, ни одного дубликата. ✅

### 4.4. Race `Append` vs `GetSnapshot`

По контракту не должно происходить. Но даже если происходит: Append захватывает только shard mutex (map mutex уже отпущен); GetSnapshot удерживает map mutex и ждёт shard mutex. Никакой Append не пытается взять map mutex, удерживая shard mutex → deadlock'а нет. ✅ Только возможна неконсистентность snapshot (некоторые records видны, следующие — нет), но это ожидаемо при нарушении контракта.

### 4.5. Race `Append` vs `Reset`

- `active_writers_` barrier: fetch_add перед входом в критическую секцию, fetch_sub после. `Reset()` assert'ит `active_writers_ == 0`.
- **Race window**: Reset может увидеть 0 за миллисекунду до того, как Append'у доведётся fetch_add. Тогда Reset захватит map mutex, очистит `shards_` (уничтожит unique_ptr → shards). Append потом возьмёт map mutex, увидит пустой map, **создаст новый shard** через emplace. Использует новый `local_index=0`. Это не UB — просто «Reset победил», данные до Reset'а удалены.
- Если Append уже внутри shard.mutex'а, а Reset попытается очистить `shards_` — Reset ждёт map mutex (он не удерживается Append'ом). Но `shards_.clear()` уничтожит unique_ptr, который держит shard → деструкция locked mutex = **UB**.
- Это защищено assert'ом в debug. В release (NDEBUG) assert no-op → потенциальное UB. **Это ожидаемо** и документировано в header (lines 196-197 .cpp): «риск UB остаётся на совести caller'а».
- В практическом workflow (Фаза 1 → WaitEmpty → Compute → Reset) это не случится. ✅

### 4.6. `memory_order` корректность

- `active_writers_.fetch_add/sub(acq_rel)` — консервативно, корректно. `relaxed` хватило бы (мы лишь считаем), но acq_rel не вредит.
- `shard.local_index.fetch_add(relaxed)` — OK, только атомарность счётчика важна.
- `active_writers_.load(acquire)` в Reset — парно `acq_rel` из Append. ✅

---

## 5. Partial record / data integrity

- `ProfilingRecord` заполняется целиком до `push_back` (record_from_rocm создаёт record, далее в Append'е ставится `record_index`, потом `push_back(std::move(record))`).
- `push_back` выполняется под `shard.mutex` → snapshot видит либо полную запись, либо её отсутствие. Partial read невозможен.

---

## 6. CLAUDE.md compliance

| Пункт | Статус |
|-------|:-----:|
| CMake: только `+src/services/profiling/profile_store.cpp` в `target_sources(DspCore PRIVATE ...)` | ✅ Разрешённая правка |
| `find_package` — не тронут | ✅ |
| `FetchContent_*` — не тронут | ✅ |
| Компиляторные флаги — не тронуты | ✅ |
| `CMakePresets.json` — не тронут | ✅ |
| Python bindings — не тронуты (не в scope B2) | ✅ |
| `pytest` не использован | ✅ — кастомный C++ runner |
| Secrets (.vscode/mcp.json, .env) — не читались | ✅ |
| `std::cout` — только в тестах (для debug-лога), не в production | ✅ |
| `ConsoleOutput` / `DRVGPU_LOG_*` — production path использует `DRVGPU_LOG_WARNING` | ✅ |
| Включаемые headers — существующие (`<core/logger/logger.hpp>`, `<core/services/profiling_types.hpp>`) | ✅ |

Отклонение от спеки: `#include <core/services/drvgpu_log.hpp>` (спека) → `#include <core/logger/logger.hpp>` (реализация). Это **корректная адаптация под реальную кодовую базу** (такого файла как drvgpu_log.hpp в core/services/ нет, логгер живёт в `core/logger/`). ✅

---

## 7. Acceptance Criteria (из таски)

| # | Критерий | Статус |
|---|----------|:-----:|
| 1 | `ProfileStore` в новом header | ✅ `core/include/core/services/profiling/profile_store.hpp` |
| 2 | `unordered_map` used | ✅ три уровня |
| 3 | Composite index `<< 48` | ✅ с бонус-маской |
| 4 | `LOCK ORDER` comment present | ✅ |
| 5 | All tests green | ✅ 6/6 (было 7 в плане — см. 3.1) |
| 6 | G9 memory test passes | ✅ 23.65 MB < 200 MB |
| 7 | `cmake --build` зелёный | ✅ exit 0 |

---

## 8. Дополнительные наблюдения

- **Бонус 1**: `TestMultiThreadStress` — тест поверх спеки, 4 потока × 10K записей на один gpu=0 ради стресса shard.mutex. Записи не теряются, монотонность local_index сохраняется. Отличная страховка от будущих регрессий.
- **Бонус 2**: Mask `(local & 0x0000FFFFFFFFFFFFULL)` в composite — защита от overflow, если local когда-либо превысит 2^48 (280 триллионов records — гипотетически, но приятно иметь).
- **Бонус 3**: `DspCore` target в CMake (а не `core`, как в спеке) — это фактическое имя в проекте. Правильная адаптация.
- **Нейтральное**: `vec.erase(vec.begin())` в RingBuffer — O(N), но при лимите 1000 это ~1 μs и происходит редко (edge-case). Акцептабельно.
- **Нейтральное**: Логгер в RejectWithWarning сработает на **каждый** overflow-append — потенциально спамно. Можно добавить throttle (например, только первые N warnings), но это оптимизация уже B3+.
- **Нейтральное**: `GetRecords` возвращает `{}` при отсутствии gpu/module/event — в тестах эта ветка не тестируется (coverage gap), но логика тривиальна.

---

## 9. Итоговый вердикт

**VERDICT: PASS**

Concurrency-дизайн корректный. Lock order соблюдён, race-conditions проанализированы, composite index с защитной маской, memory_order грамотные. Round 3 решения (C1/C2/W2/W3/W4/R3/R7) все применены.

**Рекомендации на B3 (не блокеры)**:
1. Добавить `TestMaxRecordsPolicy_Reject` — тривиальный, важный для coverage R7.
2. Sub-test в `TestTotalBytesLimit` с populated counters — чтобы реально упереть `kMapNodeOverheadBytes`.
3. (опционально) — throttle warnings в RejectWithWarning.

**Можно переходить к Phase B3** (интеграция `ProfileStore` в `GPUProfiler` / `ProfileAnalyzer`).

---

## 10. Summary блока для orchestrator'а

```
VERDICT: PASS
thoughts_used: 7
issues_count: 3 (minor, non-blocking)
report: /home/alex/DSP-GPU/MemoryBank/orchestrator_state/task_2_profiler/phase_B2_review.md
summary: Concurrency-дизайн корректный; Round 3 (C1/C2/W2/W3/W4/R3/R7) применены; build+tests зелёные.
         3 минора: отсутствует TestRejectPolicy, counters в TotalBytesLimit не нагружены, ASSERT_DEATH заменён (оговорено в спеке).
         Можно двигаться к B3.
```

---

*Review: deep-reviewer (Codo), 2026-04-20 | Sequential-thinking: 7 thoughts*
