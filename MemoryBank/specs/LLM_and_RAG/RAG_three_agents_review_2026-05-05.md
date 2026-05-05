# Deep Review — RAG_three_agents_plan + 12 TASK_RAG_*

> **Дата**: 2026-05-05 · **Автор**: Кодо · **Статус**: решения приняты (v2.1)
>
> **Версии**:
> - v2 — первичные решения Alex'а, Variant C.
> - **v2.1** — после meta-review: исправлены 3 блокера (RagQdrantStore отдельным классом, Hybrid resolver, 7 пропусков в правках), добавлены UUID v5 + DSP вариант B + cleanup-триггер.
>
> **Объект ревью**:
> - `MemoryBank/specs/LLM_and_RAG/RAG_three_agents_plan_2026-05-05.md`
> - `MemoryBank/specs/LLM_and_RAG/RAG_Phase0_error_values_audit_2026-05-05.md`
> - `MemoryBank/tasks/TASK_RAG_01..12_2026-05-05.md` (12 файлов)
> - `MemoryBank/tasks/TASK_remove_opencl_enum_2026-05-05.md` (связанный)

---

## ✅ Что подтверждено по факту (cross-check с реальным кодом)

| Объект | Статус | Источник |
|---|---|---|
| BGE-M3 embedder (1024-dim, fp16) | Работает | `C:/finetune-env/dsp_assistant/retrieval/embedder.py` |
| `golden_set/qa_v1.jsonl` | Существует | `MemoryBank/specs/LLM_and_RAG/golden_set/` |
| PG конфиг (host/port/db/user/schema) | Полный | `configs/stack.json` |
| `config/loader.py` — без хардкода | Корректный, читает `stack.json` | `C:/finetune-env/dsp_assistant/config/loader.py:79-134` |
| `agent_doxytags/*` (extractor/walker/heuristics/patcher) | Существует | `C:/finetune-env/dsp_assistant/agent_doxytags/` |
| `retrieval/` (embedder, vector_store, reranker, pipeline) | Существует | `C:/finetune-env/dsp_assistant/retrieval/` |
| `eval/` (golden_set, runner, retrieval_metrics) | Существует | `C:/finetune-env/dsp_assistant/eval/` |
| Кодо подключалась к PG раньше | Подтверждено Alex'ом | (память сессии) |

---

## 🎯 Решения Alex'а (закрытые)

| # | Тема | Решение |
|---|---|---|
| 1 | TASK_06 куда писать class-card | `class-card.py` пишет в `test_params` (методы) + `doc_blocks` (overview/usage). В `use_cases` НЕ пишет. |
| 2 | Phase 0 audit (10 пунктов без ответа) | **Не дозаполняем**. Правило: enum/bool/json → НЕ получают `error_values`. По ним error-test'ы не нужны. Audit закрыт как есть. TASK_RAG_00.5 не нужен. |
| 3 | TASK_06 «delta <10%» | **Удалить из DoD**. Заменить на чек-лист структуры + визуальное ревью Alex'а. |
| 4 | TASK_05 «тесты ≥80%» | Убрать. Тесты пишем «по мере роста, на самые важные моменты в коде». |
| 5 | TASK_01 cross-repo коммит | Только один коммит — в DSP-GPU/MemoryBank. Правки в `C:/finetune-env/dsp_assistant/` Alex держит в голове. |
| 6 | Переименование БД (`dsp_assistant → gpu_rag_dsp`, `dsp_gpu → rag_dsp`) | **Делаем** через `ALTER DATABASE`/`ALTER SCHEMA RENAME`. Никто не подключён, есть перспектива наращивания базы. |
| 7 | Часы (§16/§18) | Не критично, не правим. |
| 8 | DSP мета-репо (план §17.1) | **Вариант B** — пропускаем. У DSP нет C++ классов — class-card / pipeline агенты не работают. Python-API упоминается секцией «Python-эквивалент» внутри C++ use_case карточки + ссылка на `examples/python/*.py`. Соответствует образцу `use_case_fft_batch_signal.example.md`. |
| 9 | Pre-flight через шлюз | OK. Существующий шлюз Win→Ubuntu позволяет `psql -h <host>` / `pg_dump`. Хост берётся из `stack.json`. Python-only fallback не требуется. |
| 10 | UUID v5 для `point_id` | Принят (ниже). Фиксированный namespace в коде, без mapping-таблицы. Идемпотентный upsert. |

