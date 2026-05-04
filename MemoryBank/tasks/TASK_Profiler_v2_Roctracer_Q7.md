# TASK: Profiler v2 — Q7 rocprofiler-sdk integration (full 5-field GPU timing)

> **Дата создания**: 2026-04-27 · **Обновлено**: 2026-05-04 (планирование + 4 decisions)
> **Effort**: **15-22 ч** (rocprofiler-sdk без counters; counters → отдельный Q7.F +6-8 ч)
> **Scope**: `core/services/profiling/` + `core/CMakeLists.txt` + новые тесты
> **Платформа**: ROCm 7.2 + GPU (Debian + RX 9070 gfx1201, опц. MI100 gfx908)

---

## 🎯 Цель

Заменить «hipEvent-only» источник тайминга на **rocprofiler-sdk** (modern ROCm 7+ API), что даст реальные GPU-clock значения для всех 5 полей `ProfilingRecord`:

| Поле | Сейчас | После Q7 |
|------|--------|----------|
| `queued_ns`   | 0 | GPU host enqueue clock |
| `submit_ns`   | 0 | GPU submit clock |
| `start_ns`    | hipEventElapsedTime от reference event | GPU kernel start clock |
| `end_ns`      | hipEventElapsedTime от reference event | GPU kernel end clock |
| `complete_ns` | 0 | GPU completion clock |

Дополнительно появляются классификационные поля (уже зарезервированы в `ProfilingRecord`):
- `domain` (HIP API / HIP Activity / HSA)
- `kind` (kernel / copy / barrier / marker)
- `op` (HIP operation code)
- `correlation_id` (links API call → GPU execution)
- `queue_id` (stream/queue ID)

Counters (LDSBankConflict, L2CacheHit, ...) — **отдельным Q7.F**, не в этом таске.

---

## ✅ 4 Decisions (приняты Alex 2026-05-04)

| # | Вопрос | Решение |
|---|--------|---------|
| **D1** | roctracer (legacy) vs rocprofiler-sdk (modern)? | **rocprofiler-sdk** — official ROCm 7+ API, future-proof. roctracer DEPRECATED. |
| **D2** | Зависимость от `TASK_Profiler_v2_Documentation`? | **Без блокировки** — код стабильный (123 теста PASS), doc-polish мин. в Q7.E. |
| **D3** | Filtering policy α / β / γ? | **α + blacklist**: фильтр `kind=kernel|memcpy` + блок `rocfft_*`/`rocblas_*` имён. |
| **D4** | Counters — внутри Q7 или отдельным таском? | **Отдельным Q7.F** — 50+ метрик, hardware-зависимые, +6-8 ч. |

---

## 🚦 Когда это нужно (а когда — нет)

### Нужно когда:
- Уперлись в микро-оптимизацию hot-path и видим «kernel занимает X µs, а пайплайн теряет 2X µs где-то ещё»
- Хотим знать «kernel ждал отправки 800 µs из-за чужого hipMalloc другим потоком»
- Анализируем многопоточные сценарии с конкуренцией за queue
- Есть запрос на hardware counters для оптимизации (это уже Q7.F)

### НЕ нужно когда:
- Профилируем benchmark одного класса в изоляции — hipEvent даёт kernel time с точностью ±0.5 µs, остальные поля для одиночного benchmark неинформативны
- Хотим стабильности — rocprofiler ловит **все** HIP-вызовы процесса (включая hipFFT, rocBLAS), фильтрация требует осторожности
- Работаем в production hot-path без выключателя — overhead на каждом HIP API

**Поэтому**: rocprofiler-sdk source — **opt-in** через CMake-флаг + runtime API, **default = HipEvent** (zero regression).

---

## 🏗 Архитектурные решения

### A1. Source policy — runtime switch

```cpp
namespace drv_gpu_lib::profiling {

enum class TimingSource {
    HipEvent,    // default, текущий — простой и стабильный
    Rocprofiler  // полный 5-field timing, требует rocprofiler-sdk init
};

// В ProfilingFacade:
void SetTimingSource(TimingSource src);
TimingSource GetTimingSource() const;

}
```

**По умолчанию** — `HipEvent` (текущее поведение, ноль регрессий).
**Включается** через configGPU.json или явный API.

### A2. Источники как отдельные классы (SRP)

Не сливать с `ProfileStore`. Чистое разделение SRP:

```
RocprofilerTimingSource  ── push records ──→  ProfileStore (existing)
                                              ↑
                                  ProfilingFacade → выбирает source
```

**Файлы**:

```
core/include/core/services/profiling/
  ├── i_timing_source.hpp                    # интерфейс (NEW)
  ├── hip_event_timing_source.hpp            # текущий путь (NEW, refactor existing)
  ├── rocprofiler_timing_source.hpp          # новый (NEW, opt-in)
  └── timing_source_factory.hpp              # выбор по TimingSource enum (NEW)

core/src/services/profiling/
  ├── hip_event_timing_source.cpp
  ├── rocprofiler_timing_source.cpp          # под #if DSP_PROFILING_ROCTRACER
  └── timing_source_factory.cpp
```

`IProfilingTimingSource` интерфейс:
```cpp
class IProfilingTimingSource {
public:
    virtual ~IProfilingTimingSource() = default;
    virtual void Start() = 0;
    virtual void Stop() = 0;
    virtual void OnGpuEvent(int gpu_id, hipEvent_t e, ...) = 0;  // hot path (HipEvent)
    virtual std::vector<ProfilingRecord> Drain() = 0;             // worker thread
};
```

### A3. CMake — opt-in через флаг

```cmake
# core/CMakeLists.txt
option(DSP_PROFILING_ROCTRACER "Enable rocprofiler-sdk-based 5-field GPU timing" OFF)

if (DSP_PROFILING_ROCTRACER)
  find_package(rocprofiler-sdk REQUIRED)
  target_compile_definitions(DspCore PRIVATE DSP_PROFILING_ROCTRACER=1)
  target_link_libraries(DspCore PRIVATE rocprofiler-sdk::rocprofiler-sdk)
endif()
```

**По умолчанию OFF** — Q7 opt-in.

### A4. Корреляция API ↔ activity

rocprofiler-sdk выдаёт два потока:
1. **API callbacks** (callback tracing) — `hipLaunchKernel(...)` enter/exit (host-side)
2. **Activity records** (buffered tracing) — kernel выполнен на GPU (GPU-side)

Связь — `correlation_id`. Один `ProfilingRecord` собирается из **обоих**:

```
[host] API callback ENTER  → start API timer, save correlation_id
[host] API callback EXIT   → end API timer (queue + submit time)
[gpu]  Activity buffer flush → start_ns / end_ns / complete_ns (GPU clock)
```

```cpp
class RocprofilerTimingSource {
    std::unordered_map<uint64_t, PartialRecord> pending_;  // by correlation_id
    std::mutex pending_mu_;

    void OnApiCallback(...);
    void OnActivityRecord(...);  // когда оба пришли → push в drain queue
};
```

### A5. Filtering policy = α + blacklist (D3)

- Фильтр по `kind ∈ {kernel, memcpy_h2d, memcpy_d2h, memcpy_d2d}`
- Blacklist по `kernel_name`: `rocfft_*`, `rocblas_*`, `rocsolver_*` (чужие либы — мы их и так профилируем как часть пайплайна верхнего уровня)

### A6. Queue/stream identification

`queue_id` — `(uint64_t) hipStream_t` или через rocprofiler `dispatch_info.queue_id`.

### A7. Перформанс overhead и quality gates

- API callback overhead: ~200-500 ns на каждом HIP API call (ожидание)
- Activity buffer flush: батч-операция, амортизирует
- Quality gate **G8 (Record < 1µs)** валиден **в HipEvent mode**
- Для Rocprofiler mode — отдельный **G8R (Record < 5µs)**

---

## 📋 Фазы Q7.0 → Q7.E

### Q7.0 — Decision spike (1-2 ч)

**Цель**: убедиться что rocprofiler-sdk работает на gfx1201 (RX 9070) + зафиксировать API диалект.

**Шаги**:
1. Скопировать AMD sample `api_callback_tracing` в `core/spike/rocprofiler_q70/`
2. Собрать standalone (вне CMake) через `hipcc` или `g++` + `-lrocprofiler-sdk`
3. Запустить, убедиться что callback'и приходят
4. Зафиксировать API диалект + квирки → `MemoryBank/specs/Rocprofiler_API_2026-05-04.md`

**Acceptance**:
- Sample собрался + запустился + ловит ≥ 1 HIP API call
- Спека `Rocprofiler_API_*.md` создана с примерами API + квирками

---

### Q7.A — IProfilingTimingSource + рефактор HipEvent (3-4 ч)

**Цель**: вынести текущую логику hipEvent в отдельный класс, реализующий новый интерфейс. Регрессии = 0.

1. Создать `core/include/core/services/profiling/i_timing_source.hpp`.
2. Создать `core/include/core/services/profiling/hip_event_timing_source.hpp` + `.cpp` — обернуть текущий путь `record_from_rocm()`.
3. `ProfilingFacade::Impl` — добавить `std::unique_ptr<IProfilingTimingSource> source_`, default = `HipEventTimingSource`. Public API не меняется.
4. Все существующие тесты `test_profiling_facade.hpp`, `test_phase_c_gate2.hpp` — должны пройти **без изменений**.

