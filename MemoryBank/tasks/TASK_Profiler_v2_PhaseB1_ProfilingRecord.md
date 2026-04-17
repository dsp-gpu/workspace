# TASK Phase B1: ProfilingRecord (unified flat type)

> **Prerequisites**: Phase A выполнена, ветка `new_profiler` активна, OpenCL удалён из profiler
> **Effort**: 2-3 часа
> **Scope**: `core/include/core/services/` + `core/src/services/`
> **Depends**: Phase A

---

## 🎯 Цель

Ввести единый тип `ProfilingRecord` (flat struct) вместо `std::variant<OpenCL, ROCm>`.
Заменить factory `FromROCm` на **free function** (R4 ревью).

---

## 📋 Шаги

### B1.1. Создать ProfilingRecord

**Файл**: `core/include/core/services/profiling_types.hpp` (дополнить)

После удаления OpenCL-типов в Phase A — в том же файле добавить новый тип.
Полный код из спеки 13.1 (листинг 330 строк), но **с решением C3 из ревью**:

```cpp
namespace drv_gpu_lib {

/// Single profiling measurement — ROCm only, flat struct
struct ProfilingRecord {
    // === Identity ===
    int         gpu_id = 0;
    std::string module_name;
    std::string event_name;

    // === Timing (nanoseconds, GPU clock) ===
    uint64_t start_ns    = 0;
    uint64_t end_ns      = 0;
    uint64_t queued_ns   = 0;
    uint64_t submit_ns   = 0;
    uint64_t complete_ns = 0;

    // === ROCm Classification ===
    uint32_t domain = 0;
    uint32_t kind   = 0;          // 0=kernel, 1=copy, 2=barrier, 3=marker
    uint32_t op     = 0;
    uint64_t correlation_id = 0;

    // === ROCm Device Info ===
    int      device_id = 0;
    uint64_t queue_id  = 0;
    size_t   bytes     = 0;

    // === Kernel Info ===
    std::string kernel_name;

    // === Hardware Counters (std::map — см. C3 ревью) ===
    // Keys — короткие (SSO-friendly): "GPUBusy", "VALUBusy", "L2CacheHit"
    // Scale: 1-5K records × 12 counters = ~60K аллокаций за тест = ОК.
    std::map<std::string, double> counters;

    // === Record Index (composite per W4 ревью) ===
    // Format: (gpu_id << 48) | local_idx  — no global atomic contention
    uint64_t record_index = 0;

    // === Computed helpers ===
    double ExecTimeMs()      const { return (end_ns - start_ns) * 1e-6; }
    double QueueDelayMs()    const {
        return submit_ns >= queued_ns ? (submit_ns - queued_ns) * 1e-6 : 0;
    }
    double SubmitDelayMs()   const {
        return start_ns >= submit_ns ? (start_ns - submit_ns) * 1e-6 : 0;
    }
    double CompleteDelayMs() const {
        return complete_ns >= end_ns ? (complete_ns - end_ns) * 1e-6 : 0;
    }
    double BandwidthGBps()   const {
        double ms = ExecTimeMs();
        return (ms > 0 && bytes > 0) ? (bytes / (ms * 1e-3)) / 1e9 : 0;
    }

    // === Kind helpers ===
    bool IsKernel()    const { return kind == 0; }
    bool IsCopy()      const { return kind == 1; }
    bool IsBarrier()   const { return kind == 2; }
    bool IsMarker()    const { return kind == 3; }
    bool HasCounters() const { return !counters.empty(); }

    std::string KindString() const {
        switch(kind) {
            case 0: return "kernel";
            case 1: return "copy";
            case 2: return "barrier";
            case 3: return "marker";
            default: return "unknown";
        }
    }
};

} // namespace drv_gpu_lib
```

**НЕ добавлять** `static ProfilingRecord FromROCm(...)` — это будет отдельная free function (B1.2).

---

### B1.2. Создать profiling_conversions.hpp (R4 ревью)

**Новый файл**: `core/include/core/services/profiling_conversions.hpp`

