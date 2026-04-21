# Gate 3 — Summary (spectrum/FFT, Profiler v2)

**Date**: 2026-04-20
**Status**: **PASSED**
**Reviewer**: deep-reviewer
**Live-verified on**: AMD Radeon RX 9070 (gfx1201)

---

## What Gate 3 proves

End-to-end цепочка **реального FFT через новый Profiler v2**:

```
hipFFT + Pad + Upload + Download (real GPU kernel, 64 beams × 1024 points, 20 iters)
       │
       ▼  ROCmProfEvents (vector<pair<name, ROCmProfilingData>>)
ProfilingFacade::BatchRecord(gpu_id=0, "spectrum/fft", events)   ← W1 Round 3 fix
       │   (batch в queue → worker thread → MetricStore)
       ▼
ProfilingFacade::ExportJsonAndMarkdown(...)  [auto WaitEmpty внутри]
       │
       ├─► JSON (schema_version=2, gpu → modules → pipeline + events + hw)
       └─► MD  (Pipeline breakdown + Statistical summary)
       │
       ▼
ProfileAnalyzer::ComputePipelineBreakdown  → L1 (отсортировано по avg ↓)
ProfileAnalyzer::ComputeSummary            → L2 (avg/median/p95/stddev)
ProfileAnalyzer::AggregateCounters + DetectBottleneck → L3 (Unknown — graceful)
```

---

## Test / artefact links

| Артефакт | Путь |
|----------|------|
| Integration test | `spectrum/tests/test_gate3_fft_profiler_v2.hpp` (287 lines) |
| Registered in    | `spectrum/tests/all_test.hpp` (под `#if ENABLE_ROCM`) |
| JSON report      | `MemoryBank/orchestrator_state/task_2_profiler/GATE_3_spectrum_report.json` |
| MD report        | `MemoryBank/orchestrator_state/task_2_profiler/GATE_3_spectrum_report.md` |
| Phase D report   | `MemoryBank/orchestrator_state/task_2_profiler/phase_D_spectrum_report.md` |
| Full review      | `MemoryBank/orchestrator_state/task_2_profiler/phase_D_spectrum_review.md` |

---

## Pipeline breakdown (N=20 iters на RX 9070, `spectrum/fft`)

| Event    | Kind   | Avg ms | %      | Count |
|----------|--------|-------:|-------:|------:|
| Download | copy   | 0.525  | 84.15% | 20    |
| Upload   | copy   | 0.075  | 11.97% | 20    |
| Pad      | kernel | 0.013  |  2.12% | 20    |
| FFT      | kernel | 0.011  |  1.75% | 20    |
| **TOTAL**|        |**0.624**| 100.00%| |

Aggregate: kernel **3.88%**, copy **96.13%**, barrier **0.00%**.
→ **Memory-bound pipeline** (copy-heavy) — ожидаемо для малого FFT.

## L2 statistics (Download, dominant)

| Metric | Value |
|--------|------:|
| count  | 20    |
| avg    | 0.525 ms |
| median | 0.522 ms |
| p95    | 0.568 ms |
| p99    | 0.568 ms |
| stddev | 0.020 ms |
| min    | 0.487 ms |
| max    | 0.568 ms |

Invariants: `p95 ≥ median ✓`, `max ≥ avg ≥ min ✓`, `stddev ≥ 0 ✓`.

## L3 Bottleneck classification

`BottleneckType = Unknown` — graceful degradation.

Причина: `hardware.sample_count = 0` (rocprofiler counter plumbing пока
НЕ подключён; это отдельная следующая фаза). `DetectBottleneck(empty)`
**не хэллюцинирует** — возвращает Unknown, семантически корректно.

Семантически pipeline memory-bound (96% copy), но formal classifier
без HW counters не может это подтвердить. Оба факта одновременно
истинны и допустимы.

---

## Sanity check summary (all PASS)

| Проверка | Результат |
|----------|:---------:|
| `schema_version == 2` | ✓ |
| `gpu_id == 0` | ✓ |
| `device_name` заполнено | ✓ (`"AMD Radeon RX 9070"`) |
| `spectrum/fft` модуль в JSON | ✓ |
| 4 event-а (Download/Upload/Pad/FFT) | ✓ |
| Count == 20 на event | ✓ |
| Pipeline % sum == 100.000 | ✓ |
| entries sorted desc by avg | ✓ |
| p95 ≥ median | ✓ |
| max ≥ avg ≥ min | ✓ |
| stddev ≥ 0 | ✓ |
| BottleneckType ∈ valid enum | ✓ |
| Graceful degradation (Unknown) | ✓ |
| JSON/MD файлы created | ✓ |
| MD содержит "Pipeline Breakdown" | ✓ |
| Gate 3 test `run()` returns true | ✓ |

---

## Regression check

- core tests (new_profiler @ a0ca8e9): **36 PASSED / 0 FAILED** — live verified.
- spectrum tests: **9/9 PASSED** (4 lch_farrow + 4 fft-ref + 1 Gate 3) — live verified.

0 регрессий. Core не изменялся в Phase D spectrum.

---

## W6 invariant (radar)

- `radar` остался на `main`, HEAD `40202cb` (pre-Phase D).
- Diff `spectrum main..b15c38e` — 0 упоминаний `radar`.

---

## Готовность

Phase D **spectrum**: Gate 3 PASSED, все acceptance criteria выполнены,
review approved.

**Следующие репо** Phase D (по графу зависимостей):
1. `stats` (2 файла)
2. `signal_generators` (2 файла)
3. `linalg` (2 файла)
4. `heterodyne` (2 файла, зависит от signal_generators + spectrum)
5. `strategies` (1 файл, последний — зависит от всех)

Переходить к ним можно. Gate 3 — пройден.
