# TASK_RAG_context_pack — orchestrator с cache (вариант Y)

> **Этап:** CONTEXT-FUEL (C7) · **Приоритет:** 🟠 P1 · **Effort:** ~2 ч · **Зависимости:** TASK_RAG_mcp_atomic_tools (C5+C6); опционально TASK_RAG_graph_extension (G3+G4)
> **Координатор:** `TASK_RAG_context_fuel_2026-05-08.md`

## 🎯 Цель

`dsp_context_pack(query, intent, include=[...])` — **orchestrator** который ВНУТРИ зовёт atomic
tools (C5/C6 + опционально G3/G4) **параллельно**, кэширует результат на 5 мин по
`(query_hash, intent)`, и возвращает структурированный JSON.

**Архитектура (X+Y):**
- **X (atomic tools, вариант Y):** LLM может зайти в любой момент и сама собрать pack
- **Y (orchestrator):** для типовых intent (`generate_test`, `find_class`, `migrate_code`, ...) — единая точка доступа с кэшем → производительность + меньше ошибок склейки

> 3 цели Alex: правдивый ответ без галлюцинаций / надёжность / производительность.

## 📋 Реализация

### 1. Сигнатура (~30 мин)

```python
# dsp_assistant/agent/tools/dsp_context_pack.py
def dsp_context_pack(
    query: str,
    intent: Literal["generate_test", "find_class", "explain_method",
                    "migrate_code", "pipeline_search", "generic"],
    include: list[Literal["primary_symbol", "test_params", "use_case",
                          "siblings", "pybind", "examples", "templates"]]
        = ("primary_symbol", "test_params"),  # default — минимальный
    top_k: int = 5,
) -> dict:
    """
    Orchestrator: вызывает atomic tools параллельно (asyncio.gather)
    + кэш в rag_logs.context_cache (TTL 5 мин по hash(query, intent, include)).
    """
```

### 2. Параллельные вызовы (~45 мин)

```python
async def _resolve(query, intent, include, top_k):
    cache_key = sha256(f"{query}|{intent}|{','.join(sorted(include))}").hexdigest()
    cached = await db.fetch_cached(cache_key, ttl=300)
    if cached:
        return cached

    tasks = []
    if "primary_symbol" in include:
        tasks.append(dsp_search(query, top_k=1))            # most-relevant symbol
    if "test_params" in include:
        tasks.append(dsp_test_params(class_fqn=...))        # резолвим class из primary
    if "use_case" in include:
        tasks.append(dsp_use_case(query, top_k=top_k))
    if "siblings" in include:
        tasks.append(dsp_graph_neighbors(fqn=..., depth=1)) # G3 — опц.
    # ...

    results = await asyncio.gather(*tasks, return_exceptions=True)
    pack = _assemble(results, intent)
    await db.cache_set(cache_key, pack, ttl=300)
    return pack
```

### 3. Шаблоны под intent (~30 мин)

```python
INTENT_DEFAULTS = {
    "generate_test":     ["primary_symbol", "test_params", "use_case", "siblings", "templates"],
    "find_class":        ["primary_symbol"],
    "explain_method":    ["primary_symbol", "siblings", "use_case"],
    "migrate_code":      ["primary_symbol", "siblings", "pybind"],
    "pipeline_search":   ["primary_symbol", "use_case"],
    "generic":           ["primary_symbol"],
}
```

LLM передаёт `intent="generate_test"` → orchestrator знает что собирать.

### 4. Graceful degradation (~15 мин)

Если C7 запущен **до** GRAPH этапа:
- `siblings` (требует G3 `dsp_graph_neighbors`) → возвращает `[]` с warning в логе
- pack всё равно собирается, intent работает

## ✅ DoD

- [ ] `dsp_context_pack(query="FFTProcessorROCm", intent="generate_test")` возвращает 5 секций
- [ ] Cold-call <500ms p99 (parallelism через asyncio.gather)
- [ ] Cache hit <50ms (`rag_logs.context_cache` или Redis-эквивалент)
- [ ] `include=[...]` opt-in работает: default минимальный, `intent`-defaults расширяемый
- [ ] Graceful degradation: без GRAPH `siblings=[]` + warning, не error
- [ ] Зарегистрирован в MCP server, видим в Continue Agent mode
- [ ] Smoke: 3 разных intent на одном query → разные packs

## Артефакты

- `dsp_assistant/agent/tools/dsp_context_pack.py`
- `dsp_assistant/agent/cache.py` — TTL-cache (если ещё нет)
- Schema: `rag_dsp.context_cache(cache_key, payload JSONB, expires_at)` — миграция в `TASK_RAG_schema_migration` (опц.) или в этом таске
- Smoke-test — bench latency на 10 типовых intent

## Связано

- Координатор: `TASK_RAG_context_fuel_2026-05-08.md`
- Зависимости: `TASK_RAG_mcp_atomic_tools` (C5+C6 обязательно)
- Опц. зависимости: `TASK_RAG_graph_extension` (G3+G4 — `siblings` лучше работает)
- Архитектура: `RAG_deep_analysis_2026-05-08.md` §7

*Maintained by: Кодо · 2026-05-08*
