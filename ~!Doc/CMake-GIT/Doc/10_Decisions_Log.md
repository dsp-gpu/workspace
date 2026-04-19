# 10 · Decisions Log — история решений + Migration guide

> **Кто это читает**: ревьюер / новый инженер в команде / архитектор, планирующий изменения.
> **Цель**: одно место где записаны **почему** мы выбрали именно так, а не иначе. Плюс migration guide — что делать командам, уже живущим на старом дизайне.

---

## 📋 R1-R9 — базовые требования DSP-GPU distribution

Полный список требований, которые дизайн обязан удовлетворить.

| # | Требование | Обоснование |
|---|-----------|------------|
| R1 | Только проверенные версии в Zone 1 | Изоляция production от dev-хаоса |
| R2 | Clean build в Zone 2 | Стабильность через детерминизм (политика Alex) |
| R3 | Добавление модуля ≤ 5 мин | Сейчас 10, к 20-50 модулей — не масштабируется |
| R4 | Reproducibility релизов через 6+ мес | Отладка клиентских багов |
| R5 | Внятные CMake-ошибки, не линкерные | Сейчас — загадочные ошибки линкера |
| R6 | MemoryBank, ~!Doc НЕ в Zone 1 | Минимизация attack surface, IP protection |
| R7 | N LP обновляются в своём темпе | Каждая команда решает сама |
| R8 | Patches из LP могут вернуться | Fixes от пользователей полезны |
| R9 | Нет интернета на SMI100 / LP | Требование безопасности |
| R-normal | LP работает с SMI100 в LAN | Основной workflow |
| R-offline | LP можно перенести на изолированный ПК | Для клиентов без LAN |
| R-patches | Patch flow снизу вверх | Обратный канал |

---

## 🗳 Решения, принятые в раундах 1-4 (апрель 2026)

### Round 1 — выбор базовой архитектуры (2026-04-15)

**Q**: как распределять код из закрытого контура в LP-команды?

**Рассмотренные варианты**: V1-V11 (см. [../Variants_Report_2026-04-18.md](../Variants_Report_2026-04-18.md)).

**Выбрано**: **V7A / V8** — отдельный git per модуль на SMI100, LP через FetchContent подключают только нужное. С promotion pipeline от Alex-а.

**Почему**:
- Масштаб: новый модуль = новый репо, не переделка существующих
- Независимые версии: core v1.5 не блокирует linalg v0.3
- Один набор репо на SMI100 для всех LP (против дублирования в V7B/V7C)
- Изоляция: Alex контролирует что промотируется

**Отвергнуто**:
- V1 (submodules) — ручной `submodule update`, грязь в LP-репо
- V4 (rsync без git) — теряем историю, diff/blame/revert
- V7C (git per LP) — экспоненциальный overhead
- V6 (Release Repo) — теряется независимость версий

---

### Round 2 — v2 spec принята в прод (2026-04-13)

Спецификация `cmake_git_aware_build.md` v2 **одобрена и в проде**:
- Layer 1 — `version.cmake` early-return (в каждом модуле)
- Layer 2 — `CMAKE_CONFIGURE_DEPENDS` на `.git/index` + `.git/FETCH_HEAD`
- Zero-rebuild при неизменном коде
- Git worktree support

Новый дизайн **надстраивается** над этим, не переизобретает.

---

### Round 3 — vendored как основной режим (2026-04-19)

**Q**: как LP получает код — FetchContent при каждом configure (сеть) или vendored (копия в git LP)?

**Исходное предположение Кодо** (ошибочное): vendored — только для R-offline, overlay к V8.

**Уточнение Alex**: «клон самодостаточен (все исходники внутри), SMI100 дёргается только когда LP сам попросит обновление».

**Уточнение Alex round 2**: «при сборке LP_x CMake проверяет есть ли обновления и обновляет у себя все. Перед clone всегда идёт тестирование и сборка → файлы обновляются автоматически».

**Принятая модель** (этот документ):
- `vendor/` — в git LP_x, коммитится **всегда**
- Refresh — **автоматически** при `cmake configure`
- Cборка — локально из `vendor/`, без сети
- `git clone` LP_x → полный комплект

**Последствия**:
- V9 (vendored) становится **основным режимом**, не overlay
- `cmake_git_distribution_spec_2026-04-18.md` нужно обновить (добавить C12 update_dsp.py lp-refresh, C13 CI template)

---

