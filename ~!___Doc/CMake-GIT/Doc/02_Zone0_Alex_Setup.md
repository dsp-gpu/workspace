# 02 · Zone 0 — ПК Alex + публичный GitHub

> **Кто это читает**: Alex (для операций), новый разработчик в команде DSP-GPU (для контекста).
> **Цель**: полная раскладка того, что живёт на ПК Alex, и как работать с этим.

---

## 🏛 File layout

### На GitHub (публичный)

```
github.com/dsp-gpu/
├── workspace               ← корневой репо: CLAUDE.md, MemoryBank/, .vscode/, dsp_modules.json, scripts/
├── core                    ← DrvGPU (backend, profiler, logger)
├── spectrum                ← FFT + filters + lch_farrow
├── stats                   ← statistics (welford/median/radix + SNR)
├── signal_generators       ← CW / LFM / Noise / Script / FormSignal
├── heterodyne              ← LFM Dechirp, NCO, Mix
├── linalg                  ← vector_algebra + capon
├── radar                   ← range_angle + fm_correlator
├── strategies              ← pipeline v1, v2...
└── DSP                     ← мета-репо (Python/, Doc/)
```

Все публичные, открыты для AI-инструментов и коллабораторов.

---

### На ПК Alex (`E:\DSP-GPU\`)

```
E:\DSP-GPU\                                     ← корень workspace (github.com/dsp-gpu/workspace)
│
├── CLAUDE.md                                   ← инструкции для AI
├── DSP-GPU.code-workspace                      ← VSCode multi-folder
├── dsp_modules.json                            ← SSOT манифест модулей (планируется)
│
├── MemoryBank/                                 ← specs / tasks / changelog (в git workspace)
│                                                 ⚠ НЕ уезжает в Zone 1 (IP-защита)
├── ~!Doc/                                      ← проектная документация (в git workspace)
│   └── CMake-GIT/
│       ├── Doc/                                ← эта документация
│       ├── Variants_Report_2026-04-18.md
│       ├── 1_…6_*.md, Primer.md, Git_ALL.md
│       ├── Review_*.md
│       └── update_dsp.py                       ← исходник скрипта, перенести → scripts/
│                                                 ⚠ НЕ уезжает в Zone 1
├── .vscode/ / .claude/                         ← служебные файлы IDE / AI
│                                                 ⚠ НЕ уезжает в Zone 1
│
├── scripts/                                    ← автоматизация (создать в Фазе 0)
│   ├── init_release_repos.sh                   ← создаёт _release_git/smi100_*.git
│   ├── promote_to_smi100.sh                    ← промотирование одного тега
│   ├── promote_breaking_change.sh              ← atomic sync промотирование
│   ├── update_dsp.py                           ← для LP (Zone 2), перенесён сюда
│   ├── generate_cmake_deps.py                  ← из dsp_modules.json → fetch_deps.cmake
│   ├── topo_sort.py                            ← топо-сортировка из manifest
│   └── freeze_for_transfer.sh                  ← опционально для R-offline
│
├── core/                        ┐
├── spectrum/                    │
├── stats/                       │
├── signal_generators/           │  ← LIVE dev checkouts, отдельные git-репо
├── heterodyne/                  │     каждый связан с github.com/dsp-gpu/<name>
├── linalg/                      │     здесь Alex разрабатывает и тестирует
├── radar/                       │
├── strategies/                  │
├── DSP/                         ┘
│
└── _release_git/                               ← 🆕 RELEASE-only bare репо
    │                                             ⚠ В .gitignore workspace → не в github
    │                                             📝 Только Alex имеет доступ
    │
    ├── smi100_core.git/                        ← bare (без рабочей копии)
    ├── smi100_spectrum.git/                    │   • только теги v*.*.*
    ├── smi100_stats.git/                       │   • история разработки НЕ попадает
    ├── smi100_signal_generators.git/           │   • parallel к github.com/dsp-gpu/<mod>
    ├── smi100_heterodyne.git/                  │     (НЕ зеркала)
    ├── smi100_linalg.git/
    ├── smi100_radar.git/
    ├── smi100_strategies.git/
    │
    └── promotions.log.json                     ← 🆕 РЕЕСТР ПРОМОТИРОВАНИЙ
                                                   (решение Alex 2026-04-19)
```

---

## 📝 `promotions.log.json` — реестр промотирований

### Зачем

