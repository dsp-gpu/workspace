# Спецификация: CMake+Git distribution pipeline для DSP-GPU

> **Статус**: 📝 SPEC draft → на ревью Alex
> **Дата**: 2026-04-18 | **Автор**: Кодо + Alex
> **Источник обсуждения**: `MemoryBank/.architecture/CMake-GIT/Review_VariantA_Kodo_2026-04-18.md`
> **Исходные доки**: `MemoryBank/.architecture/CMake-GIT/1_…6_*.md`, `MemoryBank/.architecture/CMake-GIT/update_dsp.py`
> **Цель документа**: детальное техническое описание для генерации плана и декомпозиции на таски.

---

## 🎯 1. Цели проекта

### 1.1 Что нужно построить

Distribution pipeline для публикации проверенных версий модулей DSP-GPU на **закрытый сервер SMI100** (без интернета), откуда N параллельных LocalProject-ов тянут исходники и собираются своими конфигурациями GPU/ROCm.

### 1.2 Требования

| # | Требование | Обоснование |
|---|-----------|------------|
| R1 | **Только проверенные версии** попадают на SMI100 | Изоляция production от dev-хаоса |
| R2 | **Clean build каждый раз** на LP (`rm -rf build && cmake --fresh`) | Политика Alex — стабильность через детерминизм |
| R3 | **Добавление модуля ≤ 5 минут** | Сейчас 10, скоро 20-50 модулей |
| R4 | **Reproducibility релизов** через 6+ месяцев | Отладка клиентских багов |
| R5 | **Внятные ошибки CMake** при несовместимых версиях | Сейчас получаем загадочные ошибки линкера |
| R6 | **MemoryBank, ~!Doc, служебное НЕ попадают на SMI100** | Минимизация attack surface, IP protection |
| R7 | **N LocalProject обновляются в собственном темпе** | Каждая команда решает когда брать новую версию |
| R8 | **Правки из LP могут вернуться в public** (rare случаи) | Fixes реальных пользователей полезны |
| R9 | **Никакого интернета на SMI100 / LP** | Требование безопасности |

### 1.3 Не входит в scope этой спеки

- ❌ Полная инфраструктура SMI100 (SSH ключи, ACL, backup) — отдельный doc
- ❌ CI/CD на github.com/dsp-gpu (есть, остаётся как есть)
- ❌ Python-биндинги (уже существуют, не затрагиваем)
- ❌ ABI-CI через abidiff (отвергнуто как оверкилл для 10-50 модулей)

---

## 🏗️ 2. Архитектура (финальная модель)

### 2.1 Три зоны

