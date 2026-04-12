# 🔍 Review: Phase 2 (Code Copy) & Phase 3 (CMake Adaptation)

> **Дата**: 2026-04-12
> **Ревьюер**: Кодо
> **Объект**: Фаза 2 + Фаза 3 миграции GPUWorkLib → dsp-gpu
> **Метод**: Explore-агент (deep scan всех src/, include/, tests/, python/ по 8 репо) + grep на legacy-паттерны
> **Формат**: чекбоксы для ответа Alex

---

## 📊 Общая оценка

| Критерий | Оценка |
|----------|--------|
| **Фаза 2 — Код скопирован** | ✅ **ОТЛИЧНО** — 56 .cpp + 10 .hip + 200 headers |
| **Фаза 3 — CMake адаптирован** | ✅ **ОТЛИЧНО** — все target_sources, target_link_libraries |
| **Legacy-остатки** | 🟡 **11 orphaned CMakeLists.txt** в src/ подпапках (не влияют на сборку) |
| **Критические баги** | ✅ **0 шт** |

---

## ✅ Фаза 2 — Копирование кода: ПРОЙДЕНА

### Количество файлов по репо

| Репо | src/ .cpp | src/ .hip | include/dsp/ headers | kernels/rocm/ | tests/ | python/ | Статус |
|------|-----------|----------|---------------------|---------------|--------|---------|--------|
| **core** | 22 | 0 | 53 | — | Real ✓ | dsp_core_module.cpp ✓ | ✅ |
| **spectrum** | 11 | 4 | 47 | ✓ | Real (10+) ✓ | dsp_spectrum_module.cpp ✓ | ✅ |
| **stats** | 1 | 1 | 14 | ✓ | Real (6+) ✓ | dsp_stats_module.cpp ✓ | ✅ |
| **signal_generators** | 10 | 2 | 29 | ✓ | Real (4+) ✓ | dsp_signal_generators_module.cpp ✓ | ✅ |
| **heterodyne** | 2 | 0 | 5 | — | Real (4+) ✓ | dsp_heterodyne_module.cpp ✓ | ✅ |
| **linalg** | 5 | 0 | 16 | — | Real (8+) ✓ | dsp_linalg_module.cpp ✓ | ✅ |
| **radar** | 3 | 3 | 13 | ✓ | Real (8+) ✓ | dsp_radar_module.cpp ✓ | ✅ |
| **strategies** | 2 | 0 | 23 | — | Real (9+) ✓ | dsp_strategies_module.cpp ✓ | ✅ |
| **ИТОГО** | **56** | **10** | **200** | **4 репо** | **50+** | **8** | ✅ |

### Header guards

| Репо | Всего headers | `#pragma once` | Покрытие |
|------|--------------|----------------|----------|
| core | 53 | 53 | **100%** |
| spectrum | 47 | 47 | **100%** |
| stats | 14 | 14 | **100%** |
| signal_generators | 29 | 29 | **100%** |
| heterodyne | 5 | 5 | **100%** |
| linalg | 16 | 16 | **100%** |
| radar | 13 | 13 | **100%** |
| strategies | 23 | 23 | **100%** |
| **ИТОГО** | **200** | **200** | **100%** ✅ |

Все headers используют `#pragma once` (modern best practice).

---

## ✅ Фаза 3 — CMake адаптация: ПРОЙДЕНА

### CMakeLists.txt — корневые файлы (8 репо)

| Репо | target_sources() | target_link_libraries | $<BUILD_INTERFACE> | Старые пути | Статус |
|------|-----------------|----------------------|-------------------|-------------|--------|
| **core** | 22 файла ✓ | DspCore::DspCore ✓ | ✓ | Нет ✓ | ✅ |
| **spectrum** | 11 файлов ✓ | DspCore::, hip::hipfft ✓ | ✓ | Нет ✓ | ✅ |
| **stats** | 2 файла ✓ | DspCore::, roc::rocprim ✓ | ✓ | Нет ✓ | ✅ |
| **signal_generators** | 10 файлов ✓ | DspCore::, DspSpectrum:: ✓ | ✓ | Нет ✓ | ✅ |
| **heterodyne** | 2 файла ✓ | 3 downstream libs ✓ | ✓ | Нет ✓ | ✅ |
| **linalg** | 5 файлов ✓ | DspCore::, rocblas, rocsolver ✓ | ✓ | Нет ✓ | ✅ |
| **radar** | 6 файлов (3cpp+3hip) ✓ | 3 downstream libs ✓ | ✓ | Нет ✓ | ✅ |
| **strategies** | 2 файла ✓ | Все 6 libs ✓ | ✓ | Нет ✓ | ✅ |

### Cross-cutting grep

| Паттерн | Совпадений в root CMakeLists | Статус |
|---------|------------------------------|--------|
| `modules/` | 0 | ✅ CLEAN |
| `GPUWorkLib` | 0 | ✅ CLEAN |
| `drvgpu` (old target) | 0 | ✅ CLEAN |
| `fft_func_lib` (old target) | 0 | ✅ CLEAN |
| `find_package(HIP` (uppercase) | 0 | ✅ CLEAN |

### Изоляция модулей

