# Code Review: CMake-GIT архитектура + существующее решение Version/

> **Ревьюер**: Кодо | **Дата**: 2026-04-18  
> **Объём**: 6 планируемых документов + работающее решение `MemoryBank/.architecture/CMake/Version/` + update_dsp.py  
> **Методика**: Sequential thinking + сравнение с рабочим production-кодом в `linalg/cmake/`, `core/cmake/`, `spectrum/cmake/`

---

## 📋 Что прочитано

**Планируемая архитектура** (`MemoryBank/.architecture/CMake-GIT/`):
1. `1_MultiProject_Architecture.md` — 3 зоны, bare mirrors + FetchContent override
2. `2_Variants_Analysis.md` — 5 вариантов, рекомендация 1+5
3. `3_GPU_Architecture.md` — GPU ось в CMakePresets
4. `4_Workflow_Scenarios.md` — 3 сценария работы + тиражирование
5. `5_ReleaseRepo_Variant.md` — Вариант 7: живой release-репо
6. `6_Zone2_Access_Variants.md` — как Zone 2 тянет (A/B/C)
7. `Primer.md` — справочник по CMake паттернам
8. `Git_ALL.md` — справочник по multi-remote Git
9. `update_dsp.py` — Python-скрипт для автообновления

**Работающее решение** (`MemoryBank/.architecture/CMake/Version/`):
- `version.cmake` (205 строк) — git-aware генерация version.h/version.json с early return
- `CMakeLists.txt` (180 строк) — полный pipeline: project → build → test → package
- mini-пример: `main.cpp`, `mylib.cpp`, `test_version.cpp`

**Реальный production-код** (для сравнения):
- `linalg/cmake/version.cmake` — идентичен черновику из Version/
- `linalg/cmake/fetch_deps.cmake` — 8 функций `fetch_dsp_*`
- `linalg/CMakePresets.json` — debian-local-dev + ci пресеты

---

## 🔴 Критические проблемы

### CRIT-1 — version.cmake не детектирует изменения downstream deps

**Файл**: `linalg/cmake/version.cmake:28-35` (и идентичный в core/spectrum)

**Проблема**: `version.cmake` сравнивает только `git HEAD` **текущего** модуля. Когда Zone 2 делает `git -C deps/core pull && checkout v1.1.0`, у самого `deps/spectrum/` git HEAD не меняется. Значит `spectrum`'s version.cmake делает `return()` и `version.h` спектрума показывает старую версию. downstream бинарник спектрума собирается со старым core-кодом (через FetchContent) но с правильным `DSPSPECTRUM_VERSION_STRING` — рассинхрон.

**Воспроизведение**:
```bash
# В LocalProject (Zone 2):
git -C deps/core pull --tags
git -C deps/core checkout v1.1.0
cmake --build build/         # ← spectrum version.cmake: return(), но deps/core исходники новые
# → spectrum собирается с v1.1.0 core, но в version.h записана старая дата
```

**Фикс**: version.cmake для модуля M должен хешировать ТАКЖЕ git HEAD всех его deps:
```cmake
# В версии модуля M:
set(ALL_HASHES "${GIT_HASH_FULL}")
foreach(dep IN LISTS DSP_M_DEPS)
    execute_process(COMMAND ${GIT_EXECUTABLE} rev-parse HEAD
                    WORKING_DIRECTORY "${${dep}_SOURCE_DIR}"
                    OUTPUT_VARIABLE _dep_hash OUTPUT_STRIP_TRAILING_WHITESPACE)
    string(APPEND ALL_HASHES ":${_dep_hash}")
endforeach()
# сравнивать `.git_hash` с ALL_HASHES (хеш цепочки)
```

Или проще: записывать в `.git_hash` **конкатенацию** hash-ей всех FetchContent-модулей, не только свой.

---

### CRIT-2 — update_dsp.py: два бага

**Файл**: `update_dsp.py:152-156` и `265-266`

**Баг 1** — двойной `git checkout`:
```python
rc, err = run(["git", "checkout", latest_tag], cwd=repo_dir).returncode, ""
if rc != 0:
    res = run(["git", "checkout", latest_tag], cwd=repo_dir)  # ← запускает checkout ВТОРОЙ раз
    return {"status": "error", "repo": repo,
            "msg": f"checkout {latest_tag} failed:\n{res.stderr}"}
```
Первый вызов может **уже частично поменять состояние** (detached HEAD). Второй — повторяет на испорченном состоянии. Плюс: первый вызов не берёт stderr, второй — берёт. Бессмысленная архитектура.

