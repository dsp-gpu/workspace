# TASK: Profiler v2 — Q7 roctracer integration (full 5-field GPU timing)

> **Дата создания**: 2026-04-27
> **Effort**: 16-24 часа (без rocprofiler counters), +6-8 ч с counters
> **Scope**: `core/services/profiling/` + `core/CMakeLists.txt` + новые тесты
> **Зависит от**: `TASK_Profiler_v2_Documentation DONE` (нужен стабильный baseline)
> **Требует**: ROCm 7.2 + GPU (Debian + RX 9070 / MI100), OK Alex на CMake

---

## 🎯 Цель

Заменить «hipEvent-only» источник тайминга на **roctracer activity domain**, что
даст реальные GPU-clock значения для всех 5 полей `ProfilingRecord`:

| Поле | Сейчас | После Q7 |
|------|--------|----------|
| `queued_ns`   | 0 или приближение от host clock | GPU host enqueue clock |
| `submit_ns`   | 0 или приближение от host clock | GPU submit clock |
| `start_ns`    | hipEventElapsedTime от reference event | GPU kernel start clock |
| `end_ns`      | hipEventElapsedTime от reference event | GPU kernel end clock |
| `complete_ns` | 0 или приближение от host clock | GPU completion clock |

Дополнительно появляются классификационные поля (уже зарезервированы в
`ProfilingRecord:335-348`):
- `domain` (HIP API / HIP Activity / HSA)
- `kind` (kernel / copy / barrier / marker)
- `op` (HIP operation code)
- `correlation_id` (links API call → GPU execution)
- `queue_id` (stream/queue ID)

И опционально (если включить rocprofiler-sdk):
- `counters` map: VALUBusy / SALUBusy / MemUnitBusy / L2CacheHit / LDSBankConflict / ...

---

## 🚦 Когда это нужно (а когда — нет)

### Нужно когда:
- Уперлись в микро-оптимизацию hot-path и видим «kernel занимает X µs, а
  пайплайн теряет 2X µs где-то ещё» — и не понимаем где
- Хотим знать «kernel ждал отправки 800 µs из-за чужого hipMalloc другим потоком»
- Анализируем многопоточные сценарии с конкуренцией за queue
- Есть запрос на hardware counters (LDSBankConflict, L2CacheHit) для оптимизации

### НЕ нужно когда:
- Профилируем benchmark одного класса в изоляции — hipEvent даёт kernel time с
  точностью ±0.5 µs, остальные поля для одиночного benchmark неинформативны
- Хотим стабильности — roctracer ловит **все** HIP-вызовы процесса (включая
  hipFFT, rocBLAS, чужие либы), фильтрация требует осторожности
- Работаем в production hot-path без выключателя — overhead на каждом HIP API

---

## 🏗 Архитектурные решения (на согласование с Alex до начала)

### A1. Source policy — runtime switch

Не заменяем hipEvent collector полностью, а добавляем **второй** источник:

```cpp
namespace drv_gpu_lib::profiling {

enum class TimingSource {
    HipEvent,    // default, текущий — простой и стабильный
    Roctracer,   // полный 5-field timing, требует roctracer init
    Rocprofiler  // Roctracer + counters (отдельная фаза, опционально)
};

// В ProfilingFacade:
void SetTimingSource(TimingSource src);
TimingSource GetTimingSource() const;

}
```

**По умолчанию** — `HipEvent` (текущее поведение, ноль регрессий).
**Включается** через configGPU.json или явный API.

### A2. Roctracer collector — отдельный класс

Не сливать с `ProfileStore`. Чистое разделение SRP:

```
RoctracerCollector  ── push records ──→  ProfileStore (existing)
                                         ↑
                          ProfilingFacade → переключает source
```

**Файлы**:

```
core/include/core/services/profiling/
  ├── i_timing_source.hpp                  # интерфейс (NEW)
  ├── hip_event_timing_source.hpp          # текущий путь (NEW, refactor existing)
  ├── roctracer_timing_source.hpp          # новый (NEW)
  └── timing_source_factory.hpp            # выбор по TimingSource enum (NEW)

core/src/services/profiling/
  ├── hip_event_timing_source.cpp
  ├── roctracer_timing_source.cpp
  └── timing_source_factory.cpp
```

`IProfilingTimingSource` интерфейс:
```cpp
class IProfilingTimingSource {
public:
    virtual ~IProfilingTimingSource() = default;
    virtual void Start() = 0;
    virtual void Stop() = 0;
    virtual void OnGpuEvent(int gpu_id, hipEvent_t e, ...) = 0;  // hot path
    virtual std::vector<ProfilingRecord> Drain() = 0;             // worker thread
};
```

### A3. CMake — find_package(roctracer) опционально