**Acceptance**:
- `ctest --test-dir core/build` — все 123 PASS / 0 FAIL (как до Q7.A)
- В коде нет дублирования логики hipEvent (DRY)
- ProfilingFacade public API без изменений (Python bindings не ломаются)

---

### Q7.B — Standalone rocprofiler spike (2-3 ч)

**Цель**: написать минимальный `core/spike/rocprofiler_spike.cpp` со своим kernel'ом, поймать 5 полей timing.

1. `core/spike/rocprofiler_spike.cpp` — отдельный exe вне CMake (build через скрипт).
2. Setup rocprofiler-sdk:
   - `rocprofiler_create_context`
   - `rocprofiler_configure_buffer_tracing_service` для kernel dispatch
   - `rocprofiler_configure_callback_tracing_service` для HIP API
3. `simple_kernel<<<>>>` × 5 раз
4. Drain buffer → парсинг record'ов → печать `queued_ns/submit_ns/start_ns/end_ns/complete_ns`

**Acceptance**:
- Spike печатает 5 полей timing для каждого из 5 kernel'ов
- `correlation_id` уникальный для каждого kernel'а
- Можно ссылаться на спайк в Q7.C как образец

---

### Q7.C — RocprofilerTimingSource + CMake opt-in (5-7 ч)

**Цель**: реализовать rocprofiler-источник за интерфейсом из Q7.A.

1. **CMake-правка** (A3): `option(DSP_PROFILING_ROCTRACER OFF)` + `find_package(rocprofiler-sdk)` + `target_link_libraries`. **DIFF Alex**, ждать OK.
2. `rocprofiler_timing_source.{hpp,cpp}`:
   - `Start()`: создание rocprofiler context + регистрация buffer/callback services
   - `OnGpuEvent`: no-op (rocprofiler ловит сам)
   - `Drain()`: rocprofiler flush + парсинг activity record'ов → `ProfilingRecord`
   - `Stop()`: stop_context + destroy
3. Корреляция API ↔ activity (A4) — `pending_` map по `correlation_id`.
4. Фильтрация (A5): kind α + blacklist `rocfft_*` / `rocblas_*` / `rocsolver_*`.
5. `TimingSourceFactory::Create(TimingSource src)` — выбор реализации (compile-time `#if DSP_PROFILING_ROCTRACER`).
6. `ProfilingFacade::SetTimingSource(TimingSource)` — public API.

**Acceptance**:
- Сборка с `-DDSP_PROFILING_ROCTRACER=ON` зелёная
- Сборка по умолчанию (без флага) — без изменений (default OFF)
- Mini-test: `ProfilingFacade::SetTimingSource(Rocprofiler)` + один kernel → `ProfilingRecord` имеет все 5 полей не нулями + `correlation_id != 0`

---

### Q7.D — Тесты (3-4 ч)

**Файлы**:

1. `core/tests/test_rocprofiler_timing_source.hpp` (NEW):
   - `TestStartStop_NoLeak` — 100× Start+Stop, проверка что нет утечки FD/handle
   - `TestSingleKernel_Captures5Fields` — один kernel → record с `queued_ns < submit_ns < start_ns < end_ns < complete_ns`
   - `TestMultipleKernels_DistinctCorrelationIds` — 10 kernel'ов → 10 разных `correlation_id`
   - `TestFilter_IgnoresHipfft` — запустить FFT через hipFFT → запись с `kernel_name LIKE "rocfft_*"` отфильтрована
   - `TestSwitchSourceMidSession_Safe` — Reset + переключить source → Reset снова → ок

2. `core/tests/test_rocprofiler_correlation.hpp` (NEW):
   - `TestApiCallbackEnter_PartialRecord` — API enter без exit → record не пушится (висит в pending)
   - `TestApiCallbackExit_PromotesPartial` — enter+exit + activity → record попадает в Drain
   - `TestActivityWithoutApi_Discarded` — activity без correlation_id → отфильтровано

3. `core/tests/test_rocprofiler_quality_gates.hpp` (NEW):
   - `TestQGR8_RoctracerRecordLatency_Under5us` — overhead на API < 5 µs
   - `TestQGR9_RoctracerMemory_Under500MB` — 100K records не превышают 500 MB

4. **Cross-repo smoke** (опц., если успеваем):
   - `spectrum/tests/test_fft_benchmark_rocm.hpp` — добавить второй прогон с `TimingSource::Rocprofiler` и сравнить с hipEvent: `start_ns/end_ns` должны совпадать в пределах ±2 µs.