**Фикс**:
```python
res = run(["git", "checkout", latest_tag], cwd=repo_dir)
if res.returncode != 0:
    return {"status": "error", "repo": repo,
            "msg": f"checkout {latest_tag} failed:\n{res.stderr}"}
_, sha = git("rev-parse", "--short", "HEAD", cwd=repo_dir)
```

**Баг 2** — двойной `git commit`:
```python
rc, _ = run(["git", "commit", "-m", f"bump: {bump}"]).returncode, ""
run(["git", "commit", "-m", f"bump: {bump}"])  # ← тот же коммит ВТОРОЙ раз!
```
Первый вызов делает коммит (если есть изменения). Второй — падает с `nothing to commit, working tree clean`, но ошибка не проверяется. Если git hook отвергает — первый уже сделал работу, второй ничего не ловит.

**Фикс**:
```python
res = run(["git", "commit", "-m", f"bump: {bump}"])
if res.returncode != 0:
    print(f"  ⚠️ commit failed: {res.stderr.strip()}")
    sys.exit(1)
```

---

### CRIT-3 — `GIT_SHALLOW TRUE` несовместим со сменой `GIT_TAG`

**Файл**: `linalg/cmake/fetch_deps.cmake:17` и предлагаемый `fetch_dsp_deps.cmake` в документах

```cmake
FetchContent_Declare(DspCore
    GIT_REPOSITORY https://github.com/dsp-gpu/core.git
    GIT_TAG        ${DSP_CORE_TAG}
    GIT_SHALLOW    TRUE        # ← ПРОБЛЕМА
    ...)
```

**Проблема**: `GIT_SHALLOW TRUE` = `--depth=1` при клонировании. Это сохраняет только ОДИН ref — тот самый тег, который указан. Когда пользователь меняет `DSP_CORE_TAG=v1.0.0` → `v1.1.0`, FetchContent пытается `git fetch origin v1.1.0`, но shallow-репа не знает про `v1.1.0` и fetch может провалиться (зависит от CMake версии и настроек сервера). Классический pitfall описан в CMake Issue 25341.

Особенно опасно при работе с bare mirror на SMI100 — там git тоже может не отдать tag shallow-клиенту.

**Фикс**: убрать `GIT_SHALLOW`. Либо (CMake 3.28+) использовать partial clone:
```cmake
# убрать GIT_SHALLOW, вместо него:
set(FETCHCONTENT_BASE_DIR ${CMAKE_BINARY_DIR}/_deps)
# полный клон, но маленький bandwidth первого раза:
FetchContent_Declare(DspCore
    GIT_REPOSITORY ...
    GIT_TAG v1.0.0
    # default полный клон — updates работают корректно
)
```

Для bare mirror на SMI100 это приемлемо — локальная сеть, traffic не критичен.

---

### CRIT-4 — Путь патча 2→1→0: нужны write-права Zone 2 на bare mirror

**Файл**: `4_Workflow_Scenarios.md:93-96`

```
git push origin fix/issue-42      ← уходит в SMI100/mirrors/core.git
```

**Проблема**: в архитектуре Zone 2 = изолированная "конечные пользователи". Дать им `write` на production bare mirror = ломается модель безопасности (они могут случайно запушить в `refs/heads/main`, перезаписать тег, etc.)

**Фикс** — один из трёх вариантов:

**Вариант 1** (рекомендую): отдельные `incoming/` bare-репы для патчей:
```
/srv/smi100/mirrors/core.git           ← read-only для Zone 2
/srv/smi100/incoming/core-patches.git  ← write для Zone 2, read для Alex
```
Zone 2 пушит только в `incoming/`. Alex на своём ПК:
```bash
git remote add smi100-patches ssh://smi100/srv/smi100/incoming/core-patches.git
git fetch smi100-patches
git cherry-pick <sha>  # в свой DSP-GPU/core
```

