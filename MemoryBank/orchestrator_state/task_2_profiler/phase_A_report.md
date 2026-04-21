# Profiler v2 — Phase A Report

**Date**: 2026-04-20
**Branch**: `new_profiler` (в `/home/alex/DSP-GPU/core`, локально, не запушено)
**Commit**: `4ab2f1e5dfde92f6cc17f083fea22de77d44d0c6`
**Elapsed**: ~1.0h (estimate 2-3h)
**Spec**: `MemoryBank/tasks/TASK_Profiler_v2_PhaseA_BranchRemoveOpenCL.md`
**Baseline**: `MemoryBank/sessions/profiler_v2_baseline_2026-04-20.md`

## Что сделано

- **A0**: создана ветка `new_profiler` от `main` в `core/`.
- **A0.5 Baseline**:
  - Добавлен `tests/test_gpu_profiler_baseline.hpp` + флаг `--baseline`
    в `tests/main.cpp` (сохраняется, используем повторно в Phase B/E).
  - Замерено до/после Phase A (см. baseline-файл).
- **A1** (`profiling_types.hpp`): удалены `OpenCLProfilingData`,
  `ProfilingTimeVariant`, `MakeOpenCLFromDurationMs`; удалён `<variant>`;
  добавлен `MakeRocmFromDurationMs` (без отрицательных delay).
- **A2** (`gpu_profiler.hpp` + `.cpp`): удалён Record(OpenCL)-overload,
  удалён `std::visit` в `ProcessMessage` (ProfilingMessage::time_ теперь
  `ROCmProfilingData` напрямую), удалена OpenCL-ветка из `PrintReport`,
  `PrintLegend` всегда показывает ROCm-поля.
- **A3** (`profiling_stats.hpp`): удалено поле `has_rocm_data` из
  `EventStats` + все его использования в `gpu_profiler.cpp`
  (`HasAnyROCmData*`, `HasModuleROCmData`, `HasAnyROCmDataGlobal_NoLock`
  удалены целиком).
- **A4**: удалены `include/core/backends/opencl/opencl_profiling.hpp`
  и `src/backends/opencl/opencl_profiling.cpp`; соответствующая строка
  убрана из `core/CMakeLists.txt` (разрешённая правка — удаление файла
  из `target_sources`). Папки `backends/opencl/` **НЕ удалены** — в них
  остаются `opencl_backend.{hpp,cpp}`, `opencl_core.{hpp,cpp}`,
  `opencl_export.hpp`, `command_queue_pool.{hpp,cpp}`, `gpu_copy_kernel.hpp`
  (они нужны для cl_mem / IMemoryBuffer bridging).
- **A5** (`gpu_benchmark_base.hpp`): удалён `RecordEvent(const char*, cl_event)`,
  удалён `#include "../backends/opencl/opencl_profiling.hpp"`,
  докстринг-пример переписан с OpenCL-пути на ROCm (RecordROCmEvent).
- **A6**: `tests/test_gpu_profiler.hpp` и `tests/test_services.hpp`
  переведены на `MakeRocmFromDurationMs` и `ROCmProfilingData`.
- **A7** Build + smoke-run:
  - `cmake --preset debian-local-dev && cmake --build build -j 32` — clean.
  - `./test_core_main` exit 0, все секции PASSED
    (GPUProfiler PrintReport: 320/320 events; ZeroCopy/Hybrid PASSED).
- **A8** Commit локально — см. SHA выше. **НЕ запушено** (задача
  координатора).

## Acceptance (из TASK-файла)

| # | Критерий | Результат |
|---|----------|-----------|
| 1 | Ветка `new_profiler` создана | `git branch --show-current` → `new_profiler` |
| 2 | Baseline цифры сохранены | `MemoryBank/sessions/profiler_v2_baseline_2026-04-20.md` |
| 3 | `OpenCLProfilingData` удалён | grep по `include/`+`src/`+`tests/` пусто |
| 4 | `ProfilingTimeVariant` удалён | grep по `include/`+`src/`+`tests/` пусто |
| 5 | `std::visit` в profiler удалён | grep `std::visit` в `gpu_profiler.cpp` — только комментарий |
| 6 | Сборка зелёная | exit 0 (warnings — предсуществующие hipStreamDestroy nodiscard) |
| 7 | Тесты зелёные | `./test_core_main` exit 0, все [PASS] |
| 8 | `backends/opencl/` НЕ удалён | 5 hpp + 3 cpp файлов остались |
| 9 | Commit локально | `4ab2f1e5` |

## Build/Tests

- cmake build: **OK** (incremental + clean)
- test_core_main exit: **0**
- GPUProfiler smoke: **PrintReport test: 320 events (expected 320) [PASS]**
- baseline --baseline run: Record enqueue = **1.157 µs/call**
  (down from 2.596 µs/call — регрессии нет, есть улучшение −55%).
- ctest: **0 тестов зарегистрировано** — `tests/CMakeLists.txt` в core
  не содержит `add_test()`. Это предсуществующее состояние, не в scope
  Phase A. Формальный exit ctest = 0.

## Gate

- Gate 1/2/3: **N/A** для Phase A (появляются начиная с Phase B/C/D).

## Size diff

| Артефакт         | Baseline      | После Phase A | Δ       |
|------------------|---------------|---------------|---------|
| libDspCore.a     | 20 263 312 B  | 20 043 652 B  | −219 660 B |
| gpu_profiler.cpp.o | 116 840 B   | 105 540 B     | −11 300 B  |

## Issues / Notes / Side-effects

- `core/Doc/*.md` всё ещё содержит упоминания `OpenCLProfilingData` /
  `FillOpenCLProfilingData` / `opencl_profiling.hpp` (6 файлов):
  `Doc/Full.md`, `Doc/OpenCL.md`, `Doc/API.md`, `Doc/Architecture.md`,
  `Doc/Classes.md`, `Doc/Services/Full.md`. Это документация — обновлять
  по стандарту Phase E / Task 3, не в scope Phase A (спек-грепы
  фигурируют "в `core/`" — но по духу "в коде"; документация — отдельный
  артефакт).
- В downstream-репо (`spectrum`, `stats`, ...) формально могут быть
  `RecordEvent(...cl_event...)` вызовы в `modules/*/tests/` / benchmarks
  — но это будет разбираться в Phase D (cross-repo migration).
  На `new_profiler`-ветке `core` само по себе собирается и тесты
  зелёные, так что downstream ждёт своей фазы.
- В `gpu_benchmark_base.hpp::InitProfiler()` остался блок OpenCL-ветки
  заполнения `drivers` — это корректно (шапка отчёта может показывать
  OpenCL драйвер как информацию, даже если профайлер пишет ROCm-данные).
- `test_gpu_profiler_baseline.hpp` оставлен в дереве: переиспользуется
  в Phase B (ProfileStore) и Phase E (финальные сравнения).

## Ready for review?

**YES** — все 9 acceptance criteria ✅, commit готов к push
(`git push -u origin new_profiler` — делает Alex/coordinator).
