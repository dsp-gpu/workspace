# TASK_Phase00_Bootstrap

> **Версия**: 0.4 (3 слоя rag-pao + 2 режима доступа + 9 mentor подпакетов + access_control + collectors + observability) · **Дата**: 2026-05-23
> **Status**: ✅ READY TO START — ждёт команды Alex «делай Phase 00»
> **Estimate**: **2 рабочих дня** (12-16 часов)
> **Зависит от**: 6 spec'ов v0.3 в `../specs/` (см. INDEX.md)
>
> **Конфигурация (зафиксирована в spec 01 §3)**:
> - GitHub org = `rag-mentor`
> - LICENSE = Apache-2.0
> - Git email = `diving_73@gmail.com`
> - Collectors → `pipelines/_template/collectors/` (D33)
> - Q1-Q10 acceptance: Alex для DSP-GPU pilot, Кодо синтезирует для новых targets

---

## 🎯 Цель фазы 00

Создать **скелет двух каталогов** `rag-mentor/` (git → github) и `rag-pao/` (локальный git) **со всей инфраструктурой MemoryBank + dual-RAG dirs + 3 слоя pao + access_control + 7 MCP**.

К концу фазы оба каталога открываются в Claude Code, CLAUDE.md грузится, rules видны, mentor имеет скелет `mentor_db/`, pao имеет 3 слоя (`core/ + pipelines/_template/ + current/`) + `access_control/` + `targets.yaml`.

**Из чего исходим**:
- 6 spec'ов v0.3 в `MemoryBank/pao/specs/` (см. INDEX.md) — все утверждены.
- Code (`*.py`, БД init scripts) **ещё не пишем** — Phase 00 чисто организационная.

---

## ✅ Acceptance criteria (gates)

| # | Gate | Как проверить |
|---|------|---------------|
| **G1** | git репо инициализированы в обоих | `git status` clean в обоих |
| **G2** | rag-mentor имеет remote `github.com/rag-mentor/rag-mentor` (private, **push после OK Alex**) | `git remote -v` показывает origin |
| **G3** | rag-pao имеет локальный git без remote | `git -C rag-pao remote -v` пусто |
| **G4** | 16 rules файлов в каждом (с реальным содержимым или CAN-DEFER placeholder) | `ls .claude/rules/*.md \| wc -l` == 16 в обоих, каждый ≥ 5 строк |
| **G4b** | Claude Code открывает оба и грузит rules | manual: команда «покажи 10 правило» → выводит содержимое |
| **G5** | CLAUDE.md в каждом каталоге — корректный | manual review Alex'а |
| **G6** | Все каталоги созданы (включая `.gitkeep`) | `find <repo> -type d \| wc -l` ≥ 40 в каждом |
| **G7** | Нет hardcoded путей `E:\...` / `/home/alex/...` в CLAUDE.md/.md | `grep -rE 'E:\\\\\|/home/alex' rag-mentor/ rag-pao/` пусто (кроме README) |
| **G8** | `.env.example` в обоих, `.env` НЕ в git | `git ls-files \| grep '^\.env$'` пусто |
| **G9** | `README.md` показывает quick start | manual review |
| **G10** 🆕 | `rag-mentor/rag_mentor/` пакет с 8 подпакетами создан | `ls rag_mentor/ ` показывает: orchestrator/ prompt_builder/ oracle/ reviewer/ comparator/ critic/ rag_pao_client/ name_validator/ journal/ utils/ |
| **G11** 🆕 | `rag-pao/rag_pao/core/` STABLE LAYER создан | `ls rag_pao/core/` → indexer/ retrieval/ llm_serving/ journal/ api/ access_control/ utils/ |
| **G12** 🆕 | `rag-pao/pipelines/_template/` + `current/` (3 слоя) | `ls rag-pao/` → rag_pao/, pipelines/_template/, current/ присутствуют |
| **G13** 🆕 | `mentor_db/` + `pao_db/` каталоги созданы | `ls rag-mentor/mentor_db/tables/` и `ls rag-pao/pao_db/migrations/` |
| **G14** 🆕 | `rag-mentor/mcp_servers/` имеет 7 подкаталогов | `ls rag-mentor/mcp_servers/` → context7_local/ sequential_thinking/ filesystem/ git_mcp/ postgres_mcp/ qdrant_mcp/ memory_mcp/ |
| **G15** 🆕 | `rag-pao/config/targets.yaml` с `mode: debug` + примером pao_contrib | `cat rag-pao/config/targets.yaml \| grep -E 'mode:\|codo_access:'` |

