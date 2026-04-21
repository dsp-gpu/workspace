# Profiler v2 — Phase D (stats) — DEEP REVIEW

**Date**: 2026-04-20
**Reviewer**: deep-reviewer (Codo)
**Method**: mcp__sequential-thinking (5 thoughts)
**Artifact under review**:
- stats @ `new_profiler` HEAD `15f6ef5`
- core  @ `new_profiler` HEAD `a0ca8e9` (не изменялся в этой фазе)
- spectrum @ `new_profiler` HEAD `b15c38e` (уже смигрирован, Phase D round 1)
- Diff: `main..15f6ef5` — **2 файла, +5/-2 строк (минимальная, хирургическая правка)**

**Pattern reference**: `phase_D_spectrum_report.md` (Phase D round 1, spectrum)
**Task agent claim**: `test_stats_main 110 PASS / 0 FAIL`

---

## VERDICT: PASS

- Blockers: 0
- Serious: 0
- Minor: 3 (все не-блокирующие, doc staleness + .gitignore)
- Informational notes: 2

All acceptance criteria выполнены. Задача-агент подтверждается live-проверкой.

---

## 1. Acceptance Phase D (stats)

### 1.1 Миграция benchmark-файлов

| Файл | RecordROCmEvent было | ProfilingFacade стало | API | Module name |
|------|:---:|:---:|:---:|:---:|
| `tests/snr_estimator_benchmark.hpp`          | 1× | 1× | `Record` (single event)   | `"stats/snr_estimator"` |
| `tests/statistics_compute_all_benchmark.hpp` | N× (loop over events) | 1× (batch) | `BatchRecord<EventsContainer>` | `"stats/compute_all"` |

**Правильный выбор API**:
- `snr_estimator` пишет **один** ROCmProfilingData (`ComputeSnrDb_total`) — используется `Record(gpu_id, module, event, data)`. Корректно — BatchRecord был бы избыточен.
- `compute_all` пишет **N событий** через `StatisticsROCmProfEvents` (Upload|Welford_Fused|Median) — используется `BatchRecord(gpu_id, module, events)`. Корректно — матчит шаблонную сигнатуру `BatchRecord<EventsContainer>` из facade.

**Module-naming consistency**: `"stats/<sub>"` полностью соответствует spectrum-паттерну `"spectrum/<sub>"`. ✅

**Include path**: `<core/services/profiling/profiling_facade.hpp>` — корректный абсолютный include, совпадает с путём в `/home/alex/DSP-GPU/core/include/core/services/profiling/profiling_facade.hpp`. ✅

**gpu_id_**: наследуется от `drv_gpu_lib::GpuBenchmarkBase` — типовой для иерархии (тот же паттерн что spectrum). ✅

**API-соответствие** (проверено по `core/include/core/services/profiling/profiling_facade.hpp:54-73`):
- `void Record(int gpu_id, const std::string& module, const std::string& event, const ROCmProfilingData& data)` — сигнатура совпадает с snr_estimator вызовом.
- `template<EventsContainer> void BatchRecord(int gpu_id, const std::string& module, const EventsContainer& events)` — сигнатура совпадает с compute_all вызовом. Контейнер `StatisticsROCmProfEvents` итерируемый `std::pair<string, ROCmProfilingData>` — подходит под требование шаблона.

**Verdict 1.1**: PASS.

### 1.2 CMake не тронут

```
git diff main..new_profiler -- '*.txt' 'CMakeLists.txt' '*.cmake'
→ (пусто)
```