Доп-контроль: Alex хочет **точно знать** какой тег когда был промотирован на SMI100. Полезно при:
- Расследовании «почему у LP_A старая версия?» — смотришь реестр: «last promote core 2026-03-15, v1.2.0»
- Откате: «вчера промотировал v2.0.0, но оно сломало LP — откатываюсь обратно на v1.9.0»
- Аудите безопасности: кто / когда / что перенёс в закрытый контур

### Формат

```json
{
  "schema_version": 1,
  "created": "2026-04-19T00:00:00+03:00",
  "promotions": [
    {
      "module":       "core",
      "tag":          "v1.2.0",
      "src_sha":      "abc123def456789...",
      "promoted_at":  "2026-04-19T14:32:10+03:00",
      "promoted_by":  "alex",
      "note":         "после приёмки LFM-фикса"
    },
    {
      "module":       "spectrum",
      "tag":          "v1.1.5",
      "src_sha":      "fed456cba...",
      "promoted_at":  "2026-04-20T10:15:00+03:00",
      "promoted_by":  "alex",
      "note":         "minor patch, обратно-совместимо"
    }
  ]
}
```

### Поля

| Поле | Обязательно | Формат | Пример |
|------|:-----------:|--------|--------|
| `module` | ✅ | snake_case, из `dsp_modules.json` | `"core"` |
| `tag` | ✅ | `v<major>.<minor>.<patch>` | `"v1.2.0"` |
| `src_sha` | ✅ | SHA commit-а под тегом (для валидации) | `"abc123..."` |
| `promoted_at` | ✅ | ISO 8601 с таймзоной | `"2026-04-19T14:32:10+03:00"` |
| `promoted_by` | ✅ | имя / username | `"alex"` |
| `note` | ❌ | произвольный текст | `"RC candidate"` |

### Правила

- ✍️ Пишется **только** скриптом `promote_to_smi100.sh`, не руками
- 📌 **Append-only** — удалять записи нельзя (для аудита)
- 💾 Коммитится в `E:\DSP-GPU\_release_git\` (внутри папки, но она **в .gitignore workspace**) → **не попадает на github**
- 🔒 Для доп-страховки: отдельный бэкап — `cp promotions.log.json MemoryBank/changelog/promotions_$(date).json.bak` раз в неделю (необязательно, но полезно)

---

## ⚙️ Почему `_release_git/` в .gitignore

Файл `E:\DSP-GPU\.gitignore` (репо workspace) должен содержать:

```gitignore
# Release-only bare repos — не публикуем в github
_release_git/

# Прочее служебное
.vscode/
.claude/
*.pyc
__pycache__/
build/
```

Причины:
1. **IP-защита**: release-flow — внутренний процесс DSP-GPU, в public github его показывать не нужно
2. **Размер**: bare-репо могут занимать десятки МБ каждый — лишний balласт для workspace-репо
3. **Путаница**: `smi100_*.git` — **не** dev-версии, новый контрибьютор может случайно пушить туда

---

## 🔧 Основные операции Alex

### Создать `_release_git/` (один раз)

```bash
cd E:\DSP-GPU
mkdir _release_git
bash scripts/init_release_repos.sh
# → создаёт smi100_{core,spectrum,stats,...}.git и пустой promotions.log.json
```

Идемпотентно — повторный запуск просто пропустит существующие.

---

### Промотировать тег

```bash
# 1. Убедиться что тег существует в live-checkout
cd E:\DSP-GPU\core
git tag -l v1.2.0            # должно вывести "v1.2.0"

# 2. Промотировать
bash E:\DSP-GPU\scripts\promote_to_smi100.sh core v1.2.0

# Под капотом:
# → git push _release_git/smi100_core.git refs/tags/v1.2.0
# → append в promotions.log.json
# → git push smi100 refs/tags/v1.2.0 (если remote настроен)
```

Вывод:
```
[2026-04-19 14:32:10] ✅ core@v1.2.0 → _release_git/smi100_core.git
[2026-04-19 14:32:11] ✅ core@v1.2.0 → smi100 (LAN)
[2026-04-19 14:32:11] 📝 promotions.log.json: запись добавлена
```

Подробности про скрипт — [09_Scripts_Reference.md#promote_to_smi100sh](09_Scripts_Reference.md#promote_to_smi100sh).

---

### Промотировать несколько модулей атомарно (breaking change)

Когда нужно согласованно выкатить новые версии нескольких связанных модулей (например, stats v2.0.0 + radar v2.0.0 после breaking change в API):

```bash
# Файл config.yaml:
#   modules:
#     - name: stats
#       tag:  v2.0.0
#     - name: radar
#       tag:  v2.0.0
#     - name: strategies
#       tag:  v2.1.0

