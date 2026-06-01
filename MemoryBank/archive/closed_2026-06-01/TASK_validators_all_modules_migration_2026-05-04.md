# TASK — Раскатка `gpu_test_utils::*` валидаторов на все 7 модулей (миграция)

> **Создано**: 2026-05-04
> **Статус**: 📋 active (после `linalg_pilot`)
> **Effort суммарно**: ~6-8 ч (можно резать по модулям независимо)
> **Платформа**: Debian + RX 9070 (gfx1201) — собрать + прогнать
> **Зависимости**: ✅ `core/test_utils/validators/{numeric,signal}.hpp`, ✅ `core/tests/test_validators.hpp` (зелёный), ✅ `linalg-pilot` (образец, см. `TASK_validators_linalg_pilot_2026-05-04.md`)

---

## 🎯 Зачем

`linalg`-пилот доказал паттерн (4 файла, 15 вызовов `gpu_test_utils::*`, 0 ручных epsilon). Теперь — раскатка на 7 модулей: `core`, `spectrum`, `stats`, `heterodyne`, `signal_generators`, `radar`, `strategies`.

Цели — **те же** что у пилота: единое представление `ValidationResult`, near-zero fallback, унифицированные сообщения `metric_name/actual_value/threshold`.

---

## 📊 Сводный inventory (по убыванию работы)

| Репо | Файлов | Уже на gpu_test_utils | Реально мигрировать | Effort |
|------|--------|----------------------|--------------------|--------|
| `core` | 22 | 1/22 | 3 файла (6 std::abs циклов) | ~2-3 ч |
| `radar` | 8 | 0/8 | 1+? файлов | ~1.5-2 ч |
| `spectrum` | 18 | 8/18 | до 4 кандидатов | ~1.5-2 ч |
| `strategies` | 5 | 0/5 | 1 спорный assert | ~45 мин - 1 ч |
| `stats` | 6 | 2/6 | до 1 кандидата | ~45 мин |
| `heterodyne` | 4 | 3/4 | возможно 0 (только benchmark) | ~30 мин |
| `signal_generators` | 3 | 2/3 | 0 (только benchmark + nonzero) | ~30 мин |
| **ИТОГО** | **66** | **16/66 (24%)** | **~10-15 файлов** | **~6-8 ч** |

---

## 🛠️ Workflow (общий, идёт по образцу linalg-pilot)

Для **каждого** модуля — Phase A (inventory) → Phase B (replace) → Phase C (build+test) → Phase D (docs).

Можно резать сессии: «сегодня делаем core+radar», «завтра spectrum+stats», и т.д.

### Общий паттерн замены (как в linalg)

```cpp
// БЫЛО:
double err = ManualMetric(...);
if (err >= TOL) throw std::runtime_error("FAILED: err=" + std::to_string(err));

// СТАЛО:
auto v = gpu_test_utils::ScalarAbsError(err, 0.0, TOL, "metric_name");
if (!v.passed) {
    throw std::runtime_error("FAILED: " + v.metric_name +
        " actual=" + std::to_string(v.actual_value) +
        " threshold=" + std::to_string(v.threshold));
}
```

Для vector-сравнений (`std::abs(a[i]-b[i]) > TOL` в цикле) — заменять на:

```cpp
auto v = gpu_test_utils::MaxRelError(actual_vec, expected_vec, TOL);  // или AbsError
if (!v.passed) throw ...;
```

⚠️ **Не вводить `TestRunner tr`** в функции, где его нет (это другой рефакторинг).
⚠️ **Не трогать CMake** — валидаторы уже в INTERFACE-include через `DspCore::TestUtils`.

---

## 📦 1) core — 22 файла, реально 3

> **Уже мигрирован**: `test_validators.hpp` (но это сами unit-тесты валидаторов, не пользователи).

### Подлежит замене (3 файла, 6 точек)

| Файл | Строки | Что | На что менять |
|---|---|---|---|
| `test_drv_gpu_external.hpp` | 127, 207, 282 | `if (std::abs(dst[i] - src[i]) > 1e-5f) data_ok = false; break;` (3× в разных функциях) | `auto v = AbsError(dst_vec, src_vec, 1e-5); data_ok = v.passed;` |
| `test_hybrid_external_context.hpp` | 228, 281 | то же | то же |
| `test_rocm_external_context.hpp` | 153 | `if (std::abs(host_dst[i] - host_src[i]) > 1e-6f) ...` | `AbsError(host_dst, host_src, 1e-6)` |

