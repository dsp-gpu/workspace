# 14 — Python Style (rag-mentor)

> **paths:** `rag_mentor/**`, `tests/**`

## Базовое

- Python ≥ 3.11
- Pathlib для всех путей (`from pathlib import Path`). Никаких `os.path.join`.
- Type hints везде (`def f(x: int) -> str:`). Postpone-eval имена: `from __future__ import annotations`.
- Loguru вместо stdlib `logging`.
- Tенью переменных избегать.

## SOLID-принципы

| Принцип | Применение в rag-mentor |
|---------|------------------------|
| **S**ingle responsibility | Один файл — одна роль. `oracle/retrieval.py` ≠ `oracle/reasoner.py` |
| **O**pen-closed | Новые типы issues в comparator — extend `IssueCategorizer`, не править |
| **L**iskov substitution | `rag_pao_client/{rest,mcp}_client.py` — одинаковый интерфейс |
| **I**nterface segregation | Маленькие протоколы (`Protocol`) для роли |
| **D**ependency injection | Через `__init__(self, config: StackConfig)` — никаких global'ов |

## Структура пакета

```python
# rag_mentor/oracle/__init__.py
from .retrieval import MentorDbRetriever
from .reasoner import OracleReasoner
from .fallback import GoldenSetFallback

__all__ = ["MentorDbRetriever", "OracleReasoner", "GoldenSetFallback"]
```

## Naming

- snake_case для функций/переменных
- PascalCase для классов
- UPPER_CASE для констант (`MAX_RETRIES = 3`)
- Префикс `_` для приватного
- Префикс `I` НЕ используем (не Java) — пишем `Reranker(Protocol)`

## Tests

```python
# tests/test_comparator.py — НЕ pytest!
from common.runner import TestRunner, AssertionGroup

class ComparatorTests(TestRunner):
    def test_diff_basic(self) -> AssertionGroup:
        ...
        return g
```

См. `04-testing-python.md`.

## Линт

```bash
ruff check rag_mentor/
mypy rag_mentor/
```

`pyproject.toml` уже настроен (line-length=110, ruff rules E/F/W/I/N/UP/B/SIM/RET).

## Запреты

- `from xxx import *`
- `lambda` для не-trivial логики (>30 chars)
- bare `except:` (нужен `except Exception as e`)
- `print()` (только Loguru `logger.info()`)
- mutable default args (`def f(x=[])`)

## Async

- FastAPI endpoints — `async def`
- HTTP клиенты — `httpx.AsyncClient`
- БД — `psycopg` (sync для простых) или `asyncpg` для batch
