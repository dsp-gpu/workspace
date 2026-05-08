# Ревью 3 промптов RAG context_fuel — 2026-05-08

> **Ревьюер:** Кодо (само-ревью после написания)
> **Объект:** `MemoryBank/prompts/rag_{graph_extension, mcp_atomic_tools, context_pack}_2026-05-08.md`
> **Метод:** sequential проверка промптов против реального кода `c:/finetune-env/dsp_assistant/`

---

## Вердикт: **PASS-WITH-FIXES**

3 промпта самодостаточны и покрывают DoD из исходных таcсков, но **5 технических неточностей**
обнаружены при сверке с реальным кодом. Все правки — точечные, не меняют структуру.

---

## 🔴 CRITICAL (исправить ДО передачи сестрёнке)

### C1. `db.fetch(...)` / `db.fetch_one(...)` / `await db.execute(...)` — **методов нет**

`DbClient` (c:/finetune-env/dsp_assistant/db/client.py:70-82) — **синхронный**:
```python
def execute(self, query, params=None) -> None
def fetchone(self, query, params=None) -> dict | None
def fetchall(self, query, params=None) -> list[dict]
```

**Где сломано:**
- `rag_mcp_atomic_tools_2026-05-08.md` § C5 — `db.fetch(...)` → должно быть `db.fetchall(...)`.
- `rag_mcp_atomic_tools_2026-05-08.md` § C6a/C6b — `db.fetch(...)` → `db.fetchall(...)`.
- `rag_context_pack_2026-05-08.md` § 3.3 — `await db.fetch_one(...)`, `await db.execute(...)` —
  **DbClient sync, нет async методов**.

**Правка для context_pack §3.3:**
```python
# Было async — становится sync, либо оборачиваем в asyncio.to_thread:
async def _cache_get(db, key: str) -> dict | None:
    row = await asyncio.to_thread(
        db.fetchone,
        "SELECT payload, expires_at FROM rag_dsp.context_cache WHERE cache_key = %s",
        [key],
    )
    if not row:
        return None
    if row["expires_at"] < datetime.utcnow():
        await asyncio.to_thread(
            db.execute,
            "DELETE FROM rag_dsp.context_cache WHERE cache_key = %s",
            [key],
        )
        return None
    return row["payload"]
```

### C2. `HybridRetriever` НЕ поддерживает `target_tables=["symbols", "test_params"]`

`retrieval/rag_hybrid.py:259-260` — поддерживает только `{doc_blocks, use_cases, pipelines}`.

**Где сломано:**
- `rag_graph_extension_2026-05-08.md` § G5 — `self._query_tables(query, ["symbols", "test_params"], ...)` —
  такого target нет в `RagQdrantStore`. `symbols` живут в **другом** vector store
  (`retrieval/pipeline.py` + `retrieval/vector_store.py`).

**Правка G5:** уточнить архитектуру:
```python
def query(self, query, *, level="both", target_tables=None, top_k=DEFAULT_TOP_K):
    if level == "high":
        return self._query_rag(query, ["pipelines", "use_cases"], top_k)
    if level == "low":
        # low-level требует pipeline.py (symbols) + test_params (НОВЫЙ target_table —
        # добавить регистрацию в RagQdrantStore + индексацию embedding_text из test_params)
        # На MVP: low = doc_blocks only, расширение test_params — в отдельном under-task
        return self._query_rag(query, ["doc_blocks"], top_k)
    # cascade
    high = self._query_rag(query, ["pipelines", "use_cases"], top_k=3)
    if not high or high[0].rerank_score < CASCADE_THRESHOLD:
        return self._query_rag(query, ["doc_blocks"], top_k)
    return high
```

**Альтернатива (более полная):** в G5 добавить мини-подэтап «индексация `test_params` в Qdrant как
отдельный target_table» — это ~30 мин работы (UPSERT в `RagQdrantStore` с `target_table='test_params'`,
embed `embedding_text` колонки). Если так — записать в DoD G5 явно.

