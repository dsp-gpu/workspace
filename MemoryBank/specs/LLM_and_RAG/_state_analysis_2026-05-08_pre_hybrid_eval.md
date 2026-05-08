# RAG state analysis перед треком hybrid_upgrade + eval_extension (2026-05-08)

> **Автор:** Кодо (вечер 8.05) · **Аудитория:** сестрёнка-Кодо, которая возьмёт TASK_RAG_hybrid_upgrade + TASK_RAG_eval_extension
> **Цель документа:** дать **факты** (не предположения) о состоянии БД, кода и метрик до старта трека.
> **Связан с:** `prompts/handoff_RAG_hybrid_eval_2026-05-08.md` (промпт-handoff ссылается сюда).

---

## 0. TL;DR (5 пунктов)

1. ✅ **Schema migration применена** (`dsp-asst migrate up`, 2 файла, 2026-05-08 11:51).
2. ⚠️ **Применена УПРОЩЁННАЯ версия** (M1+M2 по TASK), а **не** расширенная из `configs/postgres_migration_2026-05-08.sql`. Различия — в §2.
3. ✅ `search_tsv` колонки заполнены: doc_blocks 2650 / use_cases 123 / pipelines 8 (100% покрытие).
4. ⚠️ **`rag_logs.hyde_*` НЕ существует** — для C4 HyDE логирование либо доп. миграция, либо in-memory кэш.
5. ⚠️ **`eval/runner.py` работает на pgvector `symbols` через `pipeline.py`**, а **не** на `rag_hybrid.py` (RAG-таблицы). Это важное архитектурное расхождение для E1-E3.

---

## 1. Что **применено** (факты)

### 1.1 Migration runner status (вечер 8.05, 11:51 локально)

```
Total migrations: 2
Applied (2):
  ✅ 2026-05-08_rag_tables_tsvector.sql
  ✅ 2026-05-08_test_params_extend.sql
Pending (0):
```

### 1.2 RAG-таблицы (M2)

| таблица | rows | search_tsv | GIN индекс | триггер upd |
|---|---:|---:|:---:|:---:|
| `rag_dsp.doc_blocks` | **2650** | 2650 | `idx_doc_blocks_tsv` | `trg_doc_blocks_tsv` |
| `rag_dsp.use_cases` | **123** | 123 | `idx_use_cases_tsv` | `trg_use_cases_tsv` |
| `rag_dsp.pipelines` | **8** | 8 | `idx_pipelines_tsv` | `trg_pipelines_tsv` |
| `rag_dsp.test_params` | **0** (пусто) | — | — | — |

**Конфигурация tsvector** (по факту в применённой миграции):

```sql
to_tsvector('simple',
    coalesce(content_md, '') || ' ' || coalesce(repo, '') || ' ' ||
    coalesce(concept, '') || ' ' || coalesce(class_or_module, ''))
-- БЕЗ setweight A/B/C
```

`use_cases` — `title + primary_class + primary_method + jsonb_array_to_text(synonyms_ru/en/tags)`.
`pipelines` — `title + pipeline_slug + composer_class + jsonb_array_to_text(chain_classes/repos)`.

Helper-функция `jsonb_array_to_text(jsonb) → text` создана и используется в триггерах.

### 1.3 test_params расширение (M1)

9 новых колонок:

| column | type |
|---|---|
| `confidence` | double precision |
| `coverage_status` | text |
| `doxy_block_id` | text |
| `embedding_text` | text |
| `linked_pipelines` | text[] |
| `linked_use_cases` | text[] |
| `return_checks` | jsonb |
| `throw_checks` | jsonb |
| `verified_at` | timestamptz |

**5 индексов** на новых полях (по TASK §3.1).

---

## 2. Что **НЕ применено** (важные дельты)

Файл `MemoryBank/specs/LLM_and_RAG/configs/postgres_migration_2026-05-08.sql` (270 строк) — **design-doc, не runner-файл**. Содержит более богатую схему:

### 2.1 RAG-таблицы — другое имя колонки + setweight

| | applied (M2) | configs/postgres_migration_2026-05-08.sql |
|---|---|---|
| Имя колонки | `search_tsv` | `search_vector` |
| setweight | нет | A=block_id/title, B=class/concept/synonyms, C=content_md(8000) |
| Источник | TASK_RAG_hybrid_upgrade §C3 | RAG_kfp_design §3.1 + RAG_deep_analysis §5.1 |