```cpp
#pragma once

#include <string>
#include <core/services/profiling_types.hpp>

namespace drv_gpu_lib::profiling {

/// Convert ROCmProfilingData → ProfilingRecord.
/// Free function (not static method) — breaks include cycle profiling_types ↔ ROCmProfilingData.
inline ProfilingRecord record_from_rocm(const ROCmProfilingData& src,
                                         int gpu_id,
                                         const std::string& module,
                                         const std::string& event) {
    ProfilingRecord r;
    r.gpu_id         = gpu_id;
    r.module_name    = module;
    r.event_name     = event;
    // Timing
    r.start_ns       = src.start_ns;
    r.end_ns         = src.end_ns;
    r.queued_ns      = src.queued_ns;
    r.submit_ns      = src.submit_ns;
    r.complete_ns    = src.complete_ns;
    // Classification
    r.domain         = src.domain;
    r.kind           = src.kind;
    r.op             = src.op;
    r.correlation_id = src.correlation_id;
    // Device
    r.device_id      = src.device_id;
    r.queue_id       = src.queue_id;
    r.bytes          = src.bytes;
    r.kernel_name    = src.kernel_name;
    // Counters (copy map)
    r.counters       = src.counters;
    // record_index — присваивается в ProfileStore::Append (не здесь!)
    return r;
}

} // namespace drv_gpu_lib::profiling
```

**Важно**: `record_index` НЕ заполняется тут. Его выставит `ProfileStore::Append()` (Phase B2, composite index W4).

---

### B1.3. Unit-тест conversions

**Новый файл**: `core/tests/test_profiling_conversions.hpp`

```cpp
#pragma once
#include "test_framework.hpp"
#include <core/services/profiling_conversions.hpp>

namespace drv_gpu_lib::tests {

inline void TestRecordFromRocm_AllFieldsCopied() {
    ROCmProfilingData src;
    src.start_ns       = 1000;
    src.end_ns         = 2000;
    src.queued_ns      = 500;
    src.submit_ns      = 800;
    src.complete_ns    = 2200;
    src.domain         = 1;
    src.kind           = 0;
    src.op             = 42;
    src.correlation_id = 123;
    src.device_id      = 2;
    src.queue_id       = 7;
    src.bytes          = 4096;
    src.kernel_name    = "test_kernel";
    src.counters["GPUBusy"]  = 92.5;
    src.counters["VALUBusy"] = 78.0;

    auto r = profiling::record_from_rocm(src, 3, "spectrum", "FFT_Execute");

    ASSERT_EQ(r.gpu_id, 3);
    ASSERT_EQ(r.module_name, "spectrum");
    ASSERT_EQ(r.event_name, "FFT_Execute");
    ASSERT_EQ(r.start_ns, 1000u);
    ASSERT_EQ(r.end_ns, 2000u);
    ASSERT_EQ(r.domain, 1u);
    ASSERT_EQ(r.kind, 0u);
    ASSERT_EQ(r.op, 42u);
    ASSERT_EQ(r.correlation_id, 123u);
    ASSERT_EQ(r.device_id, 2);
    ASSERT_EQ(r.queue_id, 7u);
    ASSERT_EQ(r.bytes, 4096u);
    ASSERT_EQ(r.kernel_name, "test_kernel");
    ASSERT_EQ(r.counters.size(), 2u);
    ASSERT_NEAR(r.counters.at("GPUBusy"), 92.5, 1e-9);
    ASSERT_EQ(r.record_index, 0u);  // not set by factory
}

inline void TestRecordFromRocm_ComputedHelpers() {
    ROCmProfilingData src;
    src.start_ns    = 1'000'000;       // 1 ms
    src.end_ns      = 3'000'000;       // 3 ms — exec_time = 2 ms
    src.queued_ns   =   500'000;
    src.submit_ns   =   800'000;
    src.complete_ns = 3'200'000;
    src.bytes       = 2'000'000;        // 2 MB

    auto r = profiling::record_from_rocm(src, 0, "m", "e");

    ASSERT_NEAR(r.ExecTimeMs(), 2.0, 1e-6);
    ASSERT_NEAR(r.QueueDelayMs(), 0.3, 1e-6);
    ASSERT_NEAR(r.SubmitDelayMs(), 0.2, 1e-6);
    ASSERT_NEAR(r.CompleteDelayMs(), 0.2, 1e-6);
    // bandwidth = 2 MB / 2 ms = 1 GB/s
    ASSERT_NEAR(r.BandwidthGBps(), 1.0, 1e-3);
}

inline void TestRecordFromRocm_KindHelpers() {
    ROCmProfilingData src;
    src.kind = 0;
    auto r0 = profiling::record_from_rocm(src, 0, "m", "e");
    ASSERT_TRUE(r0.IsKernel());
    ASSERT_FALSE(r0.IsCopy());
    ASSERT_EQ(r0.KindString(), "kernel");

    src.kind = 1;
    auto r1 = profiling::record_from_rocm(src, 0, "m", "e");
    ASSERT_TRUE(r1.IsCopy());
    ASSERT_EQ(r1.KindString(), "copy");
}

} // namespace
```

