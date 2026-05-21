# Шаблонный план: RAG + MCP-server для C++ кодовых баз

> **Версия**: 1.0 · **Дата**: 2026-05-19 · **Автор**: Кодо (Opus 4.7) для Alex
> **Скоуп**: переносимая методика — берётся как есть, адаптируется под конкретный C++ проект (не GPU, не DSP-специфика).
> **Источник опыта**: 9 репо DSP-GPU + `finetune-env`, ~70-80% готовая инфраструктура (45 TASK_RAG_*, 30+ specs/LLM_and_RAG).

---

## TL;DR

Готовый стек DSP-GPU **переносим почти 1:1**, нужно только:
1. убрать DSP-специфику (test_params для GPU kernel'ов, ROCm-обвязку);
2. **закрыть 5 gap'ов** (indexer-в-git, schema-validator, incremental re-index, LLM-judge, schema migrations);
3. формализовать **prompt-pipeline Claude Opus 4.7 → Qwen 14B/32B** (этого пока нет);
4. дать `bootstrap.sh` для нового проекта (создать схему, .rag/ skeleton, golden-seed).

**Конечная цель шаблона**: за **1-2 рабочих дня** развернуть в новой C++ кодовой базе работающий RAG + MCP-сервер с R@5 ≥ 0.85 на golden-set из 30-50 Q&A.

---

## 1. Архитектура

```
┌────────────────────────────────────────────────────────────────────────┐
│                       Source: C++ репозиторий                          │
│  include/  src/  tests/  CMakeLists.txt   Doc/                         │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        ▼                          ▼                          ▼
┌─────────────────┐      ┌──────────────────┐       ┌──────────────────┐
│  Extractors     │      │   .rag/ author   │       │   doxygen XML    │
│  (Python)       │      │   (human + LLM)  │       │  (clang/libclang)│
│  tree-sitter +  │      │   yaml-frontm.   │       │  symbol-graph    │
│  doxygen-xml    │      │   + markdown     │       │                  │
└────────┬────────┘      └────────┬─────────┘       └────────┬─────────┘
         │                        │                          │
         └────────┬───────────────┴──────────────────────────┘
                  ▼
         ┌────────────────────────┐
         │   Normalizer           │   chunking (AST + late-chunking)
         │   block-parser         │   schema-validator (JSON-Schema)
         └────────┬───────────────┘
                  │
        ┌─────────┴──────────────────────────────────────┐
        ▼                                                ▼
┌──────────────────────┐                       ┌──────────────────────┐
│   PostgreSQL         │                       │     Qdrant           │
│   schema: rag_<proj> │                       │   collection         │
│                      │                       │   <proj>_rag_v1      │
│ • doc_blocks         │   point_id =          │   1024-dim BGE-M3    │
│ • use_cases          │   UUIDv5(target_      │   HNSW               │
│ • pipelines          │   table:target_id)    │   payload: repo,     │
│ • test_cases         │ ────────────────────► │   target_table, kind │
│ • symbols (clang)    │                       │                      │
│ • deps   (clang)     │   BM25/tsvector       │                      │
│ • ai_stubs           │                       │                      │
└──────────┬───────────┘                       └──────────┬───────────┘
           │                                              │
           └──────────────┬───────────────────────────────┘
                          ▼
              ┌───────────────────────┐
              │   HybridRetriever     │
              │   dense + sparse      │
              │   RRF merge           │
              │   + reranker          │
              │   (bge-reranker-v2-m3)│
              └──────────┬────────────┘
                         │
              ┌──────────┴────────────┐
              ▼                       ▼
       ┌─────────────┐         ┌──────────────┐
       │ MCP server  │         │ HTTP API     │
       │ (stdio)     │         │ FastAPI      │
       │ Claude /    │         │ /search,     │
       │ Continue    │         │ /show, ...   │
       └─────────────┘         └──────────────┘
                         ▼
                  ┌──────────────┐
                  │ LLM consumer │
                  │ Qwen 14B/32B │   (Debian + ROCm)
                  │  Claude (dev)│
                  └──────────────┘
```

Принципиально: **PG = source of truth + sparse, Qdrant = dense vectors**. Файлы `.rag/*.md` — артефакты человека/LLM, индексируются в PG как records, embed в Qdrant. Никакого «один store правит всем».

---

## 2. Структура артефактов

### 2.1 `.rag/` в каждом модуле (per-repo)

Шаблонная структура (универсально, без DSP-специфики):

```
<repo>/.rag/
├── _RAG.md                      # YAML манифест: версия, layer, key_classes, maturity, tags
├── _RAG_changelog.md            # опц., history
├── meta/
│   ├── claude_card.md           # 1-страничная public-API карта для LLM
│   ├── build_targets.md         # cmake targets, deps
│   ├── cmake_summary.md         # сводка CMake (поля, опции)
│   └── doxygen_modules_index.md # опц., индекс doxygen-групп
├── arch/                        # human-written, C4-model
│   ├── C2_container.md
│   ├── C3_component.md
│   └── C4_code.md
├── use_cases/                   # LLM-generated, human-reviewed
│   └── <slug>.md                # «Когда применять — Решение — Параметры — Pitfalls»
├── test_cases/                  # вместо DSP test_params (общий C++)
│   └── <namespace>_<Class>.md   # граничные значения, throw, инварианты
└── pipelines.md                 # опц., если есть step-chains
```

**`_RAG.md` frontmatter (минимум для шаблона)**:

```yaml
---
schema_version: 1
repo: <name>
version: <semver>
layer: core|compute|composer|meta
maturity: stable|beta|experimental|deprecated
purpose: "1 строка"

modules:
  public: [<dir>, ...]   # auto из include/
  internal: [<dir>, ...] # auto из src/ \ include/

key_classes:             # auto: top по test_cases count + AI brief (Qwen 14B)
  - fqn: <ns::Class>
    brief: "1 строка"
    maturity: stable|beta|...
    methods: <int>
    test_cases_rows: <int>
    test_cases: test_cases/<file>.md

depends_on:
  internal: [<repo>, ...]
  external: [<lib>, ...]

used_by: [<repo>, ...]   # auto из других _RAG.md

architecture_files:
  - .rag/arch/C2_container.md
  - .rag/arch/C3_component.md
  - .rag/arch/C4_code.md

tags:                    # auto (GoF/SOLID/layer):
  - "#layer:<layer>"
  - "#pattern:<Pattern>:<Class>"

ai_generated_at: <ISO8601>
ai_model: <model>
parser_version: 1
---
```

### 2.2 PostgreSQL schema

```sql
CREATE SCHEMA rag_<project>;

-- 1. doc_blocks — нарезка .rag/*.md и Doc/*.md
CREATE TABLE rag_<project>.doc_blocks (
    block_id      BIGSERIAL PRIMARY KEY,
    repo          TEXT NOT NULL,
    source_path   TEXT NOT NULL,            -- .rag/use_cases/x.md
    concept_slug  TEXT NOT NULL,            -- whitelisted: usecase|pipeline|test_case|arch|overview
    target_table  TEXT,                     -- 'use_cases'|'pipelines'|... (FK-hint)
    target_id     BIGINT,
    content_md    TEXT NOT NULL,
    content_hash  CHAR(64) NOT NULL,        -- blake3
    inherits_block_id BIGINT REFERENCES rag_<project>.doc_blocks(block_id),
    search_tsv    TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content_md)) STORED,
    updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_blocks_tsv ON rag_<project>.doc_blocks USING GIN(search_tsv);
CREATE INDEX idx_blocks_repo_concept ON rag_<project>.doc_blocks(repo, concept_slug);

-- 2. use_cases — структурированные records (FK -> doc_blocks)
CREATE TABLE rag_<project>.use_cases (
    use_case_id   BIGSERIAL PRIMARY KEY,
    repo          TEXT NOT NULL,
    slug          TEXT NOT NULL,
    title         TEXT NOT NULL,
    primary_class TEXT,                     -- ns::Class
    related_classes JSONB,                  -- ["ns::A","ns::B"]
    when_to_apply TEXT,
    pitfalls      JSONB,
    UNIQUE(repo, slug)
);

-- 3. pipelines
CREATE TABLE rag_<project>.pipelines (
    pipeline_id   BIGSERIAL PRIMARY KEY,
    repo          TEXT NOT NULL,
    name          TEXT NOT NULL,
    steps         JSONB NOT NULL,           -- [{step, class, fn}, ...]
    UNIQUE(repo, name)
);

-- 4. test_cases — generic C++ (не kernel-specific)
CREATE TABLE rag_<project>.test_cases (
    test_case_id  BIGSERIAL PRIMARY KEY,
    repo          TEXT NOT NULL,
    class_fqn     TEXT NOT NULL,
    method        TEXT,
    edge_values   JSONB,                    -- [{name,value,note}, ...]
    constraints   JSONB,
    throw_checks  JSONB,
    confidence    SMALLINT,                 -- 0..100
    human_verified BOOLEAN DEFAULT FALSE
);

-- 5. symbols (из libclang) — опционально, без LSP можно отложить
CREATE TABLE rag_<project>.symbols (
    symbol_id     BIGSERIAL PRIMARY KEY,
    repo          TEXT NOT NULL,
    fqn           TEXT NOT NULL,
    kind          TEXT,                     -- class|function|struct|enum|typedef
    file_path     TEXT,
    line          INT,
    access        TEXT,                     -- public|private|protected
    doxy_brief    TEXT,
    doxy_detail   TEXT,
    signature     TEXT,
    UNIQUE(repo, fqn)
);
CREATE INDEX idx_sym_trgm ON rag_<project>.symbols USING GIN(fqn gin_trgm_ops);

-- 6. deps — граф связей (опционально)
CREATE TABLE rag_<project>.deps (
    from_symbol_id BIGINT NOT NULL,
    to_symbol_id   BIGINT NOT NULL,
    relation      TEXT NOT NULL,            -- calls|inherits|uses|contains
    PRIMARY KEY(from_symbol_id, to_symbol_id, relation)
);

-- 7. ai_stubs — TODO-блоки для дополнения LLM
CREATE TABLE rag_<project>.ai_stubs (
    stub_id       BIGSERIAL PRIMARY KEY,
    target_table  TEXT NOT NULL,
    target_id     BIGINT NOT NULL,
    field         TEXT NOT NULL,
    prompt        TEXT,
    status        TEXT NOT NULL DEFAULT 'pending', -- pending|filled|verified|rejected
    filled_by     TEXT,
    filled_at     TIMESTAMPTZ
);

-- Расширения
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;       -- pgvector (опционально, для embedded dev)
```

### 2.3 Qdrant collection

```
collection: <project>_rag_v1
vector_size: 1024            (BGE-M3)
distance: Cosine
hnsw_config: {m: 32, ef_construct: 256}
payload_indexes:
  - target_table  (keyword)
  - repo          (keyword)
  - concept_slug  (keyword)
  - class_fqn     (keyword)
point_id: UUIDv5(NS_RAG, "{target_table}:{target_id}")  # детерминированный
```

UUIDv5 — критично: при повторной заливке тот же id → idempotent upsert.

---

## 3. План фаз (8 фаз, 1-2 дня)

| # | Фаза | Что | Output | Когда DONE |
|---|------|-----|--------|------------|
| **0** | Bootstrap | склонировать template, заполнить `project.yaml` | `project.yaml`, `requirements.txt` | `bootstrap.sh` отработал без ошибок |
| **1** | DB setup | поднять PG (docker-compose) + Qdrant + расширения | контейнеры up, схема создана | `psql -c '\dt rag_*.*'` показывает 7 таблиц |
| **2** | Extractor | tree-sitter (C++) + libclang (doxygen XML) → раскладка в `symbols`/`doc_blocks` | заполненные таблицы | `SELECT count(*) FROM symbols` > 0 |
| **3** | `.rag/` skeleton | сгенерировать `_RAG.md` + `meta/claude_card.md` для каждого модуля | артефакты в git | `git status` показывает N модулей с `.rag/` |
| **4** | LLM-fill | Claude Opus 4.7 → промпт для Qwen 14B → заполнить use_cases/pipelines/test_cases | заполненные YAML/markdown | `ai_stubs.status='filled'` для ≥80% записей |
| **5** | Indexer | прогон через embedder (BGE-M3) → Qdrant + PG content | Qdrant collection заполнен | `qdrant get_collection` показывает > 0 точек |
| **6** | Retriever + MCP | поднять FastMCP, 5 tools | MCP-server отвечает, Claude видит tools | Тестовый запрос через Claude возвращает результат |
| **7** | Validation | golden-set 30-50 Q&A → R@5/MRR + LLM-judge | отчёт `eval_<date>.json` | R@5 ≥ 0.85, MRR@10 ≥ 0.55 |

### Зависимости

- Фаза 0 → 1 → 2 → 3 (последовательно, скрипты).
- Фаза 4 — после 3 (нужны заглушки `_RAG.md`).
- Фаза 5 — после 4 (нечего embed'ить без контента).
- Фаза 6 — параллельно с 5 (MCP можно поднимать пока идёт indexing).
- Фаза 7 — после 6 (нужен живой retriever).

---

## 4. Промпт-инженерия: Claude Opus 4.7 → Qwen

### 4.1 Зачем Claude генерит промпты для Qwen

Qwen 14B — **исполнитель** (наполняет use_cases/_RAG.md), **не архитектор**. Claude Opus 4.7 (или Sonnet 4.6 для cost) — **builder промптов**: смотрит на каждую `ai_stubs`-запись, видит контекст (C++ header + doxygen + linked symbols), строит **task-specific промпт** и отдаёт Qwen.

### 4.2 Конвейер

```
ai_stubs (status=pending)
    │
    ▼
┌────────────────────────────────────┐
│  PromptBuilder (Claude Opus 4.7)   │  ← один раз per stub
│  input:                            │
│    - target row (use_case stub)    │
│    - C++ header (primary_class)    │
│    - related symbols (deps graph)  │
│    - schema (JSON-Schema for slot) │
│  output:                           │
│    - dict {system, user, fewshot,  │
│            schema, max_tokens}     │
└────────────┬───────────────────────┘
             ▼
┌────────────────────────────────────┐
│  QwenRunner (Ollama / vLLM)        │  ← массово, batch
│  model: qwen2.5-coder-14b or       │
│         qwen3-14b                  │
│  json_schema mode (грубо: grammar) │
│  retry on schema-fail (3x)         │
└────────────┬───────────────────────┘
             ▼
┌────────────────────────────────────┐
│  Validator                         │
│  - JSON Schema check               │
│  - terminology check (whitelist    │
│    из meta/glossary.md)            │
│  - length / language detector      │
└────────────┬───────────────────────┘
             ▼
┌────────────────────────────────────┐
│  Reviewer (Claude — sampled 10%)   │  ← rejection sampling
│  spot-check, ставит quality 0-100  │
│  если < 70 → status='rejected' →   │
│  re-prompt с rejection reason       │
└────────────┬───────────────────────┘
             ▼
   ai_stubs.status = 'filled'
   write content_md → doc_blocks
```

### 4.3 Шаблон system-промпта для Claude как PromptBuilder

```
ROLE: Ты — prompt engineer. Твоя задача — построить *один* промпт
для модели Qwen2.5-Coder-14B, чтобы она заполнила слот «{field}» в
структуре «{target_table}».

CONTEXT:
- C++ project: {project_name}
- Repo: {repo}, namespace: {namespace}
- Primary class doxygen:
{doxygen_block}
- Related classes (graph deps, top 5):
{related_block}
- Existing examples (3 already-filled use_cases из того же repo):
{fewshot_examples}

INSTRUCTIONS for the prompt you build:
1. Промпт ДОЛЖЕН быть на русском, как у нас в проекте.
2. Qwen 14B должен вывести строгий JSON по схеме:
{json_schema}
3. Запрещённая лексика: {forbidden_terms}
4. Длина: 100-400 слов в каждом текстовом поле.
5. Никаких "TODO" в output — если нет данных, проставить null.

OUTPUT (твой ответ): один YAML-блок с ключами system, user, fewshot,
schema, max_tokens, temperature. Никакой воды.
```

### 4.4 Шаблон Qwen-промпта (output PromptBuilder'а)

```
system: |
  Ты — senior C++ engineer. Заполняешь карточку use_case для класса
  {primary_class} проекта {project_name}. Отвечаешь только валидным JSON.

user: |
  Заполни use_case:
  - slug: {slug}
  - primary_class: {primary_class}

  Контекст (C++ header):
  {header_excerpt}

  Связанные классы:
  {related}

  Заполни поля:
  - title (≤80 chars)
  - when_to_apply (100-200 слов, на русском)
  - solution (100-300 слов, на русском)
  - parameters: [{name, type, default, note}, ...]
  - pitfalls: ["...", ...]   (3-5 пунктов)
  - related_use_cases: [slug, ...]

  Верни JSON по схеме (без markdown-fence):
  {json_schema_inline}

fewshot:
  - input: <example_1_input>
    output: <example_1_output>
  - input: <example_2_input>
    output: <example_2_output>

schema: <json_schema_string>
max_tokens: 1200
temperature: 0.3
```

### 4.5 Почему не одна модель «делает всё»

| Step | Кто | Почему |
|------|-----|--------|
| PromptBuilder | Claude Opus 4.7 | большой context (1M), reasoning, json-schema crafting |
| Filler | Qwen 14B (или 32B по сложным) | дешево, offline, обучен на коде, batch |
| Validator | Python + JSON Schema | детерминированно, без LLM |
| Reviewer (10% sample) | Claude Sonnet 4.6 | дёшево, rejection sampling |
| Final commit | Human | вручную смотрит, accept/reject в PR |

**Стоимость на ~500 use_cases** (DSP-GPU как пример): Claude PromptBuilder ~2-3$, Qwen offline ~0$, Reviewer ~0.5$, Human ~2-4 часа.

### 4.6 Где живут промпты (источник истины)

```
template_rag_mcp/
├── prompts/
│   ├── builder_use_case.md       # system для Claude
│   ├── builder_pipeline.md
│   ├── builder_brief.md          # короткий brief для _RAG.md
│   ├── builder_test_case.md
│   ├── reviewer.md               # Claude как critic
│   └── schemas/
│       ├── use_case.schema.json
│       ├── pipeline.schema.json
│       ├── test_case.schema.json
│       └── brief.schema.json
```

Реальные использующие проекты делают **fork** этих промптов в свой `MemoryBank/prompts/<project>/` — без изменения шаблона.

---

## 5. Indexer (tree-sitter + libclang)

### 5.1 Chunking strategy

Не «фиксированные 512 токенов» — это убивает recall на C++. Стратегия:

| Тип источника | Chunking |
|---------------|----------|
| `.rag/*.md` | **по разделам markdown** (## headings); каждый раздел = 1 doc_block. Late-chunking (контекст всего файла) при embedding. |
| `.hpp` (public API) | **по классам** (tree-sitter `class_specifier`), + 1 chunk на каждую `function_definition` ≥ 30 строк. |
| `.cpp` | по `function_definition`, fallback — по 800 токенов с overlap 100. |
| doxygen XML | 1 chunk на `<compounddef>`, brief+detail+params в один блок. |
| README/Doc/*.md | по разделам, как .rag/. |

**Late chunking** (BGE-M3 поддерживает 8K context):
1. Загружаем **весь файл** (≤8K) в embedder.
2. Получаем **per-token embeddings**.
3. Mean-pool по интервалам [chunk_start_tok, chunk_end_tok].
4. Каждый chunk получает embedding, который «знает» весь файл.

Профит: +10-15% recall@5 на short queries по сравнению с naive chunking (подтверждено в `_eval_late_chunking_2026-05-08.md`).

### 5.2 Indexer CLI (`ragctl index`)

```bash
ragctl index full      # всё с нуля
ragctl index repo <name>
ragctl index since <git-sha>   # только изменённые файлы
ragctl index file <path>       # один файл
ragctl reindex stubs           # переиндексировать после LLM-fill
ragctl validate                # JSON Schema + ссылки
ragctl stats                   # таблица: per repo / per concept count
```

### 5.3 Инкрементальная индексация

Git pre-commit hook:
```bash
#!/bin/bash
changed=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '\.(hpp|cpp|h|md)$')
if [ -n "$changed" ]; then
    ragctl index files $changed --dry-run-check
fi
```

**Hash-based skip**: если `blake3(content)` совпадает с `doc_blocks.content_hash` — пропустить embedder (горячий путь).

---

## 6. MCP-server: 5 базовых tools

| Tool | Args | Returns | Use case |
|------|------|---------|----------|
| **`search`** | text, top_k=5, repo?, kind? | [{score, content, path, fqn}] | универсальный hybrid search |
| **`find`** | name, kind?, limit=20 | [{fqn, file, line, brief}] | подстрочный по имени (без embedding, быстро) |
| **`show_symbol`** | symbol_id\|fqn | {fqn, file, line, doxy, signature, related[]} | полный профиль |
| **`use_case`** | query, repo?, top_k=5 | [{slug, title, solution, ...}] | поиск только по use_cases |
| **`health`** | — | {pg, qdrant, models, version} | диагностика |

**Расширение (опционально)**: `pipeline`, `test_case`, `who_uses`, `deps_graph`.

**Реализация (FastMCP, Python)**:
```python
from fastmcp import FastMCP
mcp = FastMCP("ragctl")

@mcp.tool()
def search(text: str, top_k: int = 5, repo: str | None = None, kind: str | None = None):
    """Hybrid retrieval (BM25 + BGE-M3 + reranker) поверх <project>."""
    return retriever.query(text, top_k=top_k, repo=repo, kind=kind)
```

Регистрация в Claude Code:
```json
{
  "mcpServers": {
    "ragctl-<project>": {
      "command": "ragctl",
      "args": ["mcp"],
      "env": { "RAGCTL_PROJECT": "<project>", "RAGCTL_CONFIG": "stack.json" }
    }
  }
}
```

---

## 7. Deployment (Debian + RX 9070 + ROCm)

### 7.1 Compose

```yaml
# docker-compose.yml
services:
  pg:
    image: pgvector/pgvector:pg16
    environment: [POSTGRES_PASSWORD=...]
    volumes: [pgdata:/var/lib/postgresql/data]
    ports: ["5432:5432"]

  qdrant:
    image: qdrant/qdrant:v1.13
    volumes: [qdrant:/qdrant/storage]
    ports: ["6333:6333"]

  embedder:
    image: bge-m3-server:rocm-7.2     # внутрь pip install FlagEmbedding + ROCm runtime
    devices: ["/dev/kfd", "/dev/dri"]
    ports: ["8081:8081"]

  llm:
    image: vllm-rocm:0.6
    command: --model qwen2.5-coder-14b --tensor-parallel-size 1 --gpu-memory-utilization 0.85
    devices: ["/dev/kfd", "/dev/dri"]
    ports: ["8000:8000"]
```

### 7.2 Конфиг (`stack.json`)

```json
{
  "stages": {
    "dev_windows": {
      "pg": "postgresql://localhost/rag_<project>",
      "qdrant": "http://localhost:6333",
      "embedder": "local-bge-m3",
      "llm": "http://localhost:11434"   // Ollama
    },
    "prod_debian": {
      "pg": "postgresql://pg/rag_<project>",
      "qdrant": "http://qdrant:6333",
      "embedder": "http://embedder:8081",
      "llm": "http://llm:8000/v1"       // vLLM
    },
    "offline_air_gapped": {
      "pg": "postgresql://localhost/rag_<project>",
      "qdrant": "http://localhost:6333",
      "embedder": "local-bge-m3-onnx",
      "llm": "http://localhost:8000/v1"
    }
  }
}
```

Stage переключается env-переменной `RAGCTL_STAGE=prod_debian`.

### 7.3 Hardware budget (для справки)

| Компонент | RAM | VRAM | Disk |
|-----------|-----|------|------|
| PG + Qdrant | 4 GB | — | 5-20 GB |
| BGE-M3 | 4 GB | 2-3 GB | 2 GB |
| Qwen 14B Q4 | 2 GB | 9-10 GB | 8 GB |
| Qwen 32B Q4 | 2 GB | 19-20 GB | 18 GB |
| Reranker | 2 GB | 1.5 GB | 1 GB |
| **RX 9070 16GB**: 14B + reranker + embedder одновременно — **впритык**, 32B — без других на GPU. |

---

## 8. Validation / QA

### 8.1 Golden-set (`qa.jsonl`)

30-50 hand-crafted Q&A pairs. Структура (JSONL):
```json
{
  "id": "Q001",
  "query": "Как использовать <ClassX> для <task>?",
  "expected_artifacts": [
    {"target_table": "use_cases", "slug": "<slug>", "rank_max": 5},
    {"target_table": "symbols",  "fqn": "ns::ClassX", "rank_max": 10}
  ],
  "category": "symbol|usecase|pipeline|integration",
  "difficulty": "easy|medium|hard"
}
```

Распределение: 40% symbol-lookup, 35% usecase, 15% pipeline, 10% cross-repo.

### 8.2 Метрики

| Метрика | Цель шаблона | Что считаем |
|---------|--------------|-------------|
| **Recall@5** | ≥ 0.85 | доля запросов, где expected artifact в top-5 |
| **Recall@10** | ≥ 0.95 | то же, top-10 |
| **MRR@10** | ≥ 0.55 | mean reciprocal rank |
| **Latency p50** | ≤ 200ms | hybrid search (PG + Qdrant + reranker) |
| **Latency p95** | ≤ 800ms | то же |

### 8.3 LLM-judge (опционально, Phase 2)

Для качества ответов (а не только retrieval):
```
prompt: "Оцени, отвечает ли ответ на вопрос. Шкала 0-100.
        Вопрос: {q}
        Top-3 chunks: {chunks}
        Hypothetical answer Qwen: {answer}
        Reference (from golden-set): {ref}"
model: Claude Sonnet 4.6
sample: 10% запросов раз в неделю
```

### 8.4 Eval harness

```bash
ragctl eval run --golden qa.jsonl --modes dense,sparse,hybrid,hybrid+rerank \
                 --out eval_$(date +%F).json
ragctl eval diff eval_2026-05-01.json eval_2026-05-19.json   # регрессия?
```

---

## 9. Адаптация под новый проект (checklist для шаблона)

1. **Заполнить `project.yaml`**:
   ```yaml
   project_name: my_cpp_lib
   repos: [core, util, api]
   namespace_root: my::
   doxygen_xml_dir: build/doxygen/xml
   language: en|ru          # язык use_cases/документации
   ```

2. **Уточнить категории `concept_slug`** (если стандартных мало):
   ```
   default: usecase | pipeline | test_case | arch | overview | api_ref
   extend:  benchmark | migration | troubleshooting
   ```

3. **Подобрать tags-vocabulary** под GoF/SOLID/доменные паттерны (см. `_RAG.md` пример из core: 25+ tags).

4. **Подготовить 3 fewshot-примера** на каждый builder-промпт. Иначе Qwen 14B даёт generic вывод.

5. **Запустить bootstrap**:
   ```bash
   git clone <template> my_cpp_rag
   cd my_cpp_rag
   cp project.yaml.example project.yaml
   ./bootstrap.sh           # ставит pg+qdrant+embedder, создаёт схему
   ragctl index full        # после того как extractor отработал
   ragctl validate
   ragctl eval run --golden qa_seed.jsonl
   ```

6. **Скоуп golden-set**: написать 30 Q&A руками. **Это самая важная инвестиция** — без неё нечем измерить, успешен ли RAG.

7. **Подключить MCP к Claude Code** (одна строчка в `.mcp.json`) — проверить что `search` работает.

8. **Прогнать LLM-fill** на одном репо (пилот), смотреть rejection rate. Только потом — массово.

---

## 10. Что в шаблон НЕ входит (out of scope)

- GPU/DSP-специфика (kernel test_params, ROCm interop).
- Fine-tuning Qwen — это **отдельный** проект (как `finetune-env`). RAG работает на **базовом** Qwen 14B Instruct без QLoRA.
- Web-UI к retriever (есть только CLI + MCP + HTTP).
- Multi-tenant (один проект = одна PG-схема, один Qdrant collection).
- Inкрементальное обучение реранкера (берём готовый `bge-reranker-v2-m3`).

---

## 11. Связь с DSP-GPU как pilot

DSP-GPU = **референсная реализация** шаблона. Когда шаблон обкатан там — выкатываем на новый C++ проект. При расхождениях:

- DSP-GPU специфика (test_params для GPU-методов с edge_values для float-arrays) → **не в шаблон**.
- DSP-GPU 10 репо → **обобщается в N репо** через `project.yaml`.
- DSP-GPU намespace migration (`legacy → dsp::<repo>`) → в шаблон попадает **только сам факт** что namespace может меняться; конкретный recipe — проектный.

**Action item**: для DSP-GPU pilot — отдельный фолдер `template_rag_mcp/extensions/dsp_gpu/`, где лежат GPU-specific промпты, схемы и kernel test_params. Шаблон без extensions = чистый C++ путь.

---

## 12. Risks / Open Questions

- **R1**: Qwen 14B на нестандартной C++ доменной лексике может галлюцинировать API. **Mitigation**: forbidden_terms list + JSON-schema + reviewer на 10-20% sample.
- **R2**: HNSW Qdrant на 100k+ chunks с 1024-dim → ~300 MB RAM. Для 1M+ — рассмотреть quantized (Scalar/Product). В шаблоне — default float32, опционально quantization после нагрузочного теста.
- **R3**: libclang-парсинг на C++20 modules — экспериментален. Fallback: `tree-sitter-cpp` only, без symbol-graph (Phase 1).
- **R4**: BGE-M3 ROCm support — через FlagEmbedding+PyTorch-ROCm (работает) ИЛИ ONNX-runtime+MIGraphX. Для air-gapped — ONNX предпочтительнее.
- **R5**: prompt drift у Claude между версиями (Opus 4.7 → 5.x) — шаблоны промптов должны быть **версионированы** (`prompts/builder_use_case_v1.md`).

---

## 13. References (DSP-GPU)

- Master plan: `MemoryBank/specs/LLM_and_RAG/00_Master_Plan_2026-04-30.md`
- Stack decisions: `MemoryBank/specs/LLM_and_RAG/01_Stack_Decisions_2026-04-30.md`
- DB schema: `MemoryBank/specs/LLM_and_RAG/03_Database_Schema_2026-04-30.md`
- .rag/ spec: `MemoryBank/specs/LLM_and_RAG/09_RAG_md_Spec.md`
- MCP setup: `MemoryBank/specs/LLM_and_RAG/MCP_Setup_Guide_2026-05-01.md`
- Golden-set: `MemoryBank/specs/LLM_and_RAG/golden_set/qa_v1.jsonl`
- Late-chunking eval: `MemoryBank/specs/LLM_and_RAG/_eval_late_chunking_2026-05-08.md`
- Re-rank eval: `MemoryBank/specs/LLM_and_RAG/_eval_rerank_2026-05-06.md`
- Example `_RAG.md`: `core/.rag/_RAG.md`
- finetune-env code: `C:\finetune-env\dsp_assistant\` (retrieval, server, embedder)

---

*End of plan v1.0. Ревью — отдельный документ `template_rag_mcp_cpp_review_2026-05-19.md`.*
