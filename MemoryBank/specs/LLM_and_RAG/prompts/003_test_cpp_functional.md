# 003 — Написать C++ функциональный тест (`test_*.hpp`)

## Цель
Сгенерировать C++ функциональный тест для одного класса DSP-GPU **в стиле проекта**: `inline void run()` + C++ `TestRunner runner` + lambda-кейсы.

## Когда использовать
- Режим `test`. Пользователь говорит «напиши C++ тест для FFTProcessorROCm» (НЕ Python обёртку).
- Образец живёт в `<repo>/tests/test_*_rocm.hpp`.

## Вход
- `{class_summary}` — JSON из промпта 001.
- `{example_test}` — содержимое одного похожего `test_*_rocm.hpp` (для копирования стиля).
- `{test_params}` — JSON граничных значений из `test_params/<repo>_<class>.json` (если есть).
- `{user_hint}` — что тестировать (smoke / эталон / граничные / все).

---

## Системный промпт

```
Ты пишешь C++ функциональные тесты для проекта DSP-GPU.

ПРАВИЛА (нарушение = ошибка):
1. Файл — заголовок (.hpp), начинается с #pragma once + doxygen-блок.
2. Защита #if ENABLE_ROCM ... #endif вокруг всего тела.
3. Включения: тестируемый класс + ROCmBackend + modules/test_utils/test_utils.hpp.
4. namespace test_<repo>_<class_snake> { ... } — изолирующий namespace.
5. inline void run() — точка входа теста (вызывается из main.cpp).
6. Получение device: int device_count = ROCmCore::GetAvailableDeviceCount(); if 0 — early return с ConsoleOutput сообщением.
7. ROCmBackend backend; backend.Initialize(gpu_id);
8. TestRunner runner(&backend, "<TestName>", gpu_id);
9. Каждый тест-кейс: runner.test("name", [&]() -> TestResult { ... return ... ; });
10. Сравнение через gpu_test_utils:: или вручную с EPS = 1e-5f.
11. НЕ использовать std::cout / std::cerr / printf — только ConsoleOutput::GetInstance().Print(gpu_id, "tag", "msg").
12. НЕ использовать GPUProfiler — это deprecated. Если нужно профилирование — это другой жанр (бенчмарк, промпт 004).
13. Все эталоны через refs::Generate*() из test_utils.
14. На неизвестное API — комментарий // TODO: уточнить, не выдумывай методы.

ВЫВОД: только C++-код файла .hpp. Без markdown-обёртки.
```

## Шаблон пользовательского сообщения

```
Класс для теста (JSON):
{class_summary}

Эталонный пример (стиль файла):
```cpp
{example_test}
```

Граничные значения (если заполнены):
{test_params}

Подсказка от пользователя:
{user_hint}

Сгенерируй файл `test_{class_name_snake}_rocm.hpp` с smoke-тестом + 1-2 теста на граничные значения из test_params.
```

## Формат вывода
Голый C++-код. Никаких пояснений, никаких \`\`\`cpp обёрток.

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
  "public_methods": [
    {"name": "MovingAverageFilterROCm", "args": "size_t window_size",                    "returns": "",     "doxygen": "Конструктор."},
    {"name": "Process",                  "args": "const float* in, float* out, size_t n", "returns": "void", "doxygen": "Применяет фильтр."}
  ],
  "depends_on": ["dsp_core::ROCmBackend"]
}
```

**ВВОД (`test_params`):**
```json
{"window_size": {"edge_values": {"typical": [8, 32], "edge": [1]}, "constraints": {"min": 1}}}
```

**ВЫВОД:**
```cpp
#pragma once
/**
 * @file test_moving_average_rocm.hpp
 * @brief Smoke + edge tests для MovingAverageFilterROCm
 *
 * Tests:
 * 1. smoke_window_8       — фильтр window=8 даёт массив той же длины
 * 2. window_1_equals_input — window=1 → out == in
 *
 * @author dsp-asst (Qwen 8B + RAG)
 * @date 2026-04-30
 */

#if ENABLE_ROCM

#include <spectrum/moving_average_filter_rocm.hpp>
#include <core/backends/rocm/rocm_backend.hpp>
#include <core/services/console_output.hpp>

#include "modules/test_utils/test_utils.hpp"

#include <vector>

namespace test_moving_average_rocm {

using namespace filters;
using namespace drv_gpu_lib;
using namespace gpu_test_utils;

inline void run() {
  int gpu_id = 0;

  int device_count = ROCmCore::GetAvailableDeviceCount();
  if (device_count == 0) {
    ConsoleOutput::GetInstance().Print(gpu_id, "MovingAvg ROCm", "[!] No ROCm devices -- skip");
    return;
  }

  ROCmBackend backend;
  backend.Initialize(gpu_id);

  TestRunner runner(&backend, "MovingAvg ROCm", gpu_id);

  // ── Test 1: smoke window=8 — длина выхода равна длине входа ────
  runner.test("smoke_window_8", [&]() -> TestResult {
    constexpr size_t N = 1024;
    std::vector<float> in(N, 1.0f);
    std::vector<float> out(N, 0.0f);

    MovingAverageFilterROCm flt(8);
    flt.Process(in.data(), out.data(), N);

    if (out.size() != in.size()) {
      return TestResult::Fail("size mismatch");
    }
    return TestResult::Pass();
  });

  // ── Test 2: window=1 → out == in (граница из test_params) ──────
  runner.test("window_1_equals_input", [&]() -> TestResult {
    constexpr size_t N = 256;
    auto in = refs::GenerateSinusoid(100.0f, 1000.0f, N);
    std::vector<float> out(N, 0.0f);

    MovingAverageFilterROCm flt(1);
    flt.Process(in.data(), out.data(), N);

    constexpr float EPS = 1e-5f;
    for (size_t i = 0; i < N; ++i) {
      if (std::fabs(out[i] - in[i]) > EPS) {
        return TestResult::Fail("mismatch at i=" + std::to_string(i));
      }
    }
    return TestResult::Pass();
  });
}

} // namespace test_moving_average_rocm

#endif // ENABLE_ROCM
```

---

## Анти-паттерны (что модель НЕ должна делать)

- ❌ `std::cout`, `std::cerr`, `printf`, `fprintf` — только `ConsoleOutput::GetInstance().Print(...)`.
- ❌ `class TestX : public BaseClass` — функциональный тест НЕ наследует. Это `inline void run()`.
- ❌ `GPUProfiler`, `gpu_profiler.hpp` — это deprecated. Если нужно профилирование — пиши бенчмарк (промпт 004).
- ❌ `using namespace std;` — не делай.
- ❌ `#include <iostream>` — для вывода используй ConsoleOutput.
- ❌ `int main()` — точка входа = `inline void run()`, вызывается из общего main.cpp репо.
- ❌ Имя `test_X.cpp` — должно быть `test_X_rocm.hpp` (заголовок).
- ❌ Выдумывать методы класса. Если в `class_summary` нет `Process` — не вызывай. Пиши TODO.

---

## Граничные случаи входа

- **Класс без публичного API** → пропуск, ответ-комментарий «// Класс не имеет публичных методов, тест не пишется».
- **Шаблонный класс** `template<typename T>` → инстанцировать `T = float` по умолчанию.
- **Deprecated класс** (`is_deprecated: true`) → отказ, комментарий «// @deprecated».
- **`test_params` пуст или null** → smoke-тест с типичными значениями (N=1024, и т.п.) + TODO-комментарий «// TODO: добавить edge cases в test_params».

---

*Конец промпта 003.*
