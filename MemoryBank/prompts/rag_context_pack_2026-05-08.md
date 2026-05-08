# Промпт для subagent / сестрёнки: TASK_RAG_context_pack (C7)

> **Создан:** 2026-05-08 · **Ревью:** `MemoryBank/specs/rag_prompts_review_2026-05-08.md` (правки C1, W1, W3, W4 применены)
> **Целевой TASK:** `MemoryBank/tasks/TASK_RAG_context_pack_2026-05-08.md`
> **Effort:** ~2 ч · **Приоритет:** 🟠 P1
> **Зависимости:** `TASK_RAG_mcp_atomic_tools` (C5+C6) **DONE** · опц. `TASK_RAG_graph_extension` (G3+G4)
> **Координатор:** `MemoryBank/tasks/TASK_RAG_context_fuel_2026-05-08.md`

---

## 0. Прочитать ПЕРЕД началом

1. `MemoryBank/tasks/TASK_RAG_context_pack_2026-05-08.md` — DoD (источник истины)
2. `MemoryBank/specs/LLM_and_RAG/RAG_deep_analysis_2026-05-08.md` §7 — архитектура orchestrator (X+Y)
3. **Проверить статус зависимостей:**
   - `dsp-asst mcp list-tools | grep -E "dsp_(test_params|use_case|pipeline)"` — должны быть 3 шт
   - Если нет — **СТОП**, ждать `TASK_RAG_mcp_atomic_tools`
   - `dsp_graph_neighbors` / `dsp_inheritance` — **опционально**, при отсутствии работаем с graceful degradation
4. `MemoryBank/.claude/rules/03-worktree-safety.md` — писать только в `e:/DSP-GPU/`

## 1. Цель

`dsp_context_pack(query, intent, include=[...])` — **orchestrator**, который ВНУТРИ зовёт atomic tools
(C5/C6 + опц. G3/G4) **параллельно** через `asyncio.gather`, кэширует результат на 5 мин по
`(query_hash, intent, include)`, возвращает структурированный JSON.

**Архитектура (X+Y из spec §7):**
- **X (atomic tools):** LLM может в любой момент сама собрать pack
- **Y (orchestrator):** для типовых intent — единая точка с кэшем → производительность + меньше склейки
- 3 цели Alex: правдивый ответ без галлюцинаций / надёжность / производительность

## 2. Где живёт код

```
c:/finetune-env/dsp_assistant/
├── agent/tools.py              ← TOOL_REGISTRY
├── agent/tools/                ← созданные в предыдущем таске:
│   ├── dsp_test_params.py
│   ├── dsp_use_case.py
│   └── dsp_pipeline.py
├── server/
│   ├── http_api.py             ← warm-models HTTP
│   └── mcp_server.py           ← FastMCP @mcp.tool()
├── db/client.py                ← DbClient (для cache-таблицы)
└── migrations/                 ← SQL-миграции
```

## 3. Реализация

### 3.1 Сигнатура (~30 мин)

**Файл:** `dsp_assistant/agent/tools/dsp_context_pack.py` (новый).

