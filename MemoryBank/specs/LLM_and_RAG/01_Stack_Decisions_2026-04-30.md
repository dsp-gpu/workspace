# Стек технологий — обоснование выбора

> **Версия:** 1.0 (после Итерации 2 — 2026-04-30) · **Автор:** Кодо
> **Принцип:** все компоненты должны переноситься между этапами 1→2→3→4 (8B Ollama дома → 32B vLLM на работе → мини-сервер → A100/большая модель). Меняется только LLM-runtime — индекс/промпты/код остаются.

---

## 1. Сводная таблица

| Компонент | Выбор | Версия | Альтернативы (обоснование отказа) |
|-----------|-------|--------|-----------------------------------|
| **LLM (этап 1)** | Qwen3 8B Q4_K_M | latest GGUF | — это рабочая |
| **LLM (этап 2)** | Qwen3 32B Q4_K_M / AWQ | latest | — рабочая |
| **LLM-runtime (этап 1-2 локально)** | Ollama | ≥ 0.4 | llama.cpp напрямую (нет HTTP-batching), vLLM (Linux+GPU дороже на 1 user) |
| **LLM-runtime (мини-сервер 3, prod 4)** | vLLM | latest | SGLang (близко по фичам, меньше комьюнити) |
| **Embeddings** | BGE-M3 (BAAI) | latest | nomic-embed-code (только код, теряем русские комменты), Qwen3-embedding (хорошо, но больше памяти) |
| **Vector DB (home Win)** | **pgvector** в PostgreSQL | ≥ 0.7 | Qdrant (нет нативной Win-сборки → требует Docker) |
| **Vector DB (work/server)** | **Qdrant** standalone | ≥ 1.12 | pgvector (слабее на гибриде на больших объёмах) |
| **Metadata DB / Symbol-graph / Test-params** | **PostgreSQL + pg_trgm** | ≥ 16 | SQLite (один writer-lock, не подходит при 5 разработчиках), MySQL (хуже JSONB) |
| **Sparse search (BM25)** | **PostgreSQL `tsvector` + GIN** | встроено в PG 16 | tantivy (отдельный движок, не нужен — Postgres уже есть), Elastic (оверкилл) |
| **Reranker** | BGE-reranker-v2-m3 | latest | Cohere (платный, облачный), Qwen3-reranker (если выйдет лучше) |
| **Symbol-graph (C++ семантика)** | clangd LSP | ≥ 18 | libclang Python (сложнее), ctags (грубо) |
| **AST chunking (C++)** | tree-sitter + `tree-sitter-cpp` | latest | clangd-only (медленно для каждого файла) |
| **AST chunking (Python)** | встроенный `ast` | stdlib | tree-sitter-python (избыточно, ast хватает) |
| **CMake parser** | свой naive по блокам `target_*/find_*/add_*` | — | cmake-language-server (тяжёлый), cmake AST (нет) |
| **Doxygen парсинг** | `doxygen --xml` → ElementTree | doxygen 1.10+ | regex (хрупко) |
| **MCP-сервер** | `mcp` Python SDK (Anthropic) | latest | свой JSON-RPC (зачем) |
| **HTTP API** | FastAPI | ≥ 0.110 | Flask (старее), starlite (меньше комьюнити) |
| **Postgres-клиент Python** | `psycopg[binary]` | ≥ 3.1 | psycopg2 (старый), asyncpg (хорош, но не нужен async на dev) |
| **Migrations** | `alembic` | latest | руками SQL (сложнее) |
| **Тестирование самого ассистента** | `common.runner.TestRunner` (твой) | — | pytest запрещён правилом 04 |
| **Fine-tune (этап 9-10)** | QLoRA через `peft` + `trl.SFTTrainer` | как в `train.py` | full FT (нужно много VRAM), DPO (после SFT — отдельная фаза) |
| **Quantization после LoRA** | merge → GGUF Q4_K_M через `llama.cpp/convert_hf_to_gguf.py` | latest llama.cpp | AWQ/GPTQ (для vLLM, на 32B) |
| **Управление зависимостями (Python)** | `uv` | latest | pip+venv (медленнее), poetry (тяжелее) |

