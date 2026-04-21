# Phase B1 Report — ProfilingRecord (unified flat type)

**Task**: TASK_Profiler_v2_PhaseB1_ProfilingRecord.md
**Branch**: `new_profiler` (core)
**Commit**: `3e79dcd` — `[profiler-v2] Phase B1: ProfilingRecord + record_from_rocm`
**Date**: 2026-04-20
**Effort actual**: ~1.5ч (оценка была 2-3ч)
**Status**: ✅ PASS

---

## 🎯 Что сделано

### 1. `ProfilingRecord` — flat struct в `profiling_types.hpp`
Добавлен унифицированный тип записи (ROCm-only, без `std::variant`).

**Поля**:
- Identity: `gpu_id`, `module_name`, `event_name`
- Timing (ns): `start_ns`, `end_ns`, `queued_ns`, `submit_ns`, `complete_ns`
- Classification: `domain`, `kind`, `op`, `correlation_id`
- Device: `device_id`, `queue_id`, `bytes`
- Kernel: `kernel_name`
- Counters: `std::map<std::string, double>` — **C3 ревью принят** (scale ~60K/тест)
- `record_index` — composite (W4 ревью): `(uint64_t(gpu_id) << 48) | local_idx`

**Computed helpers**: `ExecTimeMs`, `QueueDelayMs`, `SubmitDelayMs`, `CompleteDelayMs`, `BandwidthGBps`.
**Kind helpers**: `IsKernel`/`IsCopy`/`IsBarrier`/`IsMarker` + `KindString()`.
Safe-guard на underflow unsigned: `submit_ns >= queued_ns ? ... : 0` (аналогично для прочих delay).

### 2. `record_from_rocm(...)` — free function в `profiling_conversions.hpp` (R4)
Новый заголовок `include/core/services/profiling_conversions.hpp`. Namespace `drv_gpu_lib::profiling`. **НЕ** static-метод — разрыв потенциального include-цикла `profiling_types ↔ ROCmProfilingData`. Факторя копирует все поля из `ROCmProfilingData` → `ProfilingRecord` плюс принимает `gpu_id / module / event` отдельно. **`record_index` НЕ трогает** — это задача `ProfileStore::Append()` (Phase B2).

### 3. Unit-тесты — `tests/test_profiling_conversions.hpp` (4 теста)
Зарегистрирован suite в `all_test.hpp` → `test_core_main`.

| # | Test | Проверяет |
|---|------|-----------|
| 1 | `AllFieldsCopied` | Все поля 1-в-1 из ROCm → Record, `record_index == 0` (не заполняется фабрикой) |
| 2 | `ComputedHelpers` | ExecTimeMs (2 ms), QueueDelayMs (0.3 ms), SubmitDelayMs (0.2 ms), CompleteDelayMs (0.2 ms), BandwidthGBps (1 GB/s для 2 MB / 2 ms). Plus edge: bytes=0 → bandwidth=0 |
| 3 | `KindHelpers` | kind 0..3 → соответствующий Is*, KindString; kind=99 → "unknown"; `HasCounters()` |
| 4 | `MockMassProduction` | **1000 fake records × 4 GPU** через `MakeRocmFromDurationMs`. Эмулируется будущий `ProfileStore::Append`: per-shard `local_idx` счётчики, composite `record_index = (gpu << 48) \| idx`. Декомпозируется обратно и проверяется монотонность + балансировка (250 записей на GPU) |

## ✅ Acceptance Criteria

| # | Критерий | Статус |
|---|----------|:-----:|
| 1 | `struct ProfilingRecord` в profiling_types.hpp | ✅ |
| 2 | Counters `std::map<string, double>` | ✅ |
| 3 | `record_from_rocm` free function в profiling_conversions.hpp | ✅ |
| 4 | НЕТ `static ProfilingRecord FromROCm` (grep в include/) | ✅ пусто |
| 5 | 4 unit-теста (спека требовала 3 — добавлен mock mass-production) | ✅ |
| 6 | Все тесты зелёные | ✅ 4/4 |
| 7 | Сборка зелёная | ✅ (только pre-existing warnings hipStreamDestroy nodiscard) |

## 🧪 Build / Test

```bash
cmake --build build --target test_core_main -j 32   # OK
./build/tests/test_core_main                        # no FAILs
```

- **Сборка**: 0 ошибок, предупреждения pre-existing (hipStreamDestroy nodiscard в test_rocm_external_context.hpp, test_hybrid_external_context.hpp — не связано с B1).
- **Test suite `profiling_conversions`**: 4/4 PASS
- **Общий test_core_main**: все pre-existing тесты по-прежнему PASS (ConsoleOutput 400/400, ServiceManager, PrintReport 320 events, Storage services, ROCm backend — всё зелёное, нет регрессий).

## 📝 Round 3 REVIEW decisions применены

| Ruling | Решение | Применение |
|--------|---------|-----------|
| **C3** | counters как `std::map<string, double>` | ✅ в ProfilingRecord |
| **R4** | `record_from_rocm` free function | ✅ в profiling_conversions.hpp |
| **W4** | composite `record_index = (gpu_id << 48) \| local_idx` | ✅ поле + mock в тесте 4 |
| R5-R7 | enum'ы BottleneckType / BottleneckThresholds / MaxRecordsPolicy | ⏳ Phase C (Strategy) — не здесь |

## 📂 Files changed/added

| Файл | Тип | Строк |
|------|-----|-------|
| `core/include/core/services/profiling_types.hpp` | M | +89 |
| `core/include/core/services/profiling_conversions.hpp` | A | +67 |
| `core/tests/test_profiling_conversions.hpp` | A | +230 |
| `core/tests/all_test.hpp` | M | +4 |

**Итого**: 2 новых файла, 2 модифицированных, commit `3e79dcd`, +426 строк.

## 🚦 Side issues / Notes

- `ctest --test-dir build` не нашёл тестов — в `core/tests/CMakeLists.txt` нет `add_test()` / `enable_testing()`. Это существующий порядок проекта (тесты запускаются как `./build/tests/test_core_main` напрямую). Не меняю без согласования — подпадает под запрет на CMake-правки.
- В спеке использовался `ASSERT_EQ / ASSERT_NEAR`-стиль (Google-Test-подобный), но проект такого framework'а не имеет — соседние тесты возвращают `bool` и печатают `[PASS]/[FAIL]`. Реализованы локальные макросы `PC_ASSERT*`, стиль согласован с `test_services.hpp`, `test_gpu_profiler.hpp`.
- В первой итерации тест 4 падал на `ExecTimeMs` с допуском `1e-6` мс из-за truncation `uint64_t(duration_ms * 1e6)` в `MakeRocmFromDurationMs` для dur=1.49 ms. Ослаблен до `2e-6` мс (2 нс) с комментарием.

## ➡️ Next phase

**B2 — ProfileStore**: использовать `ProfilingRecord` и `record_from_rocm`, реализовать `ProfileStore::Append()` с per-shard counter и composite `record_index = (gpu_id << 48) | local_idx`. Логика композита уже протестирована в моке (B1.4).

---

*Report by Кодо | 2026-04-20 | task-profiler-v2 (B1)*