Зарегистрировать в test runner — по шаблону соседних тестов.

---

### B1.4. Build + test

```bash
cd E:/DSP-GPU/core
cmake --build build --target core core_unit_tests -j
ctest --test-dir build -R test_profiling_conversions --output-on-failure
```

---

### B1.5. Commit

```bash
git add include/core/services/profiling_types.hpp \
        include/core/services/profiling_conversions.hpp \
        tests/test_profiling_conversions.hpp
git commit -m "[profiler-v2] Phase B1: ProfilingRecord + record_from_rocm

- Add ProfilingRecord flat struct (unified, ROCm-only)
  - Counters as std::map<string, double> (C3: scale ~60K/test = OK)
  - record_index as composite (gpu_id << 48 | local_idx) per W4 ruling
- Add drv_gpu_lib::profiling::record_from_rocm() free function
  - Separate header profiling_conversions.hpp (R4: break include cycle)
- Add test_profiling_conversions.hpp — 3 unit tests

Not yet used by GPUProfiler — next Phase B2 (ProfileStore)."
```

---

## ✅ Acceptance Criteria

| # | Критерий | Проверка |
|---|----------|---------|
| 1 | `ProfilingRecord` в profiling_types.hpp | `grep "struct ProfilingRecord" include/core/services/profiling_types.hpp` |
| 2 | Counters `std::map<string, double>` | `grep "std::map<std::string, double> counters" include/core/services/profiling_types.hpp` |
| 3 | `record_from_rocm` free function | `grep "record_from_rocm" include/core/services/profiling_conversions.hpp` |
| 4 | НЕ static member | `grep "static ProfilingRecord FromROCm" include/` должно быть пусто |
| 5 | 3 unit-теста | `ctest -N \| grep conversions` — 3 теста |
| 6 | Тесты зелёные | ctest exit 0 |
| 7 | Сборка зелёная | cmake build exit 0 |

---

## 📖 Важные детали

### Почему `std::map<string, double>` а не `unordered_map` для counters?
`counters` — в hot path `Record()`, но:
- размер ~12 элементов → map vs unordered_map всё равно
- `std::map` имеет стабильный порядок итерации (полезно для отчётов)
- cache-friendly при малом N

### Почему factory — free function?
Если бы `ProfilingRecord::FromROCm(ROCmProfilingData&)` был статическим методом — `profiling_types.hpp` пришлось бы include'ить `ROCmProfilingData`. А `ROCmProfilingData` может захотеть в свою очередь ProfilingRecord. Отдельный `profiling_conversions.hpp` — разорвание цикла includes.

### Почему record_index НЕ в factory?
`record_index` должен быть монотонно возрастающим **в рамках shard**. Factory не знает про shard. Значит выставляется только в `ProfileStore::Append()` (Phase B2).

---

*Task created: 2026-04-17 | Phase B1 | Status: READY (after Phase A)*
