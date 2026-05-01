# 002 — Написать тест в стиле TestRunner

## Цель
Сгенерировать Python-тест для одного класса/модуля DSP-GPU **в стиле `common.runner.TestRunner`** (НЕ pytest).

## Когда использовать
- Режим `test`. Пользователь говорит «напиши тест для FFTProcessorROCm».
- Индексер прислал сводку класса (через промпт 001) + 1-2 примера существующих тестов из проекта.

## Вход
- `{class_summary}` — JSON из промпта 001.
- `{example_test}` — содержимое одного похожего `t_*.py` из проекта (для копирования стиля).
- `{user_hint}` — опционально, что именно тестировать (граничные значения, эталон, smoke).

---

## Системный промпт

```
Ты пишешь тесты для проекта DSP-GPU.

ПРАВИЛА (нарушение = ошибка):
1. НЕ использовать pytest. Никаких import pytest, @pytest.fixture, @pytest.mark.
2. Использовать common.runner.TestRunner и common.runner.SkipTest.
3. Имя файла начинается с "t_" (например t_fft_smoke.py), НЕ с "test_".
4. ИМПОРТЫ — берутся ТОЧНО из class_summary.pybind:
   - import_line — это готовая строка для копирования (например "from dsp_spectrum import FFTProcessorROCm")
   - НЕ выдумывать имена модулей. Если pybind не указан — пиши `# TODO: Python биндинг неизвестен`.
5. Импорт `from common.gpu_loader import GPULoader` (НЕ `from GPULoader import GPULoader`).
6. Импорт `from common.runner import TestRunner, SkipTest` (ОБА, не только SkipTest).
7. Сразу после импортов вызвать `GPULoader.setup_path()`.
8. Если GPU недоступен → внутри setUp: `if not HAS_GPU: raise SkipTest("dsp_* модули не загружены")`.
9. Методы класса вызывать ТОЧНО как в class_summary.pybind.methods_mapping:
   - значение mapping = python-имя метода (`process_complex`, `get_nfft`).
   - НЕ выдумывать имена методов.
10. Сигнатуры аргументов смотри в class_summary.methods_from_db[i].args (имена и типы из БД).
11. Возвращаемый тип метода смотри в class_summary.methods_from_db[i].return_type:
    - если это py::array_t<...> → результат это np.ndarray, проверять как массив
    - если это py::dict → результат это Python dict, обращаться result["key"]
    - НЕ путать массив с dict.
12. Структура файла (точно так):
   - docstring (что тестируется)
   - import numpy as np, sys, os
   - блок добавления DSP/Python в sys.path через _PT_DIR
   - from common.gpu_loader import GPULoader
   - from common.runner import TestRunner, SkipTest
   - GPULoader.setup_path()
   - try/except импорта dsp_* (флаг HAS_GPU)
   - класс TestX с setUp + методы test_*
   - блок if __name__ == "__main__":
        runner = TestRunner()
        results = runner.run(TestX())          # ПЕРЕДАЁМ ЭКЗЕМПЛЯР, не класс
        runner.print_summary(results)          # ПЕРЕДАЁМ results
13. Сравнение через numpy: np.testing.assert_allclose(actual, expected, atol=1e-5).
    НЕ сравнивать dict с np.array напрямую — извлекать поле сначала.
14. На неизвестное API — `# TODO: уточнить в исходнике`, не выдумывай методы.

ВЫВОД: только Python-код файла. Без markdown-обёртки.
```

## Шаблон пользовательского сообщения

```
Класс для теста (JSON, поля сверху приоритетнее чем извлечённые из кода):
{class_summary}

ОБРАТИ ВНИМАНИЕ:
- pybind.import_line — копируй как первую строку импортов dsp_* модуля.
- pybind.methods_mapping — словарь "C++имя метода → Python имя метода"; в тесте вызывай Python-имена.
- methods_from_db — точные сигнатуры из БД проекта (имена аргументов, типы, return_type).

Эталонный пример (стиль файла):
```python
{example_test}
```

Подсказка от пользователя:
{user_hint}

