# Inventory ручных epsilon-сравнений в `linalg/tests/` (Phase A пилота)

> **Дата**: 2026-05-04 · **Источник**: `TASK_validators_linalg_pilot_2026-05-04.md`
> **Цель**: классифицировать каждое сравнение → выбрать validator из `gpu_test_utils::*` → исполнить в Phase B/C.

---

## Метод сбора

```bash
# 1. Главный grep — всё с tolerance literal:
grep -nE 'if \(.*(err|err_|diff|reldiff)[^)]*>=' linalg/tests/*.hpp
grep -nE 'std::abs.*[<>]|fabs.*[<>]|< 1e-|>= 1e-' linalg/tests/*.hpp

# 2. Throw-ветки (для перекрёстной проверки):
grep -nE 'throw std::runtime_error' linalg/tests/*.hpp

# 3. Assert с tolerance:
grep -nE 'assert\(.*(diff|err)[^)]*[<>]' linalg/tests/*.hpp
```

**Итог**: 12 случаев валидации + 8 false positives. Подробно ниже.

---

## ✅ Подлежит замене (12 случаев)

### A. Прямая замена `if (err >= TOL) throw` → `ScalarAbsError + throw`

**Паттерн**:
```cpp
double err = FrobeniusError(...);
if (err >= TOL) throw std::runtime_error("FAIL: err=" + std::to_string(err));
//        ↓
double err = FrobeniusError(...);
auto v = gpu_test_utils::ScalarAbsError(err, 0.0, TOL, "metric_name");
if (!v.passed) throw std::runtime_error(
    "FAIL " + v.metric_name + " actual=" + std::to_string(v.actual_value) +
    " threshold=" + std::to_string(v.threshold));
```

| # | Файл | Строка | Текущее | Замена |
|---|---|---|---|---|
| 1 | `test_cholesky_inverter_rocm.hpp` | 148 | `if (err >= 1e-5)` после `FrobeniusError(I, A_inv, n)` | `ScalarAbsError(err, 0.0, 1e-5, "frobenius_I_AAinv")` |
| 2 | `test_cholesky_inverter_rocm.hpp` | 184 | `if (err >= 1e-2)` (mode = single matrix) | `ScalarAbsError(err, 0.0, 1e-2, "frobenius_residual_341")` |
| 3 | `test_cholesky_inverter_rocm.hpp` | 225 | `if (err >= 1e-2)` (другой mode) | `ScalarAbsError(err, 0.0, 1e-2, "frobenius_residual_mode2")` |
| 4 | `test_cholesky_inverter_rocm.hpp` | 288 | `if (err >= 1e-3)` (batch CPU loop) | `ScalarAbsError(err, 0.0, 1e-3, "batch_cpu_k="+k)` |
| 5 | `test_cholesky_inverter_rocm.hpp` | 345 | `if (err >= 1e-3)` (batch GPU loop) | `ScalarAbsError(err, 0.0, 1e-3, "batch_gpu_k="+k)` |
| 6 | `test_cholesky_inverter_rocm.hpp` | 433 | `if (err >= 1e-2)` (TestMatrixSizes) | `ScalarAbsError(err, 0.0, 1e-2, "matrix_sizes_n="+n+"_k="+k)` |
| 7 | `test_cross_backend_conversion.hpp` | 68 | `if (err >= 1e-3)` (Convert_VectorInput) | `ScalarAbsError(err, 0.0, 1e-3, "convert_vector_input")` |
| 8 | `test_cross_backend_conversion.hpp` | 133 | `if (diff >= 1e-3)` (Convert_HipInput) | `ScalarAbsError(diff, 0.0, 1e-3, "convert_hip_input")` |
| 9 | `test_cross_backend_conversion.hpp` | 195 | `if (diff >= 1e-7)` (Convert_OutputFormats) | `ScalarAbsError(diff, 0.0, 1e-7, "convert_output_formats")` |

### B. Cycle + assert — complex replace (`AbsError` на массив целиком)

**Текущий паттерн** (8 строк):
```cpp
float max_diff = 0.0f;
float max_reldiff = 0.0f;
for (uint32_t m = 0; m < M; ++m) {
  float diff = std::fabs(a[m] - b[m]);
  float reldiff = diff / (std::fabs(a[m]) + 1e-30f);
  if (diff > max_diff) max_diff = diff;
  if (reldiff > max_reldiff) max_reldiff = reldiff;
}
TestPrint("  max|...|=" + ... + "  (tolerance < 1e-4)");
assert(max_diff < 1e-4f && "data corruption");
```

**Замена** (3-4 строки):
```cpp
auto v = gpu_test_utils::AbsError(a.data(), b.data(), M, /*tol=*/1e-4, "metric_name");
TestPrint("  " + v.metric_name + ": max_diff=" + std::to_string(v.actual_value) +
          " (tolerance < " + std::to_string(v.threshold) + ")");
assert(v.passed && "data corruption: results don't match direct path");
```

> ⚠️ Семантика: `1e-30f` в знаменателе reldiff делал «только-печать», assert смотрел только на абсолютную разницу. `AbsError` тоже абсолютный — поведение **сохраняется**. `max_reldiff` теряется в выводе, но он сейчас только в `TestPrint`, не в assert — потеря косметическая. Если хочется сохранить — отдельный второй вызов `MaxRelError`.

