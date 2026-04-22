# DSP-GPU: распределённая сборка модулей через закрытый SMI100

> **Статус**: 🟡 STRUCTURE DRAFT — этап 0 (оглавление + тезисы + file layout)
> **Дата**: 2026-04-19 | **Авторы**: Кодо + Alex
> **Аудитория**: разработчики DSP-GPU (in the know) + коллеги LocalProject-команд (могут не владеть терминологией git/CMake)
> **Основа**:
> - `~!Doc/CMake-GIT/Variants_Report_2026-04-18.md` (V1-V11 + сводная)
> - `MemoryBank/specs/cmake_git_distribution_spec_2026-04-18.md` (V8, текущий выбор)
> - `MemoryBank/specs/cmake_git_aware_build.md` v2 (Layer 1/2, zero-rebuild, в проде)
> - `~!Doc/CMake-GIT/Review_VariantA_Kodo_2026-04-18.md` (детальный разбор)

---

## 🎯 0. Что это за документ и зачем он нужен

Один документ, который **без лишнего шума** объясняет, как код из публичного GitHub доходит до закрытых `LocalProject`-ов (далее **LP**) через промежуточный сервер **SMI100** — причём читается:

- ✅ **инженером DSP-GPU** — как справочник по дизайну и file layout;
- ✅ **новым LP-разработчиком** — как вводный курс без требования знать bare-репо, FetchContent и промотирование;
- ✅ **ревьюером/смежником** — как обзор альтернатив и обоснование выбора V8.

**Не заменяет**:
- spec `cmake_git_distribution_spec_2026-04-18.md` (детальная техника, фазы, DoD)
- `Variants_Report_2026-04-18.md` (полный каталог V1-V11 с +/−)

**Дополняет**: даёт человеческое объяснение, единый file layout, bidirectional схемы потоков и сравнение «для чайников».

---

## 🗺 1. Карта местности в одной картинке (TL;DR)

```
         ┌────────── ИНТЕРНЕТ ──────────┐
         │                              │
         │      github.com/dsp-gpu/*    │     ← Zone 0 публичная разработка
         │       (10 репо, public)      │       • Alex + AI работают здесь
         └──────────────┬───────────────┘       • MemoryBank, ~!Doc живут тут
                        │
                        │  🧑‍🔧 Alex ВРУЧНУЮ:
                        │     promote_to_smi100.sh <mod> <tag>
                        ▼
         ┌─── ПК Alex (Windows, E:\DSP-GPU\) ─┐  ← мост между зонами
         │  smi100_*.git (release-only bare)  │    • только проверенные теги
         └──────────────┬─────────────────────┘    • ЛОКАЛЬНАЯ СЕТЬ ↓
                        │
                        │  🌐 git push по LAN (нет интернета у SMI100)
                        ▼
         ┌────────── SMI100 (Debian) ──────────┐  ← Zone 1 транзит
         │  /srv/smi100/smi100_*.git           │    • read для LP
         │  /srv/smi100/incoming/*.git         │    • write для patches
         └──────────────┬──────────────────────┘
                        │
                        │  🔄 cmake configure сам проверяет SMI100 и обновляет vendor/
                        │  📤 patches push в incoming/ (LAN, редко)
                        ▼
         ┌───── Zone 2 — N × LocalProject ─────┐
         │  LP_A, LP_B, … LP_N                 │  ← живые серверы команд
         │  vendor/ + deps_state.json @ git    │    • обновления при КАЖДОЙ сборке
         │  git clone = полный комплект        │    • перед переносом — test + build
         └─────────────────────────────────────┘     • клон содержит всё для сборки
```

**Три ключевых слова** (запомнить сразу):

| Термин | Одной строкой |
|--------|---------------|
| **Zone 0** | публичный GitHub + ПК Alex — здесь рождается код |
| **Zone 1** | SMI100 — «склад» проверенных релизов, раздаёт по LAN |
| **Zone 2** | LP — потребители, собирают из LAN, не знают про интернет |

---

## 🧒 2. Словарик — термины простыми словами

> _Placeholder этапа 0._ На следующей итерации раскроем каждый термин короткой бытовой аналогией (3-5 строк по варианту Q2=б из обсуждения).

Планируемый список (тезисно):

- **git** / **bare репо** / **рабочая копия (working tree)**
- **tag** / **branch** / **SHA** / **detached HEAD**
- **submodule** vs **FetchContent** vs **vendored**
- **git bundle** / **git archive** / **tarball**
- **promotion** (промотирование) / **mirror**
- **clean build** / **incremental build** / **reconfigure**
- **Layer 1** (version.cmake) / **Layer 2** (CMAKE_CONFIGURE_DEPENDS)
- **deps_state.json** / **manifest** / **Config.cmake**
- **R-normal** / **R-offline** / **R-patches**

Каждая запись будет в формате:
> **Название** *(для инженера)* — строгое определение.
> *(для чайника)* — аналогия из быта: «это как каталог книг в библиотеке, без самих книг».

---

## 🏛 3. Три зоны — ГДЕ ЧТО ЛЕЖИТ (главный раздел этапа 0)

Это самая важная часть для текущего этапа — чтобы **не промахнуться с именами и расположением** до того, как нарастим контент.

### 3.1 Zone 0 — ПК Alex + публичный GitHub

**GitHub (интернет)**:
```
github.com/dsp-gpu/
├── workspace       ← корень: CLAUDE.md, MemoryBank/, .vscode/, dsp_modules.json, scripts/
├── core
├── spectrum
├── stats
├── signal_generators
├── heterodyne
├── linalg
├── radar
├── strategies
└── DSP             ← мета-репо (Python/, Doc/)
```