**Phase 00 закрыта когда**: G1-G15 все ✅, Alex даёт OK «Phase 00 PASS».

---

## 📋 Sub-tasks

### 00-0 — Pre-flight (правило 03-worktree-safety)

```bash
pwd                                          # НЕ под .claude/worktrees/*
git rev-parse --show-toplevel 2>/dev/null

# проверить что rag-mentor / rag-pao не существуют или пусты
ls "E:\rag-mentor" 2>$null
ls "E:\rag-pao" 2>$null

# ~/.claude/CLAUDE.md существует
ls "C:\Users\user\.claude\CLAUDE.md"
```

Если хоть один check fails → стоп, спросить Alex.

### 00-1 — git init rag-mentor

```bash
mkdir -p "E:\rag-mentor"
cd "E:\rag-mentor"
git init -b main
git config user.name "Alex Lan"
git config user.email "diving_73@gmail.com"
```

### 00-2 — git init rag-pao (локальный, без remote)

```bash
mkdir -p "E:\rag-pao"
cd "E:\rag-pao"
git init -b main
git config user.name "Alex Lan"
git config user.email "diving_73@gmail.com"
# NO remote (D18)
```

### 00-3 — Скелет rag-mentor/ (9 подпакетов + mentor_db + 7 MCP)

```
rag-mentor/
├── CLAUDE.md  README.md  LICENSE  .gitignore  pyproject.toml
├── MemoryBank/
│   ├── .claude/
│   │   ├── rules/                  16 файлов (00-6)
│   │   └── specs/                  DSPy_comparison/TextGrad/RAPTOR/HierarchicalIncrementalRAG placeholders
│   ├── specs/
│   ├── tasks/
│   ├── prompts/
│   │   ├── for_mentor/v1/{reviewer,critic,builder_meta,comparator}/
│   │   └── for_rag_pao/v1/{schemas,fewshot}/
│   ├── sessions/
│   ├── changelog/
│   └── feedback/
│
├── rag_mentor/                     🆕 Python пакет (v0.5) — 9 подпакетов
│   ├── __init__.py
│   ├── orchestrator/__init__.py
│   ├── prompt_builder/__init__.py
│   ├── oracle/__init__.py          🆕 retrieval/reasoner/fallback
│   ├── reviewer/__init__.py
│   ├── comparator/__init__.py      🆕 diff_vs_etalon/issue_categorizer
│   ├── critic/__init__.py
│   ├── rag_pao_client/__init__.py  + AccessAwareMixin (D36)
│   ├── anti_hallucination/__init__.py  🆕 D34 (client-side wrapper над common/)
│   ├── journal/__init__.py
│   └── utils/__init__.py
│
├── mentor_db/                      🆕 свой PG + Qdrant
│   ├── postgres_init.sql.template
│   ├── qdrant_bootstrap.py.template
│   ├── tables/{prompts,golden_sets,sessions,target_metadata,eval_runs}.sql.template
│   ├── migrations/                 (пусто — alembic в Phase 01)
│   └── README.md
│
├── mcp_servers/                    🆕 7 локальных MCP (placeholder configs)
│   ├── context7_local/README.md
│   ├── sequential_thinking/README.md
│   ├── filesystem/README.md
│   ├── git_mcp/README.md
│   ├── postgres_mcp/README.md
│   ├── qdrant_mcp/README.md
│   └── memory_mcp/README.md
│
├── tests/{fixtures,}              # all_test.py + test_*.py placeholders
├── scripts/                       # bootstrap.sh, sync_prompts_to_pao.sh, eval_run.sh placeholders
└── config/
    ├── stack.dev.json
    ├── stack.prod.json
    ├── targets.yaml               # зеркало rag-pao/config/targets.yaml
    ├── mcp_servers.yaml
    └── secrets.env.example
```

