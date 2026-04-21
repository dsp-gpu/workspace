# GPUProfiler v2 — Phase A0.5 Baseline

**Date**: 2026-04-20
**Host**: debian
**Branch**: new_profiler (HEAD before Phase A commit)
**Preset**: `debian-local-dev` (Debug, ENABLE_ROCM=1)
**Compiler**: GCC (системный Debian)

Микробенчмарк записан в `core/tests/test_gpu_profiler_baseline.hpp`,
запуск через `./test_core_main --baseline` (режим добавлен в `tests/main.cpp`).

Этот файл — референс для ревизий после Phase B (Record переезжает
на lock-free store) и Phase E (финальные сравнения).

## Методика

- N = 10000 записей `ROCmProfilingData` с простой временной цепочкой.
- "enqueue"  = время только цикла `prof.Record(...)` на главном потоке
  (AsyncServiceBase кладёт в очередь, обработка идёт фоновым worker'ом).
- "drained" = enqueue + ожидание `GetQueueSize()==0` (фоновой обработкой).
- `ExportJSON` — сериализация тех же 10000 агрегированных записей
  в один файл (1 событие в 1 модуле на 1 GPU).

## Измерения (main branch baseline)

| Метрика                        | Значение          |
|--------------------------------|-------------------|
| `Record()` enqueue (avg)       | **2.596 µs/call** |
| `Record()` drained (avg)       | **2.702 µs/call** |
| `ExportJSON()` (N=10000 агрег.) | **88 µs**         |
| `libDspCore.a` size            | **20 263 312 B** (≈19.32 MB) |
| `gpu_profiler.cpp.o` (внутри .a) | **116 840 B** + 256 data |
| `test_core_main` binary        | **9 206 488 B**   |

Суммарные цифры замера:
- enqueue total = 25 960 009 ns / 10 000 calls
- drained total = 27 020 267 ns / 10 000 calls
- ExportJSON wall-clock = 88 µs (ok=1)

## Acceptance criteria для Phase B/E

После Phase B (`ProfilingRecord` + `ProfileStore` lock-free) ожидается:
- `Record()` enqueue **не хуже baseline ± 15%** (R2 ревью).
- После Phase A удаление `std::visit` + одной OpenCL ветки должно
  дать заметное уменьшение `gpu_profiler.cpp.o` (ориентир: −5…10 КБ).
- `libDspCore.a` ≤ baseline.

## Повторный замер сразу после Phase A (контроль регрессии)

Те же 10 000 записей, после всех правок A1-A6:

| Метрика                        | Main baseline     | Post Phase A      | Δ        |
|--------------------------------|-------------------|-------------------|----------|
| `Record()` enqueue (avg)       | 2.596 µs/call     | **1.157 µs/call** | **−55%** |
| `Record()` drained (avg)       | 2.702 µs/call     | **1.157 µs/call** | −57%     |
| `ExportJSON()`                 | 88 µs             | 89 µs             | ≈       |
| `libDspCore.a`                 | 20 263 312 B      | **20 043 652 B**  | −219 660 B |
| `gpu_profiler.cpp.o`           | 116 840 B         | **105 540 B**     | −11 300 B |

Сильное ускорение Record — результат удаления `std::variant` + `std::visit`
в горячем пути: теперь `ProfilingMessage::time_` хранит `ROCmProfilingData`
напрямую, без discriminator'а. Ожидание R2 ("не хуже ± 15%") перевыполнено.

## Follow-up

- Тест `test_gpu_profiler_baseline.hpp` и флаг `--baseline` в
  `tests/main.cpp` остаются в дереве — понадобятся в Phase B/E для
  сравнения после `ProfileStore` переключения.
- Результаты JSON-файла: `build/tests/Results/Profiler/baseline_export.json`.

---
*Created: 2026-04-20 | Phase A0.5 | Кодо*
