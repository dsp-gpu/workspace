# Profiler v2 — Phase D (linalg) Report

**Date**: 2026-04-20
**Agent**: task-profiler-v2 (Кодо)
**Branch**: `new_profiler` (в linalg), от `main @ 450ec21`
**Commit**: `13a8f8d` — `[profiler-v2] Phase D (linalg): migrate to ProfilingFacade`
**Scope**: ТОЛЬКО linalg. Pattern references: spectrum `b15c38e`, stats `15f6ef5`.

## Pre-flight (OK)

- radar branch → `main` ✅ (W6 не тронут)
- linalg: clean (allow `Logs/` untracked), worktree=1, branch `new_profiler`
  уже существовала от предыдущего прогона (с уже закоммиченной миграцией).
- core → `new_profiler` HEAD `a0ca8e9` (через FETCHCONTENT_SOURCE_DIR_DSPCORE).

## Grep `RecordROCmEvent|GPUProfiler::GetInstance|GetProfiler|FillROCmProfilingData`

После миграции единственные вхождения — в doc-комментариях:
```
tests/capon_benchmark.hpp:11: * ... → RecordROCmEvent → GPUProfiler.
tests/capon_benchmark.hpp:85:  /// Замер — ComputeRelief с hipEvent timing → RecordROCmEvent → GPUProfiler
```
Реальные вызовы — все через `ProfilingFacade`. Комментарии — исторические,
не затрагивают runtime. Оставлены (не в scope правки).

## Мигрированные файлы (N=2)

| Файл | Изменение |
|------|-----------|
| `tests/capon_benchmark.hpp` | 2 benchmark-класса (CaponReliefBenchmarkROCm, CaponBeamformBenchmarkROCm) переведены на `ProfilingFacade::GetInstance().Record(gpu_id_, "linalg/capon", "<op>_Total", ROCmProfilingData{...})`. Добавлен `#include <core/services/profiling/profiling_facade.hpp>`. |
| `tests/test_benchmark_symmetrize.hpp` | `TestProfilerIntegration()` мигрирован: `ProfilingFacade::SetGpuInfo` + `Enable(true)` + 2× `Record(gpu_id, "linalg/cholesky", ...)` + `PrintReport` + `ExportJsonAndMarkdown(parallel=false)`. Module-label `"linalg/cholesky"`. |

### Module-labels
- `"linalg/capon"` — CaponProcessor (ComputeRelief, AdaptiveBeamform)
- `"linalg/cholesky"` — CholeskyInverterROCm (POTRF+POTRI Roundtrip/GpuKernel)

### Что оставлено (за scope)
- `#include <core/services/gpu_profiler.hpp>` в `test_benchmark_symmetrize.hpp`:
  нужен для типов `ROCmProfilingData`, `GPUReportInfo`, `BackendType` —
  те же типы используются фасадом. Такой же подход в spectrum/stats Phase D.
- Старый `gpu_profiler.hpp` внутри core не трогаем (в Task 1 он стал прокси-реестром).
- ScopedHipEvent из cleanup Task 1 (commit `f058216`, tag `linalg/cleanup-v0.2.1`) —
  оставлен как есть.

## Build

```
cmake --build build -j 32   # инкрементально
```
- ninja: всё скомпилировано без предупреждений (2 файла только version.cmake re-check).
- CMake правки НЕ потребовались (preset `debian-local-dev` уже содержит
  `FETCHCONTENT_SOURCE_DIR_DSPCORE=${sourceDir}/../core`).

## Tests — full run

**Binary**: `./build/tests/test_linalg_main` — exit code 0, 42 PASS / 0 FAIL.

Ключевые тесты (migration-relevant):
- `TestProfilerIntegration` PASSED — hot path `ProfilingFacade` → `Record` ×2 →
  `PrintReport` + `ExportJsonAndMarkdown` (ENABLE_ROCM=1).
- `TestStageProfiling` PASSED.

Полный test-suite (выжимка):
```
test_capon_rocm::01..05                    PASS
test_capon_reference_data::01..03          PASS
test_capon_opencl_to_rocm::[01..05]        PASS (zero-copy + SVM paths)
test_capon_hip_to_opencl_to_rocm::[01..03] PASS (HIP→OCL SVM interop)
TestResolveMatrixSize                       PASSED
TestCpuIdentity / TestCpu341 / TestGpuVoidPtr341   PASSED × [Roundtrip, GpuKernel]
TestBatchCpu_4x64 / TestBatchGpu_4x64              PASSED × 2 modes
TestBatchSizes / TestMatrixSizes / TestResultAccess PASSED × 2 modes
TestConvert_VectorInput / _HipInput / _OutputFormats PASSED × 2 modes
TestStageProfiling                                  PASSED
TestProfilerIntegration                             PASSED
vector_algebra: ALL TESTS PASSED
```

**Python**: `DSP/Python/linalg/test_capon.py` — 6 passed / 2 failed / 6 skipped.
Падения (`test_relief_interference_suppression`, `test_two_sources_resolved`)
и skips (файлы `x_data.txt`/`y_data.txt`/`signal_matlab.txt`/`z_values.txt`
отсутствуют) — **pre-existing issues в эталонных NumPy-тестах, НЕ связаны
с миграцией профайлера** (тесты не используют `dsp_linalg` и не трогают
ProfilingFacade; они валидируют чистую NumPy-реализацию Capon MVDR).

## Intermittent flake note

Один из прогонов `test_03_zerocopy_matches_direct` упал с
`max_diff >= 1e-4` (OpenCL→ROCm zero-copy через HSA Probe).
При повторе прошёл. Это **pre-existing non-deterministic interop-тест**,
не связан с миграцией (файл `test_capon_opencl_to_rocm.hpp` не трогали —
см. `git diff 450ec21..13a8f8d --stat`). Финальный полный прогон — 42/42 PASS.

## Acceptance

- [x] linalg на `new_profiler` (radar → main W6 не тронут)
- [x] 2 файла с `RecordROCmEvent`/старый `GPUProfiler` API → мигрированы
      на `ProfilingFacade::Record` (spectrum/stats использовали `BatchRecord`,
      но у linalg per-iteration single-event замер — `Record` корректнее).
- [x] `grep RecordROCmEvent linalg/tests/*.hpp` (кроме doc-комментариев) → 0
- [x] Build зелёный (инкрементальный, без CMake правок)
- [x] C++ тесты: 42/42 PASS (вкл. TestProfilerIntegration + TestStageProfiling)
- [x] CMake find_package правки — НЕ трогали
- [x] Коммит создан, НЕ запушен

## Artefacts

- commit: `13a8f8d` на ветке `new_profiler` в `~/DSP-GPU/linalg/`
- report: `MemoryBank/orchestrator_state/task_2_profiler/phase_D_linalg_report.md`
- test log: `/tmp/claude-1000/-home-alex-DSP-GPU/c7f09871.../tasks/bt19fh5ak.output`

## Ready for review? YES

## Pattern match
- spectrum `b15c38e` → 4 файла, `BatchRecord` (есть loop событий).
- stats `15f6ef5` → аналогично spectrum.
- **linalg `13a8f8d`** → 2 файла, `Record` (один замер за итерацию), module
  labels `linalg/capon` и `linalg/cholesky`. Без правок CMake.

## Следующие репо (этот вызов = только linalg)
По графу остались:
1. signal_generators (2 файла) — независим
2. heterodyne (2 файла) — зависит от sig_gen + spectrum
3. strategies (1 файл) — последний (зависит от всех)
