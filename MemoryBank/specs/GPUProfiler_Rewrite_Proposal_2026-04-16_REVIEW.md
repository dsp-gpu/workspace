# Code Review: GPUProfiler_Rewrite_Proposal_2026-04-16.md

**Date**: 2026-04-17
**Reviewer**: Кодо (AI Assistant)
**Object**: `MemoryBank/specs/GPUProfiler_Rewrite_Proposal_2026-04-16.md` (1270 строк, Part 1 + Part 2)
**Method**: статический анализ спеки + кросс-проверка с `core/include/core/services/`
**Status**: ROUND 3 — финальные решения по C3/W1/W2

---

## 📊 Финальная сводка статуса

| # | Пункт | Статус | Решение |
|---|-------|:-----:|---------|
| C1 | Race Analyzer/Collector | ✅ | Compute через snapshot/lock |
| C2 | GetSnapshot copy | ✅ | Full copy ок (64GB RAM) |
| **C3** | counters map | ✅ | **Оставляем `std::map<string, double>`** (scale 1-5K ничтожный) |
| C4 | Sort | ✅ | std::sort ок (1 раз после теста) |
| **W1** | BatchRecord singleton | ✅ | **Singleton оставляем**, IProfilerRecorder — на будущее |
| **W2** | Lock order | ✅ | **Проблемы нет** — Export идёт ТОЛЬКО после WaitEmpty(). Коммент-страховка 3 строки |
| W3 | std::map hot path | ✅ | unordered_map + string_view |
| W4 | next_index_ | ✅ | Per-shard + composite index |
| W5 | ScopedProfileTimer | ✅ | Deprecate для production |
| W6 | Radar | ✅ | Исключён из scope |
| W7 | Estimate | ✅ | 28-40ч (с резервом) |
| R1-R8 | Рекомендации | ✅ | Все приняты |

**🚀 ВСЕ ВОПРОСЫ ЗАКРЫТЫ. Готовы к Phase A.**

---

## 🔴 Критические проблемы

### C1. Race condition: Analyzer читает vector пока Collector пишет ✅
**Секции**: 14.2 + 15

**Ответ Alex**: ✅ Да
**Решение**: Compute работает через snapshot/lock. Контракт прописать в доках над `ProfileAnalyzer::ComputeSummary`.

---

### C2. `GetSnapshot() → full copy` = 200 MB копирования ✅
**Секция**: 14.2:470

**Ответ Alex**: ✅ Да (ок)
> Успеет — данные передаются пачкой, профайлер в потоке кладёт в очередь (паттерн Observer). Программа идёт на новый заход — времени достаточно. Памяти 64+ GB.

**Решение**: Простой `GetSnapshot()` с full copy. Не оптимизируем преждевременно.

---

### C3. `std::map<std::string, double> counters` per record ✅
**Секция**: 13.1:366

**Ответ Alex**:
> У нас 1-5К записей в самом плохом варианте — это копейки))
> Тест максимум 10 мин!
> Хороший вариант, но у нас будут расти тесты, нагрузка сильно не будет расти — это разовая вещь!

#### 🎯 Финальное решение: **оставляем `std::map<std::string, double>`**

**Обоснование**:
- Alex прав — scale совсем другой:
  - 1-5K records × 12 counters = **12-60K аллокаций ЗА ВЕСЬ ТЕСТ** (10 мин)
  - ~100 аллокаций/сек — ничтожно для glibc malloc
- Enum+array даёт выигрыш только на масштабе 100K+ records/second
- `std::map` — **проще, читабельнее, гибче**:
  - Новые counters от rocprofiler добавляются без пересборки enum
  - API уже знаком разработчикам
  - Нет необходимости в sentinel NaN, bitset-ах, кастах

**YAGNI** — не оптимизируем под нагрузку, которой нет.

#### Единственная оптимизация (копеечная)
Использовать **SSO-friendly короткие ключи** (≤15 символов) — string без heap allocation:
```cpp
// ✅ SSO (нет heap):  "GPUBusy", "VALUBusy", "L2CacheHit"
// ❌ heap allocation: "GPU_Busy_Percentage_Counter_Name"
```
Все AMD counter-names из спеки (13.1:353-365) уже короткие — ок.

---

### C4. Sort O(N log N) ✅
**Ответ Alex**: ✅ Да, не критично.
**Решение**: `std::sort` оставляем.

---

## 🟡 Важные замечания

### W1. BatchRecord singleton ✅
**Секции**: 17a.4, 17a.6

**Ответ Alex**:
> Ты права, согласен! НО — это решение только под эту задачу, без тиражирования!
> Если этот вариант рабочий — его нужно оставить, доработать — да, но НЕ менять в корне!

#### 🎯 Финальное решение: **оставляем singleton в benchmarks**

**Принято**:
1. `ProfilingFacade::GetInstance().BatchRecord(...)` — **ок** в benchmark файлах
2. `IProfilerRecorder` интерфейс **объявляем** (для будущего), но **не используем** в Phase D
3. `BatchRecord` — inline template в `profiling_facade.hpp` рядом с `Record`
4. В header над `ProfilingFacade::GetInstance()` — коммент-маркер:

