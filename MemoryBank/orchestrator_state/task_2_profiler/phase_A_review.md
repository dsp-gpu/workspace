# Phase A Review — Task 2 Profiler v2

**Date**: 2026-04-20
**Reviewer**: deep-reviewer (Кодо)
**Commit**: `4ab2f1e5dfde92f6cc17f083fea22de77d44d0c6`
**Branch**: `new_profiler` @ `/home/alex/DSP-GPU/core`
**Spec**: `MemoryBank/tasks/TASK_Profiler_v2_PhaseA_BranchRemoveOpenCL.md`
**Round 3 ревью**: `MemoryBank/specs/GPUProfiler_Rewrite_Proposal_2026-04-16_REVIEW.md`
**Report (agent)**: `MemoryBank/orchestrator_state/task_2_profiler/phase_A_report.md`
**Baseline**: `MemoryBank/sessions/profiler_v2_baseline_2026-04-20.md`
**Method**: sequential-thinking (6 thoughts) + grep/Read по diff `main..new_profiler`

---

## 🎯 Verdict: **PASS**

Все 9 acceptance-критериев выполнены. Round 3 decisions (R2 baseline, R4 helper) применены. CMake-правка — строго в рамках разрешённой "очевидной правки". Regressions нет — Record() latency улучшена на 55 % (2.596 → 1.157 µs/call) за счёт удаления `std::visit` в горячем пути. Готово к Phase B.

---

## ✅ Acceptance Criteria (grep-верификация)

| # | Критерий | Результат | Способ проверки |
|---|----------|-----------|-----------------|
| 1 | Ветка `new_profiler` создана | ✅ | `git branch --show-current` → `new_profiler` |
| 2 | Baseline цифры сохранены | ✅ | `MemoryBank/sessions/profiler_v2_baseline_2026-04-20.md` существует (заметка: TASK ссылается на `_2026-04-17.md` — имя уехало из-за сдвига дат, содержательно OK) |
| 3 | `OpenCLProfilingData` удалён | ✅ | `grep` по `*.{hpp,cpp,h,c}` в `core/` — пусто |
| 4 | `ProfilingTimeVariant` удалён | ✅ | `grep` по `*.{hpp,cpp,h,c}` в `core/` — пусто |
| 5 | `std::visit` в profiler удалён | ✅ | `grep` по `gpu_profiler.cpp` — только строка-комментарий (line 472: "std::visit убран") |
| 6 | Сборка зелёная | ✅ | `build/libDspCore.a` + `build/tests/test_core_main` ELF присутствуют |
| 7 | Тесты зелёные | ✅ | `./test_core_main` exit 0, PrintReport 320/320 events |
| 8 | `backends/opencl/` НЕ удалён | ✅ | 5 hpp (`command_queue_pool`, `gpu_copy_kernel`, `opencl_backend`, `opencl_core`, `opencl_export`) + 3 cpp — на месте |
| 9 | Commit локально | ✅ | `4ab2f1e` |

---

## ✅ Round 3 decisions — применены

- **R2 (Phase A0.5 baseline)**: ✅ добавлен `tests/test_gpu_profiler_baseline.hpp` + флаг `--baseline` в `tests/main.cpp`. Замеры: Record enqueue 2.596 → 1.157 µs/call (−55 %, ожидание "не хуже ±15 %" перевыполнено). ExportJSON 88 → 89 µs (≈). `libDspCore.a` 20 263 312 → 20 043 652 B (−219 660 B).
- **R4 (`MakeRocmFromDurationMs`)**: ✅ `core/include/core/services/profiling_types.hpp:93`. Семантика corrected: последовательная цепочка queued→submit→start→end→complete, Start=0, остальные выровнены по end_ns → производные задержки не уходят в отрицательные (в отличие от старого MakeOpenCLFromDurationMs, где всё = end_ns давало `queue_delay = end_ns`).

---

## ✅ RAII / Resource safety

- `hipEventCreate` — встречается ТОЛЬКО в `include/core/services/scoped_hip_event.hpp` (RAII-обёртка, баланс с `hipEventDestroy` в деструкторе/Reset/Cleanup). В diff Phase A новых raw-вызовов не добавлено.
- `hipMalloc/hipFree` — в Phase A не трогались (вне scope).
- `cl_event` / `clWaitForEvents` / `clReleaseEvent` — `grep` по `include/core/services/` пусто ⇒ удаление `RecordEvent(cl_event)` из `gpu_benchmark_base.hpp` завершено корректно, висячих ссылок нет.

---

## ✅ CLAUDE.md compliance

- **CMake**: единственное изменение — удаление `src/backends/opencl/opencl_profiling.cpp` из `target_sources()` в `core/CMakeLists.txt` + обновление комментария. Это **строго "очевидная правка"** (удаление файла из target_sources) — разрешено без согласования. `find_package` / `FetchContent` / `target_link_libraries` / пресеты / флаги компилятора — **не тронуты**.
- **pytest**: 0 упоминаний в diff.
- **`#ifdef _WIN32`**: 0 упоминаний в diff.
- **Прямой `std::cout` в production**: существующие `std::cout` в `gpu_profiler.cpp::PrintReport/PrintLegend` были до Phase A (pre-existing debt, не задача Phase A). В новом `test_gpu_profiler_baseline.hpp` использован `std::printf` — это тестовый файл, не production; допустимо.
- **Секретов в логах**: чисто.