**Вариант 2**: push только в namespace `refs/heads/patches/*` через `update` hook на SMI100:
```bash
# pre-receive hook на SMI100/mirrors/core.git
#!/bin/bash
while read old new ref; do
    case "$ref" in
        refs/heads/patches/*) ;;       # OK
        *) echo "deny: $ref (only patches/*)"; exit 1 ;;
    esac
done
```

**Вариант 3**: patch-file workflow без git push:
```bash
# Zone 2:
git format-patch origin/main --stdout > /shared/patches/core-fix-42.patch
# Alex:
git am /shared/patches/core-fix-42.patch
```

Doc 4 даже не упоминает эту проблему. **Критично** описать до деплоя.

---

### CRIT-5 — Transitive deps: version conflict не валидируется

**Файл**: `5_ReleaseRepo_Variant.md:83-97` + общее

Каскад:
```cmake
# LocalProject:
FetchContent_Declare(dsp_spectrum GIT_TAG v1.2.0 ...)  # spectrum@1.2 зависит от core@1.3
FetchContent_Declare(dsp_core     GIT_TAG v1.0.0 ...)  # core@1.0 — принудительно
FetchContent_MakeAvailable(dsp_spectrum dsp_core)
```

"first declare wins" → победит **core@1.0**, но `spectrum@1.2` был протестирован с **core@1.3**. Runtime baddness: symbols mismatch, ABI break, silent corruption.

**Фикс**: `FIND_PACKAGE_ARGS NAMES dsp_core` уже в коде, но **не экспортируется минимальная версия** в `DspCoreConfig.cmake.in`. Нужно:

```cmake
# core/cmake/DspCoreConfig.cmake.in (новый файл):
@PACKAGE_INIT@
set(DspCore_VERSION "@PROJECT_VERSION@")
include("${CMAKE_CURRENT_LIST_DIR}/DspCoreTargets.cmake")
check_required_components(DspCore)
```

+ в LocalProject:
```cmake
FetchContent_Declare(dsp_core
    GIT_REPOSITORY ...
    GIT_TAG v1.0.0
    FIND_PACKAGE_ARGS 1.3.0 NAMES DspCore CONFIG)  # ← требуем >=1.3
```

Если `core@1.0` уже объявлен выше с `TAG v1.0.0`, CMake 3.24+ увидит несовпадение версии при find_package и (в зависимости от стратегии) — FAIL или warning. Без `FIND_PACKAGE_ARGS` с версией — тишина и скрытый баг.

---

## 🟡 Важные замечания

### WARN-1 — Нет единого manifest-а модулей (single source of truth)

Список модулей `{core, spectrum, stats, signal_generators, heterodyne, linalg, radar, strategies}` повторяется **минимум в 7 местах**:

1. `linalg/cmake/fetch_deps.cmake` — 8 `set(...)` + 8 функций
2. `3_GPU_Architecture.md` — `MIRROR_REPO_*` × 8 в пресете
3. `1_MultiProject_Architecture.md` — `dsp_declare(...)` × 8
4. `update_dsp.py` — `REPOS` dict × 8
5. `scripts/build_all_docs.sh` — массив `REPOS=(...)`
6. CLAUDE.md — таблица репо (в доке)
7. MemoryBank индексы

Добавить 9-й модуль = **7 правок**, легко забыть.

**Фикс**: один YAML/JSON manifest в workspace/dsp_modules.yaml:
```yaml
modules:
  core:           { deps: [], github: dsp-gpu/core }
  spectrum:       { deps: [core], github: dsp-gpu/spectrum }
  stats:          { deps: [core, spectrum], github: dsp-gpu/stats }
  linalg:         { deps: [core], github: dsp-gpu/linalg }
  heterodyne:     { deps: [core, spectrum, signal_generators] }
  ...
```

Генерировать из него:
- `fetch_deps.cmake` (через CMake json() reader — доступно CMake 3.19+)
- Python REPOS (json.load)
- Bash массивы (через yq)
- Mermaid диаграмму зависимостей

CMake 3.19+ умеет читать JSON:
```cmake
file(READ "${CMAKE_SOURCE_DIR}/../dsp_modules.json" _JSON)
string(JSON _COUNT LENGTH "${_JSON}" "modules")
math(EXPR _LAST "${_COUNT} - 1")
foreach(i RANGE 0 ${_LAST})
    string(JSON _mod MEMBER "${_JSON}" "modules" ${i})
    dsp_fetch_package(...)
endforeach()
```

