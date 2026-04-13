# Code Review: cmake_git_aware_build.md

> **Дата ревью**: 2026-04-13
> **Ревьюер**: Кодо (sequential-thinking + context7 + WebSearch)
> **Объект**: спецификация автосборки при изменениях в субрепо (Layer 1 + Layer 2)
> **Проверено против**: реального кода fetch_deps.cmake, CMakePresets.json, CMakeLists.txt, version.cmake шаблона
> **Статус**: ИСПРАВЛЕНО — спека (v2) и version.cmake обновлены

---

## Критические проблемы :red_circle: (ИСПРАВЛЕНЫ)

### 1. BUILD_TIMESTAMP уничтожает zero-rebuild

**Файл:** `~!Doc/CMake/Version/version.cmake`, строка 126
```cmake
string(TIMESTAMP BUILD_TIMESTAMP "%Y-%m-%d %H:%M:%S" UTC)
```

`BUILD_TIMESTAMP` генерирует **новую строку при каждой сборке**. Поскольку она попадает в `version.h` через `configure_file`, файл **всегда** перезаписывается → downstream **всегда** пересобирается.

Это **полностью противоречит** цели спеки: *"hash не изменился → файл не тронут → NO rebuild"*.

**Исправление:** Вынести `BUILD_TIMESTAMP` в отдельный `build_info.h`, который инклудят только те `.cpp`, которым нужно время сборки. Или убрать его из `version.h` совсем.

