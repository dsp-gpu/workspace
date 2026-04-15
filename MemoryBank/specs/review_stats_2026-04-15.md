# 🔍 Глубокое ревью: stats — 2026-04-15

**Автор**: Кодо (AI Assistant)
**Эталон**: `E:\C++\GPUWorkLib\modules\statistics\`
**Новейшая фича** в эталоне: **SNR-estimator (SNR_05)**, 2026-04-09 — включает `SnrEstimatorOp`, `BranchSelector`, `peak_cfar_kernel`, `gather_decimated_kernel`.

---

## 📊 Статус по факту

| Аспект | Статус |
|--------|--------|
| Файлы кода перенесены из GPUWorkLib | ✅ 1:1 (все operations + kernels + types) |
| SNR_05 фича файлами присутствует | ✅ `snr_estimator_op.hpp`, `peak_cfar_kernel.hpp`, `gather_decimated_kernel.hpp`, `branch_selector.hpp` |
| **stats собирается сейчас** | 🔴 **НЕТ** — блокер CMake |
| ScopedHipEvent применён (код) | ✅ в `statistics_processor.cpp` (сегодня) |
| Python bindings существуют | ✅ `python/dsp_stats_module.cpp` + helpers |
| Тесты SNR присутствуют | ✅ 4 файла в `tests/` |

---

## 🔴 Блокер сборки (критично!)

### Проблема
`StatisticsProcessor::ComputeSnrDb` использует `SnrEstimatorOp` — это публичная фича SNR_05.

Цепочка include:
```
statistics_processor.cpp
  └→ stats/statistics_processor.hpp
      └→ stats/operations/snr_estimator_op.hpp
          └→ spectrum/fft_processor_rocm.hpp  ← ЗАВИСИМОСТЬ ОТ SPECTRUM
```

`SnrEstimatorOp` держит `std::unique_ptr<fft_processor::FFTProcessorROCm>` и вызывает `ProcessMagnitudesToGPU` из spectrum для расчёта `|X|²`.

### Что в stats/CMakeLists.txt (строки 11-36)
```cmake
find_package(hip     REQUIRED)
find_package(rocprim REQUIRED)

include(cmake/fetch_deps.cmake)
fetch_dsp_core()                                       # ← только core

target_link_libraries(DspStats PUBLIC DspCore::DspCore roc::rocprim)
#                                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
#                                      НЕТ DspSpectrum!
```

### Результат
`cmake --build stats/build` → **`fatal error: 'spectrum/fft_processor_rocm.hpp' file not found`**

### Почему не ловилось раньше
- SNR_05 добавлен в GPUWorkLib 2026-04-09, там — монолит, все модули в одном проекте → проблемы нет.
- При миграции (2026-04-12…14) stats/CMakeLists.txt написан по **оригинальной** архитектуре из CLAUDE.md (`stats → core + rocprim`), до появления SNR_05.
- После добавления SNR_05 в stats CMake **не обновлён** — файл компилировался бы на Linux с ошибкой, но до сих пор никто stats не билдил на Linux GPU в модульном проекте.

---

## 🟠 Важные проблемы

### Issue #1 — дубль `src/statistics/tests/`

```
stats/tests/                      ← 12 файлов (ПРАВИЛЬНОЕ место, подключено в CMake line 95)
  ├── CMakeLists.txt
  ├── main.cpp
  ├── all_test.hpp
  ├── snr_*.hpp (4 файла — бенчмарки SNR_05)
  ├── statistics_compute_all_benchmark.hpp
  ├── test_*.hpp (4 файла)
  └── README.md

stats/src/statistics/tests/       ← 10 файлов (МУСОР, артефакт миграции)
  └── те же .hpp но БЕЗ CMakeLists.txt и main.cpp
```

**Результат**: захламление, риск что правка попадёт не в тот файл.

### Issue #2 — CLAUDE.md устарел

Строка 47: `| stats | statistics (welford, median, radix) | core + rocprim |`

Реально после SNR_05: stats зависит от **core + spectrum + rocprim**.

### Issue #3 — Python bindings есть, но отключены по умолчанию

```cmake
option(DSP_STATS_BUILD_PYTHON "Build Python bindings"  OFF)
```

Файлы есть: `python/dsp_stats_module.cpp`, `py_helpers.hpp`, `py_statistics.hpp`. Не проверено:
- Экспортированы ли SNR-методы (`ComputeSnrDb`)?
- Работает ли сборка `.so`?

---

## 🟡 Утечки hipEvent_t

### Статус после сегодняшнего sed
- **`statistics_processor.cpp`** (9 мест): ✅ применён `ScopedHipEvent`, 0 ручных Create/Destroy
- **`tests/snr_estimator_benchmark.hpp`** (2 места): ⏸ не тронут (тестовый файл)
- **`tests/test_snr_estimator_benchmark.hpp`**: ⏸ не проверен (0 мест по предыдущему grep — но в подсчёт могли не попасть)

---

## 🟢 Косметика

### Doxygen-проверки
- `statistics_processor.hpp` строки 180-195 — комментарии про `ComputeSnrDb` — ОК.
- `snr_estimator_op.hpp` — хороший комментарий (pipeline описан, даты, калибровка `P_correct=97.9%`).

### statistics_sort_gpu.hip
Отдельный файл для `rocprim::segmented_radix_sort_keys` — компилится только hipcc (g++ не умеет rocprim). **Претензий нет** — архитектурно правильно.

---

## 🎯 Карта зависимости после фикса

```
stats (DspStats)
├── DspCore            — IBackend, GpuContext, GPUProfiler, ScopedHipEvent, ...
├── DspSpectrum        ← НОВОЕ: FFTProcessorROCm::ProcessMagnitudesToGPU (для SNR_05)
└── roc::rocprim       — segmented_radix_sort_keys (median)
```

**Циклов нет**: spectrum не зависит от stats (проверено — spectrum линкуется только на core).

**Тест на потенциальный цикл**: linalg/radar/strategies используют и spectrum, и stats → транзитивный порядок: `core → spectrum → stats → radar/strategies/DSP`.

---

## 📋 Список действий — в порядке приоритета

| # | Задача | Приоритет | CMake? | Estimate |
|---|--------|-----------|--------|----------|
| T1 | **Добавить spectrum в CMake** stats | 🔴 **БЛОКЕР** | ✅ да (OK Alex!) | 10 мин |
| T2 | Удалить `src/statistics/tests/` | 🟠 | нет | 5 мин |
| T3 | Обновить CLAUDE.md (stats deps) | 🟠 | нет | 3 мин |
| T4 | ScopedHipEvent в `tests/snr_estimator_benchmark.hpp` | 🟡 | нет | 10 мин |
| T5 | Проверить Python bindings для SNR | 🟡 | maybe | 20 мин |
| T6 | Baseline build + ctest на Linux GPU | 🔴 | нет | завтра |
| T7 | Проверить stats через `repo-sync` agent | 🟢 | нет | 5 мин |

**Общий estimate**: ~1 час локальной работы + 30 мин завтра на GPU.

---

## 🔗 Связи

- `spectrum` — ScopedHipEvent перенесён в core сегодня (см. `MemoryBank/changelog/2026-04-15_core_spectrum_followups.md`)
- `core` — ScopedHipEvent теперь в `core/include/core/services/scoped_hip_event.hpp` (namespace `drv_gpu_lib`)
- Следующее ревью: **linalg** (тоже потенциально нуждается в зависимости от других модулей?), **radar** (который уже зависит от spectrum + stats)

---

*Created: 2026-04-15 | Кодо (AI Assistant)*