---

### WARN-2 — Вариант 5/7 (dsp-release): размер репо растёт квадратично

`5_ReleaseRepo_Variant.md:229` признаёт "Репо растёт (каждый коммит = все исходники)".

**Расчёт**: 8 модулей × ~30 МБ исходники = 240 МБ/коммит. Год = 100 коммитов = **24 ГБ** git-репа. Zone 2 `git clone` станет непрактичным.

**Смягчение**:

**Вариант А** — использовать `git archive` вместо дублирования коммитов:
```bash
# prepare_release.sh:
TAG=v1.3.0
rm -rf dsp-release/*   # полная замена, не накопление
for mod in core spectrum linalg; do
    git --git-dir=/srv/mirrors/$mod.git archive $MOD_TAG | tar -x -C dsp-release/$mod/
done
git add -A && git commit --amend -m "release $TAG"  # amend предыдущий снимок
git tag -f latest && git tag $TAG
```

История dsp-release = только теги релизов, без накопления коммитов. Размер ~240 МБ всегда.

**Вариант Б** — Git LFS для больших бинарников (если будут):
```
dsp-release/.gitattributes:
    *.so filter=lfs diff=lfs merge=lfs -text
    *.a  filter=lfs diff=lfs merge=lfs -text
```

**Вариант В** — partial clone + sparse checkout в Zone 2:
```bash
git clone --filter=blob:none --no-checkout git@smi100:dsp-release.git
git sparse-checkout set core spectrum linalg  # только нужные модули
git checkout v1.3.0
```

---

### WARN-3 — GPU_BACKEND vs ветка main/nvidia: смешение понятий

`3_GPU_Architecture.md:28-32`:
```
GPU_BACKEND   HIP (AMD ROCm) | CPU (сервер без GPU)
GPU_ARCH      gfx1201 | gfx1100 | gfx906 | gfx900 | auto
ROCM_VERSION  7.2 | 6.x | 5.x
```

Нет `OPENCL` в списке `GPU_BACKEND`, но в Doc 3 строка 243 упоминает `GIT_BRANCH=opencl`, и в CLAUDE.md `nvidia` = OpenCL branch. Доки смешивают:
- **ветка** (`main` / `nvidia`) — это исходники, выбирается через FetchContent `GIT_TAG` или `GIT_BRANCH`
- **backend** (`HIP` / `OPENCL` / `CPU`) — это макросы/conditional compilation
- **арка** (`gfx1201` / `gfx1100`) — это параметр компилятора

**Фикс** — явно ввести таблицу:
```
Ветка      → GIT_BRANCH в FetchContent
GPU_BACKEND → #define / cmake if(), внутри одной ветки
GPU_ARCH    → -arch= для hipcc
```

И дать матрицу **валидных** комбинаций:
| Ветка | GPU_BACKEND | GPU_ARCH | Статус |
|-------|-------------|----------|--------|
| main | HIP | gfx1201 | ✅ prod |
| main | HIP | gfx1100 | ✅ prod |
| main | CPU | none | ✅ CI |
| nvidia | OPENCL | nvidia-sm70+ | ✅ prod |
| main | OPENCL | * | ❌ не собирается (нет .cl файлов) |

---

### WARN-4 — dsp-release версионирование не связано с модулями

`5_ReleaseRepo_Variant.md:179` — `git tag v1.3.0`. Но:
- `release v1.3.0` содержит `core=v1.2.0 + linalg=v1.1.0` — связь нигде не зафиксирована
- Через полгода Alex забудет какие модули были в `release v1.3.0`
- Zone 2 не сможет сказать "дай мне core=1.2.0" иначе как через release-тег

**Фикс**: 
1. `RELEASE_NOTES.md` в каждом релизе — автогенерация скриптом `prepare_release.sh`:
```markdown
# dsp-release v1.3.0 — 2026-04-18

## Modules included
| Module | Version | Commit |
|--------|---------|--------|
| core | v1.2.0 | a1b2c3d |
| linalg | v1.1.0 | e4f5a6b |

## Changes since v1.2.0
- core: fix FFT edge case (core@v1.1.5 → v1.2.0)
- linalg: new matmul kernel (linalg@v1.0.3 → v1.1.0)
```