bash scripts/promote_breaking_change.sh config.yaml
```

Скрипт:
- Выполняет топо-сортировку (из `dsp_modules.json`): сначала зависимости, потом зависимые
- Промотирует по порядку, останавливаясь на первой ошибке (fail-fast)
- Пишет все операции в `promotions.log.json` (каждая — отдельной записью)

Подробнее — [09_Scripts_Reference.md#promote_breaking_changesh](09_Scripts_Reference.md#promote_breaking_changesh).

---

### Проверить состояние `_release_git/`

```bash
# Какие теги есть в release-bare?
cd E:\DSP-GPU\_release_git\smi100_core.git
git tag -l

# Последние 5 промотирований?
cat E:\DSP-GPU\_release_git\promotions.log.json | jq '.promotions[-5:]'

# Какой самый свежий тег для каждого модуля?
cat promotions.log.json | jq -r '.promotions | group_by(.module) | map({mod: .[0].module, latest: max_by(.promoted_at) | .tag}) | .[]'
```

---

### Откатить промотирование (rollback)

**Правило**: **Теги никогда не переписываются и не удаляются.** Вместо отката — промотировать **более раннюю** версию поверх:

```bash
# Ошибка: промотировал core v2.0.0, сломало LP_A
# Решение: промотирую core v1.9.5 (предыдущий стабильный) — LP возьмёт его автоматически
bash scripts/promote_to_smi100.sh core v1.9.5

# В реестр это запишется как новая запись (с пояснением):
# { "module": "core", "tag": "v1.9.5", "note": "rollback: v2.0.0 сломал LP_A, возврат на stable" }
```

После этого LP через очередной `cmake configure` → `update_dsp.py --mode lp-refresh` сравнит свой SHA с SHA v1.9.5 и откатится.

Подробнее — [10_Decisions_Log.md](10_Decisions_Log.md).

---

## 🔒 Что НЕ уезжает в Zone 1

Перечень явно:

| Папка / файл | Причина |
|--------------|---------|
| `MemoryBank/` | внутренняя documentation/tasks Alex-а и Кодо |
| `~!Doc/` | проектные доки, включая эту документацию |
| `.vscode/` / `.claude/` | IDE / AI настройки |
| `dsp_modules.json` | используется Alex-ом для генерации, LP-ам не нужен |
| `_release_git/promotions.log.json` | внутренний аудит-реестр |
| `core/tests/`, `*/tests/` | тесты модулей остаются доступными LP (идут с исходниками) |

**Что уезжает**: только исходники модулей `core/`, `spectrum/`, ..., `strategies/` — и только по проверенным тегам через `smi100_*.git`.

---

## ✅ Чеклист правильной настройки Zone 0

- [ ] `E:\DSP-GPU\` клонирован из `github.com/dsp-gpu/workspace`
- [ ] Все 9 модулей склонированы как subfolders (без submodules)
- [ ] `.gitignore` содержит `_release_git/`
- [ ] `_release_git/smi100_*.git` созданы через `init_release_repos.sh`
- [ ] `_release_git/promotions.log.json` существует (создаётся автоматически)
- [ ] `scripts/` содержит все автоматизационные скрипты
- [ ] Настроен SSH-ключ для push на SMI100 (подробно — [03_Zone1_SMI100_Setup.md](03_Zone1_SMI100_Setup.md))
- [ ] `_release_git/smi100_<mod>.git` имеют remote `smi100` указывающий на SMI100

---

## 🧭 Дальше

- [03_Zone1_SMI100_Setup.md](03_Zone1_SMI100_Setup.md) — SMI100 в деталях
- [09_Scripts_Reference.md](09_Scripts_Reference.md#promote_to_smi100sh) — полный API `promote_to_smi100.sh`
- [12_Security_Model.md](12_Security_Model.md) — SSH, права, guardrails
- [10_Decisions_Log.md](10_Decisions_Log.md) — почему именно эта структура

---

*02_Zone0_Alex_Setup.md · 2026-04-19 · Кодо + Alex*
