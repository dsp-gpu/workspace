# 01 · Три зоны и потоки данных

> **Кто это читает**: любой, кто первый раз знакомится с устройством DSP-GPU distribution.
> **Цель**: за 10 минут понять как код доходит от Alex до конечных LP-команд и обратно.
> **Предварительно**: ничего. Терминология поясняется по ходу + [00_Glossary.md](00_Glossary.md).

---

## 🎯 Зачем вообще три зоны

У нас сеть DSP-GPU живёт в **закрытом контуре**:

- Есть машина Alex-а — с интернетом, GitHub-доступом, AI-инструментами. **Это «мастерская»**.
- Есть промежуточный сервер SMI100 — **без интернета**, но с локальной сетью (LAN). **Это «склад»**.
- Есть N серверов LocalProject (LP) — тоже **без интернета**, только LAN к SMI100. **Это «клиенты»**.

Почему так:
- 🔒 **Безопасность**: LP-серверы и SMI100 не должны видеть интернет (IP-защита, attack surface).
- 🧹 **Чистота**: от Alex-а через зоны идёт **только проверенный код**, без экспериментов и черновиков.
- 🏗 **Масштаб**: несколько LP-команд параллельно, у каждой — свой темп обновлений.

---

## 🗺 Картинка в одной схеме

```
         ┌──────────────── ИНТЕРНЕТ ────────────────┐
         │  github.com/dsp-gpu/                     │
         │  • core, spectrum, stats, linalg, ...    │  ← Zone 0
         │  • workspace (MemoryBank, ~!Doc)         │     публичная разработка
         │  • DSP (мета-репо, Python/, Doc/)        │
         └──────────────────┬───────────────────────┘
                            │
                            │  ①  Alex клонирует себе,
                            │     разрабатывает, тестирует,
                            │     ставит теги v*.*.*
                            ▼
         ┌──── ПК Alex (Windows E:\DSP-GPU\) ──────┐
         │  core/, spectrum/, ...  (live work)      │  ← также Zone 0
         │  _release_git/smi100_*.git (bare)        │     (.gitignore workspace)
         │  scripts/promote_to_smi100.sh            │
         └──────────────────┬───────────────────────┘
                            │
                            │  ②  promote_to_smi100.sh <mod> <tag>
                            │     записывает в promotions.log.json
                            │     git push smi100 (ЛОКАЛЬНАЯ СЕТЬ)
                            ▼
         ┌──────────── SMI100 (Debian) ─────────────┐
         │  /srv/smi100/smi100_*.git (release-only) │  ← Zone 1
         │  /srv/smi100/incoming/LP_A/*.git         │     транзит
         │  /srv/smi100/incoming/LP_B/*.git         │
         │  /srv/smi100/backup/nightly.bundle       │
         └──────────────────┬───────────────────────┘
                            │
                            │  ③  cmake configure у LP →
                            │     update_dsp.py --mode lp-refresh
                            │     git fetch из SMI100 →
                            │     vendor/<mod>/ обновлён
                            │
                            │  ④  патчи LP обратно:
                            │     git push в incoming/LP_X/
                            ▼
         ┌─── Zone 2 — N × LocalProject ────────────┐
         │  LP_A/src/, vendor/, deps_state.json     │  ← Zone 2
         │  LP_B/src/, vendor/, deps_state.json     │     потребители
         │  ...                                     │
         │  LP_N/                                   │
         └──────────────────────────────────────────┘
```

---

## 🔑 Три зоны — одной строкой каждая

| Зона | Кто | Где | Что хранит | Интернет |
|------|-----|-----|------------|:--------:|
| **Zone 0** | Alex + GitHub | ПК Alex + `github.com/dsp-gpu/*` | Полная история разработки, MemoryBank, ~!Doc | ✅ |
| **Zone 1** | SMI100 | Debian-сервер в LAN | Только release-теги + incoming-патчи | ❌ |
| **Zone 2** | LP-команды | N LocalProject-ов в LAN | Свой код + vendor/ (копия deps) | ❌ |

---

## 🔄 Четыре потока данных

Код и правки двигаются по зонам в **четырёх направлениях**. Запомнить эти четыре — значит понять весь пайплайн.

### Поток ① — Dev cycle (внутри Zone 0)

Alex разрабатывает, тестирует, ставит теги.

```
github.com/dsp-gpu/core  ◄─ git push/pull ─►  E:\DSP-GPU\core\  (live work)
      ▲                                              │
      │                                              │ git tag v1.2.0
      │                                              │ git push origin v1.2.0
      └──────────────────────────────────────────────┘
```

Полностью в Zone 0. Никто снаружи не видит пока Alex не промотирует.

---

### Поток ② — Promotion (Zone 0 → Zone 1)

Alex вручную продвигает проверенные теги на SMI100.

```
E:\DSP-GPU\core\ (v1.2.0 ✅ проверено)
         │
         │  scripts/promote_to_smi100.sh core v1.2.0
         │  ├─ git push E:\DSP-GPU\_release_git\smi100_core.git refs/tags/v1.2.0
         │  ├─ echo в promotions.log.json (реестр)
         │  └─ git push smi100 refs/tags/v1.2.0 (LAN, SSH)
         ▼
/srv/smi100/smi100_core.git  (тег v1.2.0 теперь здесь)
```

**Ключевые свойства**:
- 👤 Делается **только Alex-ом**, вручную
- 📝 Каждое промотирование логируется в JSON (`_release_git/promotions.log.json`)
- 🔒 На SMI100 pre-receive hook запрещает push не в `refs/tags/*`
- 📦 `smi100_*.git` — это **не зеркала** github, а **отдельные release-only репо**. MemoryBank, ~!Doc, эксперименты — туда **не попадают**.