```python
from typing import Literal
import asyncio
import hashlib

from dsp_assistant.agent.tools import ToolResult, dsp_search       # уже в TOOL_REGISTRY
from dsp_assistant.agent.tools.dsp_test_params import dsp_test_params
from dsp_assistant.agent.tools.dsp_use_case   import dsp_use_case
from dsp_assistant.agent.tools.dsp_pipeline   import dsp_pipeline
# G3/G4 — опционально, через try/except import
try:
    from dsp_assistant.agent.tools.dsp_graph_neighbors import dsp_graph_neighbors
    from dsp_assistant.agent.tools.dsp_inheritance   import dsp_inheritance
    _HAS_GRAPH = True
except ImportError:
    _HAS_GRAPH = False


async def _run_async(func, *args, **kwargs):
    """DbClient/atomic-tools синхронные → выносим в thread, чтобы не блокировать loop."""
    return await asyncio.to_thread(func, *args, **kwargs)


Intent = Literal["generate_test", "find_class", "explain_method",
                 "migrate_code", "pipeline_search", "generic"]
Include = Literal["primary_symbol", "test_params", "use_case",
                  "siblings", "pybind", "examples", "templates"]


INTENT_DEFAULTS: dict[Intent, list[Include]] = {
    "generate_test":   ["primary_symbol", "test_params", "use_case", "siblings", "templates"],
    "find_class":      ["primary_symbol"],
    "explain_method":  ["primary_symbol", "siblings", "use_case"],
    "migrate_code":    ["primary_symbol", "siblings", "pybind"],
    "pipeline_search": ["primary_symbol", "use_case"],
    "generic":         ["primary_symbol"],
}


async def dsp_context_pack(
    query: str,
    intent: Intent = "generic",
    include: list[Include] | None = None,
    top_k: int = 5,
    db = None,
    retriever = None,
) -> ToolResult:
    """Orchestrator: parallel atomic-tool calls + cache (TTL 300s)."""
    if include is None:
        include = INTENT_DEFAULTS[intent]
    return await _resolve(query, intent, list(include), top_k, db, retriever)
```

### 3.2 Параллельные вызовы (~45 мин)

```python
async def _resolve(query, intent, include, top_k, db, retriever) -> ToolResult:
    cache_key = _hash(query, intent, include)
    cached = await _cache_get(db, cache_key, ttl=300)
    if cached is not None:
        return ToolResult(text=_format(cached), raw=cached, meta={"cache": "hit"})

    # 1) Резолвим primary_symbol первым (он нужен для test_params/siblings)
    primary = None
    if "primary_symbol" in include:
        primary = await _run_async(dsp_search, query, top_k=1, retriever=retriever)

    # 2) Параллельный fan-out
    tasks: dict[str, asyncio.Task] = {}
    if "test_params" in include and primary:
        cls_fqn = primary.raw["hits"][0]["class_fqn"]
        tasks["test_params"] = asyncio.create_task(
            _run_async(dsp_test_params, class_fqn=cls_fqn, db=db)
        )
    if "use_case" in include:
        tasks["use_case"] = asyncio.create_task(
            _run_async(dsp_use_case, query=query, top_k=top_k, retriever=retriever)
        )
    if "siblings" in include:
        if _HAS_GRAPH and primary:
            fqn = primary.raw["hits"][0]["fqn"]
            tasks["siblings"] = asyncio.create_task(
                _run_async(dsp_graph_neighbors, fqn=fqn, depth=1)
            )
        else:
            # graceful: добавим warning в meta
            tasks["siblings"] = _empty_task("siblings: graph_extension not loaded")
    if "pybind" in include and primary:
        # pybind лежит в symbols payload — берём из primary
        pass  # уже доступно в primary
    # examples, templates — TODO в следующих итерациях

    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    pack = _assemble(primary, dict(zip(tasks.keys(), results)), intent)
    await _cache_set(db, cache_key, pack, ttl=300)
    return ToolResult(text=_format(pack), raw=pack, meta={"cache": "miss"})


def _hash(query: str, intent: str, include: list[str]) -> str:
    sig = f"{query}|{intent}|{','.join(sorted(include))}"
    return hashlib.sha256(sig.encode("utf-8")).hexdigest()
```

### 3.3 Cache в `rag_dsp.context_cache` (~15 мин)

**Миграция (SQL — это OK, не CMake):**

`dsp_assistant/migrations/2026-05-XX_context_cache.sql`:
```sql
SET search_path TO rag_dsp, public;

CREATE TABLE IF NOT EXISTS context_cache (
    cache_key  TEXT       PRIMARY KEY,
    payload    JSONB      NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS context_cache_expires_idx
    ON context_cache(expires_at);
```

