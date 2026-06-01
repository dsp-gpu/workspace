# ⚙️ 02 — Компоненты стека (справочник)

> Детальная карта 5 сервисов + хранилищ. Дополняет [`03_DEPLOY`](03_DEPLOY_FromScratch.md) (как ставить) и [`07_OPERATIONS`](07_OPERATIONS_Runbook.md) (как обслуживать).

---

## 1. Пять сервисов

| Сервис | Порт | unit-тип | Restart | Назначение | Запуск |
|--------|-----:|----------|---------|-----------|--------|
| `postgresql@16-main` | **5432** | system | no | БД `gpu_rag_dsp` (схема `rag_dsp` + `llm_bench`), symbol-graph, BM25 (tsvector) | data `/var/lib/postgresql/16/main/` |
| `qdrant` | **6333**/6334 | system | always | векторы, коллекция `dsp_gpu_rag_v1` | `/opt/qdrant/qdrant`, data `/home/alex/qdrant_storage/` |
| `ollama` | **11434** | system | always | вспом.: quick-test, `nomic-embed-text` | модели `~/.ollama/models/` |
| `embed.service` | **8765** | **user** | on-failure | BGE-M3 ONNX (CPU) для Continue `@codebase` | `~/.continue/.venv/bin/python ~/.continue/embed_server.py` |
| `dsp-asst.service` | **7821** | **user** | on-failure | главный RAG HTTP API (BGE-M3+BM25+reranker, GPU fp16) | `/home/alex/finetune-env/.venv/bin/dsp-asst serve --port 7821` |

Разделение **system vs user** осознанное: PG/Qdrant/Ollama — общая инфра (требует sudo, `enabled`); embed/dsp-asst — per-user (переезжают с `/home/alex`, без sudo, linger).

---

## 2. PostgreSQL 16

- **БД**: `gpu_rag_dsp`. **Схемы**: `rag_dsp` (RAG) + `llm_bench` (бенчмарк моделей, rule 17).
- **User**: `dsp_asst` / пароль `1` (env `DSP_ASST_PG_PASSWORD`).
- **Auth**: peer (socket) / password (TCP) → подключаться **всегда** `-h localhost`.
- **Расширения**: `vector` (pgvector), `pg_trgm` (fuzzy по именам), `btree_gin`.

### Таблицы `rag_dsp` (symbol-graph + RAG)

| Таблица | Роль |
|---------|------|
| `files` | файл = запись, `blake3_hash` (инкрементальный ре-индекс) |
| `symbols` | классы/методы/поля/enum/free-fn; FQN, kind, doxygen, `ai_summary`, `search_vector` TSVECTOR (BM25 via триггер) + trigram-индексы |
| `deps` | рёбра графа (inherits/calls/uses_type/includes/pybind_for/cmake_link) |
| `includes` | граф `#include` |
| `enum_values` | значения enum |
| `pybind_bindings` | C++ class ↔ Python class/module |
| `test_params` | КФП: `edge_values`/`constraints` (JSONB), confidence, human_verified |
| `doc_blocks` | markdown-блоки; PK slug `{repo}__{class}__{concept}__v{n}`, `inherits_block_id` (иерархии), `source_hash` |
| `use_cases` | карточки use-case: title, `synonyms_ru/en`, `block_refs[]` |
| `pipelines` | `composer_class`, `chain_classes[]`, `chain_repos[]` |
| `ai_stubs` | placeholder-маркеры, `status ∈ {pending,human_filled,rejected}` |
| `cmake_targets` | build-граф |
| `embeddings` | pgvector `vector(1024)` BGE-M3, HNSW (m=16, ef=200) — на Debian обычно пуста (векторы в Qdrant) |
| `rag_logs` | лог запросов → будущий SFT-корпус |

Backup: `pg_dump -h localhost -U dsp_asst gpu_rag_dsp > backup.sql`.

---

## 3. Qdrant

- Нативный бинарь `/opt/qdrant/qdrant` (не Docker), data `/home/alex/qdrant_storage/`.
- **Коллекция `dsp_gpu_rag_v1`**: `vector_size=1024`, `distance=Cosine`, HNSW `m=16, ef_construct=200`.
- Payload: `{target_table: doc_blocks|use_cases|pipelines, target_id, repo}`; point_id = UUID v5; KEYWORD-индексы на `target_table`+`repo`.
- Создание: `qdrant_create_rag_collection.py [--recreate]`.

> ⚠️ `stack.json` упоминает `dsp_gpu_code_v1`/`public_api`/`internal` — **устаревший план**. Боевая = `dsp_gpu_rag_v1`.

---

## 4. Embeddings + reranker

| Компонент | Модель | dim | Где |
|-----------|--------|----:|-----|
| Embeddings (RAG) | **BGE-M3** (`BAAI/bge-m3`), multilingual, 8192 ctx | 1024 | внутри dsp-asst (GPU fp16) |
| Reranker | **`BAAI/bge-reranker-v2-m3`** (cross-encoder) | — | dsp-asst (top 50 → 5) |
| Embeddings (Continue) | BGE-M3 ONNX (CPU) | 1024 | embed.service :8765 |
| Embeddings (сервер без BGE) | `nomic-embed-text` | — | Ollama |

Модели на диске: `offline-debian-pack/1_models/{bge-m3, bge-reranker-v2-m3, nomic-embed-text-v1.5}`. Env offline: `TRANSFORMERS_OFFLINE=1`, `HF_HUB_OFFLINE=1`, при поломке stubs — `DSP_ASST_BGE_M3_PATH`.

---

## 5. dsp-asst (RAG API + MCP)

- **HTTP-сервис**: `dsp-asst serve --port 7821` (держит модели в VRAM, warmup ~7-15с) — должен быть поднят ДО MCP.
- **MCP-клиент**: `dsp-asst --stage 1_home mcp` — тонкий stdio-форк (~50-100мс), ходит по HTTP в 7821.
- **Endpoints**: `/health` `/search` `/find` `/show_symbol` `/repos`.
- **VRAM/RAM**: ~2 ГБ VRAM + ~1.5 ГБ RAM.
- Регистрация в Claude Code → `03_DEPLOY` Шаг 9.

---

## 6. Автостарт (systemd + linger)

```
system (enabled):  postgresql · qdrant(always) · ollama(always)
user   (enabled):  embed.service · dsp-asst.service  (on-failure, RestartSec=10)
linger:            sudo loginctl enable-linger alex   → user-units при boot без логина
```
Порядок boot: PG/Qdrant/Ollama (T+2с) → user-systemd (T+5с) → embed (T+7с) → dsp-asst (T+10с) → готов (T+15с). user-units не видят system-targets → нет `After=postgresql` (компенсируется RestartSec).

---

## 7. Конфиги и пути (сводка)

| Что | Путь |
|-----|------|
| RAG-конфиг (stages, модели) | `MemoryBank/specs/LLM_and_RAG/configs/stack.json` |
| SQL init | `MemoryBank/specs/LLM_and_RAG/configs/postgres_init*.sql` (5 файлов) |
| Qdrant init | `.../configs/qdrant_create_rag_collection.py` |
| Python-пакет + venv | `/home/alex/finetune-env/` (`.venv/bin/dsp-asst`) |
| ingest-скрипты | `finetune-env/{re_ingest_all.sh, ingest_test_tags.py}` |
| embed-сервер | `~/.continue/embed_server.py` |
| модели | `offline-debian-pack/1_models/` |

---

*Maintained by: Кодо · 2026-06-01*
