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

## Связь с правилом 17

`17-access-modes.md` детализирует когда какой mode используется и как flip'ать debug → production.