**Cleanup:** простая ленивая чистка при `_cache_get` — если запись `expires_at < now()` → удалить
и вернуть None. Отдельный cron-job НЕ заводим (минимум сущностей).

```python
async def _cache_get(db, key: str) -> dict | None:
    """DbClient sync → asyncio.to_thread."""
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


async def _cache_set(db, key: str, payload: dict, ttl: int) -> None:
    """psycopg НЕ интерполирует параметры внутри строкового литерала —
    interval делаем через make_interval(secs => %s)."""
    import json
    await asyncio.to_thread(
        db.execute,
        """
        INSERT INTO rag_dsp.context_cache(cache_key, payload, expires_at)
        VALUES (%s, %s::jsonb, now() + make_interval(secs => %s))
        ON CONFLICT (cache_key) DO UPDATE
            SET payload = EXCLUDED.payload,
                expires_at = EXCLUDED.expires_at
        """,
        [key, json.dumps(payload), ttl],
    )
```

### 3.4 Шаблоны под intent — `_assemble` (~30 мин)

```python
def _assemble(primary, parts: dict, intent: str) -> dict:
    """Собирает финальный pack под intent. Грубая идея — все intent
    кладут в один dict, но текстовый формат разный (для LLM)."""
    return {
        "intent": intent,
        "primary_symbol": primary.raw if primary else None,
        "test_params":    _safe(parts.get("test_params")),
        "use_case":       _safe(parts.get("use_case")),
        "siblings":       _safe(parts.get("siblings")),
        "warnings":       _collect_warnings(parts),
    }

def _safe(result):
    """Если ToolResult или Exception — нормализуем."""
    if result is None:
        return None
    if isinstance(result, Exception):
        return {"error": f"{type(result).__name__}: {result}"}
    return result.raw if hasattr(result, "raw") else result
```

### 3.5 Graceful degradation (~15 мин)

Если C7 запущен **до** GRAPH (G3/G4 ещё нет):
- `siblings` → `[]` + warning в `meta.warnings`
- pack всё равно собирается, intent работает
- НЕ падать, НЕ блокировать

Поведение фиксируется флагом `_HAS_GRAPH` (см. 3.1).

## 4. Регистрация (3 места)

### 4.1 `agent/tools.py` → TOOL_REGISTRY

```python
def dsp_context_pack_sync(
    query: str,
    intent: str = "generic",
    include: list[str] | None = None,
    top_k: int = 5,
) -> ToolResult:
    """Sync-обёртка: agent/tools.py:call_tool — синхронный диспетчер.
    Не меняем dispatcher — оборачиваем async корутину в asyncio.run()."""
    return asyncio.run(dsp_context_pack(query, intent, include, top_k))

"dsp_context_pack": ToolSpec(
    name="dsp_context_pack",
    description=(
        "Orchestrator: собирает контекст-pack для типового intent (generate_test, "
        "find_class, explain_method, migrate_code, pipeline_search) параллельно из "
        "atomic tools + cache 5 мин. Используй когда нужен ОДНИМ вызовом весь контекст."
    ),
    args_schema=(
        '{"query": str, '
        '"intent": "generate_test|find_class|explain_method|migrate_code|pipeline_search|generic", '
        '"include": list[str]?, "top_k": int?}'
    ),
    func=dsp_context_pack_sync,    # sync-обёртка вокруг async корутины
),
```

> ⚠️ В `agent/tools.py:330 call_tool` сейчас sync. Если orchestrator async —
> либо добавить `inspect.iscoroutine(result) → asyncio.run(result)` в `call_tool`,
> либо сделать sync-обёртку `dsp_context_pack_sync`. Выбор: **sync-обёртка**, чтобы
> не менять существующий dispatcher.

### 4.2 `server/http_api.py`

POST `/v1/tools/context_pack` body: `{query, intent, include?, top_k?}`.

