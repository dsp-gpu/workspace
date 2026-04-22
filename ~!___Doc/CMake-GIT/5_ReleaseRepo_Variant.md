# Вариант 7: Release Repo — живой релизный репозиторий

> **Статус**: ✅ BASE v1.0
> **Дата**: 2026-04-18 | **Основа**: `1_` → `4_`

---

## 💡 Концепция

Вместо 8 bare-зеркал — **один живой репо** (`dsp-release`), который Alex
ведёт как отдельный продукт. Каждый коммит = атомарный релиз с набором
проверенных версий модулей. SMI100 его хранит. LocalProject_N из него живут.

```
[DSP-GPU / 8 репо на GitHub]
          │
          │ Alex вручную компонует релиз
          │ (выбирает модули + версии + тег)
          ▼
[dsp-release.git]  ← НОВЫЙ репо (живёт на ПК Alex)
          │
          │ git push (локальная сеть, ПК Alex → SMI100)
          ▼
[SMI100 / dsp-release.git]   ← единственный репо на SMI100
          │
          │ FetchContent (GIT_TAG v1.2.0)
          ├──▶ LocalProject_A
          ├──▶ LocalProject_B
          └──▶ LocalProject_N
```

---

## 🗂️ Структура dsp-release

```
dsp-release/
├── CMakeLists.txt          ← мастер-сборка: add_subdirectory всех включённых
├── CMakePresets.json       ← USE_DSP_* + GPU presets (копируется в LocalProject)
├── cmake/
│   └── version.cmake       ← уже есть в ~!Doc/CMake/Version/ — переиспользуем
├── core/                   ← исходники @ конкретный коммит из DSP-GPU/core
├── spectrum/               ← исходники @ конкретный коммит из DSP-GPU/spectrum
├── linalg/
├── stats/
│   ...                     ← только нужные модули, остальные не добавляем
└── RELEASE_NOTES.md        ← что вошло, что изменилось
```

Каждый коммит в `dsp-release` = одна версия. Тег = точка входа для FetchContent.

---

## ⚙️ Как работает CMake (без Python-скрипта)

### Ключевой механизм: FIND_PACKAGE_ARGS + каскад (из Primer.md Подход 5)

```cmake
# spectrum/CMakeLists.txt (на SMI100 в release repo)
include(FetchContent)
FetchContent_Declare(
    dsp_core
    GIT_REPOSITORY git@smi100.local:core.git
    GIT_TAG        stable             # ← плавающий тег
    GIT_SHALLOW    TRUE
    FIND_PACKAGE_ARGS NAMES dsp_core  # ← CMake 3.24+: version resolution
)
FetchContent_MakeAvailable(dsp_core)
```

```cmake
# LocalProject/CMakeLists.txt — Zone 2 объявляет ТОЛЬКО нужное
cmake_minimum_required(VERSION 3.24)
project(LocalProject0 LANGUAGES CXX)
include(FetchContent)

FetchContent_Declare(
    dsp_spectrum
    GIT_REPOSITORY git@smi100.local:spectrum.git
    GIT_TAG        stable
    GIT_SHALLOW    TRUE
    FIND_PACKAGE_ARGS NAMES dsp_spectrum
)
# dsp_core НЕ объявляем — CMake подтянет его сам через spectrum's CMakeLists.txt
FetchContent_MakeAvailable(dsp_spectrum)

add_executable(myapp src/main.cpp)
target_link_libraries(myapp PRIVATE dsp::spectrum)
```

**Каскад зависимостей (автоматически)**:
```
Zone 2: FetchContent(dsp_spectrum)
    └─▶ spectrum/CMakeLists.txt: FetchContent(dsp_core)
            └─▶ core подтягивается автоматически
                "first declare wins" — нет дублирования
```

### LocalProject/CMakePresets.json

```jsonc
{
  "version": 6,
  "configurePresets": [
    {
      "name": "base",
      "hidden": true,
      "cacheVariables": {
        "DSP_RELEASE_SERVER": "git@smi100.local:dsp-release.git",
        "DSP_TAG": "v1.2.0"
      }
    },
    {
      "name": "default",
      "displayName": "Сборка из SMI100",
      "inherits": "base"
    },
    {
      "name": "cached",
      "displayName": "Уже скачано (после первого cmake)",
      "inherits": "base",
      "cacheVariables": {
        "FETCHCONTENT_SOURCE_DIR_DSP_RELEASE": "${sourceDir}/../dsp-release"
      }
    },
    {
      "name": "gpu-rdna3",
      "displayName": "Сборка + AMD gfx1100",
      "inherits": "default",
      "cacheVariables": { "GPU_ARCH": "gfx1100" }
    }
  ]
}
```

### Когда Zone 2 получает обновление

```
STAMP-файл: build/_deps/dsp_spectrum-subbuild/CMakeFiles/dsp_spectrum-complete

Сценарий 1 — Плавающий тег (GIT_TAG stable):
  Alex двигает тег: git tag -f stable HEAD && git push smi100 --force stable
  Zone 2: cmake --fresh --preset default  ← stamp сброшен → re-fetch всего
  Пересборка только изменившихся файлов (cmake отслеживает)

Сценарий 2 — Версионный тег (GIT_TAG v1.3.0):
  Пользователь меняет одну строку: "DSP_TAG": "v1.3.0" в CMakePresets.json
  cmake --preset default  ← stamp видит новый тег → re-fetch
  Пересборка изменившихся

Сценарий 3 — Без изменений:
  cmake --preset default  ← stamp актуален → zero network, zero rebuild
```

