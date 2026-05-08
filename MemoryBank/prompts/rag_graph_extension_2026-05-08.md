# Промпт для subagent / сестрёнки: TASK_RAG_graph_extension (G1-G5)

> **Создан:** 2026-05-08 · **Ревью:** `MemoryBank/specs/rag_prompts_review_2026-05-08.md` (правки C1-W5 применены)
> **Целевой TASK:** `MemoryBank/tasks/TASK_RAG_graph_extension_2026-05-08.md`
> **Effort:** ~9 ч · **Приоритет:** 🟠 P1 · **Зависимости:** none (G2-calls = Phase B+ через clangd на Debian — не делаем)
> **Координатор:** `MemoryBank/tasks/TASK_RAG_context_fuel_2026-05-08.md`

---

## 0. Прочитать ПЕРЕД началом (в этом порядке)

1. `MemoryBank/tasks/TASK_RAG_graph_extension_2026-05-08.md` — DoD и подэтапы (источник истины)
2. `MemoryBank/tasks/TASK_RAG_context_fuel_2026-05-08.md` — карта зависимостей
3. `MemoryBank/specs/LLM_and_RAG/RAG_deep_analysis_2026-05-08.md` §3.7-3.8 — Graph + Tools roadmap
4. `MemoryBank/.claude/rules/00-new-task-workflow.md` — Context7 → URL → seq → GitHub перед кодом
5. `MemoryBank/.claude/rules/03-worktree-safety.md` — **писать только в `e:/DSP-GPU/`**, НЕ в `.claude/worktrees/`

## 1. Цель

Расширить граф знаний `rag_dsp.deps` (сейчас `kind ∈ {includes, pybind, cmake_link}`) до **базового GraphRAG**:
inheritance + uses_type + parameter + returns + throws + LightRAG dual-level retrieval.

**Call-graph (`kind=calls`)** требует clangd LSP — **отложен** на Phase B+ (Debian).

## 2. Где живёт код (изученная инфраструктура)

```
c:/finetune-env/dsp_assistant/                ← Python-код RAG-стека
├── indexer/
│   ├── cpp_extras.py        ← УЖЕ есть parse_includes + pybind extractor (tree_sitter_cpp)
│   ├── chunker_cpp.py       ← reference: как ходить по AST
│   ├── extras_build.py      ← persister для deps
│   └── persister.py         ← UPSERT в rag_dsp
├── agent/
│   └── tools.py             ← TOOL_REGISTRY (dataclass ToolSpec, ~344 строк)
├── retrieval/
│   └── rag_hybrid.py        ← HybridRetriever (340 строк), сюда добавляем `level`
├── server/
│   ├── mcp_server.py        ← FastMCP, @mcp.tool() декоратор (227 строк)
│   └── http_api.py          ← warm-models HTTP backend
├── migrations/
│   └── 2026-05-08_*.sql     ← SQL-миграции (idempotent IF NOT EXISTS)
└── db/client.py             ← DbClient: db.fetch / db.execute
```

**Архитектура tools (важно):** dsp-asst — двухслойный.
- `agent/tools.py` → `TOOL_REGISTRY` для агентского loop'а (`agent/loop.py`).
- `server/mcp_server.py` → `@mcp.tool()` (тонкий MCP-клиент, делает HTTP к `dsp-asst serve`).
- `server/http_api.py` → реализация (warm BGE-M3, reranker).

**При добавлении tool нужны 3 места:** `tools.py` + `http_api.py` + `mcp_server.py`.

## 3. Подэтапы (исполнение)

### G1 — Inheritance tree (~1.5 ч)

**Файл:** `dsp_assistant/indexer/cpp_extras.py` (расширить, не плодить новый).

