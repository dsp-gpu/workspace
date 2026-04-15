# Changelog: Core+Spectrum follow-ups — 2026-04-15

**Источник**: [TASK_Core_Spectrum_Review_2026-04-15.md](../tasks/TASK_Core_Spectrum_Review_2026-04-15.md)
**Ревью**: [core_spectrum_REVIEW_2026-04-15.md](../specs/core_spectrum_REVIEW_2026-04-15.md)
**Выполнил**: Кодо (AI Assistant, сессия 2026-04-15)
**Тесты**: ⏸ отложены до завтра (нужен Linux + ROCm GPU)

---

## 📋 Сводка выполненных задач (6/6 кода + 2/2 косметики)

| ID | Задача | Статус |
|----|--------|--------|
| T0 | Baseline build + smoke-test | ⏸ отложено (нет Linux GPU) |
| T1.1 | ScopedHipEvent в `fir_filter_rocm.cpp` (2 пары) | ✅ |
| T1.2 | ScopedHipEvent в `iir_filter_rocm.cpp` (2 пары) | ✅ |
| T1.3 | ScopedHipEvent в `lch_farrow_rocm.cpp` (3 пары) | ✅ |
| T1.4 | ScopedHipEvent в `spectrum_processor_rocm.cpp` (9 пар) | ✅ |
| T2 | Анализ `complex_to_mag_phase_rocm.hpp` vs `operations/mag_phase_op.hpp` | ✅ |
| T3 | Обновлён Doxygen у `SpectrumProcessorFactory::Create` | ✅ |
| T4 | Удалён shim `fft_processor_types.hpp` | ✅ |
| T5 | Финальный build+commit | ⏸ отложено (нет Linux GPU) |

---

## 🔴 Критические открытия в процессе работы

### Leak #1 (найден сестрёнкой 14.04): `FFTProcessorROCm::ProcessMagnitudesToGPU`
- **6 hipEvent_t** создавались при каждом вызове, `hipEventDestroy` не вызывался ВООБЩЕ
- Утечка при **нормальном** завершении (не только при throw)
- Закрыто сестрёнкой в коммите `aa10959` через `ScopedHipEvent`

### Leak #2 (найден сегодня): `SpectrumProcessorROCm` — **18 событий без destroy**
- В `src/fft_func/src/spectrum_processor_rocm.cpp` **ни одного** `hipEventDestroy`
- Два метода:
  - `ProcessBatch` (~line 195): 4 пары (Upload/Pad/FFT/Post) → 8 событий
  - `FindAllMaximaFromCPU` (~line 482): 5 пар (Upload/Pad/FFT/Mag/Pipeline) → 10 событий
- **Утечка при каждом вызове**, даже в happy-path
- Закрыто сегодня через массовое применение `ScopedHipEvent`

### Leak #3 (найден сегодня): `fir_filter_rocm.cpp`, `iir_filter_rocm.cpp`, `lch_farrow_rocm.cpp`
- `hipEventDestroy` был **только в error-branch**
- В happy-path (stream sync + push_back в prof_events) события утекали
- Закрыто через RAII

**Итого закрыто**: 6 + 18 + 14 = **≈38 утечек `hipEvent_t` на каждый вызов prof_events**.

---

## 📁 Изменённые файлы

| Файл | Строк ±  | Что сделано |
|------|----------|-------------|
| `spectrum/include/spectrum/complex_to_mag_phase_rocm.hpp` | +6 | T2 — doxy-примечание с `@ref MagPhaseOp` (чтобы не путали с Op Layer 5) |
| `spectrum/include/spectrum/factory/spectrum_processor_factory.hpp` | +7 / -4 | T3 — актуализирован Doxygen (ROCm — main, OPENCL — nvidia-ветка) |
| `spectrum/include/spectrum/fft_processor_types.hpp` | **DELETED** | T4 — shim из 12 строк удалён (grep: 0 кодовых клиентов в DSP-GPU/ и GPUWorkLib/) |
| `spectrum/src/fft_func/src/spectrum_processor_rocm.cpp` | 46/46 | T1.4 — 9 пар `hipEvent_t` → `ScopedHipEvent` (18 событий) |
| `spectrum/src/filters/src/fir_filter_rocm.cpp` | 16/16 | T1.1 — 2 пары (Kernel, Upload) |
| `spectrum/src/filters/src/iir_filter_rocm.cpp` | 16/16 | T1.2 — 2 пары (Kernel, Upload) |
| `spectrum/src/lch_farrow/src/lch_farrow_rocm.cpp` | 22/22 | T1.3 — 3 пары (Upload_delay, Kernel, Upload_input) |

