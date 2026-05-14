# TASK — Silent-fail в `core/tests/` (18 файлов)

> **Создано**: 2026-05-14 (после V2 rollout — обнаружено при инвентаризации core)
> **Статус**: 📋 backlog
> **Effort**: ~30-45 мин (структурная правка тест-runner'а)
> **Платформа**: cross-platform (test infra)
> **Severity**: 🟡 medium — текущие тесты зелёные, но CI слепнет при будущей регрессии

---

## Проблема

В `core/tests/` ~18 файлов используют bool-ok + cout PASS/FAIL pattern, но
**exit code из main.cpp всегда 0** независимо от реального исхода тестов.

### Точная цепочка silent-fail

1. Каждый `test_*.hpp::run()` корректно возвращает `int` (0 PASS / 1 FAIL):
   ```cpp
   // test_compile_key.hpp
   inline int run() { ... return fail == 0 ? 0 : 1; }
   ```

2. **НО** в `all_test.hpp:100` return value **игнорируется**:
   ```cpp
   inline void run() {
       test_compile_key::run();          // ⚠️ int отброшен
       test_storage_services::run();
       // ... 16 ещё
   }
   ```

3. И `main.cpp` всегда возвращает `0`:
   ```cpp
   int main() {
       drvgpu_all_test::run();
       return 0;     // ⚠️ ВСЕГДА 0
   }
   ```

### Последствия

- Если **любой** из 18 файлов реально упадёт после изменения (например ROCm
  обновился, kernel_cache_service ломается, hash collision в FNV-1a) —
  `[FAIL]` будет в stdout, но `exit code = 0`.
- CI / pre-commit hooks / любой regression detector **не увидит**.
- ~82 потенциально silent fail-точек:
  - test_compile_key: 24 (`[FAIL]` мест)
  - test_storage_services: 21
  - test_timing_source: 9
  - test_golden_export: 4
  - и т.д. (см. `MemoryBank/sessions/2026-05-14.md`)

## Что нужно сделать

Структурный fix в 2 файлах:

### `core/tests/all_test.hpp`

```cpp
namespace drvgpu_all_test {

inline int run() {
    int total_failed = 0;
    total_failed += test_compile_key::run();           // 0 or 1
    total_failed += test_storage_services::run();
    total_failed += test_kernel_cache_service::run();
    // ... 15 ещё (для каждого `+=` если они уже возвращают int)

    // Для тестов с void return:
    try { test_validators::run(); } catch (...) { ++total_failed; }
    // (либо привести их к int return — единый стиль)

    std::cout << "\n========== CORE TESTS TOTAL: "
              << (total_failed == 0 ? "[ALL PASSED]" : "[FAILED: " +
                  std::to_string(total_failed) + "]")
              << "\n";
    return total_failed;
}

}  // namespace drvgpu_all_test
```

### `core/tests/main.cpp`

```cpp
int main() {
    return drvgpu_all_test::run();    // exit-non-zero при FAIL
}
```

## Acceptance

- [ ] `core/tests/all_test.hpp::run()` возвращает `int` — sum failures.
- [ ] Каждый sub-test `run()` либо возвращает `int`, либо обёрнут в try/catch.
- [ ] `core/tests/main.cpp` `return drvgpu_all_test::run();`
- [ ] Build clean.
- [ ] При искусственном FAIL (например, изменить ожидаемый hash в test_compile_key)
      `test_core_main` возвращает `exit code != 0`.
- [ ] CI pipeline / shell wrapper детектит non-zero и помечает PASS/FAIL правильно.

## Альтернатива (расширенный объём)

Можно **дополнительно** конвертировать bool-ok + cout pattern на `gpu_test_utils::*`
+ throw для всех 82 fail-точек. Но это **большая работа** и `gpu_test_utils::*`
плохо вписывается в infrastructure tests (hash stability, JSON format,
service registry — это не numerical validation). Минимальный fix через
return code достаточен для CI-видимости.

## Связанное

- Аналогичный silent-fail был исправлен в `radar/tests/test_range_angle_basic.hpp`
  2026-05-14 в той же сессии V2 rollout — там было хуже, тест **тихо** PASS'ил
  при реальном FAIL. После правки throw'ит при FAIL.
- Тот же паттерн `bool ok + cout PASS/FAIL` существует в других репо
  (signal_generators, strategies) — но там либо есть try/catch wrapper с
  counter, либо тесты используют ValidationResult-стиль. Стоит проверить
  при следующей V2 ревизии.
- Pattern «тест-runner агрегирует return codes» — стандарт во всех остальных
  репо DSP-GPU (см. `linalg/tests/main.cpp`, `spectrum/tests/main.cpp`).
  core — единственный отстающий.

---

*Created by: Кодо. Не блокер — текущее состояние 108/108 зелёные.*