```
┌──────────────── ЗОНА 0: Публичная разработка ────────────────┐
│  github.com/dsp-gpu/*  (10 репо → 20 → 50)                  │
│  • Полная история, MemoryBank, ~!Doc                         │
│  • Alex разрабатывает, тестирует, ставит теги v1.x.y         │
│  • ПК Alex = единственный мост между зоной 0 и зоной 1      │
└───────────────────────┬──────────────────────────────────────┘
                        │  promote_to_smi100.sh (ВРУЧНУЮ)
                        ▼
┌──────────────── ЗОНА 1: Транзит (локальная сеть) ────────────┐
│  E:\DSP-GPU\smi100_*.git  (N local bare repos)              │
│  ↓ git push smi100 (локальная сеть)                         │
│  /srv/smi100/smi100_*.git (те же N репо на сервере)         │
│  • Только release-теги (v1.x.y), история разработки — НЕТ   │
│  • SMI100 может сам собирать (опционально)                  │
└───────────────────────┬──────────────────────────────────────┘
                        │  FetchContent по локальной сети
                        ▼
┌──────────────── ЗОНА 2: Изолированная (конечные LP) ─────────┐
│  LP_A, LP_B, …, LP_N  (каждая команда свой состав модулей)  │
│  • clean build каждый раз                                    │
│  • CMake через fetch_deps.cmake → FetchContent               │
│  • deps_state.json коммитится → reproducibility              │
│  • Rare patch flow: создать ветку → push на SMI100 → Alex   │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Терминология

| Термин | Расшифровка |
|--------|------------|
| **LP** | LocalProject — конкретный проект в Zone 2 |
| **`smi100_*.git`** | Release-only репо в Zone 1 (на ПК Alex и SMI100) |
| **Promotion** | Ручной перенос проверенного тега Alex-ом из Zone 0 в Zone 1 |
| **Clean build** | `rm -rf build/ && cmake --fresh && cmake --build` |
| **Dev-режим** | LP с `FETCHCONTENT_SOURCE_DIR_*` указанным на локальную папку (overlay) |
| **Patch flow** | Процесс правки модуля из Zone 2 → возврата в Zone 0 |
| **Layer 1** | version.cmake с early-return hash compare в каждом модуле (из v2 спеки) |
| **Layer 2** | CMAKE_CONFIGURE_DEPENDS отслеживает .git/index → ninja автоматический reconfigure (из v2 спеки) |

### 2.3 Преемственность от v2 спеки (что уже в проде)

Спецификация `cmake_git_aware_build.md` v2 (2026-04-13, ОДОБРЕНА) **уже реализована** в коде. Эта новая спека **надстраивается** над ней, не переизобретает:

| Компонент | Где в коде | Статус |
|-----------|-----------|--------|
| **Layer 1** — `version.cmake` с early-return + MODULE_PREFIX | `core/cmake/version.cmake`, `spectrum/cmake/version.cmake`, `linalg/cmake/version.cmake` (идентичные) | ✅ В проде |
| **Layer 2** — `CMAKE_CONFIGURE_DEPENDS` на `.git/index` + `FETCH_HEAD` с worktree support | `DSP/CMakeLists.txt:47-87` | ✅ В проде |
| **Dependency guards** — FATAL_ERROR на нарушение графа | `DSP/cmake/fetch_deps.cmake:1-40` (7 блоков) | ✅ В проде |
| **Zero-rebuild принцип** — `copy_if_different` + hash comparison | `cmake/version.cmake:63-71, 198-204` | ✅ В проде |
| **Diamond dependency** — first-declare-wins | Via `FetchContent_MakeAvailable` поведение | ✅ Работает |

**Что мы используем из v2 напрямую** (никаких доработок):
- `version.cmake` — копируется в каждый новый модуль как есть
- Layer 2 механизм — работает в DSP мета-репо, распространяется на LP через dev-preset (см. C8.2 ниже)
- Git worktree support — уже включён в Layer 2 код (строки 62-70)
- Dependency guards шаблон — генерируется из `dsp_modules.json` (C2)

**Что доработаем** в новой спеке относительно v2:
- v2 описывает **одну** машину (закрытый сервер = dev + build). Мы добавляем **promotion + distribution + N×LP** поверх.
- v2 dependency guards hardcoded в `DSP/cmake/fetch_deps.cmake`. Мы генерируем из манифеста (C1/C2).
- v2 не имеет Config.cmake.in + `write_basic_package_version_file`. Мы добавляем (C6) для внятных CMake-ошибок несовместимости версий.
- v2 не имеет `deps_state.json` reproducibility pipeline. Мы добавляем (C7).

---

## 🧩 3. Компоненты реализации

Всего **11 компонентов**. Каждый — отдельная тестируемая единица.

### C1. Manifest `dsp_modules.json`

**Что**: Single source of truth для всей pipeline.

**Где**: `E:\DSP-GPU\dsp_modules.json` (в git workspace-репо).

**Формат**:
```json
{
  "schema_version": 1,
  "modules": {
    "core":              { "deps": [], "external": ["hip", "OpenCL"] },
    "spectrum":          { "deps": ["core"], "external": ["hipfft"] },
    "stats":             { "deps": ["core", "spectrum"], "external": ["rocprim"] },
    "signal_generators": { "deps": ["core", "spectrum"] },
    "heterodyne":        { "deps": ["core", "spectrum", "signal_generators"] },
    "linalg":            { "deps": ["core"], "external": ["rocblas", "rocsolver"] },
    "radar":             { "deps": ["core", "spectrum", "stats"] },
    "strategies":        { "deps": ["core", "spectrum", "stats", "signal_generators",
                                     "heterodyne", "linalg", "radar"] }
  }
}
```

**Валидация** (в генераторе):
- Каждый `deps` элемент должен существовать в `modules`
- Нет циклов (radar → core → radar нельзя)
- Имена snake_case, латиница
- `external` — подсказка, не используется в логике сейчас (чтобы знать какие ROCm-либы нужны)

**DoD (Definition of Done)**:
- [ ] Файл создан со всеми 8 текущими модулями
- [ ] Есть JSON schema (`.schema.json`) для валидации
- [ ] Есть Python-скрипт `validate_manifest.py` — проверяет циклы, имена, существование
- [ ] Документирован формат в `MemoryBank/specs/manifest_format.md`

---

### C2. Генератор `fetch_deps.cmake` из манифеста

**Что**: Python-скрипт читает `dsp_modules.json` и генерирует `fetch_deps.cmake` для каждого модуля.

**Где**: `E:\DSP-GPU\scripts\generate_cmake_deps.py`

**Что генерирует** (на примере `spectrum`):
```cmake
# AUTO-GENERATED from dsp_modules.json. DO NOT EDIT.
# Regenerate: python scripts/generate_cmake_deps.py

include_guard(GLOBAL)
include(FetchContent)

set(DSP_GIT_SERVER "git@smi100.local:/srv/smi100"
    CACHE STRING "SMI100 git server")

# Read deps_state.json for reproducibility
if(EXISTS "${CMAKE_SOURCE_DIR}/deps_state.json")
    file(READ "${CMAKE_SOURCE_DIR}/deps_state.json" _DSP_STATE)
else()
    set(_DSP_STATE "{}")
endif()

function(_dsp_get_ref MOD_NAME OUT_VAR)
    string(JSON _sha ERROR_VARIABLE _err
           GET "${_DSP_STATE}" "repos" "${MOD_NAME}" "sha")
    if(_err)
        set(${OUT_VAR} "main" PARENT_SCOPE)
    else()
        set(${OUT_VAR} "${_sha}" PARENT_SCOPE)
    endif()
endfunction()