### 00-4 — Скелет rag-pao/ (3 слоя core/pipelines/current + access_control + anti_hallucination)

```
rag-pao/
├── CLAUDE.md  README.md  LICENSE  .gitignore  pyproject.toml
├── MemoryBank/
│   ├── .claude/{rules,specs}/
│   ├── specs/  tasks/  sessions/  changelog/
│   └── prompts/v1/                # пусто, заполнится sync'ом из rag-mentor
│
├── rag_pao/                        🆕 Python пакет (v0.4)
│   ├── __init__.py
│   ├── core/                       🔵 STABLE CORE (8 подпакетов)
│   │   ├── indexer/{ast,chunking,hash_skip}/  doxytags_reuse.py
│   │   ├── retrieval/{embedder,filters}/  hybrid_retriever.py  reranker.py
│   │   ├── llm_serving/clients/  model_router.py    # D34: name_validator вынесен
│   │   ├── anti_hallucination/                     🆕 D34: name_validator/schema_lint/doxygen_lint/forbidden_terms_loader
│   │   ├── journal/{per_prompt,per_class}.py.template
│   │   ├── api/{rest,mcp}/         show_file/show_signature/show_symbols/retrieve/run_filler/run_judge/save_rag/health (placeholders)
│   │   ├── access_control/         🆕 mode_switch.py + nda_guard.py (D25)
│   │   └── utils/
│   ├── orchestrator/
│   └── analysis/
│
├── pipelines/                      🟡 PER-TARGET FROZEN SNAPSHOTS
│   ├── _template/                  🆕 шаблон для нового target
│   │   ├── pipeline.yaml.template
│   │   ├── collectors/             🔗 D33 — 10 категорий из dataset_v8_plan
│   │   │   ├── patterns/           reverse_patterns/synonym_pairs/confusion_negatives placeholders
│   │   │   ├── facts/              class_facts/build_cmake_facts/migration_history placeholders
│   │   │   ├── docs/               architecture_docs/lessons_learned placeholders
│   │   │   ├── code/               hip_kernels/hip_primitives/code_templates placeholders
│   │   │   ├── style/              api_style/idioms/error_handling placeholders
│   │   │   ├── pybind/             placeholders
│   │   │   ├── listings/           multi_class_listing placeholders
│   │   │   └── README.md           naming convention + ссылка на dataset_v8_plan_2026-05-21.md
│   │   ├── prompts_override/
│   │   ├── golden_set/             Q1-Q10 acceptance template
│   │   └── README.md
│   └── README.md                   как создать новый pao_<name>_v1 из _template/
│
├── current/                        🟢 ACTIVE DEVELOPMENT (пустое в Phase 00)
│   ├── pipeline.yaml
│   ├── collectors/
│   ├── prompts_override/
│   └── golden_set/
│
├── targets/                        📁 symlinks/submodules (D21)
│   ├── README.md                   «здесь только symlinks к /srv/pao_<name>/»
│   └── _meta/
│       └── targets.yaml            🆕 ИСТОЧНИК ИСТИНЫ путей (см. spec 02 §5)
│
├── finetune/
│   ├── dataset_builders/           v8.py + dedup.py placeholders (D33)
│   ├── train/                      qwen_coder_14b.py + qwen3_14b.py placeholders
│   ├── post_train.py.template
│   └── eval/                       acceptance_test.py + compare_models.py placeholders
│
├── pao_db/
│   ├── postgres_init.sql.template  schema rag_pao_<target>
│   ├── qdrant_bootstrap.py.template
│   ├── coexistence.md
│   └── migrations/                 alembic (Phase 01)
│
├── infra/
│   ├── docker-compose.prod.yml.template
│   ├── systemd/{rag-pao-api,qwen-filler,qwen-judge}.service.template
│   ├── postgres_init.sh.template
│   ├── qdrant_bootstrap.sh.template
│   └── healthcheck.sh.template     включая pre-flight train hygiene (G3 review)
│
├── external_corpus/                only public open-source
│   ├── README.md
│   ├── _meta.yaml                  license per dir
│   ├── boost_selected/.gitkeep
│   ├── fmt/.gitkeep
│   ├── spdlog/.gitkeep
│   ├── nlohmann_json/.gitkeep
│   └── _summarized/.gitkeep
│
├── golden_set/                     GLOBAL (per-target → pipelines/*/golden_set/)
│   ├── README.md
│   └── L0_corpus.jsonl.template
│
└── scripts/
    ├── bootstrap.sh.template
    ├── add_target.sh.template      cp _template/ → pipelines/<new>_v1/ (D28)
    ├── freeze_pipeline.sh.template
    ├── reindex_target.sh.template
    └── internal/
```