Подробно — [02_Zone0_Alex_Setup.md](02_Zone0_Alex_Setup.md) + [09_Scripts_Reference.md](09_Scripts_Reference.md).

---

### Поток ③ — Code refresh (Zone 1 → Zone 2)

LP-серверы автоматически подтягивают новые версии при каждой сборке.

```
/srv/smi100/smi100_core.git (v1.3.0 появилось!)
         │
         │  cmake configure у LP_A:
         │  ├─ execute_process(python update_dsp.py --mode lp-refresh)
         │  │  ├─ git ls-remote smi100_core.git → v1.3.0
         │  │  ├─ сравнить с deps_state.json (сейчас v1.2.0)
         │  │  ├─ git fetch → git checkout в vendor/core/
         │  │  └─ обновить deps_state.json
         │  └─ cmake --build → из vendor/core/ (без сети)
         ▼
LP_A/vendor/core/ (теперь v1.3.0)
```

**Ключевые свойства**:
- 🤖 **Автоматически** при каждом `cmake configure`, без ручного вмешательства
- 🏠 `vendor/` **лежит в git LP_x** — клон сразу содержит полный комплект
- 🌐 Сеть нужна **только** на этапе configure (и только к SMI100); собирается — локально
- 🧊 Можно **заморозить** (pin) — [05_Refresh_Mechanics.md](05_Refresh_Mechanics.md#pin)

Подробно — [04_Zone2_LP_Workflow.md](04_Zone2_LP_Workflow.md) + [05_Refresh_Mechanics.md](05_Refresh_Mechanics.md).

---

### Поток ④ — Patch flow (Zone 2 → Zone 0, редко)

LP находит баг или хочет breaking change — отправляет правки обратно Alex-у.

```
LP_A/dev-overlays/core/  (исправленный код)
         │
         │  git checkout -b breaking/fix-nan-handling
         │  git push incoming-smi100 breaking/fix-nan-handling
         ▼
/srv/smi100/incoming/LP_A/core.git (ветка breaking/fix-nan-handling)
         │
         │  Alex:
         │  ├─ git fetch incoming-smi100
         │  ├─ review, merge в E:\DSP-GPU\core\
         │  ├─ git tag v1.3.1 + git push github
         │  └─ promote_to_smi100.sh core v1.3.1
         ▼
/srv/smi100/smi100_core.git (тег v1.3.1 — фикс LP_A применён)
         │
         │  На следующем cmake configure у LP_A:
         │  update_dsp.py увидит v1.3.1 → vendor/core/ обновится → commit
         ▼
LP_A собирается с v1.3.1 (свой же фикс, через общий канал)
```

**Ключевые свойства**:
- ⬆️ Идёт **снизу вверх**, в обратном направлении потока ③
- 📁 Отдельные репо `incoming/LP_A/`, `incoming/LP_B/` — разделение по командам (аудит, права)
- 🔒 LP-user имеет **write** в свой `incoming/LP_X/`, но **read-only** в основные `smi100_*.git`
- 🧪 Alex валидирует, при необходимости правит, только потом промотирует
- 🔄 Возврат фикса к LP — через обычный поток ③ (автоматически при следующем `cmake configure`)

Подробно — [06_Patch_Flow.md](06_Patch_Flow.md).

---

## 🎒 Специальный случай — Transfer (Zone 2 → изолированный ПК)

Когда LP нужно перенести на ПК **без SMI100 и без LAN** (например, клиент у себя).

```
LP_A на сервере команды      (развёрнутый, vendor/ свежий)
         │
         │  1. cmake --build build && ctest  (проверили — всё зелёное)
         │  2. git add vendor/ deps_state.json
         │  3. git commit -m "transfer candidate"
         │  4. git clone LP_A → USB / SFTP
         ▼
Изолированный ПК у клиента  (нет SMI100, нет интернета)
         │
         │  cmake --preset zone2-offline
         │  cmake --build build  → работает из vendor/ локально
         ▼
Собран, клиент работает
```

**Почему работает**: `vendor/` в git + `deps_state.json` в git → после `git clone` у тебя на диске **все исходники**, никаких обращений в SMI100 не нужно.

**Требование**: перед transfer — **обязательно** полный цикл `cmake+build+ctest+commit` (чтобы vendor/ был свежий и проверенный).

Подробно — [07_Transfer_To_Offline_PC.md](07_Transfer_To_Offline_PC.md).

---

## 🧭 Куда теперь идти

| Твоя цель | Следующий файл |
|-----------|----------------|
| Понять что где физически лежит (имена папок, файлов) | [02_Zone0_Alex_Setup.md](02_Zone0_Alex_Setup.md), [03_Zone1_SMI100_Setup.md](03_Zone1_SMI100_Setup.md), [04_Zone2_LP_Workflow.md](04_Zone2_LP_Workflow.md) |
| Разобраться как именно работает автообновление vendor/ | [05_Refresh_Mechanics.md](05_Refresh_Mechanics.md) |
| Узнать про патч-флоу в деталях | [06_Patch_Flow.md](06_Patch_Flow.md) |
| Список всех скриптов с примерами | [09_Scripts_Reference.md](09_Scripts_Reference.md) |
| Не понял какой-то термин | [00_Glossary.md](00_Glossary.md) |

---

*01_Zones_Overview.md · 2026-04-19 · Кодо + Alex*