---

## 🏗️ Архитектурное решение — Vector Storage (Вариант C)

### Контекст

**Stage'ы из `stack.json`** — рассматриваем только Linux/Qdrant (Windows/pgvector на stage 1_home **исключён**):

| Stage | Где | Vector backend |
|---|---|---|
| ~~1_home (Win, pgvector)~~ | ~~исключён~~ | ~~pgvector~~ |
| **2_work_local** | Debian, локально | **Qdrant** |
| **3_mini_server** | Ubuntu сервер | **Qdrant** |
| **4_production** | A100 сервер | **Qdrant** (per-проект коллекции) |

**Дома** (Windows): код пишется на Win, **БД и Qdrant — на Ubuntu** (через сеть/туннель).

**Существующая инфраструктура**:
- Qdrant коллекция `dsp_gpu_code_v1` — для `symbols`.
- `retrieval/vector_store.py` имеет `VectorStore` ABC + `QdrantStore` (заготовка, `NotImplementedError` Phase 2.5).
- Postgres хранит **metadata** (symbols/files/doc_blocks/use_cases/pipelines) — без vector колонок.

### Решение — **Вариант C**

**Postgres (metadata only)** — 4 новые таблицы из плана §5.2 **БЕЗ** колонки `embedding`:
```sql
CREATE TABLE doc_blocks  ( block_id  TEXT PRIMARY KEY, ..., NO embedding column );
CREATE TABLE use_cases   ( id        TEXT PRIMARY KEY, ..., NO embedding column );
CREATE TABLE pipelines   ( id        TEXT PRIMARY KEY, ..., NO embedding column );
CREATE TABLE ai_stubs    ( id        SERIAL PRIMARY KEY, ... );
```

**Qdrant** — **новая отдельная коллекция** `dsp_gpu_rag_v1` (рядом с существующей `dsp_gpu_code_v1`):
```python
qdrant.create_collection(
    collection_name="dsp_gpu_rag_v1",
    vectors_config=VectorParams(size=1024, distance=Distance.COSINE),
    hnsw_config=HnswConfigDiff(m=16, ef_construct=200),
)
qdrant.create_payload_index("dsp_gpu_rag_v1", "target_table", PayloadSchemaType.KEYWORD)
qdrant.create_payload_index("dsp_gpu_rag_v1", "repo",         PayloadSchemaType.KEYWORD)

qdrant.upsert("dsp_gpu_rag_v1", points=[
    PointStruct(
        id=stable_uuid_from(target_table, target_id),
        vector=embedding_1024,
        payload={
            "target_table": "doc_blocks",      # | 'use_cases' | 'pipelines' | future...
            "target_id":    "spectrum__fft_processor_rocm__pipeline_data_flow__v1",
            "repo":         "spectrum",
            ...
        }
    )
])
```

**RAG-хранилище — отдельный класс, не трогаем существующий `VectorStore`**:

Существующий `retrieval/vector_store.py` (`VectorStore` ABC + `PgvectorStore` + `QdrantStore`-заглушка) — **НЕ ТРОГАЕМ**. Он работает с symbols (`upsert(symbol_ids: list[int], vectors: np.ndarray)`) — индексер кодовой базы зависит от этого контракта.

Для RAG-карточек создаём **новый отдельный** файл `retrieval/rag_vector_store.py`:

```python
# retrieval/rag_vector_store.py — НОВЫЙ файл (TASK_RAG_03)

import uuid
import numpy as np
from dataclasses import dataclass

# Фиксированный namespace проекта — НЕ uuid.uuid4(), иначе UUID разные на разных машинах
NS_RAG = uuid.UUID('5a3e1d2b-9c8f-4a6e-b1d0-7e5f3c2a9d8b')

def make_point_id(target_table: str, target_id: str) -> str:
    """UUID v5 — детерминированный, идемпотентный.
    Один и тот же (target_table, target_id) → всегда тот же UUID на любой машине.
    Никаких mapping-таблиц — это чистая функция."""
    return str(uuid.uuid5(NS_RAG, f"{target_table}:{target_id}"))

@dataclass
class VectorPoint:
    target_table: str   # 'doc_blocks' | 'use_cases' | 'pipelines' | future...
    target_id:    str   # block_id / use_case.id / pipeline.id
    repo:         str
    vector:       np.ndarray  # (1024,) float32

@dataclass
class RagHit:
    target_table: str
    target_id:    str
    score:        float
    payload:      dict

class RagQdrantStore:
    """Хранилище RAG-карточек в Qdrant коллекции `dsp_gpu_rag_v1`.
    БЕЗ наследования от VectorStore — у symbols и RAG-карточек разные контракты."""

    def __init__(self, endpoint: str, collection: str = "dsp_gpu_rag_v1"):
        self.client = QdrantClient(url=endpoint)
        self.collection = collection

    def upsert(self, points: list[VectorPoint]) -> int:
        """Идемпотентный upsert. Re-run на тех же данных → перезапись той же точки."""
        struct_points = [
            PointStruct(
                id=make_point_id(p.target_table, p.target_id),
                vector=p.vector.tolist(),
                payload={
                    "target_table": p.target_table,
                    "target_id":    p.target_id,
                    "repo":         p.repo,
                }
            ) for p in points
        ]
        self.client.upsert(collection_name=self.collection, points=struct_points)
        return len(points)

    def search(self, qv: np.ndarray, top_k: int = 20,
               filters: dict | None = None) -> list[RagHit]:
        flt = None
        if filters:
            must = []
            for k, v in filters.items():
                must.append(FieldCondition(key=k, match=MatchAny(any=v) if isinstance(v, list) else MatchValue(value=v)))
            flt = Filter(must=must)
        res = self.client.search(self.collection, query_vector=qv.tolist(),
                                 limit=top_k, query_filter=flt)
        return [RagHit(target_table=r.payload["target_table"],
                       target_id=r.payload["target_id"],
                       score=r.score, payload=r.payload) for r in res]

    def deregister(self, target_table: str, target_id: str) -> int:
        """Cleanup orphan'а. Вызывается при:
           - смене block_id (новая версия `__v2`),
           - удалении Doc-секции,
           - смене deprecated_by.
        Триггерится из `rag_writer.deregister_block(...)` (TASK_RAG_03)."""
        pid = make_point_id(target_table, target_id)
        self.client.delete(collection_name=self.collection,
                           points_selector=PointIdsList(points=[pid]))
        return 1
```

**Формат `target_id` per `target_table`** (для cleanup, UUID v5, payload):

| target_table | target_id формат | Пример |
|---|---|---|
| `doc_blocks` | `{repo}__{class}__{concept}__v{N}` | `spectrum__fft_processor_rocm__pipeline_data_flow__v1` |
| `use_cases` | `{repo}::{slug}` | `spectrum::fft_batch_signal` |
| `pipelines` | `{repo}::{slug}` | `strategies::antenna_covariance` |

**Поток данных** (для понимания):

```
┌─ INSERT нового блока ─────────────────────────────────────────────┐
│ 1. PG:    INSERT doc_blocks (block_id='spectrum__...__v1', content_md=...) │
│ 2. Code:  uuid = make_point_id("doc_blocks", "spectrum__...__v1")           │
│ 3. BGE:   vec = embedder.encode(content_md)                                  │
│ 4. Qdrant: upsert(point_id=uuid, vector=vec, payload={                      │
│              target_table:"doc_blocks", target_id:"spectrum__...__v1",      │
│              repo:"spectrum"})                                              │
└────────────────────────────────────────────────────────────────────┘

┌─ RE-RUN refresh (тот же блок без изменений) ──────────────────────┐
│ 1. Code: make_point_id(...) → ТОТ ЖЕ UUID (детерминированный)      │
│ 2. Qdrant: upsert идемпотентен — перезапись той же точки, без дублей│
└────────────────────────────────────────────────────────────────────┘

┌─ SEARCH ──────────────────────────────────────────────────────────┐
│ 1. Qdrant.search(qv) → [(uuid_X, score, payload), ...]              │
│ 2. payload.target_id = "spectrum__...__v1"                          │
│ 3. PG: SELECT content_md FROM doc_blocks WHERE block_id='...'       │
│        ↑ это и есть resolver (см. §«Hybrid retrieval» ниже)         │
└────────────────────────────────────────────────────────────────────┘

┌─ DELETE orphan (deregister) ──────────────────────────────────────┐
│ 1. uuid = make_point_id("doc_blocks", old_block_id)                 │
│ 2. Qdrant.delete(point_id=uuid) — UUID детерминированный, всегда   │
│    находим без дополнительного lookup                              │
└────────────────────────────────────────────────────────────────────┘
```