→ **Влияние на C3 sparse BM25**: применённый вариант рабочий (без весов), но top-N точность ниже чем у setweight. **Не блокер**, но в `_eval_hybrid_upgrade_*.md` отчёте надо указать что используется simple-tsvector без setweight.

### 2.2 `rag_logs.hyde_*` колонки — **отсутствуют**

Применённая миграция M1/M2 эти колонки **не добавляет**. Из design-doc запланированы:

```sql
ADD COLUMN hyde_used             BOOLEAN DEFAULT FALSE
ADD COLUMN hyde_hypothesis       TEXT
ADD COLUMN hyde_classifier_mode  TEXT  -- fast/smart_hyde/smart_no_hyde
ADD COLUMN retrieval_iterations  JSONB DEFAULT '[]'  -- A1 CRAG-loop
ADD COLUMN context_pack_intent   TEXT
ADD COLUMN context_pack_include  JSONB DEFAULT '[]'
```

**Влияние на C4 HyDE**: TASK §C4 шаг 3 «Кэш гипотез в `rag_logs.hyde_hypothesis` (5 мин TTL)» — **колонки нет**. Варианты:

- **A.** Сделать **доп. миграцию** `2026-05-09_rag_logs_hyde.sql` (5 мин, 6 ALTER COLUMN). Чистое решение.
- **B.** In-memory LRU-кэш (`functools.lru_cache(maxsize=128)` или dict с TTL) — без БД. Проще, но без аудита.

→ **Рекомендация:** сделать **A** — это 5-минутная миграция, и она нужна также для будущего CRAG (`retrieval_iterations`) и context_pack-телеметрии. Не плодим новые сущности — переиспользуем `rag_logs`.

### 2.3 `usage_stats` — таблицы нет

```sql
CREATE TABLE usage_stats (symbol_id, calls_total, last_called, avg/p50/p99_latency_ms, error_rate, ...)
```

Нужна для C10 telemetry-driven boost. **Не блокер для hybrid_upgrade/eval_extension** — это отдельный таск (TASK_RAG_telemetry, ждёт `TestRunner::OnTestComplete`).

---

## 3. Текущий retrieval pipeline

В проекте **два** retrieval-пайплайна — это критично понимать:

### 3.1 `dsp_assistant/retrieval/pipeline.py` — **legacy для symbols**

