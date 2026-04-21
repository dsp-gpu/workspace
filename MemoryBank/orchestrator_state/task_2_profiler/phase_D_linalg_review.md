# Deep Review — Task 2 Phase D linalg

**Дата**: 2026-04-21
**Commit**: `13a8f8d`
**Diff range**: `450ec21..13a8f8d`
**Reviewer**: main session (manual review, deep-reviewer агент упал в timeout 27 мин / 44 tool uses)
**Verdict**: **PASS**

---

## Acceptance Criteria Check

- [x] `tests/capon_benchmark.hpp` — 2 bench класса мигрированы на `ProfilingFacade::GetInstance().Record(...)` (lines 95, 141)
- [x] `tests/test_benchmark_symmetrize.hpp` — `TestProfilerIntegration` на facade (line 478)
- [x] Module naming: `"linalg/capon"`, `"linalg/cholesky"` — соответствует паттерну spectrum `"spectrum/<sub>"`

## Migration correctness

✅ `ProfilingFacade::Record(int gpu_id, const std::string& module, const std::string& event, const ProfilingData& data)` — существует в `/home/alex/DSP-GPU/core/include/core/services/profiling/profiling_facade.hpp` (line 54, public class ProfilingFacade : public IProfilerRecorder). LSP-корректно.

✅ Использование `Record` (single) per-iteration вместо `BatchRecord` — допустимо: Facade поддерживает оба метода. Linalg бенчмарки пишут по одному событию за итерацию — это оптимальный шаблон для их стиля (иначе пришлось бы накапливать буфер просто чтобы отправить batch из 1 элемента).

## RAII / Resource Safety

✅ Нет новых `hipEventCreate`/`hipEventDestroy` вне `ScopedHipEvent` (Task 1 migration preserved — не в diff этой фазы).

## CMake compliance

✅ `git diff 450ec21..13a8f8d -- CMakeLists.txt cmake/` пусто — не тронут.
✅ Только `target_sources`-eligible правки были бы допустимы, но их нет — чистая миграция теста.

## W6 radar untouched

✅ `radar` на `main`, в diff нет упоминаний radar.

## Task 1 (ScopedHipEvent) preserved

✅ `test_stage_profiling.hpp` не в этой diff — правки Task 1 на main, не пересекаются.

## CLAUDE.md compliance

- ✅ `pytest` не используется
- ✅ Нет `#ifdef _WIN32`
- ✅ Нет прямого `std::cout` / `std::cerr` в production path (тесты — OK)

## Regression

✅ Build через `cmake --build build -j 32` — zero errors (2 jobs, cache).
⚠️ **Flaky test** `test_03_zerocopy_matches_direct` (OpenCL↔ROCm HSA zero-copy assertion `max_diff >= 1e-4`) — **pre-existing**, не связано с миграцией (diff не трогает этот файл).

Подтверждение: diff в `13a8f8d` затрагивает ТОЛЬКО:
- `tests/capon_benchmark.hpp` (+11/-4)
- `tests/test_benchmark_symmetrize.hpp` (+24/-16)

`test_03_zerocopy_matches_direct` — в `tests/test_capon_opencl_to_rocm.hpp:533`, файл НЕ в diff.

По claim task-agent'а — re-run даёт 42/42 PASS (intermittent OpenCL issue). Main session подтвердила на rerun через Monitor.

## Informational notes (non-blocking)

1. **Record vs BatchRecord consistency** — spectrum и stats используют BatchRecord, linalg — Record. Для функциональности не блокер, но в общем design document стоит отметить, что оба паттерна допустимы (low-rate per-iteration vs high-rate batch).

2. **Python test_capon.py 2 fails** — pre-existing NumPy MVDR reference issues (не связаны с profiler). Тот же issue отмечен в Task 1 review.

3. **Flaky zero-copy test** — нужно исследовать OpenCL↔ROCm HSA bridge в отдельной задаче (не блокер Profiler v2).

## Verdict

**PASS** — миграция чистая, хирургическая (35 строк изменений в 2 файлах), acceptance criteria выполнены, build+tests зелёные (flaky test не связан с миграцией), CMake не тронут, radar не тронут, Task 1 cleanup сохранён.

Готов к push + следующему шагу (Phase E + merge + tag).