**Локально на ПК Alex** (`Windows E:\DSP-GPU\` = `~/DSP-GPU/`):
```
E:\DSP-GPU\                                ← workspace git (github.com/dsp-gpu/workspace)
│
├── CLAUDE.md                              ← инструкции для Кодо
├── DSP-GPU.code-workspace                 ← multi-folder VSCode
├── dsp_modules.json                       ← 🆕 SSOT манифест модулей (Фаза 0)
│
├── MemoryBank/                            ← specs/tasks/changelog (НЕ уходит в Zone 1)
├── ~!Doc/                                 ← проектные доки (НЕ уходит в Zone 1)
├── .vscode/ / .claude/                    ← служебное (НЕ уходит в Zone 1)
│
├── scripts/                               ← 🆕 автоматизация (Фаза 0-5)
│   ├── init_smi100_repos.sh
│   ├── promote_to_smi100.sh
│   ├── promote_breaking_change.sh
│   ├── generate_cmake_deps.py
│   ├── topo_sort.py
│   ├── update_dsp.py                      ← перенести из ~!Doc/CMake-GIT/
│   └── freeze_for_transfer.sh             ← 🆕 опционально для R-offline
│
├── core/                   ┐
├── spectrum/               │
├── stats/                  │
├── signal_generators/      │  ← LIVE dev checkouts, отдельные git-репо
├── heterodyne/             │     (github.com/dsp-gpu/<name>)
├── linalg/                 │
├── radar/                  │
├── strategies/             │
├── DSP/                    ┘
│
├── smi100_core.git/        ┐
├── smi100_spectrum.git/    │
├── smi100_stats.git/       │
├── smi100_signal_generators.git/   ← RELEASE-ONLY bare репо
├── smi100_heterodyne.git/  │     (parallel к public, НЕ зеркала)
├── smi100_linalg.git/      │       • только теги v*.*.*
├── smi100_radar.git/       │       • история разработки НЕ попадает
└── smi100_strategies.git/  ┘
```

**Ключевые правила Zone 0**:
1. `smi100_*.git` — это **bare** (без рабочего дерева), **только теги**, создаются один раз через `init_smi100_repos.sh`.
2. Промотирование теги ↔ bare: только через `scripts/promote_to_smi100.sh <module> <tag>` — **ничего руками не трогаем**.
3. `MemoryBank/`, `~!Doc/`, служебное — **не уезжают** в Zone 1 (IP + attack surface).
4. Workspace-репо (`github.com/dsp-gpu/workspace`) содержит **только** управляющие данные, не исходники.

---

### 3.2 Zone 1 — SMI100 (Debian, локальная сеть)

```
/srv/smi100/                                 ← владелец: gitsrv, доступ: SSH + git-shell
│
├── smi100_core.git/              ┐
├── smi100_spectrum.git/          │
├── smi100_stats.git/             │   ← RELEASE-ONLY зеркала из Zone 0
├── smi100_signal_generators.git/ │      • read  для LP-users
├── smi100_heterodyne.git/        │      • write ТОЛЬКО для Alex
├── smi100_linalg.git/            │      • pre-receive hook: запрет push не в refs/tags/*
├── smi100_radar.git/             │
└── smi100_strategies.git/        ┘
│
├── incoming/                                ← 🆕 для patch-flow (редко)
│   ├── core.git/                 ┐
│   ├── spectrum.git/             │   ← PATCHES репо
│   ├── stats.git/                │      • write для LP-users (свои branch)
│   └── ...                       ┘      • read для Alex
│
├── portable/                                ← 🆕 опциональное (R-offline, V11)
│   ├── LX_A-v1.0.0.tar.gz                     • snapshot-архивы для
│   ├── LX_B-v1.0.0.tar.gz                       изолированных клиентов
│   └── checksums.sha256                         (без SMI100 и интернета)
│
└── .ssh/
    └── authorized_keys                      ← command="git-shell" для
                                                Alex + каждого LP-user
```

**Ключевые правила Zone 1**:
1. Всё только в `/srv/smi100/`, отдельный system-user `gitsrv`, shell = `git-shell` (никакого interactive SSH).
2. Read/write разделены: основные `smi100_*.git` — read-only для LP, `incoming/*.git` — write-enabled.
3. Нет интернета, нет GitHub remote — исходники **только** от Alex-а (LAN push).
4. Опционально: toolchain (ROCm/HIP + CMake) для самостоятельной валидации на сервере.
5. Backup: `git bundle create ... --all` каждую ночь → страховка на случай смерти диска (M4 из Variants_Report).

---

### 3.3 Zone 2 — LocalProject (LP_x)

```
~/LP_x/                                      ← собственный git-репо команды
│
├── CMakeLists.txt                           ← использует fetch_deps.cmake из v2
├── CMakePresets.json                        ← zone2 (prod) + zone2-dev-* (overlay)
│
├── deps_state.json                          ← 🆕 SHA зафиксированных версий
│                                                (коммитится в git LP → reproducibility)
│
├── src/
├── include/
├── tests/
│
├── cmake/                                   ← локальный cmake-код LP
│   └── fetch_deps.cmake                     ← сгенерированный из dsp_modules.json
│
├── vendor/                                  ← ✅ ОСНОВНОЕ (в git LP_x)
│   ├── core/                                    • ПОЛНАЯ копия исходников всех
│   ├── spectrum/                                  используемых модулей
│   ├── stats/                                   • коммитится в git LP_x
│   └── ...                                      • CMake configure САМ проверяет
│                                                  SMI100 и обновляет vendor/
│                                                  (через FetchContent с
│                                                   GIT_REMOTE_UPDATE_STRATEGY
│                                                   CHECKOUT и локальным кешем)
│                                                • git clone LP_x даёт всё сразу
│                                                • см. §4.3 — модель обновления
│
└── build/                                   ← transient, НЕ в git
    ├── _deps/                               ← build/-объекты зависимостей
    │   ├── dspcore-build/                      (исходники берутся из vendor/)
    │   ├── dspspectrum-build/
    │   └── ...
    └── ... (объектники, бинарник)
```

**Рядом с LP_x (опционально, dev-overlay для правок)**:
```
~/                                           ← или любая родительская папка
├── LP_x/                                    (основной проект)
│
├── core-dev/                                ← 🔧 dev checkout модуля
├── spectrum-dev/                               • clone из SMI100 или github
└── stats-dev/                                  • Layer 2 ловит git pull
                                                • preset zone2-dev-<mod>
                                                  переживает rm -rf build
```

> ⚠️ **Важно (уточнение от Alex, 2026-04-19)**: `vendor/` — это **не опциональная** папка для
> редких R-offline случаев, а **основной механизм хранения исходников зависимостей** в LP_x.
> В клоне LP_x **всегда** должны быть все файлы для сборки (см. §4.3). `build/_deps/` в
> таком режиме либо отсутствует, либо получает источники из локального `vendor/`.

### 🧒 Ключевые правила Zone 2 — подробно, для тех кто первый раз

#### 1. Clean build каждый раз — «сборка с нуля по команде»

**Что**: перед сборкой целиком удаляется папка `build/`, CMake запускается с нуля (`rm -rf build && cmake --fresh --preset zone2 && cmake --build build`).

**Бытовая аналогия**: представь, что ты каждый раз перед приготовлением блюда моешь всю кухню и раскладываешь ингредиенты заново. Долго? Да. Зато **гарантированно нет** вчерашних остатков, которые дадут странный вкус.

**Зачем так жёстко**: один забытый старый `.o` файл со старого кода → «у меня же не собирается», «почему в логах старая версия?» → часы отладки. Политика DSP-GPU: **стабильность через детерминизм**. Сломалось — `rm -rf build` и всё на своих местах. Это политика Alex, не обсуждается.

---

#### 2. `deps_state.json` — «паспорт сборки» в git

**Что**: файл в корне LP_x, который фиксирует какая **точно** версия каждой зависимости используется: SHA коммита, тег, дата.

**Пример содержимого**:
```json
{
  "updated": "2026-04-19T10:00:00Z",
  "repos": {
    "core":     { "sha": "abc123...", "tag": "v1.2.0" },
    "spectrum": { "sha": "fed456...", "tag": "v1.1.0" }
  }
}
```

**Бытовая аналогия**: это как этикетка на банке консервов — тут написано, из какой партии ингредиенты. Если клиент пришёл с жалобой «консерва испортилась» — по этикетке вы найдёте точно ту партию и проверите.

**Зачем**: через полгода LP-клиент пишет «у меня баг» — вы делаете `git checkout LP_x-v0.1 && rm -rf build && cmake --build` и получаете **bit-identical** сборку (с точностью до timestamps). Это называется **reproducibility** и это одно из жёстких требований проекта (R4).

**Как меняется**: CMake при configure **сам** сравнивает версии в `vendor/` с тегами на SMI100 и обновляет `deps_state.json` вместе с исходниками. Можно также вручную зафиксировать через `scripts/update_dsp.py --pin core v1.3.0` (если нужна «заморозка»). Файл коммитится в git LP_x — **это обязательно**, иначе repro не работает.

---

#### 3. `build/_deps/` — «склад временных полуфабрикатов, руками не трогать»

**Что**: папка внутри `build/`, куда CMake распаковывает исходники зависимостей (если используется режим через SMI100, а не vendor/).

**Бытовая аналогия**: это как контейнер «грязной посуды» в посудомойке. Можно туда заглянуть, можно понять что там лежит, но **мыть руками и возвращать на стол** нельзя — всё равно смоет при следующем цикле.

**Правило**: `build/_deps/` — **read-only зона для тебя**. Следующий `rm -rf build` всё снесёт → твои правки пропадут.

**Если надо править модуль** (например, нашёл баг в stats, хочешь быстро проверить исправление):
- 🚫 НЕ редактируй в `build/_deps/dspstats-src/`
- ✅ Сделай dev-overlay (правило 4) — правки переживут `rm -rf build`

---

#### 4. Dev-overlay (`../stats-dev/`) — «черновой стол рядом с основной кухней»

**Что**: клонируешь нужный модуль **рядом** с LP_x (например, в `../stats-dev/`), правишь там, тестируешь. CMakePreset `zone2-dev-stats` говорит CMake: «вместо того чтобы брать stats из SMI100/vendor, возьми его из `../stats-dev/`».

**Бытовая аналогия**: основная кухня (LP_x) работает, ты в это же время сбоку поставил столик (`../stats-dev/`), где пробуешь новый рецепт. Готово — несёшь на основную кухню.

**Когда применять**:
- ✅ Нашёл баг в stats, хочешь серьёзно пофиксить (не 10-минутная правка)
- ✅ Делаешь breaking change в API модуля, нужно параллельно править и LP_x и stats
- ✅ Подписан на long-running задачу по модулю

**Когда НЕ нужно**:
- ❌ Обычная сборка LP_x — dev-overlay не используется
- ❌ Одноразовое «проверить гипотезу» — проще просто write/read в вопроса

**Магия v2 спеки**: `git pull` в `../stats-dev/` → `cmake --build build` **автоматически** реконфигурируется (Layer 2 сторожит `.git/index`). Не надо каждый раз вспоминать «надо CMake перезапустить».

**Patch flow**: когда правки в `../stats-dev/` готовы — push на `smi100/incoming/stats.git`, Alex забирает (см. §4.2).

---

#### 5. `vendor/` — «полная библиотека в клоне LP_x, всегда свежая после сборки»

**Что**: папка **внутри LP_x** (в git!), в которой лежат **полные исходники всех зависимостей**. Размер: 100-500 МБ в зависимости от набора модулей.

**Бытовая аналогия**: представь, что LP_x — это домашняя лаборатория, а `vendor/` — её собственная библиотека справочников. Можно открыть `vendor/core/`, почитать код `core`, прямо там. Не нужно ни в какую внешнюю библиотеку ходить. Библиотекарь (CMake) **сам** смотрит в центральный архив (SMI100) каждый раз, когда ты приходишь работать — если там появилась новая редакция справочника, тут же приносит её на твою полку. Ты даже не заметил, что он на секунду сходил в архив.

**Зачем она нужна**:
1. **`git clone LP_x`** = получил **полный** рабочий комплект. Никаких «настрой SSH ключ к SMI100», никаких отдельных первых запусков с сетью.
2. **Воспроизводимость навсегда**: папка `vendor/` + `deps_state.json` в git → через 5 лет клонируешь → собираешь → получаешь точно ту же сборку.
3. **Перенос на флешку / другой ПК**: `git clone` напрямую забирает всё что нужно (потому что перед коммитом LP_x всегда собирался и тестировался — см. правило ниже).

**Когда обновляется** — ключевой момент:
- ✅ **Автоматически при `cmake --preset zone2 ...`** — CMake через `execute_process` вызывает `scripts/update_dsp.py --mode lp-refresh`, скрипт идёт на SMI100 по LAN, сравнивает теги, и **если на SMI100 что-то новее** → обновляет `vendor/<mod>/` и `deps_state.json`. Подробнее — §4.3, раздел «Две альтернативы реализации refresh».
- ✅ Специальной команды «обновить руками» **не нужно** — обновление встроено в обычный цикл сборки.
- 🟡 **Заморозка** (pin): для release candidate / стабилизации. `scripts/update_dsp.py --pin core v1.2.0` явно фиксирует версию, пока не снимут pin. Подробнее — §4.3, раздел «🧊 Pin — заморозка версий deps».

**Правило переноса на другой ПК (Alex, 2026-04-19)**:
> Перед `git clone LP_x` на флешку / на изолированный ПК **всегда** проводится цикл:
> 1. `cmake --preset zone2 && cmake --build build` — configure автоматически
>    обновит `vendor/` и `deps_state.json` из SMI100
> 2. прогон тестов → зелёный свет
> 3. `git add vendor/ deps_state.json && git commit -m "sync before transfer"`
> 4. только теперь `git clone` → на флешке / на новом ПК всё есть.

**Сборка не трогает сеть после того как vendor/ актуален**: `cmake --build` — чистая компиляция. Сетевой запрос был только на этапе configure (и только к SMI100, никакого интернета).

**Если SMI100 недоступен во время configure** — CMake работает по `vendor/` как есть (fallback режим): старая сборка пройдёт, новых версий не увидит до восстановления LAN.

---

## 🔄 4. Потоки данных — bidirectional схемы

Показываем движение **в обе стороны** + боковой snapshot-поток. Это продолжение пункта Q3=в.

### 4.1 Code flow — основной (вниз)

```
   Zone 0 GitHub (public)            Zone 0 ПК Alex                    Zone 1 SMI100                 Zone 2 LP_x
                                                                                                   
   ┌─────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐    ┌──────────────────────┐
   │ github.com/         │      │ E:\DSP-GPU\          │      │ /srv/smi100/         │    │ LP_x/                │
   │   dsp-gpu/stats     │      │   stats/  (live)     │      │   smi100_stats.git   │    │   build/_deps/       │
   │   tag v1.2.0 ●──────┼──┐   │   smi100_stats.git ●─┼──┐   │   tag v1.2.0 ●───────┼──┐ │     stats-src/       │
   └─────────────────────┘  │   └──────────────────────┘  │   └──────────────────────┘  │ └──────────────────────┘
                            │          ▲                  │                             │           ▲
                            │          │                  │                             │           │
              git clone/pull│          │                  │                             │           │ FetchContent
                            │          │ promote_to_      │          git push smi100    │           │ GIT_REMOTE_
                            ▼          │  smi100.sh       ▼            (LAN, SSH)       ▼           │  UPDATE_STRATEGY
                        (Alex dev)     │              (local bare)                  (server bare)   │    CHECKOUT
                                       │                                                            │
                                       └──────── ручной trigger Alex-ом ────────────────────────────┘
```

**Читается как**: тег рождается в `github.com/dsp-gpu/stats`, Alex тянет в `E:\DSP-GPU\stats\`, тестирует, **вручную** промотирует в `E:\DSP-GPU\smi100_stats.git` (local bare), пушит в `/srv/smi100/smi100_stats.git` по LAN, LP через FetchContent клонирует в `build/_deps/stats-src`.

---

### 4.2 Patch flow — обратный (вверх, редко)

> 🆕 **Обновлено под vendor-модель (2026-04-19)**: правки идут из **dev-overlay** (`../stats-dev/`), не из `build/_deps/*` и не из `vendor/stats/` напрямую. `vendor/` — read-only снимок, его нельзя коммитить с «патчем модуля» — там должен быть чистый релизный код SMI100.

```
   Zone 2 LP_x обнаружил баг в stats        Zone 1 SMI100 incoming/        Zone 0 ПК Alex              Zone 0 GitHub
                                                                                                   
   ┌──────────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐    ┌──────────────────────┐
   │ 1. git clone smi100/     │     │ /srv/smi100/         │     │ E:\DSP-GPU\stats\    │    │ github.com/          │
   │    smi100_stats.git      │     │   incoming/          │     │   (live dev repo)    │    │     dsp-gpu/stats    │
   │    → ../stats-dev/       │     │   stats.git          │     │                      │    │     new tag v1.3.0 ● │
   │                          │     │                      │     │   git fetch from     │    │                      │
   │ 2. cmake --preset        │     │                      │     │   smi100/incoming    │    └──────────┬───────────┘
   │    zone2-dev-stats       │     │                      │     │                      │               │
   │    (Layer 2 ловит git)   │     │                      │     │   5. merge/rebase в  │               │
   │                          │     │                      │     │      main, тест      │               │
   │ 3. git checkout -b       │     │                      │     │                      │               │
   │    breaking/sig-fix      │     │                      │     │   6. git tag v1.3.0  │               │
   │    → правим → тест       │     │                      │     │      git push github │───────────────┘
   │                          │     │                      │     │                      │
   │ 4. git push smi100-in    │     │   branch breaking/●──┼────►│   7. promote_to_     │
   │    breaking/sig-fix  ●───┼────►│         sig-fix      │     │      smi100.sh       │
   └──────────────────────────┘     └──────────────────────┘     │      stats v1.3.0 ●──┘
         ▲                                                       └──────────┬───────────┘
         │ 8. обычный cmake configure на LP_x:                              │
         │    update_dsp.py увидит v1.3.0 на smi100_stats.git               │
         │    → обновит vendor/stats/ → deps_state.json → commit            │
         └──────────────────────────────────────────────────────────────────┘
```

**Читается как**:
1. Инженер LP_x клонирует `smi100_stats.git` как **dev-overlay** в `../stats-dev/`
2. Переключает LP_x на `zone2-dev-stats` preset — CMake берёт stats из `../stats-dev/`, Layer 2 из v2 ловит git pull автоматически
3. Правит, тестирует на пайплайне LP_x, делает коммит в отдельную ветку `breaking/sig-fix`
4. Пушит ветку в `smi100/incoming/stats.git` (LP-user имеет write туда)
5. Alex забирает fetch-ем, мерджит/ребейзит в свой `E:\DSP-GPU\stats\`, тестит
6. Alex делает новый тег `v1.3.0` → push в public github
7. Alex промотирует `promote_to_smi100.sh stats v1.3.0` → тег попадает на `smi100_stats.git`
8. На следующем `cmake configure` у LP_x → `update_dsp.py` автоматически подтянет `v1.3.0` в `vendor/stats/` → commit → LP_x получил свой фикс через обычный workflow

**Ключевые отличия от прошлой модели (`build/_deps/` как источник правок)**:
- ✅ Правки живут в `../stats-dev/` — **переживают `rm -rf build`**
- ✅ `vendor/stats/` остаётся «витринным» — никогда не коммитим туда локальные правки
- ✅ Layer 2 из v2 спеки работает автоматически (git pull в stats-dev → CMake reconfigure)
- ✅ Обратный путь LP_x ← v1.3.0 идёт через **обычный refresh-цикл**, никаких особых `--pin`

---

### 4.3 Configure-time refresh + git clone transfer — основной режим работы

> ⚠️ **Уточнение от Alex (2026-04-19, round 2)**: раздел переписан во второй раз. Первый мой вариант (`update_dsp.py --sync` как отдельный шаг / cron) — **был неправильный**. Правильная модель ниже.
>
> Технически это **V9 (vendored) + FetchContent с GIT_REMOTE_UPDATE_STRATEGY CHECKOUT**, где `vendor/` выступает **постоянным кешем исходников в git**, а refresh встроен прямо в `cmake configure`.
>
> До финального утверждения — обновим `cmake_git_distribution_spec_2026-04-18.md` этим разделом.

---

**Основной принцип** в трёх строках:

> 🔄 **При каждом `cmake configure` автоматически идёт refresh vendor/** из SMI100 по LAN.
> 🏗 **Сборка дальше — локально** из `vendor/`, сеть не нужна.
> 📦 **`git clone LP_x` даёт полный комплект** — потому что `vendor/` в git, а перед коммитом LP_x всегда собирается+тестируется (значит `vendor/` уже свежий).

---

### ⚙️ Две альтернативы реализации refresh (оба варианта рабочие)

Механика «CMake configure → refresh vendor/» может быть реализована двумя способами. Решение Alex (2026-04-19): **реализуем (B), (A) оставляем в документе с +/− как альтернативу на будущее**.

---

#### 🅰️ Вариант A — Pure CMake FetchContent

CMake сам через `FetchContent_Declare(... GIT_REPOSITORY ssh://smi100 ... GIT_REMOTE_UPDATE_STRATEGY CHECKOUT)` ходит в SMI100 на этапе configure и обновляет `vendor/`.

```cmake
# CMakeLists.txt (LP_x) — вариант A
FetchContent_Declare(DspCore
    GIT_REPOSITORY       ssh://smi100.local/srv/smi100/smi100_core.git
    GIT_TAG              v1.3.0
    GIT_REMOTE_UPDATE_STRATEGY CHECKOUT
    SOURCE_DIR           ${CMAKE_SOURCE_DIR}/vendor/core
)
FetchContent_MakeAvailable(DspCore)
```

**Плюсы**:
- ✅ Одна технология (CMake), меньше движущихся частей
- ✅ Python не требуется
- ✅ Стандартный паттерн CMake 3.24+

**Минусы**:
- ❌ Поведение зависит от версии CMake (3.24 ↔ 3.28 различаются)
- ❌ Чёрный ящик — сложно дебажить «почему сегодня не обновилось»
- ❌ Pin-логика — через хак (условный переопределяемый `GIT_TAG`), не прямолинейна
- ❌ Нет нормального логирования (только через verbose CMake-лог)
- ❌ Retry / graceful fallback при сетевых проблемах — сложно

---

#### 🅱️ Вариант B — Python-скрипт `scripts/update_dsp.py` (**✅ выбран для реализации**)

Существующий `update_dsp.py` (уже есть в `~!Doc/CMake-GIT/`) **дорабатывается** и вызывается из CMakeLists.txt на этапе configure. Он сам делает git fetch из SMI100, обновляет `vendor/` и `deps_state.json`. CMake после этого использует готовый `vendor/` через `FETCHCONTENT_SOURCE_DIR_*` — в сеть больше не ходит.

```cmake
# CMakeLists.txt (LP_x) — вариант B (выбран)
execute_process(
    COMMAND python3 ${CMAKE_SOURCE_DIR}/scripts/update_dsp.py
            --mode lp-refresh
            --smi100-remote ssh://smi100.local/srv/smi100
            --vendor-dir    ${CMAKE_SOURCE_DIR}/vendor
            --state-file    ${CMAKE_SOURCE_DIR}/deps_state.json
    RESULT_VARIABLE _rc
)
if(NOT _rc EQUAL 0)
    message(WARNING "update_dsp.py failed — using cached vendor/ as-is")
endif()

# Дальше CMake просто пользуется vendor/ — без сети:
set(FETCHCONTENT_SOURCE_DIR_DSPCORE     ${CMAKE_SOURCE_DIR}/vendor/core)
set(FETCHCONTENT_SOURCE_DIR_DSPSPECTRUM ${CMAKE_SOURCE_DIR}/vendor/spectrum)
# ...
FetchContent_Declare(DspCore)     # SOURCE_DIR override через FETCHCONTENT_SOURCE_DIR_*
FetchContent_MakeAvailable(DspCore ...)
```

**Плюсы**:
- ✅ Прозрачная логика, читаемый Python-код
- ✅ Легко дебажить — обычный скрипт, запускается отдельно: `python update_dsp.py --dry-run`
- ✅ Нормальное логирование в любом формате (журнал, JSON, stderr)
- ✅ Pin / unpin / status — прямолинейные if/else, не хаки
- ✅ Retry, timeout, graceful fallback — естественно на Python
- ✅ **Уже есть базовый скрипт** (`~!Doc/CMake-GIT/update_dsp.py`) — доработка, не написание с нуля
- ✅ Запускается независимо от CMake (cron / CLI), если нужно

**Минусы**:
- ❌ Python ≥ 3.8 требуется на LP_x (✅ **у нас есть** — подтверждено Alex 2026-04-19)
- ❌ Ещё одна зависимость в стеке для поддержки
- ❌ Часть метаданных (список модулей) может дублироваться между CMakeLists.txt и скриптом → решается через `dsp_modules.json` как SSOT (C1 из spec)

---

#### 📊 Сравнение A vs B

| Критерий | 🅰️ Pure CMake | 🅱️ Python-скрипт |
|---|:---:|:---:|
| Количество технологий | 1 (CMake) | 2 (CMake + Python) |
| Python на LP_x | не нужен | нужен ≥ 3.8 |
| Дебаг «почему не обновилось?» | 🔴 тяжело | 🟢 легко |
| Логирование | 🔴 минимум | 🟢 любой формат |
| Pin-логика | 🔴 хак | 🟢 прямолинейно |
| Retry / fallback | 🔴 сложно | 🟢 естественно |
| Разные версии CMake | 🔴 тонкости | 🟢 не касается |
| Тест скрипта независимо от сборки | ❌ | ✅ `update_dsp.py --dry-run` |
| Нам нужно писать с нуля | базовый код | **доработка готового** |
| **Итог для DSP-GPU** | альтернатива | **✅ выбрано** |

**Почему (B) у нас**: команды LP будут > 10 человек — им нужен **прозрачный механизм**, который можно дебажить без знания внутренностей CMake. Плюс у нас уже есть рабочий `update_dsp.py` — дорабатываем, не переизобретаем.

---

#### 🔧 Два отдельных скрипта — решение Alex 2026-04-19 (Q8 = два)

> Смешивать промотирование (Alex-only, Zone 0→1) и lp-refresh (LP-users, Zone 2) в одном скрипте опасно правами и сбивает аудиторию. **Разделяем**.

| Скрипт | Где живёт | Кто запускает | Что делает |
|--------|-----------|---------------|-----------|
| **`scripts/promote_to_smi100.sh`** | ПК Alex (Windows/Linux) | Только Alex | Тянет release-тег из public GitHub → `smi100_*.git` local bare → `git push smi100` по LAN. Уже описан в C3/C4 spec. Остаётся без изменений. |
| **`scripts/update_dsp.py`** (доработка) | На каждом LP_x-сервере | LP-разработчики + CMake через `execute_process` | Zone 2-only: идёт в SMI100 по LAN, обновляет `vendor/<mod>/` и `deps_state.json`, держит pin-логику. |

**Что доработать в существующем `~!Doc/CMake-GIT/update_dsp.py`** (перенесём в `scripts/update_dsp.py`, корень workspace):

| # | Функциональность | Зачем |
|---|------------------|-------|
| 1 | Основной режим `lp-refresh`: для модулей без pin сравнивает SHA с SMI100, тянет новое в `vendor/<mod>/` | CMake configure hook |
| 2 | Команды `--pin <mod> <tag>` / `--unpin <mod>` / `--status` / `--pin-all` / `--unpin-all` | Механика заморозки (см. раздел ниже) |
| 3 | Читает состав deps из `dsp_modules.json` (не хардкод) | SSOT из C1 spec |
| 4 | Формат `deps_state.json` v2 с полем `pinned: true/false` + `pin_reason` | Поддержка pin |
| 5 | Graceful fallback: SMI100 недоступна → warning, сборка не падает | Чтобы не блокировать работу при обрыве LAN |
| 6 | Запуск из CMake (`execute_process`) **и** из CLI (`python update_dsp.py --status`) | Гибкость для cron / дебага |
| 7 | Фикс двух багов из review (двойной `git checkout`, двойной `git commit`) | Закрываем old TODO |
| 8 | Флаг `--dry-run` — показать что сделает, не трогая vendor/ | Для отладки / CI release-gate |
| 9 | ❌ **Не** занимается промотированием Zone 0→1 — это `promote_to_smi100.sh` | Разделение ответственности (Q8) |

---

```
  Zone 1 — SMI100                                    Zone 2 — LP_x (сервер команды)
                                                     
  /srv/smi100/                                       ~/LP_x/    ◄── git repo LP_x
  ├── smi100_core.git         (v1.3.0 ← новое!)      ├── src/
  ├── smi100_spectrum.git     (v1.2.0)               ├── CMakeLists.txt
  ├── smi100_stats.git        (v1.1.0)               ├── CMakePresets.json
  └── ...                                            ├── deps_state.json   ◄ в git
                                                     │     было: core v1.2.0
                                                     │     станет: core v1.3.0
                                                     │
                                                     └── vendor/           ◄ в git
                                                         ├── core/   v1.2.0 → v1.3.0
                                                         ├── spectrum/ v1.2.0
                                                         └── stats/  v1.1.0
```

---

**⚙️ Что происходит при обычной сборке LP_x** (полный цикл)

```
 ┌─ ШАГ 1: cmake --preset zone2 (configure) ───────────────────────────────┐
 │                                                                          │
 │   CMake читает CMakeLists.txt → FetchContent_Declare(DspCore             │
 │                                    GIT_REPOSITORY ssh://smi100/.../core  │
 │                                    GIT_TAG v1.3.0                        │
 │                                    GIT_REMOTE_UPDATE_STRATEGY CHECKOUT   │
 │                                    SOURCE_DIR ${CMAKE_SOURCE_DIR}/vendor/core)
 │                                                                          │
 │   Для каждой зависимости:                                                │
 │     • смотрит vendor/<mod>/.git — какой сейчас SHA                      │
 │     • git ls-remote smi100_<mod>.git — какой актуальный SHA по тегу     │
 │     • если отличается → git fetch + checkout в vendor/<mod>/            │
 │     • если совпадает → no-op (zero-rebuild из v2 Layer 1)               │
 │                                                                          │
 │   Итог: vendor/ на диске теперь содержит то, что на SMI100              │
 │         deps_state.json обновлён CMake-ом                               │
 └──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
 ┌─ ШАГ 2: cmake --build build ────────────────────────────────────────────┐
 │                                                                          │
 │   Сборка идёт из vendor/ локально.                                       │
 │   🌐 Сеть не трогается.                                                  │
 │   Все исходники на диске, на расстоянии read() от компилятора.          │
 └──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
 ┌─ ШАГ 3: тесты (ctest) ──────────────────────────────────────────────────┐
 │                                                                          │
 │   Прогоняем тесты. Если зелёные → LP_x в рабочем состоянии со           │
 │   свежими зависимостями.                                                 │
 └──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
 ┌─ ШАГ 4 (опц.): git add + commit ────────────────────────────────────────┐
 │                                                                          │
 │   git add vendor/ deps_state.json                                        │
 │   git commit -m "sync with SMI100: core v1.2.0 → v1.3.0"                │
 │                                                                          │
 │   Это можно:                                                             │
 │     • делать руками (дисциплинированно, после каждой успешной сборки)   │
 │     • делать pre-release (перед tag release — см. шаг 5)                │
 │     • автоматизировать pre-commit hook (опц.)                           │
 └──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
 ┌─ ШАГ 5: git clone LP_x на другой ПК ────────────────────────────────────┐
 │                                                                          │
 │   git clone LP_x → target-ПК получает src/ + vendor/ + deps_state.json  │
 │   → cmake --preset zone2-offline                                        │
 │       (preset с FETCHCONTENT_SOURCE_DIR_DSP* на vendor/ → не идёт в LAN)│
 │   → cmake --build → собирается автономно, без SMI100                    │
 └──────────────────────────────────────────────────────────────────────────┘
```

---

**📋 Ключевое правило Alex (2026-04-19)**:

> ⚠️ **Перед каждым переносом (git clone на флешку / на другой ПК) — ВСЕГДА сначала цикл ШАГИ 1-4**:
>
> ```
>   cmake --preset zone2 && cmake --build build && ctest
>   # зелёные? → commit vendor/ + deps_state.json
>   git clone ... → на флешке всё свежее и проверенное
> ```
>
> Это **дисциплина**: клон создаётся не из случайного состояния, а из состояния «собралось + тесты зелёные».

---

**🟢 Сценарий 1 — обычный рабочий день команды LP_A**
```
10:00  Разработчик тянет LP_A, начинает работать:
         rm -rf build && cmake --preset zone2
       → CMake: «на SMI100 появилась spectrum v1.2.1, а у нас v1.2.0
                 в vendor/spectrum/» → git fetch + checkout → vendor/spectrum
                 обновлён → deps_state.json обновлён
         cmake --build build
       → сборка из свежего vendor/, без сети.

12:00  Тесты зелёные, фиксим состояние:
         git add vendor/ deps_state.json
         git commit -m "sync: spectrum v1.2.0 → v1.2.1"
         git push на внутренний git LP_A
```

**🟢 Сценарий 2 — «заморозка» LP_B на стабильной версии (release candidate)**
```
 Команда хочет зафиксировать версии на время тестирования:
   scripts/update_dsp.py --pin core v1.2.0 --pin spectrum v1.1.0
 → пишет в deps_state.json "pinned: true"
 → CMake при следующих configure ВИДИТ pin → ничего с SMI100 не тянет
 → работает с замороженным vendor/
 Тест/стабилизация прошла → git tag LP_B-v0.5 → снимают pin → обычный цикл.
```

**🟢 Сценарий 3 — SMI100 недоступна во время сборки**
```
 cmake --preset zone2
 → CMake пытается git ls-remote smi100... → timeout / connection refused
 → Layer 1 (version.cmake early-return) + vendor/ уже содержит последнее
   известное состояние → сборка идёт по vendor/ как есть, без обновления.
 ⚠️ Логируется warning: "SMI100 unreachable, using cached vendor/".
 После восстановления LAN → следующий configure всё подтянет.
```

**🟢 Сценарий 4 — перенос LP_x на изолированный ПК у клиента**
```
 1. На LP_x-сервере команда делает:
      cmake --preset zone2 && cmake --build build && ctest
      (всё зелёное → vendor/ свежий и проверенный)
      git add vendor/ deps_state.json
      git commit -m "release candidate r23"
      git tag LP_x-r23

 2. git clone --depth=1 на флешку / через SFTP → получили всё (src + vendor).

 3. На ПК клиента:
      tar xzf LP_x-r23.tar.gz   (или git clone, если есть git)
      cmake --preset zone2-offline   (SMI100 для этого preset недоступен
                                       → FetchContent использует только vendor/)
      cmake --build build
      → собрано. Без SMI100, без интернета, без настройки ключей.
```

---

**🔗 Отличие от старого V11 (tarball) и старого «--sync» подхода**:

| Аспект | V11 tarball | Моя старая ошибочная модель (cron `--sync`) | ✅ Правильная модель (этот раздел) |
|--------|:-----------:|:-------------------------------------------:|:----------------------------------:|
| Когда обновляется vendor/ | Alex вручную пересобирает архив | По cron / on-demand, отдельно | **На configure каждой сборки** |
| Как тянет | `git archive` + tar | `update_dsp.py --sync` вызывает git fetch | CMake FetchContent с `GIT_REMOTE_UPDATE_STRATEGY CHECKOUT` |
| Сеть во время build | Нет | Нет (обновление отдельно) | Нет (обновление уже на configure) |
| Свежесть git clone | Только то, что на момент tar | Зависит от последнего cron | **Всегда свежее — после build+test** |
| Reproducibility | Через имя архива | Через deps_state.json | Через deps_state.json + git log vendor/ |
| Транспорт | tar-файл | git push в внутренний репо LP | git clone LP_x (получает vendor/ из git) |

---

### ✅ Решения по 4 вопросам (Alex, 2026-04-19, round 3)

| # | Вопрос | Решение |
|---|--------|---------|
| 1 | `vendor/` в git — коммитим все исходники? | ✅ **Да**, без Git LFS (места хватает) |
| 2 | Реализация refresh — Pure CMake или Python-скрипт? | ✅ **Python `update_dsp.py` с доработкой** (вариант B). Pure CMake (A) описан в документе как альтернатива — см. выше. |
| 3 | Pin-режим как механика «заморозки» | ✅ **Да**, нужен. См. раздел 🧊 ниже. |
| 4 | Защита от плохого commit vendor/ — правило / hook / CI | ✅ **CI на сервере LP_x** (команда > 10 → делаем нормально). Pre-commit hook — опциональный шаблон. См. раздел 🛡 ниже. |

---

### 🧊 Pin — «заморозка» версий deps

**Зачем** (3 реальных сценария):

1. **Release candidate**: команда стабилизирует релиз, QA проверяет. Если в это время Alex выкатит новую `core v2.0.0` (breaking) — обычный configure автоматически её подтянет → тесты сломаются, приёмка насмарку. **Решение**: зафиксировать `core` на `v1.x.y` до конца приёмки.
2. **Воспроизведение бага клиента**: обычно не нужен pin (vendor/ в git → `git checkout LP_x-r23` даёт ровно те версии). Но если хочется на свежем коде LP_x с замороженными deps — используется pin.
3. **Изоляция от breaking change**: все команды адаптируются к новому API. LP_B нужно ещё неделю — они замораживаются, чтобы `cmake configure` не ломал им сборку.

**Формат `deps_state.json`** (расширен под pin):

```json
{
  "schema_version": 2,
  "updated": "2026-04-19T10:00:00Z",
  "repos": {
    "core": {
      "sha":    "abc123def...",
      "tag":    "v1.2.0",
      "pinned": true,
      "pin_reason": "RC stabilization до 2026-05-01"
    },
    "spectrum": {
      "sha":    "fed456cba...",
      "tag":    "v1.1.0",
      "pinned": false
    }
  }
}
```

**Поведение `update_dsp.py --mode lp-refresh`**:
```
для каждого модуля в deps_state.json:
    если pinned == true:
        → пропустить, vendor/<mod>/ не трогать, deps_state.json не менять
    иначе:
        → git ls-remote smi100_<mod>.git
        → сравнить с текущим SHA
        → если новое → git fetch + checkout в vendor/<mod>/
        → обновить deps_state.json
```

**Команды**:

| Команда | Что делает |
|---------|-----------|
| `python scripts/update_dsp.py --mode lp-refresh` | основной режим (для CMake hook) |
| `python scripts/update_dsp.py --pin core v1.2.0 --reason "RC stab"` | заморозить `core` на `v1.2.0` |
| `python scripts/update_dsp.py --unpin core` | снять pin с `core` |
| `python scripts/update_dsp.py --status` | показать какие модули замороженны и до каких версий |
| `python scripts/update_dsp.py --pin-all` | заморозить **все** модули разом (для RC) |
| `python scripts/update_dsp.py --unpin-all` | снять все pin (конец RC) |

**После `--pin` / `--unpin`** — обычный цикл:
```
python scripts/update_dsp.py --pin core v1.2.0
git add deps_state.json
git commit -m "pin core@v1.2.0 for RC stabilization"
```

---

### 🛡 Защита целостности vendor/: CI на сервере LP_x + опциональный pre-commit hook

**Цель**: исключить ситуацию когда в git LP_x попадает сломанный `vendor/` (например, разработчик обновил без `ctest`, или refresh подтянул несовместимые версии).

**Решение для DSP-GPU (команды > 10 человек)**: **CI на внутреннем git-сервере LP_x — основная защита**. Pre-commit hook — опционально на уровне разработчика.

---

#### 🅰️ CI на сервере LP_x (основное)

Каждая команда LP поднимает свой внутренний CI-runner (GitLab CI / Jenkins / Gitea Actions — что принято в команде). На каждый push в `main` (или MR в `main`):

```yaml
# .gitlab-ci.yml (пример, под свою CI замените)
stages: [build, test, release-gate]

build:
  stage: build
  image: rocm/dev-ubuntu-22.04:latest
  script:
    - rm -rf build
    - cmake --preset zone2
    - cmake --build build -j$(nproc)
  artifacts:
    paths: [build/]
    expire_in: 1 day

test:
  stage: test
  needs: [build]
  script:
    - ctest --test-dir build --output-on-failure

release-gate:
  stage: release-gate
  needs: [test]
  only: [tags]                    # только при git tag LP_x-vX.Y.Z
  script:
    # Проверка: vendor/ = то что сейчас на SMI100 (не устаревший commit)
    - python scripts/update_dsp.py --mode lp-refresh --dry-run --fail-if-drift
    - echo "✅ Release gate passed — можно отдавать клиенту"
```

**Что проверяет CI** (минимум):
- 🟢 `cmake configure` прошёл (vendor/ консистентна с CMakeLists.txt)
- 🟢 `cmake --build` прошёл (код компилируется со свежим vendor/)
- 🟢 `ctest` прошёл (тесты зелёные)
- 🟢 Release-gate (только на tag): vendor/ не отстал от SMI100 без explicit pin

**Защита на уровне git-сервера LP_x** (protected branches):
- `main` — push запрещён, только через MR/PR + approved CI
- Теги `LP_x-vX.Y.Z` — push запрещён, если CI не зелёный
- Force-push в `main` — запрещён всем, включая admin

Это гарантирует что **в `main` попадает только проверенный vendor/**. Разработчик не может случайно закоммитить сломанное — его ветку на сервере заблокируют.

---

#### 🅱️ Pre-commit hook (опционально, на стороне разработчика)

Для разработчиков, которые хотят **локальную** защиту ещё до push (чтобы не ждать CI) — шаблон hook в `scripts/hooks/pre-commit`:

```bash
#!/usr/bin/env bash
# scripts/hooks/pre-commit (копируется в .git/hooks/ по желанию разработчика)

changed=$(git diff --cached --name-only)
if echo "$changed" | grep -qE '^(vendor/|deps_state\.json)'; then
    echo "🔍 vendor/ или deps_state.json изменились — проверяем сборку..."
    cmake --build build -j$(nproc) 2>&1 | tee /tmp/precommit.log || {
        echo "❌ Сборка провалилась — commit отменён. Лог: /tmp/precommit.log"
        exit 1
    }
    ctest --test-dir build --output-on-failure || {
        echo "❌ Тесты красные — commit отменён."
        exit 1
    }
fi
```

**Установка** (по желанию разработчика):
```bash
cp scripts/hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

**Где живёт шаблон**: `scripts/hooks/pre-commit` в репо LP_x — каждый разработчик сам решает копировать или нет. Hook **не версионируется** через `.git/hooks/` автоматически (это особенность git).

---

#### 📊 Что рекомендуем командам LP

| Команда размером | Основное | Опционально |
|---|---|---|
| 1-3 чел. | Правило в CONTRIBUTING.md + pre-commit hook шаблон | CI можно отложить |
| 4-10 чел. | CI на сервере LP (мин: build + ctest) | Pre-commit для быстрого фидбэка |
| **> 10 чел. (наш случай)** | **CI + protected branches + release-gate** | Pre-commit — для тех кто хочет |

**Мы делаем сразу по «> 10»** — так как Alex сказал «делаем нормально».

---

## 📋 5. Требования и ограничения

Переносим из spec `cmake_git_distribution_spec_2026-04-18.md` **как есть** (R1-R9) + добавляем R-offline / R-normal / R-patches из Variants_Report. На этом этапе — только список, детали потом.

- R1 — только проверенные версии в Zone 1
- R2 — clean build в Zone 2
- R3 — добавление модуля ≤ 5 мин
- R4 — reproducibility через 6+ месяцев
- R5 — внятные CMake-ошибки (не линкерные)
- R6 — MemoryBank/~!Doc НЕ попадают в Zone 1
- R7 — N LP обновляются в своём темпе
- R8 — patches из LP могут вернуться
- R9 — нет интернета на SMI100/LP
- **R-normal** — LP собирается из SMI100 (обычный workflow)
- **R-offline** — 🆕 LP переносится на изолированный ПК без SMI100
- **R-patches** — правки из LP → обратно в Zone 0

---

## 📑 6. Обзор всех рассмотренных вариантов (V1-V11)

> _Placeholder этапа 0._ На следующей итерации: полная таблица вариантов с инлайн «простыми словами» (Q2=б, абзац 3-5 строк на каждый) + ссылки на `Variants_Report_2026-04-18.md` как первоисточник.

Заголовки раскроем на следующем этапе:

- V1 — BASE: bare mirrors + submodules + FetchContent
- V2 — Full workspace на SMI100
- V3 — Dist из workspace
- V4 — Копии папок (rsync) ❌
- V5 — Dist из bare
- V6 — Release Repo (монорепо живых релизов)
- **V7A — отдельный git per модуль** (наш выбор)
- V7B — Aggregated bundle per LP
- V7C — Уникальный git per LP ❌
- **V8 — текущий дизайн** (V7A + promotion + deps_state + Config.cmake)
- V9 — Vendored deps (под R-offline)
- V10 — Git bundle (под R-offline)
- V11 — Tarball snapshot (под R-offline, самое простое)

---

## 🏆 7. Выбранный дизайн — V8 + R-offline overlay

> _Placeholder этапа 0._ На следующей итерации распишем:
> 1. Почему именно V8 (не V5/V6): изоляция историй, независимые версии, масштаб на 50+ модулей.
> 2. Как V8 стыкуется с R-offline через **Option α = V11 поверх V8** (freeze-скрипт не меняет основной дизайн).
> 3. Интеграция с v2 спекой (Layer 1 + Layer 2 уже в проде, не переделываем).
> 4. Ссылки на компоненты C1-C11 из `cmake_git_distribution_spec_2026-04-18.md`.

---

## 🧱 8. Фазы реализации

> _Placeholder этапа 0._ Перечень фаз (детали — в spec). Задача этого документа — не повторять spec, а дать читателю якоря.

- Фаза 0 — Manifest + генератор (C1, C2)
- Фаза 1 — Локальный прототип 2 модулей
- Фаза 2 — `deps_state.json` pipeline (C7, C10)
- Фаза 3 — Config.cmake.in (C6)
- Фаза 4 — Dev-preset + Patch_Flow (C8, C9)
- Фаза 5 — Автоматизация промотирования (C4, C5)
- Фаза 6 — Реальный SMI100 (C11)
- Фаза 7 — Масштабирование + patches
- **Фаза 8 (🆕)** — freeze-tool для R-offline (опционально, поверх V8)

---

## 🔗 9. Источники и референсы

> _Placeholder этапа 0._ На следующей итерации прогоним через:

**Context7 (planned)**:
- `/websites/cmake_cmake_help` — FetchContent, FETCHCONTENT_SOURCE_DIR, GIT_REMOTE_UPDATE_STRATEGY
- `/websites/cmake_cmake_help` — CMakePackageConfigHelpers / write_basic_package_version_file
- `/websites/cmake_cmake_help` — BundleUtilities / ExternalProject offline patterns
- `/git/git-scm` — git bundle, git archive, worktree

**URL-статьи (ранее упомянутые, проверим актуальность)**:
- <https://discourse.cmake.org/t/cmake-offline-build-how-to-pre-populate-source-dependencies-in-the-build-tree/13173>
- <https://github.com/TheLartians/CPM.cmake/issues/166> (CPM offline)
- <https://arrow.apache.org/docs/developers/cpp/building.html> (AUTO/BUNDLED/SYSTEM)
- <https://github.com/ROCm/TheRock> (ROCm multi-module)
- <https://gitolite.com/gitolite/> (ACL for Фаза 6/7)

**GitHub examples (planned search)**:
- `"FETCHCONTENT_SOURCE_DIR" lang:cmake` — референсные реализации
- `"git bundle" "--all"` + offline build workflows
- crates.io-like distribution patterns для C++

**Sequential-thinking (planned)**:
- разбор R-offline: V9 vs V10 vs V11 под наш реальный use-case
- взаимодействие V8 + freeze-tool (Фаза 8): что должно быть идемпотентно

**Внутренние доки DSP-GPU** (SSOT этого документа):
- `~!Doc/CMake-GIT/1_…6_*.md`
- `~!Doc/CMake-GIT/Variants_Report_2026-04-18.md`
- `~!Doc/CMake-GIT/Review_VariantA_Kodo_2026-04-18.md`
- `~!Doc/CMake-GIT/update_dsp.py`
- `MemoryBank/specs/cmake_git_distribution_spec_2026-04-18.md`
- `MemoryBank/specs/cmake_git_aware_build.md` v2
- `MemoryBank/specs/cmake_git_specs_comparison_2026-04-18.md`

---

## 📝 10. Следующие шаги (по этапам)

Этот документ растёт поэтапно — по договорённости с Alex:

| Этап | Что делаем | Статус |
|------|-----------|--------|
| **0** | Структура + оглавление + file layout 3 зон + потоки | ✅ **готово** |
| **0.1** | §3.3 + §4.3 — vendor-модель, Python-скрипт refresh, Pin, CI | ✅ **готово (round 3)** |
| 1 | Словарик §2 раскрыть в формате Q2=б (бытовые аналогии) | ⬜ ждём OK по §3/§4 |
| 2 | §6 — инлайн «простыми словами» для всех V1-V11 + недостающие схемы | ✅ **готово в Variants_Report** |
| 3 | §7 раскрыть: обоснование V8 + vendor-модель (V9 основной) + v2 | ⬜ |
| 4 | Прогон Context7 + sequential-thinking + GitHub search → §9 реальными ссылками | ⬜ |
| 5 | §5 перевести из списка в полноценные «user stories» | ⬜ |
| 6 | Финальный proof-read на двух читателях: инженер + «чайник» | ⬜ |

**Параллельно (инженерные последствия этапа 0.1)**:
- ⬜ Обновить `cmake_git_distribution_spec_2026-04-18.md` — V9 (vendored) стал основным режимом, добавить компонент C12 (update_dsp.py lp-refresh mode) и C13 (LP CI template).
- ⬜ Декомпозиция `update_dsp.py` доработки на таски (режим `lp-refresh`, pin, status, graceful fallback, фикс 2 багов).
- ⬜ Шаблон CI (`.gitlab-ci.yml` / `Jenkinsfile` — что принято) для LP-команд → `templates/LocalProject/ci/`.

---

## ❓ 11. Открытые вопросы для Alex

### Закрытые в раундах 3-4 (2026-04-19)

| # | Вопрос | Решение |
|---|--------|---------|
| Q1 | `vendor/` — Git LFS или обычный git? | ✅ Обычный git (места хватает) |
| Q2 | Refresh — Pure CMake или Python? | ✅ Python `update_dsp.py` с доработкой; Pure CMake — описан как альтернатива |
| Q3 | Pin-режим — нужен? | ✅ Да, с форматом `pinned: true` + команды `--pin/--unpin/--status` |
| Q4 | Защита vendor/ от сломанного commit | ✅ CI на сервере LP_x (команда > 10 → «делаем нормально») + pre-commit hook шаблон опц. |
| Q8 | Один скрипт с `--mode` или два раздельных? | ✅ **Два раздельных**: `promote_to_smi100.sh` (Alex, Zone 0→1) и `update_dsp.py` (LP, Zone 2) |


### Ещё не решённые (из этапа 0)

Перед наращиванием §6/§7/§9 хочу свериться по file layout:

1. **Имя файла документа** (`Distributed_Modules_Guide_2026-04-19.md`) — ок или предложишь другое?
2. **§3.1 Zone 0 — `smi100_*.git` рядом с live checkouts** (`E:\DSP-GPU\smi100_core.git` в корне рабочего дерева) или лучше отдельная папка (`E:\DSP-GPU\_release\smi100_*.git` / `E:\DSP-GPU\mirrors\`)?
3. **§3.2 Zone 1 — путь `/srv/smi100/`** — принимаем как final или у тебя уже есть реальный путь?
4. **§3.2 `incoming/*.git`** — один `incoming/` для всех модулей или отдельные `incoming/<team>/*.git` для разных LP-команд?
5. **§3.3 Dev-overlay** — `~/core-dev/` (рядом с LP) или строго внутри workspace (`LP_x/../core-dev/`)?
6. **§4 Bidirectional схемы** — уровень детализации ок?
7. **§5 R-normal / R-offline / R-patches** — как официальные маркеры норм?

### от Alex
1. - да
2. Думаю в корне создать отдельную папаку которая не передается на github можкт \DSP-GPU\_release_git\smi100_*.git - ? и коли я знаю когда пишц + teg писать в json эту ниформацию. для доп контроля
3. нет для теста windows e:\SMI100\  debian  ..\alex\home\SMI100\  <- что то такое плтом перенесу на сервер там будет другое
4. не знаю посмотри как лучше
5. все что оть как то относится к LP все в нутри 
6. ок
7. ок
8. полное расшифровка всех сообщений - глосарий
9. может ты считаешь что то еще добавить к этим двум файлам

*Draft by: Кодо | Этап 0.1 — vendor-модель + решения round 3-4 | 2026-04-19*
