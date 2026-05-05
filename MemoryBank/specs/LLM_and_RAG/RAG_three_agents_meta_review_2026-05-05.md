# Meta-Review — RAG план + 12 тасков + ревью v2

> **Дата**: 2026-05-05 · **Автор**: Кодо
> **Объект**: cross-check `RAG_three_agents_review_2026-05-05.md` (v2) ↔ `RAG_three_agents_plan_2026-05-05.md` (v1) ↔ `TASK_RAG_01..12_2026-05-05.md`
> **Цель**: найти несоответствия и блокеры **до** старта TASK_RAG_01.

---

## 🔴 ГЛАВНОЕ — план и таски НЕ синхронизированы с ревью v2

Ревью v2 принимает **8 решений** Alex'а + **архитектурное решение Variant C**. План и таски остались в v1 — ссылаются на старую архитектуру (pgvector в новых таблицах). **Старт по текущим документам сделает дубль**: pgvector + Qdrant одновременно.

| # | Решение ревью v2 | Состояние плана/таска |
|---|---|---|
| **A** | Variant C: Qdrant `dsp_gpu_rag_v1`, в PG **БЕЗ** колонки `embedding` | План §5.2 строки 184/219/249 — `embedding vector(1024)` **присутствует**. HNSW индекс §5.2:191-193 — **остался**. |
| **B** | TASK_06: убрать «delta <10%», заменить на чек-лист структуры | TASK_RAG_06 строка 26: **«Delta с _old.md < 10%»** не убрано. План §13 DoD Pilot строка 575 — то же. |
| **C** | TASK_05: убрать «тесты ≥80%» (тесты «по мере роста») | TASK_RAG_05 DoD строка 30: «**покрытие unit-тестами ≥80%**» не убрано. |
| **D** | TASK_06: class-card пишет в `test_params` + `doc_blocks`, **не** в `use_cases` | TASK_RAG_06 DoD строка 25: «`use_cases` или `test_params` (что использовали — решим в ходе)» — **открыт**. |
| **E** | TASK_01: один коммит в DSP-GPU/MemoryBank, правки в `C:/finetune-env/` Alex держит в голове | TASK_RAG_01 строки 17-18: файлы #5/#6 в `C:/finetune-env/` идут в общий список без пометки «не коммитим». |
| **F** | TASK_01: `ALTER DATABASE`/`ALTER SCHEMA RENAME` (БД уже есть) + pre-step `pg_dump` | TASK_RAG_01 шаги 1-4: только sed-замена в файлах, **нет** ALTER, **нет** pg_dump. §«Откат» противоречит: «БД ещё не создана». |
| **G** | TASK_03: выбрать `markdown-it-py` | TASK_RAG_03 строка 33: «**markdown-it-py** или **mistune**» — выбор не зафиксирован. |
| **H** | План §5.1 stage 1_home (Win, pgvector) — «не рассматриваем» | Не помечено. План §5.1 не правлен. |
| **I** | Правило enum/bool/json → не получают `error_values` | План §2 пункты 1-3 это содержат ✅. Но это правило **не зафиксировано** в `12_DoxyTags_Agent_Spec.md` и `prompts/009_test_params_extract.md` (как требует ревью). |

**Статус**: блокер для TASK_RAG_01. Сначала надо применить правки в план и таски, потом стартовать.

---

## 🟠 Несостыковки DoD (устаревшие проверки)

