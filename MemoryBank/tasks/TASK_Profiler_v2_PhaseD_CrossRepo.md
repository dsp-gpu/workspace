# TASK Phase D: Cross-repo Benchmark Migration

> **Prerequisites**: Phase A-C завершены в `core/new_profiler`
> **Effort**: 8-12 часов (6 репо, 16 файлов)
> **Scope**: `spectrum`, `stats`, `signal_generators`, `heterodyne`, `linalg`, `strategies`
> **⚠️ Radar ИСКЛЮЧЁН** (W6 из ревью — Alex: "radar — пока делать не нужно")
> **Depends**: Phase C

---

## 🎯 Цель

Обновить benchmark-файлы во всех зависимых репо, чтобы использовали новый API `ProfilingFacade::BatchRecord(...)` вместо старого `RecordROCmEvent()` loop.

**Важно**: production модульный код (Process, Dechirp, FFT итд) **НЕ ТРОГАЕМ**. Меняются только `*_benchmark_rocm.hpp` файлы.

---

## 📋 Список репо и файлов

### spectrum (8 файлов)
- `fft_processor_benchmark_rocm.hpp`
- `fft_maxima_benchmark_rocm.hpp`
- `test_fft_benchmark_rocm.hpp`
- `test_fft_maxima_benchmark_rocm.hpp`
- `filters_benchmark_rocm.hpp`
- `test_filters_benchmark_rocm.hpp`
- `lch_farrow_benchmark_rocm.hpp`
- `test_lch_farrow_benchmark_rocm.hpp`

### stats (2 файла)
- `statistics_compute_all_benchmark.hpp`
- `snr_estimator_benchmark.hpp`

### signal_generators (2 файла)
- `signal_generators_benchmark_rocm.hpp`
- `test_signal_generators_benchmark_rocm.hpp`

### heterodyne (2 файла)
- `heterodyne_benchmark_rocm.hpp`
- `test_heterodyne_benchmark_rocm.hpp`

### linalg (2 файла)
- `capon_benchmark.hpp`
- `test_capon_benchmark_rocm.hpp`

### strategies (1 файл)
- `strategies_profiling_benchmark.hpp`

**Итого: 17 файлов** (НЕ 17 с радаром — radar исключён, остаётся 16... пересчитать: spectrum 8 + stats 2 + sig 2 + het 2 + lin 2 + strat 1 = **17**). Radar (0 файлов) не прибавляет.

---

## 📋 Шаги (для каждого репо одинаково)

### D0-pre. Preflight: radar не тронут

**Обязательная проверка** перед любыми коммитами в Phase D:

```bash
cd E:/DSP-GPU
radar_branch=$(git -C ./radar branch --show-current)
if [ "$radar_branch" != "main" ]; then
  echo "🔴 FAIL: radar должен быть на main, сейчас: $radar_branch"
  echo "Radar исключён из profiler v2 (W6). Если переключились случайно — вернись:"
  echo "  cd ./radar && git checkout main"
  exit 1
fi
echo "✅ radar на main (W6 соблюдён)"
```

Если FAIL — **не переходить к D0** пока не вернули radar на main.

### D0. Создать ветку в репо

Для каждого из 6 репо:
```bash
cd E:/DSP-GPU/<repo>
git status                       # чисто на main
git checkout -b new_profiler
```

**⚠️ `git push` только с OK Alex.**

---

### D1. Обновить FetchContent на `core/new_profiler`

⚠️ **CMAKE — СПРОСИТЬ ALEX** перед любой правкой `cmake/fetch_deps.cmake` или `CMakePresets.json`.

Для локальной разработки — можно использовать `FETCHCONTENT_SOURCE_DIR_DSP_CORE=E:/DSP-GPU/core` — это через env var, CMake не правится.

---

### D2. Обновить benchmark файл

**Паттерн замены** (одинаковый для всех):

**БЫЛО** (v1):
```cpp
#include <DrvGPU/services/gpu_benchmark_base.hpp>
// или старый путь
#include <core/services/gpu_profiler.hpp>

void ExecuteKernelTimed() override {
    HeterodyneROCmProfEvents events;
    proc_.Dechirp(rx_data_, ref_data_, params_, &events);
    for (auto& [name, data] : events) {
        RecordROCmEvent(name, data);
    }
}
```

**СТАЛО** (v2):
```cpp
#include <core/services/profiling/profiling_facade.hpp>

void ExecuteKernelTimed() override {
    HeterodyneROCmProfEvents events;
    proc_.Dechirp(rx_data_, ref_data_, params_, &events);
    drv_gpu_lib::profiling::ProfilingFacade::GetInstance()
        .BatchRecord(gpu_id_, "heterodyne", events);
}
```

