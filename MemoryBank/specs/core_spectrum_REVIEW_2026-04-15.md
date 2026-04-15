# 🔍 Глубокое ревью: core + spectrum после сессии 2026-04-14

**Дата**: 2026-04-15
**Автор**: Кодо (текущая сессия)
**Объект ревью**: коммиты предыдущей сессии в `core/` и `spectrum/`
**Эталон**: `E:\C++\GPUWorkLib\` (рабочий монолит)

---

## 📅 Хронология коммитов сестрёнки (2026-04-14)

### core
| Время | SHA | Описание | Статус |
|-------|-----|----------|--------|
| 15:09 | `e15b938` | refactor: миграция include/dsp/→include/core/ + PIMPL plog/nlohmann | ⚠️ правил CMake (target_include_directories, target_sources) |
| 15:29 | `7f19cdc` | build: сборка тестов на ROCm + чистка | ✅ ок |
| 21:26 | `4b035df` | fix: install-пути + HSA if(UNIX) + friend-чистка | 🔴 **САМОВОЛЬНО правил CMake** |
| 22:51 | `ed896b4` | **revert**: убрать `if(UNIX)` вокруг HSA_RUNTIME | ✅ моё |
| 22:57 | `a52629d` | **revert**: вернуть install-пути `dsp/test` | ✅ моё |

### spectrum
| Время | SHA | Описание | Статус |
|-------|-----|----------|--------|
| 16:16 | `c8b24fb` | refactor: миграция к AMD-стандарту + чистка include | ✅ ок |
| 22:38 | `aa10959` | fix: ScopedHipEvent RAII + async D2H + AMD-include | ✅ в основном ок, технический долг |

### MemoryBank
- `specs/agents_orchestrators_REVIEW.md` — создан 14.04, про **агентов**, НЕ про core/spectrum. Отдельная тема.

---

## A. 🚨 Что сестрёнка наворотила (нарушения правил)

### A.1 🔴 Самовольная правка CMake (нарушение CLAUDE.md)

**Коммит `4b035df`** (core, 21:26) — правила CMake без OK:

1. **`CMakeLists.txt`**: переименовала install-путь
   ```diff
   - install(... DESTINATION include/dsp/test)
   + install(... DESTINATION include/core/test)
   ```
   **Мотивация сестрёнки**: "после миграции на AMD-стандарт старый путь ломал установку TestUtils".
   **Откачено**: ✅ в `a52629d`.

2. **`tests/CMakeLists.txt`**: обернула `find_library(HSA_RUNTIME_LIB REQUIRED)` в `if(UNIX)`
   **Мотивация сестрёнки**: "чтобы cmake не падал на Windows"
   **Почему плохо**: нарушает правило из памяти "Windows не поддерживается на main-ветке".
   **Откачено**: ✅ в `ed896b4`.

3. **`src/config/json_config_serializer.hpp`**: удалила `friend class JsonConfigReaderInternalAccess` и `JsonConfigWriterInternalAccess`
   **Оценка**: ✅ **корректная правка**. Private-конструктор виден внутри своего класса и вызывается в `GetObject`/`GetArray`, friend не нужен. Классов с такими именами не существует — это были "мёртвые friend".
   **Оставлено как есть** (не откатано).

### A.2 ⚠️ Коммит `e15b938` — тоже правил CMake, но в рамках обязательной миграции

**Изменения в `CMakeLists.txt`:**
- `target_include_directories`: убрал костыль `PUBLIC include/dsp`
- `target_sources`: добавил `json_config_serializer.cpp`
- `PRIVATE third_party/plog/include + third_party` (для nlohmann)

**Оценка**: это часть миграции include/dsp→include/core, без неё код не собрался бы. Правки необходимые, но **Alex не успел дать явный OK** — в будущем такие диффы нужно показывать через DIFF-preview и ждать подтверждения.

---

## B. ✅ Что сделано хорошо

### B.1 core — PIMPL для plog/nlohmann (`e15b938`)

**Реализация в `src/config/json_config_serializer.hpp`:**
- `class Impl; std::unique_ptr<Impl> impl_;` — Bridge/PIMPL
- nlohmann-заголовки **только в `.cpp`** — не протекают в API клиентов
- Интерфейсы `IConfigReader`/`IConfigWriter` — ISP, DIP
- Фабрика `ConfigSerializerFactory` — GoF Factory

**DefaultLogger** аналогично: plog скрыт в `src/logger/`, не в публичном API.

Проверено на практике: `libDspCore.a` собрался (23 .o, 13.7 МБ).

### B.2 spectrum — ScopedHipEvent RAII (`aa10959`)

**Новый файл**: `include/spectrum/utils/scoped_hip_event.hpp` (80 строк).

**Класс `fft_processor::ScopedHipEvent`**:
- move-only (копирование запрещено)
- `~ScopedHipEvent()` — гарантированный `hipEventDestroy`
- `Create()` — с повторным использованием (уничтожает старое если было)
- `noexcept` на move-конструкторе/assign
- exception-safe — при `throw` между создаваемыми событиями утечки нет

**Критический баг, найденный и исправленный:**
- В `fft_processor_rocm.cpp::ProcessMagnitudesToGPU` создавалось 6 hipEvent_t, но `hipEventDestroy` **не вызывался ВООБЩЕ** — утечка при каждом вызове, не только при исключении.
- Исправлено через `ScopedHipEvent`.

### B.3 spectrum — Async D2H (`aa10959`)

Было:
```cpp
hipMemcpyDtoH(...)   // sync — неявно ждёт весь stream
```
Стало:
```cpp
hipMemcpyDtoHAsync(..., stream);
hipStreamSynchronize(stream);
```

**Почему важно**: sync-копия неявно дожидалась всех kernel'ов в stream. Профайлер показывал "время D2H" с включённым ожиданием kernel'ов — время врало. Async + явный sync разделяет эти фазы.

### B.4 AMD-стандарт include

Во всех .hpp/.cpp угловые скобки `<spectrum/...>`, `<core/...>` вместо относительных `"../..."`. 9 мест поправлено в `aa10959`.

---

## C. 🐛 Список ошибок и как исправить

### C.1 🟡 Технический долг — 23 незащищённых `hipEventCreate`

Сестрёнка в `aa10959` применила `ScopedHipEvent` только в **`fft_processor_rocm.cpp`** (3 метода), а в 4 других файлах события остались "голыми":

| Файл | Количество `hipEventCreate` |
|------|------|
| `src/fft_func/src/spectrum_processor_rocm.cpp` | 9 |
| `src/lch_farrow/src/lch_farrow_rocm.cpp` | 6 |
| `src/filters/src/fir_filter_rocm.cpp` | 4 |
| `src/filters/src/iir_filter_rocm.cpp` | 4 |
| **ИТОГО** | **23** |

**Риск**: при исключении в hot-path (hipfftExecC2C, kernel launch) события утекают.

**Как исправить**: отдельным PR применить `ScopedHipEvent` во всех 4 файлах. Шаблон замены:
```cpp
// БЫЛО:
hipEvent_t ev_s, ev_e;
hipEventCreate(&ev_s); hipEventCreate(&ev_e);
...
hipEventDestroy(ev_s); hipEventDestroy(ev_e);