### 00-5 — CLAUDE.md в обоих

#### rag-mentor/CLAUDE.md

Структура:
- Кто ты (Кодо в роли mentor Oracle — НЕ тонкий клиент, имеет свой mentor_db + 7 MCP)
- Глобальные rules → `~/.claude/CLAUDE.md`
- Модульные rules → `.claude/rules/*.md`
- Alex profile
- 4 критических правила (NO pytest, NO worktrees, anti-hallucination #1, Кодо в pao по `codo_access` правилам)
- Единые точки (oracle/comparator/critic/name_validator)
- Структура каталога
- Главные команды

#### rag-pao/CLAUDE.md

Структура аналогичная:
- Кто ты (Кодо в роли executor)
- 4 критических правила
- 3 слоя rag-pao: core (стабильное) / pipelines/<name>_vN (frozen) / current (active dev)
- 2 режима доступа (D25)
- Главные команды

**Длина ~50 строк каждый**.

### 00-6 — 17 rules в rag-mentor/MemoryBank/.claude/rules/ (было 16, +1 access-modes)

| # | Файл | Источник |
|---|------|----------|
| 00 | new-task-workflow.md | копия DSP-GPU |
| 01 | user-profile.md | копия DSP-GPU |
| 02 | workflow.md | копия DSP-GPU |
| 03 | worktree-safety.md | копия DSP-GPU |
| 04 | testing-python.md | копия DSP-GPU |
| 05 | mentor-roles.md | NEW (builder/reviewer/critic/comparator + 🆕 oracle) |
| 06 | prompt-versioning.md | NEW |
| 07 | no-direct-code.md | NEW |
| 08 | anti-hallucination.md | NEW (приоритет #1) |
| 09 | rag-pao-contract.md | NEW + 🆕 раздел про 2 режима доступа (D25) |
| 10 | target-onboarding.md | NEW |
| 11 | golden-set.md | NEW + 🆕 Q1-Q10 per-target template |
| 12 | doxygen-tags-dsl.md | DSP-GPU 12_DoxyTags_Agent_Spec.md |
| 13 | fewshot-discipline.md | NEW |
| 14 | python-style.md | копия DSP-GPU 14-cpp-style.md (адаптация) |
| 15 | journal-discipline.md | NEW |
| 16 | github-sync.md | DSP-GPU (адаптация: rag-mentor пушится, sync через bare remote) |
| **17** 🆕 | **access-modes.md** | **NEW (D25)**: debug ↔ production переключатель, safe-endpoints (D31), когда flip'ать |

**Приоритезация для 1.5 дней**:
- 🔴 MUST (полные): 05, 07, 08, 09, 15, **17** (новое + критично для безопасности)
- 🟡 SHOULD: 06, 11
- 🟢 CAN-DEFER (placeholder): 10, 13

### 00-7 — 17 rules в rag-pao/MemoryBank/.claude/rules/ (+1 access-modes)

| # | Файл | Источник |
|---|------|----------|
| 00-04 | копии из rag-mentor | |
| 05 | executor-roles.md | NEW (indexer/retriever/filler/judge) |
| 06 | rag-layering.md | NEW (L0-L5 gates) |
| 07 | qwen-models.md | NEW (14B/Coder-14B/35B) |
| 08 | ollama-vllm.md | NEW |
| 09 | rocm-only.md | копия DSP-GPU |
| 10 | postgres-schema.md | NEW (coexistence) |
| 11 | qdrant-collections.md | NEW |
| 12 | incremental-index.md | NEW (blake3) |
| 13 | target-onboarding.md | NEW + 🆕 layout-aware (D22) |
| 14 | anti-hallucination.md | копия из mentor + nda_guard side |
| 15 | journal-discipline.md | копия из mentor |
| 16 | github-sync.md | адаптация: pao git-pull через bare remote (D29) |
| **17** 🆕 | **access-modes.md** | **NEW (D25)**: на стороне pao — `nda_guard.py` контракт |

### 00-8 — `.gitignore` + `.env.example` + LICENSE + README

#### rag-mentor/.gitignore

Стандартно (см. structure §5).

#### rag-pao/.gitignore

С правкой Alex: артефакты `.rag/` и `_logs/` коммитятся, только binary BD игнор. **+ новое**: `pipelines/<name>_v1/_STABLE.md` коммитится, `current/` коммитится тоже (active dev — журнал работы).

#### .env.example (обновлено под D25 + D24)

```
# === rag-mentor ===
ANTHROPIC_API_KEY=sk-ant-...                  # или работаем через Claude Code без ключа (Q-P0)
ANTHROPIC_MODEL_OPUS=claude-opus-4-7
ANTHROPIC_MODEL_SONNET=claude-sonnet-4-6

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB_MENTOR=rag_mentor                 # 🆕 свой schema
POSTGRES_USER=rag_mentor
POSTGRES_PASSWORD=<set-locally>

QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
QDRANT_MENTOR_COLLECTION=mentor_v1            # 🆕

# === rag-pao ===
OLLAMA_BASE_URL=http://localhost:11434
VLLM_BASE_URL=http://localhost:8000

QWEN_FILLER_MODEL=qwen2.5-coder-14b
QWEN_JUDGE_MODEL=qwen3.6-35b

# === Run-time (D25 — D24) ===
RAG_PAO_MODE=debug                            # 🆕 debug | production
PAO_DROPS_DIR=/srv                            # 🆕 root for pao_<name>/ drops
RAGCTL_STAGE=dev_debian                       # dev_debian | prod_ubuntu (D24)
RAGCTL_TARGET=pao_contrib

# === Sync (D29) ===
RAG_PAO_BARE_REMOTE=/srv/git-remotes/rag-pao.git   # 🆕
```

#### LICENSE

Apache-2.0 в обоих.

#### README.md

5-шаговый quick start:
1. `git clone ...` (mentor) / `mkdir rag-pao && git init` (pao)
2. `cp config/secrets.env.example config/secrets.env` → заполнить
3. `bash scripts/bootstrap.sh` (Phase 01)
4. Открыть в Claude Code → проверить rules
5. Ссылка на TASK_RAG_MENTOR_Phase01.md

### 00-9 — Placeholders + .gitkeep

Каждый пустой каталог получает `.gitkeep`.

**Особые placeholder'ы** (с TBD-разметкой):
- `rag-mentor/MemoryBank/.claude/specs/HierarchicalIncrementalRAG.md` → `# TBD Phase 04`
- `rag-pao/pipelines/_template/collectors/README.md` → ссылка на `dataset_v8_plan_2026-05-21.md` + naming convention 10 коллекторов (P0/P1/P2)
- `rag-pao/pipelines/_template/golden_set/Q1_Q10_acceptance.template.jsonl` → шаблон acceptance Q&A с пояснением: «Alex для DSP-GPU; Кодо синтезирует для новых targets»
- `rag-pao/external_corpus/README.md` → «public open-source only. Customer drops живут в `/srv/pao_<name>/` (D21)»

### 00-9b — `.mcp.json` placeholder

`rag-mentor/.mcp.json`:
```json
{
  "$schema": "https://modelcontextprotocol.io/schema",
  "_comment": "Заполнится Phase 01. Полный config — см. config/mcp_servers.yaml.",
  "mcpServers": {}
}
```

`rag-mentor/config/mcp_servers.yaml.template` — 7 серверов из policies §D.3 с placeholder'ами.

### 00-10 — MASTER_INDEX.md в обоих

Ссылки на rules, specs, tasks, sessions последних.

### 00-11 — Первый commit в обоих

```bash
git -C rag-mentor add -A
git -C rag-mentor commit -m "feat(bootstrap): Phase 00 — skeleton + 17 rules + rag_mentor pkg + mentor_db + 7 MCP"

git -C rag-pao add -A
git -C rag-pao commit -m "feat(bootstrap): Phase 00 — skeleton + 17 rules + 3 layers (core/pipelines/current) + access_control"
```

### 00-12 — Push rag-mentor → github (только после OK Alex)

```bash
git -C rag-mentor remote add origin git@github.com:rag-mentor/rag-mentor.git
git -C rag-mentor push -u origin main
```

Триггер: Alex говорит «делай push» (правило 16-github-sync — переспрос).

### 00-12b 🆕 — git bare remote для rag-pao (D29)

На сервере (потом, когда переедем):
```bash
mkdir -p /srv/git-remotes
git init --bare /srv/git-remotes/rag-pao.git
```

В Phase 00 на laptop — **только записать команду в README**, не выполнять (нет сервера).

### 00-13 — Verify Claude Code открывает оба

Manual checklist:
- Открыть rag-mentor → команда «прочти CLAUDE.md» → должна понять mentor-роль + dual-RAG
- Открыть rag-pao → команда «прочти CLAUDE.md» → должна понять executor-роль + 3 слоя + 2 режима
- В обоих: команда «покажи список 17 rules» → выводит 17 файлов
- В rag-pao: команда «прочти rag-pao/config/targets.yaml.example» → должна понять формат с `mode` + `codo_access`

---

## 🔗 Dependencies

| Зависит от | Что |
|------------|-----|
| 6 spec'ов v0.3 в `MemoryBank/pao/specs/` | ✅ 2026-05-23 |
| GitHub org `rag-mentor` создан | ⏳ Alex делает в 00-12 (manual) |
| Anthropic API key | Опционально (Max5 plan, Кодо через Claude Code) |

**Не блокирует**: БД / Python / Docker / Anthropic — Phase 01+.

---

## ⚠️ Risks

| # | Risk | Mitigation |
|---|------|-----------|
| **R-P0-1** | 17 rules за 1.5 дня (+1 access-modes) | приоритезация: 🔴 MUST полные, 🟢 CAN-DEFER placeholder |
| **R-P0-2** | CLAUDE.md плохо адаптирован | manual review Alex'а; первые 2-3 ответа Claude в каждом проверять |
| **R-P0-3** | Push в github без OK | правило 16-github-sync, переспрос обязателен (00-12) |
| **R-P0-4** | git init под worktree | 00-0 pre-flight |
| **R-P0-5** | Hardcoded paths `E:\` в коммите | grep-check G7 |
| **R-P0-6** | rag-mentor / rag-pao уже существуют с файлами | 00-0 pre-flight |
| **R-P0-7** | `~/.claude/CLAUDE.md` отсутствует на новой машине | 00-0 проверяет |
| **R-P0-8** 🆕 | 3 слоя rag-pao + `pipelines/_template/collectors/` — много пустых каталогов | `.gitkeep` + README с TODO Phase 02-09 |
| **R-P0-9** 🆕 | access_control логика не покрывает `mode=production AND codo_access=full` | в 00-7 rule 17 — описать: production → forced rest-only, codo_access игнорируется |

---

## 📊 Tracking

```
[ ] 00-0   pre-flight
[ ] 00-1   git init rag-mentor
[ ] 00-2   git init rag-pao (local)
[ ] 00-3   skeleton rag-mentor/ (с rag_mentor/ пакетом + mentor_db + 7 MCP)
[ ] 00-4   skeleton rag-pao/ (с 3 слоями + access_control + pipelines/_template/collectors/)
[ ] 00-5   CLAUDE.md в обоих
[ ] 00-6   17 rules rag-mentor (+ NEW 17-access-modes.md)
[ ] 00-7   17 rules rag-pao (+ NEW 17-access-modes.md)
[ ] 00-8   .gitignore + .env.example (с RAG_PAO_MODE, PAO_DROPS_DIR) + LICENSE + README
[ ] 00-9   placeholders + .gitkeep + Q1_Q10_acceptance.template + collectors README
[ ] 00-9b  .mcp.json + mcp_servers.yaml.template (7 MCP)
[ ] 00-10  MASTER_INDEX.md в обоих
[ ] 00-11  первый commit в обоих
[ ] 00-12  push rag-mentor (после OK Alex)
[ ] 00-12b README: команда git bare remote для server (Phase 01 deploy)
[ ] 00-13  verify Claude Code

Gates: [ ] G1-G15 (15 gates, +6 новых: G10-G15 для пакетов/3 слоёв/mentor_db/mcp/targets.yaml)
```

---

## 📚 References

6 spec'ов v0.3 в `MemoryBank/pao/specs/` (см. INDEX.md):
- `01_architecture_v0.3.md` — overview + 39 ADR + Risk Register
- `02_structure_v0.3.md` — структура каталогов rag-mentor / rag-pao / pao_<name>
- `03_phases_v0.3.md` — HI-RAG L0-L5 + 11 фаз
- `04_policies_v0.3.md` — anti-hallucination + 2 режима + idempotency + validators
- `05_dataset_v8_reference.md` — reference для collectors
- `06_architecture_diagrams.md` — C4 (Mermaid) + контракты + DDD

Шаблоны:
- `../templates/rag-mentor/` — CLAUDE.md + README + .env + .gitignore + pyproject.toml + config/
- `../templates/rag-pao/` — то же + pipelines/_template/
- `../templates/pao_drop/_META.yaml.template`

Rules: `../rules/{mentor,pao}/00-17*.md` (17+17)

---

## 🚦 Definition of Done

Phase 00 **DONE** когда:
1. G1-G15 все ✅
2. Alex review CLAUDE.md в обоих → OK
3. Manual verify Claude Code открывает оба и грузит rules ✅
4. Создан `TASK_RAG_MENTOR_Phase01_Infra.md` (краткий, 1-2 страницы)
5. `MASTER_INDEX.md` в обоих обновлён
6. Запись в `sessions/2026-05-XX.md` + `changelog/2026-05.md`

---

## ⏭️ Next phase preview

**Phase 01 Infra** (2 дня):
- docker-compose для PG 16 + Qdrant 1.13 + Ollama
- `mentor_db/postgres_init.sql` → схема `rag_mentor` + 5 таблиц
- `pao_db/postgres_init.sql` → схема `rag_pao_<target>` + 7 таблиц
- Qdrant collections (`mentor_v1`, `pao_contrib_v1`)
- Ollama: `ollama pull qwen2.5-coder:14b-q4_K_M` + `ollama pull qwen3.6:35b-q4_K_M`
- 7 локальных MCP скелеты → реальные команды (postgres_mcp + qdrant_mcp смотрят в `rag_mentor`)
- Smoke test: Claude Code → MCP postgres → видит схему

**Phase 02 L0 corpus + collectors P0**:
- crawler external_corpus
- 🆕 **скопировать DSP-GPU pilot в `rag-pao/pipelines/_dsp_gpu_v1/collectors/`** как референс (3 P0 коллекторов из v8 plan)

---

*v0.4 final. Готов к старту по команде Alex'а «делай Phase 00».*