**Референс:** [andrew-hardin/cmake-git-version-tracking](https://github.com/andrew-hardin/cmake-git-version-tracking) специально избегает volatile данных в отслеживаемом заголовке.

---

### 2. Макросы в version.h.in не имеют namespace

**Файл:** `~!Doc/CMake/Version/version.h.in`, строки 12-29
```c
#define VERSION_MAJOR       @VERSION_MAJOR@
#define GIT_HASH_SHORT      "@GIT_HASH_SHORT@"
```

Это **глобальные макросы**. Когда 8 модулей включаются в одну сборку через DSP, их `version.h` будут конфликтовать: все 8 определяют одинаковые `VERSION_MAJOR`, `GIT_BRANCH` и т.д.

**Исправление:** Параметризовать `version.cmake` — передавать `MODULE_PREFIX` (например `DSPCORE`, `DSPSPECTRUM`). В `version.h.in`:
```c
#define @MODULE_PREFIX@_VERSION_MAJOR  @VERSION_MAJOR@
#define @MODULE_PREFIX@_GIT_HASH_SHORT "@GIT_HASH_SHORT@"
```

Include guard тоже должен быть per-module:
```c
#ifndef @MODULE_PREFIX@_VERSION_H
#define @MODULE_PREFIX@_VERSION_H
```
вместо generic `PROJECT_VERSION_H`.

---

## Важные замечания :yellow_circle:

### 3. Пропущены 2 dependency guard'а

**Файл:** `cmake_git_aware_build.md`, строки 130-169

Карта зависимостей говорит `stats ← core` и `linalg ← core`, но в коде guard'ов **нет проверок** для этих двух модулей. Если `DSP_BUILD_STATS=ON` + `DSP_BUILD_CORE=OFF` — сборка упадёт с cryptic linker error вместо понятного `FATAL_ERROR`.

**Исправление — добавить:**
```cmake
if(DSP_BUILD_STATS AND NOT DSP_BUILD_CORE)
    message(FATAL_ERROR "[DSP] stats требует DSP_BUILD_CORE=ON")
endif()
if(DSP_BUILD_LINALG AND NOT DSP_BUILD_CORE)
    message(FATAL_ERROR "[DSP] linalg требует DSP_BUILD_CORE=ON")
endif()
```

---

### 4. Include guard `PROJECT_VERSION_H` — коллизия

**Файл:** `version.h.in`, строка 8

Один и тот же guard `#ifndef PROJECT_VERSION_H` для всех 8 модулей. Если два `version.h` включены в один `.cpp` — второй молча проигнорирован.

**Исправление:** `#ifndef @MODULE_PREFIX@_VERSION_H` (см. пункт 2).

---

### 5. Неточность в объяснении Diamond Dependency

**Файл:** `cmake_git_aware_build.md`, строки 177-179

Спека цитирует правило *"only the first Declare will be used"*. Это верно, но реальная защита работает через `FetchContent_MakeAvailable()`, который проверяет: *"already populated? → skip"*.

В реальном коде `DSP/cmake/fetch_deps.cmake:16-24` вызывает `Declare + MakeAvailable` в одной функции. Это работает корректно, но объяснение в спеке неполное — стоит уточнить механизм.

---

## Рекомендации :green_circle:

### 6. GIT_DIRTY — ложные пересборки при разработке

`git diff --quiet` отслеживает рабочее дерево. Если разработчик редактирует файл, dirty flag меняется → `version.h` обновляется → пересборка.

Это ожидаемо для CI, но раздражает при local-dev. Рассмотреть: в local-dev dirty flag всегда = 1 (или исключить его из `version.h`).

---

### 7. Git worktrees в Layer 2

Если на закрытом сервере используются git worktrees, то `.git` — это **файл**, а не директория. Проверка `EXISTS "${_dir}/.git/index"` не сработает.

**Безопасный вариант:**
```cmake
# Поддержка worktree: .git может быть файлом
if(IS_DIRECTORY "${_dir}/.git")
    set(_git_dir "${_dir}/.git")
else()
    file(READ "${_dir}/.git" _git_link)
    string(REGEX REPLACE "^gitdir: (.*)$" "\\1" _git_dir "${_git_link}")
    string(STRIP "${_git_dir}" _git_dir)
endif()
```
## Ответ Там директория с git - отслеживания версий 
---

### 8. Standalone-сборка модулей — Layer 2 не работает

Спека описывает Layer 2 только для DSP мета-репо. Если разработчик собирает `spectrum` standalone (через его собственный `CMakePresets.json` → `local-dev`), Layer 2 не активен — `git pull` в `core` не вызовет reconfigure spectrum.

Стоит документировать это ограничение или добавить Layer 2 аналог в каждый модуль.

---

### 9. 8 копий version.cmake — maintenance risk

Спека явно выбирает *"копия в каждом модуле (автономность)"*. Это обоснованно, но при баге в `version.cmake` нужно фиксить в 8 местах.

**Альтернатива:** один `cmake-utils` repo, подключаемый через FetchContent.
**Компромисс:** если модули редко обновляют `version.cmake` — копии приемлемы.

---

### 10. Несогласованность include path: build vs install

Спека говорит install в `include/DspCore/version.h`, но `BUILD_INTERFACE` указывает на `${BIN_DIR}/generated/version.h`.

- При сборке: `#include "version.h"` (без namespace)
- После install: `#include "DspCore/version.h"` (с namespace)

Нужно выбрать одну стратегию и обеспечить единообразный путь.

---

## Верифицировано как корректное :white_check_mark:

| Что проверено | Результат |
|--------------|-----------|
| `configure_file` пропускает запись при неизменном содержимом | Подтверждено документацией CMake |
| `CMAKE_CONFIGURE_DEPENDS` + `.git/index` | Работающий механизм, ложные срабатывания приемлемы в local-dev |
| String manipulation для FETCHCONTENT_SOURCE_DIR ключей | Проверено против CMakePresets.json и fetch_deps.cmake — все 8 ключей совпадают |
| CI/GIT_TAG path корректно обходит Layer 2 | `if(DEFINED ...)` не срабатывает без FETCHCONTENT_SOURCE_DIR |
| Карта зависимостей (граф) | Полная и корректная |
| Git fallback (нет .git) | Graceful degradation к "unknown"/"v0.0.0" |
| Арифметика файлов | 16 новых + 10 изменений — верно |

---

## Соответствие стандартам DSP-GPU

| Критерий | Оценка |
|----------|--------|
| Совместимость с FetchContent архитектурой | :white_check_mark: Полностью |
| Работа без интернета (закрытый сервер) | :white_check_mark: Подтверждено |
| CI/local-dev разделение через пресеты | :white_check_mark: Корректно |
| FETCHCONTENT_SOURCE_DIR naming | :white_check_mark: Верифицировано |
| Карта зависимостей (guards) | :warning: 2 пропущенных guard'а (stats, linalg) |
| Zero-rebuild при отсутствии изменений | :x: Ломается из-за BUILD_TIMESTAMP |
| Namespace safety для 8 модулей | :x: Макросы и include guard конфликтуют |
| Git fallback (нет .git) | :white_check_mark: Graceful degradation |

---

## Источники

- [CMake configure_file docs](https://cmake.org/cmake/help/latest/command/configure_file.html) — подтверждение skip-when-unchanged
- [CMAKE_CONFIGURE_DEPENDS property](https://cmake.org/cmake/help/latest/prop_dir/CMAKE_CONFIGURE_DEPENDS.html) — официальная документация
- [andrew-hardin/cmake-git-version-tracking](https://github.com/andrew-hardin/cmake-git-version-tracking) — референсная реализация git versioning
- [CMake FetchContent module](https://cmake.org/cmake/help/latest/module/FetchContent.html) — diamond dependency resolution
- [GitLab issue #20892: CMAKE_CONFIGURE_DEPENDS limitations](https://gitlab.kitware.com/cmake/cmake/-/issues/20892) — известные ограничения

---

*Ревью: 2026-04-13 | Кодо*
