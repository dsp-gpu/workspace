# RAG_mentor / RAG_pao — Structure v0.3

> **Версия**: 0.3 · **Дата**: 2026-05-23
> **Скоуп**: точная раскладка `rag-mentor/`, `rag-pao/` (3 слоя), `pao_<name>/` (customer drop), `targets.yaml`, .gitignore, PG schema coexistence.

---

## 1. Общие правила

| Правило | Применение |
|---------|-----------|
| **rag-mentor — git** | `github.com/rag-mentor/rag-mentor` (private) |
| **rag-pao — локальный git** | без remote напрямую; sync через bare `/srv/git-remotes/rag-pao.git` (D29) |
| **Пути** | только `pathlib.Path`. Никаких `E:\` / `/home/alex/` в коде |
| **MemoryBank** | полный аналог DSP-GPU в обоих репо |
| **.env** | секреты НЕ в git. Только `secrets.env.example` |
| **`prompts/` split** | `for_mentor/` (как Claude себя ведёт) + `for_rag_pao/` (нумерованные 001-) (D16) |
| **2 уровня журнала** | per-prompt (`prompts/v1/NNN_*.journal.md`) + per-class (`.rag/<t>/sessions/NNN_<Class>_<date>.md`) (D17) |
| **Customer drops** | external roots `/srv/pao_<name>/`, доступ через `targets.yaml` (D21) |
| **Mentor = полноценная RAG-подсистема** | свой PG + Qdrant + 7 MCP + oracle + comparator (D23) |
| **2 режима доступа Кодо** | `mode: debug | production` + per-target `codo_access` (D25) |
| **rag-pao 3 слоя** | `core/` + `pipelines/<name>_vN/` + `current/` (D28) |
| **Конфиги** | YAML; JSON Schema только для Qwen strict output (D30) |
| **Shared anti-hallucination** | `common/anti_hallucination/` — git submodule в обоих репо (D34) |
| **`access_policy.yaml`** | `rag-pao/config/access_policy.yaml` — single source of truth для safe/debug endpoints (D35) |

---

## 2. `rag-mentor/` (Oracle — полноценная RAG-подсистема)

```
rag-mentor/
├── CLAUDE.md  README.md  LICENSE  .gitignore  pyproject.toml
│
├── MemoryBank/                         # ПОЛНЫЙ аналог DSP-GPU
│   ├── MASTER_INDEX.md
│   ├── .claude/
│   │   ├── rules/                      # 17 файлов (см. §7)
│   │   └── specs/                      # база знаний: DSPy / TextGrad / RAPTOR / HierarchicalIncrementalRAG
│   ├── specs/                          # планы и ревью этого репо
│   ├── tasks/                          # TASK_RAG_MENTOR_<phase>.md + IN_PROGRESS.md
│   ├── prompts/                        # 🌟 ИСТОЧНИК ИСТИНЫ
│   │   ├── for_mentor/v1/              # промпты для самой Claude
│   │   │   ├── reviewer/  critic/  builder_meta/  comparator/
│   │   │   └── README.md
│   │   └── for_rag_pao/v1/             # нумерованные 001-XXX для Qwen
│   │       ├── 001_doxygen_simple_class.md ... 012_judge_gtest_quality.md
│   │       ├── schemas/                # JSON Schema strict output (D30)
│   │       ├── fewshot/
│   │       └── README.md
│   ├── sessions/YYYY-MM-DD.md
│   ├── changelog/YYYY-MM.md
│   └── feedback/
│
├── rag_mentor/                         # 📦 Python пакет (D27)
│   ├── __init__.py
│   ├── orchestrator/                   main_loop, retry_policy
│   ├── prompt_builder/                 retrieval_grounding, allow_list_builder, schema_inject
│   ├── oracle/                         🌟 (D23, D32)
│   │   ├── retrieval.py                # hybrid (BGE-M3 + BM25) по mentor_db
│   │   ├── reasoner.py                 # Claude собирает эталон
│   │   └── fallback.py
│   ├── reviewer/                       quality_0_100
│   ├── comparator/                     🌟 (D23)
│   │   ├── diff_vs_etalon.py
│   │   └── issue_categorizer.py        # hallucination / generic / wrong_param / ...
│   ├── critic/                         prompt_fix
│   ├── rag_pao_client/                 rest_client + mcp_client + AccessAwareMixin (D36)
│   ├── anti_hallucination/             🆕 D34 — wrapper над common/anti_hallucination/
│   │   └── client_side_validator.py    (после Qwen output, до save_rag)
│   ├── journal/                        per_prompt, per_class
│   └── utils/                          pathlib_helpers, logging_setup (Loguru)
│
├── mentor_db/                          # 🌟 свой PG + Qdrant (D23)
│   ├── postgres_init.sql               # CREATE SCHEMA rag_mentor
│   ├── qdrant_bootstrap.py             # collection mentor_v1
│   ├── tables/
│   │   ├── prompts.sql                 # история промптов с метриками
│   │   ├── golden_sets.sql             # Q-A эталоны L1-L5
│   │   ├── sessions.sql                # per-target журнал
│   │   ├── target_metadata.sql         # инфо о каждом pao_<name>
│   │   └── eval_runs.sql               # метрики прогонов
│   ├── migrations/                     # alembic
│   └── README.md
│
├── mcp_servers/                        # 🌟 7 локальных MCP для Кодо (D14)
│   ├── context7_local/                 локальная Context7 копия
│   ├── sequential_thinking/            глубокий анализ
│   ├── filesystem/                     Anthropic official
│   ├── git_mcp/                        история промптов/спек
│   ├── postgres_mcp/                   ← смотрит в rag_mentor PG
│   ├── qdrant_mcp/                     ← смотрит в mentor_v1 Qdrant
│   └── memory_mcp/                     persistent across sessions
│
├── tests/                              # NO pytest — TestRunner + SkipTest
│   ├── all_test.py
│   ├── test_prompt_builder.py
│   ├── test_oracle.py
│   ├── test_comparator.py
│   ├── test_critic.py
│   ├── test_name_validator.py
│   └── fixtures/
│
├── scripts/
│   ├── bootstrap.sh                    # mentor_db init + MCP servers start
│   ├── sync_prompts_to_pao.sh          # git push в bare remote
│   └── eval_run.sh
│
└── config/
    ├── stack.dev.json                  # endpoints на dev (Ollama)
    ├── stack.prod.json                 # endpoints на prod (vLLM)
    ├── targets.yaml                    # зеркало rag-pao/config/targets.yaml
    ├── mcp_servers.yaml                # config 7 MCP
    └── secrets.env.example