2. `manifest.json` рядом с CMakeLists.txt, парсится из release-tag:
```json
{ "release": "v1.3.0", "modules": { "core": "v1.2.0", "linalg": "v1.1.0" } }
```

---

### WARN-5 — Дублирование version.cmake в 3+ репо

```
core/cmake/version.cmake      ← 205 строк
spectrum/cmake/version.cmake  ← идентично
linalg/cmake/version.cmake    ← идентично
(будет ещё 5 репо)
```

**Фикс варианты**:

**Вариант А** — вынести в отдельный репо `dsp-cmake-common.git`:
```cmake
# каждый модуль:
FetchContent_Declare(dsp_cmake_common
    GIT_REPOSITORY ... GIT_TAG v0.1.0)
FetchContent_MakeAvailable(dsp_cmake_common)
include(${dsp_cmake_common_SOURCE_DIR}/version.cmake)
```

**Вариант Б** — git subtree из workspace/cmake/:
```bash
cd core
git subtree add --prefix=cmake ../workspace/cmake main --squash
```

**Вариант В** — пока просто оставить копии, синхронизировать скриптом:
```bash
# sync_cmake.sh:
for repo in core spectrum stats ...; do
    cp workspace/cmake/version.cmake $repo/cmake/version.cmake
done
```

Сейчас (Фаза 3 завершена) — **Вариант В приемлем**. При 20+ модулях — обязательно А или Б.

---

### WARN-6 — Primer.md и Git_ALL.md = диалоги, не документация

**Проблема**: оба файла начинаются с "Отличный вопрос — это стандартная задача..." — это **прямо ответ AI из чата**. Не отредактировано в техдок. Смешивают "да/нет" обращения автору с описанием паттернов.

**Фикс**: переформатировать:
1. Убрать вводные реплики ("Отличный вопрос", "Хотите, сгенерю?")
2. Вынести Подход 5 (FIND_PACKAGE_ARGS) в `Reference_Patterns.md`
3. Git multi-remote — в `Reference_Git_Multiremote.md`
4. Из 6 основных доков ссылаться на них, не дублировать паттерны

---

### WARN-7 — Нет README / навигации по 6+ документам

`MemoryBank/.architecture/CMake-GIT/` содержит 8 MD-файлов и 1 py. Читатель приходящий "первый раз" — с чего начать? `1_` первое — ок, но где overview-diagram? Где "вот Вариант 5 — это основа, Вариант 7 — альтернатива"?

**Фикс** — создать `README.md`:
```markdown
# CMake-GIT architecture — DSP-GPU

## Quick start
1. Сначала читай `1_MultiProject_Architecture.md` — общая картина
2. Варианты сравниваются в `2_Variants_Analysis.md`
3. Выбранный подход: Вариант 1 + 5 (гибрид)
4. Альтернатива: Вариант 7 (Release Repo) — см. `5_ReleaseRepo_Variant.md`

## Reference
- `Reference_Patterns.md` — CMake паттерны (ex-Primer)
- `Reference_Git_Multiremote.md` — multi-remote (ex-Git_ALL)

## Scripts
- `update_dsp.py` — auto-update deps в LocalProject
```

---

## 🟢 Рекомендации / улучшения

### REC-1 — Использовать Dependency Provider (Primer Подход 4)

`Primer.md:208-243` описывает паттерн, но ни один доку не применяет. Это **идеально** для режима `from-submodules` (Вариант 1):

```cmake
# workspace/cmake/local_provider.cmake
set(_DSP_DEPS_MAP
  "dsp_core|${CMAKE_SOURCE_DIR}/../core"
  "dsp_spectrum|${CMAKE_SOURCE_DIR}/../spectrum"
  "dsp_linalg|${CMAKE_SOURCE_DIR}/../linalg"
  ...)

macro(dsp_local_provider METHOD DEP_NAME)
  if("${METHOD}" STREQUAL "FIND_PACKAGE")
    foreach(_entry IN LISTS _DSP_DEPS_MAP)
      string(REPLACE "|" ";" _parts "${_entry}")
      list(GET _parts 0 _name)
      list(GET _parts 1 _path)
      if("${DEP_NAME}" STREQUAL "${_name}" AND EXISTS "${_path}/CMakeLists.txt")
        add_subdirectory("${_path}" "${CMAKE_BINARY_DIR}/_deps/${_name}-build")
        set(${DEP_NAME}_FOUND TRUE)
        return()
      endif()
    endforeach()
  endif()
endmacro()

cmake_language(SET_DEPENDENCY_PROVIDER dsp_local_provider
               SUPPORTED_METHODS FIND_PACKAGE)
```

