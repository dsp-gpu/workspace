# TASK: GPUProfiler v2 Rewrite — Master Index

> **Дата создания**: 2026-04-17
> **Источник спеки**: `MemoryBank/specs/GPUProfiler_Rewrite_Proposal_2026-04-16.md`
> **Источник решений**: `MemoryBank/specs/GPUProfiler_Rewrite_Proposal_2026-04-16_REVIEW.md` (Round 3)
> **Ветка**: `new_profiler` (во всех репо)
> **Effort**: 28-40 часов
> **Scope**: `core/` + 6 репо (radar исключён)

---

## 🎯 Цель

Переписать GPUProfiler из aggregate-on-fly в **collect-then-compute** архитектуру:
- 1 класс GPUProfiler (884 LOC) → 5+ SOLID-компонент
- Удалить OpenCL-профилирование (остаётся только ROCm/HIP)
- Добавить Level 1 (pipeline) + Level 2 (stats) + Level 3 (hardware counters) отчёты
- Новые метрики: median, p95, stddev, bandwidth, outliers

---

## 📂 Задачи (по порядку выполнения)

| # | Task | Файл | Scope | Effort | Depends |
|---|------|------|-------|-------:|---------|
| A | Branch + Remove OpenCL | `TASK_Profiler_v2_PhaseA_BranchRemoveOpenCL.md` | core/ | 2-3 ч | — |
| B1 | ProfilingRecord (unified type) | `TASK_Profiler_v2_PhaseB1_ProfilingRecord.md` | core/ | 2-3 ч | A |
| B2 | ProfileStore (storage) | `TASK_Profiler_v2_PhaseB2_ProfileStore.md` | core/ | 3-4 ч | B1 |
| B3 | ProfileAnalyzer (L1/L2/L3) | `TASK_Profiler_v2_PhaseB3_ProfileAnalyzer.md` | core/ | 3-4 ч | B1 |
| B4 | ReportPrinter (block console) | `TASK_Profiler_v2_PhaseB4_ReportPrinter.md` | core/ | 2-3 ч | B3 |
| C | Strategy Exporters + ScopedTimer | `TASK_Profiler_v2_PhaseC_Exporters.md` | core/ | 3-4 ч | B2,B3,B4 |
| D | Cross-repo benchmark migration | `TASK_Profiler_v2_PhaseD_CrossRepo.md` | 6 repos | 8-12 ч | C |
| E | Polish + Tests + Merge | `TASK_Profiler_v2_PhaseE_Polish.md` | all | 3-5 ч | D |

---

## 🔑 Ключевые архитектурные решения (из Round 3 ревью)

### C1 — Race Analyzer/Collector
✅ `ProfileAnalyzer` работает только со **snapshot** из `ProfileStore::GetSnapshot()`.
Вызов `Append()` и `Compute()` разделены через `WaitEmpty()` барьер.

### C2 — GetSnapshot full copy
✅ **Простой full copy** ок. Памяти 64+GB, preemptive optimization не нужна.

### C3 — counters тип
✅ **`std::map<std::string, double>` counters** — оставляем.
Scale 1-5K records × 12 counters = ~60K аллокаций за тест 10 мин = копейки.

### C4 — Sort для median/p95
✅ **`std::sort`** — ок. Вызывается 1 раз после теста в `Compute()`.

### W1 — BatchRecord singleton
✅ **`ProfilingFacade::GetInstance().BatchRecord(...)`** — оставляем в benchmarks.
`IProfilerRecorder` интерфейс объявляем (для будущего), но не тиражируем сейчас.

### W2 — Lock order / data race
✅ **Проблемы нет**: `Export` вызывается ТОЛЬКО после `WaitEmpty()`.
Фазы не пересекаются:
```
Измерение (worker пишет) → WaitEmpty() → Compute() → Export JSON || Export MD
```
Коммент `// LOCK ORDER: shards_map → shard.mutex` — defensive documentation (3 строки).

### W3 — unordered_map
✅ `std::unordered_map<std::string, ...>` для modules/events в ProfileStore.

### W4 — per-shard counter
✅ `record_index = (uint64_t(gpu_id) << 48) | local_idx` — composite.

### W5 — ScopedProfileTimer
✅ Оставляем только для unit-тестов / simple cases. Для production benchmarks — `BatchRecord`.

### W6 — Radar
✅ **Radar исключён** из Phase D. Не трогаем.