---

## 1.1. Финальная архитектура хранилищ — гибрид per-stage

### Stage 1 (home, Windows): только PostgreSQL

```
┌─────────────────────────────────────────────────────────┐
│ PostgreSQL + pgvector (одна БД, один сервис)            │
│ - symbols, deps, files, includes                        │
│ - test_params, ai_summary, rag_logs                     │
│ - BM25 через tsvector + GIN индекс                      │
│ - embeddings: vector(1024) с HNSW индексом              │
└─────────────────────────────────────────────────────────┘
```

**Почему так:** на Windows нет нативной сборки Qdrant — пришлось бы тащить Docker Desktop. Pgvector делает то же на наших объёмах (~3000 векторов) без потерь скорости. Один сервис, проще.

### Stage 2+ (work Debian, мини-сервер Ubuntu, prod): PostgreSQL + Qdrant

```
┌─────────────────────────────────────────────────────────┐
│ PostgreSQL (одна на проект)                             │
│ - symbols, deps, files, includes                        │
│ - test_params, ai_summary, rag_logs                     │
│ - BM25 через tsvector                                   │
│ - таблица embeddings СОЗДАНА но ПУСТА (vectors в Qdrant)│
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│ Qdrant (нативный сервис, systemd)                       │
│ - dense embeddings BGE-M3 (1024-dim)                    │
│ - 2 коллекции: public_api + internal                    │
│ - payload: symbol_id, repo, namespace, layer, kind      │
└─────────────────────────────────────────────────────────┘
```

**Почему так:** Linux отлично держит Qdrant как нативный сервис, гибридный поиск из коробки, готовы к нагрузке 5+ разработчиков.

### Абстракция в коде

`dsp_assistant/retrieval/vector_store.py` определяет интерфейс `VectorStore`. Две реализации:
- `PgvectorStore` — для stage 1
- `QdrantStore` — для stage 2+

Активная выбирается по `configs/stack.json` → `stages.<active>.vector_db.provider`. Всё остальное в pipeline (rerank, фильтры, режимы) одинаковое.

### Runtime данные (вне git)