function(_dsp_fetch_one NAME SLUG VERSION_REQUIRED)
    _dsp_get_ref("${SLUG}" _tag)
    string(TOUPPER "DSP_${SLUG}_TAG" _cache_var)
    set(${_cache_var} "${_tag}" CACHE STRING "Tag for ${NAME}")

    FetchContent_Declare(${NAME}
        GIT_REPOSITORY "${DSP_GIT_SERVER}/smi100_${SLUG}.git"
        GIT_TAG        "${${_cache_var}}"
        GIT_REMOTE_UPDATE_STRATEGY CHECKOUT
        FIND_PACKAGE_ARGS ${VERSION_REQUIRED} NAMES ${NAME} CONFIG
        SYSTEM
    )
    FetchContent_MakeAvailable(${NAME})
endfunction()

# Generated from manifest deps graph:
function(fetch_dsp_core)
    _dsp_fetch_one(DspCore core 1.0)
endfunction()

function(fetch_dsp_spectrum)
    fetch_dsp_core()                             # transitive
    _dsp_fetch_one(DspSpectrum spectrum 1.0)
endfunction()

# ... остальные 6 функций
```

**DoD**:
- [ ] Скрипт читает манифест, генерирует `fetch_deps.cmake` для каждого модуля + один общий
- [ ] Auto-комментарий "DO NOT EDIT, regenerate via …"
- [ ] В CI / pre-commit hook: если манифест изменился, но `fetch_deps.cmake` не регенерирован → fail
- [ ] README с инструкцией "как добавить новый модуль"

---

### C3. Create `smi100_*.git` репо (однажды на ПК Alex)

**Что**: Скрипт инициализации N пустых bare-репо parallel к public модулям.

**Где**: `E:\DSP-GPU\scripts\init_smi100_repos.sh`

```bash
#!/usr/bin/env bash
# init_smi100_repos.sh — создаёт smi100_*.git для всех модулей из манифеста
set -e
MANIFEST="E:\DSP-GPU\dsp_modules.json"
DSP_ROOT="E:\DSP-GPU"

MODULES=$(jq -r '.modules | keys[]' "$MANIFEST")

for mod in $MODULES; do
    TARGET="$DSP_ROOT/smi100_${mod}.git"
    if [ -d "$TARGET" ]; then
        echo "[SKIP] $TARGET exists"
        continue
    fi
    git init --bare "$TARGET"
    echo "[OK]   Created $TARGET"
done
```

**DoD**:
- [ ] Создаёт все smi100_*.git из манифеста
- [ ] Идемпотентен (повторный запуск → skip)
- [ ] Добавляет remote `smi100` указывающий на реальный сервер (опционально)

---

### C4. `promote_to_smi100.sh` — промотирование одного тега

**Что**: Скрипт промотирования проверенного тега из public github в smi100_*.git и дальше на SMI100.

**Где**: `E:\DSP-GPU\scripts\promote_to_smi100.sh`

```bash
#!/usr/bin/env bash
# Usage: ./promote_to_smi100.sh <module> <tag>
# Example: ./promote_to_smi100.sh core v1.2.0
set -e
MODULE="$1"
TAG="$2"
DSP_ROOT="E:\DSP-GPU"

[ -z "$MODULE" ] || [ -z "$TAG" ] && {
    echo "Usage: $0 <module> <tag>"; exit 1; }

# 1. Тег должен существовать в public репо
cd "$DSP_ROOT/$MODULE"
git rev-parse --verify "refs/tags/$TAG" >/dev/null 2>&1 || {
    echo "ERROR: tag $TAG not found in $MODULE"; exit 1; }

# 2. Push тега в local smi100_*.git
git push "$DSP_ROOT/smi100_$MODULE.git" "refs/tags/$TAG:refs/tags/$TAG"

# 3. Push на SMI100 (если remote настроен)
cd "$DSP_ROOT/smi100_$MODULE.git"
if git remote get-url smi100 >/dev/null 2>&1; then
    git push smi100 "refs/tags/$TAG"
    echo "✅ Promoted: $MODULE @ $TAG → local + SMI100"
else
    echo "⚠️  Promoted locally только (remote smi100 не настроен)"
fi
```

**DoD**:
- [ ] Проверяет существование тега перед push
- [ ] Fail fast с понятным сообщением
- [ ] Работает без настроенного SMI100 remote (локально)
- [ ] Логирование в `E:\DSP-GPU\MemoryBank\changelog\promotions.log`

---

### C5. `promote_breaking_change.sh` — atomic sync промотирование

**Что**: Промотирование набора модулей одним махом (для breaking changes).

**Где**: `E:\DSP-GPU\scripts\promote_breaking_change.sh`

```bash
#!/usr/bin/env bash
# Usage: ./promote_breaking_change.sh <config.yaml>
# config.yaml содержит список (module, tag) пар
# Порядок определяется из dsp_modules.json (topological sort)
set -e
CONFIG="$1"

# Читаем список модулей + tags из yaml/json
MODULES=$(yq -r '.modules[]  | "\(.name):\(.tag)"' "$CONFIG")

# Topological sort из dsp_modules.json (core сначала)
SORTED_MODULES=$(python E:\DSP-GPU\scripts\topo_sort.py "$CONFIG")

# Промотируем в правильном порядке
for spec in $SORTED_MODULES; do
    name="${spec%:*}"
    tag="${spec#*:}"
    ./promote_to_smi100.sh "$name" "$tag" || {
        echo "❌ FAILED on $name@$tag — rolling back NOT implemented"
        echo "   Manual check: E:\DSP-GPU\MemoryBank\changelog\promotions.log"
        exit 1
    }
