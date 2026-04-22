# Вариант A — финальный дизайн distribution pipeline

> **Автор**: Кодо + Alex | **Дата**: 2026-04-18
> **Объект**: `6_Zone2_Access_Variants.md` → раздел «Вариант A»
> **Референс**: существующий `linalg/cmake/fetch_deps.cmake`, `linalg/cmake/version.cmake`
> **Методика**: Sequential-thinking + Context7 (`/websites/cmake_cmake_help`) + web research

Документ консолидирует обсуждение: выкинут мусор итераций, оставлен только финальный дизайн, критичные пункты и рекомендации по следующему шагу.

---

## 🎯 Модель: два мира

```
┌──────────── Мир A: Публичная разработка ────────────┐
│  github.com/dsp-gpu/*  (10 репо, скоро 20+, потом 50+)│
│  • Полная история, MemoryBank, ~!Doc, служебное       │
│  • Alex разрабатывает и тестирует                     │
│  • Claude Code + AI работают здесь                    │
└───────────────────────┬─────────────────────────────┘
                        │  Alex ВРУЧНУЮ промотирует
                        │  только ПРОВЕРЕННЫЕ теги
                        ▼
┌──────────── Мир B: Закрытая дистрибуция ─────────────┐
│  E:\DSP-GPU\smi100_stats.git  ← отдельный local repo │
│  E:\DSP-GPU\smi100_core.git                          │
│  E:\DSP-GPU\smi100_spectrum.git  ...                 │
│  • Только рабочие теги (v1.0.0, v1.1.0, ...)         │
│  • НЕТ MemoryBank, ~!Doc, служебного                 │
└───────────────────────┬─────────────────────────────┘
                        │  git push по локальной сети
                        ▼
┌──────────── SMI100 (без интернета) ─────────────────┐
│  /srv/smi100/smi100_*.git   (полный набор)          │
│  SMI100 может сам собирать/тестировать (опционально)│
└───────────────────────┬─────────────────────────────┘
                        │  FetchContent по локальной сети
                        ▼
┌──────────── N × LocalProject ───────────────────────┐
│  clean build каждый раз (rm -rf build && cmake)     │
│  CMake при configure проверяет smi100_*.git         │
│  → перекачивает изменённое                          │
└──────────────────────────────────────────────────────┘
```

**Ключевое**: `smi100_*.git` — **не зеркала** github-репо. Это отдельные **release-only репо**, куда Alex вручную промотирует проверенные теги. История разработки туда не попадает.

---

## ✅ Что в Варианте A работает правильно

| # | Claim | Статус |
|---|-------|--------|
| 1 | Отдельный git на каждый модуль (smi100_*.git) | ✅ изоляция историй, масштабируется |
| 2 | Независимые версии модулей | ✅ `core@v1.5` живёт пока `linalg@v0.3` |
| 3 | `USE_DSP_*` переключатели для набора модулей | ✅ экономия build-time и disk |
| 4 | Один источник для N LocalProject-ов | ✅ нет дублирования в базе |
| 5 | Clean build в LP → нет inline-ABI мисматчей | ✅ compile errors ловят несовместимости |

---

## 🔑 Ответы на ключевые вопросы

### Back-compat (обратная совместимость) — что это

**API** (Application Programming Interface) = сигнатура функции в исходниках.
**Back-compat** = обещание не ломать эти сигнатуры между версиями.

Пример:
```cpp
// stats v1.0
float Average(float* data, int n);
```

- `stats v1.1`: **добавили** `Median()`, `Average()` не трогали → back-compat сохранена ✅
- `stats v2.0`: сигнатура `Average()` изменилась → back-compat сломана ❌ → старые пользователи **не соберутся**

**Два способа обеспечить back-compat**:

| Способ | Что это | Когда применять |
|--------|---------|----------------|
| **(a) Политика** | Договорились: `v1.x → v1.y` совместимы, breaking change только в `v1.x → v2.0` | ✅ Для 10-50 модулей хватает |
| **(b) ABI-CI** | Автомат сравнивает бинарники через `abidiff`, блок merge при break | Оверкилл при clean build: компилятор сам поймает несовместимости через compile-error |