```python
@dataclass
class InheritanceRef:
    derived_fqn: str        # "ROCmBackend"
    base_fqn: str           # "IBackend"
    access: str             # "public" | "private" | "protected"
    line: int

def parse_inheritance(path: Path) -> list[InheritanceRef]:
    """tree_sitter_cpp: ищем class_specifier с base_class_clause.
    'class Foo : public Bar, private Baz' → 2 InheritanceRef."""
```

**Регистрация рёбер:** `extras_build.py` (или соседний модуль) — UPSERT в
`rag_dsp.deps(src_id, dst_id, kind='inherits')` где `src_id`=derived, `dst_id`=base.
**FQN→symbol_id** резолвить через `symbols` таблицу (уже есть индекс по `fqn`).

**Smoke (DoD G1):**
- `IBackend` имеет ≥3 наследников (ROCmBackend, fake_backend, ...)
- `IGpuOperation` ≥5 наследников
- `rag_dsp.deps WHERE kind='inherits'` ≥ 50 рёбер

### G2 — `parameter` / `returns` / `uses_type` / `throws` (~2 ч)

**Без clangd**, синтаксические эвристики. Принцип: лучше recall ~95% / precision ~85%, чем точно но мало.

| Edge kind | Источник | Пример |
|-----------|----------|--------|
| `parameter` | сигнатура метода (tree_sitter `function_declarator`) | `Process(BufferSet<2>& bs)` → (Process, BufferSet) |
| `returns`   | возвращаемый тип | `BufferSet<2> Build()` → (Build, BufferSet) |
| `uses_type` | тело метода: `T x = ...` / `auto x = T{...}` | `auto cfg = SpectrumConfig{...}` |
| `throws`    | `@throws` doxygen в .hpp + `throw std::X(...)` в .cpp | (method, exception_type) |

**FQN-резолв:** обрезать template-аргументы (`BufferSet<2>` → `BufferSet`), отрезать `&`, `*`, `const`.
Если в `symbols` не нашли → пропустить (не плодить мусор).

**Не делаем `calls`** — без clangd overload resolution = много false positives.

**DoD G2:**
- Каждое ребро из {parameter, returns, uses_type, throws} ≥ 200 строк
- `MeanReductionOp::Process` имеет ребро `parameter → BufferSet`
- `FFTProcessorROCm::ProcessComplex` имеет рёбра `parameter` + `throws`

### G3 — Tool `dsp_graph_neighbors(fqn, depth, edge_types)` (~2 ч)

**Файл:** `dsp_assistant/agent/tools/dsp_graph_neighbors.py` (новый файл — выделяем из `tools.py`,
там уже 344 строки, дальше расти не надо). При этом в `tools.py:TOOL_REGISTRY` добавить запись.

```python
def dsp_graph_neighbors(
    fqn: str,
    depth: int = 1,
    edge_types: list[str] = ("includes", "inherits", "parameter", "uses_type"),
    direction: Literal["out", "in", "both"] = "out",
) -> ToolResult:
    """BFS в rag_dsp.deps. Возврат: tree-structured соседи по типам рёбер."""
```

**SQL-стратегия:** рекурсивный CTE до `depth` (default 1, max 3 — ограничить):
```sql
WITH RECURSIVE g(src, dst, kind, lvl) AS (
    SELECT s.id, d.dst_id, d.kind, 1
      FROM symbols s
      JOIN deps d ON d.src_id = s.id
     WHERE s.fqn = $1 AND d.kind = ANY($2)
    UNION ALL
    SELECT g.src, d.dst_id, d.kind, lvl + 1
      FROM g JOIN deps d ON d.src_id = g.dst
     WHERE lvl < $3 AND d.kind = ANY($2)
) SELECT ...
```

**Бенч (DoD G3):** depth=2 на классе с ~30 рёбрами → **<300ms p99**. Если медленнее — добавить
индекс `CREATE INDEX IF NOT EXISTS deps_src_kind_idx ON rag_dsp.deps(src_id, kind);` в новую миграцию
(но **CMake не трогаем — миграции SQL это OK**).