```

---

## 3. `rag-pao/` (Executor — 3 слоя)

```
rag-pao/
├── CLAUDE.md  README.md  LICENSE  .gitignore  pyproject.toml
│
├── MemoryBank/                         # как у mentor, но в `prompts/v1/` — копии from mentor
│   ├── .claude/{rules,specs}/
│   ├── specs/  tasks/  sessions/  changelog/
│   └── prompts/v1/                     # 001_*.md + 001_*.journal.md (D17 per-prompt)
│
├── rag_pao/                            # 📦 Python пакет (D27)
│   │
│   ├── core/                           # 🔵 СЛОЙ 1 — STABLE CORE (D28)
│   │   ├── indexer/
│   │   │   ├── ast/                    tree-sitter, libclang, cmake_parser
│   │   │   ├── chunking/               markdown_chunker, header_summarizer (>50KB, D20)
│   │   │   ├── hash_skip/              incremental blake3
│   │   │   └── doxytags_reuse.py       reuse DSP-GPU `doxytags fill`
│   │   ├── retrieval/
│   │   │   ├── hybrid_retriever.py     BM25 + dense + RRF
│   │   │   ├── reranker.py             bge-reranker-v2-m3
│   │   │   ├── embedder/{bge_m3_local,bge_m3_remote}.py
│   │   │   └── filters/                license + nda_level + layer + repo
│   │   ├── llm_serving/                # ТОЛЬКО clients + model_router (D34 — cohesion fix)
│   │   │   ├── clients/{ollama_client,vllm_client}.py
│   │   │   └── model_router.py         # 14B / Coder-14B / 35B policy + pin sha256 + Registry
│   │   ├── anti_hallucination/         🆕 D34 — отдельный подпакет
│   │   │   ├── name_validator.py       # барьер 2 (server side, читает forbidden_terms.yaml)
│   │   │   ├── schema_lint.py          # барьер 3 (JSON Schema + doxygen lint)
│   │   │   ├── doxygen_lint.py
│   │   │   └── forbidden_terms_loader.py
│   │   ├── journal/{per_prompt,per_class}.py
│   │   ├── api/
│   │   │   ├── rest/                   # FastAPI endpoints
│   │   │   │   ├── retrieve.py  search.py
│   │   │   │   ├── run_filler.py  run_judge.py  save_rag.py
│   │   │   │   ├── show_file.py        🌟 debug-only (D25)
│   │   │   │   ├── show_signature.py   ✅ safe in production (D31)
│   │   │   │   ├── show_symbols.py     ✅ safe in production
│   │   │   │   └── health.py
│   │   │   └── mcp/                    # MCP wrapper для REST
│   │   ├── access_control/             🌟 (D25)
│   │   │   ├── mode_switch.py
│   │   │   └── nda_guard.py            # check_access(target, endpoint, mode) -> bool
│   │   └── utils/
│   │
│   ├── orchestrator/                   hi_rag_runner, retry_policy
│   └── analysis/                       class_distribution, patterns_coverage
│
├── pipelines/                          # 🟡 СЛОЙ 2 — PER-TARGET FROZEN SNAPSHOTS (D28)
│   ├── _template/                      🌟 шаблон для нового target
│   │   ├── pipeline.yaml               описание этапов L0→L5
│   │   ├── collectors/                 🔗 10 коллекторов (D33, см. dataset_v8_plan_2026-05-21.md)
│   │   │   ├── patterns/               P0: reverse_patterns, synonym_pairs, confusion_negatives
│   │   │   ├── facts/                  P1: class_facts, build_cmake_facts, migration_history
│   │   │   ├── docs/                   P1: architecture_docs, lessons_learned
│   │   │   ├── code/                   P2: hip_kernels, hip_primitives, code_templates
│   │   │   ├── style/                  P2: api_style, idioms, error_handling
│   │   │   ├── pybind/                 если применимо
│   │   │   ├── listings/               multi_class_listing
│   │   │   └── README.md
│   │   ├── prompts_override/           # если target требует особый промпт
│   │   ├── golden_set/                 # per-target QA + Q1-Q10 acceptance (D33 Q-R2)
│   │   └── README.md                   # changelog адаптаций
│   ├── pao_contrib_v1/                 # frozen snapshot когда score ≥ 80
│   │   └── _STABLE.md
│   └── pao_xxxx_acme_v1/               # копия pao_contrib_v1 + правки
│
├── current/                            # 🟢 СЛОЙ 3 — ACTIVE DEVELOPMENT (D28)
│   ├── pipeline.yaml
│   ├── collectors/                     зеркало _template/collectors/, в активной разработке
│   ├── prompts_override/
│   └── golden_set/
│
├── targets/                            # 📁 СЛЕДЫ ДАННЫХ — НЕ копии (D21)
│   ├── README.md                       # «здесь только symlinks/submodules + meta»
│   ├── pao_contrib → /srv/pao_contrib          (symlink)
│   ├── pao_xxxx_acme → /srv/pao_xxxx_acme      (symlink)
│   └── _meta/
│       └── targets.yaml                # 🌟 ИСТОЧНИК ИСТИНЫ путей (см. §5)
│
├── finetune/                           # QLoRA фаза 09 (D12)
│   ├── dataset_builders/
│   │   ├── v8.py                       # merge collectors → JSONL (D33)
│   │   └── dedup.py                    # semantic dedup (против leakage от synonyms)
│   ├── train/
│   │   ├── qwen_coder_14b.py
│   │   └── qwen3_14b.py
│   ├── post_train.py                   # merge LoRA → GGUF → Ollama
│   └── eval/
│       ├── acceptance_test.py          # Q1-Q10 per-target (D33)
│       └── compare_models.py
│
├── pao_db/                             # PG + Qdrant
│   ├── postgres_init.sql               # schema rag_pao_<target>
│   ├── qdrant_bootstrap.py
│   ├── coexistence.md                  # как соседствовать с dsp_gpu (см. §6)
│   └── migrations/                     # alembic
│
├── infra/
│   ├── docker-compose.prod.yml
│   ├── systemd/                        # rag-pao-api.service + qwen-filler.service + qwen-judge.service
│   ├── postgres_init.sh
│   ├── qdrant_bootstrap.sh
│   └── healthcheck.sh                  # включая pre-flight train hygiene (sudo swapoff -a, kill GUI)
│
├── external_corpus/                    # public open-source ONLY (customer code в /srv/pao_<n>/)
│   ├── README.md
│   ├── _meta.yaml                      # license per dir
│   ├── boost_selected/  fmt/  spdlog/  nlohmann_json/
│   └── _summarized/                    # cleaned-копии файлов > 50KB
│
├── golden_set/                         # GLOBAL gates (per-target → pipelines/*/golden_set/)
│   ├── L0_corpus.jsonl
│   └── README.md
│
└── scripts/
    ├── bootstrap.sh
    ├── add_target.sh                   # cp _template/ → pipelines/<new>_v1/ (D28)
    ├── freeze_pipeline.sh              # current/ → pipelines/<name>_vN/
    ├── reindex_target.sh
    ├── train_v8.sh
    └── internal/                       # одноразовые/debugging — НЕ в production