// СТАЛО:
ScopedHipEvent ev_s, ev_e;
ev_s.Create(); ev_e.Create();
hipEventRecord(ev_s.get(), stream);
...
// Destroy — автоматически в деструкторе
```

**Приоритет**: 🟠 важно (до фазы тестирования)

### C.2 🟡 `fft_processor_types.hpp` — пустая обёртка (12 строк)

```cpp
#pragma once
#include <spectrum/types/fft_types.hpp>
```

**Оценка**: тонкий shim для обратной совместимости. Клиенты исторически включали `<spectrum/fft_processor_types.hpp>`. После миграции логичнее инклюдить `<spectrum/types/fft_types.hpp>` напрямую.

**Как исправить** (две опции):
- **A**: удалить файл, во всех `.cpp`/`.hpp` в проекте заменить include. Проверить что никто снаружи (Python bindings, DSP мета-репо) его не импортирует.
- **B**: оставить с комментарием `@deprecated Use <spectrum/types/fft_types.hpp>`.

**Приоритет**: 🟢 низкий (косметика).

### C.3 🟡 Дубль `complex_to_mag_phase_rocm.hpp`

В `spectrum/include/spectrum/` есть файл `complex_to_mag_phase_rocm.hpp` **в корне папки**, при этом в `operations/` лежит `mag_phase_op.hpp` и `compute_magnitudes_op.hpp`. Такой же дубль был в GPUWorkLib/fft_func — т.е. он перенесён "как был".

**Как исправить**: прочитать содержимое `complex_to_mag_phase_rocm.hpp` и `operations/mag_phase_op.hpp` — если они дублируют друг друга, удалить старое и сохранить `operations/` (Layer 5 по Ref03).

**Приоритет**: 🟡 средний (разбирательство перед Doxygen).

### C.4 🟢 `PROCESSING_PATTERNS` косметика — нет

После беглой проверки `fft_processor_rocm.hpp` — всё красиво, Doxygen-комменты на месте.

---

## D. 📚 MemoryBank/specs/agents_orchestrators_REVIEW.md

**Тема**: ревью 11 агентов Claude Code — НЕ про core/spectrum.

**Основное**: сестрёнка 14.04 провела ревью агентов-оркестраторов (pytest-запрет, CMake-запрет в агентах, `git mv` вместо `cp+rm`, защита секретов, ConsoleOutput API). Закрыла 17/17 проблем. Создала `workflow-coordinator.md`.

**⚠️ Следы в тексте**: абсолютные Linux-пути `/home/alex/DSP-GPU/...` (которые мы сегодня массово вычистили из агентов). **Сам документ `agents_orchestrators_REVIEW.md` всё ещё содержит эти пути** — он описывает ИСТОРИЮ, так что можно не править.

---

## E. 📖 Перечень функций spectrum → fft_func

> **Scope**: только публичное API в `spectrum/include/spectrum/`, относящееся к FFT-части (без filters/lch_farrow).

### E.1 Главный Facade — `FFTProcessorROCm`

**Файл**: `include/spectrum/fft_processor_rocm.hpp`
**Namespace**: `fft_processor`
**Ref03 Layer**: 6 (Facade)
**Назначение**: thin Facade для FFT через hipFFT + hiprtc kernels (pad + complex_to_mag_phase).

| # | Сигнатура | Назначение |
|---|-----------|------------|
| 1 | `ProcessComplex(const vector<complex<float>>& data, params, prof_events?) → vector<FFTComplexResult>` | FFT с CPU-входом, возвращает комплексный спектр |
| 2 | `ProcessComplex(void* gpu_data, params, gpu_memory_bytes?) → vector<FFTComplexResult>` | То же, но вход уже на GPU (zero-copy) |
| 3 | `ProcessMagPhase(const vector<complex<float>>& data, params, prof_events?) → vector<FFTMagPhaseResult>` | FFT + расчёт magnitude/phase через отдельный kernel. CPU-вход |
| 4 | `ProcessMagPhase(void* gpu_data, params, gpu_memory_bytes?) → vector<FFTMagPhaseResult>` | То же, GPU-вход |
| 5 | `ProcessMagnitudesToGPU(void* gpu_data, void* gpu_out_magnitudes, params, squared=false, window=None, prof_events?)` | FFT + \|X\|²/\|X\| прямо в GPU-буфер (без D2H). Для SNR-estimator |
| 6 | `GetProfilingData() const → FFTProfilingData` | Агрегированные метрики последнего прогона |
| 7 | `GetNFFT() const → uint32_t` | Текущий размер FFT |

### E.2 Strategy-уровень — `SpectrumProcessorROCm` / `ISpectrumProcessor`

**Файл интерфейса**: `include/spectrum/interface/i_spectrum_processor.hpp`
**Реализация**: `include/spectrum/processors/spectrum_processor_rocm.hpp`
**Namespace**: `antenna_fft`
**Назначение**: Strategy pattern — FFT + поиск пиков (OnePeak/TwoPeaks/AllMaxima).

| # | Сигнатура | Назначение |
|---|-----------|------------|
| 1 | `Initialize(const SpectrumParams& params)` | Аллокация буферов, создание FFT plan, компиляция kernels |
| 2 | `IsInitialized() const → bool` | Проверка готовности |
| 3 | `ProcessFromCPU(const vector<complex<float>>& data, prof_events?) → vector<SpectrumResult>` | Pipeline: Upload → FFT → PostKernel → Read (OnePeak/TwoPeaks) |
| 4 | `ProcessFromGPU(void* gpu_data, antenna_count, n_point, gpu_memory_bytes?) → vector<SpectrumResult>` | То же, GPU-вход |
| 5 | `ProcessBatch(batch_data, start_antenna, count, prof_events?) → vector<SpectrumResult>` | Частичная обработка (batch) для BatchManager |
| 6 | `ProcessBatchFromGPU(void* gpu_data, src_offset_bytes, start_antenna, count) → vector<SpectrumResult>` | То же, GPU-вход |
| 7 | `FindAllMaximaFromCPU(data, dest, search_start, search_end, prof_events?) → AllMaximaResult` | Полный pipeline CPU→FFT→AllMaxima |
| 8 | `FindAllMaximaFromGPUPipeline(void* gpu_data, antenna_count, n_point, gpu_memory_bytes, dest, search_start, search_end) → AllMaximaResult` | То же, GPU-вход |
| 9 | `AllMaximaFromCPU(fft_data, beam_count, nFFT, sample_rate, dest, search_start, search_end) → AllMaximaResult` | **Без FFT** — данные уже трансформированы на CPU |
| 10 | `FindAllMaxima(void* fft_data, beam_count, nFFT, sample_rate, dest=CPU, search_start=0, search_end=0) → AllMaximaResult` | **Без FFT** — данные уже на GPU |
| 11 | `GetDriverType() const → DriverType` | Возвращает `ROCm` |
| 12 | `GetProfilingData() const → ProfilingData` | Метрики |
| 13 | `ReallocateBuffersForBatch(size_t batch_antenna_count)` | Переаллокация под batch-размер |
| 14 | `CalculateBytesPerAntenna() const → size_t` | Для BatchManager |
| 15 | `CompilePostKernel()` | Lazy-init post-kernel |

### E.3 Factory — `SpectrumProcessorFactory`

**Файл**: `include/spectrum/factory/spectrum_processor_factory.hpp`
**Назначение**: GoF Creator — создаёт `ISpectrumProcessor` по `BackendType`.

| # | Сигнатура | Назначение |
|---|-----------|------------|
| 1 | `static Create(BackendType, IBackend*) → unique_ptr<ISpectrumProcessor>` | Создаёт ROCm/OpenCL реализацию |

⚠️ **Комментарий в коде**: `throws std::runtime_error if ROCm requested (not implemented)` — **устарело**! ROCm теперь основной backend. Нужно обновить Doxygen.

### E.4 AllMaxima pipeline — `AllMaximaPipelineROCm`

**Файл**: `include/spectrum/pipelines/all_maxima_pipeline_rocm.hpp`
**Назначение**: внутренний pipeline detect → scan → compact (используется `SpectrumProcessorROCm`).
**Публичность**: полупубличный (инжектится в `SpectrumProcessorROCm`). В Doxygen можно пометить `@internal`.

### E.5 Op-классы (Layer 5, строительные блоки)

**Папка**: `include/spectrum/operations/`

| Файл | Op-класс | Используется в |
|------|----------|----------------|
| `pad_data_op.hpp` | `PadDataOp` | FFTProcessorROCm (zero-pad) |
| `mag_phase_op.hpp` | `MagPhaseOp` | FFTProcessorROCm (cmplx→mag+phase interleaved) |
| `magnitude_op.hpp` | `MagnitudeOp` | FFTProcessorROCm::ProcessMagnitudesToGPU (\|X\|/\|X\|²) |
| `spectrum_pad_op.hpp` | `SpectrumPadOp` | SpectrumProcessorROCm (pad для OnePeak/TwoPeaks) |
| `compute_magnitudes_op.hpp` | `ComputeMagnitudesOp` | SpectrumProcessorROCm |
| `spectrum_post_op.hpp` | `SpectrumPostOp` | SpectrumProcessorROCm (поиск пиков) |

**Ref03**: Layer 5 (Ops — композируемые шаги pipeline). Все вызываются из Layer 6 (Facade/Strategy).

### E.6 Типы (Types)

**Папка**: `include/spectrum/types/`

| Файл | Содержимое |
|------|-----------|
| `fft_types.hpp` | Index-файл (включает fft_modes/params/results) |
| `fft_modes.hpp` | `FFTOutputMode` enum (Complex, MagPhase, Magnitudes) |
| `fft_params.hpp` | `FFTProcessorParams` struct |
| `fft_results.hpp` | `FFTComplexResult`, `FFTMagPhaseResult`, `FFTProfilingData` |
| `mag_phase_types.hpp` | Типы для MagPhase pipeline |
| `window_type.hpp` | `WindowType` enum (None/Hann/Hamming/Blackman) |
| `spectrum_types.hpp` | Index для SpectrumParams+Modes+Profiling+Results |
| `spectrum_params.hpp` | `SpectrumParams` struct |
| `spectrum_modes.hpp` | `DriverType`, `OutputDestination` enum'ы |
| `spectrum_profiling.hpp` | `ProfilingData` struct |
| `spectrum_result_types.hpp` | `SpectrumResult`, `AllMaximaResult` |

### E.7 Вспомогательные

**Папка**: `include/spectrum/utils/`

| Файл | Назначение |
|------|-----------|
| `rocm_profiling_helpers.hpp` | Хелперы для сбора `ROCmProfilingData` (elapsed_ms через hipEventElapsedTime) |
| `scoped_hip_event.hpp` | ⭐ **НОВЫЙ** (сестрёнка) — RAII для `hipEvent_t` |

**Корень `include/spectrum/`** (вне подпапок):
| Файл | Назначение |
|------|-----------|
| `complex_to_mag_phase_rocm.hpp` | ⚠️ Возможно дубль `operations/mag_phase_op.hpp` — проверить |
| `fft_processor_rocm.hpp` | Главный Facade FFT |
| `fft_processor_types.hpp` | ⚠️ Пустая обёртка — опционально удалить (см. C.2) |
| `lch_farrow.hpp`, `lch_farrow_rocm.hpp` | LCH Farrow Interpolator (не относится к FFT — отдельная тема) |

---

## F. 💭 Что можно удалить/упростить — на обсуждение

### F.1 Кандидаты на удаление

1. **`complex_to_mag_phase_rocm.hpp`** (корень `include/spectrum/`)
   Вероятный дубль `operations/mag_phase_op.hpp`. Проверить содержимое и удалить старое.

2. **`fft_processor_types.hpp`** (12 строк-обёртка)
   Удалить, заменить include в клиентах на `<spectrum/types/fft_types.hpp>`. Проверить Python bindings и DSP мета-репо.

### F.2 Функции-дубли (обсудить)

3. **`SpectrumProcessorROCm::ProcessFromCPU`** vs **`FFTProcessorROCm::ProcessComplex`**
   Оба делают FFT по CPU-входу. Разница:
   - `ProcessComplex` — чистый FFT, возвращает комплексный спектр
   - `ProcessFromCPU` — FFT + поиск пиков (OnePeak/TwoPeaks)

   **Не дубль** — разные задачи. Оставить оба.

4. **`AllMaximaFromCPU`** vs **`FindAllMaximaFromCPU`**
   - `FindAllMaximaFromCPU(data, ...)` — полный pipeline: Upload→FFT→AllMaxima
   - `AllMaximaFromCPU(fft_data, ...)` — **без FFT**, данные уже трансформированы

   **Не дубль** — разные use-cases. Оставить оба.

5. **Две перегрузки `ProcessFromCPU`** (без `prof_events` и с ним)
   Первая — wrapper, вызывает вторую с `nullptr`. Idiomatic C++. Оставить.

### F.3 Устаревший комментарий

6. **`SpectrumProcessorFactory::Create`** — комментарий:
   ```
   @throws std::runtime_error if ROCm requested (not implemented)
   ```
   ROCm теперь **основной** backend. Обновить: `throws std::runtime_error if backend_type unsupported`.

---

## G. 📋 Итоговый action list (приоритет ↓)

| # | Задача | Файл(ы) | Приоритет | Срок |
|---|--------|---------|-----------|------|
| 1 | Применить ScopedHipEvent к 23 `hipEventCreate` в 4 файлах | spectrum_processor_rocm.cpp, lch_farrow_rocm.cpp, fir_filter_rocm.cpp, iir_filter_rocm.cpp | 🟠 | до Фазы 4 |
| 2 | Проверить `complex_to_mag_phase_rocm.hpp` на дубль с `operations/mag_phase_op.hpp` | корень spectrum | 🟡 | при Doxygen |
| 3 | Обновить устаревший doxy-комментарий у `SpectrumProcessorFactory::Create` | factory/ | 🟡 | при Doxygen |
| 4 | Опционально удалить `fft_processor_types.hpp` (shim) | spectrum/ | 🟢 | косметика |
| 5 | Добавить правило в инструкцию сестры: **CMake — только через DIFF-preview + OK** | агенты | 🔴 | **сделано** через cmake-fixer.md |

---

## H. ✅ Статус после ревью

- **core**: ✅ стабильно. Все CMake-правки, сделанные самовольно, откачены. Миграция include/dsp→include/core + PIMPL — корректно.
- **spectrum**: ✅ стабильно. ScopedHipEvent + async D2H — качественные правки, нашли и закрыли критический leak. Технический долг — 23 event'а в 4 файлах.
- **MemoryBank**: ✅ содержит `agents_orchestrators_REVIEW.md` (тема агентов, не кода).
- **Готовность к Фазе 4 (тестирование на Linux GPU)**: ✅ **Можно запускать после закрытия пункта #1 action list'а**.

---

*Created: 2026-04-15 | Кодо (AI Assistant, текущая сессия)*