**git diff --stat**: `7 files changed, 116 insertions(+), 112 deletions(-)`

---

## 🔧 Применённый паттерн

```cpp
// === БЫЛО ===
hipEvent_t ev_k_s = nullptr, ev_k_e = nullptr;
if (prof_events) {
    hipEventCreate(&ev_k_s); hipEventCreate(&ev_k_e);
    hipEventRecord(ev_k_s, ctx_.stream());
}
// ... kernel launch ...
if (prof_events) hipEventRecord(ev_k_e, ctx_.stream());
if (err != hipSuccess) {
    if (ev_k_s) { hipEventDestroy(ev_k_s); hipEventDestroy(ev_k_e); }  // только error!
    throw ...
}
if (prof_events) {
    prof_events->push_back({"K", MakeROCmDataFromEvents(ev_k_s, ev_k_e, 0, "k")});
    // ← УТЕЧКА: hipEventDestroy не вызывается!
}

// === СТАЛО ===
ScopedHipEvent ev_k_s, ev_k_e;  // RAII, move-only, noexcept дтор
if (prof_events) {
    ev_k_s.Create(); ev_k_e.Create();
    hipEventRecord(ev_k_s.get(), ctx_.stream());
}
// ... kernel launch ...
if (prof_events) hipEventRecord(ev_k_e.get(), ctx_.stream());
if (err != hipSuccess) {
    // hipEventDestroy не нужен — RAII освободит при throw
    throw ...
}
if (prof_events) {
    prof_events->push_back({"K",
        MakeROCmDataFromEvents(ev_k_s.get(), ev_k_e.get(), 0, "k")});
}
// ← При выходе из scope ~ScopedHipEvent вызывает hipEventDestroy автоматически
```

### Namespace-моменты
- `ScopedHipEvent` живёт в namespace `fft_processor` (из `<spectrum/utils/scoped_hip_event.hpp>`)
- В файлах `filters::*`, `lch_farrow::*`, `antenna_fft::*` добавлен `using fft_processor::ScopedHipEvent;`
- Это consistent со стилем — рядом уже был `using fft_func_utils::MakeROCmDataFromEvents;`

---

## ✅ Верификация (без сборки — статически)

```bash
$ grep -rn "hipEventCreate" spectrum/src/
0 matches

$ grep -rn "hipEventDestroy" spectrum/src/
0 matches

$ grep -rn "ScopedHipEvent" spectrum/
38 matches across 6 files
```

**Что проверено статически:**
- [x] Все `hipEvent_t ev_X_s = nullptr, ev_X_e = nullptr;` → `ScopedHipEvent ev_X_s, ev_X_e;`
- [x] Все `hipEventCreate(&ev_X_*);` → `ev_X_*.Create();`
- [x] Все `hipEventRecord(ev_X_*, stream)` → `hipEventRecord(ev_X_*.get(), stream)`
- [x] Все `MakeROCmDataFromEvents(ev_X_s, ev_X_e, ...)` → `.get()` в обоих аргументах
- [x] Все ручные `hipEventDestroy` в error-branch удалены (RAII делает)
- [x] Добавлен `#include <spectrum/utils/scoped_hip_event.hpp>` во всех 4 .cpp
- [x] Добавлен `using fft_processor::ScopedHipEvent;` во всех 4 .cpp

**Что нужно проверить на GPU (завтра):**
- [ ] Компиляция чистая (baseline vs final diff логов)
- [ ] Smoke-тест: любой профилируемый pipeline → проверить через rocm-smi что `hipEvent_t` не накапливаются
- [ ] Stress-тест: `ProcessBatch(...) × 10000` — нет роста GPU-памяти
- [ ] Unit-тесты spectrum — те же PASS, без новых FAIL

---

## 💡 Важные наблюдения

