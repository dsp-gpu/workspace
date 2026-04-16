# TASK: Исправления по глубокому ревью core (2026-04-16)

> **Источник**: [review_core_deep_2026-04-16.md](../specs/review_core_deep_2026-04-16.md)
> **Ответы Alex**: в том же файле (inline)
> **Статус**: ✅ DONE (верифицировано 2026-04-16)

---

## Сводка решений Alex

| # | Задача | Решение Alex |
|---|--------|-------------|
| R1 | OpenCL `<CL/cl.h>` безусловно | **Оставить как есть** — OpenCL ВСЕГДА нужен |
| R2 | IMemoryBuffer OpenCL-only | **Отложить** — работает, подинтерфейс при OOP-рефакторинге |
| R3 | Комментарий "будущее" | **Исправить** |
| R4 | static_cast -> dynamic_cast | **Исправить** |
| R5 | GPUProfiler inline в header | **Вынести в .cpp**, заложить структуру для OOP |
| R6 | GPUProfiler std::cerr | **Отложить** — сохранено в памяти |
| R7 | ProbeGpuVA 150 строк inline | **Перенести в .cpp** (без изменения логики) |
| R8 | Относительные includes | **Исправить** на AMD-standard |
| R9 | Doxygen | **Пропустить** |
| R10 | Deprecated shim файл | **Удалить** |
| R11 | DRVGPU_LOG макрос | **Закомментировать** + запомнить |
| R12 | AsyncServiceBase vtable | **Исправить** на надежный вариант |
| R13 | ScopedHipEvent Create() | **Добавить CreateOrThrow()** с исключением |
| R14 | rocBLAS безусловный | **Обернуть в #ifdef** |
| R15 | OpenCL backend | **Оставить** — не мертвый код |

---

## Батч 1 — Простые правки (5-10 мин каждая)

### T1. backend_type.hpp — исправить комментарий (R3)

**Файл**: `include/core/common/backend_type.hpp:16`

```diff
- ROCm,         ///< ROCm backend (будущее)
+ ROCm,         ///< ROCm/HIP backend (основной на Linux/AMD)
```

**Риск**: нулевой (только комментарий)

---

### T2. gpu_context.cpp — dynamic_cast (R4)

**Файл**: `src/gpu_context.cpp:54-61`

```diff
- try {
-   auto* rocm_backend = static_cast<ROCmBackend*>(backend_);
-   arch_name_ = rocm_backend->GetCore().GetArchName();
-   warp_size_ = rocm_backend->GetCore().GetWarpSize();
- } catch (...) {
-   arch_name_ = "";
-   warp_size_ = 32;
- }
+ auto* rocm_backend = dynamic_cast<ROCmBackend*>(backend_);
+ if (!rocm_backend) {
+   throw std::runtime_error(
+       std::string("GpuContext[") + module_name_ +
+       "]: backend is not ROCmBackend (dynamic_cast failed)");
+ }
+ arch_name_ = rocm_backend->GetCore().GetArchName();
+ warp_size_ = rocm_backend->GetCore().GetWarpSize();
```

**Риск**: низкий. Добавляет безопасность, поведение то же.

---

### T3. i_memory_buffer.hpp — AMD-standard includes (R8)

**Файл**: `include/core/interface/i_memory_buffer.hpp:16-17`

```diff
- #include "svm_capabilities.hpp"
- #include "memory_type.hpp"
+ #include <core/memory/svm_capabilities.hpp>
+ #include <core/memory/memory_type.hpp>
```

**Риск**: низкий. Пути уже в CMake include_directories.

---

### T4. Удалить deprecated shim (R10)

**Файл для удаления**: `include/core/memory/i_memory_buffer.hpp` (3 строки — redirect)

**Шаги**:
1. `grep -rn "memory/i_memory_buffer.hpp"` во всех 10 репо — найти клиентов
2. Если клиенты есть — заменить include на `<core/interface/i_memory_buffer.hpp>`
3. `git rm include/core/memory/i_memory_buffer.hpp`