### C3. `RagHit` vs `EnrichedHit`

В `rag_mcp_atomic_tools_2026-05-08.md` импорт `from ... import RagHit` — на самом деле
`HybridRetriever.query()` возвращает `list[EnrichedHit]` (rag_hybrid.py:282). У него поля:
`target_table, target_id, dense_score, rerank_score, payload, content_text, repo, title_or_concept`.

**Правка mcp_atomic_tools §C6a/C6b:**
```python
# Было: hits = retriever.query(...)
#        ... h.payload["use_case_id"] ...
# Должно быть:
hits = retriever.query(query, target_tables=["use_cases"], top_k=top_k)
ids = [h.target_id for h in hits]   # target_id, не payload["use_case_id"]
rows = db.fetchall("""
    SELECT id, title, body, synonyms_ru, synonyms_en, primary_class, repo
      FROM rag_dsp.use_cases
     WHERE id = ANY(%s)
""", [ids])
```

Для pipelines аналогично: `h.target_id` (не `payload["pipeline_id"]`).

---

## 🟡 WARNINGS (желательно исправить)

### W1. psycopg interval interpolation

`rag_context_pack_2026-05-08.md` § 3.3:
```sql
INSERT INTO rag_dsp.context_cache(...) VALUES (%s, %s, now() + interval '%s seconds')
```

`%s` внутри строкового литерала **не подставится** — psycopg интерполирует только за пределами кавычек.

**Правка:**
```sql
INSERT INTO rag_dsp.context_cache(cache_key, payload, expires_at)
VALUES (%s, %s::jsonb, now() + make_interval(secs => %s))
ON CONFLICT (cache_key) DO UPDATE
    SET payload = EXCLUDED.payload, expires_at = EXCLUDED.expires_at
```

### W2. `_query_tables` — приватный метод которого может не быть

В G5 я написал `self._query_tables(...)` — такого метода в `HybridRetriever` нет, есть только
публичный `.query(text, *, target_tables=...)`. Минор: переименовать в промпте `_query_rag` или
`self.query(...)`, не вводить новый приватник.

### W3. `dsp_search` в context_pack импортируется без указания

§ 3.1 `rag_context_pack`: я зову `await _run_async(dsp_search, query, top_k=1, retriever=retriever)`,
но в imports блока `dsp_search` отсутствует. **Правка:**
```python
from dsp_assistant.agent.tools import dsp_search   # уже зарегистрирована в TOOL_REGISTRY
```

И определить хелпер:
```python
async def _run_async(func, *args, **kwargs):
    return await asyncio.to_thread(func, *args, **kwargs)
```

### W4. Async/sync dispatcher в TOOL_REGISTRY

`agent/tools.py:330 call_tool` — sync (вызывает `spec.func(**args)`). В `rag_context_pack` я
рекомендую sync-обёртку — это **верное решение**, но в промпте оно не до конца расписано.

**Правка** — добавить в § 4.1:
```python
def dsp_context_pack_sync(query, intent="generic", include=None, top_k=5) -> ToolResult:
    """Sync-обёртка для TOOL_REGISTRY (call_tool — синхронный)."""
    return asyncio.run(dsp_context_pack(query, intent, include, top_k))

# в TOOL_REGISTRY:
"dsp_context_pack": ToolSpec(..., func=dsp_context_pack_sync),
```

### W5. CASCADE_THRESHOLD = 0.5 — без обоснования

В G5 пишу `< 0.5` без указания семантики. После cross-encoder reranker'а (`bge-reranker-v2-m3`)
скоры — **logits**, не вероятности (диапазон ~[-10, +10]). Применение `< 0.5` **некорректно**.

**Правка G5:**
```python
# Cross-encoder reranker возвращает logits. Эмпирический threshold для high-confidence:
# rerank_score >= 2.0 → confident; в [-2, 2] — пограничное; < -2 → fallback
CASCADE_RERANK_THRESHOLD = 2.0  # tune после E1 (eval_extension)

if not high or (high[0].rerank_score or -inf) < CASCADE_RERANK_THRESHOLD:
    return self._query_rag(query, ["doc_blocks"], top_k)
```