### Почему C (по 3 критериям Alex'а)

| Критерий | Вариант C |
|---|---|
| **Надёжность** | Существующая `dsp_gpu_code_v1` (symbols) не трогается. Новая коллекция изолирована. Cleanup orphan'ов через `qdrant.delete(filter={target_table, target_id})` — нативно. |
| **Повторяемость** | Wipe всех RAG-данных = `qdrant.delete_collection("dsp_gpu_rag_v1") + recreate`. Backup/restore — стандартные snapshot Qdrant. Existing symbols-коллекция не задета. |
| **Расширение** | Завтра появится `ai_stubs` / `examples` / `commit_messages` / `tests_cards` — добавляются БЕЗ DDL/изменения схемы коллекции. Просто `target_table='новое_имя'` в payload. **Главный аргумент в пользу C.** |

### Hybrid retrieval (как искать одновременно symbols + RAG)

**Между Qdrant и reranker'ом обязательно идёт resolver** — SQL lookup в PG для получения текста. Reranker (BGE-reranker-v2-m3) принимает пары `(query, text)`, а Qdrant возвращает только `point_id + payload` без текста. Без resolver'а reranker работает с пустыми строками = мусор.

```python
# retrieval/pipeline.py — hybrid_search с resolver'ом

@dataclass
class Candidate:
    source:        str   # 'symbol' | 'doc_blocks' | 'use_cases' | 'pipelines'
    ref_id:        str   # symbol_id (str) | block_id | use_case.id | pipeline.id
    text:          str   # контент для reranker'а
    score_qdrant:  float

def hybrid_search(query: str, top_k: int = 5) -> list[Candidate]:
    qv = embedder.encode_query(query)

    # 1) Параллельно 2 запроса в Qdrant
    code_hits = qdrant_symbols.search(qv, top_k=20, collection="dsp_gpu_code_v1")
    rag_hits  = rag_qdrant.search(qv, top_k=20,
                  filters={"target_table": ["doc_blocks","use_cases","pipelines"]})

    candidates: list[Candidate] = []

    # 2a) RESOLVER для symbols: SELECT по symbol_id
    sym_ids = [h.payload["symbol_id"] for h in code_hits]
    rows = db.fetchall(
        "SELECT id, fqn, doxy_brief FROM dsp_gpu.symbols WHERE id = ANY(%s)",
        (sym_ids,)
    )
    sym_text = {r["id"]: f"{r['fqn']}\n{r['doxy_brief'] or ''}" for r in rows}
    for h in code_hits:
        sid = h.payload["symbol_id"]
        candidates.append(Candidate(
            source="symbol", ref_id=str(sid),
            text=sym_text.get(sid, ""), score_qdrant=h.score
        ))

    # 2b) RESOLVER для RAG: группируем по target_table → 3 SELECT'а
    by_tbl = defaultdict(list)
    for h in rag_hits:
        by_tbl[h.target_table].append(h.target_id)

    for tbl, id_col, text_col in [
        ("doc_blocks", "block_id", "content_md"),
        ("use_cases",  "id",       "title"),     # use_case: title + synonyms
        ("pipelines",  "id",       "title"),
    ]:
        if not by_tbl[tbl]:
            continue
        rows = db.fetchall(
            f"SELECT {id_col}, {text_col} FROM rag_dsp.{tbl} WHERE {id_col} = ANY(%s)",
            (by_tbl[tbl],)
        )
        text_map = {r[id_col]: r[text_col] for r in rows}
        for h in [x for x in rag_hits if x.target_table == tbl]:
            candidates.append(Candidate(
                source=tbl, ref_id=h.target_id,
                text=text_map.get(h.target_id, ""), score_qdrant=h.score
            ))

    # 3) Reranker — пары (query, text)
    pairs = [(query, c.text) for c in candidates]
    scores = reranker.compute_score(pairs)

    # 4) top-K по reranker score
    ranked = sorted(zip(candidates, scores), key=lambda x: -x[1])
    return [c for c, _ in ranked[:top_k]]
```

**Resolver — отдельная функция** в `retrieval/resolver.py` (TASK_RAG_03), либо часть `rag_writer.fetch_text(...)`. Reranker не должен сам ходить в БД.

