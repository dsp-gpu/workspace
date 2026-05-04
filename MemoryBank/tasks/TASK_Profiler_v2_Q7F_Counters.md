# TASK: Profiler v2 — Q7.F dispatch counters (rocprofiler-sdk)

> **Дата создания**: 2026-05-04 (после Q7 5-field timing DONE)
> **Effort**: ~3-5 часов (implementation + tests + doc)
> **Scope**: `core/services/profiling/rocprofiler_timing_source.cpp` (extend) +
>          `i_timing_source.hpp` (опц. SetCounters API) + tests
> **Платформа**: ROCm 7.2 + GPU (gfx1201)
> **Зависит от**: ✅ Q7 DONE (RocprofilerTimingSource базовый функционал готов)

---

## 🎯 Цель

Опционально собирать **hardware performance counters** (LDSBankConflict, L2CacheHit, GPUBusy и т.д.) во время kernel dispatch и записывать в `ProfilingRecord.counters` (поле уже есть как `std::map<std::string, double>`).

**Не**:
- Не делаем hardware-зависимые presets (gfx1201 vs gfx908 разный набор) — пользователь явно указывает counter names
- Не enable counters by default — opt-in через `SetCounters(...)` (overhead +10-50%)

---

## 4 Decisions (на согласование с Alex)

| # | Вопрос | Рекомендация |
|---|--------|--------------|
| **D1** | API подписки: `dispatch_counting_service` (callback per-dispatch) vs `agent_counting_service` (per-agent global) | **dispatch_counting_service** — нужен per-kernel запас counters в `ProfilingRecord` |
| **D2** | Counter set: per-call (динамика) vs per-context (один set на сессию) | **per-context** через `SetCounters(vec<string>)`. Caller указывает один раз перед `Start()`. |
| **D3** | Default counter set | **Пустой** (opt-in). Документируем «полезный минимум» в спеке: GPUBusy, L2CacheHit, LDSBankConflict, FetchSize, WriteSize. |
| **D4** | Что делать если counter не поддерживается на agent (gfx)? | Silent skip + один `DRVGPU_LOG_WARNING` (если Logger готов). Не падать. |

---

## 📋 Phases

### Q7.F.0 — Recon (готово)

- ✅ Counter API headers: `<rocprofiler-sdk/dispatch_counting_service.h>` + `<rocprofiler-sdk/counters.h>`
- ✅ Sample reference: `/opt/rocm/share/rocprofiler-sdk/samples/counter_collection/callback_client.cpp`
- ✅ 252 counter definitions в `/opt/rocm/share/rocprofiler-sdk/counter_defs.yaml`
- ✅ gfx1201 поддерживает все основные: GPUBusy, L2CacheHit, LDSBankConflict, FetchSize, ...

### Q7.F.A — API + RocprofilerTimingSource extension (1.5-2 ч)

1. `IProfilingTimingSource::SetCounters(vec<string>)` — virtual метод (default no-op для HipEvent).
2. `ProfilingFacade::SetCounters(vec<string>)` — passthrough в текущий source.
3. `RocprofilerTimingSource`:
   - В `Impl` добавить `std::vector<std::string> counter_names_`, `unordered_map<uint64_t, vector<rocprofiler_counter_id_t>> agent_counters_`
   - В `Start()`:
     - Если `counter_names_` не пуст — для каждого agent резолвить counter_id (callback `rocprofiler_iterate_agent_supported_counters`)
     - Создать `rocprofiler_counter_config_id_t` через `rocprofiler_create_counter_config`
     - Регистрировать `rocprofiler_configure_callback_dispatch_counting_service`
   - В `record_callback` — заполнять `ProfilingRecord.counters[name] = value` (через id→name lookup)

### Q7.F.B — Tests (1 ч)

`core/tests/test_rocprofiler_counters.hpp`:
- `TestSetCountersEmpty_NoOp` — default behavior без counters: ProfilingRecord.counters пуст
- `TestSetCounters_HipEventNoOp` — `SetCounters(...)` на HipEvent — silent ignore
- `TestSetCounters_SkippedWithoutFlag` — без `DSP_PROFILING_ROCTRACER=ON` — fallback graceful

### Q7.F.C — Doc polish (15-30 мин)

- `06-profiling.md` — секция «Hardware counters (Q7.F)»: примеры, overhead warning
- `Rocprofiler_API_2026-05-04.md` — раздел про counter API
- Спека section 21 — Q7.F status DONE

---

## ✅ Acceptance

| # | Критерий | Проверка |
|---|----------|----------|
| 1 | `SetCounters(vec<string>)` в `ProfilingFacade` public API | grep |
| 2 | Default = пустой counter set (opt-in) | unit-test `SetCountersEmpty_NoOp` |
| 3 | HipEvent игнорирует SetCounters | unit-test `SetCounters_HipEventNoOp` |
| 4 | Без CMake флага graceful fallback | unit-test `SetCounters_SkippedWithoutFlag` |
| 5 | Доки обновлены | grep "Hardware counters" в 06-profiling.md |

**Эмпирическая верификация на GPU** (опц., если время есть):
- `SetCounters({"GPUBusy", "L2CacheHit"})` + один kernel → ProfilingRecord.counters содержит оба значения

---

## 🚫 Запреты

- **Не enable counters by default** — overhead не для production hot path.
- **Не делать hardware preset'ы** (gfx1201 vs gfx908 — разные expressions у некоторых counters).
- **Не падать при unsupported counter** — silent skip + warning.

---

## 📞 Когда спрашивать Alex

- **Перед началом** — OK на 4 decisions.
- **Перед Q7.F.A** — нет CMake-правок (используем существующий `DSP_PROFILING_ROCTRACER`).
- **По завершении Q7.F.C** — final report.

---

*Created: 2026-05-04 (Q7.F decision document). Owner: текущая сессия.*
