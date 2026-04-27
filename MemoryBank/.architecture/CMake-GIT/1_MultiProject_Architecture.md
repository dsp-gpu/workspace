# Multi-Project Architecture: DSP-GPU ↔ SMI100 ↔ LocalProject

> **Статус**: ✅ BASE v1.0  
> **Дата**: 2026-04-18 | **Участники**: Alex + Кодо

---

## 🗺️ Схема архитектуры

```
╔══════════════════════════════════════════════════════════════════╗
║  ЗОНА 0 — Публичная (интернет + AI)                              ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │  Project 0: DSP-GPU                                     │   ║
║   │  • git: github.com/dsp-gpu/*  (публичный)               │   ║
║   │  • Claude Code / AI — есть доступ                       │   ║
║   │  • Разработка, ревью, теги: v1.0.0 ...                  │   ║
║   └──────────────────────┬──────────────────────────────────┘   ║
╚═════════════════════════ │ ══════════════════════════════════════╝
                           │  (ПК Alex = мост: GitHub + локальная сеть)
╔══════════════════════════▼═══════════════════════════════════════╗
║  ЗОНА 1 — Транзитная (локальная сеть предприятия / сервер)       ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │  Project 1: SMI100                                      │   ║
║   │  • bare git repos в директории (mirrors/)               │   ║
║   │  • получает push от ПК Alex по локальной сети           │   ║
║   │  • НЕТ выхода в интернет — только локальная сеть        │   ║
║   │  • принимает патчи из 2, Alex пробрасывает в 0          │   ║
║   └──────────────┬────────────────────────────────┬─────────┘   ║
╚════════════════  │  ══════════════════════════════ │ ════════════╝
                   │  (локальная сеть ПК ↔ сервер)   │
╔══════════════════▼═════════════════════════════════▼════════════╗
║  ЗОНА 2 — Изолированная (соседняя директория или клиент сети)    ║
║   ┌─────────────────────────────────────────────────────────┐   ║
║   │  Project 2: LocalProject0 / LocalProject_N              │   ║
║   │  • получает всё только из SMI100                        │   ║
║   │  • git clone → ОБЯЗАТЕЛЬНО тянет зависимости из 1       │   ║
║   │  • конечный пользователь работает здесь                 │   ║
║   └─────────────────────────────────────────────────────────┘   ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## 🔄 Потоки данных

```
ПОТОК A: Production push (0 → 1 → 2)
  ПК Alex (DSP-GPU)      SMI100                  LocalProject
  git tag v1.0.0         
  git push → GitHub      
  git push → smi100 ──▶ mirrors/core @ v1.0.0 ──▶ submodule update
  (локальная сеть)        (принял push, хранит)


ПОТОК B: Patch/Fix (2 → 1 → 0)
  LocalProject           SMI100                  DSP-GPU
  fix/issue-42   ──▶    relay branch      ──▶   PR → merge → новый тег


ПОТОК C: Clone конечного пользователя
  git clone --recurse-submodules git@smi100.local:LocalProject0.git
       └──▶ submodules из SMI100/mirrors/ подтягиваются автоматически
  cmake --preset from-submodules
       └──▶ FETCHCONTENT_SOURCE_DIR = локальный submodule checkout → zero network
```

---

## ✅ Выбранный подход: Гибрид (Submodules + FetchContent override)

### Структура директорий на SMI100

```
/srv/smi100/
├── mirrors/                      ← bare git repos (зеркала из DSP-GPU)
│   ├── core.git
│   ├── spectrum.git
│   ├── linalg.git
│   └── ...
├── projects/
│   └── LocalProject0.git         ← основной проект (bare, для clone)
└── push_to_smi100.sh             ← скрипт на ПК Alex: git push → SMI100 по локальной сети
```

### Структура LocalProject после clone

```
LocalProject0/                    ← git clone --recurse-submodules
├── CMakeLists.txt
├── CMakePresets.json             ← переключатели USE_DSP_*
├── cmake/
│   └── fetch_dsp_deps.cmake      ← шаблонный cmake (один include)
├── src/
│   └── main.cpp
└── deps/                         ← submodule checkouts (auto)
    ├── core/                     ← → SMI100/mirrors/core.git @ v1.0.0
    ├── spectrum/                 ← → SMI100/mirrors/spectrum.git @ v1.0.0
    └── linalg/                   ← → SMI100/mirrors/linalg.git @ v1.0.0