**Регистрация:**
1. `agent/tools.py` → ToolSpec в TOOL_REGISTRY
2. `server/mcp_server.py` → `@mcp.tool()` обёртка
3. `server/http_api.py` → POST `/v1/graph/neighbors`

### G4 — Tool `dsp_inheritance(fqn)` (~30 мин)

**Файл:** `dsp_assistant/agent/tools/dsp_inheritance.py`.

```python
def dsp_inheritance(fqn: str) -> ToolResult:
    """{
      "fqn": "...",
      "parents":  [...],   # рекурсивно вверх по inherits
      "children": [...],   # рекурсивно вниз
      "siblings": [...]    # other children of parents (без self)
    }"""
```

Под капотом — два BFS по `kind='inherits'` (вверх и вниз) + объединение для siblings.
Регистрация — все 3 места (tools.py + http_api.py + mcp_server.py).

**DoD G4:** `dsp_inheritance(IBackend)` возвращает 2 непустых списка (parents=[], children≥3).

### G5 — LightRAG dual-level retrieval (~3 ч)

**Файл:** `dsp_assistant/retrieval/rag_hybrid.py` — расширить существующий `HybridRetriever.query()`,
**не плодить** второй класс.

```python
def query(
    self,
    text: str,
    *,
    level: Literal["low", "high", "both"] = "both",
    target_tables: list[str] | None = None,
    repos: list[str] | None = None,
    top_k: int = DEFAULT_TOP_K,
    candidates: int = DEFAULT_CANDIDATES,
    use_rerank: bool = True,
) -> list[EnrichedHit]:
    if level == "high":
        # high: концепты, репо-уровень
        return self._query_impl(text, ["pipelines", "use_cases"], repos, top_k, candidates, use_rerank)
    if level == "low":
        # low: doc_blocks (символы/методы/тесты пока не индексируются в Qdrant как target).
        # Расширение test_params как target_table — отдельный подэтап после E1 eval.
        return self._query_impl(text, ["doc_blocks"], repos, top_k, candidates, use_rerank)
    # both: cascade — сначала high, при низком rerank fallback в low
    high = self._query_impl(text, ["pipelines", "use_cases"], repos, top_k=3,
                            candidates=candidates, use_rerank=use_rerank)
    top_score = (high[0].rerank_score if high and high[0].rerank_score is not None
                 else float("-inf"))
    if not high or top_score < CASCADE_RERANK_THRESHOLD:
        return self._query_impl(text, ["doc_blocks"], repos, top_k, candidates, use_rerank)
    return high
```

> ⚠️ **CASCADE_RERANK_THRESHOLD = 2.0** — bge-reranker-v2-m3 возвращает **logits**, не вероятности
> (диапазон ~[-10, +10]). Применять `< 0.5` некорректно. Threshold будет затюнен после E1
> (eval_extension) на golden_set. Оставить TODO-комментарий.
>
> ⚠️ Метод `_query_impl` — рефакторинг текущего тела `HybridRetriever.query()` в приватный helper,
> чтобы публичный `query()` стал диспетчером по `level`. Альтернатива (минимум изменений) —
> сделать `level` параметром и в начале `query()` подменять `target_tables` если оно `None`.

**Smoke (DoD G5):**
- запрос «pipeline для радара» при `level="high"` → top-1 = `RadarPipeline` или
  `fm_correlator_pipeline`, **не** их методы
- `level="low"` на том же запросе → top-1 = метод (не пайплайн)
- `level="both"` отрабатывает cascade на запросе с низким high.score

## 4. DoD (cопия из таска, для верификации)

### G1
- [ ] `rag_dsp.deps(kind='inherits')` ≥ 50 рёбер
- [ ] `IBackend` ≥3 наследников; `IGpuOperation` ≥5

### G2
- [ ] parameter / returns / uses_type / throws — ≥ 200 каждое
- [ ] `MeanReductionOp::Process` имеет ребро `parameter → BufferSet`

