# RAG_mentor / RAG_pao — структура каталогов

> **Версия**: 0.2 · **Дата**: 2026-05-20 · **Автор**: Кодо для Alex
> **Родительский документ**: [rag_mentor_architecture_2026-05-20.md](rag_mentor_architecture_2026-05-20.md)
> **Скоуп**: точная раскладка каталогов rag-mentor/ (git репо) и rag-pao/ (соседний каталог).

---

## 0. Общие правила (после правок Alex 2026-05-20)

| Правило | Применение |
|---------|-----------|
| **rag-mentor — git** | `rag-mentor/` — git под `github.com/rag-mentor/rag-mentor` (private) |
| **rag-pao — локальный git** | **локальный** git репо (без remote), **имитация офлайн-сервера заказчика** (Alex Q11). Не пушим в github |
| **Пути** | только `pathlib.Path`, относительные. Никаких `E:\` или `/home/alex/` в коде |
| **MemoryBank** | полный аналог DSP-GPU в **обоих** каталогах. Правила корректируются под задачу — не строго 16 |
| **`.env`** | ANTHROPIC_API_KEY + DB creds — НЕ в git. Только `secrets.env.example` |
| **prompts split (Alex 2026-05-20)** | `rag-mentor/MemoryBank/prompts/` разделён на **2 подкаталога**: `for_mentor/` (как Claude ведёт себя) и `for_rag_pao/` (промпты для Qwen, нумерованные 001_, 002_, ...). В `rag-pao/MemoryBank/prompts/` — копии **+ журналы выполнения** `NNN_*.journal.md` |
| **2 уровня журнала** | **per-prompt journal**: `rag-pao/MemoryBank/prompts/NNN_<topic>.journal.md` (история применений одного промпта к разным классам). **per-class session**: `rag-pao/.rag/<target>/sessions/NNN_<Class>_<date>.md` (что получилось у конкретного класса) |
---

## 1. `rag-mentor/` — git репо, online mentor

```
rag-mentor/
│
├── CLAUDE.md                          # глобальные правила для Кодо в этом репо
├── README.md                          # quick start
├── LICENSE
├── .gitignore                         # .env, *.log, __pycache__, .venv
│
├── MemoryBank/                        # ПОЛНЫЙ аналог DSP-GPU
│   ├── MASTER_INDEX.md
│   ├── README.md
│   ├── .claude/
│   │   ├── rules/                     # корректируется под задачу (Alex)
│   │   │   ├── 00-new-task-workflow.md
│   │   │   ├── 01-user-profile.md
│   │   │   ├── 02-workflow.md
│   │   │   ├── 03-worktree-safety.md
│   │   │   ├── 04-testing-python.md          # NO pytest
│   │   │   ├── 05-mentor-roles.md            # builder/reviewer/critic/comparator
│   │   │   ├── 06-prompt-versioning.md       # v1/v2/...
│   │   │   ├── 07-no-direct-code.md          # Claude НЕ пишет финальные docs в target
│   │   │   ├── 08-anti-hallucination.md      # ПРИОРИТЕТ #1 Alex (см. policies.md §A)
│   │   │   ├── 09-rag-pao-contract.md        # REST+MCP гибрид
│   │   │   ├── 10-target-onboarding.md       # как добавить новый target
│   │   │   ├── 11-golden-set.md
│   │   │   ├── 12-doxygen-tags-dsl.md        # @test/@test_ref/@test_check
│   │   │   ├── 13-fewshot-discipline.md      # min 3 fewshot
│   │   │   ├── 14-python-style.md            # SOLID, type hints
│   │   │   ├── 15-journal-discipline.md      # формат 001_<name> + лог (Alex Q8)
│   │   │   └── 16-github-sync.md
│   │   └── specs/                     # база знаний по prompt-engineering
│   │       ├── DSPy_comparison.md
│   │       ├── TextGrad_notes.md
│   │       ├── RAPTOR_notes.md
│   │       ├── ConstitutionalAI_RLAIF.md
│   │       └── HierarchicalIncrementalRAG.md  # наш фирменный paper
│   ├── specs/                         # планы и ревью этого репо
│   ├── tasks/                         # TASK_RAG_MENTOR_<phase>.md + IN_PROGRESS.md
│   ├── prompts/                       # 🌟 ИСТОЧНИК ИСТИНЫ ПРОМПТОВ (Alex 2026-05-20: split)
│   │   ├── for_mentor/                # 🌟 промпты для САМОЙ Claude (как mentor себя ведёт)
│   │   │   ├── v1/
│   │   │   │   ├── reviewer/
│   │   │   │   │   └── reviewer_quality_0_100.md
│   │   │   │   ├── critic/
│   │   │   │   │   └── critic_prompt_fix.md
│   │   │   │   ├── builder_meta/      # «как Claude строит промпты для Qwen»
│   │   │   │   │   ├── meta_for_doxygen.md
│   │   │   │   │   ├── meta_for_test_cases.md
│   │   │   │   │   └── meta_for_gtest.md
│   │   │   │   └── comparator/
│   │   │   │       └── comparator_diff_vs_etalon.md
│   │   │   ├── v2/                    # после первой итерации
│   │   │   └── README.md
│   │   │
│   │   ├── for_rag_pao/               # 🌟 промпты которые Claude шлёт в Qwen
│   │   │   ├── v1/
│   │   │   │   ├── 001_doxygen_simple_class.md       # для простых классов
│   │   │   │   ├── 002_doxygen_template_class.md     # шаблонные классы
│   │   │   │   ├── 003_test_cases_basic.md           # @test DSL
│   │   │   │   ├── 004_test_cases_with_throws.md     # классы с exceptions
│   │   │   │   ├── 005_gtest_skeleton_basic.md       # GoogleTest L3b
│   │   │   │   ├── 006_gtest_with_fixture.md
│   │   │   │   ├── 007_use_case_extraction.md       # L4
│   │   │   │   ├── 008_pipeline_extraction.md
│   │   │   │   ├── 010_judge_doxygen_quality.md     # для Qwen35B
│   │   │   │   ├── 011_judge_test_cases_quality.md
│   │   │   │   └── 012_judge_gtest_quality.md
│   │   │   ├── v2/
│   │   │   ├── schemas/               # JSON Schema (strict output)
│   │   │   │   ├── doxygen_block.schema.json
│   │   │   │   ├── test_cases.schema.json
│   │   │   │   ├── gtest_skeleton.schema.json
│   │   │   │   ├── use_case.schema.json
│   │   │   │   ├── arch_card.schema.json
│   │   │   │   └── symbol_brief.schema.json
│   │   │   ├── fewshot/
│   │   │   │   ├── L3_doxygen_FFTProcessorROCm.json
│   │   │   │   ├── L3_test_cases_FFTProcessorROCm.json
│   │   │   │   ├── L3b_gtest_FFTProcessorROCm.cpp.example
│   │   │   │   └── L4_use_case_fft_batch_signal.json
│   │   │   └── README.md              # нумерация, naming, как добавлять новый
│   │   │
│   │   └── README.md                  # навигация: for_mentor/ vs for_rag_pao/
│   ├── sessions/YYYY-MM-DD.md         # как в DSP-GPU
│   ├── changelog/YYYY-MM.md
│   └── feedback/                      # ревью target проектов
│
├── src/                               # Python harness (БЕЗ pytest)
│   ├── orchestrator.py                # главный цикл
│   ├── prompt_builder.py              # Claude → строит промпт Qwen'у
│   ├── reviewer.py                    # Claude → 0-100
│   ├── critic.py                      # Claude → правит промпт
│   ├── comparator.py                  # diff vs эталон
│   ├── rag_pao_client.py              # клиент REST/MCP к rag-pao
│   ├── distillation_logger.py         # JSONL для QLoRA
│   ├── name_validator.py              # 🌟 anti-hallucination (Alex priority #1)
│   └── runner/
│       ├── runner.py                  # свой TestRunner (NO pytest!)
│       ├── skip.py
│       └── result.py
│
├── mentor_db/                         # 🌟 PG schema + Qdrant collection ментора (Alex)
│   ├── postgres_init.sql              # schema: rag_mentor
│   ├── qdrant_bootstrap.py            # collection: mentor_v1
│   ├── tables/
│   │   ├── prompts.sql                # история промптов
│   │   ├── golden_sets.sql            # все QA
│   │   ├── sessions.sql               # журнал per-target
│   │   ├── target_metadata.sql        # инфо о target'ах
│   │   └── eval_runs.sql              # метрики прогонов
│   └── README.md                      # зачем мне база (Alex: «чтобы знать что есть»)
│
├── tests/                             # тесты harness'а (не target!)
│   ├── all_test.py
│   ├── test_prompt_builder.py
│   ├── test_reviewer.py
│   ├── test_critic.py
│   ├── test_name_validator.py
│   └── fixtures/
│
├── mcp_servers/                       # 🌟 локальные MCP для Кодо (Alex запросил)
│   ├── README.md                      # см. policies.md §D
│   ├── context7_local/                # локальная Context7 копия
│   ├── sequential_thinking/           # «глубокий анализ»
│   ├── filesystem/                    # Anthropic official
│   ├── git_mcp/
│   ├── postgres_mcp/                  # видение PG schema
│   ├── qdrant_mcp/                    # видение Qdrant
│   └── memory_mcp/                    # persistent across sessions
│
├── scripts/
│   ├── bootstrap.sh                   # 5 шагов manual setup
│   ├── sync_prompts_to_pao.sh         # rsync prompts/ → rag-pao/
│   └── eval_run.sh
│
└── config/
    ├── stack.dev.json                 # endpoints rag-pao на Windows (Ollama)
    ├── stack.prod.json                # endpoints на Debian (vLLM)
    ├── targets.yaml                   # список target репо
    ├── mcp_servers.yaml               # config локальных MCP
    └── secrets.env.example            # шаблон без реальных ключей