И отметить в DoD: «threshold будет затюнен после E-этапа на golden_set».

---

## 🟢 NOTES (наблюдения, future work)

### N1. Регистрация tool в **3 местах** дублируется

В каждом промпте я повторяю инструкцию: tools.py + http_api.py + mcp_server.py. Это **верно**, но
если сестрёнка работает по 3 промптам последовательно — она увидит одно и то же. ОК для
самодостаточности, оставляем.

### N2. Индекс `deps(src_id, kind)` уже может существовать

В G3 я предлагаю миграцию `2026-05-XX_deps_index.sql`. Перед созданием — проверить через
`\d+ rag_dsp.deps` в psql. Если индекс есть — пропустить шаг.

### N3. `dsp-asst index extras --kind <X>` CLI может не существовать

В G1/G2 smoke-команды используют `--kind inherits`/`--kind parameter,...`. Текущий `cli/main.py` —
не проверяла. **Правка** в промпт graph_extension §5: добавить
«проверь `dsp-asst index --help` перед использованием; если нет — добавь флаг в `cli/main.py` или
запусти через `python -m dsp_assistant.indexer.extras_build --kind inherits`».

### N4. `read_file` tool уже есть — context_pack может его использовать

В `agent/tools.py:252` есть `read_file(path, line_from, line_to)`. В `INTENT_DEFAULTS` для
`generate_test` добавлен `templates` — это могло бы быть `read_file` на канонический шаблон.
Запишем в TODO context_pack.

### N5. Граф зависимостей промптов

```
graph_extension     ←─── independent (не ждёт ничего)
                          │
                          └── G3+G4 опционально нужны context_pack для siblings
mcp_atomic_tools    ←─── ждёт C1 (test_params_fill) + C2 (doxygen_test_parser) DONE
                          │
                          ↓
context_pack        ←─── ждёт mcp_atomic_tools DONE; опц. graph_extension G3+G4
```

Сестрёнка может запустить **параллельно** graph_extension (если C1+C2 не готовы) или mcp_atomic_tools
(если C1+C2 DONE). Context_pack — последний.

---

## Чеклист выполнения правок

- [ ] C1: заменить `db.fetch` → `db.fetchall` во всех 3 промптах
- [ ] C1: переписать cache-helpers context_pack на `asyncio.to_thread`
- [ ] C2: G5 уточнить — low-level пока через `doc_blocks`, или добавить подэтап индексации test_params
- [ ] C3: `EnrichedHit.target_id` вместо `payload["use_case_id"]/payload["pipeline_id"]`
- [ ] W1: SQL `make_interval(secs => %s)` вместо `interval '%s seconds'`
- [ ] W2: `self.query(...)` вместо `self._query_tables(...)`
- [ ] W3: `dsp_search` import + `_run_async` helper в context_pack
- [ ] W4: явная sync-обёртка `dsp_context_pack_sync` для TOOL_REGISTRY
- [ ] W5: CASCADE_RERANK_THRESHOLD = 2.0 (logits) с пометкой tuneable
- [ ] N3: проверка `dsp-asst index --help` в smoke graph_extension

---

## Что в промптах хорошо (оставить как есть)

- ✅ Жёсткие правила (worktree / pytest / CMake / git push) — повторены в каждом промпте.
- ✅ Указание читать TASK_*.md первым (источник истины DoD).
- ✅ Структура: 0-предусловия → цель → инфраструктура → код → DoD → smoke → артефакты → завершение.
- ✅ Self-contained: каждый промпт читается без чтения других.
- ✅ Указание трёх мест регистрации tool (`tools.py` + `http_api.py` + `mcp_server.py`).
- ✅ Graceful degradation в context_pack через `try/except import _HAS_GRAPH`.

---

*Maintained by: Кодо · 2026-05-08 · self-review после написания трёх промптов*