Затем в пресете:
```jsonc
{
  "name": "local-dev",
  "cacheVariables": {
    "CMAKE_PROJECT_TOP_LEVEL_INCLUDES": "${sourceDir}/../workspace/cmake/local_provider.cmake"
  }
}
```

Результат: тот же CMakeLists.txt работает и с FetchContent (CI/prod), и с соседними папками (dev). Без `FETCHCONTENT_SOURCE_DIR_*` на каждую зависимость.

---

### REC-2 — deps_state.json → автоматический экспорт в CMakePresets

`update_dsp.py` пишет `deps_state.json`. Сейчас оно идёт только для коммита. Можно использовать его **как источник тегов для CMake**:

```cmake
# LocalProject/CMakeLists.txt
if(EXISTS "${CMAKE_SOURCE_DIR}/deps_state.json")
    file(READ "${CMAKE_SOURCE_DIR}/deps_state.json" _STATE)
    string(JSON DSP_CORE_TAG GET "${_STATE}" "repos" "core" "tag")
    string(JSON DSP_SPECTRUM_TAG GET "${_STATE}" "repos" "spectrum" "tag")
endif()
```

Тогда смена тега через `update_dsp.py` → не надо править `CMakePresets.json`.

---

### REC-3 — `prepare_release.sh` через `git archive`

Для Варианта 7 (Release Repo) — не копировать файлы, а использовать `git archive`:

```bash
#!/usr/bin/env bash
# prepare_release.sh — ПК Alex → dsp-release
set -euo pipefail

MODULES_VERSIONS=(
    "core:v1.2.0"
    "linalg:v1.1.0"
)

DSP_ROOT="$HOME/DSP-GPU"
RELEASE="$HOME/dsp-release"

rm -rf "$RELEASE/modules"
mkdir -p "$RELEASE/modules"

NOTES="# Release $(date +%Y-%m-%d)\n\n## Modules\n\n"

for spec in "${MODULES_VERSIONS[@]}"; do
    mod="${spec%:*}"
    tag="${spec#*:}"
    mkdir -p "$RELEASE/modules/$mod"
    git -C "$DSP_ROOT/$mod" archive "$tag" | tar -x -C "$RELEASE/modules/$mod/"
    sha=$(git -C "$DSP_ROOT/$mod" rev-list -n1 "$tag")
    NOTES+="| $mod | $tag | \`${sha:0:7}\` |\n"
done

echo -e "$NOTES" > "$RELEASE/RELEASE_NOTES.md"

cd "$RELEASE"
git add -A
git commit -m "release: ${MODULES_VERSIONS[*]}"
git tag "release-$(date +%Y%m%d)"
```

- Zero fragmentation истории (пересоздаём содержимое каждый раз)
- `git archive` честно отражает tag — не зависит от состояния workspace
- `RELEASE_NOTES.md` автоматический

---

### REC-4 — CI smoke test "LocalProject"

В `github.com/dsp-gpu/workspace` добавить CI job:
```yaml
smoke-test-localproject:
  runs-on: ubuntu-latest
  steps:
    - name: Create fake LocalProject
      run: |
        mkdir -p /tmp/localproject/src
        cat > /tmp/localproject/CMakeLists.txt << 'EOF'
        cmake_minimum_required(VERSION 3.24)
        project(LocalProjectSmoke LANGUAGES CXX)
        include(FetchContent)
        FetchContent_Declare(DspCore GIT_REPOSITORY https://github.com/dsp-gpu/core.git GIT_TAG main)
        FetchContent_Declare(DspSpectrum GIT_REPOSITORY https://github.com/dsp-gpu/spectrum.git GIT_TAG main)
        FetchContent_MakeAvailable(DspCore DspSpectrum)
        add_executable(smoke src/main.cpp)
        target_link_libraries(smoke PRIVATE Dsp::Spectrum)
        EOF
        echo 'int main(){ return 0; }' > /tmp/localproject/src/main.cpp
    - name: Configure + build
      run: |
        cmake -S /tmp/localproject -B /tmp/lp-build -DGPU_BACKEND=CPU
        cmake --build /tmp/lp-build
```