done

echo "✅ All promoted atomically"
```

**DoD**:
- [ ] Topological sort из манифеста (core до spectrum до radar)
- [ ] Fail-fast: если один модуль не прошёл, остальные не стартуют
- [ ] Документация "как откатить" (на сегодня — вручную, автоотката нет)
- [ ] Тест: breaking change stats+radar+strategies одновременно

---

### C6. Config.cmake.in для каждого модуля

**Что**: Экспорт версии модуля для CMake's FIND_PACKAGE_ARGS с версией.

**Где**: `{repo}/cmake/{Name}Config.cmake.in` — новый файл в каждом из 8 репо.

**Шаблон** (для core):
```cmake
# core/cmake/DspCoreConfig.cmake.in
@PACKAGE_INIT@

include(CMakeFindDependencyMacro)
# find_dependency(hip)  # если нужны внешние

include("${CMAKE_CURRENT_LIST_DIR}/DspCoreTargets.cmake")
check_required_components(DspCore)
```

**Плюс в `core/CMakeLists.txt` добавить**:
```cmake
include(CMakePackageConfigHelpers)
configure_package_config_file(
    "${CMAKE_CURRENT_SOURCE_DIR}/cmake/DspCoreConfig.cmake.in"
    "${CMAKE_CURRENT_BINARY_DIR}/DspCoreConfig.cmake"
    INSTALL_DESTINATION "${CMAKE_INSTALL_LIBDIR}/cmake/DspCore"
)
write_basic_package_version_file(
    "${CMAKE_CURRENT_BINARY_DIR}/DspCoreConfigVersion.cmake"
    VERSION ${PROJECT_VERSION}
    COMPATIBILITY SameMajorVersion
)

