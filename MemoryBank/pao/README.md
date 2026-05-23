# MemoryBank/pao/ — Starter Kit для rag-mentor / rag-pao

> **Назначение**: полностью рабочий набор документов и шаблонов для старта проекта **rag-mentor ↔ rag-pao** (dual-RAG: oracle + executor).
> **Источник**: 4 spec'и v0.2 от 2026-05-20 + dopolnenie v1.1 + review v1.0 от 2026-05-23.
> **Применение**: копировать в новые репо одной командой (см. §3).

---

## 1. Что внутри

```
MemoryBank/pao/
│
├── README.md                       ← этот файл — навигатор
│
├── specs/                          📚 финальные спецификации v0.3
│   ├── INDEX.md                    ← карта документов + порядок чтения
│   ├── 01_architecture_v0.3.md     ← обзор + dual-RAG диаграмма + 33 решения
│   ├── 02_structure_v0.3.md        ← структура rag-mentor + rag-pao + pao_<name>
│   ├── 03_phases_v0.3.md           ← HI-RAG L0-L5 + 11 фаз (00-09 + 09.A collectors)
│   ├── 04_policies_v0.3.md         ← anti-hallucination + journal + 2 режима доступа
│   └── 05_dataset_v8_reference.md  ← план collectors для QLoRA (от сестры Sonnet 4.6)
│
├── tasks/                          📋 готовые таски для старта
│   ├── TASK_Phase00_Bootstrap.md   ← создать скелет 2 репо (1.5-2 дня)
│   └── TASK_Phase01_Infra.md       ← preview: docker + БД + MCP + Qwen (2 дня)
│
├── templates/                      📦 копипаст в новый проект
│   │
│   ├── rag-mentor/                 ← скелет mentor-репо
│   │   ├── CLAUDE.md               ← глобальные правила Кодо в этом репо
│   │   ├── README.md               ← quick start для нового пользователя
│   │   ├── .env.example
│   │   ├── .gitignore
│   │   ├── pyproject.toml
│   │   ├── config/
│   │   │   ├── targets.yaml.example
│   │   │   ├── stack.dev.json
│   │   │   ├── stack.prod.json
│   │   │   ├── mcp_servers.yaml
│   │   │   └── secrets.env.example
│   │   └── MemoryBank/MASTER_INDEX.md.template
│   │
│   ├── rag-pao/                    ← скелет executor-репо
│   │   ├── CLAUDE.md
│   │   ├── README.md
│   │   ├── .env.example
│   │   ├── .gitignore
│   │   ├── pyproject.toml
│   │   ├── config/
│   │   │   ├── targets.yaml.example
│   │   │   └── secrets.env.example
│   │   ├── pipelines/_template/    ← шаблон pipeline для нового target
│   │   │   ├── pipeline.yaml.template
│   │   │   ├── collectors/README.md     (10 коллекторов P0/P1/P2)
│   │   │   ├── prompts_override/README.md
│   │   │   ├── golden_set/Q1_Q10_acceptance.template.jsonl
│   │   │   └── README.md
│   │   └── MemoryBank/MASTER_INDEX.md.template
│   │
│   └── pao_drop/                   ← шаблон customer drop'а
│       └── _META.yaml.template
│
└── rules/                          📐 Claude Code правила (17+17)
    ├── mentor/                     ← 17 правил для rag-mentor/.claude/rules/
    │   ├── 00-new-task-workflow.md ... 17-access-modes.md
    └── pao/                        ← 17 правил для rag-pao/.claude/rules/
        └── 00-new-task-workflow.md ... 17-access-modes.md
```

---

## 2. Порядок чтения (новый пользователь)

1. **`specs/INDEX.md`** — карта документов и зависимостей.
2. **`specs/01_architecture_v0.3.md`** — что это вообще такое (dual-RAG).
3. **`specs/02_structure_v0.3.md`** — как разложено по каталогам.
4. **`specs/03_phases_v0.3.md`** — порядок работ (фазы 00-09).
5. **`specs/04_policies_v0.3.md`** — критические правила (anti-hallucination + 2 режима + журнал).
6. **`tasks/TASK_Phase00_Bootstrap.md`** — что делать прямо сейчас.

---

## 3. Как стартовать новый проект

### Шаг 1 — Создать репо

```bash
# rag-mentor (git, github)
mkdir -p /home/alex/rag-mentor && cd $_
git init -b main
git config user.name "Alex Lan"
git config user.email "diving_73@gmail.com"

# rag-pao (локальный git, без remote — D18)
mkdir -p /home/alex/rag-pao && cd $_
git init -b main
git config user.name "Alex Lan"
git config user.email "diving_73@gmail.com"
```

