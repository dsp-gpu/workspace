# 09 — rag-pao Contract (REST + MCP, 2 режима)

> **paths:** `rag_mentor/rag_pao_client/**`

## Контракт = REST primary + MCP гибрид (D2)

| Канал | Когда | Где |
|-------|-------|-----|
| **REST** (FastAPI :8080) | Primary — все production вызовы | `rag_mentor/rag_pao_client/rest_client.py` |
| **MCP** | Debug only (interactive Claude Code) | `rag_mentor/rag_pao_client/mcp_client.py` |

## Endpoint каталог

| Endpoint | Debug | Production | NDA rest-only | Описание |
|----------|-------|------------|---------------|----------|
| `GET /health` | ✅ | ✅ | ✅ | health probe |
| `POST /search` | ✅ | ✅ | ✅ | hybrid retrieval с фильтром (license + nda_level + layer) |
| `GET /show_signature` | ✅ | ✅ | ✅ | сигнатура класса/метода (без implementation) |
| `GET /show_symbols` | ✅ | ✅ | ✅ | список имён (для allow-list) |
| `POST /run_filler` | ✅ | ✅ (sanitized output) | ✅ | Qwen filler |
| `POST /run_judge` | ✅ | ✅ | ✅ | Qwen judge |
| `POST /save_rag` | ✅ | ✅ | ✅ | save artefact в `.rag/<target>/Lx/` |
| `GET /show_file` | ✅ | ❌ | ❌ | **DEBUG ONLY**: raw C++ |
| `GET /show_journal` | ✅ | ❌ | ❌ | **DEBUG ONLY**: journal класса |
| `POST /dump_target` | ✅ | ❌ | ❌ | **DEBUG ONLY**: dump всех файлов |

Source of truth — `04-policies_v0.3.md §C`.

## Reaction Кодо на 403 Forbidden

Если `/show_file` возвращает 403:
- mode = production: это **ожидаемо**. Используй `/show_signature` + `/show_symbols`.
- mode = debug + codo_access=rest-only: это **ожидаемо**. То же.
- mode = debug + codo_access=full + 403: **ошибка инфры** — сообщить Alex'у.

## Retry policy

```python
# rag_pao_client/rest_client.py
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
def call_rest(endpoint, **kwargs): ...
```

Никаких retry на 4xx (это не транзиентная ошибка) — только 5xx + network.

## MCP — только для debug

`.mcp.json`:
```json
{
  "mcpServers": {
    "rag-pao": {
      "command": "python",
      "args": ["-m", "rag_pao.core.api.mcp.server"],
      "env": {
        "RAG_PAO_URL": "${RAG_PAO_URL}",
        "RAG_PAO_TARGET": "${RAGCTL_TARGET}",
        "RAG_PAO_MODE": "${RAG_PAO_MODE}"
      }
    }
  }
}
```

MCP — это **wrapper** над REST. Под капотом дёргает те же endpoints с теми же policy. **`nda_guard` применяется на стороне сервера**, MCP-клиент не может обойти.

## AccessAwareMixin (D36 — LSP-correct)

Чтобы `RestClient.show_file()` и `MCPClient.show_file()` вели себя одинаково (не нарушали LSP) — общая логика pre-check вынесена в **mixin**:

```python
# rag_mentor/rag_pao_client/base.py
class AccessAwareMixin:
    """Pre-check на клиентской стороне. Server side (nda_guard) — second line of defense."""

    mode: AccessMode

    def _check_access(self, method_name: str) -> None:
        """Raise NotAllowedInProduction если method не в safe-list."""
        SAFE = {"search", "run_filler", "run_judge", "show_signature",
                "show_symbols", "save_rag", "health"}
        if self.mode == AccessMode.PRODUCTION and method_name not in SAFE:
            raise NotAllowedInProduction(method_name)


class RestClient(AccessAwareMixin, RagPaoClient):
    def show_file(self, path: str) -> str:
        self._check_access("show_file")     # 🔒 pre-check — fail fast
        return self._http_get("/show_file", params={"path": path}).text


class MCPClient(AccessAwareMixin, RagPaoClient):
    def show_file(self, path: str) -> str:
        self._check_access("show_file")     # 🔒 тот же pre-check — LSP-correct
        return self._mcp_call("show_file", {"path": path})
```

**Защита в 2 уровня (defense in depth)**:
1. Client-side `AccessAwareMixin._check_access()` — fail fast перед HTTP/MCP вызовом
2. Server-side `nda_guard.check_access()` — final authority, не может быть обойдено клиентом

## Связь с правилом 17

`17-access-modes.md` детализирует когда какой mode используется и как flip'ать debug → production.