### НЕ трогать (19 файлов)

`test_compile_key`, `test_exporters`, `test_golden_export`, `test_kernel_cache_service`, `test_phase_c_gate2`, `test_quality_gates`, `test_profile_*` (4), `test_profiling_*` (3), `test_report_printer_mock`, `test_rocm_backend`, `test_hybrid_backend`, `test_services`, `test_storage_services`, `test_timing_source`, `test_zero_copy` — gate/lifecycle/structures/JSON-compare, нет epsilon на данных.

### Phase A inventory командой

```bash
grep -nE 'std::abs\([^)]+\) *> *[0-9]' E:/DSP-GPU/core/tests/test_*.hpp
```

Ожидаем ровно 6 строк в 3 файлах.

---

## 📦 2) radar — 8 файлов, реально 1+

> **Никто** не использует `gpu_test_utils::*`.

### Подлежит замене (1 подтверждён + ?)

| Файл | Строки | Что | На что менять |
|---|---|---|---|
| `test_fm_basic.hpp` | 255-267 | ручной `max_diff` accumulator + `if (max_diff > 1e-4f) throw` (CPU vs GPU shift) | `auto v = MaxRelError(gpu_result, cpu_result, 1e-4); if (!v.passed) throw...` |

### НЕ трогать (semantic checks, не epsilon)