| # | Файл | Строка | Контекст | Замена |
|---|---|---|---|---|
| 10 | `test_capon_opencl_to_rocm.hpp` | 484-502 | Test 03 ZeroCopy: `assert(max_diff < 1e-4f, "Zero Copy corrupted data")` | `AbsError(relief_ref.relief.data(), relief_ocl.relief.data(), M, 1e-4, "zerocopy_vs_direct")` |
| 11 | `test_capon_opencl_to_rocm.hpp` | 754-771 | SVM path: `assert(max_diff < 1e-4f, "SVM path data corruption")` | `AbsError(relief_ref.relief.data(), relief_svm.relief.data(), M, 1e-4, "svm_vs_direct")` |
| 12 | `test_capon_hip_opencl_to_rocm.hpp` | 770-791 | hipMalloc→clSVMMemcpy: `assert(max_diff < 1e-4f, "hipMalloc→clSVMMemcpy path: data mismatch")` | `AbsError(relief_ref.relief.data(), relief_hip.relief.data(), M, 1e-4, "hip_svm_vs_direct")` |

> ⚠️ **Эти 3 случая отсутствовали в первоначальном inventory таска** — Phase A их обнаружил.

---

## ❌ НЕ трогать (8 false positives)

| # | Файл | Строка | Что | Почему оставить |
|---|---|---|---|---|
| F1 | `capon_test_helpers.hpp` | 136 | `if (u1 < 1e-10f) u1 = 1e-10f` | Box-Muller log(0) protection — генерация шума, не валидация |
| F2 | `test_cholesky_inverter_rocm.hpp` | 81-95 | `FrobeniusError(A, B, n)` definition | Helper-функция — оставляем, заменяем только её **использования** |
| F3 | `test_capon_rocm.hpp` | 138-143 | `float diff = std::abs(theta - theta_int); if (diff < min_diff) m_int = m;` | argmin — поиск ближайшего индекса, не валидация порога |
| F4 | `test_capon_rocm.hpp` | 220 | `assert(std::isfinite(v) && v >= 0.0f)` | Sanity check без tolerance — оставляем |
| F5 | `test_capon_opencl_to_rocm.hpp` | 489, 490 | `if (diff > max_diff) max_diff = diff;` | Accumulator (часть Cycle B-замены — **исчезает** вместе с #10) |
| F6 | `test_capon_opencl_to_rocm.hpp` | 759, 760 | то же | Accumulator (часть Cycle B-замены — исчезает вместе с #11) |
| F7 | `test_capon_hip_opencl_to_rocm.hpp` | 776, 777 | то же | Accumulator (часть Cycle B-замены — исчезает вместе с #12) |
| F8 | `test_capon_hip_opencl_to_rocm.hpp` | 201, 208 | `throw std::runtime_error(... + hipGetErrorString(e))` | hip API error reporting, не валидация данных |

---

## Файлы без сравнений (проверены — clean)

| Файл | Строк | Что внутри |
|---|---|---|
| `test_capon_benchmark_rocm.hpp` | 120 | benchmark через `GpuBenchmarkBase` — без assert'ов |
| `test_benchmark_symmetrize.hpp` | 558 | benchmark — без assert'ов |
| `test_capon_reference_data.hpp` | 408 | reference data loaders — без сравнений |
| `test_stage_profiling.hpp` | 404 | profiling stages — без data validation |
| `all_test.hpp`, `main.cpp`, `capon_test_helpers.hpp` (кроме F1) | — | бойлерплейт |

---

## Распределение работы по файлам (для Phase B/C)

| Файл | Замен | Тип | Когда |
|---|---|---|---|
| `test_cholesky_inverter_rocm.hpp` | **6** | A (прямая) | Phase B (эталон) |
| `test_cross_backend_conversion.hpp` | **3** | A (прямая) | Phase C #1 |
| `test_capon_opencl_to_rocm.hpp` | **2** | B (cycle+assert) | Phase C #2 |
| `test_capon_hip_opencl_to_rocm.hpp` | **1** | B (cycle+assert) | Phase C #3 |
| **Итого** | **12** | | |

---

## Что менять в TASK-файле (после Phase A)

1. Inventory таблица (часть Phase A в TASK) — расширить с 9 до 12 строк (добавить #10, #11, #12).
2. Phase C — пометить файлы B-типа отдельно: «complex replace, заменяем 8 строк цикла на 3 строки `AbsError`».
3. Acceptance — обновить ожидаемое количество замен (12, не 9).

---

## Риски / неоднозначности

| # | Что | Решение |
|---|---|---|
| R1 | `max_reldiff` теряется в TestPrint после B-замены (#10/11/12) | Если важно для отладки — добавить второй вызов `MaxRelError(...)` рядом и логировать. Я предлагаю **не добавлять** — это телеметрия, не валидация. Принимать решение Alex. |
| R2 | `1e-30f` epsilon в знаменателе `reldiff` (старый код) vs `1e-15` fallback в `MaxRelError` | Поведение `AbsError` не зависит от epsilon — выбираем `AbsError`, не `MaxRelError`. Решено. |
| R3 | Граничное значение `err == TOL`: ручной `>=` → fail; `ScalarAbsError`/`AbsError` использует `<` → тоже fail (потому что `err < TOL` будет false при равенстве) | Семантика **совпадает**. Граничный случай не меняется. |
| R4 | `AbsError` для batch loop (#4, #5) — индекс `k` в имени метрики при динамическом `to_string(k)` каждый раз | Допустимо: `name="batch_cpu_k="+std::to_string(k)`. Reporter увидит уникальные метрики на каждый `k`. |

---

*Maintained by: Кодо. Phase A done — готовность к Phase B.*