install(FILES
    "${CMAKE_CURRENT_BINARY_DIR}/DspCoreConfig.cmake"
    "${CMAKE_CURRENT_BINARY_DIR}/DspCoreConfigVersion.cmake"
    DESTINATION "${CMAKE_INSTALL_LIBDIR}/cmake/DspCore"
)
```

**DoD**:
- [ ] Config.cmake.in создан для всех 8 модулей
- [ ] `write_basic_package_version_file(COMPATIBILITY SameMajorVersion)` везде
- [ ] Тест: собрать DspCore@v1.0, попытаться использовать в LP с `FIND_PACKAGE_ARGS 2.0 NAMES DspCore` → configure-error
- [ ] Шаблон Config.cmake.in — одинаковый для всех модулей (генерируется тоже?)

---

### C7. `deps_state.json` pipeline в CMake

**Что**: Связать `update_dsp.py` и CMake через `deps_state.json`.

**Где**: 
- `LocalProject/deps_state.json` — создаётся `update_dsp.py`, коммитится в LP-репо
- `fetch_deps.cmake` — читает JSON и использует SHA вместо main

**Формат `deps_state.json`** (уже есть в update_dsp.py, стандартизируем):
```json
{
  "updated": "2026-04-18T10:00:00Z",
  "schema_version": 1,
  "repos": {
    "core":     { "sha": "abc123def", "tag": "v1.2.0",  "date": "2026-04-15" },
    "spectrum": { "sha": "fed456cba", "tag": "v1.1.0",  "date": "2026-04-10" },
    "stats":    { "sha": "789abc000", "tag": "",        "date": "2026-04-18",
                  "ref": "breaking/new_avg_signature", "note": "temp" }
  }
}
```

- `sha` — всегда SHA коммита (source of truth для CMake)
- `tag` — человекочитаемый тег (если есть)
- `ref` — branch name если на breaking-ветке
- `note` — произвольный коммент

**Расширения update_dsp.py**:
- [ ] Поддержка `--ref breaking/xxx` для временного указания branch
- [ ] `--pin <module> <tag>` — ручное фиксирование
- [ ] `--show` — показать текущий state

**DoD**:
- [ ] CMake читает JSON → подставляет SHA → FetchContent берёт exact revision
- [ ] Если state отсутствует → fallback на `main`
- [ ] `update_dsp.py --pin core v1.2.0` работает
- [ ] Тест: `git checkout LP-v0.1 && rm -rf build && cmake --preset zone2 && cmake --build` → те же SHA deps

---

### C8. CMakePresets для LocalProject

**Что**: Шаблон CMakePresets.json для Zone 2, с dev-режимами.

**Где**: `E:\DSP-GPU\templates\LocalProject\CMakePresets.json` (шаблон)

```jsonc
{
  "version": 6,
  "configurePresets": [
    {
      "name": "zone2",
      "displayName": "Zone 2 — production",
      "generator": "Ninja",
      "binaryDir": "${sourceDir}/build",
      "cacheVariables": {
        "CMAKE_BUILD_TYPE": "Release",
        "FETCHCONTENT_TRY_FIND_PACKAGE_MODE": "NEVER",
        "DSP_GIT_SERVER": "git@smi100.local:/srv/smi100"
      }
    },
    {
      "name": "zone2-dev-stats",
      "inherits": "zone2",
      "displayName": "Dev: stats в ../stats-dev/",
      "cacheVariables": {
        "FETCHCONTENT_SOURCE_DIR_DSPSTATS": "${sourceDir}/../stats-dev"
      }
    },
    {
      "name": "zone2-dev-core",
      "inherits": "zone2",
      "displayName": "Dev: core в ../core-dev/",
      "cacheVariables": {
        "FETCHCONTENT_SOURCE_DIR_DSPCORE": "${sourceDir}/../core-dev"
      }
    }
  ],
  "buildPresets": [
    { "name": "zone2", "configurePreset": "zone2" },
    { "name": "zone2-dev-stats", "configurePreset": "zone2-dev-stats" }
  ]
}
```

**DoD**:
- [ ] Шаблон валидирован CMake
- [ ] Dev-preset для каждого модуля генерируется автоматически из манифеста
- [ ] Документация: когда какой preset использовать

#### C8.2 — Layer 2 integration для dev-preset (из v2 спеки)

**Зачем**: когда LP в dev-режиме правит `../stats-dev/`, ninja должен **автоматически** среагировать на `git commit` там → пересобрать. Без этого пользователь каждый раз вручную делает `cmake -B build`.

**Реализация** — переиспользуем готовый код из `DSP/CMakeLists.txt:47-87` v2 спеки. Нужно:

1. **Скопировать блок Layer 2** в шаблон `LocalProject/CMakeLists.txt`:
   ```cmake
   # ── Layer 2: auto-reconfigure на git pull в dev-overlay ──────────
   # Работает только когда заданы FETCHCONTENT_SOURCE_DIR_* (dev-preset).
   # В zone2-production блок молча пропускается.
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

           foreach(_gf index FETCH_HEAD)
               if(EXISTS "${_git_dir}/${_gf}")
                   set_property(DIRECTORY APPEND PROPERTY
                       CMAKE_CONFIGURE_DEPENDS "${_git_dir}/${_gf}")
               endif()
           endforeach()
       endif()
   endforeach()
   unset(_watch_modules _mod _up _key _dir _git_dir)
   ```

2. **Список `_watch_modules`** генерируется из `dsp_modules.json` (часть C2 генератора).

**DoD C8.2**:
- [ ] Layer 2 блок добавлен в шаблон LP CMakeLists.txt
- [ ] Git worktree support работает (тест: `.git` как файл)
- [ ] В `zone2` пресете (production) блок молча пропускается (нет `FETCHCONTENT_SOURCE_DIR_*`)
- [ ] В `zone2-dev-stats` пресете: `git pull` в `../stats-dev/` → `cmake --build` **автоматически** делает reconfigure → подхватывает изменения

---

### C9. `Patch_Flow.md` — документация процесса правки

**Что**: Пользовательская документация для разработчиков в Zone 2.

**Где**: `MemoryBank/.architecture/CMake-GIT/Patch_Flow.md` + копия в LocalProject/docs/

**Содержание**:
1. Два сценария правки (быстрая / долгая)
2. Вариант А — в `build/_deps/` (для 10-минутной правки)
3. Вариант Б — dev-режим с клоном в `../module-dev/` (для серьёзной работы)
4. Сравнительная таблица когда что использовать
5. Как Alex подхватывает ветку из SMI100
6. Пример полного workflow breaking change

**DoD**:
- [ ] 2 сценария описаны с пошаговыми bash-командами
- [ ] Скриншоты / ASCII-диаграммы для ясности
- [ ] FAQ: "что если я забыл git push до rm -rf build?"

---

### C10. `update_dsp.py` — расширения и фиксы

**Что**: Существующий скрипт, нужны доработки.

**Где**: `MemoryBank/.architecture/CMake-GIT/update_dsp.py` → переместить в `E:\DSP-GPU\scripts\update_dsp.py`

**Что доработать**:

1. **Фикс багов из первого ревью**:
   - Lines 152-156: двойной `git checkout` при error → один вызов
   - Lines 265-266: двойной `git commit` → один вызов с проверкой

2. **Новые возможности**:
   - `--pin <module> <tag>` — ручное фиксирование версии
   - `--ref <module> <branch>` — для временного закрепления breaking branch
   - `--show` — показать текущий state
   - `--repo-filter <pattern>` — обновить только репо matching pattern
   - Читает список модулей из `dsp_modules.json` (не hardcoded)

3. **Валидация**:
   - SHA существует на remote перед checkout
   - Tag формат `v{major}.{minor}.{patch}` (semver)
   - Warn при попытке откатиться на старшую major

**DoD**:
- [ ] Два критичных бага фиксаны
- [ ] Новые флаги работают (dry-run + pin + ref + show)
- [ ] Читает `dsp_modules.json` (не hardcoded REPOS)
- [ ] Тесты pytest? ❌ Не применимо (политика), но standalone test-скрипт

---

### C11. SSH + Git server настройка на SMI100

**Что**: Инфраструктура на Linux SMI100 для приёма git push и раздачи по локальной сети.

**Где**: deploy-скрипт `E:\DSP-GPU\scripts\setup_smi100.sh` + документация

**Минимальный setup**:
```bash
# На SMI100 (Debian):
sudo apt install git
sudo adduser --system --group --home /srv/smi100 gitsrv
sudo -u gitsrv bash -c '
  mkdir -p /srv/smi100
  for mod in core spectrum stats signal_generators heterodyne linalg radar strategies; do
    cd /srv/smi100
    git init --bare "smi100_${mod}.git"
  done
