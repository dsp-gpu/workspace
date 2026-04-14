# TASK: Spectrum — Review Follow-ups

> **Создан**: 2026-04-14 (после ревью spectrum модуля)
> **Статус**: ⬜ BACKLOG
> **Приоритет**: Средний (некритично, но копится технический долг)

---

## Контекст

14.04.2026 проведено глубокое ревью модуля `spectrum` (5296 строк C++).
Часть замечаний исправлена в коммитах `aa10959` (spectrum) и `4b035df` (core).
Ниже — что осталось.

---

## 1. Тиражирование ScopedHipEvent в 4 файла

**Задача**: применить `spectrum/utils/scoped_hip_event.hpp` там, где сейчас
голый `hipEvent_t` с риском утечки при исключении.

**Файлы и количество событий:**
- [ ] `src/fft_func/src/spectrum_processor_rocm.cpp` — 9 мест (~5 пар событий в `ProcessBatch`, `AllMaximaFromCPU` и т.д.)
- [ ] `src/lch_farrow/src/lch_farrow_rocm.cpp` — 6 мест (Upload/Kernel pairs)
- [ ] `src/filters/src/fir_filter_rocm.cpp` — 4 места (`ProcessFromCPU`)
- [ ] `src/filters/src/iir_filter_rocm.cpp` — 4 места
- [ ] (проверить: `kalman_filter_rocm.cpp`, `kaufman_filter_rocm.cpp`, `moving_average_filter_rocm.cpp`)

**Паттерн замены** (уже применён в `fft_processor_rocm.cpp`):
```cpp
// Было:
hipEvent_t ev_up_s = nullptr, ev_up_e = nullptr;
if (prof) { hipEventCreate(&ev_up_s); hipEventCreate(&ev_up_e); }
// ... hipEventRecord(ev_up_s, stream) ...
// ... hipEventDestroy(ev_up_s); hipEventDestroy(ev_up_e);  // часто отсутствует!

// Стало:
ScopedHipEvent ev_up_s, ev_up_e;
if (prof) { ev_up_s.Create(); ev_up_e.Create(); }
// ... hipEventRecord(ev_up_s.get(), stream) ...
// деструктор вызывает hipEventDestroy при выходе из scope
```

**Ожидаемый объём**: ~25 мест × замена паттерна, 1-2 часа работы.

---

## 2. Ревью GPU-kernels (.hip / .cl)

**Задача**: провести ревью ядер модуля spectrum через агент `gpu-optimizer`.

**Файлы для ревью:**
- `src/fft_func/kernels/fft_processor_kernels.hip`
- `src/fft_func/kernels/c2mp_kernels.hip`
- `src/fft_func/kernels/*.cl` (OpenCL-копии)
- `src/filters/kernels/*` (FIR, IIR, Kalman, Kaufman, moving_average)
- `src/lch_farrow/kernels/*`

**На что смотреть:**
- Coalesced global memory access
- Shared/LDS memory — используется ли где нужно
- Bank conflicts
- Warp divergence
- Размер work-group (кратно 64 — AMD wavefront)
- Boundary checks (`if tid < N`)
- `__syncthreads()` корректно расставлены

**Что было сделано**: 14.04.2026 запущен агент `gpu-optimizer` в фоне.
Статус при засыпании — **агент не дождался завершения / результат не прочитан**.
Нужно повторно запустить и получить отчёт.

---

## 3. Мелкие замечания из ревью (не блокеры)

- [ ] `ISpectrumProcessor` — 13 методов, нарушает ISP. Разбить на `IFftProcessor` + `IMaximaFinder` (рефакторинг на потом).
- [ ] `SpectrumProcessorFactory` на main-ветке — OpenCL case выбрасывает runtime_error. Можно убрать OpenCL из switch или комментарий «nvidia-ветка».
- [ ] `const_cast` в `UploadData` — оставлен с комментарием. Проверить сигнатуру `hipMemcpyHtoDAsync` в текущей ROCm 7.2+ — если принимает `const void*`, убрать.

---

## 4. Итоги ревью (сделано)

Коммит `aa10959` (spectrum):
- ✅ Новый RAII-класс `ScopedHipEvent` (exception-safe, move-only)
- ✅ Критический баг `ProcessMagnitudesToGPU` — 6 hipEvent утекали всегда
- ✅ `ScopedHipEvent` применён в `fft_processor_rocm.cpp` (20 событий)
- ✅ `hipMemcpyDtoH` (sync) → `hipMemcpyDtoHAsync + hipStreamSynchronize`
- ✅ 9 `#include` кавычки → `<spectrum/...>` (AMD-стандарт)

Коммит `4b035df` (core, сделано в ту же сессию):
- ✅ `include/dsp/test` → `include/core/test` (install paths)
- ✅ `HSA_RUNTIME_LIB REQUIRED` → `if(UNIX)` (Windows unblocked)
- ✅ Удалены мёртвые friend-декларации `JsonConfig*InternalAccess`

---

*Created: 2026-04-14 | Maintained by: Кодо (AI Assistant)*