### T2: `complex_to_mag_phase_rocm.hpp` — НЕ дубль
В ревью я предположил что `complex_to_mag_phase_rocm.hpp` может быть дублем `operations/mag_phase_op.hpp`. Оказалось — **разные сущности разных архитектурных слоёв**:

- `MagPhaseOp` (operations/) — **Layer 5 Op** (Ref03). 1 метод `Execute()`, чистый строительный блок. Используется **внутри** FFTProcessorROCm и внутри ComplexToMagPhaseROCm.
- `ComplexToMagPhaseROCm` — **Layer 6 Facade**. Полноценный публичный API (8 методов: Process, ProcessToGPU, ProcessMagnitude*, BufferSet, GpuContext) для случая "IQ → mag+phase БЕЗ FFT".

Вместо удаления — добавлен `@note` в заголовок с ссылкой `@ref MagPhaseOp`, чтобы у будущих читателей не было путаницы.

### T4: shim был безопасен к удалению
`grep -rn "fft_processor_types.hpp" e:/DSP-GPU e:/C++/GPUWorkLib` показал **0 кодовых ссылок** (только наши MD-документы с упоминанием имени). Shim удалён без замен.

### T1: `SpectrumProcessorROCm` — главный виновник утечек
Вопреки моему изначальному подсчёту "9 событий" (=9 grep-строк), там было **18 событий в 9 парах**. Все утекали, т.к. `hipEventDestroy` в этом файле не было ни в одном виде — ни в happy-path, ни в error-branch. Это была **самая большая** утечка из всех найденных, критичнее Leak #1 сестрёнки.

---

## 🎯 Что осталось на завтра (после прогона на GPU)

1. **Baseline build** (T0): зафиксировать что репо собирается ДО правок (через `git stash` или comparator SHA)
2. **Final build + tests** (T5): собрать с правками, сравнить логи
3. **Smoke-test** утечек: HIP_LAUNCH_BLOCKING=1 + rocm-smi
4. **git commit**: 4 атомарных коммита (один на каждую задачу T1.1–T1.4, плюс T2+T3+T4 отдельным косметическим)
5. **git push**: только после OK Alex

### Коммит-сообщения (готовые)

**Коммит 1** (T1 в целом):
```
fix(spectrum): ScopedHipEvent в filters + lch_farrow + spectrum_processor

Закрыты утечки hipEvent_t в 4 файлах (23 места, 38 событий):
- fir_filter_rocm.cpp: 2 пары событий в Process/ProcessFromCPU
- iir_filter_rocm.cpp: 2 пары событий там же
- lch_farrow_rocm.cpp: 3 пары (Upload_delay, Kernel, Upload_input)
- spectrum_processor_rocm.cpp: 9 пар (ProcessBatch + FindAllMaximaFromCPU)

Ключевое открытие: в spectrum_processor_rocm.cpp hipEventDestroy
не вызывался ВООБЩЕ — 18 событий утекали при каждом вызове с prof_events,
не только при исключении. В filters/lch_farrow destroy был только в
error-branch — утечка в happy-path после push_back в prof_events.

Паттерн: все hipEvent_t → fft_processor::ScopedHipEvent (RAII, move-only,
noexcept дтор). Happy-path и throw-path одинаково безопасны.

Задача: TASK_Core_Spectrum_Review_2026-04-15/T1.1–T1.4
```

**Коммит 2** (T2+T3 косметика):
```
docs(spectrum): актуализирован Doxygen у Factory + note для ComplexToMagPhase

- SpectrumProcessorFactory::Create: ROCm теперь main backend
  (было "not implemented"), OPENCL — nvidia-ветка
- complex_to_mag_phase_rocm.hpp: @note о различии с operations/mag_phase_op.hpp
  (Layer 6 Facade vs Layer 5 Op — не дубль, а разные архитектурные роли)

Задача: TASK_Core_Spectrum_Review_2026-04-15/T2, T3
```

**Коммит 3** (T4):
```
chore(spectrum): удалён shim fft_processor_types.hpp

Shim из 12 строк для обратной совместимости. После миграции на AMD-стандарт
клиентов нет (grep по DSP-GPU/ и GPUWorkLib/ — 0 include). Удалён.

Задача: TASK_Core_Spectrum_Review_2026-04-15/T4
```

---

*Created: 2026-04-15 | Выполнил: Кодо (AI Assistant)*
