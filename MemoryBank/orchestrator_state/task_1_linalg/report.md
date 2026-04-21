# Task 1 Report — linalg/tests ScopedHipEvent

**Дата**: 2026-04-20
**Ветка**: `cleanup/scoped_hip_event` (репо linalg)
**Commit**: `f0582167ae09245d03b9937879ca04627c222da0`
**Elapsed**: ~0.5h (estimate 1-2h)

## Изменения

3 файла мигрированы на `drv_gpu_lib::ScopedHipEvent`:
- `tests/test_benchmark_symmetrize.hpp` — inline `EvGuard` struct → ScopedHipEvent
- `tests/capon_benchmark.hpp` — manual Create/Destroy x2 → ScopedHipEvent x2
- `tests/test_stage_profiling.hpp` — `EventGuard8`/`EventGuard8C` → `ScopedHipEvent[8]` x2

Diff: +68 -84 (3 files). Lifecycle only; Record/Synchronize/ElapsedTime оставлены.

## Build
- cmake configure: OK
- cmake build: OK (0 errors, warnings = baseline `-Wunused-result`)
- `/tmp/linalg_task1_configure.log`, `/tmp/linalg_task1_build.log`

## Tests
- ctest: "No tests were found!!!" (CMake не регистрирует add_test — baseline)
- `./tests/test_linalg_main` → ALL TESTS PASSED, exit=0
- Python:
  - test_capon.py: 6 pass, 2 fail, 6 skip (failures pre-existed on main — подтверждено)
  - test_cholesky_inverter_rocm.py: 6 skip (gpuworklib not found)
  - test_matrix_csv_comparison.py: 3 skip (gpuworklib not found)

## Leaks
- Не мерил через rocm-smi 100× (не требовалось как обязательный шаг).
- Эталон ScopedHipEvent (core/services/scoped_hip_event.hpp) корректен,
  миграция чисто lifecycle замена.

## Side-issues
1. test_capon.py 2 failures (numerical MVDR reference) — pre-existing на main, вне scope.
2. gpuworklib Python binding не установлен — 9 skip'ов.
3. tests/CMakeLists.txt не использует add_test() — ctest пустой.

## Готово к review? YES

*TASK_1_RESULT: PASS*
