# 04 · Zone 2 — LocalProject (LP)

> **Кто это читает**: инженер LP-команды (новый и опытный), архитектор команды, разработчик настраивающий свой LP.
> **Цель**: понять что лежит в LP-репо, какие правила работы, как onboarding нового человека в команду.

---

## 🏛 File layout

### LP_x — репо команды

```
~/LP_x/                                   ← собственный git-репо команды
│                                           (внутренний git-сервер команды — Gitea / GitLab / bare)
│
├── .gitignore                            ← обязательно содержит: build/ dev-overlays/
│
├── CLAUDE.md / README.md                 ← инструкции команды (опционально)
├── CMakeLists.txt                        ← главный CMake
├── CMakePresets.json                     ← zone2, zone2-dev-*, zone2-offline
│
├── deps_state.json                       ← 🆕 "паспорт сборки" (в git)
│                                            SHA + tag + pinned флаги
│
├── src/                                  ← собственный код команды
├── include/
├── tests/
│
├── cmake/                                ← локальный CMake-код
│   └── fetch_deps.cmake                  ← сгенерирован из dsp_modules.json
│
├── scripts/                              ← локальные скрипты команды
│   ├── update_dsp.py                     ← копия из DSP-GPU/scripts/ (для LP)
│   └── hooks/
│       └── pre-commit                    ← опц. hook-шаблон
│
├── vendor/                               ← ✅ ОСНОВНОЕ (в git LP_x)
│   ├── core/                             │   • ПОЛНАЯ копия исходников нужных модулей
│   ├── spectrum/                         │   • обновляется update_dsp.py при configure
│   ├── stats/                            │   • git clone LP_x даёт всё сразу
│   └── ...                               │   • размер: 100-500 МБ
│
├── dev-overlays/                         ← 🆕 В .gitignore! (решение Alex 2026-04-19)
│   ├── core-dev/                         │   • clone модуля для ручных правок
│   ├── stats-dev/                        │   • CMakePreset zone2-dev-<mod> указывает сюда
│   └── ...                               │   • НЕ коммитится в git LP_x
│
└── build/                                ← transient, В .gitignore
    ├── _deps/
    │   ├── dspcore-build/                ← объектники зависимостей
    │   └── ...
    └── ... (собственный build-output)
```

---

## 📄 Ключевые файлы в LP_x

### `deps_state.json` — паспорт сборки

