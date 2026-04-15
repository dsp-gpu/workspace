# Changelog: signal_generators — deep cleanup — 2026-04-15

**Выполнил**: Кодо (AI Assistant)
**Тесты**: ⏸ завтра на Linux + Radeon 9070 + ROCm 7.2
**Связь**: часть A3b цепочки ScopedHipEvent-миграции (после spectrum/stats/heterodyne)

---

## 🔴 Главные открытия (3 проблемы)

### 1. `form_signal_generator_rocm.cpp` — **СЛОМАНА КОМПИЛЯЦИЯ** после первого sed-прохода
Строки 135-136 имели:
```cpp
ScopedHipEvent ev_k_s, ev_k_e;     // ← правильное объявление
hipEventCreate(&ev_k_s);           // ← &ScopedHipEvent* НЕ hipEvent_t* — compile error!
```
Плюс висящий пустой `if (ev_k_s) {  }`. Исправлено вручную.

### 2. 3 файла (noise/cw/lfm) — **локальная `MakeROCmData` с destroy внутри**
```cpp
static drv_gpu_lib::ROCmProfilingData MakeROCmData(...) {
    hipEventElapsedTime(...);
    hipEventDestroy(s);       // ← destroy внутри
    hipEventDestroy(e);
    ...
}
```
После ScopedHipEvent + `.get()` → **double-free** (RAII + локальная функция оба destroy-ят).

**Решение**: удалена локальная функция, используется общая `fft_func_utils::MakeROCmDataFromEvents` (из `spectrum/utils/rocm_profiling_helpers.hpp`). Она сегодня стала read-only (убран destroy) — см. `2026-04-15_core_spectrum_followups.md`.

### 3. 3 файла — **дубли `#include <core/services/scoped_hip_event.hpp>`**
Артефакт первого awk+sed прохода. По 2 include + 2 using в каждом файле. Исправлено вручную.

---

## ✅ Изменённые файлы (5 .cpp + удалён дубль tests)

| Файл | Правки |
|------|--------|
| `form_signal_generator_rocm.cpp` | 🔴 Фикс compile error: `hipEventCreate(&ev_k_s)` → `ev_k_s.Create()` + удалён пустой `if (ev_k_s){}` |
| `noise_generator_rocm.cpp` | Убран дубль include, удалена `static MakeROCmData`, применён ScopedHipEvent, используется `MakeROCmDataFromEvents` |
| `cw_generator_rocm.cpp` | То же |
| `lfm_generator_rocm.cpp` | То же |
| `lfm_generator_analytical_delay_rocm.cpp` | ScopedHipEvent + `.get()` (дубля не было, общий helper уже использовался) |
| `src/signal_generators/tests/` | **УДАЛЕНА** (`git rm -rf`, 6 файлов-дублей) |

---

## 📊 Проверка после правок (статически)

```
hipEventCreate в signal_generators/src/     → 0  ✅
hipEventDestroy в signal_generators/src/    → 0  ✅
Локальных MakeROCmData                       → 0  ✅
Дублей include <scoped_hip_event.hpp>        → 0  ✅
Использований ScopedHipEvent                 → 10 ✅
```

Структурные проверки:
- ✅ Все 5 файлов используют `drv_gpu_lib::ScopedHipEvent` (из core)
- ✅ Все 5 используют `fft_func_utils::MakeROCmDataFromEvents` (common read-only helper)
- ✅ CMake `signal_generators/CMakeLists.txt` уже правильный (core + spectrum + hiprtc)
- ✅ Tests готовы: `tests/main.cpp` + `all_test.hpp` + `CMakeLists.txt` + 4 test .hpp
- ✅ Дубль `src/signal_generators/tests/` удалён (6 файлов)

---

## 🧪 Состояние тестов (готово к запуску)

