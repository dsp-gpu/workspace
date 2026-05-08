# TASK_RAG_mcp_atomic_tools — 4 atomic MCP tools

> **Этап:** CONTEXT-FUEL (C5 + C6) · **Приоритет:** 🟠 P1 · **Effort:** ~1.5 ч · **Зависимости:** TASK_RAG_test_params_fill (C1), TASK_RAG_doxygen_test_parser (C2)
> **Координатор:** `TASK_RAG_context_fuel_2026-05-08.md`

## 🎯 Цель

Добавить 4 atomic MCP-tool в `dsp-asst` для **прямого доступа** LLM к специализированным
RAG-таблицам. Это вариант **X (agentic 2026)** — LLM сама вызывает нужные tools параллельно.
`dsp_context_pack` (orchestrator, вариант Y) — отдельный TASK_RAG_context_pack.

## 📋 Tools

### C5 — `dsp_test_params(class, method=None)` (~30 мин)

**Возврат:** structured JSON с edge_values, constraints, throw_checks, return_checks для одного класса/метода.

```python
# tools/dsp_test_params.py
def dsp_test_params(class_fqn: str, method: str | None = None) -> dict:
    """
    Если method=None → все методы класса.
    Иначе — только указанный.
    """
    rows = db.fetch("""
        SELECT method_name, param_name, edge_values, constraints,
               throw_checks, return_checks, linked_use_cases, confidence
        FROM rag_dsp.test_params
        WHERE class_fqn = %s
          AND (%s IS NULL OR method_name = %s)
        ORDER BY method_name, param_name
    """, [class_fqn, method, method])
    return {"class": class_fqn, "params": [...]}
```

Регистрация в `dsp_assistant/agent/tools.py` + MCP server.

### C6 — `dsp_use_case(query)` + `dsp_pipeline(name)` (~1 ч)

**`dsp_use_case(query, repo=None, top_k=5)`:**
```python
# Hybrid retrieval по rag_dsp.use_cases (после C3 sparse работает)
# Возврат: список use_case с {title, body, synonyms_ru, synonyms_en, primary_class}
```

**`dsp_pipeline(name=None, query=None, top_k=3)`:**
```python
# Если name → exact match по slug
# Если query → hybrid retrieval по pipelines
# Возврат: список с {title, when_to_use, composer_class, chain_classes, chain_repos, ascii_flow}
```

Регистрация — там же.

## ✅ DoD

- [ ] `dsp_test_params(class_fqn="fft_processor::FFTProcessorROCm")` возвращает edge_values+constraints+throw_checks для всех методов
- [ ] `dsp_test_params(class_fqn=..., method="ProcessComplex")` возвращает только ProcessComplex
- [ ] `dsp_use_case(query="FFT batch")` возвращает топ-5 use_case с body
- [ ] `dsp_pipeline(name="antenna_processor_pipeline")` возвращает chain_classes
- [ ] `dsp_pipeline(query="радар")` hybrid retrieval работает
- [ ] Все 4 tool зарегистрированы в MCP server, видны в `dsp-asst mcp list-tools`
- [ ] Continue VSCode видит их в Agent mode

## Артефакты

- `dsp_assistant/agent/tools/dsp_test_params.py`
- `dsp_assistant/agent/tools/dsp_use_case.py`
- `dsp_assistant/agent/tools/dsp_pipeline.py`
- Обновление `dsp_assistant/agent/tools.py` (registry)
- Smoke-test через `dsp-asst mcp call dsp_test_params --class FFTProcessorROCm`

## Связано

- Координатор: `TASK_RAG_context_fuel_2026-05-08.md`
- Зависимости: `TASK_RAG_test_params_fill` (C1) + `TASK_RAG_doxygen_test_parser` (C2)
- Парный: `TASK_RAG_context_pack_2026-05-08.md` (orchestrator поверх этих atomic tools)
- Spec 13 §3.8 — Tools roadmap

*Maintained by: Кодо · 2026-05-08*