```

---

## 2. `rag-pao/` — соседний каталог, offline executor

```
rag-pao/
│
├── CLAUDE.md                          # короткий, для Кодо в этом каталоге
├── README.md
├── LICENSE                            # если делаем отдельный git репо (Q11)
├── .gitignore                         # !!! .rag/ КОММИТИМ, qdrant_data/ и pg_data/ — НЕТ
│
├── MemoryBank/                        # полный аналог
│   ├── MASTER_INDEX.md
│   ├── README.md
│   ├── .claude/
│   │   ├── rules/                     # mirror из rag-mentor + специфика
│   │   │   ├── 00-new-task-workflow.md
│   │   │   ├── 01-user-profile.md
│   │   │   ├── 02-workflow.md
│   │   │   ├── 03-worktree-safety.md
│   │   │   ├── 04-testing-python.md
│   │   │   ├── 05-executor-roles.md          # indexer/retriever/filler/judge
│   │   │   ├── 06-rag-layering.md            # L0-L5 (включая QLoRA)
│   │   │   ├── 07-qwen-models.md             # 14B/Coder-14B/35B
│   │   │   ├── 08-ollama-vllm.md             # как переключать backend
│   │   │   ├── 09-rocm-only.md
│   │   │   ├── 10-postgres-schema.md         # 🌟 coexistence (Alex: уже есть данные)
│   │   │   ├── 11-qdrant-collections.md
│   │   │   ├── 12-incremental-index.md       # blake3 + skip
│   │   │   ├── 13-target-onboarding.md
│   │   │   ├── 14-anti-hallucination.md      # name-validator на стороне pao
│   │   │   ├── 15-journal-discipline.md
│   │   │   └── 16-github-sync.md
│   │   └── specs/                     # tree-sitter cookbook, libclang патчи
│   ├── specs/
│   ├── tasks/
│   ├── prompts/                       # 🌟 КОПИИ из rag-mentor/for_rag_pao/ + журналы (Alex)
│   │   ├── v1/
│   │   │   ├── 001_doxygen_simple_class.md           # копия
│   │   │   ├── 001_doxygen_simple_class.journal.md   # 🌟 ЖУРНАЛ выполнения
│   │   │   ├── 002_doxygen_template_class.md
│   │   │   ├── 002_doxygen_template_class.journal.md
│   │   │   ├── ...
│   │   │   └── 012_judge_gtest_quality.md
│   │   ├── README.md                  # «источник: rag-mentor/MemoryBank/prompts/for_rag_pao/»
│   │   └── sync.log                   # история rsync/git pull из rag-mentor
│   ├── sessions/
│   └── changelog/
│
├── .rag/                              # 🌟 ВРЕМЕННОЕ хранилище артефактов
│   ├── README.md
│   ├── _migration_plan.md             # как перенести в исходники target одним махом
│   │
│   └── <target_proj_name>/            # один каталог на target
│       ├── _RAG.md                    # манифест (формат из 09_RAG_md_Spec)
│       │
│       ├── L1_architecture/
│       │   ├── C1_context.md
│       │   ├── C2_container.md
│       │   ├── C3_component.md
│       │   ├── C4_code.md
│       │   ├── cmake_graph.md
│       │   └── _gates/
│       │       ├── qa_L1.jsonl
│       │       └── last_run_L1.json
│       │
│       ├── L2_symbols/
│       │   ├── classes/<Namespace>__<Class>.md       # формат из 09_RAG_md_Spec
│       │   ├── functions/
│       │   ├── variables/
│       │   ├── enums/
│       │   └── _gates/qa_L2.jsonl
│       │
│       ├── L3_descriptions/           # 🌟 Qwen генерит сюда
│       │   ├── classes/<Class>.md     # doxygen + test_cases tagged DSL
│       │   ├── tests/                 # 🌟 GoogleTest skeleton (Alex запросил)
│       │   │   └── <Class>_test.cpp
│       │   ├── methods/               # опц. детализация
│       │   └── _gates/qa_L3.jsonl
│       │
│       ├── L4_use_cases/
│       │   ├── use_cases/<slug>.md
│       │   ├── pipelines/<name>.md
│       │   └── _gates/qa_L4.jsonl
│       │
│       ├── sessions/                  # 🌟 ЖУРНАЛ (Alex Q8)
│       │   ├── 001_<Class>_2026-05-20.md      # см. policies.md §B
│       │   ├── 002_<Class>_2026-05-21.md
│       │   └── ...
│       │
│       └── _logs/                     # distillation-friendly JSONL
│           ├── L3_distillation.jsonl  # (prompt, qwen14b_out, judge_score, critic_fb)
│           ├── L3b_gtest_distill.jsonl
│           └── L4_distillation.jsonl
│
├── retrieval/                         # Python (NO pytest)
│   ├── indexer/
│   │   ├── tree_sitter_cpp.py
│   │   ├── libclang_doxygen.py
│   │   ├── cmake_parser.py
│   │   ├── markdown_chunker.py
│   │   ├── doxytags_reuse.py          # 🌟 reuse dsp-asst doxytags CLI (12_DoxyTags_Agent)
│   │   └── incremental.py             # blake3 hash + skip
│   ├── hierarchical_index.py          # координатор L1→L5
│   ├── retriever.py                   # BGE-M3 + Qdrant + PG hybrid
│   ├── reranker.py                    # bge-reranker-v2-m3
│   ├── embedder/
│   │   ├── bge_m3_local.py
│   │   └── bge_m3_remote.py
│   └── api/
│       ├── rest_server.py             # FastAPI — основной контракт
│       └── mcp_server.py              # MCP-обёртка для interactive
│
├── llm_serving/
│   ├── ollama_client.py               # Windows dev
│   ├── vllm_client.py                 # Debian prod
│   ├── model_router.py                # policy: 14B/Coder-14B/35B
│   └── name_validator.py              # 🌟 sanity-check выхода Qwen'а
│
├── finetune/                          # 🌟 QLoRA — обязательная фаза (Alex против out-of-scope)
│   ├── prepare_dataset.py             # из _logs/L*_distillation.jsonl
│   ├── train_qwen14b_qlora.py
│   ├── train_qwen_coder_14b_qlora.py
│   ├── compare_models.py              # «выбираем лучший вариант» (Alex)
│   └── README.md
│
├── pao_db/                            # PG + Qdrant per-target
│   ├── postgres_init.sql              # schema rag_pao_<target>
│   ├── qdrant_bootstrap.py            # collection <target>_v1
│   ├── coexistence.md                 # 🌟 как соседствовать с уже стоящими DSP-GPU данными
│   └── migrations/                    # alembic
│
├── infra/
│   ├── docker-compose.dev.yml         # Windows dev (Ollama)
│   ├── docker-compose.prod.yml        # Debian (vLLM-ROCm)
│   ├── postgres_init.sh
│   ├── qdrant_bootstrap.sh
│   └── healthcheck.sh
│
├── external_corpus/                   # 🌟 более глубокая иерархия по модулям (Alex)
│   ├── README.md
│   ├── doxygen_examples/
│   │   ├── boost_selected/            # ждём список от заказчика (см. phases.md §6)
│   │   ├── eigen/
│   │   ├── opencv/
│   │   ├── fmt/
│   │   ├── spdlog/
│   │   ├── nlohmann_json/
│   │   └── stdlib_libstdcxx/
│   ├── test_examples/                 # 🌟 GoogleTest примеры (Alex)
│   │   ├── gtest_examples/
│   │   ├── catch2_examples/
│   │   └── boost_test/
│   ├── papers/                        # PDFs DSPy/RAPTOR/TextGrad
│   └── crawler/
│       ├── github_doxygen_crawler.py
│       ├── url_list.yaml
│       └── dedupe.py
│
├── golden_set/                        # глобальные QA
│   ├── L0_corpus.jsonl
│   ├── L1_arch.jsonl
│   ├── L2_symbols.jsonl
│   ├── L3_descriptions.jsonl
│   ├── L3b_gtest.jsonl                # NEW
│   ├── L4_use_cases.jsonl
│   └── L5_qlora.jsonl                 # NEW (для оценки fine-tuned моделей)
│
└── scripts/
    ├── bootstrap.sh                   # 5 шагов вручную
    ├── add_target.sh                  # клонирует target → targets/<name>/
    ├── reindex_all.sh
    ├── eval_run.sh
    └── sync_prompts_from_mentor.sh    # pull из rag-mentor