| Таск | Строка | Проблема |
|---|---|---|
| TASK_RAG_02 DoD | 47 | «HNSW vector index создан (`\di rag_dsp.idx_doc_blocks_embedding`)» — по ревью v2 этого индекса **не должно быть**. |
| TASK_RAG_02 артефакты | — | Нет шага «создать Qdrant коллекцию `dsp_gpu_rag_v1`». В ревью v2 это **новый** обязательный шаг. |
| TASK_RAG_02 откат | 52-57 | DROP только PG-таблиц. Нет `qdrant.delete_collection("dsp_gpu_rag_v1")`. |
| TASK_RAG_03 DoD | — | Нет проверки upload в Qdrant (`register_block` должен PG-INSERT + BGE-M3 + Qdrant.upsert). Без этого `--re-embed` бессмыслен. |
| TASK_RAG_03 артефакты | — | Нет `RagQdrantStore` / `VectorPoint` (новые артефакты по ревью v2). |
| TASK_RAG_04 DoD | 22 | `SELECT count(*) FROM rag_dsp.doc_blocks WHERE embedding IS NOT NULL` — **колонки нет**. Должно быть `qdrant.count("dsp_gpu_rag_v1", filter={"target_table":"doc_blocks","repo":"spectrum"})`. |
| TASK_RAG_06 DoD | 25 | См. **D** выше — открыт вопрос `use_cases` vs `test_params`. |
| TASK_RAG_07 DoD | — | Нет проверки embedding в Qdrant для use_case'ов. |
| TASK_RAG_08 DoD | 31 | `SELECT count(*) FROM rag_dsp.use_cases WHERE embedding IS NOT NULL` — устарело, см. выше. |
| TASK_RAG_11 строка 19 | 19 | DSP-репо «опц.» — но §17.1 плана задаёт **открытый вопрос** Alex'у, ответ не дан. Время «1 ч» оценить нельзя. |
| TASK_RAG_12 | 11 | Baseline R@5=0.88 берётся из плана §16. Стоит замерять **до** ingestion'а отдельным шагом, чтобы доказать прирост. |

---

## 🟡 Внутренние баги плана (мелкие, но реальные)

1. **§4 пример опечатки** — `core__zcopy__welford_init__v1` неверный: `welford` живёт в `stats` (правило 10). `zcopy` тоже не относится к классам `core`. Поправить на `stats__welford_accumulator__init__v1`.

2. **§5.2 `ai_stubs.placeholder_tag`** — `TEXT NOT NULL` **без** `UNIQUE`. Но раз тег используется как ID в .md (Q42) — должен быть `UNIQUE`. Сейчас при повторе агента возможны дубли `Q42`.

3. **§5.2 формат placeholder_tag** — `TODO_ai_stub_2026-05-05_Q42` — формат неоднозначен. `Q42` глобальный или per-day? Лучше явно: `Q-{ai_stubs.id}` (монотонный, глобальный, FK на serial PK).

4. **§5.4 deprecated_by self-FK** — `doc_blocks.deprecated_by REFERENCES doc_blocks(block_id)` — циклический FK, требует `DEFERRABLE INITIALLY DEFERRED` если будут массовые INSERT'ы пакетом. Зафиксировать в DDL или отметить как future-work.

5. **§6 whitelist concept'ов** — нет fallback'а. Если h2-заголовок не из whitelist (`LLM Pipeline Architecture`, `Memory Layout`...) — что? Нужен fallback `concept = slugify(title)` + флаг `is_whitelisted=false` для ревью.

6. **§8 Re-run safety** — LLM-генерация **не идемпотентна**. Если `human_verified=false` и source изменился — `regenerate()` создаст **другой** текст для того же `block_id`. Нужен `seed` для Qwen или фиксация `ai_summary_text` в `doc_blocks.content_md` с `ai_model_seed`.

7. **§10 use-case body** — источник «копия из `examples/cpp/<related>.cpp`». Но папка `examples/cpp/` нигде в правиле 10 не описана. Уточнить путь (`<repo>/examples/cpp/`?) либо удалить как источник.

8. **§16 сроки** — план = 29 ч, сумма по таскам 1+1.5+3+1+4+1.5+3.5+2+4+2+14+1 = **38.5 ч**. Расхождение 9.5 ч. Решение Alex'а #7 в ревью: «не критично, не правим» — оставить, но убрать из метрик готовности.

9. **§17.1 DSP** — открытый вопрос «делаем Python use-cases для DSP, или пропускаем?» **остался без ответа** в ревью v2. Кодо рекомендовала Б («пропустить, упоминать Python в C++ карточке»), Alex не подтвердил. Решение нужно **до** TASK_RAG_11.

---

## 🟢 Что хорошо (не трогать)

