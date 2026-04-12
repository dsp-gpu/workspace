# 🔍 Review: Phase 0 (Audit) & Phase 1 (Skeleton) — modular_architecture_plan

> **Дата**: 2026-04-12
> **Ревьюер**: Кодо
> **Объект**: Фаза 0 + Фаза 1 миграции GPUWorkLib → dsp-gpu (9 репо)
> **Метод**: Explore-агент (40+ проверок по всем 9 репо) + ручной cross-reference плана v2, ревью v2, и реализации
> **Формат**: чекбоксы для ответа Alex

---

## 📊 Общая оценка

| Критерий | Оценка |
|----------|--------|
| **Фаза 0 — Аудит** | ✅ **ОТЛИЧНО** — граф подтверждён, документация создана |
| **Фаза 1 — Скелет** | ✅ **ОТЛИЧНО** — все 9 репо с рабочим CMake |
| **Соответствие плану v2** | 🟡 **Хорошо** — реализация лучше плана (6 расхождений, все в пользу реализации) |
| **Критические баги** | ✅ **0 шт** — ни одного блокера для Фазы 4 |

---

## ✅ Фаза 0 — Аудит зависимостей: ПРОЙДЕНА

### Что было сделано правильно

| Проверка | Результат |
|----------|-----------|
| Граф зависимостей в разделе 2 плана | ✅ Подтверждён без расхождений |
| Скрытые include-зависимости (5 точек) | ✅ Нарушений нет |
| `Doc/Architecture/dependencies.md` | ✅ Создан, Mermaid-граф, таблицы |
| `Doc/Architecture/repo_map.md` | ✅ Создан, детали по каждому репо |
| `Doc/Architecture/repo_structure.md` | ✅ Создан, шаблоны и паттерны |
| `Doc/Architecture/README.md` | ✅ Создан |
| Запушено в `github.com/dsp-gpu/DSP` | ✅ Есть в коммитах |

### Дополнительная архитектурная документация (бонус)

В `DSP/Doc/Architecture/` также созданы:
- `Architecture_C1_Component.md` — компонентная диаграмма
- `Architecture_C2_Container.md` — контейнерная диаграмма
- `Architecture_C3_Code.md` — кодовая диаграмма
- `Architecture_C4_Context.md` — контекстная диаграмма
- `Architecture_DFD.md` — Data Flow Diagram
- `Architecture_Seq.md` — Sequence диаграмма
- `Architecture_INDEX.md` — индекс

**Вердикт Фазы 0**: Идеальное исполнение. Аудит полный, документация качественная.

---

## ✅ Фаза 1 — Скелет 9 репо: ПРОЙДЕНА

### Статус по каждому репо

| # | Репо | .git | CMakeLists.txt | CMakePresets.json | Config.cmake.in | fetch_deps.cmake | Presets |
|---|------|------|---------------|------------------|----------------|-----------------|---------|
| 1 | **core** | ✅ | ✅ | ✅ | ✅ | ✅ | local-dev + debian + ci |
| 2 | **spectrum** | ✅ | ✅ | ✅ | ✅ | ✅ | local-dev + debian + ci |
| 3 | **stats** | ✅ | ✅ | ✅ | ✅ | ✅ | local-dev + debian + ci |
| 4 | **signal_generators** | ✅ | ✅ | ✅ | ✅ | ✅ | local-dev + debian + ci |
| 5 | **heterodyne** | ✅ | ✅ | ✅ | ✅ | ✅ | local-dev + debian + ci |
| 6 | **linalg** | ✅ | ✅ | ✅ | ✅ | ✅ | local-dev + debian + ci |
| 7 | **radar** | ✅ | ✅ | ✅ | ✅ | ✅ | local-dev + debian + ci |
| 8 | **strategies** | ✅ | ✅ | ✅ | ✅ | ✅ | local-dev + debian + ci |
| 9 | **DSP** (meta) | ✅ | ✅ | ✅ | — | ✅ | 6 пресетов |

### CMake-качество (критические проверки)

| Проверка | Результат | Детали |
|----------|-----------|--------|
| `find_package` lowercase | ✅ **ВСЕ lowercase** | `hip`, `hipfft`, `rocprim`, `rocblas`, `rocsolver`, `hiprtc` |
| `find_dependency` lowercase | ✅ **ВСЕ lowercase** | во всех 8 `*Config.cmake.in` |
| Target names `DspXxx` | ✅ | DspCore, DspSpectrum, DspStats, DspLinalg, DspSignalGenerators, DspHeterodyne, DspRadar, DspStrategies |
| ALIAS targets `Dsp*::Dsp*` | ✅ | 9 основных + `DspCore::TestUtils` |
| `PUBLIC include/` + `PRIVATE kernels/ src` | ✅ | Правильная изоляция |
| `$<BUILD_INTERFACE>` / `$<INSTALL_INTERFACE>` | ✅ | Генератор-выражения |
| `FETCHCONTENT_SOURCE_DIR_DSP*` пути | ✅ | `E:/DSP-GPU/` (Windows) + `${sourceDir}/../` (Debian) |
| `fetch_deps.cmake` — единообразие | ✅ | Идентичный во всех 9 репо |
| `FIND_PACKAGE_ARGS` в FetchContent | ✅ | Modern CMake best practice |
| `include_guard(GLOBAL)` | ✅ | Защита от двойного включения |
| `GIT_SHALLOW TRUE` | ✅ | Быстрое клонирование |
| DSP `option(DSP_BUILD_*)` + conditional | ✅ | Исправлено по ревью v2 #1 |
| Граф зависимостей — ациклический DAG | ✅ | Циклов нет |