```

---

## 4. `pao_<name>/` — структура customer drop (D22)

### 4.1 От заказчика (на примере `pao_contrib`)

```
pao_contrib/
├── .git/
├── build/                              # cmake-инфраструктура (НЕ build artifacts)
│   ├── CPack.cmake  General.cmake  config_options.cmake
│   └── cmake/  clients/  include/  package/  platforms/  templates/
│
└── contrib/                            # ~45 модулей заказчика
    ├── boost/    (CMakeLists.txt + boost/ + libs/{filesystem,system})
    ├── qwt/      (CMakeLists.txt + include/ + src/qwt_*.cpp ×40)
    ├── googletest/  sqlite/  openssl/  rapidjson/  qt5_qsqlpsql/  ...
    └── filesystem, variant             (single-file libs)
```

### 4.2 Наши overlay'и (рядом, на root)

```
pao_contrib/
├── _META.yaml                          🌟 customer / version / c++_std / nda_level / license_map / modules[]
│
├── Doc/                                # docs (наш overlay)
│   ├── _doxygen_html/                  общая cross-module сборка
│   ├── build/                          доки для cmake-infra
│   └── contrib/<module>/               per-module docs
│       └── _doxygen_html/
│
├── Example/contrib/<module>/           use_cases (если >1 файла → подкаталог)
├── Test/contrib/<module>/              native tests
└── GTest/contrib/<module>/             GoogleTest skeleton
```

### 4.3 `_META.yaml` (обязательный)

```yaml
customer: "<имя>"
version: "1.0"
c++_std: 17
nda_level: open                         # open | customer-A | customer-B
license_map:
  contrib/boost: BSL-1.0
  contrib/qwt: LGPL-2.1
  contrib/openssl: Apache-2.0 OR SSLeay
