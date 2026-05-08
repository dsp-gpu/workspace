# Промпт для subagent / сестрёнки: TASK_RAG_mcp_atomic_tools (C5 + C6)

> **Создан:** 2026-05-08 · **Ревью:** `MemoryBank/specs/rag_prompts_review_2026-05-08.md` (правки C1-C3 применены)
> **Целевой TASK:** `MemoryBank/tasks/TASK_RAG_mcp_atomic_tools_2026-05-08.md`
> **Effort:** ~1.5 ч · **Приоритет:** 🟠 P1
> **Зависимости:** `TASK_RAG_test_params_fill` (C1), `TASK_RAG_doxygen_test_parser` (C2) — **должны быть DONE**
> **Координатор:** `MemoryBank/tasks/TASK_RAG_context_fuel_2026-05-08.md`

---

## 0. Прочитать ПЕРЕД началом

1. `MemoryBank/tasks/TASK_RAG_mcp_atomic_tools_2026-05-08.md` — DoD (источник истины)
2. `MemoryBank/specs/LLM_and_RAG/RAG_kfp_design_2026-05-08.md` — схема `test_params` (что в JSONB-полях)
3. `MemoryBank/specs/LLM_and_RAG/RAG_deep_analysis_2026-05-08.md` §3.8 — Tools roadmap
4. **Проверить статус зависимостей:**
   - `psql -d rag_dsp -c "SELECT count(*) FROM rag_dsp.test_params;"` ≥ 200
   - Если 0 — **СТОП**, ждать C1+C2
5. `MemoryBank/.claude/rules/03-worktree-safety.md` — писать только в `e:/DSP-GPU/`

## 1. Цель

Добавить **4 atomic MCP-tool** в `dsp-asst` для **прямого доступа** LLM к специализированным
RAG-таблицам. Это вариант **X (agentic 2026)** — LLM сама вызывает нужные tools параллельно.
Orchestrator (`dsp_context_pack`, вариант Y) — отдельный таск `TASK_RAG_context_pack`.

**4 tool:**
1. `dsp_test_params(class_fqn, method?)` — edge_values + constraints + throw_checks
2. `dsp_use_case(query, repo?, top_k=5)` — hybrid retrieval по `rag_dsp.use_cases`
3. `dsp_pipeline(name?, query?, top_k=3)` — exact или hybrid по `rag_dsp.pipelines`
4. (`dsp_test_params` × 2 режима — class-level и method-level — это один tool с опц. `method`)

## 2. Где живёт код

```
c:/finetune-env/dsp_assistant/
├── agent/tools.py                  ← TOOL_REGISTRY (dataclass ToolSpec, 344 строки)
├── server/
│   ├── mcp_server.py               ← FastMCP, @mcp.tool()
│   └── http_api.py                 ← HTTP endpoints (warm models)
├── retrieval/rag_hybrid.py         ← HybridRetriever — для use_case/pipeline
└── db/client.py                    ← DbClient (db.fetch / db.execute)
```

**Регистрация tool — 3 места** (см. `mcp_server.py` уже зарегистрированных
`dsp_search`/`dsp_find`/`dsp_show_symbol` как образец):
1. `agent/tools.py` → `ToolSpec` в `TOOL_REGISTRY`
2. `server/http_api.py` → POST endpoint
3. `server/mcp_server.py` → `@mcp.tool()` тонкая обёртка вокруг HTTP

## 3. Реализация tools

### C5 — `dsp_test_params(class_fqn, method?)` (~30 мин)

**Файл:** `dsp_assistant/agent/tools/dsp_test_params.py` (новый, выносим из `tools.py`).

```python
from dsp_assistant.agent.tools import ToolResult
from dsp_assistant.db import DbClient

def dsp_test_params(
    class_fqn: str,
    method: str | None = None,
    db: DbClient | None = None,
) -> ToolResult:
    """Возврат: structured JSON с edge_values, constraints, throw_checks,
    return_checks, linked_use_cases, confidence для одного класса/метода."""
    rows = db.fetchall("""
        SELECT method_name, param_name,
               edge_values, constraints,
               throw_checks, return_checks,
               linked_use_cases, linked_pipelines,
               confidence, coverage_status,
               human_verified
          FROM rag_dsp.test_params
         WHERE class_fqn = %s
           AND (%s::text IS NULL OR method_name = %s)
         ORDER BY method_name, param_name
    """, [class_fqn, method, method])
    # ⚠️ DbClient sync (db.fetchall — есть; db.fetch — НЕТ).

    return ToolResult(
        text=_format_text(class_fqn, rows),
        raw={"class": class_fqn, "method": method, "params": rows, "count": len(rows)},
    )
```

