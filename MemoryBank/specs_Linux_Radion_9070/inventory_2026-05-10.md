# Inventory: что есть сейчас на Windows (10.05)

> **Глубокий анализ** перед миграцией на Debian 12.05.
> Все размеры/пути проверены через файловую систему.

---

## 🏠 Архитектура Windows-машины Alex'a

```
┌─────────────────────────────────────────────────┐
│ Windows host                                    │
│                                                 │
│  E:\finetune-env\  (было C:\finetune-env\ до 11.05) │
│   ├── dsp_assistant/    ← Python-пакет          │
│   ├── *.py (93 скрипта) ← collect_*/build_*/... │
│   ├── dataset_*.jsonl (51) ← обучающий корпус   │
│   ├── qwen3-8b/ (16 GB) ← базовая модель        │
│   ├── .venv/            ← Python 3.11+ venv (per pyproject) │
│   └── start-dsp-asst.bat ← поднимает WSL+PG+Qdrant│
│                                                 │
│  C:\Users\user\.cache\huggingface\              │
│   ├── BAAI--bge-m3/ (4.6 GB)                    │
│   └── BAAI--bge-reranker-v2-m3/ (2.2 GB)        │
│                                                 │
│  ┌────────────────────────────────────┐         │
│  │ WSL Ubuntu                          │         │
│  │  ├── PostgreSQL ← rag_dsp schema    │         │
│  │  ├── Qdrant     ← vector store      │         │
│  │  └── netsh portproxy                │         │
│  │      127.0.0.1:5432 → WSL:5432 (PG) │         │
│  │      127.0.0.1:6333 → WSL:6333 (Qd) │         │
│  └────────────────────────────────────┘         │
└─────────────────────────────────────────────────┘
```

**Ключевое открытие:** PG + Qdrant **уже** работают **совместно** дома — через WSL. На Debian (работа) это будет нативно.

---

## 📦 БД #1: PostgreSQL `gpu_rag_dsp` (в WSL Ubuntu)

```
host:    localhost:5432 (через netsh portproxy → WSL)
db:      gpu_rag_dsp
user:    dsp_asst (pwd=1)
schema:  rag_dsp
ext:     pgvector (для embeddings)
```

**15 таблиц:**

| Таблица | Что | Источник наполнения |
|---------|-----|---------------------|
| `files` | пути всех C++/Python файлов | `dsp_assistant/indexer/file_walker.py` |
| `symbols` | классы / методы / поля / namespaces | `chunker_cpp.py + chunker_python.py` (через **tree-sitter**, не libclang!) |
| `doc_blocks` | rich docs (usecase / python_binding / example / parameters) | `modes/doc_block_parser.py` |
| `embeddings` | BGE-M3 vectors 1024-dim | `embedder_bge_late.py` (BGE-M3 **Late Chunking**) |
| `pybind_bindings` | Python ↔ C++ методы | `modes/pybind_extractor.py` |
| `test_params` | LEVEL 0/1/2 параметры тестов (`@test*`) | `indexer/parse_test_tags.py` (CTX2 — наш) |
| `use_cases` | сценарии использования | `modes/index_class.py` |
| `pipelines` | data-flow pipelines | `compute_pipelines.py` (отдельно) |
| `cmake_targets` | targets + dependencies | `indexer/cmake_parser.py` |
| `deps`, `includes`, `enum_values`, `ai_stubs`, `rag_logs`, `schema_migrations` | вспомогательные | разные скрипты |

**Embeddings count:** 5432 vectors (BGE-M3, 1024-dim, в pgvector).

**Backup в репо:** `E:/finetune-env/backups/_backup_pre_rag_2026-05-06.dump` — **СТАРЫЙ** (от 6.05, до RAG-инфры). Не актуален для миграции.

---

## 📦 БД #2: Qdrant (в WSL Ubuntu)

```
host:  localhost:6333 (через netsh portproxy → WSL)
url:   http://localhost:6333
api:   http://localhost:6334 (gRPC)
```

**Коллекции** (предположительно — нужно проверить через `curl http://localhost:6333/collections`):
- `dsp_symbols` (5432 vectors с metadata)
- `dsp_doc_blocks`
- `dsp_test_params`