Никаких CMakeLists.txt / CMakePresets.json / cmake/*.cmake правок. Соответствует CLAUDE.md:
«❌ ЛЮБОЕ изменение CMakeLists.txt — только после явного согласования».

**Verdict 1.2**: PASS.

### 1.3 radar untouched (W6)

```
cd /home/alex/DSP-GPU/radar && git branch --show-current
→ main
```

radar остался на main, не трогался. ✅

**Verdict 1.3**: PASS.

### 1.4 FetchContent — core с new_profiler подтягивается

Preset `debian-local-dev`:
```json
"FETCHCONTENT_SOURCE_DIR_DSPCORE": "${sourceDir}/../core"
```

`../core` = `/home/alex/DSP-GPU/core` → `git branch --show-current` = `new_profiler`, HEAD = `a0ca8e9` (Phase C — Exporters + Facade + ScopedProfileTimer). Facade.hpp присутствует по пути `include/core/services/profiling/profiling_facade.hpp`. ✅

**Verdict 1.4**: PASS.

### 1.5 Build zero errors

```
cmake --build build -j 32
[1/3] [DspCore] Checking git version...
-- [version] a0ca8e9 — no changes
[2/3] [DspSpectrum] Checking git version...
-- [version] b15c38e — no changes
[3/3] [DspStats] Checking git version...
-- [version] DSPSTATS 0.0.0-15f6ef5 (new_profiler)
```

Ninja не требует пересборки → всё актуально.

**mtime verification** — чтобы исключить stale binary:
- `build/tests/test_stats_main`                         = 18:52:19
- `tests/snr_estimator_benchmark.hpp`                   = 18:52:11
- `tests/statistics_compute_all_benchmark.hpp`          = 18:52:01

Бинарь новее обоих изменённых заголовков → собран **С** миграцией. ✅

**Verdict 1.5**: PASS.

### 1.6 Tests — 110/0 PASS

```
./build/tests/test_stats_main > /tmp/stats_test.log
EXIT=0
[PASS] count:  110
[FAIL] count:    0
```

Два SUMMARY-блока:
- `[Stats ROCm]`   → 15 passed, 0 failed  (compute_all_cpu / compute_all_gpu / compute_all_float / compute_all_edge_cases)
- `[StatsFloat]`   → 6 passed, 0 failed

Остальные 89 PASS идут по другим suite'ам того же binary (stats_vector_*, median_*, pipeline_*, kernel loading, и т.д.). **Total 110 PASS / 0 FAIL — claim task-agent'a подтверждён**.

**Verdict 1.6**: PASS.

---

## 2. CLAUDE.md соответствие

| Правило | Результат |
|---------|-----------|
| pytest запрещён | ✅ отсутствует (TestRunner) |
| `#ifdef _WIN32` запрещён | ✅ отсутствует |
| `std::cout` → ConsoleOutput | ✅ в изменённых файлах cout нет |
| find_package lowercase | N/A (CMake не трогался) |
| Теги неизменны | N/A |
| CMake без согласования | ✅ (не трогался) |

**Verdict 2**: PASS.

---

## 3. Side-issues / Minor

### 3.1 [Minor] Doc-staleness: упоминания `RecordROCmEvent` в комментариях

- `tests/snr_estimator_benchmark.hpp:8` — docstring: `«через hipEvent пары → RecordROCmEvent → GPUProfiler»`
- `tests/snr_estimator_benchmark.hpp:67` — inline comment: `«записываем e2e время через hipEvent пару + RecordROCmEvent»`
- `tests/README.md:38` — `«через hipEvent пары → RecordROCmEvent → GPUProfiler»`

Это **не код**, и не ломает ничего. Но spectrum-review уже упоминал апдейт doc-комментариев. Для консистентности можно заменить в follow-up commit на `→ ProfilingFacade::Record/BatchRecord`.

**Priority**: P3 (косметика, не блокер).

### 3.2 [Minor] Untracked `modules/` — kernel binaries

В рабочем дереве stats:
```
modules/fft_func/kernels/gfx1201/...
modules/statistics/kernels/gfx1201/...
```

Это **build artefact** (скомпилированные HSACO ядра в рабочем дереве для пакета kernel bins). `.gitignore` содержит только `build/`, `*.pyd`, `*.so`, `__pycache__/`, `.cache/` — `modules/` не покрыт, из-за чего всегда торчит как untracked. Рекомендуется добавить:
```
modules/
```

**Priority**: P3 (не влияет на Phase D).

### 3.3 [Minor] Untracked `Logs/`

Тот же случай — runtime artefact. Следует добавить в `.gitignore`.

**Priority**: P3.

---

## 4. Informational Notes

### 4.1 ctest "No tests were found"

```
ctest --test-dir build --output-on-failure
→ No tests were found!!!
```

Тестовый `tests/CMakeLists.txt` собирает `test_stats_main` как отдельный binary, но не регистрирует его через `add_test()`. Как следствие `ctest` не видит тесты. Это **pre-existing** состояние (не внесено в Phase D), и на работу Phase D не влияет — binary запускается напрямую и даёт 110/0. Возможно стоит добавить `add_test(NAME test_stats_main COMMAND test_stats_main)` в follow-up task.

### 4.2 Консистентность с spectrum Phase D

Миграция stats следует тому же шаблону что spectrum (рефренс `phase_D_spectrum_report.md`):
- Абсолютный include facade.hpp — такой же.
- `BatchRecord(gpu_id_, "<module>/<sub>", events)` — идентичная форма.
- Минимальный diff (+5/-2 здесь vs +318/-26 в spectrum из-за разного кол-ва benchmark-файлов: 2 vs 4).

Единственное отличие — stats содержит **single-event** кейс (snr_estimator), где `Record` использован вместо `BatchRecord`. Это **правильно** и не противоречит spectrum-паттерну.

---

## 5. Regression Check

- Pre-existing `[Stats ROCm]` suite: 15/15 PASS (compute_all тесты — тот самый compute_all, benchmark которого мигрирован).
- Pre-existing `[StatsFloat]` suite: 6/6 PASS.
- Total `[PASS]` = 110. `[FAIL]` = 0.
- Ни один ранее проходивший тест не сломан. ✅

---

## 6. Итого

| Критерий                              | Статус |
|---------------------------------------|:------:|
| 1.1 Миграция benchmark-файлов         | ✅ PASS |
| 1.2 CMake не тронут                   | ✅ PASS |
| 1.3 radar untouched                   | ✅ PASS |
| 1.4 FetchContent pulls new_profiler core | ✅ PASS |
| 1.5 Build zero errors                 | ✅ PASS |
| 1.6 Tests 110/0                       | ✅ PASS |
| 2   CLAUDE.md compliance              | ✅ PASS |

**Blockers**: 0
**Serious**: 0
**Minor**: 3 (doc staleness × 2, .gitignore)
**Informational**: 2 (ctest registration, pattern consistency)

---

**Recommendation**: **MERGE** `new_profiler` → когда Phase D cross-repo завершится.
Follow-up (не блокер для Phase D):
- Заменить упоминания `RecordROCmEvent` в doc-комментариях (snr_estimator_benchmark.hpp lines 8, 67 + README.md:38)
- Добавить `modules/` и `Logs/` в `.gitignore`
- Зарегистрировать `test_stats_main` через `add_test()` (отдельная задача)