**Замечания:**
- Если `rows == []` → `text="Нет записей test_params для {class_fqn}"`, `raw={"params": []}` (не ошибка).
- `_format_text` — компактная сводка для LLM (не полный JSON, иначе токены раздуваются).

### C6a — `dsp_use_case(query, repo?, top_k=5)` (~30 мин)

**Файл:** `dsp_assistant/agent/tools/dsp_use_case.py`.

```python
def dsp_use_case(
    query: str,
    repo: str | None = None,
    top_k: int = 5,
    retriever: HybridRetriever | None = None,
) -> ToolResult:
    """Hybrid retrieval по rag_dsp.use_cases (после C3 sparse работает).
    Возврат: список use_case с {title, body, synonyms_ru, synonyms_en, primary_class}."""
    hits = retriever.query(
        query,
        target_tables=["use_cases"],
        repos=[repo] if repo else None,        # фильтр на стороне Qdrant — корректнее
        top_k=top_k,
    )
    # query() возвращает list[EnrichedHit]: target_table, target_id, payload, content_text, repo
    ids = [h.target_id for h in hits]           # НЕ payload["use_case_id"]
    rows = db.fetchall("""
        SELECT id, title, body, synonyms_ru, synonyms_en, primary_class, repo
          FROM rag_dsp.use_cases
         WHERE id = ANY(%s)
    """, [ids])
    return ToolResult(text=_format(rows), raw={"hits": rows})
```

### C6b — `dsp_pipeline(name?, query?, top_k=3)` (~30 мин)

**Файл:** `dsp_assistant/agent/tools/dsp_pipeline.py`.

```python
def dsp_pipeline(
    name: str | None = None,
    query: str | None = None,
    top_k: int = 3,
    retriever: HybridRetriever | None = None,
) -> ToolResult:
    """Если name → exact match по slug.
    Если query → hybrid retrieval по pipelines.
    Возврат: {title, when_to_use, composer_class, chain_classes, chain_repos, ascii_flow}."""
    if name:
        rows = db.fetchall("""
            SELECT slug, title, when_to_use, composer_class,
                   chain_classes, chain_repos, ascii_flow
              FROM rag_dsp.pipelines
             WHERE slug = %s
        """, [name])
    elif query:
        hits = retriever.query(query, target_tables=["pipelines"], top_k=top_k)
        ids = [h.target_id for h in hits]    # EnrichedHit.target_id
        rows = db.fetchall("""
            SELECT slug, title, when_to_use, composer_class,
                   chain_classes, chain_repos, ascii_flow
              FROM rag_dsp.pipelines
             WHERE id = ANY(%s)
        """, [ids])
    else:
        return ToolResult(text="ОШИБКА: нужен либо name, либо query", raw=None)

    return ToolResult(text=_format(rows), raw={"pipelines": rows})
```

## 4. Регистрация (3 места)

### 4.1 `agent/tools.py` → `TOOL_REGISTRY`

```python
"dsp_test_params": ToolSpec(
    name="dsp_test_params",
    description=(
        "Параметры тестирования метода/класса DSP-GPU: граничные значения, "
        "ограничения, кейсы исключений. Используй ПЕРЕД генерацией C++ теста."
    ),
    args_schema='{"class_fqn": str, "method": str?}',
    func=dsp_test_params,
),
"dsp_use_case": ToolSpec(
    name="dsp_use_case",
    description=(
        "Найти use_case (Python-сценарий применения) по запросу. "
        "Используй когда нужно понять КАК класс используется в реальных задачах."
    ),
    args_schema='{"query": str, "repo": str?, "top_k": int?}',
    func=dsp_use_case,
),
"dsp_pipeline": ToolSpec(
    name="dsp_pipeline",
    description=(
        "Найти высокоуровневый pipeline (radar / spectrum / heterodyne / ...). "
        "Возврат: цепочка классов + ASCII-flow. Используй для запросов 'pipeline для X'."
    ),
    args_schema='{"name": str?, "query": str?, "top_k": int?}',
    func=dsp_pipeline,
),
```

### 4.2 `server/http_api.py`