'
# Добавить ssh authorized_keys с command="git-shell"
sudo -u gitsrv bash -c '
  mkdir -p /srv/smi100/.ssh
  echo "command=\"git-shell\" <pubkey_alex>" > /srv/smi100/.ssh/authorized_keys
  echo "command=\"git-shell\" <pubkey_lp_user>" >> /srv/smi100/.ssh/authorized_keys
'
```

Для scale (>3 пользователей или per-repo permissions) — **gitolite**.

**DoD**:
- [ ] Скрипт setup-а документирован
- [ ] Alex может делать `git push smi100` с ПК
- [ ] LP user может делать `git clone git@smi100:/srv/smi100/smi100_core.git`
- [ ] LP user НЕ может push в smi100_*.git (только read)
- [ ] Отдельные incoming/ репо для patches (write от LP, read для Alex)

---

## 📋 4. Фазы реализации

Фазы упорядочены по зависимостям и рискам. Рекомендую выполнять последовательно.

### Фаза 0 — Manifest + генератор (fundament)

**Зависимости**: нет
**Компоненты**: C1, C2

**Шаги**:
1. Создать `dsp_modules.json` со всеми 8 текущими модулями
2. Написать `validate_manifest.py`
3. Написать `generate_cmake_deps.py` — генератор
4. Запустить на текущих модулях, сравнить с существующим `linalg/cmake/fetch_deps.cmake`
5. Приёмка: сгенерированный файл функционально эквивалентен текущему

**DoD фазы**:
- [ ] Манифест утверждён
- [ ] Генератор работает
- [ ] Сгенерированные `fetch_deps.cmake` идентичны по поведению текущим (diff приемлемый)

**Ориентир**: ~1 день

---

### Фаза 1 — Локальный прототип 2 модулей (proof of concept)

**Зависимости**: Фаза 0
**Компоненты**: C3 (упрощённо — 2 репо), частично C8

**Шаги**:
1. `init_smi100_repos.sh` — создать `smi100_core.git` + `smi100_spectrum.git` локально
2. Сделать теги `v0.1.0` в public core + spectrum
3. Промотировать: `git push E:\DSP-GPU\smi100_core.git v0.1.0:v0.1.0`
4. Создать тестовый `LP_test/` с минимальным CMakeLists.txt + main.cpp использующий DspCore + DspSpectrum
5. Применить `CMakePresets.json` с `DSP_GIT_SERVER=E:\DSP-GPU` (локальный путь)
6. `rm -rf build && cmake --preset zone2 && cmake --build`
7. Проверка: бинарник собрался, линковка прошла, запускается

**DoD фазы**:
- [ ] Demo работает на ПК Alex, без SMI100
- [ ] Clean build всегда успешен
- [ ] Документировано "как повторить у себя"

**Ориентир**: ~1-2 дня

---

### Фаза 2 — deps_state.json pipeline

**Зависимости**: Фаза 1
**Компоненты**: C7, C10 (частично)

**Шаги**:
1. Доработать `fetch_deps.cmake` (через генератор) — чтение JSON
2. Фикс двух багов в `update_dsp.py`
3. `update_dsp.py --pin core v0.1.0` → создать `deps_state.json`
4. `git tag LP_test-v0.1` + commit deps_state.json
5. `git checkout LP_test-v0.1 && rm -rf build && cmake --preset zone2 && cmake --build` → те же SHA
6. Проверка: в `build/_deps/dspcore-src/` git log показывает **именно** зафиксированный SHA

**DoD фазы**:
- [ ] update_dsp.py баги пофиксены
- [ ] Reproducibility подтверждена: через checkout старого тега → та же сборка
- [ ] **Zero-rebuild тест** (из v2 спеки): изменить только `"updated": "..."` timestamp в `deps_state.json` → `cmake --build` **не пересобирает** объектники (только reconfigure-step). Это критично — нарушение zero-rebuild это регрессия v2 принципа.

**Ориентир**: ~1 день

---

### Фаза 3 — Config.cmake с версией (внятные CMake ошибки)

**Зависимости**: Фаза 2
**Компоненты**: C6

**Шаги**:
1. Добавить `DspCoreConfig.cmake.in` в core
2. Добавить `write_basic_package_version_file` в core/CMakeLists.txt
3. В генераторе `fetch_deps.cmake` — `FIND_PACKAGE_ARGS 1.0 NAMES DspCore CONFIG`
4. Собрать DspCore@v1.0
5. Попытаться использовать с `FIND_PACKAGE_ARGS 2.0` → должно упасть на configure с понятным сообщением
6. Повторить для spectrum (транзитивная зависимость)

**DoD фазы**:
- [ ] Все 8 модулей имеют Config.cmake.in
- [ ] Тест: несовместимая версия → **configure-error**, не link-error
- [ ] Документирован формат "как обновлять PROJECT_VERSION в каждом модуле"

**Ориентир**: ~1 день (шаблон один, повторить для 8)

---

### Фаза 4 — Dev-режим и Patch flow

**Зависимости**: Фаза 1
**Компоненты**: C8 (полностью), C9

**Шаги**:
1. Добавить `zone2-dev-*` пресеты (генератор из манифеста)
2. Клонировать `smi100_stats.git` в `stats-dev/`
3. Создать ветку `breaking/test_change`
4. LP использует `cmake --preset zone2-dev-stats` → исходники из `stats-dev/`
5. Правит, пересобирает, правки переживают `rm -rf build`
6. Написать `Patch_Flow.md` с двумя вариантами (А / Б)

**DoD фазы**:
- [ ] Dev-preset работает
- [ ] Patch_Flow.md создан
- [ ] End-to-end тест: правка stats → rm build → сборка — правки на месте

**Ориентир**: ~1 день

---

### Фаза 5 — Автоматизация промотирования

**Зависимости**: Фаза 0 (манифест), Фаза 1 (понимание что работает)
**Компоненты**: C4, C5

**Шаги**:
1. Написать `promote_to_smi100.sh`
2. Написать `promote_breaking_change.sh` + `topo_sort.py` из манифеста
3. Логирование в `promotions.log`
4. Тест: breaking change (stats + radar) — оба промотированы атомарно

**DoD фазы**:
- [ ] Оба скрипта работают
- [ ] Топологическая сортировка корректна
- [ ] Лог промотирований пишется

**Ориентир**: ~1 день

---

### Фаза 6 — Реальный SMI100

**Зависимости**: Фазы 1-5
**Компоненты**: C11

**Шаги**:
1. Setup SMI100 Debian (user gitsrv, /srv/smi100/, bare repos)
2. SSH keys Alex → SMI100
3. Alex: `git push smi100 v1.0.0` через реальную локальную сеть
4. Setup 1 LP-клиента (виртуалка или другой ПК без интернета)
5. End-to-end: LP клонирует из SMI100, собирает, запускает

**DoD фазы**:
- [ ] SMI100 принимает push
- [ ] 1 LP успешно собирается из SMI100
- [ ] Документация `SMI100_Setup.md` для будущих тиражирований

**Ориентир**: ~1-2 дня (зависит от SSH/сетевых проблем)

---

### Фаза 7 — Масштабирование + patches

**Зависимости**: Фаза 6
**Компоненты**: доп incoming/ репо для patches

**Шаги**:
1. Добавить `incoming/core.git`, `incoming/spectrum.git` на SMI100 (write от LP, read Alex)
2. LP-user: push breaking ветки в `incoming/stats.git`
3. Alex fetch → перенос в public → тест → промотирование
4. CI smoke test: один LP всегда собирается с `main` всех модулей
5. Добавить 2-й LP (другой набор USE_DSP_*) — убедиться что масштабируется

**DoD фазы**:
- [ ] Patch flow пройден end-to-end 1 раз
- [ ] 2 параллельных LP успешно работают
- [ ] CI smoke test зелёный

**Ориентир**: ~2-3 дня

---

## 🎯 5. Критерии общей готовности (Exit Criteria)

Pipeline считается готовым к production когда:

- [ ] Все 8 текущих модулей промотированы в `smi100_*.git`
- [ ] Минимум 1 LP собирается только из SMI100, без интернета
- [ ] Reproducibility подтверждена: `git checkout LP-v0.1 → rm build → cmake` = bit-identical (с поправкой на timestamps)
- [ ] Patch flow отработан на реальном breaking change (хотя бы в тесте)
- [ ] Добавление 9-го модуля занимает ≤15 минут (манифест + генератор + промотирование)
- [ ] Документация покрывает: setup SMI100, workflow LP, patch flow, breaking change
- [ ] MemoryBank `/specs/` содержит этот документ + один changelog-запись
- [ ] **Layer 1 + Layer 2 из v2 спеки интегрированы** в distribution pipeline — dev-preset автоматически reconfigure при `git pull` в dev-overlay (проверено)
- [ ] **Zero-rebuild принцип v2 не нарушен** — косметическое изменение `deps_state.json` не вызывает пересборку

---

## 🔴 6. Риски и митигация

| # | Риск | Вероятность | Митигация |
|---|------|------------|-----------|
| R1 | Генератор ломает существующий код | Средняя | Фаза 0 включает diff с текущим — пока не совпадает, не мерджим |
| R2 | GIT_REMOTE_UPDATE_STRATEGY работает иначе на CMake 3.24 vs 3.28 | Низкая | Фиксировать min CMake version = 3.24, документировать |
| R3 | SSH на SMI100 блокирован корпоративной политикой | Высокая | Альтернатива: git-http-backend через nginx на SMI100 |
| R4 | `FETCHCONTENT_SOURCE_DIR_*` имя не совпадает с FetchContent `NAME` | Средняя | Генератор валидирует — uppercase name matches exactly |
| R5 | Breaking change несогласованно промотирован (один модуль без другого) | Средняя | `promote_breaking_change.sh` с топологической сортировкой + pre-check |
| R6 | deps_state.json разошёлся с реальными tag в smi100_*.git | Низкая | `update_dsp.py --verify` перед pin |
| R7 | LP user случайно push в refs/heads/main в smi100_*.git | Средняя | Pre-receive hook на SMI100 запрещает не-tag ref в smi100_* |
| R8 | При 50 модулях генератор `fetch_deps.cmake` станет медленным | Низкая | Пока каждый модуль имеет только свой fetch_deps (не 50 штук) |

---

## ❓ 7. Открытые вопросы (требуют решения Alex)

### Q1 — Формат манифеста: `dsp_modules.json` vs `dsp_modules.yaml`

JSON проще (CMake 3.19+ умеет `string(JSON)`), YAML красивее для людей. Склоняюсь к JSON. Согласен?

### Q2 — Где хранить манифест?

Опции:
- (a) В `workspace`-репо (рядом с CLAUDE.md) — логично, меняется редко
- (b) Отдельный репо `dsp-gpu/manifest` — избыточно для одного файла
- (c) В каждом модуле копия (auto-sync) — дублирование

**Рекомендую (a)**: `E:\DSP-GPU\dsp_modules.json`.

### Q3 — Нумерация версий для новых smi100_*.git репо

Начинать с `v0.1.0` (консервативно) или `v1.0.0` (сигнал "production-ready")?

**Рекомендую v0.1.0** пока не пройдены все 7 фаз, потом бампнуть до v1.0.0.

### Q4 — LP-users: как регистрируются?

Для каждого LP-пользователя нужен SSH ключ на SMI100. Процесс:
- (a) Alex получает pubkey от юзера → вручную добавляет на SMI100
- (b) Автоматизация через gitolite (рекомендую если >3 юзеров)

**Рекомендую (a)** для первых 2-3 LP, потом (b).

### Q5 — Где живёт incoming/ для patches?

Отдельные репо `/srv/smi100/incoming/core.git` или namespace `refs/heads/patches/*` в основном `smi100_core.git`?

**Рекомендую отдельные repos** — чище разграничение прав.

### Q6 — Что если LP использует модуль который не в манифесте?

Например команда завела свой форк `lp_custom_core.git` и хочет его вместо `smi100_core.git`. Сейчас манифест фиксирован, генератор жёстко прошит.

**Решение (позднее)**: LP имеет свой `deps_override.json` в котором переопределяет repo URL для конкретных модулей.

---

## 📚 8. Сопутствующие документы

| Документ | Статус | Куда положить |
|----------|--------|--------------|
| Этот spec | 📝 draft | `MemoryBank/specs/cmake_git_distribution_spec_2026-04-18.md` |
| **v2 предшественник** (Layer 1 + 2) | ✅ APPROVED, в проде | `MemoryBank/specs/cmake_git_aware_build.md` |
| Ревью v2 спеки | ✅ применён | `MemoryBank/specs/cmake_git_aware_build_REVIEW.md` |
| Сравнительный анализ v2 ↔ новая | ✅ готов | `MemoryBank/specs/cmake_git_specs_comparison_2026-04-18.md` |
| Ревью Варианта A (обсуждение дизайна) | ✅ готов | `MemoryBank/.architecture/CMake-GIT/Review_VariantA_Kodo_2026-04-18.md` |
| Исходные варианты 1-6 | ✅ готов (черновики) | `MemoryBank/.architecture/CMake-GIT/1_…6_*.md` |
| Patch_Flow.md | ⬜ todo (Фаза 4) | `MemoryBank/.architecture/CMake-GIT/Patch_Flow.md` |
| SMI100_Setup.md | ⬜ todo (Фаза 6) | `MemoryBank/.architecture/CMake-GIT/SMI100_Setup.md` |
| Manifest_Format.md | ⬜ todo (Фаза 0) | `MemoryBank/specs/manifest_format.md` |

**Prod-код** (переиспользуем без переделки):
- `core/cmake/version.cmake`, `spectrum/cmake/version.cmake`, `linalg/cmake/version.cmake` — Layer 1
- `DSP/CMakeLists.txt:47-87` — Layer 2 (CMAKE_CONFIGURE_DEPENDS + worktree support)
- `DSP/cmake/fetch_deps.cmake:1-40` — 7 dependency guard блоков

---

## 🔗 9. Референсы

- [CMake FetchContent docs](https://cmake.org/cmake/help/latest/module/FetchContent.html)
- [CMake write_basic_package_version_file](https://cmake.org/cmake/help/latest/module/CMakePackageConfigHelpers.html)
- [CMake ExternalProject GIT_TAG guidance](https://cmake.org/cmake/help/latest/module/ExternalProject.html)
- [gitolite](https://gitolite.com/gitolite/) — для Фазы 6/7
- [CPM Issue #263 — GIT_TAG branch auto-update](https://github.com/cpm-cmake/CPM.cmake/issues/263)
- [ROCm/TheRock — ROCm multi-module pattern](https://github.com/ROCm/TheRock)
- Существующий prod-код: `linalg/cmake/fetch_deps.cmake`, `linalg/cmake/version.cmake`
- Обсуждение с Alex: `MemoryBank/.architecture/CMake-GIT/Review_VariantA_Kodo_2026-04-18.md` секции ⮕ Ответы Кодо

---

## 📝 10. Changelog этого документа

| Дата | Изменение | Автор |
|------|-----------|-------|
| 2026-04-18 | Первая версия draft | Кодо |

*Следующий шаг: Alex ревью → ответы на Q1-Q6 → утверждение → декомпозиция Фазы 0 на таски в `MemoryBank/tasks/TASK_cmake_git_Phase0.md`*