**Рекомендация**: политика + semver. Для твоего проекта `write_basic_package_version_file` с `COMPATIBILITY SameMajorVersion` — **не защита от ABI-багов**, а UX-улучшение: пользователь вместо загадочной ошибки линкера получит чёткое сообщение на configure "DspCore 1.0 incompatible, нужно >=1.5".

### FetchContent или submodules — **FetchContent**

| Критерий | FetchContent | Submodules |
|---------|--------------|------------|
| Auto-check при cmake | ✅ с `GIT_REMOTE_UPDATE_STRATEGY CHECKOUT` | ❌ ручной `submodule update` |
| Read-only исходники | ✅ `build/_deps/` | ❌ `deps/` редактируется случайно |
| Чистота LP-репо | ✅ только свой код + CMake | ❌ `.gitmodules` |
| Совместимость clean build | ✅ `rm -rf build` чистит всё | ⚠️ submodules в репо, не в build/ |

Единственный плюс submodules — удобство правки "на месте". Решается отдельно (см. API-break workflow ниже).

---

## 🔄 API-break workflow — твой план + 3 нюанса

**Твой процесс (подтверждаю, принимаю)**:

```
1. LP_X обнаружил: нужно сломать API stats (добавить параметр / поменять сигнатуру)
2. LP_X создаёт ветку в smi100_stats.git: git checkout -b breaking/new_signature
3. LP_X пишет патч → push ветки на SMI100
4. Alex: git fetch → видит breaking/new_signature на SMI100
5. Alex переносит правки в github.com/dsp-gpu/stats
6. Alex тестирует локально в E:\DSP-GPU\stats
7. Alex ищет все модули которые использовали старый API (radar, strategies, ...)
8. Alex правит их → всё вместе тестирует
9. Alex ставит новые мажорные теги: stats@v2.0.0, и затронутые модули тоже
10. Alex промотирует в smi100_*.git → push на SMI100
11. LP_X обновляет deps_state.json → получает новые версии
12. Ветка breaking/new_signature сливается
```

Это **рабочий процесс**. Будет редко, но три вещи нужно решить **до** первого такого случая:

### Нюанс 1 — Как LP_X физически правит stats?

**Проблема**: FetchContent кладёт исходники в `build/_deps/dspstats-src/` — управляется CMake, правки **затираются** при следующем `cmake`.
## от Alex 
-- затираются давай разберемся !!
- что то исправили запустили собралось
- создают ветку пишут на гит и сразу пересылают на SMI100 
- типа звонят мне или я при старте получаю изменения из SMI100 и начинаю работать
- на LP_X - все версии старые CMake не срабвтывает не обновляется а когда обновиться все подхватиться
где у меня ошибка в логике?

### ⮕ Ответ Кодо: ошибки в логике **нет**, работает — просто есть нюанс удобства

Твой подход **рабочий**. Разберём что реально происходит по шагам:

**Вариант (А) — твой** — править прямо в `build/_deps/dspstats-src/`:

```bash
# LP_X:
cmake --preset zone2                    # FetchContent клонирует smi100_stats.git в build/_deps/dspstats-src/
cmake --build build/                    # всё собралось

# Нашли баг, правим прямо там (build/_deps/dspstats-src/ — это РЕАЛЬНЫЙ git working tree):
cd build/_deps/dspstats-src/
git checkout -b breaking/new_avg_signature
# правим код...
git commit -am "fix: Average needs weights"
git push origin breaking/new_avg_signature   # ← улетело на SMI100

# Проверяем сборку
cd ../../..
cmake --build build/                    # компилятор увидел изменённые .cpp → пересобрал → линкует → OK

# Звонят Alex / Alex делает git fetch → видит breaking/new_avg_signature на SMI100
```

**Это работает**. Почему:
- FetchContent делает **настоящий git clone**, не просто копию файлов. Значит `.git/` на месте, можно делать `git checkout`, `commit`, `push` как в любом git-репо.
- Компилятор (ninja/make) трекает изменения .cpp файлов — пересобирает без участия CMake.
- Ветка сохранена на SMI100 → **правки не потеряны**, даже если завтра LP_X сделает `rm -rf build`.