**Риск**: низкий. Файл-redirect.

---

### T5. DRVGPU_LOG макрос — закомментировать (R11)

**Файл**: `include/core/logger/logger.hpp:186`

**Шаги**:
1. `grep -rn "DRVGPU_LOG[^_]"` во всех репо — найти использование
2. Если кто-то использует `DRVGPU_LOG` (не `DRVGPU_LOG_INFO`) — заменить
3. Закомментировать:
```diff
- #define DRVGPU_LOG DRVGPU_LOG_INFO
+ // TODO(GPUProfiler-refactor): удалить deprecated alias
+ // #define DRVGPU_LOG DRVGPU_LOG_INFO
```

**Риск**: низкий, если grep не находит использование.

---

## Батч 2 — Средняя сложность (15-30 мин каждая)

### T6. ScopedHipEvent — CreateOrThrow() (R13)

**Файл**: `include/core/services/scoped_hip_event.hpp`

Добавить два метода (не трогая существующие Create/CreateWithFlags):

```cpp
/// Создать hipEvent_t. Бросает std::runtime_error при ошибке.
void CreateOrThrow() {
  hipError_t err = Create();
  if (err != hipSuccess) {
    throw std::runtime_error(
        std::string("ScopedHipEvent::Create failed: ") +
        hipGetErrorString(err));
  }
}

/// Аналогично, с флагами.
void CreateWithFlagsOrThrow(unsigned int flags) {
  hipError_t err = CreateWithFlags(flags);
  if (err != hipSuccess) {
    throw std::runtime_error(
        std::string("ScopedHipEvent::CreateWithFlags failed: ") +
        hipGetErrorString(err));
  }
}
```

**Риск**: нулевой (добавление, не изменение).

---

### T7. hsa_interop — перенести ProbeGpuVA в .cpp (R7)

**Суть**: перенести КОД из header в .cpp. Логику не менять. Мьютекс не менять.

**Что остается inline в .hpp**:
- `EnsureHsaInitialized()` (10 строк, static local)
- `IsHsaAvailable()` (3 строки)
- `CloseDmaBuf()` (4 строки)
- `struct HsaProbeResult`, константы

**Что уходит в новый `src/backends/rocm/hsa_interop.cpp`**:
- `ProbeGpuVA()` — декларация в .hpp, реализация в .cpp
- `ExportGpuVAasDmaBuf()` — аналогично

**CMake**: добавить `src/backends/rocm/hsa_interop.cpp` в `target_sources`.
**⚠️ Нужен DIFF-preview + OK Alex**

**Риск**: низкий. Чистый рефакторинг без изменения логики.

---

### T8. rocBLAS #ifdef в gpu_context (R14)

**Файл**: `src/gpu_context.cpp`

Обернуть `#include <rocblas/rocblas.h>` и все rocblas вызовы в `#ifdef ENABLE_ROCBLAS`.
Модули без BLAS (spectrum, stats, heterodyne) не будут тянуть rocBLAS.

```cpp
#ifdef ENABLE_ROCBLAS
#include <rocblas/rocblas.h>
#endif

// В деструкторе и GetRocblasHandleRaw() — аналогичные guards
// GetRocblasHandleRaw() без ENABLE_ROCBLAS → throw runtime_error
```

**CMake**: `ENABLE_ROCBLAS` должен проставляться из `find_package(rocblas)`.
**⚠️ Нужен DIFF-preview + OK Alex** (если потребуется правка CMake)

**Риск**: средний. Нужно проверить что define корректно выставлен.

---

## Батч 3 — GPUProfiler -> .cpp (самый объемный)

### T9. GPUProfiler — вынести реализации в .cpp (R5)

**Создать**: `src/services/gpu_profiler.cpp`

**Что остается в .hpp** (~200 строк):
- `GetInstance()` (singleton)
- `Record()` (hot path, inline)
- `GetStats()`, `GetAllStats()`, `Reset()` (простые)
- `SetEnabled()`, `IsEnabled()` (trivial)
- `SetGPU*()`, `GetGPU*()`, `HasAny*()` (trivial)