```cpp
/// @warning For production benchmarks only.
///          Unit tests should use IProfilerRecorder* injection — see
///          test_profile_store.cpp for example.
static ProfilingFacade& GetInstance();
```

**Дверь в DI остаётся открытой** — переделать на IProfilerRecorder можно позже без breaking changes.

---

### W2. Deadlock lock order ✅ (проблемы нет — Alex прав)
**Секция**: 14.2:482-491

**Ответ Alex (Round 2)**:
> Я знаком с темой, но не понимаю проблему.
> 10 GPU параллельно пишут в очередь профайлера и уходят — быстро!
> Профайлер обрабатывает очередь.

**Ответ Alex (Round 3) — решающий аргумент**:
> Ты пишешь «пока идёт тест пишем в JSON и так далее» — это НЕ правильно!
> После теста → расчёт → по значениям можно параллельно формировать отчёт JSON & MD.

#### 🎯 Alex прав. Моя паника про data race — НЕВЕРНА

Правильная последовательность фаз:

```
┌── Фаза 1: измерение ─────────────────┐
│                                      │
│  Modules (10 GPU) ──push──► queue    │
│                               │      │
│                               ▼      │
│                         Worker thread│
│                               │      │
│                               ▼      │
│                         ProfileStore │
│                         (write-only) │
└──────────────┬───────────────────────┘
               │
               ▼
         WaitEmpty()  ← синхронизационный барьер
               │
               ▼
┌── Фаза 2: анализ ────────────────────┐
│                                      │
│  Compute() → ProfileAnalyzer         │
│  (ProfileStore ЗАМОРОЖЕН,            │
│   никто не пишет)                    │
└──────────────┬───────────────────────┘
               │
               ▼
┌── Фаза 3: export (параллельно) ──────┐
│                                      │
│    ┌────────────┐   ┌────────────┐   │
│    │JsonExporter│   │ MdExporter │   │
│    └──────┬─────┘   └──────┬─────┘   │
│           │                │         │
│           └──► ReadOnly ◄──┘         │
│                snapshot              │
└──────────────────────────────────────┘
```

**Ключевое**: `WaitEmpty()` гарантирует что worker thread закончил запись ДО того как Compute/Export начнут читать. Таким образом:
- **Append и Export никогда не работают одновременно**
- **Data race между ними невозможна**
- **Deadlock между ними невозможен**
- **TSan ничего не найдёт**

#### 🎯 Бонус: JSON + MD exporters — параллельно

Поскольку оба read-only и работают с замороженным snapshot — их можно запустить в двух потоках:
```cpp
auto fut_json = std::async(std::launch::async, [&]{ json_exp.Export(snapshot); });
auto fut_md   = std::async(std::launch::async, [&]{ md_exp.Export(snapshot);   });
fut_json.get();
fut_md.get();
```
Дают **x2 ускорение финальной фазы** без риска конфликтов (snapshot неизменяем).

#### 🎯 Финальное решение: `std::mutex` + коммент-страховка

1. **`std::mutex` per shard** — достаточно (без shared_mutex)
2. **Коммент-страховка** (defensive programming, 0 runtime cost):

```cpp
/// LOCK ORDER (strict):
///   1. shards_map_mutex_  (outer)
///   2. shard->mutex       (inner)
///
/// CONTRACT: Append() and Export() MUST NOT run concurrently.
/// Export is called only after WaitEmpty() — worker thread has drained queue.
/// Reset() is forbidden during active profiling session.
class ProfileStore {
    ...
};
```

**Зачем коммент если data race невозможна при правильном использовании?**
- На случай если кто-то в будущем сломает инвариант (вызовет Export без WaitEmpty, добавит второй worker, дёрнет Reset)
- Документирует архитектурный контракт для новых разработчиков
- 3 строки, ничего не стоит

---

### W3. std::map → unordered_map ✅
**Решение**: `std::unordered_map<std::string, ...>` для modules/events.

---

### W4. next_index_ per-shard ✅
**Решение**: Composite `record_index = (gpu_id << 48) | local_idx`.

---

### W5. ScopedProfileTimer deprecate ✅
**Решение**: Оставляем только для unit-тестов / simple cases.

---

### W6. Radar исключён ✅
**Решение**: Radar вычёркиваем из Phase D. Estimate пересчитан.

---

### W7. Estimate 28-40ч ✅

Разбивка:
- Phase A (OpenCL removal): 2-3 ч
- Phase B (Collect-then-compute): 10-14 ч
- Phase C (Strategy + Timer): 3-4 ч
- Phase D (cross-repo, 6 репо без radar): 8-12 ч
- Phase E (polish + merge): 3-5 ч
- **Резерв**: 2-4 ч

---

## 🟢 Рекомендации (все приняты)

