# TASK — Портирование валидаторов из GPUWorkLib в DSP-GPU

> **Создано**: 2026-05-03
> **Статус**: ≈90% ✅ (2026-05-04 ревизия) — **C++ free functions перенесены, Python независим, правило 15 обновлено**.
> Осталось: раскатить использование `gpu_test_utils::*` по 8 модулям (см. под-таск).
> **Effort**: ~2-3 ч (C++) + 1-2 ч (Python) + 1 ч (тесты) — **выполнено до 2026-05-04**.
> **Платформа**: Debian (RX 9070).

---

## ⚠️ Правки 2026-05-04 (важно — отличие от первоначального плана)

1. **API в C++ — НЕ Strategy-классы**, а **template free functions** (`MaxRelError/AbsError/RmseError/ScalarRelError/ScalarAbsError/CheckPeakFreq/CheckPower`). Strategy-классы (`IValidator/RelativeValidator/AbsoluteValidator/RmseValidator`) **не нужны** — конфиги в C++ тестах хардкодятся, шаблоны заменяют DI. Раздел «Strategy-pattern классы» убран из правила `15-cpp-testing.md`.
2. **Python validators (`DSP/Python/common/validators/`)** — **независимый** инструмент. **Не зеркало** C++. В коде C++ нет include на Python и наоборот. Файловые комменты numeric.hpp / signal.hpp обновлены: «Самостоятельный модуль (не связан с Python)».
3. **Раскатка по модулям** — **отдельная** задача. Создан под-таск-пилот: `TASK_validators_linalg_pilot_2026-05-04.md`. После него — 7 параллельных подтасков для остальных модулей.

---

---

## Зачем

В DSP-GPU `core/test_utils/test_result.hpp` уже есть `ValidationResult/TestResult/SkipTest/PassResult/FailResult`. Не хватает **хелперов-валидаторов** для сравнения с эталоном (NumPy/SciPy/MATLAB) — без них AI-генератор тестов вынужден писать сравнения руками (epsilon-сравнение, RMSE, относительная ошибка), что плодит баги и неконсистентность.

Полная реализация уже есть в legacy `E:\C++\GPUWorkLib\` (48 файлов, C++ ↔ Python зеркальная). Нужно перенести **только нужные части**.

---

## Что нужно сделать

### 1. C++ (cel: `core/test_utils/`)

#### 1.1 Хелперы-функции в `validators.hpp`
```cpp
namespace gpu_test_utils {

/// Максимальная относительная ошибка между двумя векторами (max |a-b| / max |b|).
double MaxRelError(const std::vector<float>&  actual,
                   const std::vector<float>&  expected);
double MaxRelError(const std::vector<double>& actual,
                   const std::vector<double>& expected);
double MaxRelError(const std::vector<std::complex<float>>&  actual,
                   const std::vector<std::complex<float>>&  expected);

/// Абсолютная ошибка max |a-b|.
double AbsError(const std::vector<float>&  actual,
                const std::vector<float>&  expected);
double AbsError(/* перегрузки double, complex */);

/// RMSE = sqrt(mean((a-b)^2)).
double RmseError(/* перегрузки */);

/// Относительная ошибка для скаляров.
double ScalarRelError(double actual, double expected);

} // namespace gpu_test_utils
```

#### 1.2 Validator-классы в `validators.hpp` (Strategy-pattern)
```cpp
class IValidator {
public:
  virtual ~IValidator() = default;
  virtual ValidationResult Validate(/* actual, expected, name */) const = 0;
};

class RelativeValidator : public IValidator { double tol_; ... };
class AbsoluteValidator : public IValidator { double tol_; ... };
class RmseValidator     : public IValidator { double tol_; ... };
```

Использование в тесте:
```cpp
RelativeValidator v(1e-5);
tr.add(v.Validate(gpu_result, cpu_reference, "fft_magnitude"));
```

### 2. Python зеркало (cel: `DSP/Python/common/result.py`)

Уже частично есть (см. `Session_Handoff_2026-05-01.md` §4.1). Дополнить:
```python
from dataclasses import dataclass

