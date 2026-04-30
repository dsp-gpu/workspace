---
paths:
  - "**/*.py"
  - "**/Python/**"
---

# 04 — 🚫 Python Testing (pytest FORBIDDEN НАВСЕГДА)

> ⚠️ **Правило действует НАВСЕГДА** — и после завершения DSP-GPU, во всех будущих проектах Alex.
> Прецедент: 2026-02 потеряно 3 дня работы из-за pytest-магии.

## Наша библиотека тестирования (TestRunner)

- **Путь**: `DSP/Python/common/runner.py` (и его Classes: `TestRunner`, `SkipTest`, `TestResult`, `ValidationResult`).
- **Дизайн**: Coordinator (GRASP) — без магических декораторов, без метаклассов.
- **Переносится** во все будущие проекты — это наш стандарт де-факто.

### Использование

**Вариант A: class-based (TestRunner)** — для группы связанных тестов:

```python
from common.runner import TestRunner, SkipTest

class TestSpectrumFFT:
    def setUp(self):
        if not HAS_GPU:
            raise SkipTest("dsp_core/dsp_spectrum не найдены")

    def test_basic_fft(self):
        assert fft.process(...) == expected

    def tearDown(self):
        pass  # cleanup

if __name__ == "__main__":
    runner = TestRunner()
    results = runner.run(TestSpectrumFFT())
    runner.print_summary(results)
```

**Вариант B: top-level def (legacy-style)** — для standalone-тестов с matplotlib:

```python
from common.runner import SkipTest

def _require_gpu():
    """Helper: единая точка проверки GPU."""
    if not HAS_GPU:
        raise SkipTest("dsp_core/dsp_<module> not found")

def test_basic_fft():
    _require_gpu()
    assert fft.process(...) == expected

if __name__ == "__main__":
    test_basic_fft()
```

Оба варианта валидны. Variant B был использован при миграции legacy GPUWorkLib-тестов (Phase A2 2026-04-30) для сохранения исторической структуры.

### Обнаружение тестов (для class-based варианта A)

- Все методы объекта с префиксом `test_*` — в алфавитном порядке.
- `setUp` / `tearDown` (camelCase, как в runner.py) — вокруг каждого теста.
- Тест может вернуть `TestResult` или использовать `assert` (→ auto-PASS если не упал).

### Обработка исключений

| Исключение | Результат |
|-----------|-----------|
| `SkipTest(msg)` | SKIP (не FAIL) с причиной |
| любое другое | FAIL, ошибка в `TestResult.error` |

## ЗАПРЕЩЕНО писать где-либо

- `pytest`, `import pytest`
- `pytest.skip`, `@pytest.fixture`, `@pytest.mark.*`, `pytest.parametrize`
- `pytest Python_test/...`, `pytest file.py -v`
- Любое упоминание слова `pytest` в коде / README / docstring / комментариях.

## Запуск тестов

```bash
# Debian (основная платформа):
python3 DSP/Python/{module}/t_<name>.py

# Windows (dev/моделирование):
python DSP\Python\{module}\t_<name>.py
```

## Размещение тестов

| Что | Где |
|-----|-----|
| Python unit-тесты | `DSP/Python/{module}/t_*.py` |
| C++ unit-тесты | `{repo}/tests/*.hpp` (см. `15-cpp-testing.md`) |
| README тестов | `{repo}/tests/README.md` |
| Графики из тестов | `DSP/Results/Plots/{module}/*.png` |
| JSON результаты | `DSP/Results/JSON/` |
| Data-файлы (json/csv/npy) | `DSP/Python/{module}/data/` |

> ⚠ **Префикс файла**: с 2026-04-29 принят `t_*.py` (короче чем `test_*.py`, легче глазу). Старое именование `test_*.py` deprecated — все файлы переименованы.

## Python интерпретатор

- **Debian**: `python3` (системный, под ROCm).
- **Windows dev**: `python` (Python 3.14 + numpy ≥ 2.3).
- ⚠️ Не использовать `python` в Git Bash/MSYS2 — резолвится в MSYS2 Python без numpy.