### Архитектурная схема

```
┌──────────────────────────────────┐    ┌─────────────────────────────────┐
│ PostgreSQL (Ubuntu)              │    │ Qdrant (Ubuntu)                 │
│  metadata only, БЕЗ vector колонок│    │ ┌─────────────────────────────┐ │
│                                  │    │ │ dsp_gpu_code_v1 (existing)  │ │
│  • symbols, files, includes, ... │    │ │   symbols                   │ │
│  • doc_blocks    (NEW)           │    │ ├─────────────────────────────┤ │
│  • use_cases     (NEW)           │◄───┤ │ dsp_gpu_rag_v1 (NEW)        │ │
│  • pipelines     (NEW)           │    │ │   payload: {target_table,   │ │
│  • ai_stubs      (NEW)           │    │ │             target_id, repo}│ │
│                                  │    │ └─────────────────────────────┘ │
└──────────────────────────────────┘    └─────────────────────────────────┘
                  ▲                                      ▲
                  │                                      │
                  └──────────── Hybrid Retriever ────────┘
                  (search в 2 коллекциях → reranker → top-K)

Клиент (Windows) → SSH/network → Ubuntu (PG + Qdrant + Qwen)
```

---

## 📝 Что править в плане и тасках

### План `RAG_three_agents_plan_2026-05-05.md`

1. **§5.2** — убрать `embedding vector(1024)` колонки из `doc_blocks`, `use_cases`, `pipelines`. Удалить `idx_doc_blocks_embedding` HNSW индекс.
2. **§5.2** — добавить подсекцию **«Vector storage — Qdrant collection `dsp_gpu_rag_v1`»**: schema, payload format, payload индексы.
3. **§5.1** — пометить stage 1_home (pgvector) как **«не рассматриваем»**, основные stage'ы — 2_work_local / 3_mini_server / 4_production.
4. **§3 Архитектура** — добавить `RagQdrantStore` рядом с существующим `vector_store.py`. Hybrid retrieval — 2 коллекции.
5. **§13 Pre-flight** — `psql` + Qdrant ping (ubuntu host).

### Таски