@dataclass
class ValidationResult:
    passed: bool; metric_name: str; actual_value: float; threshold: float; message: str = ""

class RelativeValidator:
    def __init__(self, tol: float): self.tol = tol
    def validate(self, actual, expected, name) -> ValidationResult: ...

class AbsoluteValidator: ...
class RmseValidator: ...

def max_rel_error(actual, expected) -> float: ...
def abs_error(actual, expected) -> float: ...
def rmse_error(actual, expected) -> float: ...
def scalar_rel_error(actual, expected) -> float: ...
```

Зеркало обязано быть API-совместимо с C++ (имена методов snake_case в Python, CamelCase в C++).

### 3. Тесты на сами валидаторы

`core/tests/test_validators.hpp` — проверки на:
- Тождественные векторы → `passed=true, error=0`.
- Сдвиг в 1e-3 при tol=1e-4 → `passed=false`.
- Векторы разной длины → exception/SkipTest.
- complex<float> vs float — компиляция должна не работать (static_assert).
- RmseError на синусоиде vs шум — известное значение.

### 4. Обновить правило 15-cpp-testing.md

Добавить раздел «Валидаторы» с примером использования `RelativeValidator(tol)` вместо ручного `if (abs(a-b) > tol) ...`.

---

## Источник (что копировать / переписывать)

| Файл legacy (`E:\C++\GPUWorkLib\`) | Целевой DSP-GPU |
|---|---|
| `modules/test_utils/test_result.hpp` (struct ValidationResult, factories) | ✅ уже в `core/test_utils/test_result.hpp` |
| `modules/test_utils/validators.hpp` (`MaxRelError/AbsError/RmseError/ScalarRelError`) | 🆕 `core/test_utils/validators.hpp` |
| `modules/test_utils/validator_classes.hpp` (`Relative/Absolute/RmseValidator`) | 🆕 `core/test_utils/validators.hpp` (один файл) |
| `Python_test/common/result.py` (`@dataclass ValidationResult`) | ⚠️ частично в `DSP/Python/common/result.py` — дополнить |
| `Python_test/common/validators.py` | 🆕 `DSP/Python/common/validators.py` |

⚠️ Не переносить **API legacy** (`GPUProfiler`, старые имена). Только структуры данных + математику.

---

## Зависимости

- ✅ `core/test_utils/test_result.hpp` (уже есть `ValidationResult` в DSP-GPU)
- ✅ `core/test_utils/test_runner.hpp` (TestRunner совместим — принимает `ValidationResult`)

---

## Acceptance criteria

- [ ] `core/test_utils/validators.hpp` собирается (`cmake --build` без warnings)
- [ ] `core/tests/test_validators.hpp` зелёный (`runner.test` все PASS)
- [ ] `DSP/Python/common/validators.py` импортируется, тесты `t_validators.py` (через `common.runner.TestRunner`) — зелёные
- [ ] AI-генератор RAG-тестов в карточках использует `RelativeValidator(1e-5)` вместо ручного epsilon-сравнения
- [ ] Правило `15-cpp-testing.md` обновлено

---

## Связанные документы

- `MemoryBank/specs/Review_LLM_RAG_specs_2026-05-03.md` §0, §9.1 — контекст почему задача поднята
- `MemoryBank/specs/LLM_and_RAG/00_Master_Plan_2026-04-30.md` §3 — где в общем roadmap
- `core/test_utils/test_result.hpp` — текущий частичный набор
- Legacy `E:\C++\GPUWorkLib\modules\test_utils\` — источник копирования

---

## Заметки

- Имена классов **CamelCase** (правило 14-cpp-style §"Naming"), методы **snake_case**.
- Хелперы — отдельные функции, не методы класса (Information Expert: данные сравнения вне state).
- Validator-классы — Strategy для замены стратегии сравнения через DI:
  ```cpp
  void test_with_validator(IValidator& v) {
      tr.add(v.Validate(actual, expected, "metric"));
  }
  ```
- `static_assert` для несовместимых типов — лучше чем runtime exception.

*Maintained by: Кодо.*