### Round 4 — детали реализации (2026-04-19)

Решены 8 вопросов:

| # | Вопрос | Решение |
|---|--------|---------|
| Q1 | `vendor/` — Git LFS или обычный git? | ✅ **Обычный git** (места хватает) |
| Q2 | Refresh — Pure CMake или Python? | ✅ **Python `update_dsp.py`** (вариант B). Pure CMake — альтернатива в документе. |
| Q3 | Pin-режим — нужен? | ✅ **Да**, с `pinned: true` + команды `--pin/--unpin/--status` |
| Q4 | Защита от плохого commit vendor/ | ✅ **CI на сервере LP_x** (команда > 10). Pre-commit — опц. |
| Q5 | `smi100_*.git` — где лежат у Alex | ✅ **`E:\DSP-GPU\_release_git\`** в `.gitignore` workspace |
| Q6 | `/srv/smi100/` — final путь? | 🟡 **Тест**: Windows `E:\SMI100\`, Debian `/home/alex/SMI100/`. Prod — потом |
| Q7 | `incoming/` — один или по командам | ✅ **По командам**: `incoming/LP_A/core.git`, `incoming/LP_B/...` |
| Q8 | Один скрипт с `--mode` или два | ✅ **Два**: `promote_to_smi100.sh` (Alex) + `update_dsp.py` (LP) |
| Q9 | Dev-overlay где | ✅ **Внутри LP_x** (`LP_x/dev-overlays/`, в `.gitignore`) |
| Q10 | JSON-реестр промотирований | ✅ **Да** — `_release_git/promotions.log.json` |

---

## 🚚 Migration guide — переход с старого дизайна на новый

Для команд, которые уже живут на **старом** дизайне (FetchContent без `vendor/`, CMake напрямую в SMI100 каждый раз) — как безболезненно перейти.

### Старый дизайн

```
LP_x/
├── CMakeLists.txt (FetchContent с GIT_REPOSITORY ssh://smi100/...)
├── build/_deps/         ← CMake клонирует сюда при каждом configure
│   ├── dspcore-src/     ← полный клон из SMI100
│   └── ...
└── (vendor/ НЕТ)
```

Проблемы:
- 🐌 Каждый clean build = заново качать из SMI100 всё (долго)
- 🌐 При сбое LAN — не собирается
- 📦 Нельзя перенести LP на изолированный ПК без доп. танцев
- 🤔 `git clone LP_x` даёт только свой код, собирать с нуля нужно SSH-ключи и сеть

---

### Новый дизайн

```
LP_x/
├── CMakeLists.txt (update_dsp.py + FetchContent с SOURCE_DIR на vendor/)
├── vendor/              ← ✅ в git, 100-500 MB, коммитится
│   ├── core/
│   └── ...
├── deps_state.json      ← ✅ в git
├── scripts/update_dsp.py
└── build/               ← transient
```

Преимущества:
- ⚡ Сборка из локальных файлов — быстро
- 🛡 LAN не обязателен (с offline preset)
- 🎒 `git clone` = полный комплект
- 📅 Reproducibility через годы

---

### Пошаговая миграция команды

#### ШАГ 1 — Убедиться в свежем LP-репо

```bash
cd ~/LP_A
git pull
git status  # должно быть clean
```

#### ШАГ 2 — Одноразовый «первый sync» (заполнение vendor/)

```bash
# Делаем старую сборку — один раз, чтобы build/_deps/ заполнился
rm -rf build
cmake --preset zone2   # старый preset, ходит в SMI100 напрямую
cmake --build build    # собирается, build/_deps/ заполнена

# Копируем build/_deps/*-src/ → vendor/
mkdir -p vendor
for dir in build/_deps/*-src; do
    mod=$(basename "$dir" | sed 's/dsp//; s/-src$//')
    cp -r "$dir" "vendor/$mod"
    # Убираем .git папку — vendor/ хранит только исходники + свой маркер
    # (ИЛИ оставить .git — решается в политике команды)
done
ls vendor/
# core/ spectrum/ stats/ ...
```

#### ШАГ 3 — Обновить CMakeLists.txt

Добавить `execute_process` для `update_dsp.py`, установить `FETCHCONTENT_SOURCE_DIR_*`:

```cmake
# Было:
FetchContent_Declare(DspCore
    GIT_REPOSITORY ssh://smi100.local/srv/smi100/smi100_core.git
    GIT_TAG        main
)

# Стало:
if(NOT DSP_OFFLINE_MODE)
    execute_process(COMMAND python3 ${CMAKE_SOURCE_DIR}/scripts/update_dsp.py
                            --mode lp-refresh ...)
endif()
set(FETCHCONTENT_SOURCE_DIR_DSPCORE ${CMAKE_SOURCE_DIR}/vendor/core)
FetchContent_Declare(DspCore)
FetchContent_MakeAvailable(DspCore)
```

Полный пример — [05_Refresh_Mechanics.md](05_Refresh_Mechanics.md#🅱️-вариант-b--python-скрипт-update_dsppy).

#### ШАГ 4 — Обновить CMakePresets.json

Добавить `zone2-offline`, `zone2-dev-*` пресеты. См. [04_Zone2_LP_Workflow.md](04_Zone2_LP_Workflow.md#cmakepresetsjson--пресеты-сборки).

#### ШАГ 5 — Создать `deps_state.json`

```bash
python3 scripts/update_dsp.py --mode lp-refresh
# Автоматически создаст deps_state.json с текущими SHA
```

#### ШАГ 6 — Обновить `.gitignore`

```gitignore
build/
dev-overlays/      ← новое
```

#### ШАГ 7 — Коммит + тестовая сборка

```bash
git add vendor/ deps_state.json CMakeLists.txt CMakePresets.json .gitignore scripts/
git commit -m "migrate to vendored deps (round 3 design)"

# Проверить что новый цикл работает:
rm -rf build
cmake --preset zone2
cmake --build build -j$(nproc)
ctest --test-dir build
```

#### ШАГ 8 — Настроить CI (опционально но рекомендуется)

См. [08_CI_And_Integrity.md](08_CI_And_Integrity.md).

---

### Миграция: checklist команды

- [ ] Старый LP-репо рабочий, сборка проходит
- [ ] Создан `vendor/` с полным набором модулей
- [ ] `scripts/update_dsp.py` скопирован из workspace
- [ ] `CMakeLists.txt` обновлён (execute_process + FETCHCONTENT_SOURCE_DIR)
- [ ] `CMakePresets.json` добавлены новые пресеты
- [ ] `.gitignore` обновлён
- [ ] `deps_state.json` создан и коммичен
- [ ] Новый цикл (clean build → test) прошёл успешно
- [ ] Команда предупреждена о новом workflow
- [ ] CI-pipeline обновлён под новую модель

---

## ⚠️ Ещё не решённые вопросы

### Q7 (из round 4) — финальный путь на SMI100

Сейчас тестовый:
- Windows: `E:\SMI100\`
- Debian: `/home/alex/SMI100/`

**Нужно решить**: финальный путь на реальном production-сервере. Стандартное — `/srv/smi100/`. **Решение до первого production LP**.

### Q-migration-breaking — breaking migration для команд

Если у команды **уже** живой LP_x по старому дизайну с реальной разработкой — миграция может быть болезненной. **Вопрос**: нужен ли отдельный tooling (скрипт-мигратор) или команды делают руками.

**Моя рекомендация**: скрипт `scripts/migrate_to_vendored.sh` автоматизирует ШАГИ 2-6 выше. Пока — руками.

---

## 📚 История изменений этого документа

| Дата | Раунд | Что изменилось |
|------|-------|----------------|
| 2026-04-15 | 1 | Выбрана архитектура V7A/V8 |
| 2026-04-13 | 2 | v2 spec (Layer 1/2) принят в прод |
| 2026-04-19 | 3 | Vendored как основной режим (не overlay) |
| 2026-04-19 | 4 | Q1-Q10 закрыты (8 решений) |
| 2026-04-19 | — | Создана декомпозированная документация (13 файлов) |

---

## 🧭 Дальше

- [../Variants_Report_2026-04-18.md](../Variants_Report_2026-04-18.md) — полный каталог рассмотренных вариантов
- [../../MemoryBank/specs/cmake_git_distribution_spec_2026-04-18.md](../../MemoryBank/specs/cmake_git_distribution_spec_2026-04-18.md) — spec V8 (нужно обновить под round 3-4)
- [../../MemoryBank/specs/cmake_git_aware_build.md](../../MemoryBank/specs/cmake_git_aware_build.md) — v2 спека (в проде, переиспользуется)

---

*10_Decisions_Log.md · 2026-04-19 · Кодо + Alex*