Точные коллекции узнаем при тестировании.

---

## 🐍 dsp-asst — главный Python-пакет

**Путь:** `E:/finetune-env/dsp_assistant/` (Windows) / `/home/alex/finetune-env/dsp_assistant/` (Debian)

**Структура:**
```
dsp_assistant/
├── agent/           ← LLM agent + parser
├── agent_doxytags/  ← doxytags обработчик
├── cli/             ← dsp-asst CLI (main.py, click)
├── config/          ← config loaders
├── db/              ← DB connection helpers
├── eval/            ← RAGAs / golden-set
├── indexer/         ← НАПОЛНИТЕЛИ БД! ← ключевое
├── llm/             ← LLM client (Ollama)
├── migrations/      ← schema migrations
├── modes/           ← high-level индексаторы (class/pybind/doc_block)
├── retrieval/       ← RAG retrieval (hybrid: BM25 + dense + reranker)
├── server/          ← FastAPI HTTP + MCP server
└── utils/
```

**Indexer scripts (наполнение БД):**
- `indexer/build.py` — orchestrator
- `indexer/chunker_cpp.py / chunker_python.py` — tree-sitter парсеры
- `indexer/cmake_parser.py` — CMake → cmake_targets
- `indexer/embedder_bge_late.py` — BGE-M3 Late Chunking (best practice 2025)
- `indexer/parse_test_tags.py` — `@test*` теги
- `indexer/persister.py` — запись в PG
- `modes/index_class.py` — индексация class → use_cases
- `modes/doc_block_parser.py` — rich docs
- `modes/pybind_extractor.py` — pybind11 биндинги

**Зависимости** (из `pyproject.toml`):
- `tree-sitter, tree-sitter-cpp, tree-sitter-python` (парсинг C++/Python без libclang!)
- `psycopg[binary], pgvector` (PostgreSQL + vectors)
- `qdrant-client` (Qdrant)
- `FlagEmbedding` (BGE-M3 + reranker)
- `fastapi, uvicorn, mcp` (HTTP + MCP сервер)
- `click, rich, pydantic, blake3, httpx`

**CLI entry-point:** `dsp-asst = "dsp_assistant.cli.main:cli"`.

---

## 📊 Размеры файлов (для SSD планирования)

| Что | Размер | Источник |
|-----|------:|----------|
| `qwen3-8b/` (Qwen3-8B safetensors) | **16 GB** | базовая LLM |
| BGE-M3 (`models--BAAI--bge-m3`) | **4.6 GB** | embeddings |
| BGE-reranker-v2-m3 (`models--BAAI--bge-reranker-v2-m3`) | **2.2 GB** | reranker для hybrid retrieval |
| `dsp_assistant/` (Python пакет) | ~10-50 MB | в git |
| `dataset_v4_2026-05-11.jsonl` | ~50-100 MB | в git |
| `_backup_pre_rag_2026-05-06.dump` | 26 MB (вся `backups/`) | устаревший — НЕ нести |
| Phase B checkpoint (после 12.05) | ~500 MB - 2 GB | если обучаем дома |

**ИТОГО для SSD:** ~23 GB (qwen3-8b + bge-m3 + bge-reranker) + опционально checkpoint.

---

## 🚀 Запуск всего стека (Windows-логика, для понимания)

`start-dsp-asst.bat` делает:
1. `wsl -d Ubuntu -- sudo service postgresql start` ← старт PG в WSL
2. `wsl ... pgrep -x qdrant ...` ← старт Qdrant в WSL (если не запущен)
3. `netsh portproxy` → 5432 + 6333 на 127.0.0.1
4. Активация `.venv` + `dsp-asst ping`

На Debian эти 4 шага — **нативно**, без WSL.

---

## ❌ Что НЕ нужно нести через SSD

- `.obj / .bin / .exe` (компилятор Debian пересоберёт)
- HSACO kernel cache (генерируется автоматически)
- PostgreSQL dump старый (`_backup_pre_rag`) — данные мы перепарсим заново
- `dataset_*.jsonl` — уже в git
- Python скрипты — уже в git
- `.venv/` — пересоздадим через `pip install`

---

*Inventory done: 2026-05-10 поздняя ночь · через анализ файловой системы*