### Где НЮАНС (не ошибка) — завтра после clean build

Завтра LP_X делает:
```bash
rm -rf build
cmake --preset zone2        # <-- FetchContent клонирует заново из smi100_stats.git
cmake --build build/
```

В `build/_deps/dspstats-src/` **снова main** (дефолтный GIT_TAG), не breaking-ветка. Если LP_X хочет **продолжить** работать с breaking-веткой, ему надо:

```bash
# Переключить FetchContent на ветку:
cmake --preset zone2 -DDSP_STATS_TAG=breaking/new_avg_signature
# или записать в deps_state.json и использовать его
```

Это **работает**, но если правки идут в несколько заходов (день-два), приходится каждый раз руками указывать ветку. Забыл — начал работать с main → через час понял что правок нет → повторил правки вручную.

### Поэтому и предложила Вариант (Б) — dev-режим в отдельной папке

```bash
# LP_X настраивает один раз:
cd ..
git clone git@smi100.local:/srv/smi100/smi100_stats.git stats-dev
cd stats-dev && git checkout -b breaking/new_avg_signature

# Использует dev-preset:
cd ../LocalProject
cmake --preset zone2-dev-stats        # FETCHCONTENT_SOURCE_DIR_DSPSTATS=../stats-dev
cmake --build build/
# правит в ../stats-dev/, пересобирает LP сколько угодно раз

# Clean build не трогает ../stats-dev/:
rm -rf build && cmake --preset zone2-dev-stats && cmake --build build/
# правки живы, работа продолжается
```

### Сравнение двух вариантов

| Критерий | Вариант (А) — в build/_deps/ | Вариант (Б) — dev-режим |
|----------|------------------------------|------------------------|
| Работает ли технически | ✅ Да | ✅ Да |
| После `rm -rf build` | ⚠️ Правки в ветке на SMI100, но из локального workspace удалены | ✅ Правки в `../stats-dev/` живут |
| Продолжение работы завтра | ⚠️ Нужен `-DDSP_STATS_TAG=breaking/...` | ✅ Просто `cmake --preset zone2-dev-stats` |
| Видимость "я в dev-режиме" | ❌ Пользователь может забыть что правит deps | ✅ Явный preset `zone2-dev-stats` |
| Требует дополнительной папки | ❌ Нет | ⚠️ Да, `../stats-dev/` |
| Подходит для "разовой быстрой правки" | ✅ Отлично | 🔸 Избыточно |
| Подходит для "работать неделю над breaking change" | ❌ Неудобно | ✅ Удобно |

**Мой совет**: поддержать **оба**. Для быстрой правки — Вариант (А), для серьёзной разработки — Вариант (Б). Документировать оба в `Patch_Flow.md` для разработчиков LP.

### Итог — где была моя «ошибка в предыдущем ответе»

Я сказала "правки в build/_deps/ затираются". Это было **слишком категорично**. Корректно:
- Правки живут **пока не сделали `rm -rf build`** или `cmake --fresh`
- При clean build — файлы локально удаляются, но если были push в ветку на SMI100 — они там живы
- Повторное переключение на эту ветку требует `-DDSP_STATS_TAG=...` или deps_state.json

Твоя логика («пишут на git → пересылают на SMI100 → правки не теряются») — **правильная**. Просто dev-режим делает работу **более эргономичной** если правок будет много.

**Решение — dev-режим в пресете**:

```jsonc
// LocalProject/CMakePresets.json
{
  "name": "zone2",
  "cacheVariables": {
    "FETCHCONTENT_TRY_FIND_PACKAGE_MODE": "NEVER",
    "DSP_GIT_SERVER": "git@smi100.local:/srv/smi100"
  }
},
{
  "name": "zone2-dev-stats",
  "inherits": "zone2",
  "displayName": "Dev mode: править stats в ../stats-dev/",
  "cacheVariables": {
    "FETCHCONTENT_SOURCE_DIR_DSPSTATS": "${sourceDir}/../stats-dev"
  }
}
```

