# TASK: radar — полная миграция (A+B)

> **Создан**: 2026-04-15 (вечер)
> **Тип**: Большая архитектурная правка (уровень core-миграции 14.04)
> **Блокирует**: завтрашний build на Linux GPU
> **Статус**: ⬜ IN_PROGRESS

---

## 📋 План (7 этапов)

| T | Задача | CMake? | Estimate |
|---|--------|--------|----------|
| **T1** | Миграция include/ — убрать `dsp/` + переместить из `src/{mod}/include/` | нет | 15 мин |
| **T2** | AMD-миграция `#include` во всех .cpp/.hpp/.hip (quoted → angle) | нет | 20 мин |
| **T3** | Починить Python (`../modules/...` пути на AMD-стандарт) | нет | 10 мин |
| **T4** | Удалить дубли tests (`src/fm_correlator/tests/`, `src/range_angle/tests/`) | нет | 3 мин |
| **T5** | ScopedHipEvent в 4 test .hpp (8 hipEventCreate) | нет | 15 мин |
| **T6** | Адаптировать CMake: `target_include_directories`, `target_sources` | ✅ | 10 мин |
| **T7** | Финальный grep + commit + push | нет | 5 мин |

---

## 🎯 Целевая структура radar (после T1)

```
radar/
├── CMakeLists.txt                       # T6 — PRIVATE src/{mod}/include убрать
├── include/radar/                       # T1 — всё publicс сюда
│   ├── fm_correlator/
│   │   ├── fm_correlator.hpp
│   │   ├── fm_correlator_processor_rocm.hpp
│   │   ├── fm_correlator_types.hpp
│   │   └── kernels/
│   │       └── fm_kernels_rocm.hpp
│   └── range_angle/
│       ├── range_angle_processor.hpp
│       ├── range_angle_params.hpp
│       ├── range_angle_types.hpp
│       ├── kernels/
│       │   └── range_angle_kernels_rocm.hpp
│       └── operations/
│           ├── beam_fft_op.hpp
│           ├── dechirp_window_op.hpp
│           ├── peak_search_op.hpp
│           ├── range_fft_op.hpp
│           └── transpose_op.hpp
├── src/
│   ├── fm_correlator/src/               # только .cpp
│   │   ├── fm_correlator.cpp
│   │   └── fm_correlator_processor_rocm.cpp
│   └── range_angle/src/                 # .cpp + .hip
│       ├── range_angle_processor.cpp
│       ├── dechirp_window_kernel.hip
│       ├── fftshift2d_kernel.hip
│       └── transpose_kernel.hip
├── tests/                               # уже правильное место
├── python/                              # T3 — починить пути
└── kernels/                             # пустая/для future
```

---

## 🔧 Паттерны замены include (T2)

```diff
- #include "fm_correlator.hpp"
+ #include <radar/fm_correlator/fm_correlator.hpp>

- #include "fm_correlator_processor_rocm.hpp"
+ #include <radar/fm_correlator/fm_correlator_processor_rocm.hpp>

- #include "kernels/fm_kernels_rocm.hpp"
+ #include <radar/fm_correlator/kernels/fm_kernels_rocm.hpp>

- #include "range_angle_processor.hpp"
+ #include <radar/range_angle/range_angle_processor.hpp>

- #include "services/console_output.hpp"
+ #include <core/services/console_output.hpp>

- #include "services/batch_manager.hpp"
+ #include <core/services/batch_manager.hpp>

- #include "../modules/range_angle/include/range_angle_processor.hpp"  (python)
+ #include <radar/range_angle/range_angle_processor.hpp>
```

---

## 📝 Коммит-план (4-5 коммитов)

1. `refactor(radar): миграция структуры — include/radar/ + убраны дубли`
2. `refactor(radar): AMD-стандарт #include во всех .cpp/.hpp/.hip`
3. `fix(radar/python): пути на AMD-стандарт (были ../modules/...)`
4. `fix(radar): ScopedHipEvent в 4 fm-correlator тестах`
5. `cmake(radar): убран PRIVATE src/{mod}/include (дубли удалены)`

---

*Created: 2026-04-15 | Кодо*