| Таск | Правка |
|---|---|
| **TASK_RAG_01** | Переписать на `ALTER DATABASE dsp_assistant RENAME TO gpu_rag_dsp` + `ALTER SCHEMA dsp_gpu RENAME TO rag_dsp`. Один коммит в DSP-GPU/MemoryBank. Pre-step: `pg_dump` бэкап. Файлы в `C:/finetune-env/dsp_assistant/` (db/client.py, config/loader.py) — правим, **не коммитим** (Alex держит в голове, по решению Alex'а #5). Откат: `ALTER DATABASE gpu_rag_dsp RENAME TO dsp_assistant` + `ALTER SCHEMA rag_dsp RENAME TO dsp_gpu`. |
| **TASK_RAG_02** | DDL 4 таблиц **БЕЗ** `embedding` колонок и **БЕЗ** HNSW индекса в новых таблицах. `vector` extension остаётся в БД (для существующей `embeddings` symbols-таблицы). **+** новый шаг: создать Qdrant коллекцию `dsp_gpu_rag_v1` через Python-скрипт + payload-индексы по `target_table`/`repo`. **`ai_stubs.placeholder_tag` — добавить `UNIQUE`**. DoD: 4 таблицы созданы, **HNSW индекс на `doc_blocks.embedding` НЕ создаётся**, Qdrant `GET /collections/dsp_gpu_rag_v1` → 200. Откат: DROP 4 таблиц + `qdrant.delete_collection("dsp_gpu_rag_v1")`. |
| **TASK_RAG_03** | Артефакты: `retrieval/rag_vector_store.py` (НОВЫЙ файл — `RagQdrantStore`, `VectorPoint`, `RagHit`, `make_point_id` UUID v5 с фикс. `NS_RAG`). `modes/rag_writer.py` — `register_block(...)` (PG INSERT + BGE-M3 + Qdrant upsert), `deregister_block(target_table, target_id)` для cleanup orphan'ов. Существующий `vector_store.py` **НЕ ТРОГАТЬ**. Парсер: **`markdown-it-py`** (зафиксирован). DoD: после `register_block` запись в PG **И** точка в Qdrant — проверка `qdrant.count("dsp_gpu_rag_v1") == N`. |
| **TASK_RAG_04** | DoD строка 22: заменить `SELECT count(*) FROM rag_dsp.doc_blocks WHERE embedding IS NOT NULL` (колонки нет!) на `qdrant.count("dsp_gpu_rag_v1", filter={"target_table":"doc_blocks","repo":"spectrum"}) ≥ 30`. |
| **TASK_RAG_05** | **Убрать DoD строку «покрытие unit-тестами ≥80%»** (решение Alex'а #4 — тесты по мере роста на самые важные моменты). Pre-req: `TASK_remove_opencl_enum` завершён. Запись в `test_params` (методы) + `doc_blocks` (overview/usage), **НЕ в `use_cases`** (решение #1). Re-use: `BaseGenerator`, `rag_writer`, `RagQdrantStore`. |
| **TASK_RAG_06** | DoD: **убрать «delta <10%»** (решение #3). Заменить на чек-лист структуры — frontmatter / все методы / все @test теги перенесены / визуальное ревью Alex'а. **Зафиксировать**: class-card записывает в `test_params` + `doc_blocks`, **НЕ** в `use_cases`. Если `_old.md` структурно эквивалентен — удалить. |
| **TASK_RAG_07** | Re-use: `BaseGenerator` (TASK_05), `rag_writer` (TASK_03), `RagQdrantStore`. Тесты «по мере роста» (если будут DoD на coverage — убрать). |
| **TASK_RAG_08** | DoD строка 31: заменить `WHERE embedding IS NOT NULL` (колонки нет!) на `qdrant.count("dsp_gpu_rag_v1", filter={"target_table":"use_cases","repo":"spectrum"}) ≥ 6`. |
| **TASK_RAG_09** | Re-use: `BaseGenerator`, `rag_writer`, `RagQdrantStore`. Тесты «по мере роста». |
| **TASK_RAG_11** | **DSP — пропускаем (решение #8 / вариант B)**. 7 репо: core, stats, signal_generators, heterodyne, linalg, radar (DSP убрать из таблицы). Python-API упоминается секцией «Python-эквивалент» внутри C++ use_case карточки + ссылка `examples/python/<related>.py`. |
| **TASK_RAG_12** | **Добавить Step 0**: «замер baseline R@5 ДО ingestion'а» отдельным шагом, чтобы доказать прирост от RAG-карточек. Текущий R@5=0.88 в плане §16 — это план-оценка, а не замер. Реальный baseline снять сразу после TASK_RAG_02 (БД пустая по новым таблицам, retrieval работает только по symbols). |

### Phase 0 audit

- Закрыт. Правило в `agent_doxytags/heuristics.py`: **enum / bool / json-path параметры → пропускать при предложении `error_values`**.
- Зафиксировать в `MemoryBank/specs/LLM_and_RAG/12_DoxyTags_Agent_Spec.md` и `prompts/009_test_params_extract.md`.
- **Pointer-правка #2** (одобрена Alex'ом «ДА»): `spectrum/include/spectrum/factory/spectrum_processor_factory.hpp:57` — добавить `error_values=[nullptr, 0xDEADBEEF]` в `@test {...}` блок параметра `backend`. Применяется одним коммитом вместе с правилом enum/bool/json — в отдельный таск не выделяем (правка только в Doxygen-комментарии, на код не влияет).
- Остальные 14 пунктов аудита (enum WindowType/MovingAverageType/PeakMode/FFTOutputMode + json-пути + bool) — **не дозаполняем** по правилу enum/bool/json. Audit закрыт как есть.

---

## 🚀 Правильный старт

### Pre-flight (~30 мин)

```bash
# 1. Подключение к Postgres (Ubuntu host)
python -c "from dsp_assistant.config import load_stack; from dsp_assistant.db import DbClient; \
           cfg=load_stack('2_work_local'); db=DbClient(cfg.pg); db.connect(); print('PG OK')"

# 2. Сколько данных в БД
psql -h <ubuntu-host> -U dsp_asst -d dsp_assistant -c "
  SELECT 'symbols' AS t, count(*) FROM dsp_gpu.symbols
  UNION ALL SELECT 'files', count(*) FROM dsp_gpu.files;
"

# 3. Qdrant ping + список коллекций
curl http://<ubuntu-host>:6333/collections

# 4. Бэкап БД и Qdrant
pg_dump -h <ubuntu-host> -U dsp_asst dsp_assistant > _backup_pre_rag_2026-05-05.sql
curl -X POST http://<ubuntu-host>:6333/collections/dsp_gpu_code_v1/snapshots
```

### Порядок выполнения

1. **Pre-flight** ✅
2. **TASK_RAG_01** — переименование БД (`ALTER DATABASE` + `ALTER SCHEMA`).
3. **TASK_RAG_02** — DDL 4 таблиц БЕЗ embedding + создание Qdrant коллекции `dsp_gpu_rag_v1`.
4. **TASK_RAG_03** — `block_parser`, `rag_writer`, `RagQdrantStore`, `VectorPoint`.
5. **TASK_RAG_04** — pilot ingest spectrum → `doc_blocks` + векторы в `dsp_gpu_rag_v1`.
6. **TASK_RAG_05/06** — class-card агент + pilot FFT.
7. **TASK_RAG_07/08** — usecase агент + pilot spectrum.
8. **TASK_RAG_09/10** — pipeline агент + pilot strategies.
9. **TASK_RAG_11** — раскатка на 7 репо.
10. **TASK_RAG_12** — retrieval validation R@5.

---

## ✅ Что хорошо в плане (явные плюсы — без изменений)

1. **Block ID schema (§4)** — детально, версионирование (`__v1`), sub-index `_001`.
2. **Re-run safety (§8)** — три состояния (skip/warn/regenerate), human_verified не перезаписывается.
3. **AI-stub workflow (§7)** — placeholder Q42 + audit trail.
4. **Pilot-first** — spectrum → strategies → 7 репо.
5. **Минимизация LLM** — только synonyms/related/short stubs.
6. **Переиспользование (§15)** — extractor/walker/heuristics из существующего doxytags.
7. **Подключение к существующей infra** — BGE-M3, Qwen, Qdrant, golden_set уже работают.

---

*Ревью v2: правки приняты, Vector Storage = C на Qdrant. Следующий шаг — применить изменения в плане и тасках.*

---

## 📝 Changelog v2 → v2.1 (2026-05-05)

После meta-review исправлены 3 блокера + добавлены 3 уточнения:

| # | Что исправлено | Где |
|---|---|---|
| **B1** | `RagQdrantStore` — отдельный класс, БЕЗ наследования от `VectorStore`. Существующий `vector_store.py` (для symbols) не трогаем. | §«Архитектурное решение» → подсекция «RAG-хранилище — отдельный класс» |
| **B2** | Hybrid retrieval: добавлен **resolver-шаг** (PG lookup между Qdrant и reranker'ом). Без него reranker получает пустые тексты. | §«Hybrid retrieval» |
| **B3** | §«Что править → Таски» расширена с 6 до **11 строк** — добавлены TASK_04, 07, 08, 09, 11, 12 с конкретными правками DoD/артефактов. | §«Таски» |
| **U1** | UUID v5 с фикс. namespace `NS_RAG`: детерминированный point_id, идемпотентный upsert, без mapping-таблицы. | §«RAG-хранилище» |
| **U2** | DSP мета-репо — **вариант B** (пропускаем). Python в C++ карточках. | §«Решения Alex'а» #8 |
| **U3** | `rag_writer.deregister_block(...)` — триггер cleanup orphan'ов при смене ID / удалении / новой версии. | §«RAG-хранилище» (`RagQdrantStore.deregister`) + Таски TASK_RAG_03 |

**Что НЕ менялось** (подтверждено корректным):
- §«Что подтверждено по факту» (8 утверждений ✅ cross-check с реальным кодом).
- §«Решения Alex'а» #1-#7 (без изменений, добавлены #8-#10).
- §«Vector Storage = Variant C» концепция (3 критерия Alex'а — корректны).
- §«Архитектурная схема» диаграмма.
- §«Pre-flight» команды (через шлюз работают).
- §«Что хорошо» — 7 плюсов плана подтверждены.

**Готово к применению на план + 12 тасков** (Phase A/B/C из meta-review). По v2.1 правки в план и таски пойдут одним проходом без пропусков и без поломки существующего `VectorStore`.

---

*Ревью v2.1: 3 блокера закрыты, 3 уточнения добавлены, DSP=B. Готово править план + 12 тасков.*