Workflow:
```bash
# LP_X клонирует stats отдельно рядом:
cd ..
git clone git@smi100.local:/srv/smi100/smi100_stats.git stats-dev
cd stats-dev
git checkout -b breaking/new_avg_signature
# правит код здесь

# LP сборка берёт исходники из ../stats-dev/:
cd ../LocalProject
cmake --preset zone2-dev-stats
cmake --build build/

# Когда правки готовы:
cd ../stats-dev
git commit -am "breaking: Average() needs weights param"
git push origin breaking/new_avg_signature
```

### Нюанс 2 — Атомарность промотирования затронутых модулей

Когда Alex промотирует новый `stats@v2.0`, **все** зависящие модули (radar, strategies — из графа зависимостей) должны быть промотированы **одновременно**. Иначе:

- LP тянет `stats@v2.0` (новый API)
- Transitive tянет `radar@v1.5` (зависит от stats → `first-declare-wins` даст stats@v2.0)
- `radar@v1.5` компилирован под **старый** API stats → **compile error** (внятный, но неожиданный для пользователя)

**Решение — sync-promotion скрипт**:

```bash
# promote_breaking_change.sh — генерируется из dsp_modules.json
# Промотирует все затронутые модули одним push-ом:

MODULES_TO_PROMOTE=(
    "stats:v2.0.0"
    "radar:v2.0.0"        # был v1.5 → новый мажор под новый stats API
    "strategies:v2.0.0"   # тоже затронут
)

for mod in "${MODULES_TO_PROMOTE[@]}"; do
    name="${mod%:*}"
    tag="${mod#*:}"
    # Push тега в local smi100_*.git
    git push "E:\DSP-GPU\smi100_${name}.git" "refs/tags/${tag}:refs/tags/${tag}"
    # Push на SMI100
    git -C "E:\DSP-GPU\smi100_${name}.git" push smi100 "refs/tags/${tag}"
done
echo "✅ Promoted: ${MODULES_TO_PROMOTE[*]}"
```

Список «кто зависит от stats» берётся из манифеста `dsp_modules.json` (CRIT-1 ниже).

### Нюанс 3 — Временное состояние LP_X пока Alex тестирует

Между шагами 3 и 10 твоего workflow LP_X работает на **breaking-ветке**, не на tag. Что в `deps_state.json`?

```json
{
  "repos": {
    "stats": {
      "ref": "breaking/new_avg_signature",
      "sha": "abc123def456",
      "note": "ВРЕМЕННО — ждём v2.0 от Alex"
    }
  }
}
```

CMake `GIT_TAG` принимает и SHA, и branch name — работает. Когда Alex выпускает `stats@v2.0.0`:
```bash
python update_dsp.py        # обновляет state до v2.0.0
rm -rf build && cmake --preset zone2
```

`update_dsp.py` уже поддерживает это (SHA/tag/branch) — просто документируем.

---

## 🔴 Что критично (4 пункта)

### CRIT-1 — Манифест модулей `dsp_modules.json`

Без единого источника правды добавление 9-го модуля = правка **7 мест**:
1. Создать `smi100_radar.git` на ПК
2. Push в SMI100
3. `cmake/fetch_deps.cmake`: `set(DSP_RADAR_TAG)` + функция
4. Каждый модуль использующий radar: вызов fetch_dsp_radar()
5. `update_dsp.py`: добавить в REPOS
6. `CMakePresets.json`: `USE_DSP_RADAR`
7. Compat matrix

При 20 модулях — час работы, легко забыть что-то.

**Решение** — один файл `E:\DSP-GPU\dsp_modules.json`:

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

Из него генерируются:
- `fetch_deps.cmake` (CMake 3.19+ умеет `string(JSON ...)`)
- `update_dsp.py` REPOS dict
- USE_DSP_* валидация зависимостей
- sync-promotion скрипт
- Mermaid диаграмма зависимостей

Добавить модуль = 1 правка манифеста + push → всё остальное автогенерируется.

### CRIT-2 — Config.cmake c версией (UX линкерных ошибок)

