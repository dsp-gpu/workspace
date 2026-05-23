# 17 — 🌟 Access Modes (server side `nda_guard`, D25)

> Серверная сторона D25 — реализация `check_access(target, endpoint, mode) -> bool`.
> Mentor side описан в `rag-mentor/MemoryBank/.claude/rules/17-access-modes.md`.

## Что делает rag-pao

Когда mentor вызывает любой REST endpoint, **FastAPI middleware** прогоняет запрос через `nda_guard.check_access`:

```python
# rag_pao/core/access_control/nda_guard.py

SAFE_ENDPOINTS = {
    "/health",
    "/search",
    "/show_signature",
    "/show_symbols",
    "/run_filler",
    "/run_judge",
    "/save_rag",
}

DEBUG_ONLY_ENDPOINTS = {
    "/show_file",
    "/show_journal",
    "/dump_target",
}


def check_access(target: str, endpoint: str, mode: str) -> bool:
    """True если Кодо может вызвать endpoint."""
    if mode == "production":
        return endpoint in SAFE_ENDPOINTS              # forced safe-only

    cfg = load_targets_yaml()["targets"][target]
    if cfg["codo_access"] == "full":
        return True                                    # debug + full = всё

    return endpoint in SAFE_ENDPOINTS                  # debug + rest-only = safe
```

## FastAPI middleware

```python
# rag_pao/core/api/rest/middleware.py
from fastapi import Request, HTTPException

@app.middleware("http")
async def access_control(request: Request, call_next):
    target = request.headers.get("X-RAG-Target") or ENV.RAGCTL_TARGET
    endpoint = request.url.path
    mode = load_targets_yaml()["mode"]

    if not check_access(target, endpoint, mode):
        raise HTTPException(
            status_code=403,
            detail=f"Endpoint {endpoint} not allowed for {target} in mode={mode}"
        )

    response = await call_next(request)
    return response
```

## Output sanitization (production)

В production-режиме output `/run_filler` дополнительно пропускается через sanitizer:
```python
# rag_pao/core/access_control/sanitizer.py
def sanitize_output(qwen_out: dict, target: str, mode: str) -> dict:
    if mode != "production":
        return qwen_out

    # Удалить любые упоминания internal file paths
    qwen_out = redact_paths(qwen_out, target)

    # Удалить раскрытие implementation details (если Qwen скопировал raw C++)
    qwen_out = redact_implementation(qwen_out)

    return qwen_out
```

## Тесты

```python
# tests/test_nda_guard.py — НЕ pytest, наш TestRunner
class NDAGuardTests(TestRunner):

    def test_debug_full_allows_show_file(self) -> AssertionGroup:
        g = AssertionGroup("nda_guard.debug.full")
        g.add(check_access("pao_contrib", "/show_file", "debug") == True,
              "pao_contrib full + debug — show_file allowed")
        return g

    def test_debug_rest_only_blocks_show_file(self) -> AssertionGroup:
        g = AssertionGroup("nda_guard.debug.rest_only")
        g.add(check_access("pao_xxxx_acme", "/show_file", "debug") == False,
              "pao_xxxx_acme rest-only + debug — show_file forbidden")
        return g

    def test_production_blocks_show_file_everywhere(self) -> AssertionGroup:
        g = AssertionGroup("nda_guard.production")
        g.add(check_access("pao_contrib", "/show_file", "production") == False)
        g.add(check_access("pao_xxxx_acme", "/show_file", "production") == False)
        return g
```

## Logging

Каждый отказ → лог в Loguru + запись в `eval_runs.access_denials`:
```python
logger.warning(f"403 denied: target={target} endpoint={endpoint} mode={mode} codo_access={cfg.codo_access}")
pg.execute("INSERT INTO eval_runs.access_denials(target, endpoint, mode, ts) VALUES(%s,%s,%s,now())", ...)
```

## Что Кодо ожидает с server side

| Mode | Запрос | Ответ |
|------|--------|-------|
| debug + full | `/show_file` | 200 + file content |
| debug + full | `/run_filler` | 200 + Qwen JSON |
| debug + rest-only | `/show_file` | **403 Forbidden** |
| production + любой | `/show_file` | **403 Forbidden** |
| production + любой | `/run_filler` | 200 + Qwen JSON (sanitized) |

См. также `rag-mentor side` rule + `MemoryBank/specs/04_policies_v0.3.md §E`.
