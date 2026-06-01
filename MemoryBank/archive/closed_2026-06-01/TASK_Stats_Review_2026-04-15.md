# TASK: stats — Follow-ups по ревью 2026-04-15

> **Создан**: 2026-04-15
> **Ревью**: [review_stats_2026-04-15.md](../specs/review_stats_2026-04-15.md)
> **Статус**: ⬜ BACKLOG
> **Блокирует**: сборку stats на Linux GPU (без T1 — `fatal error` при компиляции)

---

## 📊 Сводка задач

| ID | Задача | Приоритет | CMake? | Estimate | Зависит от |
|----|--------|-----------|--------|----------|------------|
| T1 | Добавить DspSpectrum в stats/CMakeLists.txt | 🔴 БЛОКЕР | ✅ **OK Alex** | 10 мин | — |
| T2 | Удалить дубль `src/statistics/tests/` | 🟠 | нет | 5 мин | — |
| T3 | Обновить CLAUDE.md (stats deps) | 🟠 | нет | 3 мин | — |
| T4 | ScopedHipEvent в `tests/snr_estimator_benchmark.hpp` | 🟡 | нет | 10 мин | — |
| T5 | Проверить Python bindings SNR | 🟡 | maybe | 20 мин | T1 |
| T6 | Baseline build + ctest на Linux GPU | 🔴 | нет | завтра | T1, T2, T3 |
| T7 | repo-sync agent на stats | 🟢 | нет | 5 мин | T1–T5 |

---

## 🔴 T1 — Добавить DspSpectrum в CMake (БЛОКЕР)

### Цель
Сейчас `StatisticsProcessor::ComputeSnrDb` → `SnrEstimatorOp` → `<spectrum/fft_processor_rocm.hpp>`. stats НЕ собирается без DspSpectrum.

### DIFF-preview для `stats/CMakeLists.txt`

```diff
  # ── Зависимости ────────────────────────────────────────────────────
  find_package(hip     REQUIRED)   # lowercase — Linux case-sensitive!
  find_package(rocprim REQUIRED)

  include(cmake/fetch_deps.cmake)
  fetch_dsp_core()
+ fetch_dsp_spectrum()              # SNR_05: SnrEstimatorOp использует FFTProcessorROCm

  # ── Библиотека ─────────────────────────────────────────────────────
  add_library(DspStats STATIC)
  ...

- target_link_libraries(DspStats PUBLIC DspCore::DspCore roc::rocprim)
+ target_link_libraries(DspStats PUBLIC
+   DspCore::DspCore
+   DspSpectrum::DspSpectrum          # SNR_05: FFT в SnrEstimatorOp
+   roc::rocprim)
```

### Почему PUBLIC (а не PRIVATE)?
`SnrEstimatorOp` — **публичный** header stats (`include/stats/operations/`). Клиент stats, который использует `StatisticsProcessor::ComputeSnrDb`, транзитивно нуждается в заголовках spectrum. PUBLIC прокинет это через `target_link_libraries`.

### Acceptance criteria
- [ ] `stats/CMakeLists.txt` содержит `fetch_dsp_spectrum()` и `DspSpectrum::DspSpectrum` в `target_link_libraries`
- [ ] DIFF-preview показан Alex, получен OK
- [ ] После сборки на Linux `cmake --build stats/build` — без ошибок include

### ⚠️ Перед применением
**ОБЯЗАТЕЛЬНО** показать этот DIFF Alex и получить явное «OK» (правило CLAUDE.md).

---

## 🟠 T2 — Удалить дубль `src/statistics/tests/`

### Цель
Убрать мусор артефакта миграции. Правильное место тестов — `stats/tests/`, уже подключено в CMake (line 95).

### Команда
```bash
cd e:/DSP-GPU/stats
git rm -rf src/statistics/tests/
git status  # убедиться что только удаление
```

