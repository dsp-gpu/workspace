# Profiler v2 — Phase D (spectrum) — DEEP REVIEW

**Date**: 2026-04-20
**Reviewer**: deep-reviewer (Codo)
**Method**: mcp__sequential-thinking (6 thoughts)
**Artifact under review**:
- spectrum @ `new_profiler` HEAD `b15c38e`
- core    @ `new_profiler` HEAD `a0ca8e9` (не изменялся в этой фазе)
- Diff: `main..b15c38e` — 6 файлов, +318/-26 строк

**Spec**: `MemoryBank/tasks/TASK_Profiler_v2_PhaseD_CrossRepo.md`
**Report**: `MemoryBank/orchestrator_state/task_2_profiler/phase_D_spectrum_report.md`

---

## VERDICT: PASS

- Blockers: 0
- Serious: 0
- Minor: 0
- Informational notes: 4

All acceptance criteria from TASK-файл (spectrum scope) выполнены.
Gate 3 on RX 9070 — PASS live run.
Core regression — 36/36 PASS, ноль деградации.

---

## 1. Acceptance Phase D (spectrum)

### 1.1 Миграция 4 benchmark-файлов

| Файл                                      | RecordROCmEvent был | BatchRecord стал |
|-------------------------------------------|:-------------------:|:----------------:|
| `tests/fft_processor_benchmark_rocm.hpp`  | 1×                  | 1× `"spectrum/fft"`       |
| `tests/fft_maxima_benchmark_rocm.hpp`     | 2×                  | 2× `"spectrum/fft"`       |
| `tests/filters_benchmark_rocm.hpp`        | 2× (Fir + Iir)      | 2× `"spectrum/filters"`   |
| `tests/lch_farrow_benchmark_rocm.hpp`     | 1×                  | 1× `"spectrum/lch_farrow"`|

Pattern consistent:
```cpp
drv_gpu_lib::profiling::ProfilingFacade::GetInstance()
    .BatchRecord(gpu_id_, "<module-name>", events);
```

- `gpu_id_` наследуется от `GPUBenchmarkBase` (core/services/gpu_benchmark_base.hpp:235) — типовой для существующей иерархии.
- Имена модулей семантически корректны (spectrum/fft, spectrum/filters, spectrum/lch_farrow).
- `#include <core/services/profiling/profiling_facade.hpp>` добавлен во все 4 файла.
- Doc-комментарии обновлены с "→ GPUProfiler" на "→ profiler v2 / ProfilingFacade::BatchRecord".

**Verdict 1.1**: PASS.

### 1.2 Build zero errors

Пре-билд артефакт существует: `spectrum/build/tests/test_spectrum_main`.
Report подтверждает `cmake --build build -j 32` зелёный.
CMake правки не потребовались (см. §3).

**Verdict 1.2**: PASS.

### 1.3 Все tests зелёные — LIVE VERIFIED (RX 9070)

Я запустил `./build/tests/test_spectrum_main` прямо сейчас:

```
[LchFarrow[ROCm]] Results: 4/4 passed
[FFT-Ref] Results: 4/4 passed
[PASS] Gate 3 suite (1 integration test)
```

Всего 9/9 тестов PASS (включая Gate 3 integration).

**Verdict 1.3**: PASS.

---

## 2. W6 Invariant — radar не трогали

```
cd /home/alex/DSP-GPU/radar && git branch --show-current  → main ✓
git log -1 --oneline                                      → 40202cb docs: … (pre-Phase D)
```

В diff `main..b15c38e` — 0 упоминаний `radar|Radar` (grep: `no radar refs`).

**Verdict 2**: PASS.

---

## 3. FetchContent / CMake

Diff `main..b15c38e -- '*.txt' '*.cmake' CMakePresets.json` — **пустой**.

- `CMakePresets.json` содержит preset `debian-local-dev` с
  `FETCHCONTENT_SOURCE_DIR_DSPCORE=${sourceDir}/../core` (строка 24).
- Preset был создан до Phase D и корректно подхватывает локальный
  `core/new_profiler`. Правки не потребовались.
- Ни `find_package`, ни `FetchContent_*` не тронуты.

**Verdict 3**: PASS. (Полное соблюдение CMake запрета из CLAUDE.md.)

---

## 4. Migration correctness

### 4.1 `BatchRecord` контракт

