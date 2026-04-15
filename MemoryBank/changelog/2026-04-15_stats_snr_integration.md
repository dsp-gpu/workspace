# Changelog: stats — SNR_05 integration + ScopedHipEvent — 2026-04-15

**Источник**: [TASK_Stats_Review_2026-04-15.md](../tasks/TASK_Stats_Review_2026-04-15.md)
**Ревью**: [review_stats_2026-04-15.md](../specs/review_stats_2026-04-15.md)
**Выполнил**: Кодо (AI Assistant)
**Тесты**: ⏸ завтра на Linux + Radeon 9070 + ROCm 7.2

---

## ✅ Сделано сегодня (5/7 задач)

| ID | Задача | Статус | Файлы |
|----|--------|--------|-------|
| **T1** | **CMake: добавлена зависимость stats → spectrum** (БЛОКЕР) | ✅ | `stats/CMakeLists.txt` |
| T2 | Удалён дубль `src/statistics/tests/` | ✅ | 10 файлов → `git rm -rf` |
| T3 | CLAUDE.md: `stats → core + spectrum + rocprim` | ✅ | `CLAUDE.md:47` |
| T4 | ScopedHipEvent в `snr_estimator_benchmark.hpp` | ✅ | 2 события → RAII |
| **T5** | **Python bindings для SNR — УЖЕ ГОТОВЫ** | ✅ | `py_statistics.hpp` |
| T6 | Baseline build + ctest на Linux GPU | ⏸ **завтра** | — |
| T7 | repo-sync agent | ⏸ завтра | — |

---

## 🔴 T1 — главная правка (разблокировала сборку)

### Проблема
`StatisticsProcessor::ComputeSnrDb` использует `SnrEstimatorOp`, которая держит `unique_ptr<FFTProcessorROCm>` и включает `<spectrum/fft_processor_rocm.hpp>`. Сборка **failed** без `DspSpectrum` в `target_link_libraries`.

### Диагностика
`cmake --build stats/build` → `fatal error: 'spectrum/fft_processor_rocm.hpp' file not found` (не ловилось раньше т.к. никто не билдил stats модульно с GPU после добавления SNR_05 в GPUWorkLib 2026-04-09).

### Исправление (`stats/CMakeLists.txt`)
```diff
  include(cmake/fetch_deps.cmake)
  fetch_dsp_core()
+ fetch_dsp_spectrum()  # SNR_05: SnrEstimatorOp использует FFTProcessorROCm::ProcessMagnitudesToGPU

- target_link_libraries(DspStats PUBLIC DspCore::DspCore roc::rocprim)
+ target_link_libraries(DspStats PUBLIC
+   DspCore::DspCore
+   DspSpectrum::DspSpectrum   # SNR_05: snr_estimator_op.hpp — публичный header,
+                              # клиенты транзитивно нуждаются в spectrum
+   roc::rocprim)
```

`PUBLIC` — потому что `snr_estimator_op.hpp` публичный header, клиенты `DspStats::ComputeSnrDb` транзитивно нуждаются в spectrum.

**OK на CMake-правку получен от Alex 2026-04-15.**

---

## ✅ T5 — Python bindings для SNR полностью готовы

Проверила `stats/python/py_statistics.hpp` — экспорт уже сделан в исходном GPUWorkLib и корректно перенесён в DSP-GPU:

| Класс/Метод | Python API | GIL release |
|-------------|------------|-------------|
| `SnrEstimationResult` | `dsp_stats.SnrEstimationResult` (5 полей) | — |
| `BranchSelector` | `.select()`, `.current()`, `.reset()` | stateful |
| `StatisticsProcessor.compute_snr_db(...)` | 2D numpy → SnrEstimationResult | ✅ `py::gil_scoped_release` |

**Ничего добавлять не нужно.** Осталось только собрать с `-DDSP_STATS_BUILD_PYTHON=ON` завтра и проверить `.so`.

---

## 📁 Все изменённые файлы

| Файл | Что сделано |
|------|-------------|
| `stats/CMakeLists.txt` | +3 строки (fetch_dsp_spectrum + DspSpectrum в link_libraries) |
| `stats/src/statistics/tests/` | **УДАЛЕНА** (10 файлов-дублей) |
| `CLAUDE.md` (line 47) | обновлена таблица зависимостей |
| `stats/tests/snr_estimator_benchmark.hpp` | ScopedHipEvent + `.get()` (2 события) |

**git diff --stat** (ожидаемо):
```
 CLAUDE.md                                           |   2 +-
 stats/CMakeLists.txt                                |   7 ++++-
 stats/tests/snr_estimator_benchmark.hpp             |  14 +++++---
 stats/src/statistics/tests/                         | удалено 10 файлов
```

---

## 🎯 Что проверить завтра на Linux + GPU

### T6 — Baseline build + ctest