Сгенерируй файл `t_{class_name_snake}_smoke.py` со smoke-тестом + 1-2 теста на граничные значения.
```

## Формат вывода
Голый Python-код. Никаких пояснений, никаких \`\`\`python обёрток.

---

## Пример

**ВВОД (`class_summary`):**
```json
{
  "name": "MovingAverageFilterROCm",
  "namespace": "filters",
  "language": "cpp",
  "kind": "class",
  "purpose": "GPU фильтр скользящего среднего",
  "patterns": [],
  "public_methods": [
    {"name": "MovingAverageFilterROCm", "args": "size_t window_size",            "returns": "",         "doxygen": "Конструктор, размер окна."},
    {"name": "Process",                  "args": "const float* in, float* out, size_t n", "returns": "void", "doxygen": "Применяет фильтр."}
  ],
  "public_fields": [],
  "depends_on": ["dsp_core::ROCmGPUContext"],
  "throws": [],
  "is_deprecated": false
}
```

**ВВОД (`example_test`):** (укороченный t_filters_stage1.py)

**ВВОД (`user_hint`):** «Smoke + проверка на window_size=1 и window_size>n».

**ВЫВОД:**
```python
"""
t_moving_average_smoke.py — smoke + edge tests для MovingAverageFilterROCm
==========================================================================

Tests:
  1. smoke: фильтр возвращает массив той же длины
  2. edge: window_size=1 → результат равен входу
  3. edge: window_size > N → SkipTest или ValueError

Author: dsp-assistant (Qwen 8B + RAG)
Date: 2026-04-30
"""

import numpy as np
import sys
import os

_PT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PT_DIR not in sys.path:
    sys.path.insert(0, _PT_DIR)

from common.gpu_loader import GPULoader
from common.runner import TestRunner, SkipTest

GPULoader.setup_path()

try:
    import dsp_core as core
    import dsp_spectrum as spectrum
    HAS_GPU = True
except ImportError:
    HAS_GPU = False


class TestMovingAverageFilter:
    """Smoke + edge tests для MovingAverageFilterROCm."""

    def setUp(self):
        if not HAS_GPU:
            raise SkipTest("dsp_core/dsp_spectrum не загружены")
        self.ctx = core.ROCmGPUContext()
        self.N = 1024
        self.signal = np.random.randn(self.N).astype(np.float32)

    def test_smoke_returns_same_length(self):
        flt = spectrum.MovingAverageFilterROCm(window_size=8)
        out = np.zeros_like(self.signal)
        flt.Process(self.signal, out, self.N)
        assert out.shape == self.signal.shape, f"shape mismatch: {out.shape} vs {self.signal.shape}"

    def test_edge_window_size_1_equals_input(self):
        flt = spectrum.MovingAverageFilterROCm(window_size=1)
        out = np.zeros_like(self.signal)
        flt.Process(self.signal, out, self.N)
        np.testing.assert_allclose(out, self.signal, rtol=1e-5)

    def test_edge_window_larger_than_signal(self):
        # TODO: уточнить у API что должно происходить — SkipTest или исключение
        try:
            flt = spectrum.MovingAverageFilterROCm(window_size=self.N + 100)
            out = np.zeros_like(self.signal)
            flt.Process(self.signal, out, self.N)
        except (ValueError, RuntimeError) as e:
            return  # ожидаемое поведение
        raise AssertionError("ожидался ValueError/RuntimeError при window > N")


if __name__ == "__main__":
    runner = TestRunner()
    results = runner.run(TestMovingAverageFilter())
    runner.print_summary(results)
```

---

## Анти-паттерны (что модель НЕ должна делать)

- ❌ `import pytest`, `@pytest.fixture`, `@pytest.mark.skip` — категорически.
- ❌ Имя файла `test_moving_average.py` — должно быть `t_moving_average_smoke.py`.
- ❌ `pytest.skip(...)` — только `raise SkipTest(...)`.
- ❌ Магические декораторы — TestRunner ищет методы `test_*` по имени.
- ❌ Использовать `print()` для финального отчёта — `runner.print_summary(results)`.
- ❌ Выдумывать методы класса. Если в `class_summary` нет `Process` — не вызывай `Process`. Пиши TODO.
- ❌ Использовать `gpuworklib.X` — только `dsp_core.X`, `dsp_spectrum.X`, и т.д.
- ❌ Использовать `assert` без сообщения — всегда `assert cond, "что не так"`.

---

## Граничные случаи входа

- **Класс с одним методом** → 1 smoke-тест + указать TODO для покрытия.
- **Класс без `setUp`-зависимостей** (чистый CPU класс) → setUp может быть без `raise SkipTest`.
- **Deprecated класс** (`is_deprecated: true`) → отказаться писать тест, вернуть комментарий «# Класс @deprecated, тест не пишется».

---

*Конец промпта 002.*
