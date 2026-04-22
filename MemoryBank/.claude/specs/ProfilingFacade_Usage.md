# ProfilingFacade — полные примеры использования (для правила 06)

> Вынесенные подробности из `MemoryBank/.claude/rules/06-profiling.md`.
> Запреты и обязательный порядок → `06-profiling.md`.

## Полный старт с GPUReportInfo

```cpp
#include <core/services/profiling/profiling_facade.hpp>

using drv_gpu_lib::profiling::ProfilingFacade;

GPUReportInfo info;
info.device_name = "Radeon RX 9070";
info.driver_version = "ROCm 7.2.0";
info.compute_units = 64;
info.max_threads_per_cu = 32 * 32;
info.memory_bus_width_bits = 256;
info.memory_bandwidth_gbps = 896;
info.hip_version = HIP_VERSION;
info.rocm_version = "7.2.0";

ProfilingFacade::GetInstance().SetGPUInfo(gpu_id, info);  // ← ОБЯЗАТЕЛЬНО ДО Start()!
ProfilingFacade::GetInstance().Start();
ProfilingFacade::GetInstance().SetEnabled(true);
ProfilingFacade::GetInstance().SetGPUEnabled(gpu_id, true);
```

Пропуск `SetGPUInfo()` даёт «Unknown GPU» и «нет информации о драйверах» в отчёте.

## Запись событий

### Одиночный Record

```cpp
hipEvent_t start, stop;
hipEventCreate(&start);
hipEventCreate(&stop);

hipEventRecord(start, stream);
my_kernel<<<grid, block, 0, stream>>>(args...);
hipEventRecord(stop, stream);

ROCmProfilingData data;
data.start_event = start;
data.stop_event  = stop;
data.grid_size = grid;
data.block_size = block;

ProfilingFacade::GetInstance().Record(gpu_id, "MyModule", "KernelName", data);
```

### Batch (предпочтительно — меньше lock contention)

```cpp
std::vector<ProfEvent> events;
events.reserve(100);
for (auto& kernel : kernels) {
    events.push_back(RecordToProfEvent(kernel));
}
ProfilingFacade::GetInstance().BatchRecord(gpu_id, "MyModule", events);
```

## Паттерн CollectOrRelease

```cpp
hipEvent_t a = Op1Start();
hipEvent_t b = Op2(a);               // a используется как wait
CollectOrRelease(a, "Op1Name", pe);  // только теперь собираем/освобождаем
CollectOrRelease(b, "Op2Name", pe);
```

## RAII — ScopedProfileTimer

```cpp
#include <core/services/profiling/scoped_profile_timer.hpp>

{
    ScopedProfileTimer t(gpu_id, "Module", "Operation");
    my_kernel<<<grid, block, 0, stream>>>(...);
}  // авто-Record при выходе из scope
```

## Экспорт

```cpp
ProfilingFacade::GetInstance().WaitEmpty();                  // обязательный barrier

ProfilingFacade::GetInstance().PrintReport();                // через ConsoleOutput
ProfilingFacade::GetInstance().ExportMarkdown(
    "DSP/Results/Profiler/2026-04-22_14-32-07.md");
ProfilingFacade::GetInstance().ExportJSON(
    "DSP/Results/Profiler/2026-04-22_14-32-07.json");
```

## Остановка

```cpp
ProfilingFacade::GetInstance().WaitEmpty();  // дождаться async записей
ProfilingFacade::GetInstance().Stop();
```

## Бенчмарки

Класс `GpuBenchmarkBase` из `core/bench/gpu_benchmark_base.hpp` автоматически:
- оборачивает каждый `Run()` в `ScopedProfileTimer`
- собирает метрики через `ProfilingFacade`
- экспортирует результат в `DSP/Results/Profiler/`

Сравнение с CPU эталоном делать **до** оптимизации. Без baseline невозможно валидировать ускорение.

## Оптимизация kernel'ов после профилирования

- Гайд → `@MemoryBank/.claude/specs/ROCm_HIP_Optimization_Guide.md`
- Шпаргалка → `@MemoryBank/.claude/specs/ROCm_Optimization_Cheatsheet.md`