1. **Pilot-first** — spectrum (TASK_04..08) → strategies (TASK_09..10) → раскатка (TASK_11). Низкий риск.
2. **Re-use существующих модулей** — `agent_doxytags/extractor|walker|heuristics`, `db/`, `llm/`, `index_class.py`. Соответствует правилу 01 «не плодить сущности».
3. **Re-run safety** (план §8) — три состояния (skip/warn/regenerate), `human_verified` не перезаписывается. Логично.
4. **AI-stub workflow** (план §7) — placeholder Q-тег + audit trail в `ai_stubs`. Корректно.
5. **Минимизация LLM** — только synonyms/related/short stubs. Низкие LLM-затраты, высокая воспроизводимость.
6. **Block ID schema** (§4) — semantic, version-aware, sub-index для длинных блоков. Стабильно для `target_id` в Qdrant.
7. **Variant C по 3 критериям** — главный аргумент «новые `target_table` без DDL» **корректный**. `linalg::CovarianceMatrixOp` действительно существует (`linalg/include/linalg/operations/covariance_matrix_op.hpp` ✅).
8. **Pre-flight в ревью** — psql + Qdrant ping + pg_dump + Qdrant snapshot. Безопасный старт.

---

## 🛠️ Уточнения по архитектуре Variant C

### `VectorPoint.point_id` — UUID или string?

В ревью v2 §«Унифицированный интерфейс» строка 100: `point_id: str — стабильный — '{target_table}:{target_id}'`. Но §«Решение — Вариант C» строка 84: `id=stable_uuid_from(target_table, target_id)`. **Конфликт**.

Qdrant поддерживает оба: `unsigned int` или `string-uuid`. Рекомендация:

```python
import uuid
NS_RAG = uuid.UUID('5a3e1d2b-9c8f-4a6e-b1d0-7e5f3c2a9d8b')  # один namespace для всего проекта
def make_point_id(target_table: str, target_id: str) -> str:
    return str(uuid.uuid5(NS_RAG, f"{target_table}:{target_id}"))
```

Зафиксировать в TASK_RAG_03.

### Hybrid retrieval (план не описывает веса)

Ревью §«Hybrid retrieval» — 2 запроса в Qdrant параллельно (code_v1 + rag_v1, top_k=20 каждый), потом reranker top_k=5. Но веса для merge не описаны: code_hits и rag_hits сравнимы по cosine score, или нужна нормализация? **Сейчас вопрос отложен** — TASK_RAG_12 это покажет на R@5. Но в плане §3 архитектура надо явно сказать «веса = равные, итоговый ранг — reranker'ом».

---

## ✅ Рекомендуемый порядок действий (до старта TASK_RAG_01)

### Phase A — Sync документов с ревью v2 (~1 ч)

1. **План §5.2** — убрать `embedding vector(1024)` из 3 таблиц + `idx_doc_blocks_embedding` HNSW. Добавить `UNIQUE` к `ai_stubs.placeholder_tag`.
2. **План §5.2** — добавить подсекцию «Vector storage — Qdrant collection `dsp_gpu_rag_v1`» (schema + payload).
3. **План §5.1** — пометить stage 1_home «не рассматриваем».
4. **План §3** — обновить архитектуру (PG metadata + Qdrant 2 коллекции + hybrid retrieval).
5. **План §13 Pre-flight** — добавить `psql` + `qdrant ping` + `pg_dump` + `qdrant snapshot`.
6. **План §4** — фикс опечатки `core__zcopy__welford_init` → `stats__welford_accumulator__init`.
7. **План §17.1** — попросить Alex решить про DSP (один вопрос A/B).

### Phase B — Sync тасков (~30 мин)

