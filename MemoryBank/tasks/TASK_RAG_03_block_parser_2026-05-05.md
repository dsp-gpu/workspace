# TASK_RAG_03 — Парсер Doc/*.md → doc_blocks + RagQdrantStore

> **Статус**: ✅ DONE (2026-05-06) · **Приоритет**: HIGH · **Время**: ~3 ч факт · **Зависимости**: TASK_RAG_02
> **Версия**: v2 (после ревью v2.1) · добавлены RagQdrantStore + UUID v5 + deregister
>
> **Pilot результат** (spectrum/Doc/*.md, 16 файлов):
> - 457 блоков, все уникальны
> - 119/457 (26%) с whitelist concept; остальные с fallback slug — для ревью Alex'а
> - BGE-M3 batch embedding 457 текстов: 3.6 сек
> - PG.doc_blocks(repo=spectrum) = Qdrant(target=doc_blocks, repo=spectrum) = 457 ✅
> - Re-run idempotent: 0 INSERT, 0 UPDATE, 0 embed, skip_unchanged=457 ✅
>
> **Реализация** (в `C:\finetune-env\dsp_assistant\`, не в DSP-GPU):
> - `utils/block_id.py` — make_block_id, parse_block_id, slugify, to_snake_case, CONCEPT_WHITELIST
> - `retrieval/rag_vector_store.py` — RagQdrantStore (UUID v5 namespace, query_points API Qdrant 1.17)
> - `modes/doc_block_parser.py` — markdown-it-py парсер с глобальным dedup per-file
> - `modes/rag_writer.py` — register_blocks_batch с idempotency (source_hash + human_verified guard)
> - `cli/main.py` — расширен `dsp-asst rag blocks ingest --repo X [--dry-run] [--re-embed]`

## Цель

Написать инфраструктуру:
1. **`doc_block_parser.py`** — парсер `Doc/*.md` (h2/h3 + ручные якоря) → `doc_blocks` (PG).
2. **`rag_vector_store.py`** — `RagQdrantStore` + `VectorPoint` + `make_point_id` (UUID v5).
3. **`rag_writer.py`** — общий `register_block`/`register_use_case`/`register_pipeline`/`deregister_block` для всех 3 агентов.
4. **`block_id.py`** — slug-генератор + версионирование.
5. CLI subcommand `dsp-asst rag blocks ingest`.

**Существующий `retrieval/vector_store.py` НЕ ТРОГАЕМ** (он для symbols, рабочий код).

## Входные источники

- `<repo>/Doc/*.md` (все, включая под-компоненты: `fft_func_Full.md`, `filters_Full.md` и т.п.)
- Whitelist concept'ов из плана §6
- Опционально: ручные якоря `<!-- rag-block: id=... -->...<!-- /rag-block -->` (приоритет выше авто)

## Артефакты

| Файл | Что |
|---|---|
| `dsp_assistant/utils/block_id.py` | `make_block_id`, `parse_block_id` (см. план §4) |
| `dsp_assistant/modes/doc_block_parser.py` | парсер h2/h3 + якорей через **`markdown-it-py`** (зафиксирован) |
| `dsp_assistant/retrieval/rag_vector_store.py` | **НОВЫЙ файл** — `RagQdrantStore`, `VectorPoint`, `RagHit`, `make_point_id`, `NS_RAG` |
| `dsp_assistant/retrieval/resolver.py` | (опц., для TASK_RAG_12) PG lookup для reranker'а |
| `dsp_assistant/modes/rag_writer.py` | общий писатель — `register_block` (PG INSERT + BGE-M3 + Qdrant upsert), `deregister_block` (Qdrant delete по UUID v5) |
| `dsp_assistant/cli/main.py` | subcommand `dsp-asst rag blocks ingest` |

## Шаги

### 1. `block_id.py`
- `make_block_id(repo, class_or_module, concept, sub_index=None, version=1)` → str
- `parse_block_id(s)` → dict (для re-import)
- Коллизии: проверка в БД, инкремент version.

### 2. `rag_vector_store.py` (НОВЫЙ)

```python
import uuid
import numpy as np
from dataclasses import dataclass
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue, MatchAny, PointIdsList

NS_RAG = uuid.UUID('5a3e1d2b-9c8f-4a6e-b1d0-7e5f3c2a9d8b')

def make_point_id(target_table: str, target_id: str) -> str:
    """UUID v5 — детерминированный, идемпотентный."""
    return str(uuid.uuid5(NS_RAG, f"{target_table}:{target_id}"))

@dataclass
class VectorPoint:
    target_table: str   # 'doc_blocks' | 'use_cases' | 'pipelines'
    target_id:    str
    repo:         str
    vector:       np.ndarray  # (1024,) float32

@dataclass
class RagHit:
    target_table: str
    target_id:    str
    score:        float
    payload:      dict

class RagQdrantStore:
    """RAG-хранилище. БЕЗ наследования от VectorStore."""
    def __init__(self, endpoint: str, collection: str = "dsp_gpu_rag_v1"):
        self.client = QdrantClient(url=endpoint)
        self.collection = collection

    def upsert(self, points: list[VectorPoint]) -> int: ...
    def search(self, qv, top_k=20, filters=None) -> list[RagHit]: ...
    def deregister(self, target_table: str, target_id: str) -> int: ...
```

### 3. `doc_block_parser.py`
- **`markdown-it-py`** для AST (зафиксирован, не `mistune`).
- Авто: разбиение по h2/h3, slug concept'а из заголовка по whitelist (план §6).
- Ручной: regex `<!-- rag-block: id=([^ ]+)( [^>]+)? -->(.+?)<!-- /rag-block -->`.
- >2000 симв → split на `_001`, `_002`.
- Whitelist fallback: если concept не в whitelist → `concept = slugify(title)`, флаг `is_whitelisted=false` для ревью.

### 4. `rag_writer.py`
- `register_block(repo, source_file, block_data) -> bool`:
  1. Compute `source_hash = sha1(content)`
  2. PG: INSERT/UPDATE `doc_blocks` (если source_hash изменился)
  3. BGE-M3: `vec = embedder.encode(content_md)`
  4. Qdrant: `RagQdrantStore.upsert([VectorPoint(target_table='doc_blocks', target_id=block_id, repo, vector=vec)])`
- `register_use_case(...)`, `register_pipeline(...)` — аналогично с другими `target_table`.
- `deregister_block(target_table, target_id)`:
  - PG: `DELETE FROM doc_blocks/use_cases/pipelines WHERE id = ...`
  - Qdrant: `RagQdrantStore.deregister(target_table, target_id)`
  - Триггерится при: смене block_id (новая версия `__v2`), удалении Doc-секции, смене `deprecated_by`.

### 5. CLI
```
dsp-asst rag blocks ingest --repo spectrum [--dry-run] [--re-embed]
```
- `--dry-run`: парсинг без записи в БД/Qdrant, вывод плана.
- `--re-embed`: принудительная переэмбеддизация всех блоков репо.

## Definition of Done

- [ ] Запуск на `spectrum/Doc/*.md` создаёт ≥30 записей в `rag_dsp.doc_blocks`.
- [ ] Каждый `block_id` уникален в `rag_dsp.doc_blocks`.
- [ ] **`qdrant.count("dsp_gpu_rag_v1", filter={"target_table":"doc_blocks","repo":"spectrum"}) == count(*) FROM rag_dsp.doc_blocks WHERE repo='spectrum'`** (PG ↔ Qdrant консистентны).
- [ ] Ручные якоря приоритетнее автомата (тест: 1 файл с явным якорем).
- [ ] `--dry-run` выводит план без записи в БД и Qdrant.
- [ ] **Re-run на тех же файлах → 0 INSERT, 0 UPDATE в PG, 0 upsert в Qdrant** (skip по source_hash).
- [ ] `make_point_id("doc_blocks", "spectrum__fft__pipeline__v1")` возвращает **тот же UUID** на повторных вызовах (детерминизм UUID v5).
- [ ] `deregister_block(...)` удаляет и из PG, и из Qdrant (smoke-тест на 1 dummy-блоке).
- [ ] Существующий `retrieval/vector_store.py` **не тронут** (`git diff` показывает только новые файлы).

## Связано с

- План: §4 (block_id), §5.2.5 (Qdrant), §6 (ingestion стратегия)
- Ревью v2.1: §«RAG-хранилище — отдельный класс», §«Hybrid retrieval», §«Таски → TASK_RAG_03»
- Зависит от: TASK_RAG_02
- Блокирует: TASK_RAG_04, 05, 07, 09