**Имя модуля** (`"heterodyne"`) — соответствует репо:
- spectrum → `"spectrum"` (или уточнения `"spectrum/fft"`, `"spectrum/filters"`)
- stats → `"stats"`
- signal_generators → `"signal_generators"`
- heterodyne → `"heterodyne"`
- linalg → `"linalg"` или `"linalg/capon"`
- strategies → `"strategies/BeamV1"` и т.п. (иерархия через `/`)

---

### D3. Для каждого изменённого файла — найти все RecordROCmEvent

```bash
cd E:/DSP-GPU/<repo>
grep -rn "RecordROCmEvent\|RecordEvent(.*cl_event" tests/
```

Каждое вхождение — заменить на `BatchRecord`.

---

### D4. Build + test

```bash
cd E:/DSP-GPU/<repo>
export FETCHCONTENT_SOURCE_DIR_DSP_CORE=E:/DSP-GPU/core
rm -rf build
cmake --preset debian-local-dev
cmake --build build -j
ctest --test-dir build --output-on-failure
```

**Acceptance per repo**:
- ✅ Сборка зелёная
- ✅ Все тесты репо зелёные
- ✅ Grep `RecordROCmEvent` пусто (если старый паттерн полностью ушёл — иначе оставить с комментом)

---

### D5. Commit в репо

```bash
git add -A
git commit -m "[profiler-v2] Phase D: migrate benchmarks to BatchRecord API

- Replace RecordROCmEvent() loop with ProfilingFacade::BatchRecord()
- Update include: gpu_profiler.hpp → profiling_facade.hpp
- N files updated (list specific files)

Refs: core/new_profiler branch
Part of profiler v2 rollout."
```

**⚠️ Push только с OK Alex.**

---

## 📋 Порядок обхода репо (граф зависимостей)

```
spectrum   stats              ← параллельно, зависят от core
  ↓         ↓
sig_gen   linalg              ← параллельно
  ↓
heterodyne                    ← зависит от sig_gen + spectrum
  ↓
strategies                    ← последний, зависит от всех
```

Реализация:
1. **spectrum** (8 файлов) — самый большой
2. **stats** (2 файла)
3. **signal_generators** (2 файла)
4. **linalg** (2 файла)
5. **heterodyne** (2 файла) — после sig_gen + spectrum
6. **strategies** (1 файл) — последний

После каждого репо — `cmake --preset debian-local-dev && cmake --build build && ctest`.

---

## ✅ Acceptance Criteria (для всей Phase D)

| # | Критерий | Проверка |
|---|----------|---------|
| 1 | Все 6 репо на ветке `new_profiler` | `for d in spectrum stats signal_generators heterodyne linalg strategies; do git -C $d branch --show-current; done` |
| 2 | 17 файлов обновлены | см. список выше — все grep-able `BatchRecord` |
| 3 | Radar НЕ тронут | `git -C radar branch --show-current` == main |
| 4 | Каждый репо собирается | cmake --build зелёный |
| 5 | Каждый репо тесты зелёные | ctest exit 0 |
| 6 | Full pipeline (DSP meta) собирается | `cmake --build build --target all -j` в DSP/ |
| 7 | Нет остатков `RecordROCmEvent` | `grep -rn RecordROCmEvent <all 6 repos>/` пусто |

---

## 🚨 Особые случаи

### Если в репо используется `RecordEvent(cl_event)` (старый OpenCL)
**Это значит миграция к ROCmProfEvents не завершена в v1.** Спросить Alex — оставить `[[deprecated]]` shim в ScopedProfileTimer или переписать полностью.

### Если внутри модуля Process() сам пишет в GPUProfiler::GetInstance()
Это код модуля, НЕ benchmark. Правки нужны, но строка комментируется "TODO: inject via IProfilerRecorder" — не переписываем сейчас (W1 ruling).

### Если тест ПАДАЕТ после миграции
1. Не continue к следующему репо
2. Диагностика: `ctest --rerun-failed -V`
3. Сообщить Alex, не применять странные fix'ы

---

## 📖 Почему именно BatchRecord, а не per-event Record?

Из спеки 17a.2:
> ScopedProfileTimer wraps ONE call from OUTSIDE (only total time)
> ROCmProfEvents collects N operations INSIDE Process()
> L1 Pipeline Breakdown REQUIRES per-operation granularity

Модуль сам даёт `events` map — один вызов `BatchRecord` чистит N записей одним махом. Если использовать per-event `Record()` в цикле — 1000 вызовов вместо одного, хуже для queue congestion.

---

*Task created: 2026-04-17 | Phase D | Status: READY (after C)*