| Файл | Строки | Семантика |
|---|---|---|
| `test_fm_basic.hpp` | 95 | `Autocorrelation: SNR=...` — semantic SNR check |
| `test_fm_basic.hpp` | 137, 169 | `peaks size != expected` — структурный check |
| `test_fm_basic.hpp` | 238 | semantic peak position |
| `test_fm_msequence.hpp` | 65, 81, 97, 110 | M-seq свойства (значение / +1 ratio / различимость seed'ов) |

### Под скан в Phase A (7 файлов)

`test_fm_avg_summary.hpp` (225), `test_fm_combined.hpp` (211), `test_fm_step_profiling.hpp` (204), `test_fm_benchmark_rocm_all_time.hpp` (708 — benchmark), `test_range_angle_basic.hpp` (180), `test_range_angle_benchmark.hpp` (118 — benchmark), `test_fm_msequence.hpp` (122).

### Phase A inventory

```bash
grep -nE 'if \([^)]*(err|diff|residual|max_diff)[^)]*>' E:/DSP-GPU/radar/tests/*.hpp
```

---

## 📦 3) spectrum — 18 файлов, реально до 4

> **Уже мигрированы (8/18)**: `test_complex_to_mag_phase_rocm`, `test_fft_processor_rocm`, `test_filters_rocm`, `test_kalman_rocm`, `test_kaufman_rocm`, `test_moving_average_rocm`, `test_process_magnitude_rocm`, `test_spectrum_maxima_rocm`.

### Под скан в Phase A (10 файлов)

| Файл | Размер | Ожидание |
|---|---|---|
| `test_fft_cpu_reference_rocm.hpp` | 399 | numerical compare с CPU — **вероятный кандидат** |
| `test_fft_matrix_rocm.hpp` | 556 | matrix-FFT — возможен кандидат |
| `test_lch_farrow_rocm.hpp` | 350 | lch_farrow — возможен кандидат |
| `test_gate3_fft_profiler_v2.hpp` | 299 | gate-test, обычно без data-compare |
| остальные 6 | — | benchmark / helpers / smoke (не трогать) |

### Phase A inventory

```bash
grep -nE 'if \([^)]*(err|diff|residual)[^)]*>=' E:/DSP-GPU/spectrum/tests/test_fft_cpu_reference_rocm.hpp E:/DSP-GPU/spectrum/tests/test_fft_matrix_rocm.hpp E:/DSP-GPU/spectrum/tests/test_lch_farrow_rocm.hpp
```

---

## 📦 4) strategies — 5 файлов, реально 1 (спорный)

> **Никто** не использует `gpu_test_utils::*`.

### Спорный кандидат — обсудить с Alex

| Файл | Строки | Что | Комментарий |
|---|---|---|---|
| `test_strategies_pipeline.hpp` | 235 | `assert(freq_err < 2.0f * freq_res);` | **assert vs throw** — разная семантика. `assert` работает только в debug. |

**Вариант A**: оставить `assert` (debug-only check, в release выпиливается).
**Вариант B**: заменить на `if (!ScalarAbsError(freq_err, 0.0, 2.0f * freq_res, "freq_err").passed) throw...` — единая семантика.

→ **Решение Alex** в session log перед заменой.

### НЕ трогать

`assert(size == ...)` / `assert(!empty)` (структурные), 4 других файла (benchmark / debug / step_profiling / base).

---

## 📦 5) stats — 6 файлов, реально до 1

> **Уже мигрированы (2/6)**: `test_statistics_float_rocm`, `test_statistics_rocm`.

### Под скан в Phase A (4 файла)

| Файл | Размер | Ожидание |
|---|---|---|
| `test_snr_estimator_rocm.hpp` | 308 | SNR — возможен кандидат |
| `test_helpers_rocm.hpp` | 73 | helpers (не тест) |
| `test_snr_estimator_benchmark.hpp` | 148 | benchmark |
| `test_statistics_compute_all_benchmark.hpp` | 125 | benchmark |

### Phase A inventory

```bash
grep -nE 'if \([^)]*(err|diff|residual)[^)]*>=' E:/DSP-GPU/stats/tests/test_snr_estimator_rocm.hpp
```

---

## 📦 6) heterodyne — 4 файла, реально 0 ожидается

> **Уже мигрированы (3/4)**: `test_heterodyne_basic`, `test_heterodyne_pipeline`, `test_heterodyne_rocm`.

Один оставшийся — `test_heterodyne_benchmark_rocm.hpp` (122 строки), benchmark, **скорее всего без assert**.

### Phase A — single check

```bash
grep -nE '(if \([^)]*(err|diff)[^)]*>=)|(std::abs\([^)]+\) *> *[0-9])' \
  E:/DSP-GPU/heterodyne/tests/test_heterodyne_benchmark_rocm.hpp
```

Если 0 → закрыть как «100% migrated, only benchmark remains».

---

## 📦 7) signal_generators — 3 файла, реально 0 ожидается

> **Уже мигрированы (2/3)**: `test_form_signal_rocm`, `test_signal_generators_rocm_basic`.

Один оставшийся — `test_signal_generators_benchmark_rocm.hpp` (96 строк), benchmark.

### NOTE — false positive

`test_form_signal_rocm.hpp:120` содержит `if (std::abs(data[0][i]) > 0.01f) nonzero_count++;` — это **nonzero count** (проверка что сигнал не пустой), **не epsilon-валидация**. Не менять.

### Phase A

```bash
grep -nE '(if \([^)]*(err|diff)[^)]*>=)|(throw .*runtime_error.*FAIL)' \
  E:/DSP-GPU/signal_generators/tests/test_signal_generators_benchmark_rocm.hpp
```

---

## ✅ Acceptance criteria (общие на все модули)

- [ ] `core/tests/test_*_external.hpp` — 0 ручных `std::abs(...) > TOL` (3 файла, 6 точек).
- [ ] `radar/tests/test_fm_basic.hpp` — `max_diff > 1e-4` заменён на `MaxRelError`.
- [ ] `spectrum/tests/` — 0 ручных epsilon в кандидатах (после Phase A scan).
- [ ] `stats/tests/test_snr_estimator_rocm.hpp` — 0 ручных epsilon (после Phase A scan).
- [ ] `strategies` — решение по `freq_err` принято (A или B), исполнено.
- [ ] `heterodyne` / `signal_generators` — подтверждены как «no manual epsilon, only benchmark», TASK закрыт.
- [ ] Все 7 `*_tests` — зелёные на gfx1201 после миграции.
- [ ] Sessions log + changelog обновлены по каждому модулю.

---

## 📂 Связанные документы

- `MemoryBank/tasks/TASK_validators_port_from_GPUWorkLib_2026-05-03.md` — родительский (≈90% сделан)
- `MemoryBank/tasks/TASK_validators_linalg_pilot_2026-05-04.md` — пилот (образец паттерна)
- `core/test_utils/validators/numeric.hpp` + `signal.hpp` — used API
- `.claude/rules/15-cpp-testing.md` §«Валидаторы» — единый источник правды

---

## 📝 Заметки

- ⚠️ Если в файле **нет** `TestRunner tr` — **не переделывать на TestRunner-стиль** в этом таске.
- ⚠️ Benchmark'и (`*_benchmark*.hpp`) обычно проверяют только время через `ProfilingFacade` — **не трогать**.
- ⚠️ Семантические throw'ы (SNR threshold, peaks count, M-seq свойства) — **не подменять валидатором**, это разная семантика.
- Никаких git push / tag — только локальные коммиты по модулям.

*Maintained by: Кодо.*