layout:
  modules_dir: "contrib"
  cmake_infra_dir: "build"
  ignore: [".git", "_doxygen_html"]
modules:
  - { name: boost, path: contrib/boost, type: header+lib, sub_libraries: [filesystem, system] }
  - { name: qwt,   path: contrib/qwt,   type: lib, requires: [qt5] }
  # ...
```

---

## 5. `rag-pao/config/targets.yaml` — источник истины путей

```yaml
mode: debug                              # debug | production (D25)

targets:
  - name: pao_contrib
    source: "/srv/pao_contrib"           # env override через PAO_DROPS_DIR
    nda_level: open
    indexable: true
    layout:                              # дублирует _META.yaml.layout (для быстрого доступа)
      modules_dir: "contrib"
      cmake_infra_dir: "build"
      our_overlays:
        docs: "Doc"
        examples: "Example"
        native_tests: "Test"
        gtest: "GTest"
    pipeline: pao_contrib_v1             # какой snapshot применять (current = active dev)
    codo_access: full                    # full | rest-only

  - name: pao_xxxx_acme
    source: "/srv/pao_xxxx_acme"
    nda_level: customer-A
    layout: { modules_dir: "modules", cmake_infra_dir: "cmake", our_overlays: {...} }
    pipeline: pao_xxxx_acme_v1
    codo_access: rest-only               # 🔒 NDA защищён даже в debug
