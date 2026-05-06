# TASK_RAG_02 — DDL для 4 новых таблиц RAG + Qdrant коллекция

> **Статус**: pending · **Приоритет**: HIGH · **Время**: ~2 ч · **Зависимости**: TASK_RAG_01
> **Версия**: v3 (2026-05-06: добавлено поле `inherits_block_id` + concept whitelist) · **Variant C**: vectors в Qdrant, в PG только metadata

## Цель

1. Добавить в schema `rag_dsp` четыре новые таблицы — `doc_blocks`, `use_cases`, `pipelines`, `ai_stubs`. **БЕЗ** колонок `embedding` и **БЕЗ** HNSW vector-индекса (Variant C).
2. Создать **новую Qdrant коллекцию** `dsp_gpu_rag_v1` (нет существующей `dsp_gpu_code_v1` — symbols остались в pgvector, см. memory `rag_pgvector_split.md`).
3. **(v3)** Поддержка inheritance между блоками (CMake common ↔ specific, parent CLAUDE.md ↔ child) через поле `inherits_block_id`.

После применения: 4 PG таблицы + 1 Qdrant коллекция готовы для агентов TASK_RAG_03..10 и meta-агентов TASK_RAG_02.5 / 02.6.

## Артефакты

| Файл | Что |
|---|---|
| `MemoryBank/specs/LLM_and_RAG/configs/postgres_init_rag.sql` | НОВЫЙ: DDL четырёх таблиц БЕЗ vector-колонок |
| `MemoryBank/specs/LLM_and_RAG/configs/postgres_init.sql` | append: `\i postgres_init_rag.sql` |
| `MemoryBank/specs/LLM_and_RAG/configs/qdrant_create_rag_collection.py` | НОВЫЙ: Python-скрипт создания коллекции `dsp_gpu_rag_v1` + payload-индексов |
| `MemoryBank/specs/LLM_and_RAG/03_Database_Schema_2026-04-30.md` | дополнить раздел «RAG таблицы» + «Qdrant collections» |

## DDL — точный текст

См. план §5.2 (4 таблицы со всеми индексами и FK). **Отличия от v1**:
- ❌ `embedding vector(1024)` — удалено из всех 3 таблиц.
- ❌ `idx_doc_blocks_embedding` HNSW индекс — удалён.
- ❌ `idx_use_cases_embedding` HNSW индекс — удалён.
- ✅ `ai_stubs.placeholder_tag TEXT NOT NULL UNIQUE` (добавлен `UNIQUE`).
- ✅ `vector` extension в БД **остаётся** — нужен для существующей `embeddings` symbols-таблицы.

**v3 дополнения**:
- ✅ `doc_blocks.inherits_block_id TEXT REFERENCES doc_blocks(block_id)` — для inheritance (NULL у root).
- ✅ `idx_doc_blocks_inherits` индекс.
- ✅ Concept slug whitelist (комментарий в DDL):
  ```
  -- Recommended concept slugs:
  -- Layer-6 классы:    class_overview, usage_example, method_<name>_signature,
  --                    method_<name>_doxygen, method_<name>_test_params
  -- Use-cases:         when_to_use, solution, parameters, edge_cases, next_steps
  -- Pipelines:         chain_overview, used_classes, parameters, edge_cases, data_flow
  -- Doc/ секции:       pipeline_data_flow, math, api, usage, overview, example, tests, benchmark
  -- v3 meta:           meta_overview, meta_claude, meta_cmake_common, meta_cmake_specific,
  --                    meta_targets, meta_rules_index, build_orchestration
  -- v3 Python:         python_binding, python_test_usecase, cross_repo_pipeline
  ```

Ключевые моменты:
- `doc_blocks.block_id` PRIMARY KEY (TEXT) — semantic slug
- `doc_blocks.deprecated_by` FK self-reference (для версий)
- `doc_blocks.inherits_block_id` FK self-reference (v3, для inheritance)
- `use_cases` / `pipelines` имеют `block_refs JSONB` (массив `[{section, block_id}]`)
- `ai_stubs.placeholder_tag` UNIQUE (`Q-{N}` формат, см. план §7)

## Qdrant коллекция

