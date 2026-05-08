# TASK_RAG_graph_extension — базовый граф знаний (G1-G5)

> **Этап:** GRAPH · **Приоритет:** 🟠 P1 · **Effort:** ~9 ч · **Зависимости:** none (call-graph G2 = Phase B+ через clangd на Debian)
> **Координатор:** `TASK_RAG_context_fuel_2026-05-08.md`

## 🎯 Цель

Расширить граф знаний `rag_dsp.deps` (сейчас только `kind ∈ {includes, pybind, cmake_link}`) до **базового GraphRAG**: inheritance + uses_type + parameter + throws + tools + LightRAG dual-level.

**Call-graph (`kind=calls`)** требует clangd LSP — ОТЛОЖЕН на Phase B+ (Debian, не Windows).

## 📋 Подэтапы

### G1 — Inheritance tree (~1.5 ч)

`dsp_assistant/indexer/cpp_extras.py`:

```python
def extract_inheritance(node: TSNode) -> list[tuple[str, str]]:
    """Парсит '`class Foo : public Bar, private Baz`' → [(Foo, Bar), (Foo, Baz)]"""
```

UPSERT в `rag_dsp.deps(src_id, dst_id, kind='inherits')`.

Smoke: `IBackend` имеет ≥3 наследников; `IGpuOperation` ≥5.

### G2 — `uses_type` / `throws` / `parameter` / `returns` (~2 ч)

Через extractor — **без clangd** (синтаксические эвристики):

| Edge kind | Источник | Пример |
|-----------|----------|--------|
| `parameter` | сигнатура метода | `Process(BufferSet<2>& bs)` → edge (Process, BufferSet) |
| `returns`   | возвращаемый тип | `BufferSet<2> Build()` → edge (Build, BufferSet) |
| `uses_type` | тело метода `T x = ...` | `auto cfg = SpectrumConfig{...}` → edge |
| `throws`    | `@throws` doxygen + `throw std::X(...)` в .cpp | edge (method, exception_type) |

**Не делаем `calls`** — без clangd получится много ошибок (overload resolution, шаблоны).

### G3 — Tool `dsp_graph_neighbors(symbol, depth, edge_types)` (~2 ч)

```python
def dsp_graph_neighbors(
    fqn: str,
    depth: int = 1,
    edge_types: list[str] = ("includes", "inherits", "parameter", "uses_type"),
    direction: Literal["out", "in", "both"] = "out",
) -> dict:
    """BFS в rag_dsp.deps. Возврат: tree-structured список соседей по типам рёбер."""
```

Регистрация в MCP server.

**Бенч:** depth=2 на классе с ~30 рёбрами → <300ms p99.

### G4 — Tool `dsp_inheritance(fqn)` (~30 мин)

```python
def dsp_inheritance(fqn: str) -> dict:
    """
    Возврат: {
      "fqn": ...,
      "parents": [...],          # рекурсивно вверх
      "children": [...],         # рекурсивно вниз
      "siblings": [...]          # other children of parents
    }
```

Регистрация в MCP.

### G5 — LightRAG dual-level retrieval (~3 ч)

`dsp_assistant/retrieval/rag_hybrid.py` — добавить параметр `level`:

```python
def hybrid_search(query, level: Literal["low", "high", "both"] = "both", top_k=5):
    if level == "high":
        # high-level: pipelines + use_cases (концепты, репо-уровень)
        return search_in([pipelines, use_cases], query)
    if level == "low":
        # low-level: symbols + test_params (классы, методы)
        return search_in([symbols, test_params], query)
    # both: cascade — high → если high.score < threshold → low
    high = search_in([pipelines, use_cases], query, top_k=3)
    if high[0].score < 0.5:
        return search_in([symbols, test_params], query, top_k=top_k)
    return high
```

Smoke: запрос «pipeline для радара» → `level=high` → `RadarPipeline`/`fm_correlator_pipeline`, не их методы.

## ✅ DoD

### G1
- [ ] `rag_dsp.deps(kind='inherits')` ≥ 50 рёбер
- [ ] `IBackend` имеет ≥3 наследников; `IGpuOperation` ≥5

### G2
- [ ] `parameter` / `returns` / `uses_type` / `throws` рёбер ≥ 200 каждое
- [ ] `MeanReductionOp::Process` имеет ребро `parameter → BufferSet<2>`

### G3
- [ ] `dsp_graph_neighbors(fqn="ScopedHipEvent", depth=2)` <300ms p99
- [ ] BFS обходит includes/inherits/uses_type/parameter

### G4
- [ ] `dsp_inheritance(IBackend)` возвращает 2 списка
- [ ] Зарегистрирован в MCP

### G5
- [ ] `dsp_search(level="high")` приоритизирует pipelines+use_cases
- [ ] Cascade-логика работает: high→low fallback по threshold

## ⚠️ Риск G2 — синтаксические эвристики

Без clangd `parameter`/`uses_type` могут давать false positives на templates / overloads. Риск приемлем (precision ~85%, recall ~95%) — для GraphRAG retrieval лучше иметь больше связей. Точный call-graph = G2-calls в Phase B+.

## Артефакты

- `dsp_assistant/indexer/cpp_extras.py` — extract_inheritance, extract_uses_type
- `dsp_assistant/agent/tools/dsp_graph_neighbors.py`
- `dsp_assistant/agent/tools/dsp_inheritance.py`
- `dsp_assistant/retrieval/rag_hybrid.py` — `level` параметр

## Связано

- Координатор: `TASK_RAG_context_fuel_2026-05-08.md`
- Опционально потребляется: `TASK_RAG_context_pack` (C7) — `siblings` через G3
- Phase B+ продолжение: `TASK_RAG_agentic_loop` — там G-calls через clangd
- Spec 13 §3.7-3.8 — Graph + Tools

*Maintained by: Кодо · 2026-05-08*