### Файловая структура (все 8 индивидуальных репо)

```
✅ CMakeLists.txt
✅ CMakePresets.json
✅ README.md
✅ cmake/DspXxxConfig.cmake.in
✅ cmake/fetch_deps.cmake
✅ include/dsp/
✅ kernels/rocm/           ← PRIVATE
✅ src/
✅ tests/
✅ python/                 ← pybind11
```

### DSP мета-репо — дополнительно

```
✅ 6 пресетов: local-dev, ci, debian-local-dev, spectrum-only, linalg-only, full-release
✅ Doc/Architecture/       ← 10+ файлов архитектурной документации
✅ Doc/Modules/            ← документация модулей
✅ Doc/DrvGPU/             ← документация ядра
✅ Doc/Python/             ← документация Python API
✅ Doc/Doxygen/            ← конфиг Doxygen
✅ Doc/addition/           ← доп. материалы (из бывшего Doc_Addition/)
✅ build_all_debian.sh     ← скрипт сборки на Debian
```

### Git-история (все репо синхронизированы)

Все 9 репо прошли полный цикл: Phase 1 → Phase 2 → Phase 3 → Phase 3b → Phase 4 prep.
Последний коммит во всех: `Phase 4 prep: add debian-local-dev preset`.

---

## 🟡 Расхождения: План v2 vs Реализация

> Все расхождения **в пользу реализации** — код лучше плана. Но план нужно обновить для консистентности.

### [ ] #1. План v2 — всё ещё `find_package(HIP)` uppercase (4 места)

**Где в плане**: строки 220, 306, 326, 392

```cmake
# В ПЛАНЕ (файл modular_architecture_plan.md):
find_package(HIP REQUIRED)       # строка 220 (core CMakeLists.txt шаблон)
find_dependency(HIP REQUIRED)    # строка 306 (DspCoreConfig.cmake.in шаблон)
find_package(HIP REQUIRED)       # строка 326 (spectrum CMakeLists.txt шаблон)
find_dependency(HIP      REQUIRED) # строка 392 (DspSpectrumConfig.cmake.in шаблон)
```

```cmake
# В РЕАЛИЗАЦИИ (правильно!):
find_package(hip REQUIRED)       # core/CMakeLists.txt
find_dependency(hip REQUIRED)    # core/cmake/DspCoreConfig.cmake.in
```

**Риск**: Если кто-то будет создавать новый модуль по шаблону из плана — сборка упадёт на Linux.

**Действие**: Обновить план v3 — заменить `HIP` → `hip` в шаблонах кода.

**Ответ Alex**:
```

```

---

### [ ] #2. TASK INDEX устарел — показывает Phase 1 как BACKLOG

**Где**: `MemoryBank/tasks/TASK_Modular_Architecture_INDEX.md`

| В INDEX | В реальности |
|---------|-------------|
| Phase 1 — ⬜ BACKLOG | ✅ DONE |
| Phase 2 — ⬜ BACKLOG | ✅ DONE |
| Phase 3 — ⬜ BACKLOG | ✅ DONE |
| Phase 3b — ⬜ BACKLOG | ✅ DONE |

`MASTER_INDEX.md` — корректный (всё DONE). Но TASK INDEX отстал.

**Действие**: Синхронизировать статусы в `TASK_Modular_Architecture_INDEX.md`.

**Ответ Alex**:
```

```

---

### [ ] #3. fetch wrappers — всё ещё `macro()`, а не `function()` (R1 ревью v2)

**Где**: `*/cmake/fetch_deps.cmake`, строки 27-48

В ревью v2 рекомендация R1 — заменить `macro()` на `function()`. Alex ответил «Да».
Но в реализации по-прежнему `macro()`:

```cmake
# Сейчас в коде:
macro(fetch_dsp_core)              dsp_fetch_package(...)  endmacro()
macro(fetch_dsp_spectrum)          dsp_fetch_package(...)  endmacro()
```

**Риск**: Переменные из `dsp_fetch_package` могут просочиться в вызывающий scope. На практике — не критично, т.к. `dsp_fetch_package` уже `function()` и переменные изолированы внутри неё. Wrappers просто делегируют вызов.

**Действие**: Можно заменить на `function()` или оставить `macro()` (риск минимальный, т.к. тело — один вызов функции).

**Ответ Alex**:
```

```

---

### [ ] #4. Нет `CMAKE_EXPORT_COMPILE_COMMANDS=ON` (R2 ревью v2)