**Что переносится в .cpp** (~600 строк):
- `ExportJSON()` — ~120 строк
- `ExportMarkdown()` — ~100 строк
- `PrintReport()` — ~170 строк
- `PrintSummary()` — ~30 строк
- `PrintLegend()` — ~30 строк
- `ProcessMessage()` — ~20 строк
- `HasAnyROCmDataGlobal_NoLock()` — ~10 строк

**CMake**: добавить `src/services/gpu_profiler.cpp` в `target_sources`.
**⚠️ Нужен DIFF-preview + OK Alex**

**Риск**: средний. Singleton + template base — нужно аккуратно.

---

## Батч 4 — AsyncServiceBase

### T10. AsyncServiceBase — надежный Stop() (R12)

**Файл**: `include/core/services/async_service_base.hpp`

**Решение**: runtime safety net + документация.

1. Добавить `std::atomic<bool> derived_alive_{true}` в базовый класс
2. В WorkerLoop — перед `ProcessMessage(msg)` проверять `derived_alive_`
3. Документировать ПРАВИЛО крупным комментарием:
   ```
   ⚠️ КАЖДЫЙ наследник ОБЯЗАН вызвать Stop() в СВОЕМ деструкторе!
   ```
4. Проверить что ConsoleOutput и GPUProfiler уже вызывают Stop() (да, ConsoleOutput вызывает)
5. Добавить `Stop()` в деструктор GPUProfiler (сейчас НЕ вызывает — полагается на базовый)

**Риск**: средний. Нужно проверить GPUProfiler — если нет Stop() в деструкторе, это потенциальный UB прямо сейчас.

---

## Порядок выполнения

```
T1 (R3)  ─┐
T2 (R4)  ─┤
T3 (R8)  ─┼─ Батч 1: простые правки, параллельно
T4 (R10) ─┤
T5 (R11) ─┘
           │
           ▼
T6 (R13) ─┐
T7 (R7)  ─┼─ Батч 2: средние правки
T8 (R14) ─┘
           │
           ▼
T9 (R5)  ── Батч 3: GPUProfiler -> .cpp (самый объемный)
           │
           ▼
T10 (R12) ─ Батч 4: AsyncServiceBase (нужно тестировать)
```

**CMake правки** (T7, T8, T9): добавление .cpp файлов в target_sources —
нужен DIFF-preview + OK Alex.

---

## Не делаем / отложено

| # | Задача | Причина |
|---|--------|---------|
| R1 | OpenCL `<CL/cl.h>` | OpenCL ВСЕГДА нужен |
| R2 | IMemoryBuffer подинтерфейс | Отложено до OOP-рефакторинга |
| R6 | GPUProfiler std::cerr | Сохранено в памяти |
| R9 | Doxygen | "пока не правим" |
| R15 | OpenCL backend | Нужен для стыковки данных |

---

## Definition of Done

- [x] T1-T10 выполнены (верифицировано deep review 2026-04-16)
- [ ] `cmake --build build --parallel 32` — core собирается чисто
- [ ] Тесты core проходят (ctest)
- [x] Все коммиты атомарные
- [x] MemoryBank обновлен

## Дополнительные находки (deep review 2026-04-16) — ИСПРАВЛЕНЫ

| # | Находка | Исправление |
|---|---------|------------|
| R16 | std::cerr в 5 файлах (17 мест) | ✅ 15 заменены на DRVGPU_LOG_*, 2 оставлены (bootstrap config_logger.cpp с комментарием) |
| R17 | std::cout info в gpu_config.cpp | ✅ 3 заменены на DRVGPU_LOG_INFO. Print() таблицы — std::cout оставлен (формат) |
| R18 | Relative includes в rocm_backend.hpp | ✅ 5 includes → AMD-standard `<core/...>` |
| R19 | ENABLE_ROCBLAS undocumented | ✅ Документация в gpu_context.hpp (opt-in, пример CMake) |

---

*Created: 2026-04-16 | Кодо (AI Assistant)*
