---
paths:
  - "**/tests/**"
  - "**/test_*.hpp"
  - "**/test_*.cpp"
  - "**/all_test.hpp"
---

# 15 — C++ Testing (тот же ООП/SOLID/GRASP стиль)

> C++ тесты — **обычные классы** в том же стиле что основной код.
> Никаких GoogleTest, никаких глобальных `TEST_F`. Стиль кода → `14-cpp-style.md`.
> **Полные шаблоны** → `@MemoryBank/.claude/specs/TestingCpp_Template.md`.

## Дизайн

- **Тест-класс** на каждую единицу: `TestFFTProcessor`, `TestMedianStrategy`.
- Методы `test_*` — один метод = один сценарий.
- **`SetUp` / `TearDown`** (camelCase) — как в Python `TestRunner`.
- Тестовый объект — **реальный** модуль (через `DrvGPU` / `GpuContext`), не мок.

### GRASP / GoF в тестах

- **Information Expert**: сам тест знает как проверить свою единицу.
- **Creator**: тест создаёт свой `GpuContext`.
- **Low Coupling**: тесты одного модуля независимы от других модулей.
- **Fixture** (Template Method) — `SetUp` подготавливает общее состояние.

## Размещение

```
{repo}/tests/
├── README.md          ← описание набора
├── main.cpp           ← точка входа, инклюдит all_test.hpp
├── all_test.hpp       ← список всех test_*.hpp
├── test_{class}.hpp   ← один класс — один файл .hpp (header-only)
└── {module}_benchmark.hpp   ← (опц.) через GpuBenchmarkBase
```

**Файлы тестов — `.hpp`** (header-only), подключаются в `main.cpp` через `all_test.hpp`.

## Ключевые точки

### `all_test.hpp` (список + включение/отключение)

```cpp
#pragma once
#include "test_fft_processor.hpp"
// #include "test_lch_farrow.hpp"   // DISABLED: требует RX 9070

inline void RunAllSpectrumTests() {
    TestFFTProcessor().RunAll();
    // ...
}
```

### Главный `src/main.cpp` (корневой)

**НЕ вызывает тесты напрямую** — только через `all_test.hpp` каждого модуля:

```
src/main.cpp → core/tests/all_test.hpp
             → spectrum/tests/all_test.hpp
             → ...
```

### Полный шаблон `test_*.hpp`

→ `@MemoryBank/.claude/specs/TestingCpp_Template.md`

## Правила хороших тестов

- **Сравнение с эталоном** — FFTW / NumPy / SciPy. Корректность ДО оптимизации.
- **Порог `tol`** — явный, документированный (напр. `1e-5` для `float32`).
- **`ValidationResult`** — с полями `metric_name`, `actual_value`, `threshold`.
- **`SkipTest`** для случаев когда железо не тянет.
- **Async safety** — перед проверкой `hipStreamSynchronize`.

## Валидаторы (`gpu_test_utils::*` — `core/test_utils/validators/`)

Готовые helper'ы вместо ручного epsilon-сравнения. Зеркальный API в Python
(`DSP/Python/common/validators/`).

### Free functions (одна строка)

```cpp
#include "core/test_utils/validators/numeric.hpp"
using gpu_test_utils::MaxRelError;     // max|a-r| / max|r| < tol
using gpu_test_utils::AbsError;        // max|a-r| < tol
using gpu_test_utils::RmseError;       // sqrt(mean((a-r)^2)) / rms(r) < tol
using gpu_test_utils::ScalarRelError;  // |a-e|/|e| < tol для скаляров
using gpu_test_utils::ScalarAbsError;  // |a-e| < tol для скаляров

auto v = MaxRelError(gpu.data(), cpu.data(), gpu.size(),
                     /*tol=*/1e-5, /*name=*/"fft_magnitude");
tr.add(v);  // ValidationResult: passed/metric_name/actual_value/threshold
```

Шаблонные — работают с `float`, `double`, `std::complex<T>`. Для near-zero
reference (rms_ref < 1e-15) переключаются на абсолютную проверку (1e-10).

### Strategy-pattern классы (через DI)

```cpp
RelativeValidator v(1e-5);
tr.add(v.Validate(gpu, cpu, "fft_magnitude"));
```

`AbsoluteValidator`, `RmseValidator` — с тем же интерфейсом `IValidator`.

### Запрет

- ❌ `if (std::abs(a - b) > tol) { fail; }` — плодит баги с near-zero ref.
- ✅ `MaxRelError(a.data(), b.data(), n, tol)` — единый путь, согласованный с Python.

## 🚫 Запрещено

- GoogleTest / Catch2 / другие фреймворки — свой стиль.
- Глобальные функции-тесты без класса — только методы класса.
- Файлы тестов `.cpp` — только `.hpp`.
- `main.cpp` без `all_test.hpp` — не дублировать вызовы.

## Бенчмарки

- `{repo}/tests/{module}_benchmark.hpp` — наследник `GpuBenchmarkBase`.
- Только ROCm-версия.
- Результат → `ProfilingFacade::Export*` (не руками!).
