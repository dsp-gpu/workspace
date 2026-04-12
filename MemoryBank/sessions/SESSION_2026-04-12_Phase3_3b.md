# 📋 Инструкция для следующего чата — Фаза 4

> **Дата сессии**: 2026-04-12
> **Следующий шаг**: Фаза 4 — тестирование на GPU (Debian/ROCm)

---

## ✅ Что сделано в этой сессии

### Фаза 3 — CMake-адаптация (все 8 репо + core)

**Проблема которую исправили**: Фаза 2 скопировала только часть DrvGPU.
Не были скопированы: `backends/`, `logger/`, `memory/`, `services/`, `common/`, `interface/`.

**Решение**:
- Заголовки (`backends/`, `common/`, `interface/`, `logger/`, `memory/`, `services/`) → `core/include/dsp/`
- `.cpp` файлы → `core/src/`
- `core/include/dsp/` добавлен как второй PUBLIC BUILD_INTERFACE include:
  ```cmake
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include/dsp>
  ```
  Это позволяет: `#include "services/gpu_profiler.hpp"` (без префикса `dsp/`) во всех модулях.

**Что заполнено во всех 8 репо**:
- `target_sources()` — все `.cpp` и `.hip` (compile-time) файлы
- `PRIVATE` include paths — `src/fft_func/include`, `src/filters/include`, etc.
- `tests/CMakeLists.txt` + `tests/main.cpp`

### Фаза 3b — Python bindings

**Структура**:
- `py_helpers.hpp` — `vector_to_numpy` zero-copy helper (в `{repo}/python/`)
- `py_*.hpp` скопированы из GPUWorkLib → в нужные `{repo}/python/`
- `dsp_*_module.cpp` — `PYBIND11_MODULE(dsp_spectrum, m)` и т.д.
- `python/CMakeLists.txt` — `pybind11_add_module`
- `DSP/Python/gpuworklib.py` — shim (обратная совместимость)
- `DSP/Python/common/gpu_loader.py` — обновлён под 8 модулей, ENV: `DSP_LIB_DIR`

**Соответствие модуль → py_*.hpp**:
| Репо | py_*.hpp файлы |
|------|---------------|
| spectrum | py_fft_processor_rocm, py_spectrum_maxima_finder_rocm, py_complex_to_mag_rocm, py_filters, py_filters_rocm, py_filters_adaptive_rocm, py_lch_farrow, py_lch_farrow_rocm |
| stats | py_statistics |
| signal_generators | py_form_signal_rocm, py_delayed_form_signal_rocm, py_lfm_analytical_delay, py_lfm_analytical_delay_rocm |
| heterodyne | py_heterodyne, py_heterodyne_rocm |
| linalg | py_vector_algebra_rocm |
| radar | py_fm_correlator_rocm, py_range_angle_rocm |
| strategies | py_strategies_rocm |

---

## 🚀 Фаза 4 — Тестирование на GPU (СЛЕДУЮЩИЙ ШАГ)

**Где выполнять**: Debian, AMD GPU (Radeon 9070 / RDNA4, gfx1201), ROCm 7.2+

**Что нужно сделать**:

### 1. Сборка core (standalone)
```bash
cd ~/DSP-GPU/core
cmake -S . -B build --preset local-dev
cmake --build build -j$(nproc)
```
Ожидаемый результат: `build/libDspCore.a` ✅

**Если ошибки**:
- `find_package(hip)` не нашёл → проверить `/opt/rocm/lib/cmake/hip/`
- Заголовки OpenCL → `sudo apt install opencl-headers`
- `ENABLE_ROCM` не установлен → добавить `-DENABLE_ROCM=1` в preset

### 2. Сборка spectrum (зависит от core)
```bash
cd ~/DSP-GPU/spectrum
cmake -S . -B build --preset local-dev
cmake --build build -j$(nproc)
```
`fetch_deps.cmake` подтянет core через FetchContent (локальная папка `~/DSP-GPU/core`).

### 3. Сборка остальных репо (порядок важен!)
```
core → spectrum → stats → signal_generators → heterodyne → linalg → radar → strategies
```

### 4. Запуск тестов (нужен GPU)
```bash
cd ~/DSP-GPU/core/build
./tests/test_core_main
```

### 5. Сборка Python (Фаза 3b)
```bash
pip install pybind11
cd ~/DSP-GPU/core
cmake -S . -B build --preset local-dev -DDSP_CORE_BUILD_PYTHON=ON
cmake --build build
cmake --install build --prefix ~/DSP-GPU/DSP/Python/lib
```

---

## ⚠️ Известные проблемы / TODO

### Высокий приоритет
1. **`statistics_sort_gpu.hip`** — добавлен в `target_sources`, но `.hip` файл находится в `src/statistics/src/`. Это компилируется HIP-компилятором. Если ошибки с `set_source_files_properties` — возможно нужно добавить `HIP` в `LANGUAGES`.

2. **`radar/.hip` файлы в src/range_angle/src/** — `dechirp_window_kernel.hip`, `fftshift2d_kernel.hip`, `transpose_kernel.hip` добавлены как compile-time sources. Это корректно только если HIP-компилятор (hipcc/clang) настроен.

3. **`CMakePresets.json` — `local-dev`** — должен иметь:
   ```json
   "FETCHCONTENT_SOURCE_DIR_DSPCORE": "~/DSP-GPU/core",
   "FETCHCONTENT_SOURCE_DIR_DSPSPECTRUM": "~/DSP-GPU/spectrum",
   ...
   ```

4. **`find_package(hiprtc REQUIRED)`** — в signal_generators и linalg. Убедиться что hiprtc доступен: `find /opt/rocm -name hiprtcConfig.cmake`.

### Средний приоритет
5. **Namespace `dsp::`** — Фаза 3 формально требовала добавить namespace в публичные заголовки. Пока НЕ сделано. Можно добавить в Фазе 4 или отдельно.

6. **`gpu_worklib_bindings.cpp`** — сигнатуры PySignalGenerator (CW/LFM/Noise/Script) не перенесены в `dsp_signal_generators_module.cpp`. Они используют `signal_service.hpp` из GPUWorkLib. Нужно решить: переносить или оставить в shim?

---

## 📁 Ключевые файлы

| Файл | Описание |
|------|---------|
| `core/CMakeLists.txt` | Полный список src + PUBLIC include/dsp |
| `core/include/dsp/` | ВСЕ публичные заголовки DrvGPU (backends, services, logger...) |
| `DSP/Python/gpuworklib.py` | Shim для обратной совместимости |
| `DSP/Python/common/gpu_loader.py` | Загрузчик (ENV: DSP_LIB_DIR) |
| `MemoryBank/tasks/TASK_ModArch_Phase4_Test.md` | Детальная задача Фазы 4 |

---

## 🏁 Статус репо на конец сессии

Все 9 репо запушены в `github.com/dsp-gpu/*`, ветка `main`.

| Репо | Последний коммит |
|------|----------------|
| core | Phase 3b — Python bindings |
| spectrum | Phase 3b — Python bindings |
| stats | Phase 3b — Python bindings |
| signal_generators | Phase 3b — Python bindings |
| heterodyne | Phase 3b — Python bindings |
| linalg | Phase 3b — Python bindings |
| radar | Phase 3b — Python bindings |
| strategies | Phase 3b — Python bindings |
| DSP | Phase 3b — gpuworklib shim + gpu_loader |

---

*Создан: 2026-04-12 | Кодо (AI Assistant)*