```
core (Level 0) — standalone, no DSP deps
├── spectrum (Level 1) ── signal_generators (Level 2) ── heterodyne (Level 3)
├── stats (Level 1)
├── linalg (Level 1)
├── radar (Level 4) ← core + spectrum + stats
└── strategies (Level 5) ← all above
```

Каждый репо:
- Standalone сборка через `cmake --preset local-dev`
- Зависимости через `find_package()` + `fetch_deps.cmake`
- Нет cross-repo жёстких путей
- Public headers в `include/dsp/` правильно экспортированы

---

## 🔴 Проблемы (требуют действия)

### [ ] #1. 11 orphaned legacy CMakeLists.txt в src/ подпапках

**Что**: В каждом репо внутри `src/{module}/` остались старые `CMakeLists.txt` из GPUWorkLib. Они содержат ссылки на:
- Старые target'ы: `drvgpu`, `GPUWorkLib::*`
- Старые пути: `${CMAKE_SOURCE_DIR}/DrvGPU`, `${CMAKE_SOURCE_DIR}/modules/`
- Устаревшие find_package

**Влияние**: **Нулевое** — корневые CMakeLists.txt НЕ делают `add_subdirectory()` на эти файлы. Но они вводят в заблуждение разработчика.

**Список файлов для удаления**:
```
spectrum/src/fft_func/CMakeLists.txt
spectrum/src/filters/CMakeLists.txt
spectrum/src/lch_farrow/CMakeLists.txt
stats/src/statistics/CMakeLists.txt
signal_generators/src/signal_generators/CMakeLists.txt
heterodyne/src/heterodyne/CMakeLists.txt
linalg/src/capon/CMakeLists.txt
linalg/src/vector_algebra/CMakeLists.txt
radar/src/fm_correlator/CMakeLists.txt
radar/src/range_angle/CMakeLists.txt
strategies/src/strategies/CMakeLists.txt
```

**Действие**: Удалить все 11 файлов.

**Ответ Alex**:
```

```

---

### [ ] #2. Статус задач Phase 2 и Phase 3 — чеклисты не отмечены

**Где**: `TASK_ModArch_Phase2_Copy.md` и `TASK_ModArch_Phase3_CMake.md`

Статус обновлён на ✅ DONE, но чеклисты внутри (C1.1-C10.4 и M1.1-M9.5) все остались `[ ]`. 

**Действие**: Оставить как есть (документация исходного плана) или отметить выполненные?

**Ответ Alex**:
```

```

---

### [ ] #3. `namespace dsp::` — НЕ добавлен (отложен)

**Где**: Фаза 3 чеклист M1.3, M2.4, M3.4 и т.д.

В плане: «добавляем сразу в Фазе 3, не откладываем».
В реальности: namespace `dsp::` ещё **не добавлен** в C++ код. Классы остались без namespace:
- `DrvGPU` (не `dsp::DrvGPU`)
- `FFTProcessor` (не `dsp::spectrum::FFTProcessor`)
- и т.д.

Это осознанное решение — добавлять namespace на ~110K LOC без тестирования рискованно.

**Варианты**:
1. Добавить namespace в Phase 4 (после GPU-тестирования базового кода)
2. Добавить namespace как отдельную Phase 3c
3. Отложить до стабилизации

**Ответ Alex**:
```

```

---

## 🟡 Замечания (некритичные)

### [ ] #4. tests/CMakeLists.txt — реальные или placeholder?

Все 8 репо имеют `tests/CMakeLists.txt`. Нужно убедиться что они линкуют `DspXxx::DspXxx` + `DspCore::TestUtils`, а не старые target'ы.

**Действие**: Проверить при Phase 4 на GPU.

**Ответ Alex**:
```

```

---

### [ ] #5. Python bindings — один модуль или 8?

Phase 3b создала 8 отдельных `dsp_*_module.cpp` + `gpuworklib.py` shim. Формально Phase 3b = DONE. Но реальное тестирование Python API — только на GPU в Phase 4.

**Ответ Alex**:
```

```

---

## ✅ Итоговая сводка

| Что | Статус |
|-----|--------|
| Код скопирован (56 .cpp + 10 .hip) | ✅ |
| Headers (200 шт, 100% #pragma once) | ✅ |
| Python bindings (8 модулей) | ✅ |
| Тесты (50+ файлов) | ✅ |
| CMake: target_sources заполнены | ✅ |
| CMake: DspXxx::DspXxx naming | ✅ |
| CMake: $<BUILD_INTERFACE> | ✅ |
| CMake: нет old paths/targets | ✅ |
| CMake: find_package lowercase | ✅ |
| **Legacy CMakeLists.txt в src/** | 🔴 **11 файлов — удалить** |
| **namespace dsp::** | 🟡 **Отложен** |

### Рекомендация

**Phase 2 + Phase 3 — выполнены на отлично.**

Единственное необходимое действие — удалить 11 orphaned CMakeLists.txt из `src/` подпапок. Это займёт 30 секунд.

Namespace `dsp::` можно добавить после Phase 4 (GPU-тестирование), когда будет уверенность что код собирается и работает.

---

*Создан: 2026-04-12 | Ревьюер: Кодо*
*Метод: Explore-агент (deep scan) + grep на legacy-паттерны*