```

---

## 6. PG schema coexistence (с DSP-GPU)

Один PostgreSQL instance, **разные schemas**:
- `dsp_gpu` (текущий проект, не трогаем)
- `rag_mentor` (для rag-mentor `mentor_db`)
- `rag_pao_<target>` per target (rag_pao_pao_contrib, rag_pao_pao_xxxx_acme, ...)

Один Qdrant instance, **разные collections**:
- `dsp_gpu_v1` (существует)
- `mentor_v1`
- `<target>_v1` per target

Никаких конфликтов — namespace через `CREATE SCHEMA`.

---

## 7. Rules — 17 файлов в каждом репо

`.claude/rules/` в **обоих** репо:

| # | Файл | mentor | pao |
|---|------|--------|-----|
| 00 | new-task-workflow.md | копия DSP-GPU | копия |
| 01 | user-profile.md | копия | копия |
| 02 | workflow.md | копия | копия |
| 03 | worktree-safety.md | копия | копия |
| 04 | testing-python.md | копия | копия |
| 05 | mentor-roles.md / executor-roles.md | NEW (builder/reviewer/critic/comparator/oracle) | NEW (indexer/retriever/filler/judge) |
| 06 | prompt-versioning.md / rag-layering.md | NEW (v1/v2/tag) | NEW (L0-L5 gates) |
| 07 | no-direct-code.md / qwen-models.md | NEW | NEW |
| 08 | anti-hallucination.md / ollama-vllm.md | NEW (приоритет №1) | NEW |
| 09 | rag-pao-contract.md / rocm-only.md | NEW + 2 режима (D25) | копия DSP-GPU |
| 10 | target-onboarding.md / postgres-schema.md | NEW | NEW (coexistence) |
| 11 | golden-set.md / qdrant-collections.md | NEW + Q1-Q10 template | NEW |
| 12 | doxygen-tags-dsl.md / incremental-index.md | DSP-GPU 12_DoxyTags_Agent_Spec | NEW (blake3) |
| 13 | fewshot-discipline.md / target-onboarding.md | NEW | NEW + layout (D22) |
| 14 | python-style.md / anti-hallucination.md | DSP-GPU 14-cpp-style (адапт) | копия from mentor |
| 15 | journal-discipline.md | NEW (2 уровня) | копия |
| 16 | github-sync.md | DSP-GPU 16 (адаптация: rag-mentor пушится) | адаптация: pao через bare remote (D29) |
| **17** 🆕 | **access-modes.md** | **NEW (D25)**: 2 режима + safe-endpoints | **NEW (D25)**: server side `nda_guard.py` |

Готовые тексты — в `MemoryBank/pao/rules/{mentor,pao}/`.

---

## 8. `.gitignore` политика

### rag-mentor/.gitignore

```
.env
config/secrets.env
config/*.local.json
__pycache__/  *.pyc  .venv/
logs/  *.log
mentor_db/data/  mentor_db/*.dump
```

### rag-pao/.gitignore

```
.env  config/secrets.env
__pycache__/  *.pyc  .venv/

# DB binary blob — игнор
pao_db/data/
qdrant_storage/
postgres_data/

# Logs
logs/  *.log

# .rag/, _logs/, pipelines/<name>_v1/ — КОММИТИМ (артефакты ценные)
# current/ — тоже коммитим (журнал активной разработки)

# Targets — только symlinks, не данные
targets/*/!targets/.gitkeep
```

---

*v0.3 final.*