- Linux/Debian/Ubuntu: `~/.dsp_assistant/`
- Windows: `C:\finetune-env\.dsp_assistant\`

Содержит: model cache (BGE-M3, reranker), Postgres data dir (если локальный), Qdrant collection (только на Linux), logs.

---

## 2. Обоснование ключевых решений

### 2.1. Почему BGE-M3 для embeddings

- **Multilingual** — русские комменты в коде индексируются корректно (важно: у тебя docstrings и комменты на русском).
- **8K контекст** — целая функция / класс влезает в один embedding без разбивки.
- **Code-aware** — обучен в т.ч. на коде, не только на естественном языке.
- **Размер** — ~568M параметров, ~2.3GB на диске. Шустро на CPU (батчем) и на GPU.
- **Совместимость** — есть нативная поддержка в `sentence-transformers`, `FlagEmbedding`, и в Qdrant как поставщик embeddings.

**Альтернатива:** при доступе к Qwen3-embedding (если выйдет официальный) — поменяем точечно (одна строка конфига). Архитектура не меняется.

### 2.2. Почему PostgreSQL вместо SQLite (NEW: Итерация 2)

- ✅ **Многопоточная** — на сервере работы 3-5 разработчиков одновременно. SQLite даёт один writer-lock — остальные ждут.
- ✅ **Многопроектная** — один Postgres → схемы `dsp_gpu`, `project2`, … . SQLite каждый раз отдельный файл.
- ✅ **JSONB + GIN-индексы** — `test_params.edge_values`, `extracted_from`, `constraints` хранятся как JSONB и индексируются эффективно.
- ✅ **`tsvector` + `pg_trgm`** — BM25-подобный поиск встроен. Не нужно тащить tantivy отдельным движком.
- ✅ **Транзакции** — атомарное переиндексирование (если упало — никаких полу-обновлённых таблиц).
- ✅ **`pg_dump` / `pg_restore`** — стандартный backup, легко перенести между машинами.
- ✅ **alembic migrations** — версионирование схемы как код.
- ✅ **Future pgvector** — если в Phase 11 решим слить с Qdrant, миграция будет в той же БД.

**Минус:** установка сложнее SQLite. Но на Windows — `winget install PostgreSQL.PostgreSQL` (5 минут), на Debian/Ubuntu — `apt install postgresql-16` (1 минута).

### 2.3. Почему гибрид pgvector (home) / Qdrant (work-server)

**Дома (Windows):**
- У Qdrant **нет нативной .exe сборки** под Windows — только Docker. Docker Desktop = лишний сервис, +память, +лицензия для коммерции.
- Pgvector ставится одной командой `CREATE EXTENSION vector` (входит в EDB-сборку PostgreSQL для Win).
- На наших масштабах (~3000-5000 векторов) разница в скорости незаметна (~30-50 мс/запрос).
- Один сервис вместо двух — меньше геморроя при отладке.

**Работа / мини-сервер / prod (Linux):**
- Qdrant ставится нативно (`apt install` + systemd) — без Docker, без compose.
- Гибридный поиск (dense + sparse) — в одном запросе, без ручного RRF.
- HNSW параметры настраиваются глубже: `ef_construct`, `m`, `ef_search` per-query.
- Filter performance — payload как column-store, фильтры `repo=X AND layer=Y` за миллисекунды.
- На production нагрузке (5+ разработчиков, большие индексы) Qdrant выигрывает.

**Что одинаково на обеих платформах:**
- Эмбеддинги одни и те же (BGE-M3, 1024-dim).
- Метаданные в Postgres (symbols, deps, test_params).
- Алгоритм retrieval (dense top-K → reranker → top-5).
- Промпты и режимы.

**Что переключается одной строкой конфига:** `vector_db.provider: "pgvector" | "qdrant"`. Реализации `PgvectorStore` и `QdrantStore` живут под одним интерфейсом `VectorStore`.
- **Локально** — можно поднять `qdrant-cli` без Docker, в виде standalone бинарника.

**Минус:** требует отдельный процесс (LanceDB embed-only).
**Решение:** на dev-машинах — auto-start через простой батник / systemd unit.

### 2.3. Почему гибридный поиск (BM25 + dense)

На коде:
- **BM25 ловит точные имена** — `ScopedHipEvent`, `BatchRecord`, `gfx1201`.
- **Dense ловит семантику** — «как профилировать ядро», «вычислить SNR», «фильтр Калмана».

Без BM25 запрос «`HeterodyneDechirp`» может не найти класс если в проекте 50 хитов на «дечирп» в комментариях.
Без dense запрос «как замерить время выполнения kernel» не найдёт `ProfilingFacade::BatchRecord`.

**Reranker** (BGE-reranker-v2-m3) поверх top-50 от гибрида → top-5 финальных. Это +5-10% к качеству на коде.

### 2.4. Почему clangd LSP для symbol-graph

Tree-sitter даёт **синтаксис**: где класс, где функция, где поля.
Clangd даёт **семантику**: разрешённые имена, граф вызовов, граф наследования, граф `#include`.

Для запроса «кто вызывает `ScopedHipEvent::Create`» нужна семантика — clangd единственный вариант с полноценной поддержкой C++17.

**Стоимость:** clangd индексирует репо ~30 секунд (один раз), потом инкрементально. Через LSP-protocol — стандартизированно.

**Реализация:** тонкий Python-клиент к clangd через stdio (есть библиотеки `pylspclient`).

### 2.5. Почему MCP, а не свой JSON-RPC

- Continue (с осени 2025) умеет MCP — твой клиент в VSCode подключается одной строкой конфига.
- Claude Code (Кодо) умеет MCP — тебе уже подключены MCP-серверы.
- Anthropic SDK для Python — стандартный способ написать MCP-сервер за ~50 строк.

Нет смысла изобретать свой протокол.

### 2.6. Почему Ollama сейчас, vLLM позже

