# CMake Git-aware Build — план

> **Статус**: ОДОБРЕН (v2 — после ревью)
> **Дата**: 2026-04-13
> **Автор**: Alex + Кодо

---

## Цель

CMake должен **автоматически** обнаруживать изменения в субрепозиториях и пересобирать только изменённое — без ручного вмешательства, без интернета.

---

## Реальная архитектура системы

```
┌──────────────────────────────────────────────┐
│  Уровень 2: GitHub (интернет)                │
│  разработка, эксперименты, CI                │
└──────────────┬───────────────────────────────┘
               │ git push / git fetch --mirror
               ▼
┌──────────────────────────────────────────────┐
│  Уровень 3: Промежуточный репо (шлюз)        │
│  git bare mirror / git bundle                │
│  → только транспорт, CMake не участвует      │
│  → обновляется ТОЛЬКО рабочими версиями      │
└──────────────┬───────────────────────────────┘
               │ git pull / git bundle import
               ▼
┌──────────────────────────────────────────────┐
│  Уровень 1: Закрытый сервер (нет интернета)  │
│  /project/DSP-GPU/core/     ← git репо       │
│  /project/DSP-GPU/spectrum/ ← git репо       │
│  ...                                         │
│  Пресет: debian-local-dev                    │
│  Layer 1 + Layer 2 → полный автомат          │
└──────────────────────────────────────────────┘
```

FetchContent с `FETCHCONTENT_SOURCE_DIR_*` **не делает сетевых запросов** — использует локальную папку напрямую. CMake отслеживает изменения через файловую систему.

---

## Как работает полный цикл

```
1. Транспорт доставил новые коммиты в core/
2. Оператор: git pull  (в /project/DSP-GPU/core/)
3. core/.git/index обновился                          ← Layer 2 видит это
4. ninja: автоматически запускает cmake reconfigure
5. cmake: FetchContent_MakeAvailable подхватывает новые файлы
6. ninja: пересобирает только изменённое              ← Layer 1 контролирует это
```

---

## Слой 1 — version.cmake в каждом модуле

**Цель:** при каждом build проверять git HEAD модуля. Если изменился — обновить version-файлы → пересборка downstream. Если не изменился — **нулевая пересборка** (даже генерация не запускается).

### Ключевой принцип: сравнение hash

```
ninja build
  └── cmake -P version.cmake          (всегда)
        └── git rev-parse HEAD
              └── сравнить с .git_hash (предыдущий)
                    ├── СОВПАЛ → return() — НИЧЕГО не трогаем
                    └── ИЗМЕНИЛСЯ → генерируем version.h, version.json
                          └── downstream пересобирается
```

**Никаких шаблонов (.in)** — version.cmake сам генерирует все нужные форматы:
- `version.h` — для C/C++
- `version.json` — для Python, конфигов, любого языка

Добавить новый формат = дописать блок `file(WRITE ...)` в version.cmake.

### Файлы в каждом из 8 модулей

| Файл | Действие |
|------|----------|
| `cmake/version.cmake` | NEW — единый скрипт, без .in шаблонов |
| `CMakeLists.txt` | MODIFY — добавить `git_version` target + `add_dependencies` + `install()` |

**version.h — публичный** (устанавливается в `include/${PROJECT_NAME}/version.h`):
```cmake
install(FILES "${CMAKE_BINARY_DIR}/generated/version.h"
    DESTINATION include/${PROJECT_NAME})
```

**version.json — для Python и других языков:**
```cmake
install(FILES "${CMAKE_BINARY_DIR}/generated/version.json"
    DESTINATION share/${PROJECT_NAME})
```

**Макросы — с namespace модуля** (не конфликтуют при совместной сборке):
```c
#define DSPCORE_VERSION_MAJOR  0
#define DSPCORE_GIT_HASH       "abc1234"
// НЕ generic VERSION_MAJOR — конфликтует между 8 модулями!
```

**version.cmake — копия в каждом модуле** (автономность: модуль работает без DSP).
Принимает `MODULE_PREFIX` для namespace макросов.

**Порядок реализации:** сначала `core` как эталон → проверяем → тиражируем на остальные 7.

---

## Слой 2 — CMAKE_CONFIGURE_DEPENDS в DSP

**Цель:** при `git pull` в любом субрепо → ninja автоматически запускает `cmake reconfigure` → подхватывает новые файлы/изменения CMakeLists.

**Реализация** — встроенный механизм CMake, без сети, без дополнительных скриптов:

```cmake
# DSP/CMakeLists.txt — добавить после fetch_deps

set(_watch_modules core spectrum stats signal_generators
                   heterodyne linalg radar strategies)

foreach(_mod ${_watch_modules})
    string(TOUPPER "${_mod}" _up)
    string(REPLACE "_" "" _up "${_up}")
    set(_key "FETCHCONTENT_SOURCE_DIR_DSP${_up}")

    if(DEFINED ${_key})
        set(_dir "${${_key}}")

        # Поддержка git worktrees: .git может быть файлом
        if(IS_DIRECTORY "${_dir}/.git")
            set(_git_dir "${_dir}/.git")
        elseif(EXISTS "${_dir}/.git")
            file(READ "${_dir}/.git" _git_link)
            string(REGEX REPLACE "^gitdir: (.*)$" "\\1" _git_dir "${_git_link}")
            string(STRIP "${_git_dir}" _git_dir)
        else()
            continue()
        endif()

        # .git/index    — меняется при git pull, commit, merge
        # .git/FETCH_HEAD — меняется при git fetch/pull с remote
        foreach(_gf index FETCH_HEAD)
            if(EXISTS "${_git_dir}/${_gf}")
                set_property(DIRECTORY APPEND PROPERTY
                    CMAKE_CONFIGURE_DEPENDS "${_git_dir}/${_gf}")
            endif()
        endforeach()
    endif()
endforeach()
```

Работает **только в `local-dev` / `debian-local-dev`** (где заданы `FETCHCONTENT_SOURCE_DIR_*`).
В CI-режиме (GIT_TAG) этот блок молча пропускается — директивы `if(DEFINED ...)` не выполнятся.

**Ограничение:** Layer 2 работает только в DSP мета-репо. При standalone-сборке модуля (например spectrum отдельно) автоматический reconfigure при `git pull` в core не произойдёт — нужен ручной `cmake --build . --target rebuild_cache`.

---

## Защита зависимостей (dependency guards)

**Карта зависимостей:**
```
core              ← нет зависимостей от DSP-модулей
spectrum          ← core
stats             ← core
signal_generators ← core, spectrum
heterodyne        ← core, spectrum, signal_generators
linalg            ← core
radar             ← core, spectrum, stats
strategies        ← все выше
```

**Добавить в `DSP/cmake/fetch_deps.cmake`** — при нарушении зависимостей сборка падает с понятным сообщением (не с cryptic linker error):

```cmake
if(DSP_BUILD_SPECTRUM AND NOT DSP_BUILD_CORE)
    message(FATAL_ERROR "[DSP] spectrum требует DSP_BUILD_CORE=ON")
endif()
if(DSP_BUILD_STATS AND NOT DSP_BUILD_CORE)
    message(FATAL_ERROR "[DSP] stats требует DSP_BUILD_CORE=ON")
endif()
if(DSP_BUILD_LINALG AND NOT DSP_BUILD_CORE)
    message(FATAL_ERROR "[DSP] linalg требует DSP_BUILD_CORE=ON")
endif()
if(DSP_BUILD_SIGNAL_GENERATORS)
    if(NOT DSP_BUILD_CORE OR NOT DSP_BUILD_SPECTRUM)
        message(FATAL_ERROR "[DSP] signal_generators требует CORE + SPECTRUM")
    endif()
endif()
if(DSP_BUILD_HETERODYNE)
    if(NOT DSP_BUILD_CORE OR NOT DSP_BUILD_SPECTRUM OR NOT DSP_BUILD_SIGNAL_GENERATORS)
        message(FATAL_ERROR "[DSP] heterodyne требует CORE + SPECTRUM + SIGNAL_GENERATORS")
    endif()
endif()
if(DSP_BUILD_RADAR)
    if(NOT DSP_BUILD_CORE OR NOT DSP_BUILD_SPECTRUM OR NOT DSP_BUILD_STATS)
        message(FATAL_ERROR "[DSP] radar требует CORE + SPECTRUM + STATS")
    endif()
endif()
if(DSP_BUILD_STRATEGIES)
    foreach(_req CORE SPECTRUM STATS SIGNAL_GENERATORS HETERODYNE LINALG RADAR)
        if(NOT DSP_BUILD_${_req})
            message(FATAL_ERROR "[DSP] strategies требует DSP_BUILD_${_req}=ON")
        endif()
    endforeach()
endif()
```

---

## Diamond dependency — конфликта НЕ будет

DSP/CMakeLists.txt вызывает `fetch_dsp_*()` в порядке зависимостей. Каждая функция делает `FetchContent_Declare + FetchContent_MakeAvailable`.

Когда субмодули (heterodyne, spectrum) пытаются объявить DspCore повторно:
1. `FetchContent_Declare` — молча игнорируется (first-declaration-wins)
2. `FetchContent_MakeAvailable` — видит что DspCore уже populated → пропускает

Оба механизма работают вместе. Все модули получают **одну версию** каждой зависимости.

---

## Файлы к созданию/изменению

```
Слой 1 (×8 модулей):
  {module}/cmake/version.cmake        NEW (единый скрипт, без .in)

Слой 2 + guards:
  DSP/CMakeLists.txt                  MODIFY (+CMAKE_CONFIGURE_DEPENDS + worktree support)
  DSP/cmake/fetch_deps.cmake          MODIFY (+dependency guards, включая stats и linalg)

Интеграция (×8 модулей):
  {module}/CMakeLists.txt             MODIFY (+git_version target + add_dependencies + install)
```

**Итого:** 8 новых файлов + 10 изменений

---

## Следующий шаг

Реализуем **Слой 1 в `core`** → проверяем → тиражируем на остальные 7 модулей → Слой 2 в DSP.

---

*Обновлён: 2026-04-13 (v2 — после ревью) | Кодо*