Падение этого job = блокируем merge/tag. Защита от release со сломанной Config.cmake.

---

### REC-5 — Использовать `FetchContent_Declare(... SYSTEM)` (CMake 3.25+)

Текущий `fetch_deps.cmake` не использует `SYSTEM` флаг. Без него include из `_deps/` считаются проектными → компилятор кидает warnings на их код. Это больно при `-Wall -Wextra -Werror` в CI.

```cmake
FetchContent_Declare(${name}
    GIT_REPOSITORY ...
    GIT_TAG ...
    SYSTEM                         # ← добавить (CMake 3.25+)
    FIND_PACKAGE_ARGS NAMES ${name} CONFIG)
```

---

### REC-6 — `version.cmake` → добавить GIT_DIRTY + опционально BUILD_TIMESTAMP

Текущий `version.cmake` не хранит `GIT_DIRTY` (есть ли незакоммиченные изменения). `mylib.cpp` (в `Version/`) **использует** `GIT_IS_DIRTY`, но `version.cmake` не определяет. Тест сломается.

**Фикс в version.cmake**:
```cmake
execute_process(
    COMMAND ${GIT_EXECUTABLE} status --porcelain
    WORKING_DIRECTORY "${SRC_DIR}"
    OUTPUT_VARIABLE GIT_STATUS
    OUTPUT_STRIP_TRAILING_WHITESPACE
)
if(GIT_STATUS)
    set(GIT_DIRTY_FLAG 1)
    set(GIT_DIRTY "-dirty")
else()
    set(GIT_DIRTY_FLAG 0)
    set(GIT_DIRTY "")
endif()
```

И в file(WRITE version.h.tmp):
```
#define ${MODULE_PREFIX}_GIT_DIRTY       ${GIT_DIRTY_FLAG}
#define ${MODULE_PREFIX}_GIT_IS_DIRTY    (${GIT_DIRTY_FLAG} != 0)
```

**BUILD_TIMESTAMP**: в CLAUDE.md memory отмечено "Убери BUILD_TIMESTAMP". Согласна — timestamp ломает reproducible builds. Оставить только GIT_DATE (дата последнего коммита — детерминирована).

---

### REC-7 — Для Zone 2 запретить FetchContent выход наружу

Защита от случайного `git clone github.com/...` изнутри Zone 2:

```cmake
# LocalProject/CMakeLists.txt
if(DEFINED DSP_ZONE AND DSP_ZONE EQUAL 2)
    set(FETCHCONTENT_FULLY_DISCONNECTED ON)   # запрет любых загрузок
    set(FETCHCONTENT_SOURCE_DIR_DSP_CORE     "${CMAKE_SOURCE_DIR}/deps/core")
    set(FETCHCONTENT_SOURCE_DIR_DSP_SPECTRUM "${CMAKE_SOURCE_DIR}/deps/spectrum")
    # ...
endif()
```

В CMakePresets:
```jsonc
{
  "name": "zone2-offline",
  "cacheVariables": { "DSP_ZONE": "2" }
}
```

При попытке FetchContent скачать что-то неопределённое — упадёт чёткой ошибкой.

---

## 📊 Соответствие стандартам GPUWorkLib

| Стандарт | Статус | Комментарий |
|----------|--------|------------|
| `find_package(hip)` lowercase | ✅ | Не затронут этими доками |
| MODULE_PREFIX в version.h | ✅ | Уже применён в linalg/core/spectrum |
| CMakePresets как API | ✅ | Правильный подход, нужно расширить |
| FetchContent + FIND_PACKAGE_ARGS | ✅ | Уже в `fetch_deps.cmake` |
| copy_if_different для version | ✅ | Работает |
| Теги неизменны (v1.0.0) | ✅ | Учтено, политика в Doc 1/4 |
| Нет `if(WIN32)/if(UNIX)` гардов | ✅ | Main = Linux, консистентно |
| Secrets защищены | ⚠️ | Нет упоминания о SSH-ключах для smi100 |
| Нет BUILD_TIMESTAMP | ⚠️ | Version/ CMakeLists.txt использует — убрать |