- Работает с pgvector таблицей `symbols` (C++ FQN).
- Поддерживает `dense_only` / `sparse_only` / hybrid (RRF).
- Sparse уже реализован — через `symbols.search_tsv` (Finding #2 закрыт).
- Использует `vector_store.make_vector_store(cfg, db)`.

### 3.2 `dsp_assistant/retrieval/rag_hybrid.py` — **RAG-коллекция (Qdrant + RAG-таблицы)**

- 340 строк, класс `HybridRetriever`.
- Pipeline: **dense (Qdrant `dsp_gpu_rag_v1`) → PG content load → cross-encoder rerank → top-K**.
- **Sparse stage НЕ РЕАЛИЗОВАН** — это и есть C3.
- Колонки tsvector в RAG-таблицах есть (M2 применён) → подключение в hybrid должно быть «дёшево».
- DEFAULT_CANDIDATES = 200 (после Finding #3, см. `_eval_rerank_2026-05-06.md`).
- target_tables: `doc_blocks` / `use_cases` / `pipelines`.

### 3.3 `dsp_assistant/retrieval/reranker.py` — общий

- BAAI/bge-reranker-v2-m3 (cross-encoder).
- Используется обоими pipeline'ами.
- 138 строк, готов.

---

## 4. Текущий eval-harness

### 4.1 `dsp_assistant/eval/runner.py` (171 строка)

```python
from dsp_assistant.retrieval.pipeline import query as run_query  # ← !
```

→ Eval-runner вызывает **pipeline.query** (legacy на `symbols`). **НЕ rag_hybrid.HybridRetriever**.

→ Метрики golden-set v1 меряются на pgvector `symbols`, не на RAG-коллекции.

→ **Это архитектурный нюанс для E1-E3:**
- Если расширять текущий runner — придётся либо добавлять режим `--retriever rag_hybrid`, либо создавать второй runner для RAG-коллекции.
- TASK_RAG_eval_extension §E1 говорит про `runner.py` без уточнения какой retrieval — **сестрёнке надо это решение принять явно** (А: расширить существующий с флагом / Б: новый runner) и согласовать с Alex.

**Конфигурация** (EvalConfig):
- `mode: hybrid|dense|sparse` (внутри pipeline.py)
- `use_rerank: bool`
- `candidates: 50` (default; в rag_hybrid — 200!)
- `top_k: 10`

### 4.2 `dsp_assistant/eval/golden_set.py` (48 строк)

- `GoldenItem`: id, query, expected_fqn[], expected_kind[], expected_repo, **category** (`exact_name`/`semantic_ru`/`semantic_en`), lang.
- Поле `intent` **отсутствует** — добавляется в E1.
- Источник: `MemoryBank/specs/LLM_and_RAG/golden_set/qa_v1.jsonl` (50 строк).

### 4.3 `dsp_assistant/eval/retrieval_metrics.py` (72 строки)

- `recall_at_k`, `reciprocal_rank`, `aggregate(per_item) → AggregateMetrics` (recall_1/5/10, mrr_10).
- Сравнение по `expected_fqn` ⊆ `top_fqns`.

→ **Для RAG-коллекции** метрика на FQN не работает напрямую — там target_id это `block_id` / `use_case_id` / `pipeline_id`. Нужен либо мэппинг, либо метрика на target_id'ах.

---

## 5. Baseline метрики (для дельты после hybrid_upgrade)

Источник: `MemoryBank/specs/LLM_and_RAG/_eval_rerank_2026-05-06.md` (10 probe'ов, не golden-set v1).

| Конфигурация | candidates | typed | recall@5 dense | recall@5 rerank | MRR@10 rerank |
|---|---:|:---:|---:|---:|---:|
| Baseline 06.05 | 50 | ✗ | 0.20 | 0.30 | 0.243 |
| Re-embed + cand=200 | 200 | ✗ | 0.30 | 0.30 | 0.233 |
| **Re-embed + typed** | **200** | **✓** | **0.50** | **0.60** | **0.333** |

**FFT use-case остаётся проблемой:** 1/5 формулировок в top-5 даже после Finding #2/#3. Это и закрывается **C3 sparse BM25** (по применённой миграции готов) + **C4 HyDE**.

**Ожидаемый прирост от трека hybrid_upgrade** (по TASK):
- C3 sparse: R@5 ≥ 0.78 на golden v1 `category=semantic_*`
- C4 HyDE: +5-15% R@5 на `semantic_ru/en`

→ **Замер на golden v1** (50 запросов) — это первое что сестрёнка должна сделать **до** правок (получить точный baseline).

---

## 6. 3 ключевых риска для трека

### Риск 1: расхождение `search_tsv` vs дизайн `search_vector`+setweight

TASK_RAG_hybrid_upgrade §C3 SQL-helper использует имя `search_tsv` — совпадает с применённой схемой. **Не блокер**, но качество без setweight ниже. Если будут отставать FFT-формулировки — следующий шаг доп. миграция со setweight (без drop колонки, через UPDATE на trigger).

### Риск 2: `rag_logs.hyde_*` отсутствует

Решение **до старта C4** (см. §2.2). Рекомендация: сделать `2026-05-09_rag_logs_hyde.sql` (5 мин), кэш TTL 5 мин.

### Риск 3: eval-runner на `symbols`, не на RAG-таблицах

→ Замер C3/C4 (которые модифицируют `rag_hybrid.HybridRetriever`) на текущем runner'е **не покажет дельту** — он крутится в другом pipeline'е.

**Что сделать (один из вариантов):**
- **A.** В `runner.py` добавить флаг `--retriever {pipeline,rag_hybrid}` (default `pipeline` для обратной совместимости). **Рекомендуется.**
- **B.** Создать `eval/rag_runner.py` параллельно. Дублирование кода.

В TASK_RAG_eval_extension это **не оговорено** — сестрёнка должна решить и согласовать с Alex до E1.

---

## 7. Что нужно сделать **до** старта трека (5-15 мин)

| # | Действие | Effort | Когда |
|---|---|---|---|
| 1 | Прочитать `prompts/handoff_RAG_hybrid_eval_2026-05-08.md` | 5 мин | первым |
| 2 | Прочитать этот файл | 5 мин | вторым |
| 3 | Прочитать TASK_RAG_hybrid_upgrade + TASK_RAG_eval_extension | 5 мин | третьим |
| 4 | **Спросить Alex:** rag_logs.hyde_* — миграция (А) или in-memory кэш (Б)? | 1 мин | 4-м |
| 5 | **Спросить Alex:** eval-runner — флаг `--retriever rag_hybrid` (А) или отдельный runner (Б)? | 1 мин | 5-м |
| 6 | Замер baseline на golden v1 для **обоих** retrieval'ов (`pipeline` и `rag_hybrid`) | 10 мин | 6-м |
| 7 | Старт C3 (sparse BM25 в `rag_hybrid.py`) | — | дальше |

---

## 8. Параллельные ветки сестёр (не блокируют трек hybrid_eval)

| Сестра | Трек | Зависимость от тебя |
|--|--|--|
| #2 | MCP atomic tools + graph_extension + context_pack | Не блокирует, но C7 context_pack может потреблять твой sparse-результат |
| #3 | code_embeddings + late_chunking | Параллельно, без пересечений |
| #1 (CTX0/1/2) | test_params_fill + doxygen_test_parser | **БЛОКИРУЕТ** твой E1 partially (если intent=`test_gen` запросы должны проверять test_params) — не критично, можно временно использовать пустые intent'ы |

---

## 9. Артефакты для сдачи

После трека (~8ч) сестрёнка кладёт:

| Артефакт | Путь |
|---|---|
| Расширение rag_hybrid | `C:\finetune-env\dsp_assistant\retrieval\rag_hybrid.py` (sparse-stage + RRF) |
| HyDE генератор | `C:\finetune-env\dsp_assistant\retrieval\hyde.py` (новый) |
| HyDE prompt | `MemoryBank/specs/LLM_and_RAG/prompts/014_hyde_dsp.md` (новый) |
| Eval отчёт hybrid | `MemoryBank/specs/LLM_and_RAG/_eval_hybrid_upgrade_2026-05-XX.md` |
| Golden v2 | `MemoryBank/specs/LLM_and_RAG/golden_set/qa_v2.jsonl` (100 строк, intent) |
| RAGAs метрики | `C:\finetune-env\dsp_assistant\eval\ragas_metrics.py` (новый) |
| CI workflow | `.github/workflows/rag_eval.yml` (новый, в репо `workspace`) |
| Pre-commit hook | `MemoryBank/hooks/pre-commit` (расширение для `_RAG.md` старения) |
| Доп. миграция (если выбран вариант А) | `C:\finetune-env\dsp_assistant\migrations\2026-05-09_rag_logs_hyde.sql` |

---

## 10. Ссылки

- Координатор: `MemoryBank/tasks/TASK_RAG_context_fuel_2026-05-08.md`
- TASK A (hybrid): `MemoryBank/tasks/TASK_RAG_hybrid_upgrade_2026-05-08.md`
- TASK B (eval): `MemoryBank/tasks/TASK_RAG_eval_extension_2026-05-08.md`
- Strategic brief: `MemoryBank/specs/LLM_and_RAG/RAG_deep_analysis_2026-05-08.md` v1.2
- KFP design: `MemoryBank/specs/LLM_and_RAG/RAG_kfp_design_2026-05-08.md`
- Baseline отчёт rerank: `MemoryBank/specs/LLM_and_RAG/_eval_rerank_2026-05-06.md`
- Расширенный design SQL (НЕ применён): `MemoryBank/specs/LLM_and_RAG/configs/postgres_migration_2026-05-08.sql`
- Применённые миграции: `C:\finetune-env\dsp_assistant\migrations\2026-05-08_*.sql` (2 файла)
- Промпт-handoff: `MemoryBank/prompts/handoff_RAG_hybrid_eval_2026-05-08.md`

---

*Maintained by: Кодо · 2026-05-08 вечер · перед запуском трека hybrid_upgrade + eval_extension*