```

---

## 🎛️ CMakePresets.json

### Project 1 (SMI100): переключатели зеркалирования

```jsonc
// SMI100/CMakePresets.json
{
  "version": 6,
  "configurePresets": [
    {
      "name": "base",
      "hidden": true,
      "cacheVariables": {
        "DSP_MIRROR_TAG": "v1.0.0"
      }
    },
    {
      "name": "mirror-full",
      "displayName": "Зеркалить все 8 репо DSP-GPU",
      "inherits": "base",
      "cacheVariables": {
        "MIRROR_REPO_CORE":       "ON",
        "MIRROR_REPO_SPECTRUM":   "ON",
        "MIRROR_REPO_STATS":      "ON",
        "MIRROR_REPO_LINALG":     "ON",
        "MIRROR_REPO_RADAR":      "ON",
        "MIRROR_REPO_SIG_GEN":    "ON",
        "MIRROR_REPO_HETERO":     "ON",
        "MIRROR_REPO_STRATEGIES": "ON"
      }
    },
    {
      "name": "mirror-minimal",
      "displayName": "Только core + spectrum + linalg",
      "inherits": "mirror-full",
      "cacheVariables": {
        "MIRROR_REPO_STATS":      "OFF",
        "MIRROR_REPO_RADAR":      "OFF",
        "MIRROR_REPO_SIG_GEN":    "OFF",
        "MIRROR_REPO_HETERO":     "OFF",
        "MIRROR_REPO_STRATEGIES": "OFF"
      }
    }
  ]
}
```

### Project 2 (LocalProject): переключатели зависимостей

```jsonc
// LocalProject0/CMakePresets.json
{
  "version": 6,
  "configurePresets": [
    {
      "name": "base",
      "hidden": true,
      "cacheVariables": {
        "DSP_GIT_SERVER": "git@smi100.local:mirrors",
        "DSP_TAG":        "v1.0.0"
      }
    },
    {
      "name": "full",
      "displayName": "Все зависимости из SMI100",
      "inherits": "base",
      "cacheVariables": {
        "USE_DSP_CORE":     "ON",
        "USE_DSP_SPECTRUM": "ON",
        "USE_DSP_LINALG":   "ON",
        "USE_DSP_RADAR":    "ON",
        "USE_DSP_STATS":    "ON"
      }
    },
    {
      "name": "minimal",
      "displayName": "core + linalg",
      "inherits": "base",
      "cacheVariables": {
        "USE_DSP_CORE":     "ON",
        "USE_DSP_SPECTRUM": "OFF",
        "USE_DSP_LINALG":   "ON",
        "USE_DSP_RADAR":    "OFF",
        "USE_DSP_STATS":    "OFF"
      }
    },
    {
      "name": "from-submodules",
      "displayName": "После clone --recurse-submodules (zero network)",
      "inherits": "full",
      "cacheVariables": {
        "FETCHCONTENT_SOURCE_DIR_DSP_CORE":     "${sourceDir}/deps/core",
        "FETCHCONTENT_SOURCE_DIR_DSP_SPECTRUM": "${sourceDir}/deps/spectrum",
        "FETCHCONTENT_SOURCE_DIR_DSP_LINALG":   "${sourceDir}/deps/linalg",
        "FETCHCONTENT_SOURCE_DIR_DSP_RADAR":    "${sourceDir}/deps/radar",
        "FETCHCONTENT_SOURCE_DIR_DSP_STATS":    "${sourceDir}/deps/stats"
      }
    }
  ]
}
```

---

## 📄 Шаблонный cmake/fetch_dsp_deps.cmake

```cmake
# cmake/fetch_dsp_deps.cmake
# Один include — подключает только включённые USE_DSP_* зависимости.
# DSP_GIT_SERVER и DSP_TAG задаются через CMakePresets.json.