**Acceptance**:
- Все новые тесты PASS на gfx1201
- Существующие 123 тесты — без регрессий
- Quality gates G8R / G9R вписываются в budget

---

### Q7.E — Documentation polish (1-2 ч)

**Цель**: задокументировать rocprofiler-режим минимально (полный Full.md — отдельный таск Documentation).

1. **`06-profiling.md`** — раздел «Timing Source Policy»:
   - Таблица HipEvent vs Rocprofiler (когда что)
   - `SetTimingSource(TimingSource::Rocprofiler)` пример
   - Default = HipEvent
2. **`MemoryBank/specs/GPUProfiler_Rewrite_Proposal_2026-04-16.md`** — section 21+22 update:
   - Q7 status: DONE (5-field timing) / DEFERRED (counters в Q7.F)
3. **`MemoryBank/sessions/profiler_v2_q7_done_<date>.md`** — финальный отчёт сессии.

**Acceptance**:
- 06-profiling.md обновлён секцией про timing source
- Спека section 21-22 отмечена DONE
- Session log на месте

---

## ✅ Acceptance Criteria для Q7 (целиком)

| # | Критерий | Проверка |
|---|----------|----------|
| 1 | `IProfilingTimingSource` интерфейс существует | `ls core/include/core/services/profiling/i_timing_source.hpp` |
| 2 | `HipEvent`/`Rocprofiler` источники реализуют интерфейс | grep `class.*: public IProfilingTimingSource` |
| 3 | Default source = HipEvent (zero regression) | `ctest --test-dir core/build` 123 PASS |
| 4 | Rocprofiler source через CMake-флаг | `cmake -DDSP_PROFILING_ROCTRACER=ON` зелёная сборка |
| 5 | Rocprofiler заполняет все 5 полей | unit-тест `TestSingleKernel_Captures5Fields` PASS |
| 6 | Корреляция API ↔ activity работает | `TestApiCallbackExit_PromotesPartial` PASS |
| 7 | Фильтрация чужих kernel'ов работает | `TestFilter_IgnoresHipfft` PASS |
| 8 | Quality gates под rocprofiler вписываются | G8R / G9R PASS |
| 9 | Документация обновлена | 06-profiling.md + спека section 21-22 |

---

## 🚫 Запреты / риски

### Запреты

- **CMake `find_package(rocprofiler-sdk)` без OK Alex** — добавляем новую зависимость (правило 12-cmake-build).
- **Не включать DSP_PROFILING_ROCTRACER по умолчанию** — opt-in.
- **Не ломать hipEvent path** — он остаётся production default.
- **rocprofiler counters — отдельным таском Q7.F**.

### Риски

| Риск | Митигация |
|------|-----------|
| rocprofiler-sdk overhead ломает G8 < 1µs | 2 source modes — G8 для HipEvent, G8R для Rocprofiler |
| Activity buffer overflow при бенчах | `rocprofiler_flush_buffer` периодически в worker thread |
| Чужие либы (hipFFT/rocBLAS) шумят | Filter α + blacklist (D3) |
| Multi-stream корреляция теряется | `queue_id` в `ProfilingRecord` + group by stream |
| MI100 vs gfx1201 разные API детали | Тестить на обоих в Q7.D (если оба доступны) |

---

## 📞 Когда спрашивать Alex

- **Перед Q7.C CMake-правкой** — DIFF + ждать OK
- **На вопросе rocprofiler counters** — Q7.F отдельным таском (уже решено)
- **По завершении Q7.E** — статус-отчёт перед merge в main

---

## 🔗 Ссылки

- Спека: `MemoryBank/specs/GPUProfiler_Rewrite_Proposal_2026-04-16.md` (Q7 в section 21, поля в section 14.2 ProfilingRecord)
- Текущий ProfilingFacade: `core/include/core/services/profiling/profiling_facade.hpp`
- ROCm 7 rocprofiler-sdk: https://rocm.docs.amd.com/projects/rocprofiler-sdk/
- AMD samples (на машине): `/opt/rocm/share/rocprofiler-sdk/samples/api_callback_tracing/`

---

## 📜 Changelog

| Дата | Изменение |
|------|-----------|
| 2026-04-27 | Создан таск (Phase E closeout) |
| 2026-05-04 | Обновлён: 4 decisions приняты (D1=rocprofiler-sdk, D2=без блокировки, D3=α+blacklist, D4=Q7.F отдельный). Effort 16-24 → 15-22 ч. Phase Q7.A→Q7.E. |

---

*Created: 2026-04-27 by Кодо. Updated: 2026-05-04. Owner: текущая сессия.*