---

## ✅ Regressions — отсутствуют

| Метрика | Main baseline | Post Phase A | Δ | Комментарий |
|---------|---------------|--------------|---|-------------|
| `Record()` enqueue | 2.596 µs/call | **1.157 µs/call** | **−55 %** | ожидаемо — `std::visit` + `std::variant` убраны из hot path |
| `Record()` drained | 2.702 µs/call | 1.157 µs/call | −57 % | аналогично |
| `ExportJSON` | 88 µs | 89 µs | ≈ | noise |
| `libDspCore.a` | 20 263 312 B | 20 043 652 B | −219 660 B | ожидаемо (удалили код) |
| `gpu_profiler.cpp.o` | 116 840 B | 105 540 B | −11 300 B | ожидаемо |
| `nm … | grep opencl` (profiler) | N/A | только `OpenCLBackend*` символы | ✅ — только backend, не profiler |

Все "негативные" числа — это улучшения/ожидаемые сокращения, **не регрессии**. R2 gate "не хуже ±15 %" **перевыполнен**.

---

## ✅ Completeness

- `OpenCLProfilingData` / `ProfilingTimeVariant` / `FillOpenCLProfilingData` / `has_rocm_data` / `RecordEvent(cl_event)` — в **коде** (`include/`, `src/`, `tests/`) полностью отсутствуют.
- `std::visit` в `gpu_profiler.cpp` — только комментарий-маркер (явно обозначает что удалено).
- `backends/opencl/` — preserved (5 hpp + 3 cpp).
- Тесты переведены на `MakeRocmFromDurationMs` / `ROCmProfilingData{}` (`test_gpu_profiler.hpp`, `test_services.hpp`).
- Docstring-пример в `gpu_benchmark_base.hpp` переписан с OpenCL-пути на ROCm.
- `gpu_benchmark_base.hpp::InitProfiler()` — OpenCL-ветка заполнения шапки `drivers[]` оставлена **корректно** (шапка отчёта может показывать оба драйвера одновременно по замыслу — `GPUReportInfo` design).

---

## 🟡 Side-issues (не блокеры, отложены по договорённости)

1. **Доки `core/Doc/*.md`** — 6 файлов (`Full.md`, `OpenCL.md`, `API.md`, `Architecture.md`, `Classes.md`, `Services/Full.md`) ещё содержат упоминания `OpenCLProfilingData` / `FillOpenCLProfilingData` / `opencl_profiling.hpp` / `has_rocm_data` / `RecordEvent(..., cl_event)`.
   **Вердикт**: **не блокер Phase A**. Спека Phase A говорит про удаление из кода (grep-критерии указывают `include/`, `src/`, `tests/`). Документация — отдельный артефакт, логично обновить в Phase E (polish + merge) или Task 3. Агент зафиксировал это в `phase_A_report.md` "Issues / Notes". ✅ Согласен.

2. **`ctest` показывает 0 тестов** — `tests/CMakeLists.txt` в core не содержит `add_test()`. Предсуществующее состояние, не в scope Phase A. Smoke-run через `./test_core_main` — exit 0, все секции PASSED. Достаточно для критерия #7. **Не блокер**.

3. **Downstream-репо** (`spectrum`, `stats`, ..., `heterodyne`, `linalg`, `strategies`, `radar`) формально могут содержать `RecordEvent(cl_event)` / `MakeOpenCLFromDurationMs` в своих `tests/`. Это предметно Phase D (cross-repo migration). **Core сам собирается и тесты зелёные** — Phase A scope выполнен.

4. **Имя файла baseline** — TASK указывает `profiler_v2_baseline_2026-04-17.md`, реальный файл `_2026-04-20.md`. Это лишь дата-сдвиг (ревью → исполнение), содержательно эквивалентно. Не блокер.

---

## 📊 Summary

| Раздел | Статус |
|--------|:------:|
| 9 acceptance criteria | ✅ all PASS |
| Round 3 decisions (R2, R4) | ✅ applied |
| RAII / resource safety | ✅ clean |
| CLAUDE.md (CMake/pytest/WIN32) | ✅ clean |
| Regressions | ✅ none (−55 % Record latency — improvement) |
| Completeness (code) | ✅ all refs removed |
| Completeness (docs) | 🟡 deferred to Phase E — acceptable |

---

## 🚦 Gate decision

**APPROVE Phase A → proceed to Phase B (ProfilingRecord + ProfileStore).**

Push `git push -u origin new_profiler` — на усмотрение Alex / координатора (в scope Phase A только локальный commit).

---

*Review completed: 2026-04-20 | thoughts_used: 6 | issues_count: 0 blockers + 4 non-blocking notes*