---

## 🎯 Итоговая оценка и приоритеты

### Архитектура — **8/10**
- Зонная модель чистая
- Правильно разделены **ветка** (исходники) и **backend/arch** (компиляция)
- Есть альтернативы и компромиссы разобраны
- Не хватает overview-диаграммы и README для навигации

### CMake-механизмы — **7/10**
- FetchContent + FIND_PACKAGE_ARGS правильно выбран
- version.cmake отличная реализация (early-return + copy_if_different)
- НО: `GIT_SHALLOW TRUE` = bug waiting to happen
- НО: transitive deps не валидируются
- НО: dependency provider паттерн не использован

### Git flow — **6/10**
- Поток A/B/C в целом верен
- НО: патч 2→1→0 через write-доступ на production mirror — серьёзная дыра
- НО: race + двойной commit в update_dsp.py

### Безопасность/изоляция — **6/10**
- ZONE 2 — правильная концепция
- Нет upfront правил доступа к bare mirrors
- Нет `FETCHCONTENT_FULLY_DISCONNECTED` для Zone 2

---

## 📋 Рекомендуемый порядок правок

### Сразу (до deploy):
1. **CRIT-2**: Фикс двух багов в `update_dsp.py`
2. **CRIT-3**: Убрать `GIT_SHALLOW TRUE` из `fetch_deps.cmake`
3. **CRIT-4**: Написать Doc-7 `7_Patch_Flow_Security.md` с вариантами push-прав
4. **WARN-7**: Создать `README.md` с навигацией

### Перед первым Zone 2 deploy:
5. **CRIT-1**: Доработать `version.cmake` — хеш цепочки зависимостей
6. **CRIT-5**: Добавить `DspCoreConfig.cmake.in` с версией + FIND_PACKAGE_ARGS с версией
7. **REC-6**: GIT_DIRTY в version.cmake (либо убрать из mylib.cpp)
8. **REC-7**: FETCHCONTENT_FULLY_DISCONNECTED для Zone 2

### Дальше (когда >10 модулей):
9. **WARN-1**: Единый manifest (YAML → CMake + Python)
10. **REC-1**: Dependency Provider для local-dev режима
11. **WARN-5**: Вынести version.cmake в общий репо/subtree
12. **REC-4**: CI smoke test LocalProject

### Будущее:
13. **WARN-2**: Partial clone для dsp-release если выберем Вариант 7
14. **REC-3**: `prepare_release.sh` через git archive

---

## 💬 Резюме для Alex

Кодо прочитала всё — **план в целом правильный**, чего и ждала. Выбор Вариант 1 + Вариант 5 — элегантный.

**Но есть 5 критичных багов/дыр**, которые надо закрыть **до** первого деплоя на SMI100:
1. version.cmake не ловит изменения в deps — downstream не пересобирается
2. update_dsp.py — два явных бага (двойной checkout, двойной commit)
3. `GIT_SHALLOW TRUE` — времянка до первого tag change
4. Zone 2 → SMI100 путь патчей не защищён — дыра безопасности
5. Transitive version resolution не работает без Config.cmake

После фиксов — готово к экспериментальному деплою. Для промышленного — ещё нужен manifest, dependency provider и CI smoke-test.

Готова расписать каждый фикс в отдельном документе — скажи какой приоритетнее.

---

## 🔗 Источники

- CMake 3.24 release notes — `FIND_PACKAGE_ARGS` для FetchContent
- CMake Issue 25341 — GIT_SHALLOW + tag switch pitfall
- GitHub docs — Partial clones (`--filter=blob:none`)
- Existing DSP-GPU production code:
  - `linalg/cmake/version.cmake`, `core/cmake/version.cmake`, `spectrum/cmake/version.cmake` — идентичны
  - `linalg/cmake/fetch_deps.cmake` — 8 fetch функций
  - `linalg/CMakePresets.json` — минимальная конфигурация
- `MemoryBank/.architecture/CMake/Version/` — прототип-референс (CMakeLists.txt, version.cmake, main.cpp)

*Review by: Кодо | Sequential thinking: применено | Context7: не потребовался (анализ внутренней архитектуры, не новой библиотеки)*