### R1 — SUPERSEDED секции
✅ Секции 3.2-3.6, 5-6, 10 спеки → архив `GPUProfiler_Rewrite_Proposal_v1_archive.md`.

### R2 — Baseline perf
✅ Phase A0.5: измерить `Record()` latency до изменений (для регрессий).

### R3 — Memory enforcement
✅ Unit-тест в Phase B2 ассертит `TotalBytes() < 200 MB`.

### R4 — FromROCm free function
✅ `drv_gpu_lib::profiling::record_from_rocm(...)` в `profiling_conversions.hpp`.

### R5 — BottleneckThresholds struct
✅ `struct BottleneckThresholds { double compute_valu_min; ... };` в Phase B3.

### R6 — BottleneckType enum
✅ `enum class BottleneckType { ComputeBound, MemoryBound, CacheMiss, Balanced, Unknown };`.

### R7 — MaxRecordsPolicy enum
✅ `enum class MaxRecordsPolicy { RingBuffer, RejectWithWarning, Abort };`.

### R8 — CI для new_profiler
✅ Workflow собирает все 9 репо на `new_profiler` ветке вместе (Phase E).

---

## 🆕 Уточнения после review 2026-04-17 (применены точечно)

- **Phase A**: `MakeRocmFromDurationMs` — корректная цепочка queued→submit→start→end→complete (избегает отрицательных Submit/CompleteDelay).
- **Phase B2**: добавлен `std::atomic<int> active_writers_` + assert в `Reset()` (защита contract W2 в debug).
- **Phase B2**: `assert(gpu_id >= 0 && gpu_id < 0x10000)` в `Append()` — защита от UB composite index.
- **Phase B2**: `constexpr kMapNodeOverheadBytes = 56` вместо magic `50`.
- **Phase B2**: новый тест `TestGpuIdValidation_AssertInDebug` (ASSERT_DEATH-стиль).
- **Phase B4**: production-вывод через `ConsoleOutput::GetInstance().Print()` (CLAUDE.md), а не прямой `std::cout`.
- **Phase C**: `ExportJsonAndMarkdown(parallel = false)` по умолчанию sequential; `PrintReport()` метод в Facade.
- **Phase D**: preflight `D0-pre` — проверка что `radar` на main (W6 защита).
- **Phase E**: новые шаги E7.5 (tag `v0.3.0-rc1` + pin FetchContent в dep-репо) и E8.5 (doxygen-maintainer).
- **Phase E**: `RUN_SERIAL` для golden / quality-gates тестов (с OK Alex на CMake-правку).

---

## 🚫 АБСОЛЮТНЫЕ ЗАПРЕТЫ (действуют везде)

1. **CMake не трогаем** без явного OK Alex (CLAUDE.md).
2. **pytest запрещён** — только `python script.py`.
3. **git push / git tag** — только с OK Alex.
4. **Windows guards (`#ifdef _WIN32`)** не добавлять — main = Linux only.
5. **Не удалять `backends/opencl/` папку** — там IMemoryBuffer для OpenCL bridge, keep.

---

## 🎯 Definition of Done для каждой задачи

Каждая задача считается выполненной когда:
1. ✅ Код написан по спецификации (точные имена файлов/классов)
2. ✅ `cmake --preset debian-local-dev && cmake --build build --target <target>` — зелёно
3. ✅ `ctest --test-dir build -L <tag>` — все тесты зелёные
4. ✅ Acceptance criteria из конкретного TASK-файла — выполнены
5. ✅ Commit с сообщением `[profiler-v2] Phase X: <summary>` в ветку `new_profiler`

---

## 📞 Когда спрашивать Alex

- **Обязательно**: любое изменение CMake, git push, git tag
- **Желательно**: если acceptance criteria невозможно выполнить → стоп, описать проблему
- **Не нужно**: при выборе имён переменных, комментариев, стиля тестов — следуй стилю существующего кода

---

## 🔁 Проверка после каждой задачи

Перед переходом к следующей:
```bash
cd E:/DSP-GPU/core
git status                          # что изменилось
git diff --stat                     # строки/файлы
cmake --build build --target core   # сборка зелёная
ctest --test-dir build --output-on-failure  # тесты зелёные
```

Если хоть один пункт красный — **НЕ переходить к следующей задаче**. Сообщить Alex.

---

*Created: 2026-04-17 | Тех-лид: Кодо (Round 3 ревью) | Исполнитель: Кодо (следующая сессия)*