- Ollama уже стоит у тебя (видно в `enrich_dataset.py`). Минимум усилий на старт.
- Ollama — однопользовательский, на dev-машине. Этого хватает для отладки.
- На сервере работы (3 разработчика одновременно) Ollama даст 24+ сек на p99 (см. `LLM_Hardware_Brief_2026-04-22.md`). Поэтому → vLLM с continuous batching.
- **API-совместимость**: Ollama даёт OpenAI-совместимый HTTP. vLLM тоже. Наш ассистент пишется как клиент к OpenAI API — переключение тривиально.

---

## 3. Аппаратные требования (этап 1, дома)

| Ресурс | Минимум | Комфортно |
|--------|---------|-----------|
| VRAM | 8 GB (Qwen3 8B Q4 — ~5.5 GB + контекст) | 12-16 GB |
| RAM | 16 GB | 32 GB (для индексирования + Qdrant) |
| Диск (SSD) | 30 GB (модели + индекс ~5 GB) | 50 GB |
| CPU | 6 ядер | 8+ |

> Embeddings + reranker + clangd + Qdrant работают на CPU/мало VRAM. Главный потребитель VRAM — Qwen 8B.

---

## 4. Структура Python-пакета `dsp_assistant`

> Живёт в `C:\finetune-env\dsp_assistant\` (рядом с `train.py`).

```
C:\finetune-env\
├── dsp_assistant/                    ← основной пакет
│   ├── __init__.py
│   ├── config/                       ← парсинг configs/*.json из MemoryBank
│   ├── indexer/                      ← Phase 1
│   │   ├── chunker_cpp.py           ← tree-sitter
│   │   ├── chunker_py.py            ← ast
│   │   ├── doxygen_parser.py
│   │   ├── file_hasher.py           ← инкрементальность
│   │   └── build.py                 ← entry-point
│   ├── symbol_graph/                 ← Phase 3
│   │   ├── clangd_client.py
│   │   └── graph_db.py              ← SQLite
│   ├── retrieval/                    ← Phase 2
│   │   ├── dense.py                 ← BGE-M3 + Qdrant
│   │   ├── sparse.py                ← tantivy / Qdrant BM25
│   │   ├── reranker.py              ← BGE-reranker
│   │   └── pipeline.py              ← гибрид + фильтры
│   ├── modes/                        ← Phase 4-7
│   │   ├── explain.py
│   │   ├── find.py
│   │   ├── test.py                  ← TestRunner-style
│   │   ├── doxy.py
│   │   ├── refactor.py
│   │   └── agent.py                 ← tool-calling loop
│   ├── llm/
│   │   ├── ollama_client.py         ← этап 1
│   │   ├── vllm_client.py           ← этап 2-3
│   │   └── prompts.py               ← загрузка из MemoryBank/specs/LLM_and_RAG/prompts/
│   ├── server/
│   │   ├── mcp_server.py            ← главная точка входа
│   │   ├── http_api.py              ← FastAPI (опционально)
│   │   └── cli.py                   ← entry-point CLI
│   └── eval/                         ← Phase 8
│       ├── golden_set.py
│       ├── retrieval_metrics.py
│       └── llm_judge.py
├── tests/                            ← TestRunner-style (не pytest!)
│   ├── common/                       ← симлинк или копия E:\DSP-GPU\DSP\Python\common\
│   └── t_*.py
├── train.py                          ← существующий, доработаем в Phase 10
├── collect_dataset.py                ← существующий, переделаем в Phase 9
├── enrich_dataset.py                 ← существующий, остаётся как утилита
└── pyproject.toml                    ← зависимости через uv
```

---

## 5. Зависимости (черновой `pyproject.toml`)

```toml
[project]
name = "dsp-assistant"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    # Indexer
    "tree-sitter>=0.21",
    "tree-sitter-cpp>=0.22",
    "tree-sitter-python>=0.21",
    # Embeddings + retrieval
    "FlagEmbedding>=1.2",          # BGE-M3, BGE-reranker
    "qdrant-client>=1.12",          # для stage 2+ (Linux)
    # PostgreSQL + pgvector
    "psycopg[binary]>=3.1",         # драйвер
    "pgvector>=0.3",                # клиент для типа vector
    "sqlalchemy>=2.0",              # ORM (опционально)
    "alembic>=1.13",                # миграции схемы
    # LSP
    "pylspclient>=0.1",
    # LLM clients
    "openai>=1.40",                 # для Ollama OpenAI-API + vLLM
    # MCP
    "mcp>=0.9",                     # Anthropic MCP SDK
    # HTTP API
    "fastapi>=0.110",
    "uvicorn>=0.30",
    # Training (уже было)
    "torch>=2.3",
    "transformers>=4.45",
    "peft>=0.12",
    "trl>=0.10",
    "bitsandbytes>=0.43",
    "datasets>=2.20",
    # Утилиты
    "pydantic>=2.7",
    "click>=8.1",
    "blake3>=0.4",                  # инкрементальный хеш файлов
]
```

Установка через `uv`:
```bash
cd C:\finetune-env
uv venv
uv pip install -e .
```

---

## 6. Зависимости вне Python

| Что | Откуда | Зачем | Где |
|-----|--------|-------|-----|
| Ollama | https://ollama.com | runtime LLM (этап 1-2 локально) | везде |
| **PostgreSQL 16** | Win: `winget install PostgreSQL.PostgreSQL` (EDB-installer уже включает pgvector как опцию) · Debian/Ubuntu: `apt install postgresql-16 postgresql-contrib` | metadata DB | везде |
| **pg_trgm + btree_gin** | в составе `postgresql-contrib` | trigram-поиск, комбинированные индексы | везде |
| **pgvector** extension | Win: галочка в EDB Stack Builder ИЛИ собрать из `github.com/pgvector/pgvector` · Linux: `apt install postgresql-16-pgvector` | dense vectors на home (stage 1) | везде (на stage 2+ ставится но не используется) |
| **Qdrant** | https://github.com/qdrant/qdrant/releases (Linux .tar.gz, **на Windows нативной сборки нет**) | dense vectors на work/server | **только Linux** |
| clangd | LLVM ≥ 18 | symbol-graph | везде |
| Doxygen | https://doxygen.nl ≥ 1.10 | парсинг и генерация документации (LaTeX) | везде |
| llama.cpp (для конвертации в GGUF после LoRA) | git clone | этап 10 | везде |

---

## 7. Что подтвердить у Alex (открытые вопросы стека)

1. **Continue MCP** — в твоей версии Continue MCP-сервера видны? (если нет — обновить Continue, либо использовать плагин Cline). Я проверю в WebFetch при старте Phase 4.
2. **PostgreSQL 16** — установлен на dev-машинах? Если нет — `winget install PostgreSQL.PostgreSQL` (Win) / `apt install postgresql-16 postgresql-contrib` (Debian/Ubuntu).
3. **Qdrant** — standalone бинарник (без Docker, проще). Скачать с https://github.com/qdrant/qdrant/releases.
4. **Doxygen уже стоит?** Если нет — поставить.
5. **clangd** — установлен в системе (приходит с LLVM)? Если нет — поставить.
6. **uv** — устанавливал? Если нет — `pip install uv` достаточно для старта.

Все вопросы — мелкие, не блокируют движение. Phase 1 (Indexer MVP) начнётся с установки инструментов.

---

## 8. Что меняется при переезде на работу (32B)

- Меняется LLM-runtime: Ollama → vLLM (другой клиент, тот же OpenAI API → 5 строк кода).
- Меняется vector store: pgvector → Qdrant (одна строка конфига, реализация уже готова).
- Индекс пересоздаётся локально (10 мин).
- Промпты могут стать богаче — 32B лучше держит длинные системные промпты.
- Tool-calling в режиме `agent` начинает работать прилично (8B плох в этом).

**Архитектура и структура каталогов не меняются.**

---

*Конец стека. Следующий файл: `configs/stack.json` — машиночитаемая версия параметров.*