8. **TASK_RAG_01** — переписать на ALTER DATABASE/SCHEMA. Pre-step `pg_dump`. Пометить файлы `C:/finetune-env/*` как «правим, не коммитим». Откат: ALTER обратно.
9. **TASK_RAG_02** — убрать `embedding`/HNSW из DDL (DoD строка 47). **Добавить** шаг «create Qdrant collection `dsp_gpu_rag_v1` + payload-индексы». Откат: + `qdrant.delete_collection`.
10. **TASK_RAG_03** — выбрать `markdown-it-py`. Добавить артефакт `RagQdrantStore` + `VectorPoint` (с UUID v5). Расширить DoD: после INSERT в `doc_blocks` идёт BGE-M3 + Qdrant upsert.
11. **TASK_RAG_04** DoD — заменить `WHERE embedding IS NOT NULL` на `qdrant.count("dsp_gpu_rag_v1", filter=...)`.
12. **TASK_RAG_05** — убрать «≥80% покрытие unit-тестами», заменить на «smoke-тест на 1 классе».
13. **TASK_RAG_06** DoD — убрать «delta <10%». Зафиксировать чек-лист: frontmatter / все методы / все @test теги перенесены / визуальное ревью Alex'а. Зафиксировать «class-card пишет в `test_params` + `doc_blocks`, **не** в `use_cases`».
14. **TASK_RAG_07** DoD — добавить проверку embedding в Qdrant.
15. **TASK_RAG_08** DoD — заменить SQL-запрос на Qdrant count.
16. **TASK_RAG_11** — пометить DSP «ждём решения §17.1».
17. **TASK_RAG_12** — добавить Step 0 «замер baseline до ingestion» отдельной строкой.

### Phase C — Зафиксировать правила в spec'ах (~15 мин)

18. **`12_DoxyTags_Agent_Spec.md`** — добавить раздел «Эвристики error_values: enum/bool/json-path → пропускать».
19. **`prompts/009_test_params_extract.md`** — отразить то же правило в инструкциях LLM.

### Phase D — Старт TASK_RAG_01 (1 ч)

После A+B+C — старт. Pre-flight (psql ping + pg_dump + Qdrant ping) → ALTER → commit (один) → push (по OK).

---

## Открытые вопросы Alex'у (нужны ответы до Phase A)

| # | Вопрос | Варианты |
|---|---|---|
| 1 | DSP мета-репо: делаем Python-use-cases или пропускаем? | A) Пропускаем (Кодо рекомендовала). B) Делаем 8 use_cases. |
| 2 | Формат placeholder_tag для `ai_stubs` | A) `Q-{N}` где N=ai_stubs.id (монотонный). B) `TODO_ai_stub_YYYY-MM-DD_QN` (per-day, конфликты возможны). |
| 3 | LLM seed для воспроизводимости | A) Фиксируем seed для Qwen и сохраняем в `ai_stubs.suggested_text` целиком. B) Не паримся — LLM-выход меняется, человек правит. |
| 4 | Hybrid retrieval веса (code_v1 vs rag_v1) | A) Равные веса, reranker решает. B) Биас на rag_v1 (×1.2), reranker. C) Замерить TASK_12 и решить. |
| 5 | `examples/cpp/` как источник use-case body — есть такая папка в репо? | A) Есть — путь `<repo>/examples/cpp/`. B) Нет — удалить из плана §10. |

---

## TL;DR

- **Главное**: план и таски не синхронизированы с ревью v2 (Variant C). Стартовать сейчас = создать дубль pgvector+Qdrant.
- **Действие**: Phase A (правка плана) + Phase B (правка 12 тасков) + Phase C (правила) — суммарно ~2 ч. Потом TASK_RAG_01.
- **Открытых вопросов 5** (DSP, placeholder_tag, LLM seed, retrieval веса, examples/cpp). Желательно решить до Phase A.
- **Хорошие части** трогать не надо — pilot-first, re-use, re-run safety, AI-stub workflow, Block ID schema. Архитектура Variant C обоснована.

---

*Meta-review v3 — Кодо. Cross-check выполнен по 17 документам. Готова к Phase A после ответов Alex'а.*

---

# 🔬 Глубокий аудит ревью v2 (2026-05-05, по запросу Alex'а)

> Цель: проверить корректность самого `RAG_three_agents_review_2026-05-05.md` ДО того как по нему править план и 12 тасков.

## Метод проверки

Cross-check утверждений ревью v2 с реальным кодом в `C:/finetune-env/dsp_assistant/`:

| Утверждение ревью | Реальность | Вердикт |
|---|---|---|
| `retrieval/embedder.py` — BGE-M3, 1024-dim, fp16 | `embedder.py:40-42` `DEFAULT_MODEL="BAAI/bge-m3"`, `DEFAULT_DIM=1024` | ✅ |
| `retrieval/vector_store.py` имеет `VectorStore` ABC + `QdrantStore` (заготовка с NotImplementedError Phase 2.5) | `vector_store.py:190-205` точно так | ✅ |
| `agent_doxytags/*` (extractor/walker/heuristics/patcher) | Существует `analyzer.py, extractor.py, git_check.py, heuristics.py, patcher.py, walker.py` | ✅ |
| `eval/` (golden_set, runner, retrieval_metrics) | Существует `golden_set.py, runner.py, retrieval_metrics.py` | ✅ |
| Существующая Qdrant коллекция `dsp_gpu_code_v1` | В `stack.json:80` `collection_name: "dsp_gpu_code_v1"` | ✅ |
| `retrieval/` (embedder, vector_store, reranker, pipeline) | Существует `embedder.py, pipeline.py, reranker.py, text_builder.py, vector_store.py` | ✅ |

Подтверждённая база — корректна. Теперь блокеры.

---

## 🔴 БЛОКЕР #1 — `VectorStore` ABC ломается

### Что в ревью v2

Строки 96-107 предлагают:
```python
class VectorStore(ABC):
    def upsert(self, points: list[VectorPoint], collection: str) -> int: ...
    def search(self, query_vec, top_k, collection, filters: dict | None = None) -> list[Hit]: ...
```

### Что в реальности (`vector_store.py:37-61`)

```python
class VectorStore(ABC):
    @abstractmethod
    def upsert(self, symbol_ids: list[int], vectors: np.ndarray, collection: str = "public_api") -> int: ...
    @abstractmethod
    def search(self, query_vec, top_k=5, collection="public_api", filters=None) -> list[HitDense]: ...
    @abstractmethod
    def count(self, collection: str = "public_api") -> int: ...
```

### Конфликт

- **Сигнатура несовместима**: `symbol_ids: list[int] + vectors: np.ndarray` → `points: list[VectorPoint]`.
- **`PgvectorStore` (строки 67-184) уже работает** с этим контрактом, его ломать нельзя — это рабочий код для symbols.
- Существующий `QdrantStore` (190-205) — заглушка под **тот же контракт** (для миграции symbols → Qdrant в Phase 2.5).

### Корректное решение

`RagQdrantStore` — **отдельный класс**, рядом, **не наследуется** от `VectorStore`:

```python
# retrieval/rag_vector_store.py (НОВЫЙ файл)
@dataclass
class VectorPoint:
    target_table: str    # 'doc_blocks' | 'use_cases' | 'pipelines'
    target_id:    str    # block_id или use_case.id
    repo:         str
    vector:       np.ndarray

@dataclass
class RagHit:
    target_table: str
    target_id:    str
    score:        float
    payload:      dict

class RagQdrantStore:
    """Отдельное хранилище для RAG карточек. БЕЗ наследования от VectorStore."""
    def __init__(self, endpoint: str, collection: str = "dsp_gpu_rag_v1"): ...
    def upsert(self, points: list[VectorPoint]) -> int: ...
    def search(self, query_vec, top_k=20, filters: dict | None = None) -> list[RagHit]: ...
    def delete(self, target_table: str, target_id: str) -> int: ...
```

Существующий `VectorStore` ABC + `PgvectorStore` + `QdrantStore` — **не трогать**. Они для symbols, у них своя жизнь.

---

## 🔴 БЛОКЕР #2 — Hybrid retrieval без resolver'а

### Что в ревью v2 (строки 121-134)

```python
code_hits = qdrant_store.search(qv, top_k=20, collection="dsp_gpu_code_v1")
rag_hits  = qdrant_store.search(qv, top_k=20, collection="dsp_gpu_rag_v1", filters={...})
all_hits = code_hits + rag_hits
return reranker.rerank(query, all_hits, top_k=top_k)
```

### Проблема