**Вывод**: `cmake --fresh` = "дай мне последнее что есть на SMI100". Один флаг вместо Python-скрипта для ручного обновления.

---

## 🔄 Потоки данных

### ПОТОК A: Новый релиз (Alex)

```
ШАГ 1 — Разработка в DSP-GPU (обычная работа):
  E:\DSP-GPU\core\  →  git commit + tag v1.2.0
  E:\DSP-GPU\linalg\ → git commit + tag v1.1.0
  git push → github.com/dsp-gpu  (как всегда)

ШАГ 2 — Подготовка релиза dsp-release (на ПК Alex):
  cd E:\dsp-release\
  # Обновляем нужные модули — просто копируем исходники:
  robocopy E:\DSP-GPU\core\src     dsp-release\core\src     /MIR
  robocopy E:\DSP-GPU\linalg\src   dsp-release\linalg\src   /MIR
  robocopy E:\DSP-GPU\core\include dsp-release\core\include /MIR
  # ... (или скрипт prepare_release.sh)

  git add -A
  git commit -m "release: core v1.2.0 + linalg v1.1.0"
  git tag v1.3.0
  git push smi100 main --tags   ← по локальной сети → SMI100

ШАГ 3 — LocalProject сам подхватит при следующем cmake:
  # Пользователь меняет DSP_TAG=v1.3.0 в своём CMakePresets.json
  # cmake --preset default  → FetchContent видит новый тег → re-fetch
  # cmake --build build     → пересборка только изменившихся файлов
```

### ПОТОК B: Патч из Zone 2 → Zone 0

```
ШАГ 1 — Разработчик Zone 2 правит прямо в файлах:
  # Файлы лежат обычно в build/_deps/dsp_release-src/core/
  # или если использует пресет "cached" — в ../dsp-release/core/
  cd ../dsp-release
  git checkout -b fix/issue-42
  # редактирует core/src/fft.cpp напрямую
  git commit -m "fix: fft edge case"
  git push git@smi100.local:dsp-release.git fix/issue-42

ШАГ 2 — Alex видит ветку на SMI100 (со своего ПК):
  cd E:\dsp-release
  git fetch smi100
  git checkout fix/issue-42
  # смотрит изменения — они В ОДНОМ МЕСТЕ, всё наглядно

ШАГ 3 — Alex переносит fix в DSP-GPU proper (если нужно):
  cd E:\DSP-GPU\core
  git cherry-pick <commit-sha>    ← конкретный коммит из dsp-release
  git push origin fix/issue-42   ← на github.com/dsp-gpu → PR → merge

ШАГ 4 — Alex публикует новый релиз dsp-release с fix-ом:
  cd E:\dsp-release
  git merge fix/issue-42
  git tag v1.3.1
  git push smi100 main --tags
```

---

## 📊 Анализ +/−

| ✅ Плюсы | ❌ Минусы |
|----------|----------|
| **Один репо** — проще чем 8 зеркал | dsp-release ≠ DSP-GPU: две отдельные истории |
| Zone 2: один `git clone`, нет submodules | Каждый релиз Alex собирает вручную |
| CMake FetchContent — без Python-скрипта | При обновлении тега нужно изменить пресет |
| Патчи из Zone 2 видны напрямую у Alex | Cherry-pick fix-а в DSP-GPU — ручная работа |
| SMI100: один репо вместо 8 bare | Репо растёт (каждый коммит = все исходники) |
| Alex полностью контролирует что в релизе | Если Alex занят — релиза нет, Zone 2 ждёт |
| `RELEASE_NOTES.md` = документация сама собой | — |
| GPU пресеты в одном месте (dsp-release) | — |

---

## ⚖️ Сравнение с Вариантом 1 (bare mirrors + submodules)

```
                     Вариант 1                 Вариант 7 (Release Repo)
─────────────────────────────────────────────────────────────────────
SMI100 держит:       8 bare repos              1 release repo
Синхронизация:       push_to_smi100.py         Alex вручную + push
Zone 2 clone:        + submodules (сложнее)    один clone (проще)
Автообновление:      update_dsp.py             смена DSP_TAG (1 строка)
Патч из Zone 2:      через relay branches      прямо в dsp-release
Контроль версий:     по репо независимо        все вместе (атомарно)
Растущий размер:     нет (bare = delta)        да (каждый commit = все файлы)
Изоляция истории:    чистая (8 отдельных)      смешанная (всё в одном)
```

---

## 🎯 Когда выбирать этот вариант

**Release Repo лучше** если:
- Zone 2 — конечные пользователи (не разработчики DSP-GPU)
- Важна простота развёртывания (один clone → cmake → build)
- Alex хочет полный контроль над каждым релизом
- Патчи из Zone 2 — редко, но должны быть видны

**Вариант 1 лучше** если:
- Zone 2 = разработчики, которым нужна полная история каждого модуля
- Обновления частые и нужна автоматика
- Размер репо критичен
- Нужна независимая версионность каждого модуля

---

## 📋 Следующие шаги для этого варианта

| # | Шаг |
|---|-----|
| 1 | Создать `dsp-release` репо на ПК Alex |
| 2 | Написать `prepare_release.sh` — копирует исходники из DSP-GPU |
| 3 | Написать `CMakeLists.txt` мастер-сборки для dsp-release |
| 4 | Написать `push_release_to_smi100.sh` |
| 5 | Тест: LocalProject клонирует + cmake + build |

---

*Created: 2026-04-18 | Version: BASE v1.0 | Author: Кодо + Alex*