include(FetchContent)

if(NOT DEFINED DSP_GIT_SERVER)
    set(DSP_GIT_SERVER "git@smi100.local:mirrors")
endif()
if(NOT DEFINED DSP_TAG)
    set(DSP_TAG "v1.0.0")
endif()

macro(dsp_declare NAME)
    string(TOUPPER "${NAME}" _U)
    if(USE_DSP_${_U})
        FetchContent_Declare(
            dsp_${NAME}
            GIT_REPOSITORY "${DSP_GIT_SERVER}/${NAME}.git"
            GIT_TAG        "${DSP_TAG}"
            GIT_SHALLOW    TRUE          # только нужный тег, без истории
            GIT_SUBMODULES ""            # не тянуть вложенные
            FIND_PACKAGE_ARGS            # CMake 3.24+: сначала find_package,
              NAMES dsp_${NAME}          # потом git clone — каскад зависимостей
        )
        list(APPEND _DSP_ACTIVE "dsp_${NAME}")
        message(STATUS "[DSP] + ${NAME} @ ${DSP_TAG}")
    else()
        message(STATUS "[DSP]   ${NAME} — off")
    endif()
endmacro()

# ВАЖНО: Zone 2 может объявить только верхний модуль (например dsp_spectrum).
# Если spectrum/CMakeLists.txt сам объявляет FetchContent для dsp_core —
# core подтянется АВТОМАТИЧЕСКИ как транзитивная зависимость.
# "first declare wins": если dsp_core уже объявлен выше — дублирования нет.

dsp_declare(core)
dsp_declare(spectrum)
dsp_declare(stats)
dsp_declare(linalg)
dsp_declare(radar)
dsp_declare(signal_generators)
dsp_declare(heterodyne)
dsp_declare(strategies)

if(_DSP_ACTIVE)
    FetchContent_MakeAvailable(${_DSP_ACTIVE})
endif()
```

---

## ⚡ "Только когда изменилось" — механизм

**FetchContent stamp-файлы** (встроено в CMake):
```
build/_deps/dsp_core-subbuild/CMakeFiles/dsp_core-complete  ← STAMP
```
- Первый `cmake --preset ...` → клонирует из SMI100 по тегу → создаёт stamp
- Повторный `cmake ...` с тем же тегом → stamp есть → **ноль сетевых запросов**
- Изменили `DSP_TAG` → stamp устарел → перетягивает только изменившиеся репо

**Пресет `from-submodules`** (после `git clone --recurse-submodules`):
- `FETCHCONTENT_SOURCE_DIR_DSP_*` = локальный путь `deps/`
- FetchContent видит локальный путь → **вообще не обращается к сети**

**version.cmake** (уже реализован в `MemoryBank/.architecture/CMake/Version/`):
- Паттерн `git rev-parse HEAD` → сравнение с `.git_hash` → `return()` если совпало
- `copy_if_different` → zero rebuild если содержимое не изменилось
- Переиспользуем в sync-скрипте на SMI100

---

## 📋 Следующие шаги (модификации)

| # | Шаг | Файл |
|---|-----|------|
| 2 | sync_mirrors.sh для SMI100 | `2_sync_mirrors.md` |
| 3 | .gitmodules + git flow патчей (2→1→0) | `3_git_flow.md` |
| 4 | Полный CMakeLists.txt для LocalProject | `4_localproject_cmake.md` |
| 5 | Прототип / тест | `5_prototype.md` |

---

*Created: 2026-04-18 | Version: BASE v1.0 | Author: Кодо + Alex*