`MemoryBank/specs/LLM_and_RAG/configs/qdrant_create_rag_collection.py`:

```python
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, HnswConfigDiff, PayloadSchemaType
from dsp_assistant.config import load_stack

cfg = load_stack("2_work_local")  # или 3_mini_server
qdrant = QdrantClient(url=cfg.qdrant_endpoint)

qdrant.create_collection(
    collection_name="dsp_gpu_rag_v1",
    vectors_config=VectorParams(size=1024, distance=Distance.COSINE),
    hnsw_config=HnswConfigDiff(m=16, ef_construct=200),
)
qdrant.create_payload_index("dsp_gpu_rag_v1", "target_table", PayloadSchemaType.KEYWORD)
qdrant.create_payload_index("dsp_gpu_rag_v1", "repo",         PayloadSchemaType.KEYWORD)
print("OK: dsp_gpu_rag_v1 создана с payload-индексами по target_table + repo")
```

## Шаги

1. Создать `postgres_init_rag.sql` с DDL (без `embedding`/HNSW, с `UNIQUE` на placeholder_tag).
2. Запустить **на тестовой схеме `rag_dsp_test`** (чтобы не ломать основную):
   ```
   psql -h <host> -U dsp_asst -d gpu_rag_dsp -c "CREATE SCHEMA rag_dsp_test;"
   psql -h <host> -U dsp_asst -d gpu_rag_dsp -v schema=rag_dsp_test -f postgres_init_rag.sql
   psql -h <host> -U dsp_asst -d gpu_rag_dsp -c "\dt rag_dsp_test.*"
   ```
3. Если 4 таблицы появились + индексы (БЕЗ vector) — DROP test schema, применить на основной `rag_dsp`.
4. Smoke: вставить 1 dummy-запись в каждую таблицу, прочитать обратно, удалить.
5. Запустить `qdrant_create_rag_collection.py`. Проверить `curl http://<host>:6333/collections/dsp_gpu_rag_v1` → 200 + конфиг.
6. Smoke Qdrant: `qdrant.upsert(...)` 1 dummy-точку, `qdrant.search(...)`, `qdrant.delete(...)`.

## Definition of Done

- [ ] `\dt rag_dsp.doc_blocks` — таблица существует, индексы (repo, class, concept, related GIN, **inherits**) **БЕЗ** vector index.
- [ ] `\dt rag_dsp.use_cases` — exists.
- [ ] `\dt rag_dsp.pipelines` — exists.
- [ ] `\dt rag_dsp.ai_stubs` — exists.
- [ ] FK `doc_blocks.deprecated_by → doc_blocks.block_id` работает (self-FK).
- [ ] **(v3)** FK `doc_blocks.inherits_block_id → doc_blocks.block_id` работает (self-FK, второй).
- [ ] **(v3)** Smoke: вставить 2 связанных блока (parent + child с `inherits_block_id`), `JOIN` через self-FK возвращает оба.
- [ ] `\d rag_dsp.ai_stubs` показывает `placeholder_tag` с **UNIQUE** constraint.
- [ ] **HNSW vector index НЕ создан** (`\di rag_dsp.idx_*_embedding` — пусто).
- [ ] Qdrant `GET /collections/dsp_gpu_rag_v1` → 200, `vectors_config.size=1024, distance=Cosine`.
- [ ] Qdrant payload-индексы по `target_table` и `repo` созданы.
- [ ] Smoke upsert/search/delete на Qdrant — успешно.
- [ ] Документация обновлена (раздел «RAG таблицы» + «Qdrant collections» в `03_Database_Schema_2026-04-30.md`).

## Откат

```sql
DROP TABLE rag_dsp.ai_stubs;
DROP TABLE rag_dsp.pipelines;
DROP TABLE rag_dsp.use_cases;
DROP TABLE rag_dsp.doc_blocks;
```

```python
qdrant.delete_collection("dsp_gpu_rag_v1")
```

## Связано с

- План: §5.2 + §5.2.5
- Ревью v2.1: §«Решение Variant C», §«Таски → TASK_RAG_02»
- Зависит от: TASK_RAG_01 (иначе нет БД `gpu_rag_dsp`)
- Блокирует: TASK_RAG_03