### Acceptance criteria
- [ ] `src/statistics/tests/` отсутствует
- [ ] `grep -r "src/statistics/tests"` по stats — 0 ссылок (не должно быть include или CMake-отсылок)
- [ ] Сборка stats не падает после удаления

### Что проверить **перед** удалением
```bash
# Нет ли где-то include "src/statistics/tests/..."?
grep -rn "src/statistics/tests\|src\\statistics\\tests" /e/DSP-GPU/stats/
# Нет ли add_subdirectory(src/statistics/tests) в CMake?
grep -rn "src/statistics/tests" /e/DSP-GPU/stats/CMakeLists.txt /e/DSP-GPU/stats/tests/CMakeLists.txt
```
Если найдены ссылки — разобраться перед удалением.

---

## 🟠 T3 — Обновить CLAUDE.md

### Цель
Текущая строка 47 CLAUDE.md:
```
| `stats` | statistics (welford, median, radix) | core + rocprim |
```

### Fix
```diff
- | `stats` | statistics (welford, median, radix) | core + rocprim |
+ | `stats` | statistics (welford, median, radix) + SNR-estimator | core + spectrum + rocprim |
```

### Acceptance criteria
- [ ] Таблица репо в CLAUDE.md отражает реальный граф зависимостей
- [ ] Проверено что зависимости по графу согласованы: `stats → core + spectrum + rocprim` без циклов

---

## 🟡 T4 — ScopedHipEvent в тесте SNR benchmark

### Файл
`stats/tests/snr_estimator_benchmark.hpp` (2 `hipEventCreate`)

### Паттерн замены — уже отработан (см. changelog 2026-04-15)
```cpp
// БЫЛО:
hipEvent_t ev_s = nullptr, ev_e = nullptr;
hipEventCreate(&ev_s); hipEventCreate(&ev_e);
// ... work ...
hipEventElapsedTime(&ms, ev_s, ev_e);
hipEventDestroy(ev_s); hipEventDestroy(ev_e);

// СТАЛО:
drv_gpu_lib::ScopedHipEvent ev_s, ev_e;
ev_s.Create(); ev_e.Create();
// ... work ...
hipEventElapsedTime(&ms, ev_s.get(), ev_e.get());
// destroy не нужен — RAII
```

Не забыть: `#include <core/services/scoped_hip_event.hpp>`.

### Acceptance criteria
- [ ] 0 `hipEventCreate`/`hipEventDestroy` в `tests/snr_estimator_benchmark.hpp`
- [ ] Соответствующие .get() вызовы в Record/ElapsedTime/etc.

---

## 🟡 T5 — Python bindings для SNR

### Цель
Проверить что `python/dsp_stats_module.cpp` экспортирует SNR-методы (`ComputeSnrDb`, `BranchSelector::Select` и т.д.).

### Шаги
1. Прочитать `stats/python/py_statistics.hpp` и `dsp_stats_module.cpp` — есть ли binding для `ComputeSnrDb`?
2. Сравнить с `GPUWorkLib/Python_test/statistics/` — если там есть SNR-тест, его надо перенести в `DSP/Python/stats/`
3. Если binding отсутствует — добавить:
   ```cpp
   py::class_<StatisticsProcessor>(m, "StatisticsProcessor")
       .def("compute_snr_db", &StatisticsProcessor::ComputeSnrDb,
            py::call_guard<py::gil_scoped_release>(),
            py::arg("data"), py::arg("config"));
   ```
4. Собрать с `-DDSP_STATS_BUILD_PYTHON=ON`, проверить что `.so` есть

### Acceptance criteria
- [ ] SNR API доступен из Python
- [ ] Есть standalone тест `DSP/Python/stats/test_snr_estimator.py` (БЕЗ pytest — `python3 script.py` + exit code)

### Зависит от
T1 (CMake должен знать spectrum — py-module линкуется на DspStats)

---

## 🔴 T6 — Baseline build + ctest на Linux GPU

### Цель
Подтвердить что после T1–T4 всё собирается на `debian-local-dev` preset и тесты проходят.