Внутри HTTP-сервера — `asyncio.run(dsp_context_pack(...))` (FastAPI поддерживает `async def` —
если http_api на FastAPI, оставить async; если Flask — обёртка).

### 4.3 `server/mcp_server.py`

```python
@mcp.tool()
def dsp_context_pack(
    query: str,
    intent: str = "generic",
    include: list[str] | None = None,
    top_k: int = 5,
) -> dict[str, Any]:
    """Orchestrator: один вызов = весь контекст под intent (parallel + cache 5 мин).
    intent: generate_test | find_class | explain_method | migrate_code | pipeline_search | generic
    """
    return _post("/v1/tools/context_pack", {
        "query": query, "intent": intent,
        "include": include, "top_k": top_k,
    })
```

## 5. DoD (cопия из таска)

- [ ] `dsp_context_pack(query="FFTProcessorROCm", intent="generate_test")` возвращает 5 секций (primary+test_params+use_case+siblings+templates)
- [ ] Cold-call <500ms p99 (parallelism через `asyncio.gather`)
- [ ] Cache hit <50ms (`rag_dsp.context_cache`)
- [ ] `include=[...]` opt-in работает: default минимальный, `intent`-defaults расширяемый
- [ ] Graceful degradation: без GRAPH `siblings=[]` + warning, не error
- [ ] Зарегистрирован в MCP server, видим в Continue Agent mode
- [ ] Smoke: 3 разных intent на одном query → разные packs

## 6. Smoke

```bash
# Миграция:
dsp-asst migrate apply

# Колд (cache miss):
time dsp-asst mcp call dsp_context_pack --query "FFTProcessorROCm" --intent generate_test
# должно быть <500ms

# Хот (cache hit, тот же запрос):
time dsp-asst mcp call dsp_context_pack --query "FFTProcessorROCm" --intent generate_test
# должно быть <50ms

# Разные intent на одном query:
for I in generate_test find_class explain_method migrate_code; do
  dsp-asst mcp call dsp_context_pack --query "FFTProcessorROCm" --intent $I | jq '.intent'
done
```

## 7. Жёсткие правила

- ❌ **`pytest` запрещён** → `common.runner.TestRunner` + `SkipTest` (правило 04).
- ❌ **CMake** не трогать (правило 12). SQL-миграции — OK.
- ❌ **Worktree:** только `e:/DSP-GPU/` (правило 03).
- ❌ **Git push/tag** — только OK Alex (правило 02).
- ✅ **Не плодить:** orchestrator — НЕ копия retriever'а. Зовёт уже существующие atomic tools.
- ✅ **Graceful degradation** обязательно: без G3/G4 не падаем.

## 8. Артефакты

| Файл | Действие |
|------|----------|
| `dsp_assistant/agent/tools/dsp_context_pack.py` | НОВЫЙ |
| `dsp_assistant/agent/cache.py` | (опц.) если выделим helper |
| `dsp_assistant/migrations/2026-05-XX_context_cache.sql` | НОВЫЙ |
| `dsp_assistant/agent/tools.py` | +1 ToolSpec (sync-обёртка) |
| `dsp_assistant/server/http_api.py` | +endpoint `/v1/tools/context_pack` |
| `dsp_assistant/server/mcp_server.py` | +`@mcp.tool() dsp_context_pack` |

## 9. По завершении

1. Пометить DoD ✅ в `MemoryBank/tasks/TASK_RAG_context_pack_2026-05-08.md`.
2. Обновить `MemoryBank/tasks/IN_PROGRESS.md`.
3. Сессионный отчёт → `MemoryBank/sessions/YYYY-MM-DD.md`.
4. Если запускалось до GRAPH — пометить в отчёте «siblings degraded mode», после G3/G4
   проверить что без правок context_pack автоматически подхватит `_HAS_GRAPH = True`.
5. **НЕ** делать git push без OK.

---

*Maintained by: Кодо · 2026-05-08*