```

---

## 3. Где источник истины (резюме после правок Alex)

| Артефакт | Источник | Reader |
|----------|----------|--------|
| **prompts для mentor'а (себя)** | `rag-mentor/MemoryBank/prompts/for_mentor/v1/` | только Claude в rag-mentor |
| **prompts для Qwen (нумерованные 001-)** | `rag-mentor/MemoryBank/prompts/for_rag_pao/v1/` | rag-pao читает через sync |
| **per-prompt journals** (Alex Q8) | `rag-pao/MemoryBank/prompts/v1/NNN_*.journal.md` | history — какие классы пробовали, результаты |
| **per-class sessions** | `rag-pao/.rag/<target>/sessions/NNN_<Class>_<date>.md` | rag-mentor читает через REST для critic |
| **rules** | `rag-mentor/MemoryBank/.claude/rules/` + `rag-pao/MemoryBank/.claude/rules/` (адаптированные) | оба Claude Code instances |
| **JSON Schemas** | `rag-mentor/MemoryBank/prompts/for_rag_pao/schemas/` | rag-pao validator |
| **golden_set** | `rag-pao/golden_set/` (центр — pao выполняет тесты) | rag-mentor pulls for analytics |
| **prompts metadata + history** | `rag-mentor/mentor_db/` (PG `rag_mentor`) | только mentor |
| **target symbols + descriptions** | `rag-pao/pao_db/` (PG `rag_pao_<target>` + Qdrant) | оба через REST |
| **Anthropic API key** | `rag-mentor/config/secrets.env` (НЕ в git) | mentor only |
| **target sources** | `rag-pao/targets/<name>/` (git submodule или local copy от заказчика) | indexer only |

---

## 4. PG schema coexistence (Alex's правка)

> Alex: «нужно учесть что на PostgreSQL & Qdrant уже есть данные по текущему проекту + ещё будут».

**Стратегия**:
- Один PostgreSQL instance, **разные schemas**:
  - `dsp_gpu` (текущий проект, не трогаем)
  - `rag_mentor` (для rag-mentor)
  - `rag_pao_<target>` per target (rag_pao_nlohmann_json, rag_pao_spdlog, ...)
- Один Qdrant instance, **разные collections**:
  - `dsp_gpu_v1` (существует)
  - `mentor_v1`
  - `<target>_v1` per target

**Никаких конфликтов** — namespace через `CREATE SCHEMA`.

---

## 5. `.gitignore` политика

### rag-mentor/.gitignore

```
# secrets
.env
config/secrets.env
config/*.local.json

# python
__pycache__/
*.pyc
.venv/
.pytest_cache/        # хотя pytest запрещён, кэш на всякий случай

# logs
logs/
*.log

# PG/Qdrant data (если volume mount внутрь)
mentor_db/data/
mentor_db/*.dump
```

### rag-pao/.gitignore — он локальный git, артефакты КОММИТИМ (Alex 2026-05-20)

> Принцип: всё что **сгенерировано Qwen / Claude** (artifacts), **журналы**, **distillation_logs** — коммитим в локальный git как историю. Не коммитим только binary blob БД и кэши.

```
# secrets
.env
config/secrets.env

# python (всегда пропуск)
__pycache__/
*.pyc
.venv/

# DB binary blob — НЕ коммитим (pg/qdrant держат свой format на диске)
pao_db/data/
qdrant_storage/
postgres_data/
# но pao_db/*.dump (pg_dump текстовый) — КОММИТИМ для бэкапа
postgres_data/

# Target source mirrors (cloned read-only — не наш код)
targets/*/
!targets/.gitkeep

# Logs
logs/
*.log

# !!! .rag/ КОММИТИМ — это артефакты (Alex явно сказал)
# !!! _logs/ внутри .rag/ КОММИТИМ (distillation dataset)
```

---

## 6. Open questions (актуальные)

| # | Вопрос | Статус |
|---|--------|--------|
| ~~Q11~~ | rag-pao git? | ✅ **Закрыт Alex 2026-05-20: локальный git, без remote (имитация офлайн-сервера)** |

---

*End of structure spec v0.2*