### Шаги
```bash
cd e:/DSP-GPU/stats
cmake -S . -B build --preset debian-local-dev
cmake --build build --parallel 32 2>&1 | tee /tmp/stats_build.log
# Ожидаем: 0 ошибок

cd build
ctest --output-on-failure 2>&1 | tee /tmp/stats_tests.log
# Ожидаем: все тесты PASS

# Smoke SNR:
./tests/test_stats_main --filter="*snr*"
```

### Acceptance criteria
- [ ] Сборка чистая (0 errors, warnings допустимы)
- [ ] Все тесты (включая SNR benchmarks) PASS
- [ ] `rocm-smi` не показывает утечек памяти после 1000 прогонов `ComputeSnrDb`

### Зависит от
T1 (обязательно), T2, T3 (желательно)

---

## 🟢 T7 — repo-sync agent

### Цель
Запустить агент `repo-sync` на stats, чтобы проверить консистентность с другими репо.

### Команда (примерно)
> Запусти агента `repo-sync` и проверь версию `cmake/version.cmake` + зависимости всех 10 репо. Особое внимание — stats→spectrum после T1.

### Acceptance criteria
- [ ] Отчёт агента: 0 расхождений в версиях, правильный граф зависимостей

---

## 📝 Коммит-сообщения

**Коммит 1** (T1):
```
cmake(stats): добавлена зависимость от DspSpectrum — нужно для SNR_05

StatisticsProcessor::ComputeSnrDb использует SnrEstimatorOp (stats/operations/
snr_estimator_op.hpp), которая держит unique_ptr<FFTProcessorROCm> и вызывает
ProcessMagnitudesToGPU из spectrum.

Без DspSpectrum в target_link_libraries stats не собирался с fatal error:
'spectrum/fft_processor_rocm.hpp' file not found.

PUBLIC вместо PRIVATE — snr_estimator_op.hpp публичный header, транзитивно
нужен клиентам DspStats.

OK дан Alex через DIFF-preview 2026-04-15.
```

**Коммит 2** (T2):
```
chore(stats): удалён дубль src/statistics/tests/ (артефакт миграции)

Правильное место тестов — stats/tests/ (подключено в CMakeLists.txt line 95).
src/statistics/tests/ — оригинальная копия из GPUWorkLib, осталась после
миграции. Захламляло репо, риск правки не в том файле.
```

**Коммит 3** (T3):
```
docs: CLAUDE.md — stats теперь зависит от core + spectrum + rocprim

Обновлено после добавления SNR_05 (SnrEstimatorOp) в stats, который
использует spectrum/fft_processor_rocm.hpp для расчёта |X|².
```

**Коммит 4** (T4):
```
fix(stats): ScopedHipEvent в tests/snr_estimator_benchmark.hpp

Закрыты 2 утечки hipEvent_t в benchmark-тесте. Паттерн тот же что
для statistics_processor.cpp (см. changelog 2026-04-15).
```

---

## 🚦 Definition of Done (весь пакет stats)

- [ ] T1 OK + DIFF-preview + применено
- [ ] T2, T3, T4 выполнены
- [ ] T5 — Python binding SNR проверен
- [ ] T6 — сборка и тесты зелёные на Linux GPU
- [ ] 4 коммита созданы локально
- [ ] `git push` — ТОЛЬКО после OK Alex (правило CLAUDE.md)

---

## 🔗 Связи

- Ревью: [review_stats_2026-04-15.md](../specs/review_stats_2026-04-15.md)
- Параллельно: [TASK_Core_Spectrum_Review_2026-04-15.md](TASK_Core_Spectrum_Review_2026-04-15.md) — тоже требует Linux GPU
- Все изменения из сегодняшней сессии: [changelog/2026-04-15_core_spectrum_followups.md](../changelog/2026-04-15_core_spectrum_followups.md)

---

*Created: 2026-04-15 | Maintained by: Кодо*