```
signal_generators/tests/
├── CMakeLists.txt                            ← add_executable(test_signal_generators_main main.cpp)
├── main.cpp                                  ← int main() { signal_generators_all_test::run(); }
├── all_test.hpp                              ← агрегатор 3 тестов
├── test_signal_generators_rocm_basic.hpp     ← CW, LFM, Noise, LfmConjugate: GPU vs CPU
├── test_form_signal_rocm.hpp                 ← FormSignalGeneratorROCm
├── test_signal_generators_benchmark_rocm.hpp ← ROCm Benchmarks (закомментирован в agg)
├── signal_generators_benchmark_rocm.hpp      ← шаблон для benchmark
└── README.md
```

**Benchmark test закомментирован** в `all_test.hpp:31` — можно раскомментировать завтра после baseline.

**hipEventCreate в tests/**: 0 (тесты не используют напрямую hipEvent).

---

## 🎯 Что сделать завтра на Linux + GPU

### 1. Baseline — собрать stats + signal_generators (они связаны через spectrum)

```bash
cd e:/DSP-GPU/signal_generators
cmake -S . -B build --preset debian-local-dev
cmake --build build --parallel 32 2>&1 | tee /tmp/siggen_build.log

# Ожидаем: 0 errors. Особое внимание — нет ли предупреждений про SchopedHipEvent
```

### 2. ctest
```bash
cd build
ctest --output-on-failure 2>&1 | tee /tmp/siggen_tests.log
./tests/test_signal_generators_main
```

### 3. Если нужно — раскомментировать benchmark тест в `all_test.hpp:31`:
```cpp
test_signal_generators_benchmark_rocm::run();
```

### 4. Smoke: проверить утечки hipEvent_t через rocm-smi после 1000 GenerateToGpu

### 5. Готовые коммит-сообщения

**Коммит 1** — form_signal fix (критично, компиляция):
```
fix(signal_generators): compile-error form_signal_generator_rocm.cpp

Прошлый sed-проход оставил hipEventCreate(&ev_k_s), где ev_k_s уже
ScopedHipEvent (тип не hipEvent_t*) — не компилировалось. Плюс пустой
висящий if (ev_k_s){}.

Заменено: ev_k_s.Create() / ev_k_e.Create(), пустой if удалён.
```

**Коммит 2** — общий RAII для 5 файлов:
```
refactor(signal_generators): ScopedHipEvent во всех 5 .cpp с hipEvent_t

Применён drv_gpu_lib::ScopedHipEvent (из core/services/scoped_hip_event.hpp)
вместо голых hipEvent_t + Create/Destroy. Убраны локальные функции
MakeROCmData (в noise/cw/lfm), которые дублировали fft_func_utils::
MakeROCmDataFromEvents и делали destroy внутри — при совместном
использовании с RAII это привело бы к double-free.

Теперь все 5 файлов используют общий read-only helper
MakeROCmDataFromEvents из spectrum/utils/rocm_profiling_helpers.hpp.

Files: noise_generator_rocm.cpp, cw_generator_rocm.cpp,
lfm_generator_rocm.cpp, lfm_generator_analytical_delay_rocm.cpp,
form_signal_generator_rocm.cpp.

Также убраны дубли #include (артефакт прошлого awk-прохода).
```

**Коммит 3** — чистка tests:
```
chore(signal_generators): удалён дубль src/signal_generators/tests/

6 файлов мусора от миграции GPUWorkLib monolithic структуры.
Правильное место тестов — signal_generators/tests/ (подключено в
CMakeLists.txt).
```

---

## 🔗 Связи

- Перенос ScopedHipEvent в core: [2026-04-15_core_spectrum_followups.md](2026-04-15_core_spectrum_followups.md)
- stats интеграция SNR_05: [2026-04-15_stats_snr_integration.md](2026-04-15_stats_snr_integration.md)
- Следующие TODO:
  - **A3c**: strategies/antenna_processor_v1.cpp (`hipEventCreateWithFlags` для sync между streams)
  - **C**: глубокое ревью core

---

*Created: 2026-04-15 | Кодо (AI Assistant)*