POST endpoints:
- `/v1/tools/test_params` body: `{class_fqn, method?}`
- `/v1/tools/use_case` body: `{query, repo?, top_k?}`
- `/v1/tools/pipeline` body: `{name?, query?, top_k?}`

Resolver реализаций — в том же процессе что и dsp_search (warm models).

### 4.3 `server/mcp_server.py`

```python
@mcp.tool()
def dsp_test_params(class_fqn: str, method: str | None = None) -> dict[str, Any]:
    """Параметры тестирования метода/класса (edge_values, constraints, throw_checks)."""
    return _post("/v1/tools/test_params", {"class_fqn": class_fqn, "method": method})

@mcp.tool()
def dsp_use_case(query: str, repo: str | None = None, top_k: int = 5) -> dict[str, Any]:
    """Use_case (Python-сценарий применения) по запросу."""
    return _post("/v1/tools/use_case", {"query": query, "repo": repo, "top_k": top_k})

@mcp.tool()
def dsp_pipeline(name: str | None = None, query: str | None = None, top_k: int = 3) -> dict[str, Any]:
    """Высокоуровневый pipeline (radar / spectrum / ...): цепочка классов + ASCII-flow."""
    return _post("/v1/tools/pipeline", {"name": name, "query": query, "top_k": top_k})
```

## 5. DoD (cопия из таска)

- [ ] `dsp_test_params(class_fqn="fft_processor::FFTProcessorROCm")` → edge_values+constraints+throw_checks для всех методов
- [ ] `dsp_test_params(class_fqn=..., method="ProcessComplex")` → только ProcessComplex
- [ ] `dsp_use_case(query="FFT batch")` → топ-5 use_case с body
- [ ] `dsp_pipeline(name="antenna_processor_pipeline")` → chain_classes
- [ ] `dsp_pipeline(query="радар")` → hybrid retrieval работает
- [ ] Все 3 tool в MCP server, видны в `dsp-asst mcp list-tools`
- [ ] Continue VSCode видит их в Agent mode

## 6. Smoke (после реализации)

```bash
# Проверка что данные есть:
psql -d rag_dsp -c "SELECT class_fqn, count(*) FROM rag_dsp.test_params GROUP BY class_fqn ORDER BY 2 DESC LIMIT 5;"

# Tool через MCP (stdio):
dsp-asst mcp call dsp_test_params --class_fqn "fft_processor::FFTProcessorROCm"
dsp-asst mcp call dsp_use_case --query "FFT batch"
dsp-asst mcp call dsp_pipeline --name "antenna_processor_pipeline"

# Список зарегистрированных:
dsp-asst mcp list-tools | grep dsp_
```

## 7. Жёсткие правила

- ❌ **`pytest` запрещён** → если пишешь Python-тесты, только `common.runner.TestRunner` + `SkipTest` (правило 04).
- ❌ **CMake** не трогать.
- ❌ **Worktree:** только `e:/DSP-GPU/`.
- ❌ **Git push/tag** — только по OK Alex.
- ✅ **Не плодить:** не создавать новый `HybridRetriever` — переиспользовать существующий из `rag_hybrid.py`.
- ✅ **Tool registration в 3 местах** строго (иначе Continue не увидит).

## 8. Артефакты

| Файл | Действие |
|------|----------|
| `dsp_assistant/agent/tools/dsp_test_params.py` | НОВЫЙ |
| `dsp_assistant/agent/tools/dsp_use_case.py` | НОВЫЙ |
| `dsp_assistant/agent/tools/dsp_pipeline.py` | НОВЫЙ |
| `dsp_assistant/agent/tools.py` | +3 ToolSpec в TOOL_REGISTRY |
| `dsp_assistant/server/http_api.py` | +3 endpoint'а |
| `dsp_assistant/server/mcp_server.py` | +3 `@mcp.tool()` |

## 9. По завершении

1. Пометить DoD ✅ в `MemoryBank/tasks/TASK_RAG_mcp_atomic_tools_2026-05-08.md`.
2. Обновить `MemoryBank/tasks/IN_PROGRESS.md`.
3. Сессионный отчёт → `MemoryBank/sessions/YYYY-MM-DD.md`.
4. Сообщить (если context_pack ждёт): C5+C6 готовы → можно стартовать orchestrator.
5. **НЕ** делать git push без OK.

---

*Maintained by: Кодо · 2026-05-08*
