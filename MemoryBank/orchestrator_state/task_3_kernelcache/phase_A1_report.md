# Phase A1 Report — CompileKey + FNV-1a

**Date**: 2026-04-20
**Branch**: `kernel_cache_v2`
**Commit**: `7bc06a5`
**Status**: ✅ PASS

---

## Scope (as assigned)

Phase A1 only — создать `CompileKey` + FNV-1a + 5+ unit-тестов.
**НЕ трогал**: `KernelCacheService`, `GpuContext` (это Phase A2).

---

## Deliverables

| Файл | Статус | Назначение |
|------|--------|------------|
| `core/include/core/services/compile_key.hpp` | ✅ создан | Header: struct `CompileKey`, `Hash()`, `HashHex()`, `DetectHiprtcVersion()` |
| `core/src/services/compile_key.cpp` | ✅ создан | Implementation: FNV-1a 64-bit с разделителями между полями |
| `core/tests/test_compile_key.hpp` | ✅ создан | 5 unit-тестов |
| `core/CMakeLists.txt` | ✅ правка | `src/services/compile_key.cpp` в `target_sources` (разрешённая правка) |
| `core/tests/all_test.hpp` | ✅ правка | Регистрация `test_compile_key::run()` |

---

## Tests (5/5 PASSED)

```
TEST: TestFnv1aStability                   [PASS]
TEST: TestFnv1aCollisionResistance         [PASS]
TEST: TestFnv1aEmpty                       [PASS]
TEST: TestCompileKeyComposite              [PASS]
TEST: TestCompileKeyByteOrderIndependent   [PASS]

compile_key: Passed: 5, Failed: 0
[ALL TESTS PASSED]
```

### Test coverage
1. **TestFnv1aStability** — повторные `Hash()` на одном объекте дают одинаковый результат; `HashHex()` = 8 chars
2. **TestFnv1aCollisionResistance** — 3 разных source → 3 разных `Hash()` и `HashHex()`
3. **TestFnv1aEmpty** — пустой `CompileKey` даёт детерминированный hash, отличный от raw offset basis `0xcbf29ce484222325` (подтверждает что separators применяются)
4. **TestCompileKeyComposite** — 6 вариантов (source / defines / arch / hiprtc_version / extra define / base) → 6 distinct hashes; boundary-test `{"ab","c"} != {"a","bc"}` (separator effective)
5. **TestCompileKeyByteOrderIndependent** — hash идентичен при разных путях построения строк; 100 повторений — стабильно; hex только lowercase

---

## Build

```
$ cmake --build build -j 32
[15/16] Linking CXX executable tests/test_core_main
```

Никаких новых ошибок/warning-ов от `compile_key.{hpp,cpp}`. Только pre-existing warnings в test_rocm_external_context / test_hybrid_external_context (нodiscard на `hipStreamDestroy`) — не в нашей зоне ответственности.

---

## Commits

```
7bc06a5  [kernel-cache-v2] Phase A1: CompileKey + FNV-1a (5 tests)
```

**НЕ пушил** (как указано в задании). Ветка `kernel_cache_v2` локальная.

---

## Следующий шаг

Phase A2 — переписать `KernelCacheService` с key-based API + интегрировать в `GpuContext::CompileModule`. Отдельная задача.