### Шаг 2 — Скопировать шаблоны

```bash
cd /e/DSP-GPU/MemoryBank/pao
cp -r templates/rag-mentor/. /home/alex/rag-mentor/
cp -r templates/rag-pao/.    /home/alex/rag-pao/
cp -r rules/mentor/*.md      /home/alex/rag-mentor/MemoryBank/.claude/rules/
cp -r rules/pao/*.md         /home/alex/rag-pao/MemoryBank/.claude/rules/
```

### Шаг 3 — Скопировать specs (опционально, как референс)

```bash
mkdir -p /home/alex/rag-mentor/MemoryBank/specs
cp specs/*.md /home/alex/rag-mentor/MemoryBank/specs/
```

### Шаг 4 — Заполнить config

```bash
cd /home/alex/rag-mentor
cp config/secrets.env.example config/secrets.env
vim config/secrets.env       # заполнить ANTHROPIC_API_KEY, POSTGRES_PASSWORD, ...

cd /home/alex/rag-pao
cp config/targets.yaml.example config/targets.yaml
vim config/targets.yaml      # добавить свои pao_<name>
```

### Шаг 5 — Запустить Phase 00

Открыть оба репо в Claude Code → Кодо подхватит CLAUDE.md + 17 rules → дать команду «делай Phase 00 Bootstrap».

---

## 4. Ключевые принципы (TL;DR)

| Принцип | Где зафиксировано |
|---------|-------------------|
| **Dual-RAG**: mentor (oracle) + pao (executor) | `01_architecture §2` |
| **Customer drops** = external roots (`/srv/pao_<name>/`), доступ через `targets.yaml` | `02_structure §3` + `pao_drop/_META.yaml.template` |
| **Per-target раскладка** в `pao_<name>/`: `contrib/<module>/` + `Doc/Example/Test/GTest/contrib/<module>/` | `02_structure §4` |
| **rag-pao = 3 слоя**: `core/` (stable) + `pipelines/<name>_vN/` (frozen) + `current/` (active dev) | `02_structure §6` |
| **2 режима доступа Кодо**: `debug` (full REST) ↔ `production` (safe-endpoints для NDA) | `04_policies §E` |
| **Collectors для QLoRA**: 10 коллекторов в `pipelines/_template/collectors/` (от dataset_v8_plan) | `03_phases §10` (Phase 09.A) + `05_dataset_v8_reference.md` |
| **Sync** mentor ↔ pao через git bare remote `/srv/git-remotes/rag-pao.git` | `04_policies §F` |
| **Anti-hallucination** = приоритет №1 | `04_policies §A` |
| **NO pytest** — TestRunner + SkipTest | `rules/*/04-testing-python.md` |
| **YAML** для конфигов, **JSON Schema** для Qwen strict output | везде |

---

## 5. Источники (внешние)

| Файл в DSP-GPU MemoryBank | Что |
|---------------------------|-----|
| `specs/rag_mentor_architecture_2026-05-20.md` | v0.2 architecture (родитель) |
| `specs/rag_mentor_structure_2026-05-20.md` | v0.2 structure (родитель) |
| `specs/rag_mentor_phases_2026-05-20.md` | v0.2 phases (родитель) |
| `specs/rag_mentor_policies_2026-05-20.md` | v0.2 policies (родитель) |
| `specs/rag_mentor_structure_dopolnenie_2026-05-23.md` | v1.1 — правки за раунды 1-5 |
| `specs/rag_mentor_review_2026-05-23.md` | v1.0 — deep review (gaps + collectors gap) |
| `specs_Linux_Radion_9070/dataset_v8_plan_2026-05-21.md` | план 10 коллекторов для QLoRA (сестра Sonnet 4.6) |
| `tasks/TASK_RAG_MENTOR_Phase00_Bootstrap.md` | v0.4 (источник для `tasks/TASK_Phase00_Bootstrap.md` здесь) |

---

## 6. Версионирование starter kit

| Что меняем здесь | Когда |
|------------------|-------|
| `specs/*.md` v0.3 | при появлении нового spec'а в DSP-GPU родителях |
| `templates/**` | при изменении принятых решений D21-D33 |
| `rules/{mentor,pao}/*.md` | при появлении нового правила в DSP-GPU |
| `tasks/*.md` | при обновлении Phase 00 / Phase 01 в DSP-GPU |

**Bump version**: меняем `specs/01_architecture_v0.3.md` header → v0.4, обновляем зависимые.

---

*Created 2026-05-23 · Maintained by Кодо · Для нового проекта rag-mentor/rag-pao.*
