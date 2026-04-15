# 🔍 Глубокое ревью: heterodyne — 2026-04-15

**Автор**: Кодо (AI Assistant)
**Эталон**: `E:\C++\GPUWorkLib\modules\heterodyne\`
**Состояние**: ✅ Почти готов к Linux GPU прогону. 1 блокирующая мелочь (дубль tests).

---

## 📊 Сводка (в цифрах)

| Аспект | Статус | Детали |
|--------|--------|--------|
| Код (.hpp + .cpp) совпадает с GPUWorkLib 1:1 | ✅ | dechirp 233/233, processor_rocm 598/600 (+2 строки — ScopedHipEvent include) |
| CMake зависимости | ✅ | core + spectrum + signal_generators + hipfft |
| ScopedHipEvent применён | ✅ | 13 использований в `heterodyne_processor_rocm.cpp` |
| hipEventCreate/Destroy в src | ✅ | **0** (было 13 строк = 26 событий, теперь все RAII) |
| Python bindings | ✅ | dechirp + correct + set_params экспортированы |
| Tests main.cpp + CMakeLists | ✅ | готовы к запуску |
| **Дубль `src/heterodyne/tests/`** | 🟠 | 7 файлов — артефакт миграции, удалить |
| Новая фича в GPUWorkLib, не в DSP-GPU | ✅ | не обнаружено |

---

## 🟢 Что уже в порядке

### Структура
```
heterodyne/
├── CMakeLists.txt                              ← ✅ core + spectrum + signal_generators
├── include/heterodyne/
│   ├── heterodyne_dechirp.hpp
│   ├── heterodyne_params.hpp
│   ├── i_heterodyne_processor.hpp
│   ├── kernels/heterodyne_kernels_rocm.hpp
│   └── processors/heterodyne_processor_rocm.hpp
├── src/heterodyne/src/
│   ├── heterodyne_dechirp.cpp
│   └── heterodyne_processor_rocm.cpp           ← ScopedHipEvent применён
├── tests/                                      ← правильное место
│   ├── CMakeLists.txt + main.cpp + all_test.hpp
│   ├── test_heterodyne_basic.hpp
│   ├── test_heterodyne_rocm.hpp
│   ├── test_heterodyne_pipeline.hpp
│   ├── heterodyne_benchmark_rocm.hpp
│   └── test_heterodyne_benchmark_rocm.hpp
├── python/                                     ← готов
│   ├── CMakeLists.txt
│   ├── dsp_heterodyne_module.cpp
│   ├── py_helpers.hpp
│   ├── py_heterodyne.hpp
│   └── py_heterodyne_rocm.hpp
└── src/heterodyne/tests/                       ← 🟠 ДУБЛЬ, удалить
```

### Критический системный leak — закрыт
В `heterodyne_processor_rocm.cpp` было **13 пар hipEventCreate без ни одного hipEventDestroy** (аналогично `spectrum_processor_rocm` из spectrum-ревью). Все утечки закрыты через `ScopedHipEvent` в предыдущем проходе A3a сегодня.

### Python API
`py_heterodyne_rocm.hpp` экспортирует:
- `.def("set_params", ...)` — настройка
- `.def("dechirp", ...)` — главный метод (s_dc = conj(s_rx * s_ref))
- `.def("correct", ...)` — коррекция частоты exp(j·phase_step·n)

---

## 🟠 Единственная проблема: дубль `src/heterodyne/tests/`

```
src/heterodyne/tests/     ← 7 файлов (МУСОР)
    README.md
    all_test.hpp
    heterodyne_benchmark_rocm.hpp
    test_heterodyne_basic.hpp
    test_heterodyne_rocm.hpp
    test_heterodyne_pipeline.hpp
    test_heterodyne_benchmark_rocm.hpp
```

Правильное место — `heterodyne/tests/` (подключено через `add_subdirectory(tests)` в CMake line 97).

---

## 📋 План работ

| # | Задача | Приоритет | CMake? | Estimate | Когда |
|---|--------|-----------|--------|----------|-------|
| T1 | Удалить дубль `src/heterodyne/tests/` | 🟠 | нет | 3 мин | сегодня |
| T2 | Baseline build + ctest (Linux GPU) | 🔴 | нет | 20 мин | завтра |
| T3 | Python тест + smoke | 🟡 | нет | 15 мин | завтра |
| T4 | Проверка leaks через rocm-smi | 🟡 | нет | 10 мин | завтра |

---

## 🎯 Что делать завтра

```bash
cd e:/DSP-GPU/heterodyne
cmake -S . -B build --preset debian-local-dev
cmake --build build --parallel 32 2>&1 | tee /tmp/heterodyne_build.log

# ctest
cd build && ctest --output-on-failure 2>&1 | tee /tmp/heterodyne_tests.log
./tests/test_heterodyne_main

# Python (опционально)
cmake -S . -B build-py --preset debian-local-dev -DDSP_HETERODYNE_BUILD_PYTHON=ON
cmake --build build-py --parallel 32
```

---

*Created: 2026-04-15 | Кодо (AI Assistant)*