Transitive version conflict: если LP объявил `DspCore@v1.0`, а spectrum внутри требует v1.5+ — `first-declare-wins` даст v1.0 → линкер падает с загадочной ошибкой `undefined reference to NewFunc`.

**Решение** — 5 строк CMake:

```cmake
# core/CMakeLists.txt
include(CMakePackageConfigHelpers)
write_basic_package_version_file(
    "${CMAKE_CURRENT_BINARY_DIR}/DspCoreConfigVersion.cmake"
    VERSION ${PROJECT_VERSION}
    COMPATIBILITY SameMajorVersion
)
```

```cmake
# spectrum/cmake/fetch_deps.cmake
FetchContent_Declare(DspCore
    GIT_REPOSITORY ${DSP_GIT_SERVER}/smi100_core.git
    GIT_TAG ${DSP_CORE_TAG}
    FIND_PACKAGE_ARGS 1.5 NAMES DspCore CONFIG)  # ← требует >=1.5
```

Теперь при несовместимости на **configure-стадии** (до компиляции):
```
CMake Error: Could not find a configuration file for package "DspCore"
             that is compatible with requested version "1.5".
             The following file was considered but not accepted:
                .../DspCoreConfig.cmake, version: 1.0.0 (incompatible)
```

Не защита от runtime (у тебя clean build её не нужно), а **понятная ошибка пользователю**.

### HALF-CRIT-3 — Reproducibility через `deps_state.json`

Чтобы через полгода можно было пересобрать **именно** `LP-v1.0` с теми же версиями deps — нужно зафиксировать SHA в коммитуемом файле.

**Решение** — расширить `fetch_deps.cmake`:

```cmake
if(EXISTS "${CMAKE_SOURCE_DIR}/deps_state.json")
    file(READ "${CMAKE_SOURCE_DIR}/deps_state.json" _STATE)
    string(JSON _CORE_SHA ERROR_VARIABLE _err
           GET "${_STATE}" "repos" "core" "sha")
    if(NOT _err)
        set(DSP_CORE_TAG "${_CORE_SHA}" CACHE STRING "" FORCE)
    endif()
endif()
# fallback на main если state нет
if(NOT DEFINED DSP_CORE_TAG)
    set(DSP_CORE_TAG "main" CACHE STRING "Tag for DspCore")
endif()
```

Workflow:
- Dev: state-файл отсутствует → LP берёт `main` (свежий HEAD)
- Перед релизом LP: `python update_dsp.py` → SHA записан → `git commit deps_state.json`
- `git tag LP-v1.0` — через полгода `git checkout LP-v1.0` восстанавливает state → exact reproduction

Уже существует в `update_dsp.py` — надо только подключить к CMake.

### MINOR — `FETCHCONTENT_TRY_FIND_PACKAGE_MODE=NEVER` для Zone 2

Если на машине LocalProject случайно установлен системный пакет `libdsp-core-dev`, FetchContent его подхватит вместо SMI100.

Фикс — одна строка в пресете `zone2`:
```jsonc
"FETCHCONTENT_TRY_FIND_PACKAGE_MODE": "NEVER"
```

---

## 💡 Итоговый дизайн (код)

### Шаг 1 — Создание smi100_*.git (однажды)

```bash
cd E:\DSP-GPU\
for mod in core spectrum stats signal_generators heterodyne linalg radar strategies; do
    git init --bare "smi100_${mod}.git"
done
```

### Шаг 2 — Promotion скрипт

```bash
# E:\DSP-GPU\scripts\promote_to_smi100.sh
# Usage: ./promote_to_smi100.sh core v1.2.0
MODULE="$1"
TAG="$2"

cd "E:\DSP-GPU\$MODULE"
git rev-parse --verify "refs/tags/$TAG" >/dev/null || {
    echo "Tag $TAG does not exist in $MODULE"; exit 1; }

git push "E:\DSP-GPU\smi100_$MODULE.git" "refs/tags/$TAG:refs/tags/$TAG"
git -C "E:\DSP-GPU\smi100_$MODULE.git" push smi100 "refs/tags/$TAG"
echo "✅ Promoted: $MODULE @ $TAG → smi100"
```

### Шаг 3 — LocalProject CMakeLists.txt (просто)

