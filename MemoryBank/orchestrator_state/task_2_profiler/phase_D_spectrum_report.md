# Profiler v2 — Phase D (spectrum) Report

**Date**: 2026-04-20
**Branch**: new_profiler (в spectrum)
**Spec**: MemoryBank/tasks/TASK_Profiler_v2_PhaseD_CrossRepo.md
**Scope**: ТОЛЬКО spectrum (Gate 3). Оставшиеся 5 репо (stats,
signal_generators, heterodyne, linalg, strategies) — следующими вызовами.

## Что сделано

1. **Pre-flight**:
   - radar остался на `main` (W6) ✅
   - spectrum: clean, на main, 1 worktree ✅
   - core: на `new_profiler` HEAD `a0ca8e9` ✅

2. **Создана ветка `new_profiler` в spectrum** (от `main` @ `f1839e3`).

3. **Миграция 4 benchmark-файлов на `ProfilingFacade::BatchRecord`**:
   | Файл | Было | Стало |
   |------|------|-------|
   | `tests/fft_processor_benchmark_rocm.hpp`  | `for(...) RecordROCmEvent(...)` | `ProfilingFacade::BatchRecord(gpu_id_, "spectrum/fft", events)` |
   | `tests/fft_maxima_benchmark_rocm.hpp`     | 2 × старый loop               | 2 × `BatchRecord("spectrum/fft")` |
   | `tests/filters_benchmark_rocm.hpp`        | 2 × старый loop (Fir + Iir)   | 2 × `BatchRecord("spectrum/filters")` |
   | `tests/lch_farrow_benchmark_rocm.hpp`     | старый loop                    | `BatchRecord("spectrum/lch_farrow")` |
   - Добавлен `#include <core/services/profiling/profiling_facade.hpp>` в каждый файл.
   - Комментарии "→ GPUProfiler" обновлены на "→ profiler v2".

4. **Gate 3 integration test**:
   Создан `tests/test_gate3_fft_profiler_v2.hpp`:
   - Реальный FFT (hipFFT + pad + download) через `FFTProcessorROCm`
   - 5 warmup + 20 measure итераций на RX 9070
   - `ProfilingFacade::BatchRecord` — v2 hot path (batch в queue → worker → store)
   - `WaitEmpty` + `ExportJsonAndMarkdown` — файлы создаются
   - `ProfileAnalyzer::ComputePipelineBreakdown` — L1 отсортирован по avg↓
   - `ProfileAnalyzer::ComputeSummary` — L2 stats (avg/med/p95/stddev)
   - `ProfileAnalyzer::AggregateCounters` + `DetectBottleneck` — L3 (без counters → Unknown, graceful)
   - Sanity: стата валидна, % суммируется к 100, p95≥median, stddev≥0
   Зарегистрирован в `tests/all_test.hpp` (после `test_fft_cpu_reference`).

5. **Build + Tests**:
   - `cmake --preset debian-local-dev && cmake --build build -j 32` — зелёный
   - `FETCHCONTENT_SOURCE_DIR_DSPCORE=${sourceDir}/../core` уже был в preset —
     CMake правки НЕ потребовались. Локально подхватил `core/new_profiler`.
   - `./test_spectrum_main` — все тесты проходят:
     - lch_farrow_rocm: 4/4
     - fft_cpu_reference: 4/4
     - **Gate 3 FFT profiler v2: PASS**

## Gate 3 (spectrum) — результаты

**BottleneckType**: `Unknown` (graceful — без hardware counters)
**Семантически**: memory-bound (96.1% copy, 3.9% kernel).

**Pipeline breakdown (N=20, spectrum/fft @ AMD Radeon RX 9070)**:

| Event     | Kind   | Avg ms | %      | Count |
|-----------|--------|-------:|-------:|------:|
| Download  | copy   | 0.525  | 84.15% | 20    |
| Upload    | copy   | 0.075  | 11.97% | 20    |
| Pad       | kernel | 0.013  |  2.12% | 20    |
| FFT       | kernel | 0.011  |  1.75% | 20    |

**Statistics (Download, dominant)**: median=0.522, p95=0.568, stddev=0.020 ms,
min=0.487, max=0.568 — p95 > median, stddev > 0 ✓

**Артефакты**:
- JSON: `MemoryBank/orchestrator_state/task_2_profiler/GATE_3_spectrum_report.json`
- MD  : `MemoryBank/orchestrator_state/task_2_profiler/GATE_3_spectrum_report.md`

## Acceptance (из TASK-файла, только spectrum часть)

- [x] spectrum на `new_profiler` (radar остался на main)
- [x] 4 файла с `RecordROCmEvent` loop мигрированы на `BatchRecord`
     (спека упоминает 8 файлов, но `test_*_benchmark_rocm.hpp` — это
      runner-обёртки, они не содержат Record вызовов; их не трогали).
- [x] `grep RecordROCmEvent spectrum/tests/` → 0 вхождений
- [x] Build зелёный
- [x] Все тесты зелёные (4/4 lch_farrow + 4/4 FFT-Ref + 1/1 Gate 3)
- [x] CMake правки — НЕ потребовались (FETCHCONTENT_SOURCE_DIR_DSPCORE)

## Build/Tests

- cmake build: OK
- spectrum tests: 9/9 (Gate 3 в составе `test_spectrum_main`)
- Gate 3 suite: PASS
- ProfilingFacade JSON schema v2 подтверждён в выводе

## Issues / Notes

- L3 `BottleneckType` возвращает `Unknown` — это правильное поведение
  в отсутствие hardware counters (`sample_count=0`). `DetectBottleneck`
  корректно распознаёт пустую `HardwareProfile` и не делает hallucination.
  Для полноценного memory-bound классификатора нужен rocprofiler plumbing
  (отдельный next-phase — не в scope Phase D).
- `test_lch_farrow_benchmark_rocm::run()` всё ещё закомментирован в
  `all_test.hpp` — не трогал (не в scope Phase D).
- Старые копии benchmark-ов в `src/fft_func/tests/`, `src/filters/tests/`,
  `src/lch_farrow/tests/` содержат старый `RecordROCmEvent` паттерн,
  но они НЕ собираются (`CMakeLists.txt` включает только `tests/`).
  Не трогал — возможно эталонные копии; удалять без явного ОК Alex не буду.

## Ready for review? YES

## Следующие репо (следующими вызовами)

По явному указанию Alex: **только spectrum в этом вызове**. Оставшиеся репо
Phase D для последующих вызовов (по графу зависимостей):
1. stats (2 файла)
2. signal_generators (2 файла)
3. linalg (2 файла)
4. heterodyne (2 файла) — зависит от sig_gen + spectrum
5. strategies (1 файл) — последний