```cmake
# core/CMakeLists.txt
option(DSP_PROFILING_ROCTRACER "Enable roctracer-based 5-field GPU timing" OFF)

if (DSP_PROFILING_ROCTRACER)
  find_package(roctracer QUIET)
  if (NOT roctracer_FOUND)
    # ROCm 7+ — fallback на rocprofiler-sdk
    find_package(rocprofiler-sdk QUIET)
  endif()
  if (NOT roctracer_FOUND AND NOT rocprofiler-sdk_FOUND)
    message(FATAL_ERROR "DSP_PROFILING_ROCTRACER=ON но ни roctracer ни rocprofiler-sdk не найдены в /opt/rocm/")
  endif()
  target_compile_definitions(DspCore PRIVATE DSP_PROFILING_ROCTRACER=1)
  target_link_libraries(DspCore PRIVATE roc::roctracer64)
endif()
```

**По умолчанию OFF** — Q7 опт-ин.

### A4. Корреляция API ↔ activity

Roctracer выдаёт два потока:
1. **API callbacks** — `hipLaunchKernel(...)` начался / закончился (host-side)
2. **Activity records** — kernel выполнен на GPU (GPU-side)

Связь — `correlation_id`. Один `ProfilingRecord` собирается из **обоих**:

```
[host] API callback ENTER  → start API timer, save correlation_id
[host] API callback EXIT   → end API timer (queue + submit time)
[gpu]  Activity record     → start_ns / end_ns / complete_ns (GPU clock)
```

**Реализация**:
```cpp
class RoctracerTimingSource {
    std::unordered_map<uint64_t, PartialRecord> pending_;  // by correlation_id
    std::mutex pending_mu_;

    void OnApiCallback(...);
    void OnActivityRecord(...);  // когда оба пришли → push в drain queue
};
```

### A5. Filtering policy

Roctracer ловит ВСЕ HIP вызовы. Нам нужны только наши kernel'ы. Варианты:

**Вариант α** — фильтр по `hipLaunchKernel + hipMemcpy*` (kind=kernel/copy):
- Простой, но всё ещё ловит чужие либы (hipFFT/rocBLAS — это тоже kernel'ы)

**Вариант β** — фильтр по `kernel_name` regex (наши имена начинаются с `dsp_*`):
- Точно, но требует disciplined naming в kernel'ах. Сейчас имена разнобой.

**Вариант γ** — wrap область интереса в `hipRangePush("dsp_module")` /
`hipRangePop()` маркер, фильтруем только активность внутри марк-диапазона:
- Чисто, но требует правки всех benchmark'ов (push/pop вокруг измерительного цикла)

**Рекомендация**: начать с **α** + filter blacklist для известных шумных
библиотек (hipfft / rocblas — мы их и так профилируем как часть пайплайна).
**β** — поверх если будут проблемы. **γ** — для будущего, не сейчас.

### A6. Queue/stream identification

`queue_id` нужен чтобы различать «эта запись на нашем DrvGPU stream» vs «чужой
stream от спектра». Решение: при `DrvGPU::Create()` сохранять `hipStream_t` и
конвертить в `queue_id` через `hipStreamGetCaptureInfo` или просто `(uint64_t)
stream_handle`.

### A7. Перформанс overhead

Замеры с roctracer (предварительные ожидания):
- API callback overhead: ~200-500 ns на каждом HIP API call
- Activity buffer flush: батч-операция, амортизирует
- Memory: roctracer ring buffer ~10 MB по умолчанию, конфигурируется

**Quality gate G8 (Record < 1µs)** должен оставаться валидным **в HipEvent
mode**. Для Roctracer mode — отдельный G8R (Record < 5µs).

---

## 📋 Шаги (фазы Q7.A → Q7.E)

### Q7.A — Spike + ROCm version sanity (2-3 ч)

**Цель**: убедиться что roctracer/rocprofiler-sdk работает на нашей системе и
понять API диалект.

1. Найти headers:
   ```bash
   find /opt/rocm/include -name 'roctracer*.h' -o -name 'rocprofiler*.h' | head
   ```
2. Посмотреть AMD samples:
   ```bash
   find /opt/rocm/share -name '*roctracer*sample*' -o -path '*roctracer*samples*'
   ```
3. Mini-spike `core/spike/roctracer_test.cpp` — независимый exe вне CMake:
   - `roctracer_open_pool` + `hipLaunchKernel(simple_kernel)` + `roctracer_flush_buf`
   - Проверить что callback'и приходят и заполняются `start_ns/end_ns`
4. Зафиксировать ROCm version + roctracer API диалект → `MemoryBank/specs/Roctracer_API_2026-XX-XX.md`
5. Решить с Alex: `roctracer` (legacy) vs `rocprofiler-sdk` (ROCm 7+ official)

**Acceptance**:
- Spike-программа успешно ловит ≥ 1 kernel и печатает 5 полей timing'а
- Спека `Roctracer_API_*.md` создана с примерами API

---

### Q7.B — IProfilingTimingSource + рефактор HipEvent (3-4 ч)

**Цель**: вынести текущую логику hipEvent в отдельный класс, реализующий новый
интерфейс, без изменения поведения. Регрессии = 0.

1. Создать `core/include/core/services/profiling/i_timing_source.hpp` с
   интерфейсом из A2.
2. Создать `core/include/core/services/profiling/hip_event_timing_source.hpp`
   и `core/src/services/profiling/hip_event_timing_source.cpp` — обернуть
   текущую логику `record_from_rocm()` (он уже почти готов как timing source).
3. `ProfilingFacade::Impl` — добавить `std::unique_ptr<IProfilingTimingSource> source_`,
   default = `HipEventTimingSource`. Public API не меняется.
4. Все существующие тесты `test_profiling_facade.hpp`, `test_phase_c_gate2.hpp` —
   должны пройти **без изменений**.

**Acceptance**:
- `ctest --test-dir core/build` — все 123 PASS / 0 FAIL (как до Q7.B)
- В коде нет дублирования логики hipEvent (DRY)
- ProfilingFacade public API без изменений (Python bindings не ломаются)

---

### Q7.C — RoctracerTimingSource (5-7 ч)

**Цель**: реализовать roctracer-источник за интерфейсом из Q7.B.

1. CMake-правка (A3): `option(DSP_PROFILING_ROCTRACER OFF)` + `find_package` +
   `target_link_libraries`. **DIFF Alex**, ждать OK.
2. `core/include/core/services/profiling/roctracer_timing_source.hpp` +
   `.cpp`:
   - `Start()`: `roctracer_set_properties` + `roctracer_enable_callback` +
     `roctracer_open_pool`
   - `OnGpuEvent`: no-op (roctracer ловит сам)
   - `Drain()`: `roctracer_flush_buf` → парсинг activity record'ов → ProfilingRecord
   - `Stop()`: `roctracer_disable_callback` + `roctracer_close_pool`
3. Корреляция API ↔ activity (A4) — partial-record map.
4. Фильтрация (A5 Вариант α + blacklist).
5. `TimingSourceFactory::Create(TimingSource src)` — выбор реализации.
6. `ProfilingFacade::SetTimingSource(TimingSource)` — public API.

**Acceptance**:
- Сборка с `-DDSP_PROFILING_ROCTRACER=ON` зелёная
- Сборка по умолчанию (без флага) — без изменений (default OFF)
- Mini-test: `ProfilingFacade::SetTimingSource(Roctracer)` + один kernel →
  `ProfilingRecord` имеет все 5 полей не нулями + `correlation_id != 0`

---

### Q7.D — Тесты (3-4 ч)

**Цель**: гарантировать корректность и неломаемость.

**Файлы**:

1. `core/tests/test_roctracer_timing_source.hpp` (NEW):
   - `TestStartStop_NoLeak` — 100 раз Start+Stop, проверка что нет утечки FD/handle
   - `TestSingleKernel_Captures5Fields` — один kernel → record c
     `queued_ns < submit_ns < start_ns < end_ns < complete_ns`
   - `TestMultipleKernels_DistinctCorrelationIds` — 10 kernel'ов → 10 разных
     correlation_id
   - `TestFilter_IgnoresHipfft` — запустить FFT через hipFFT → запись с
     `kernel_name LIKE "rocfft_*"` отфильтрована
   - `TestSwitchSourceMidSession_Safe` — Reset + переключить source →
     Reset снова → ок

2. `core/tests/test_roctracer_correlation.hpp` (NEW):
   - `TestApiCallbackEnter_PartialRecord` — API enter без exit → record не
     пушится (висит в pending)
   - `TestApiCallbackExit_PromotesPartial` — enter+exit + activity → record
     попадает в Drain
   - `TestActivityWithoutApi_Discarded` — activity без correlation_id (от
     rocBLAS внутренних kernel'ов) → отфильтровано

3. `core/tests/test_roctracer_quality_gates.hpp` (NEW):
   - `TestQGR8_RoctracerRecordLatency_Under5us` — overhead на API < 5 µs
   - `TestQGR9_RoctracerMemory_Under500MB` — 100K records не превышают 500 MB

4. **Cross-repo smoke** (если успеваем):
   - `spectrum/tests/test_fft_benchmark_rocm.hpp` — добавить второй прогон
     `with TimingSource::Roctracer` и сравнить с hipEvent: `start_ns/end_ns`
     должны совпадать в пределах ±2 µs.

**Acceptance**:
- Все новые тесты PASS на gfx1201 + gfx908
- Существующие 123 тесты — без регрессий
- Quality gates G8R / G9R вписываются в budget

---

### Q7.E — Documentation + decision (1-2 ч)

**Цель**: задокументировать roctracer-режим, решить про rocprofiler counters.

1. Дополнить `core/Doc/Services/Profiling/Full.md` (создан в Documentation таске):
   - Секция «Timing Source Policy» — таблица HipEvent vs Roctracer (когда что)
   - Пример как включить через `configGPU.json` или API
   - Ограничения (overhead, фильтрация, ROCm version)
2. Дополнить `MemoryBank/.claude/rules/06-profiling.md` — упомянуть
   `SetTimingSource()` и default = HipEvent.
3. Обновить `MemoryBank/specs/GPUProfiler_Rewrite_Proposal_2026-04-16.md`
   секция 22 — добавить Q7 status (DONE / partial / deferred counters).
4. Решение по **counters** (rocprofiler-sdk): отдельный таск Q7.F или часть Q7?
   Рекомендация: **отдельный Q7.F**, после стабилизации Q7.A-E. Это огромный
   объём (метрик 50+, hardware-зависимые, MI100 ≠ gfx1201).

**Acceptance**:
- Full.md обновлён секцией про timing source
- 06-profiling.md упоминает SetTimingSource
- Спека section 22 обновлена
- Чёткое решение по counters: отдельный таск или нет

---

## ✅ Acceptance Criteria для Q7 (целиком)

| # | Критерий | Проверка |
|---|----------|----------|
| 1 | `IProfilingTimingSource` интерфейс существует | `ls core/include/core/services/profiling/i_timing_source.hpp` |
| 2 | `HipEvent`/`Roctracer` источники реализуют интерфейс | grep `class.*: public IProfilingTimingSource` |
| 3 | Default source = HipEvent (zero regression) | `ctest --test-dir core/build` 123 PASS |
| 4 | Roctracer source через CMake-флаг | `cmake -DDSP_PROFILING_ROCTRACER=ON` зелёная сборка |
| 5 | Roctracer заполняет все 5 полей | unit-тест `TestSingleKernel_Captures5Fields` PASS |
| 6 | Корреляция API ↔ activity работает | `TestApiCallbackExit_PromotesPartial` PASS |
| 7 | Фильтрация чужих kernel'ов работает | `TestFilter_IgnoresHipfft` PASS |
| 8 | Quality gates под roctracer вписываются | G8R / G9R PASS |
| 9 | Документация обновлена | Full.md + 06-profiling.md + спека section 22 |

---

## 🚫 Запреты / риски

### Запреты

- **CMake `find_package(roctracer)` без OK Alex** — добавляем новую зависимость.
- **Не включать DSP_PROFILING_ROCTRACER по умолчанию** — opt-in.
- **Не ломать hipEvent path** — он остаётся production default.
- **rocprofiler counters — отдельным таском Q7.F**, не вкладывать в этот.

### Риски

| Риск | Митигация |
|------|-----------|
| ROCm 7.2 deprecates roctracer в пользу rocprofiler-sdk | Q7.A spike — выяснить заранее, выбрать API диалект |
| roctracer overhead ломает G8 < 1µs | Используем 2 source mode — G8 для HipEvent, G8R для Roctracer |
| Activity record buffer overflow при бенчах | `roctracer_flush_buf` периодически в worker thread |
| Чужие либы (hipFFT/rocBLAS) шумят в записях | Фильтр α + blacklist + опц. β regex |
| Multi-stream корреляция теряется | `queue_id` в `ProfilingRecord` + group by stream |
| MI100 vs gfx1201 разные API | Тестить на обоих GPU в Q7.D |

---

## 📞 Когда спрашивать Alex

- **Перед Q7.A** — «начинаем Q7? Effort 16-24 ч, opt-in CMake-флаг»
- **Перед Q7.C CMake-правкой** — DIFF + ждать OK
- **На вопросе rocprofiler counters** — «Q7.F отдельным таском или часть Q7?»
- **По завершении** — статус-отчёт перед merge в main

---

## 🔗 Ссылки

- Спека: `MemoryBank/specs/GPUProfiler_Rewrite_Proposal_2026-04-16.md` (Q7 в section 21, поля в section 14.2 ProfilingRecord)
- Текущий ProfilingFacade: `core/include/core/services/profiling/profiling_facade.hpp`
- ROCm docs: https://rocm.docs.amd.com/projects/roctracer/ (актуальное API)
- ROCm 7 rocprofiler-sdk: https://rocm.docs.amd.com/projects/rocprofiler-sdk/

---

*Created: 2026-04-27 by Кодо. Owner: future Debian + GPU session.*