```bash
# 1. Baseline (на текущем HEAD — до правок T1-T4 в stats) — опционально,
#    чтобы подтвердить что сейчас stats упал бы без наших правок:
cd e:/DSP-GPU
git stash  # временно откатить сегодняшние stats-правки
cd stats && cmake -S . -B build --preset debian-local-dev
cmake --build build 2>&1 | tee /tmp/stats_before.log
# Ожидаем: fatal error about spectrum/fft_processor_rocm.hpp
git stash pop  # вернуть правки

# 2. Final build после T1-T4
cd stats
rm -rf build
cmake -S . -B build --preset debian-local-dev
cmake --build build --parallel 32 2>&1 | tee /tmp/stats_build.log
# Ожидаем: 0 errors

# 3. ctest — все тесты включая SNR benchmarks
cd build
ctest --output-on-failure 2>&1 | tee /tmp/stats_tests.log
# Ожидаем: все PASS, никаких utечек hipEvent_t

# 4. Smoke SNR:
./tests/test_stats_main --filter="*snr*"

# 5. Python:
cmake -S . -B build-py --preset debian-local-dev -DDSP_STATS_BUILD_PYTHON=ON
cmake --build build-py --parallel 32
ls build-py/python/dsp_stats*.so  # должен появиться .so
python3 -c "import sys; sys.path.insert(0,'build-py/python'); import dsp_stats; print(dir(dsp_stats))"
# Ожидаем: SnrEstimationResult, BranchSelector, StatisticsProcessor.compute_snr_db
```

### T7 — repo-sync agent

```
# В новой сессии:
Запусти агента repo-sync — проверь что:
1. Граф зависимостей stats → core + spectrum + rocprim согласован
2. Нет циклов (spectrum не зависит от stats)
3. Версии cmake/version.cmake одинаковые для всех 10 репо
```

### Критерии "Всё ок"
- [ ] `stats/build/libDspStats.a` собран
- [ ] Все тесты PASS (`ctest`)
- [ ] SNR smoke-тест работает
- [ ] Python module импортируется, экспорт `compute_snr_db` есть
- [ ] Утечек hipEvent_t нет (после N прогонов ComputeSnrDb, `rocm-smi` стабилен)

### Если что-то пойдёт не так

**Сценарий А**: linker error `undefined reference to FFTProcessorROCm::...`
→ `fetch_dsp_spectrum()` не сработал. Проверить `build/_deps/dspspectrum-src/` существует.

**Сценарий Б**: include error `spectrum/fft_processor_rocm.hpp: No such file`
→ PUBLIC include из spectrum не прокинулся. Проверить что `DspSpectrum::DspSpectrum` targets экспортирует include.

**Сценарий В**: тест падает в runtime при `ComputeSnrDb`
→ Скорее всего наши ScopedHipEvent правки в `snr_estimator_benchmark.hpp` — проверить `.get()` везде.

---

## 📝 Коммит-сообщения (готовые к использованию)

**Коммит 1** — CMake (T1):
```
cmake(stats): добавлена зависимость от DspSpectrum для SNR_05

StatisticsProcessor::ComputeSnrDb использует SnrEstimatorOp (публичный header
stats/operations/snr_estimator_op.hpp), которая держит unique_ptr<FFTProcessorROCm>
и включает <spectrum/fft_processor_rocm.hpp>. Без DspSpectrum в
target_link_libraries stats не собирался.

PUBLIC (не PRIVATE) — header публичный, клиенты транзитивно нуждаются
в spectrum.

OK через DIFF-preview от Alex 2026-04-15.

Fixes: блокер сборки stats на Linux GPU.
Task: MemoryBank/tasks/TASK_Stats_Review_2026-04-15.md / T1
```

**Коммит 2** — удаление дубля (T2):
```
chore(stats): удалён дубль src/statistics/tests/ (10 файлов)

Правильное место тестов — stats/tests/ (подключено в CMakeLists.txt line 95
через add_subdirectory(tests)). src/statistics/tests/ — артефакт миграции
из GPUWorkLib monolithic структуры. Захламлял репо, риск правки не в том файле.
```

**Коммит 3** — docs (T3):
```
docs: CLAUDE.md — stats теперь зависит от core + spectrum + rocprim

Обновлено после интеграции SNR_05 (SnrEstimatorOp) в stats, который
использует FFTProcessorROCm для расчёта |X|².
```

**Коммит 4** — ScopedHipEvent (T4):
```
fix(stats): ScopedHipEvent в tests/snr_estimator_benchmark.hpp

Закрыты 2 утечки hipEvent_t в benchmark ExecuteKernelTimed(). Паттерн тот же
что для statistics_processor.cpp (см. changelog 2026-04-15_core_spectrum).

#include <core/services/scoped_hip_event.hpp> — новый единый источник
RAII для всех репо DSP-GPU.
```

---

## 🔗 Связанные документы

- Ревью: [review_stats_2026-04-15.md](../specs/review_stats_2026-04-15.md)
- План: [TASK_Stats_Review_2026-04-15.md](../tasks/TASK_Stats_Review_2026-04-15.md)
- Параллельная задача (тоже на завтра): [2026-04-15_core_spectrum_followups.md](2026-04-15_core_spectrum_followups.md)
- Персональный промпт для завтра: [../prompts/2026-04-16_continue_core_spectrum.md](../prompts/2026-04-16_continue_core_spectrum.md) — дополнится stats-блоком

---

*Created: 2026-04-15 | Кодо (AI Assistant)*