Сигнатура из `profiling_facade.hpp`:
```cpp
template <typename EventsT>
void BatchRecord(int gpu_id, const std::string& module, const EventsT& events);
```
Все 4 файла вызывают её с правильным типом `ROCmProfEvents` (алиас для
`std::vector<std::pair<std::string, ROCmProfilingData>>`) и с `gpu_id_` из
GPUBenchmarkBase. Типы совпадают.

### 4.2 Order facade operations в Gate 3 тесте

```
facade.Reset()                   // line 117
facade.Enable(true)              // line 118
facade.SetGpuInfo(0, gpu_info)   // line 125
... warmup (5 iters, no timing)
... measure (20 iters, BatchRecord per iter)
facade.ExportJsonAndMarkdown(...)  // line 161
facade.GetSnapshot()             // line 181
ProfileAnalyzer::ComputePipelineBreakdown(...)  // L1
ProfileAnalyzer::ComputeSummary(...)            // L2
ProfileAnalyzer::AggregateCounters(...)         // L3
ProfileAnalyzer::DetectBottleneck(...)
```

Порядок правильный:
- `ExportJsonAndMarkdown` внутри вызывает `WaitEmpty()` — см. header
  `profiling_facade.hpp:82 "Вызывает WaitEmpty() внутри"`. Отдельный явный
  `WaitEmpty()` не нужен (подтверждено в spec/contract W2).
- Snapshot берётся после Export — данные уже осели в store.

### 4.3 Backward compat

`grep RecordROCmEvent spectrum/tests/` → **0 вхождений** (миграция полная).
`grep RecordROCmEvent spectrum/src/*/tests/` → **9 старых вхождений** —
эти файлы НЕ собираются (CMakeLists.txt не добавляет их subdirectories).
Не ломают сборку, не ломают тесты.

**Verdict 4**: PASS.

---

## 5. Gate 3 data sanity

Артефакт: `GATE_3_spectrum_report.json` (schema_version=2)

| Проверка | Ожидается | Факт | ОК? |
|----------|-----------|------|:---:|
| `schema_version` | 2 | 2 | ✓ |
| `gpu_id` | 0 | 0 | ✓ |
| `device_name` | ROCm-сам | `"AMD Radeon RX 9070"` | ✓ |
| Модуль | `spectrum/fft` | `spectrum/fft` | ✓ |
| Количество events | 4 (Download, Upload, Pad, FFT) | 4 | ✓ |
| Count на event | 20 (`kIter`) | 20 каждый | ✓ |
| `total_avg_ms` > 0 | да | 0.624 | ✓ |
| Duration values — positive | да | все > 0 | ✓ |
| Duration values — negative | нет | нет | ✓ |
| Pipeline % sum | ≈ 100 | 84.150 + 11.974 + 2.124 + 1.752 = **100.000** | ✓ |
| kernel + copy + barrier | 100 | 3.875 + 96.125 + 0.000 = **100.000** | ✓ |
| p95 ≥ median | да | Download 0.568 ≥ 0.522; Upload 0.110 ≥ 0.072 | ✓ |
| max ≥ avg ≥ min | да | Download 0.568 ≥ 0.525 ≥ 0.487 | ✓ |
| stddev ≥ 0 | да | 0.020 / 0.014 / ~0 / ~0 | ✓ |
| entries sorted desc by avg | да | Download > Upload > Pad > FFT | ✓ |

### 5.1 Memory-bound семантика

Pipeline breakdown:
- Download **84.2%**
- Upload   **12.0%**
- Pad       2.1%
- FFT       1.8%

→ 96.1% copy vs 3.9% kernel — это классический memory-bound profile для
мелкого FFT (64×1024 = 64K complex points ≈ 512 KB payload). Семантически
корректно. Ожидание из report (84/12/2/2) совпало с артефактом и с моим live-run
(83.96/11.95/2.26/1.82 — разброс в пределах stddev).

### 5.2 Graceful degradation BottleneckType

`BottleneckType = Unknown`, потому что `hardware.sample_count = 0`
(rocprofiler counter plumbing не подключён — это в отдельной фазе).

`ProfileAnalyzer::DetectBottleneck(hw)` при пустом HardwareProfile возвращает
`Unknown` — **НЕ** хэллюцинирует фиктивный класс. Это правильное поведение
и подтверждено:
- JSON: `"sample_count": 0, "avg_counters": { }`
- Live: `[L3] hw sample_count=0 bottleneck=unknown`
- Тест явно допускает оба варианта (`bt_valid` — все 5 enum значений).