Reranker (BGE-reranker-v2-m3) принимает на вход **пары `(query, text)`**. Qdrant возвращает point_id + payload **без `text`** (в payload только metadata: `target_table`, `target_id`, `repo`, `symbol_id`).

Чтобы дать тексты в reranker, нужен **resolver** — SQL lookup в PG:
- `code_hits.payload.symbol_id` → `SELECT doxy_brief, fqn, name FROM symbols WHERE id=ANY(...)`
- `rag_hits.payload.target_id` → `SELECT content_md FROM doc_blocks/use_cases/pipelines WHERE block_id=ANY(...)` (или 3 SELECT'а по target_table)

### Корректное решение

Добавить в ревью §«Hybrid retrieval» шаг resolver'а:

```python
def hybrid_search(query: str, top_k: int = 5):
    qv = embedder.encode_query(query)
    code_hits = qdrant_code.search(qv, top_k=20, collection="dsp_gpu_code_v1")
    rag_hits  = qdrant_rag.search(qv, top_k=20, filters={"target_table": [...]})

    # NEW: resolver — текст из PG для reranker'а
    code_texts = pg_resolver.fetch_symbol_texts([h.payload["symbol_id"] for h in code_hits])
    rag_texts  = pg_resolver.fetch_rag_texts([(h.target_table, h.target_id) for h in rag_hits])

    pairs = [(query, t) for t in (code_texts + rag_texts)]
    scores = reranker.rerank_pairs(pairs)
    return top_k_by_score(zip(code_hits + rag_hits, scores), k=top_k)
```

Это не отменяет Variant C — это **уточнение** того что между Qdrant.search и reranker'ом сидит PG.

---

## 🔴 БЛОКЕР #3 — §«Что править в плане и тасках» неполный

Ревью v2 строки 162-180 перечисляют правки. Проверила сверкой со §«Решения Alex'а» (строки 28-39) и реальными DoD тасков. **Пропущенные пункты**:

| Решение Alex'а | Где должно быть зафиксировано в правках | Пропущено? |
|---|---|---|
| #4 «Тесты ≥80% убрать» | TASK_RAG_05 DoD строка 30 | **Да** — в §«Что править» строка 177 для TASK_05 написано только «Pre-req + запись + тесты по мере роста + re-use». Нет явного «УБРАТЬ строку DoD ≥80%». |
| #4 → распространяется на 07/09 | TASK_RAG_07 / TASK_RAG_09 — там тоже могут быть похожие DoD-пункты | Не упомянуто как глобальная правка |
| #1 «class-card в test_params + doc_blocks, не в use_cases» | TASK_RAG_06 DoD строка 25 «`use_cases` или `test_params` (что использовали — решим в ходе)» | Не упомянуто в §«Что править» |
| Variant C → DoD устарели | TASK_RAG_04 DoD строка 22 (`WHERE embedding IS NOT NULL`), TASK_RAG_08 DoD строка 31 — оба ссылаются на колонку которой не будет | Пропущено — не отмечено что **DoD проверки** надо переписать на `qdrant.count(...)` |
| §17.1 DSP открытый вопрос | TASK_RAG_11 включает DSP «опц.» | Решение Alex'а на §17.1 в ревью v2 НЕ дано — не отмечено как «нужен ответ» |
| TASK_RAG_12 baseline | Замер R@5 ДО ingestion'а отдельным шагом | Не упомянуто |
| Phase 0 пункт #2 (pointer) | Alex одобрил «ДА» применить `[nullptr, 0xDEADBEEF]` в spectrum_processor_factory.hpp:57 — этот точечный коммит | В ревью §«Phase 0 audit» — только «правило enum/bool/json пропускать»; **отдельная правка #2 не выделена** |

### Корректное решение

Расширить §«Что править в плане и тасках» в ревью v2 ещё 7 строками. **Без этого** правка плана/тасков по неполному списку оставит пробелы.

---

## 🟡 Уточнения (не блокеры, но нужны)

### №4 — Pre-flight на Win-клиенте

Ревью §«Pre-flight» строки 192-209 использует `psql -h <ubuntu-host>`, `pg_dump`. На Win-клиенте `psql.exe` нет (план §17.5 это сам подтверждает: «`psql.exe` клиента в Win нет — подключусь через `psycopg2`»).

**Корректный pre-flight**:
- Подключение к PG — через Python `psycopg2` (используем существующий `db.client.DbClient`).
- Бэкап PG (`pg_dump`) — **запустить на Ubuntu через SSH**, не локально.
- Qdrant — через Python `requests` или `qdrant_client.QdrantClient`.

### №5 — TASK_RAG_02 DoD про `vector` extension

Ревью v2 строка 175: «DoD: `\dx` показывает `vector` extension (для существующей `embeddings` symbols-таблицы)».

**Проблема**: на stage 2_work_local `stack.json:92` явно говорит `extensions: ["pg_trgm", "btree_gin"]` **без** `vector` (vectors в Qdrant). На stage 1_home extension есть, но 1_home «не рассматриваем».

**Корректно**: убрать `vector` из DoD TASK_RAG_02. На целевой stage он не нужен ни для symbols (Qdrant), ни для RAG (Qdrant).

### №6 — `point_id` формат

Ревью §«Унифицированный интерфейс» строка 100: `point_id: str — стабильный — '{target_table}:{target_id}'`.
Ревью §«Решение» строка 84: `id=stable_uuid_from(target_table, target_id)`.

**Конфликт**. Корректно — UUID v5 с фиксированным namespace:

```python
NS_RAG = uuid.UUID('5a3e1d2b-9c8f-4a6e-b1d0-7e5f3c2a9d8b')
def make_point_id(target_table: str, target_id: str) -> str:
    return str(uuid.uuid5(NS_RAG, f"{target_table}:{target_id}"))
```

Зафиксировать в ревью §«Решение».

### №7 — Cleanup orphan'ов: триггер не описан

Ревью строка 115: «Cleanup orphan'ов через `qdrant.delete(filter={target_table, target_id})` — нативно».

**Не описано**: кто триггерит. Нужно `rag_writer.deregister_block(old_block_id)` который вызывается:
- При переименовании block_id (новая версия `__v2`).
- При удалении Doc-секции (source_hash изменился, блок ушёл).
- При смене `deprecated_by` chain.

Добавить в ревью одну строку: «`rag_writer.deregister_block(target_table, old_target_id)` — вызывается при смене ID или удалении».

### №8 — Phase 0: применение правки #2 не выделено

В Phase 0 audit Alex одобрил **только пункт #2** (pointer-параметр `backend` в `spectrum_processor_factory.hpp:57` → `[nullptr, 0xDEADBEEF]`). Остальные 14 — либо «не нужно» (bool), либо «удалить enum» (#1 → отдельный таск), либо без ответа (= не дозаполняем по правилу).

**Действие #2 — точечная правка через patcher** — должна быть отдельным коммитом ДО старта Phase 1. Ревью v2 это не выделило.

Добавить в §«Phase 0 audit»:
- Пункт #2 → точечный коммит: `spectrum/include/spectrum/factory/spectrum_processor_factory.hpp:57` → добавить `error_values=[nullptr, 0xDEADBEEF]` в существующий `@test {...}` блок. Один файл, одна строка.

### №9 — Stage'й семантика «дома Win-client + Ubuntu server»

Ревью строки 51-58 представляют 4 stage'а как «где запускается стек». `stack.json:1_home.runtime_dir = C:/finetune-env/.dsp_assistant` — **runtime на Win**.

Но Alex говорит «дома код пишется на Win, БД и Qdrant — на Ubuntu (через сеть/туннель)» — это **не stage 1_home**, это «client=Win → server=Ubuntu (одна из stage'й 2/3)».

**Корректно** в ревью: «Stage 1_home (Win runtime + pgvector) — исключён. Дома dev = Win-клиент → Ubuntu-сервер, который физически работает в режиме `2_work_local` (если Ubuntu — рабочая машина по локалке) либо `3_mini_server` (если отдельный сервер). Для целей RAG-агентов важен только runtime stage.»

### №10 — `target_id` формат разный per target_table

| target_table | target_id формат | Пример |
|---|---|---|
| `doc_blocks` | `{repo}__{class}__{concept}__v{N}` | `spectrum__fft_processor_rocm__pipeline_data_flow__v1` |
| `use_cases` | `{repo}::{slug}` | `spectrum::fft_batch_signal` |
| `pipelines` | `{repo}::{slug}` | `strategies::antenna_covariance` |

Это OK для UUID v5 (namespace одинаков, name строка разная) — но при cleanup'е надо знать какой формат. Зафиксировать таблицу в ревью §«Решение».

---

## 📊 Итог по ревью v2

| Часть ревью v2 | Корректность | Действие |
|---|---|---|
| §«Что подтверждено по факту» | ✅ Все 8 утверждений верны | — |
| §«Решения Alex'а» (7 пунктов) | ✅ Корректно интерпретированы | — |
| §«Vector Storage = Variant C» (концепция) | ✅ Архитектурно обосновано | — |
| §«Унифицированный интерфейс» (код) | 🔴 Ломает существующий ABC | **Блокер #1** |
| §«Hybrid retrieval» (код) | 🔴 Без resolver'а PG | **Блокер #2** |
| §«Что править в плане и тасках» | 🔴 Неполный список (≥7 пропусков) | **Блокер #3** |
| §«Phase 0 audit» закрытие | 🟡 Не выделена правка #2 | Уточнение #8 |
| §«Pre-flight» команды | 🟡 `psql.exe`/`pg_dump` не запустятся на Win | Уточнение #4 |
| §«Архитектурная схема» (диаграмма) | ✅ Корректна | — |
| §«Что хорошо» | ✅ Перечислено верно | — |
| TASK_RAG_02 DoD c `vector` extension | 🟡 Не нужен на stage 2 | Уточнение #5 |
| `point_id` UUID vs string | 🟡 Конфликт | Уточнение #6 |
| Cleanup orphan'ов | 🟡 Триггер не описан | Уточнение #7 |
| Stage'й семантика | 🟡 Path runtime vs dev | Уточнение #9 |
| `target_id` per target_table | 🟡 Не зафиксировано | Уточнение #10 |

---

## ✅ Что значит «принять ревью v2»

**Без правки** — нельзя. По текущему ревью:
- Сломаем рабочий `VectorStore` ABC (Блокер #1).
- Hybrid retrieval не запустится (Блокер #2).
- При правке плана/тасков пропустим 7 пунктов (Блокер #3).

**С правкой ревью v2** (3 блокера + 6 уточнений, ~30 мин):
1. Заменить §«Унифицированный интерфейс» на отдельный `RagQdrantStore` без наследования.
2. Дополнить §«Hybrid retrieval» шагом resolver'а (PG lookup).
3. Расширить §«Что править» 7 пунктами (TASK_04/05/06/07/08/09/11/12 + Phase 0 #2).
4. Pre-flight → Python-only.
5. TASK_02 DoD убрать `vector` extension.
6. Зафиксировать UUID v5 для `point_id`.
7. Описать `deregister_block`.
8. Phase 0: выделить правку #2 отдельным коммитом.
9. Stage'й семантика — добавить уточнение про dev/runtime split.
10. Зафиксировать таблицу `target_id` per `target_table`.

После этого ревью v2.1 — корректно, и по нему можно безопасно править план + 12 тасков.

---

## Рекомендация

Сначала — правка ревью v2 → v2.1 (~30 мин). Потом по v2.1 — Phase A/B/C из основного meta-review (~2 ч). Потом TASK_RAG_01.

Если Alex предпочитает **сразу править план/таски** без правки ревью — Кодо вычитает все 10 пунктов из этого аудита наравне с правками ревью v2 (один проход, тот же результат, ~2.5 ч). Но ревью v2 в файле останется с багами для истории.

**Кодо рекомендует**: сначала довести ревью v2 → v2.1, потом править план/таски. Один источник правды.

---

*Глубокий аудит ревью v2 — Кодо, 2026-05-05. Cross-check с реальным кодом в `C:/finetune-env/dsp_assistant/`. 3 блокера + 6 уточнений найдены. Готова применить правки в ревью по OK Alex'а.*