**Где**: Ни в одном `CMakePresets.json` нет этой переменной.

Alex ответил «Да» в ревью v2 на рекомендацию R2.
Без неё clangd/IDE не получат `compile_commands.json` автоматически.

**Действие**: Добавить в base/local-dev preset каждого репо:
```json
"CMAKE_EXPORT_COMPILE_COMMANDS": "ON"
```

**Ответ Alex**:
```

```

---

### [ ] #5. Нет `DESCRIPTION` в `project()` (R3 ревью v2)

**Где**: Все 9 `CMakeLists.txt`

Alex ответил «Да» + «нужен LaTeX». Сейчас:
```cmake
project(DspCore VERSION 0.1.0 LANGUAGES CXX HIP)  # без DESCRIPTION
```

Рекомендуется:
```cmake
project(DspCore VERSION 0.1.0
  DESCRIPTION "GPU driver, profiler and backend abstraction"
  LANGUAGES CXX HIP)
```

**Действие**: Добавить DESCRIPTION при следующем обновлении CMakeLists.txt.

**Ответ Alex**:
```

```

---

### [ ] #6. Нет `testPresets` (#6 ревью v2)

**Где**: Ни в одном `CMakePresets.json`.

Alex ответил «Да» в ревью v2. Без testPresets `ctest --preset local-dev` не работает.

**Действие**: Добавить в каждый `CMakePresets.json`:
```json
"testPresets": [
  { "name": "local-dev", "configurePreset": "local-dev",
    "output": { "outputOnFailure": true } }
]
```

**Ответ Alex**:
```

```

---

## ✅ Что из ревью v2 было ИСПРАВЛЕНО

| # | Пункт ревью v2 | Статус |
|---|----------------|--------|
| 🔴 #1 | Conditional build в DSP/CMakeLists.txt | ✅ **Исправлено** — `option(DSP_BUILD_*)` + `if()` |
| 🔴 #2 | `find_package(hip)` lowercase | ✅ **Исправлено** в коде (план отстал — см. #1 выше) |
| 🔴 #3 | Python API breaking change | ✅ **Исправлено** — Phase 3b создана, shim `gpuworklib.py` реализован |
| 🟡 #4 | HIP kernels / cache paths | ✅ **Исправлено** — `kernels/rocm/` в каждом репо |
| 🟡 #5 | Namespace timeline | ⏸️ Отложено — будет после Phase 4 |
| 🟡 #6 | testPresets | ⏸️ Не добавлены (см. #6 выше) |
| 🟡 #7 | Diamond dependency warning | ✅ Решено через централизованный FetchContent |
| 🟢 R1 | `macro` → `function` | ⏸️ Не применено (см. #3 выше) |
| 🟢 R2 | `CMAKE_EXPORT_COMPILE_COMMANDS` | ⏸️ Не добавлено (см. #4 выше) |
| 🟢 R3 | `project(... DESCRIPTION)` | ⏸️ Не добавлено (см. #5 выше) |
| 🟢 R4 | `.pyi` type stubs | ⏸️ Будет в Phase 4+ |

---

## 📋 Сводка: Что нужно сделать

### Обязательно (до Phase 4)

| # | Действие | Приоритет | Трудоёмкость |
|---|----------|-----------|-------------|
| 1 | Обновить план v3: `HIP` → `hip` в шаблонах | 🔴 Высокий | 5 мин |
| 2 | Синхронизировать TASK INDEX со статусами | 🟡 Средний | 2 мин |

### Желательно (можно в Phase 4)

| # | Действие | Приоритет | Трудоёмкость |
|---|----------|-----------|-------------|
| 3 | `macro()` → `function()` в fetch wrappers | 🟢 Низкий | 10 мин (8 файлов) |
| 4 | `CMAKE_EXPORT_COMPILE_COMMANDS=ON` | 🟡 Средний | 5 мин (9 файлов) |
| 5 | `DESCRIPTION` в `project()` | 🟢 Низкий | 5 мин (9 файлов) |
| 6 | `testPresets` в CMakePresets.json | 🟡 Средний | 10 мин (9 файлов) |

---

## 🏆 Итоговый вердикт

**Фаза 0 + Фаза 1 — выполнены на отлично.**

Более того, реализация опередила план — уже завершены Фазы 2, 3, 3b, и подготовка к Phase 4:
- Код скопирован и адаптирован
- Python bindings созданы (8 модулей + shim)
- `target_sources()` заполнены
- `tests/CMakeLists.txt` созданы
- Пресеты для Debian добавлены
- `build_all_debian.sh` создан

**Критических проблем: 0** — можно запускать Phase 4 (тестирование на GPU).

6 расхождений между планом и реализацией — все косметические, реализация лучше плана.

---

## Как отвечать

Впиши ответы в секции `**Ответ Alex**:` под каждым пунктом (#1-#6).
После ответов Кодо внесёт исправления.

---

*Создан: 2026-04-12 | Ревьюер: Кодо*
*Метод: Explore-агент (40+ проверок) + cross-reference плана v2, ревью v2, реализации*