**Verdict 5**: PASS.

---

## 6. CLAUDE.md compliance

- **pytest**: 0 вхождений в diff. ✓
- **`#ifdef _WIN32`**: 0 вхождений. Только `ENABLE_ROCM` и `M_PI` guard — допустимо. ✓
- **`std::cout`**: используется ТОЛЬКО в тестовых файлах (test/benchmark), не в production. Соответствует существующему паттерну spectrum tests. ✓
- **CMake disciplinary rule**: 0 правок `CMakeLists.txt|CMakePresets.json|cmake/*.cmake`. ✓
- **Секреты**: в артефактах Gate 3 только numeric timings + device name. Ничего чувствительного. ✓

**Verdict 6**: PASS.

---

## 7. Regression

### 7.1 core tests на new_profiler

Запустил `/home/alex/DSP-GPU/core/build/tests/test_core_main` сейчас:
- 36 PASSED, 0 FAILED.
- Явные блоки: `ROCm Test 7/7`, `ROCm External Context 6/6`, `Hybrid External Context 6/6`, `ZeroCopy Bridge`, `HybridBackend Tests`, и др. → все ALL PASSED.

Phase D spectrum не модифицировала core. Регрессии нет.

### 7.2 spectrum pre-existing tests

Live-run показал:
- `lch_farrow_rocm`: 4/4 PASS
- `fft_cpu_reference`: 4/4 PASS
- `Gate 3`: 1/1 PASS

Всего 9/9 без регрессий.

**Verdict 7**: PASS.

---

## 8. Side-issues (информационные ноты, не defects)

### N1. Старые копии benchmark-ов в `src/*/tests/`

Файлы всё ещё содержат старый паттерн `RecordROCmEvent`:
- `src/fft_func/tests/fft_processor_benchmark_rocm.hpp`
- `src/fft_func/tests/fft_maxima_benchmark_rocm.hpp`
- `src/filters/tests/filters_benchmark_rocm.hpp`
- `src/lch_farrow/tests/lch_farrow_benchmark_rocm.hpp`

Они **НЕ компилируются** (spectrum/CMakeLists.txt добавляет только
`tests/`, не `src/*/tests/`). Не ломают сборку, не запускаются.

Author report предлагает удалить их, но не без явного ОК Alex — корректная
осторожность. Рекомендация: в отдельный санитарный PR после закрытия
Phase D всех 6 репо либо удалить (если дубликаты), либо снабдить
`// DEPRECATED — see tests/*.hpp` комментарием.

Блокером не является.

### N2. `test_lch_farrow_benchmark_rocm::run()` закомментирован

В `all_test.hpp:35` вызов benchmark-сьюта прокомментирован (pre-existing).
Не в scope Phase D. OK.

### N3. `std::cout` в Gate 3 тесте

G3 test выводит прогресс через `std::cout`. Это тестовый файл,
непроизводственный путь. Существующие spectrum-тесты используют тот же
паттерн. Не проблема.

### N4. Cosmetic: комментарий "WaitEmpty + Export"

Gate 3 test комментирует секцию как "WaitEmpty + Export", но
физически вызывается только `ExportJsonAndMarkdown`. Это корректно —
Export внутри вызывает WaitEmpty (документировано в facade header).
Можно поправить комментарий до "Export (auto-waits internally)",
но это cosmetic polish, не defect.

---

## Summary

**All acceptance criteria from TASK_Profiler_v2_PhaseD_CrossRepo.md (spectrum
часть) удовлетворены**. Миграция чистая, атомарная, консистентная по всем 4
benchmark-файлам. Gate 3 integration test проверяет всю цепочку
`FFTProcessorROCm → ROCmProfEvents → BatchRecord → ExportJsonAndMarkdown →
ProfileAnalyzer (L1+L2+L3)` на живом GPU. Артефакты JSON/MD валидны и
семантически корректны (memory-bound 96% copy).

Regression: 0.
W6 invariant: сохранён.
CMake изоляция: абсолютная.
Готовность к merge: YES.

---

## Verdict card

```
VERDICT: PASS
thoughts_used: 6
blockers: 0
serious: 0
minor: 0
notes: 4
gate_3_status: PASSED
regression: 0 (core 36/36 + spectrum 9/9)
w6_radar: UNTOUCHED (still on main)
cmake_changes: NONE
```