Полный формат и описание — [00_Glossary.md#deps_statejson](00_Glossary.md#deps_statejson) + [05_Refresh_Mechanics.md](05_Refresh_Mechanics.md).

Коротко:

```json
{
  "schema_version": 2,
  "updated": "2026-04-19T10:00:00+03:00",
  "repos": {
    "core":     { "sha": "abc...", "tag": "v1.2.0", "pinned": false },
    "spectrum": { "sha": "fed...", "tag": "v1.1.0", "pinned": false },
    "stats":    { "sha": "abc...", "tag": "v1.3.0", "pinned": true,
                  "pin_reason": "RC stabilization 2026-05-01" }
  }
}
```

**Обязательно коммитится** в git LP_x вместе с `vendor/`.

---

### `CMakePresets.json` — пресеты сборки

Минимальный набор трёх пресетов:

```jsonc
{
  "version": 6,
  "configurePresets": [
    {
      "name": "zone2",
      "displayName": "Zone 2 — production (refresh из SMI100)",
      "generator": "Ninja",
      "binaryDir": "${sourceDir}/build",
      "cacheVariables": {
        "CMAKE_BUILD_TYPE": "Release",
        "DSP_GIT_SERVER": "ssh://gitsrv@smi100.local/srv/smi100",
        "DSP_OFFLINE_MODE": "OFF"
      }
    },
    {
      "name": "zone2-dev-stats",
      "inherits": "zone2",
      "displayName": "Dev: правки в dev-overlays/stats-dev/",
      "cacheVariables": {
        "FETCHCONTENT_SOURCE_DIR_DSPSTATS": "${sourceDir}/dev-overlays/stats-dev"
      }
    },
    {
      "name": "zone2-offline",
      "inherits": "zone2",
      "displayName": "Offline mode — без обращений к SMI100",
      "cacheVariables": {
        "DSP_OFFLINE_MODE": "ON",
        "FETCHCONTENT_SOURCE_DIR_DSPCORE":     "${sourceDir}/vendor/core",
        "FETCHCONTENT_SOURCE_DIR_DSPSPECTRUM": "${sourceDir}/vendor/spectrum",
        "FETCHCONTENT_SOURCE_DIR_DSPSTATS":    "${sourceDir}/vendor/stats"
      }
    }
  ]
}
```

- `zone2` — нормальный workflow (refresh + build)
- `zone2-dev-<mod>` — для каждого модуля свой pseudo-preset (генерируется)
- `zone2-offline` — для переноса на изолированный ПК (см. [07_Transfer_To_Offline_PC.md](07_Transfer_To_Offline_PC.md))

---

### `.gitignore` — что не коммитить

```gitignore
# Build artefacts
build/
*.o
*.obj

# Dev-overlays — работа с клонами модулей, не коммитим
dev-overlays/

# IDE
.vscode/
.idea/
*.swp

# Python
__pycache__/
*.pyc

# Логи
*.log

# НИКОГДА не игнорируем:
# vendor/           ← обязательно в git!
# deps_state.json   ← обязательно в git!
```

---

## 🧒 Пять ключевых правил Zone 2 — подробно

### 1. Clean build каждый раз

**Что**: перед сборкой удаляем `build/` целиком, запускаем CMake с нуля:

```bash
rm -rf build
cmake --fresh --preset zone2
cmake --build build -j$(nproc)
```

**Бытовая аналогия**: представь что ты перед каждой готовкой моешь всю кухню и раскладываешь ингредиенты заново. Долго? Да. Зато **гарантированно нет** вчерашних остатков.

**Зачем так жёстко**: один забытый старый `.o` файл → «почему-то не собирается» → часы отладки. Политика DSP-GPU: **стабильность через детерминизм**. Это политика Alex, не обсуждается.

---

### 2. `deps_state.json` — коммитится в git

**Что**: файл фиксирует какие **точно** версии зависимостей использует LP_x. CMake при configure его обновляет, разработчик коммитит.

**Бытовая аналогия**: это этикетка на банке консервов — написано, из какой партии ингредиенты. Клиент пришёл с жалобой через полгода — по этикетке найдёшь точно ту партию.

**Зачем**: **reproducibility (R4)**. `git checkout LP_x-v0.5 && cmake --preset zone2-offline && cmake --build` через 5 лет → bit-identical сборка.

**Обязательно** коммитить после каждого значимого изменения версий. Лучше всего — **CI автоматически коммитит** после успешного build+test (см. [08_CI_And_Integrity.md](08_CI_And_Integrity.md)).

---

### 3. `build/_deps/` — руками не трогать

**Что**: папка внутри `build/`, куда CMake складывает объектники зависимостей. Если использовать `FETCHCONTENT_SOURCE_DIR_*` на `vendor/` — там только `*-build/`, без `*-src/`.

**Бытовая аналогия**: контейнер «грязной посуды» в посудомойке. Заглянуть можно, мыть руками и возвращать на стол — нельзя. Всё равно смоет при следующем цикле.

**Правило**: **никогда не редактируй здесь**. Следующий `rm -rf build` всё снесёт → твои правки пропадут.

**Надо править модуль?** Используй dev-overlay (правило 4).

---

### 4. Dev-overlay — «черновой стол рядом с основной кухней»

**Что**: клонируешь модуль в `~/LP_x/dev-overlays/<mod>-dev/`, правишь там, тестируешь. CMakePreset `zone2-dev-<mod>` говорит CMake: «вместо `vendor/<mod>/` бери из `dev-overlays/<mod>-dev/`».

**Бытовая аналогия**: основная кухня работает, ты сбоку поставил столик (`dev-overlays/stats-dev/`), где пробуешь новый рецепт. Готово — несёшь на основную кухню (push в incoming, Alex промотирует, vendor/ обновляется).

**Где лежит**: **внутри LP_x**, в папке `dev-overlays/`, которая **в .gitignore** (решение Alex 2026-04-19).

Почему в `.gitignore`:
- Разработчик может клонировать `dev-overlays/stats-dev/` → там **свой полный git** с историей модуля
- Если `dev-overlays/` попадёт в git LP_x — будет конфликт с `vendor/stats/` (два источника истины)
- `dev-overlays/` — это рабочая площадка разработчика, **не артефакт команды**

**Когда применять**:
- ✅ Нашёл баг в модуле, хочешь серьёзно починить (не 10 минут)
- ✅ Делаешь breaking change в API
- ✅ Долгая задача в модуле

**Когда НЕ нужно**:
- ❌ Обычная сборка LP_x — просто `cmake --preset zone2`, никаких overlay
- ❌ Одноразовая проверка гипотезы — проще `cat` или `grep` в `vendor/`

**Магия Layer 2 из v2 спеки**: `git pull` в `dev-overlays/stats-dev/` → `cmake --build build` **автоматически** реконфигурируется. Не нужно вручную `cmake -B build`.

Подробно — [06_Patch_Flow.md](06_Patch_Flow.md).

---

### 5. `vendor/` — полная библиотека в клоне, всегда свежая после сборки

**Что**: папка **внутри LP_x** (в git!) с **полными исходниками всех зависимостей**. Размер 100-500 МБ.

**Бытовая аналогия**: LP_x — домашняя лаборатория, `vendor/` — её собственная библиотека справочников. Библиотекарь (CMake + `update_dsp.py`) **сам** ходит в центральный архив (SMI100) каждый раз когда ты приходишь работать — если новая редакция есть, тут же приносит на твою полку. Ты даже не заметил похода.

**Зачем она нужна**:

1. **`git clone LP_x`** = **полный рабочий комплект**. Никаких «настрой SSH к SMI100 перед первой сборкой». Новый инженер клонировал → `cmake --preset zone2` → собралось.

2. **Воспроизводимость навсегда**: `vendor/` + `deps_state.json` в git → через 5 лет клонируешь старый tag → bit-identical сборка.

3. **Transfer на флешку / изолированный ПК**: `git clone` напрямую забирает всё что нужно (перед коммитом LP_x собирается и тестируется — значит vendor/ свежий и рабочий).

**Когда обновляется**:

- ✅ **Автоматически** при каждом `cmake configure` — через `update_dsp.py --mode lp-refresh`
- ✅ Никакой ручной «команды обновить»
- 🟡 **Заморозка** (pin) — если нужно остановить обновления на время (RC) — [05_Refresh_Mechanics.md](05_Refresh_Mechanics.md#pin)

**Сборка не трогает сеть после configure**: `cmake --build` — чистая компиляция. Сетевой запрос — только на этапе configure, и только к SMI100.

**Если SMI100 недоступен во время configure** — работа продолжается по текущему `vendor/` (fallback), warning в лог. Подробно — [05_Refresh_Mechanics.md](05_Refresh_Mechanics.md).

---

## 🧑‍🎓 Onboarding нового инженера

Типичный сценарий: новый человек в LP_A-команде, впервые видит проект.

```bash
# 1. Клонирует
git clone ssh://git@lp-server.local/LP_A.git
cd LP_A

# 2. Смотрит что там
ls
# CLAUDE.md, src/, include/, vendor/, deps_state.json, CMakeLists.txt, ...

# 3. Открывает vendor/ — видит все исходники зависимостей, может листать
ls vendor/
# core/ spectrum/ stats/ linalg/ ...

# 4. Собирает
cmake --preset zone2
cmake --build build -j$(nproc)
# configure автоматически идёт на SMI100, проверяет обновления
# build собирается локально

# 5. Если SMI100 недоступен (например, сеть не настроена):
cmake --preset zone2-offline
cmake --build build
# → собирается из vendor/ как есть, без обращений к SMI100
```

Никаких «сначала поставь SSH-ключ» или «первая сборка ≠ остальные» — **единообразно**.

---

## 🔁 Типовой рабочий день

### Утро: получить свежие обновления

```bash
cd ~/LP_A
git pull           # подтянуть работу других членов команды
rm -rf build
cmake --preset zone2
# → update_dsp.py --mode lp-refresh идёт в SMI100:
#   "Alex промотировал core v1.3.0 → обновляю vendor/core/"
#   "spectrum v1.2.0 актуально, не трогаю"
# → vendor/core/ обновлён, deps_state.json обновлён
cmake --build build -j$(nproc)
ctest --test-dir build
```

### День: разработка + pin в случае RC

```bash
# Обычная разработка — всё само
vim src/my_feature.cpp
cmake --build build && ctest --test-dir build

# Запущен RC, не хочу чтобы в середине прилетел breaking core
python scripts/update_dsp.py --pin core v1.3.0 --reason "RC2 stabilization"
git add deps_state.json
git commit -m "pin core@v1.3.0 for RC2"
# Теперь cmake configure пропускает core при обновлениях
```

### Вечер: коммит с обновлённым vendor/

Если ты получил свежие версии утром через cmake configure:

```bash
# Если тесты зелёные и ты доволен состоянием:
git add vendor/ deps_state.json
git commit -m "sync: core v1.2.0 → v1.3.0, tested green"
git push
```

**В идеале это делает CI** (см. [08_CI_And_Integrity.md](08_CI_And_Integrity.md)) — автоматически после успешного build+test на master.

---

## ✅ Чеклист правильного LP_x

### Новый LP (стартовая настройка)

- [ ] Создан git-репо на внутреннем сервере команды
- [ ] В нём `CMakeLists.txt`, `CMakePresets.json` (zone2/zone2-dev-*/zone2-offline)
- [ ] `.gitignore` содержит: `build/`, `dev-overlays/`, `.vscode/`
- [ ] `cmake/fetch_deps.cmake` сгенерирован из `dsp_modules.json`
- [ ] `deps_state.json` создан (пустой или с initial pin-ми)
- [ ] `scripts/update_dsp.py` скопирован из workspace-репо
- [ ] Первая сборка прошла успешно, `vendor/` заполнена
- [ ] Коммит `"initial sync from SMI100"` с `vendor/` и `deps_state.json`

### Рабочий LP

- [ ] `git pull` + `cmake --preset zone2` + `cmake --build` выполняется успешно каждый день
- [ ] `vendor/` и `deps_state.json` регулярно коммитятся (с изменениями)
- [ ] На внутреннем git-сервере настроен CI (см. [08_CI_And_Integrity.md](08_CI_And_Integrity.md))
- [ ] Protected branches: `main` / `master` — через MR с CI-гейтом
- [ ] Хотя бы один инженер знает как сделать dev-overlay для патча

---

## 🧭 Дальше

- [05_Refresh_Mechanics.md](05_Refresh_Mechanics.md) — как именно работает автообновление (A vs B, pin)
- [06_Patch_Flow.md](06_Patch_Flow.md) — как отправить правку модуля обратно
- [07_Transfer_To_Offline_PC.md](07_Transfer_To_Offline_PC.md) — перенос LP на изолированный ПК
- [08_CI_And_Integrity.md](08_CI_And_Integrity.md) — CI и защита целостности
- [11_Troubleshooting.md](11_Troubleshooting.md) — типовые проблемы LP

---

*04_Zone2_LP_Workflow.md · 2026-04-19 · Кодо + Alex*