```cmake
cmake_minimum_required(VERSION 3.24)
project(LocalProject_A LANGUAGES CXX)

include(cmake/fetch_dsp_deps.cmake)
fetch_dsp_core()
fetch_dsp_spectrum()     # автоматом подтянет core как транзитивную

add_executable(myapp src/main.cpp)
target_link_libraries(myapp PRIVATE Dsp::Core Dsp::Spectrum)
```

### Шаг 4 — `fetch_dsp_deps.cmake` (расширенный)

```cmake
include_guard(GLOBAL)
include(FetchContent)

set(DSP_GIT_SERVER "git@smi100.local:/srv/smi100" CACHE STRING "SMI100 git server")

# Читаем deps_state.json для reproducibility
if(EXISTS "${CMAKE_SOURCE_DIR}/deps_state.json")
    file(READ "${CMAKE_SOURCE_DIR}/deps_state.json" _DSP_STATE)
else()
    set(_DSP_STATE "{}")
endif()

function(_dsp_get_ref MOD_NAME OUT_VAR)
    string(JSON _sha ERROR_VARIABLE _err GET "${_DSP_STATE}" "repos" "${MOD_NAME}" "sha")
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

# Генерируется из dsp_modules.json (CRIT-1):
function(fetch_dsp_core)
    _dsp_fetch_one(DspCore core 1.0)
endfunction()

function(fetch_dsp_spectrum)
    fetch_dsp_core()                              # транзитивная явно
    _dsp_fetch_one(DspSpectrum spectrum 1.0)
endfunction()
# ... остальные 6 функций по шаблону
```

### Шаг 5 — Пресет LP

```jsonc
{
  "version": 6,
  "configurePresets": [
    {
      "name": "zone2",
      "displayName": "Zone 2 (production)",
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
      "displayName": "Dev: править stats в ../stats-dev/",
      "cacheVariables": {
        "FETCHCONTENT_SOURCE_DIR_DSPSTATS": "${sourceDir}/../stats-dev"
      }
    }
  ]
}
```

### Ежедневный workflow LP

```bash
python update_dsp.py --dry-run        # что изменилось на SMI100?
python update_dsp.py                  # обновить deps_state.json + commit
rm -rf build
cmake --preset zone2
cmake --build build -j
```

---

## 📎 Что обсудим следующим шагом

**A.** Дизайн OK — идём писать манифест `dsp_modules.json` и генератор (CRIT-1). Без этого дальше двигаться неудобно.

**B.** Мини-прототип локально: 1 LocalProject + 2 модуля (core + spectrum) через `smi100_*.git` **на твоём ПК** (без реального SMI100), проверить что механика FetchContent + deps_state.json + dev-mode работает. 2-3 часа работы, понятно где узкие места до деплоя.

**C.** Сразу переписать `6_Zone2_Access_Variants.md` под финальную модель (ссылается на этот файл как источник дизайна).

На каком остановимся?

---

## 🔗 Источники

- [CMake FetchContent docs](https://cmake.org/cmake/help/latest/module/FetchContent.html) — Context7 `/websites/cmake_cmake_help`
- [CMake ExternalProject GIT_TAG guidance](https://cmake.org/cmake/help/latest/module/ExternalProject.html) — про hash vs branch
- [CMake write_basic_package_version_file](https://cmake.org/cmake/help/latest/module/CMakePackageConfigHelpers.html) — COMPATIBILITY SameMajorVersion
- [Red Hat — libabigail ABI check tutorial](https://developers.redhat.com/blog/2020/04/02/how-to-write-an-abi-compliance-checker-using-libabigail) — для справки, не внедряем
- [CPM Issue #263 — GIT_TAG branch auto-update](https://github.com/cpm-cmake/CPM.cmake/issues/263) — поведение CMake с branch
- [ROCm/TheRock — ROCm multi-module build](https://github.com/ROCm/TheRock)
- Существующий prod-код: `linalg/cmake/fetch_deps.cmake`, `linalg/cmake/version.cmake`

*Clean version: Кодо | Context7 + Sequential thinking + Web research | Дата: 2026-04-18*