### R1. Удалить SUPERSEDED секции ✅
Секции 3.2-3.6, 5-6, 10 → архив `GPUProfiler_Rewrite_Proposal_v1_archive.md`.

### R2. Phase A0.5: baseline perf measurement ✅
Перед удалением OpenCL — зафиксировать baseline `Record()` latency.

### R3. G9 memory enforcement ✅
Unit-тест ассертит `TotalRecords() * sizeof(ProfilingRecord) + overhead < 200MB`.

### R4. FromROCm — free function ✅
`drv_gpu_lib::profiling::record_from_rocm(...)` в `profiling_conversions.hpp`.

### R5. BottleneckThresholds — config struct ✅
```cpp
struct BottleneckThresholds {
    double compute_valu_min   = 80.0;
    double memory_unit_busy_min = 70.0;
    double l2_cache_hit_min   = 50.0;
};
BottleneckType DetectBottleneck(const HardwareProfile&, const BottleneckThresholds& = {});
```

### R6. BottleneckType — enum ✅
```cpp
enum class BottleneckType {
    ComputeBound, MemoryBound, CacheMiss, Balanced, Unknown
};
```

### R7. MaxRecordsPolicy — enum ✅
```cpp
enum class MaxRecordsPolicy {
    RingBuffer,
    RejectWithWarning,
    Abort
};
```
Дефолт: `RingBuffer` для benchmarks, `RejectWithWarning` для compliance.

### R8. CI для new_profiler ✅
Workflow собирает все 9 репо на ветке `new_profiler` вместе (FetchContent pin).

---

## ✅ Соответствие стандартам GPUWorkLib

| Чек | Статус | Комментарий |
|-----|:-----:|-------------|
| DrvGPU интеграция | ✅ | ServiceManager + AsyncServiceBase keeps |
| ConsoleOutput | ✅ | ReportPrinter заменяет |
| GPUProfiler singleton | ✅ | Facade keeps backward compat |
| Стиль PascalCase | ✅ | Record/Append/Compute |
| Многопоточность | ✅ | snapshot + lock order comment |
| Multi-GPU safe | ✅ | Per-GPU shard |
| Нет blocking в hot path | ✅ | shard mutex — коротко |

---

## 📋 Итоговый план действий

### Phase A (2-3 ч)
- [ ] `git checkout -b new_profiler` в core/
- [ ] Удалить OpenCL из профайлера
- [ ] **A0.5**: baseline perf measurement (R2)
- [ ] Build + test

### Phase B (10-14 ч)
- [ ] `ProfilingRecord` (flat struct + `std::map<string, double>` counters) ← C3 решено
- [ ] `ProfileStore` с:
  - per-GPU shard + lock order comment ← W2 решено
  - `std::unordered_map` для modules/events ← W3 решено
  - per-shard counter + composite index ← W4 решено
  - `MaxRecordsPolicy` enum ← R7
- [ ] `ProfileAnalyzer` (L1/L2/L3) с:
  - `ComputeSummary` через snapshot ← C1 решено
  - `BottleneckThresholds` config struct ← R5
  - `BottleneckType` enum ← R6
- [ ] `ReportPrinter` (блочный вывод)
- [ ] `drv_gpu_lib::profiling::record_from_rocm` ← R4
- [ ] Build + test + G9 memory assertion ← R3

### Phase C (3-4 ч)
- [ ] `IProfilerRecorder` интерфейс (без обязательного использования) ← W1
- [ ] JsonExporter, MarkdownExporter, ConsoleExporter
- [ ] **Параллельный Export** (std::async для JSON + MD одновременно) ← Round 3
- [ ] ScopedProfileTimer (маркируем как `[[deprecated_for_production]]`) ← W5
- [ ] Build + test

### Phase D (8-12 ч) — БЕЗ RADAR
- [ ] spectrum (8 файлов)
- [ ] stats (2 файла)
- [ ] signal_generators (2 файла)
- [ ] heterodyne (2 файла)
- [ ] linalg (2 файла)
- [ ] strategies (1 файл)
- [ ] **Radar пропускаем** ← W6

### Phase E (3-5 ч)
- [ ] Удалить SUPERSEDED секции → архив ← R1
- [ ] Тесты ProfileAnalyzer (L1/L2/L3)
- [ ] Golden file tests
- [ ] CI workflow для new_profiler ← R8
- [ ] PR → main

---

## 🚀 Готовность

**Все архитектурные вопросы согласованы.** Можем начинать Phase A когда ты скажешь "поехали".

Перед стартом — я предлагаю:
1. **Сохранить этот ревью в MemoryBank** как реферанс
2. **Обновить исходную спеку** `GPUProfiler_Rewrite_Proposal_2026-04-16.md` — добавить ROUND 3 decisions в раздел "Решения ревью"
3. **Создать task в `MemoryBank/tasks/IN_PROGRESS.md`** — "Phase A: Branch + Remove OpenCL"

---

*Created: 2026-04-17 | Round 3 — финальные решения | Reviewer: Кодо (AI Assistant)*
