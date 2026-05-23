# 09 — 🔴 ROCm ONLY

> **DSP-GPU — ROCm-only проект.** Никакого clFFT/cuFFT.
> Целевые GPU: AMD Radeon RX 9070 (gfx1201) + MI100 (gfx908). ОС: Debian Linux + ROCm 7.2+.
> OpenCL — **только interop** со сторонним кодом (стыковка данных на GPU), не для вычислений.

## Разрешённые библиотеки

| Задача | Библиотека | Заголовки |
|--------|-----------|-----------|
| Runtime | **HIP** | `<hip/hip_runtime.h>` |
| FFT / IFFT | **hipFFT** | `<hipfft/hipfft.h>` |
| Reduce / scan / sort | **rocPRIM** | `<rocprim/rocprim.hpp>` |
| BLAS | **rocBLAS** | `<rocblas/rocblas.h>` |
| LAPACK | **rocSOLVER** | `<rocsolver/rocsolver.h>` |
| Random | **rocRAND** или Philox inline | `<rocrand/rocrand.h>` |

## 🚫 Запрещено

| Библиотека | Причина |
|-----------|---------|
| **clFFT** | Мёртвая, не поддерживает RDNA4+ (gfx1201) |
| **OpenCL runtime** для вычислений | Только interop-стыковка данных |
| **cuFFT / cuBLAS / CUDA** | Другая платформа |

## CMake (Debian: `find_package` — lowercase!)

```cmake
find_package(hip REQUIRED)
find_package(hipfft REQUIRED)
find_package(rocprim REQUIRED)
find_package(rocblas REQUIRED)
# find_package(rocsolver REQUIRED)  # если нужен

target_link_libraries(<target> PUBLIC
    hip::device hip::host hip::hipfft
    roc::rocprim roc::rocblas
)
```

⚠️ Linux case-sensitive: `find_package(HIP ...)` упадёт.

## Компилятор

- `hipcc` для `.hip` + всего что вызывает HIP.
- Флаги: `-O3 -std=c++17 --offload-arch=gfx1201 --offload-arch=gfx908`.

## События для профилирования

```cpp
hipEvent_t start, stop;
hipEventCreate(&start); hipEventCreate(&stop);
hipEventRecord(start, stream);
my_kernel<<<grid, block, 0, stream>>>(args...);
hipEventRecord(stop, stream);

ROCmProfilingData data{.start_event=start, .stop_event=stop};
// Сборка — в ProfilingFacade асинхронно
```

## Internal / External контекст

- **Internal**: `DrvGPU::Create(gpu_id)` — sam создаёт hip stream (**owns**).
- **External**: `DrvGPU::CreateFromExternalStream(gpu_id, my_stream)` — интеграция с чужим кодом (**не owns** — не разрушать).

Паттерн `owns_resources_ = false` → backend не уничтожает чужие хэндлы.

## Legacy GPUWorkLib

- `main` — Linux + ROCm (эталон для DSP-GPU).
- `nvidia` — Windows + OpenCL (заморожена, не переносить).

**DSP-GPU = форк только ROCm-части**. Упоминания OpenCL в коде — технический долг на очистку (кроме interop).