### G3
- [ ] `dsp_graph_neighbors(fqn="ScopedHipEvent", depth=2)` <300ms p99
- [ ] BFS обходит includes/inherits/uses_type/parameter

### G4
- [ ] `dsp_inheritance(IBackend)` возвращает 2 списка
- [ ] Зарегистрирован в MCP

### G5
- [ ] `dsp_search(level="high")` приоритизирует pipelines+use_cases
- [ ] Cascade-логика: high→low fallback по threshold

## 5. Smoke-команды (запускать после каждого подэтапа)

```bash
# G1 после реализации:
dsp-asst index extras --repo core --kind inherits
psql -d rag_dsp -c "SELECT count(*) FROM rag_dsp.deps WHERE kind='inherits';"

# G2:
dsp-asst index extras --all --kind parameter,returns,uses_type,throws

# G3 (после регистрации в MCP):
dsp-asst mcp call dsp_graph_neighbors --fqn ScopedHipEvent --depth 2

# G4:
dsp-asst mcp call dsp_inheritance --fqn IBackend

# G5:
dsp-asst search "pipeline для радара" --level high
```

> Если CLI-команд `dsp-asst index extras` ещё нет под нужный kind — **сначала проверить
> `cli/main.py`**, не плодить новый CLI без необходимости.

## 6. Жёсткие правила (нарушать НЕЛЬЗЯ)

- ❌ **`pytest` запрещён** → `common.runner.TestRunner` + `SkipTest` (правило 04).
- ❌ **CMake** не трогать без явного OK Alex (правило 12). SQL-миграции OK.
- ❌ **Worktree:** писать ТОЛЬКО в `e:/DSP-GPU/`, не в `.claude/worktrees/*/` (правило 03).
- ❌ **Git push/tag** — только по явному OK Alex (правило 02).
- ❌ **`std::cout`/`printf`** — не в этом таске (он Python), но если правишь C++ → `ConsoleOutput::GetInstance()`.
- ✅ **Не плодить сущности**: расширяй `cpp_extras.py` / `rag_hybrid.py`, не создавай дубликат.
- ✅ **Tool registration** — обязательно в 3 местах: `tools.py` + `http_api.py` + `mcp_server.py`.

## 7. Артефакты (что должно появиться/измениться)

| Файл | Действие |
|------|----------|
| `dsp_assistant/indexer/cpp_extras.py` | +parse_inheritance, +parse_uses_type, +parse_throws |
| `dsp_assistant/indexer/extras_build.py` | +UPSERT для новых kind |
| `dsp_assistant/agent/tools/dsp_graph_neighbors.py` | НОВЫЙ |
| `dsp_assistant/agent/tools/dsp_inheritance.py` | НОВЫЙ |
| `dsp_assistant/agent/tools.py` | +2 ToolSpec в TOOL_REGISTRY |
| `dsp_assistant/server/mcp_server.py` | +2 `@mcp.tool()` обёртки |
| `dsp_assistant/server/http_api.py` | +2 endpoint'а |
| `dsp_assistant/retrieval/rag_hybrid.py` | +`level` параметр в `query()` |
| `dsp_assistant/migrations/2026-05-XX_deps_index.sql` | (опц.) индекс `deps(src_id, kind)` |

## 8. По завершении

1. Обновить `MemoryBank/tasks/TASK_RAG_graph_extension_2026-05-08.md` → пометить DoD-чекбоксы ✅.
2. Обновить `MemoryBank/tasks/IN_PROGRESS.md` (короткий указатель).
3. Сессионный отчёт → `MemoryBank/sessions/YYYY-MM-DD.md`.
4. Если в таске `TASK_RAG_context_pack` уже идёт работа — сообщить что G3+G4 готовы (siblings можно
   подключать).
5. **НЕ** делать git push/tag без OK.

---

*Maintained by: Кодо · 2026-05-08 · self-contained prompt для следующей сессии*
