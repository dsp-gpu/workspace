# 04 — Testing Python (NO pytest)

> **paths:** `tests/**`, `rag_mentor/**/tests/**`
> Правило критическое — нарушение = потеря работы Alex (прецедент DSP-GPU).

## 🚫 ЗАПРЕЩЕНО

- `import pytest`
- `pytest.fixture`, `pytest.mark.*`, `pytest.raises`
- `conftest.py`
- `pyproject.toml [tool.pytest.*]`

**Любой `pytest`-вызов в коде = немедленно убрать.**

## ✅ Замена — `TestRunner + SkipTest`

```python
# tests/test_oracle.py
from common.runner import TestRunner, SkipTest, AssertionGroup

class OracleTests(TestRunner):

    def setup(self):
        self.oracle = Oracle(config=self.test_config())

    def test_basic_retrieval(self) -> AssertionGroup:
        result = self.oracle.retrieve("какой паттерн у HybridBackend?")
        g = AssertionGroup("oracle.basic")
        g.add(result is not None, "result must not be None")
        g.add("Bridge" in result.text, "must mention Bridge")
        return g

    def test_skip_if_no_mentor_db(self) -> AssertionGroup:
        if not is_postgres_alive():
            raise SkipTest("mentor_db not running — skip oracle test")
        # ...

if __name__ == "__main__":
    OracleTests().run_all()
```

## Главный runner

```python
# tests/all_test.py
from tests.test_oracle import OracleTests
from tests.test_comparator import ComparatorTests
from tests.test_critic import CriticTests
from tests.test_name_validator import NameValidatorTests

if __name__ == "__main__":
    for cls in [OracleTests, ComparatorTests, CriticTests, NameValidatorTests]:
        cls().run_all()
```

## Запуск

```bash
python tests/all_test.py
# или single suite:
python tests/test_oracle.py
```

## Почему НЕ pytest

- pytest fixtures скрывают setup/teardown — отладка сложнее
- pytest plugins ломаются между версиями
- pytest mock'и часто маскируют реальные баги
- TestRunner — наш, контролируем полностью

## ✅ Allowed dev tools

- `ruff` (lint)
- `mypy` (type check)
- `coverage.py` standalone (без pytest-cov)
