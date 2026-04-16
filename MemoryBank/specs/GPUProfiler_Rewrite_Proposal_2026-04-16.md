# GPUProfiler v2 -- Proposal: Deep Analysis & Rewrite Plan

**Date**: 2026-04-16
**Author**: Codo (AI Assistant)
**Object**: `core/` -- Services Layer -- GPUProfiler subsystem
**Notation**: C4 Model (as in GPUWorkLib/Doc/Architecture)
**Status**: PROPOSAL -- read & discuss with Alex

---

## 0. Executive Summary

GPUProfiler -- working, production-tested async profiler. But:
- **God Class** (884 lines original, now split to 355+550)
- **6 responsibilities** in one class (collect, aggregate, filter, format, export, lifecycle)
- **3 singletons** tightly coupled (GPUProfiler, ConsoleOutput, ServiceManager)
- **No extensibility** -- new export format = edit GPUProfiler itself
- **Hard to test** -- singleton + real threads = flaky tests

**Proposal**: Refactor to **SOLID/GRASP/GoF** architecture (as Alex requested in R5 answer).

---

## 1. Current Architecture (AS-IS)

> AS-IS diagrams (C3, DFD, dependency graph) removed for brevity.
> Source of truth for current code: `core/include/core/services/gpu_profiler.hpp` (355 LOC)
> + `core/src/services/gpu_profiler.cpp` (550 LOC). New architecture → section 18.

### 1.5 File Map (current)

| File | Lines | Responsibility |
|------|------:|----------------|
| `include/core/services/gpu_profiler.hpp` | 355 | Class def + inline Record/GetStats/Enable |
| `src/services/gpu_profiler.cpp` | 550 | ExportJSON, ExportMD, PrintReport, PrintSummary, PrintLegend, ProcessMessage |
| `include/core/services/profiling_types.hpp` | 199 | ProfilingDataBase, OpenCL/ROCm data, GPUReportInfo |
| `include/core/services/profiling_stats.hpp` | 247 | ProfilingMessage, DetailedTimingStats, EventStats, ModuleStats |
| `include/core/services/async_service_base.hpp` | 407 | Template base: queue, worker thread, lifecycle |
| `include/core/services/gpu_benchmark_base.hpp` | 314 | Template Method: warmup, measure, report |
| `include/core/services/service_manager.hpp` | 310 | Lifecycle: init, start, stop all services |
| `include/core/backends/opencl/opencl_profiling.hpp` | 39 | FillOpenCLProfilingData helper |
| `src/backends/opencl/opencl_profiling.cpp` | 26 | Implementation |
| `tests/test_gpu_profiler.hpp` | 270 | 3 tests: multithread, library demo, PrintReport |
| **TOTAL** | **~2717** | |

---

## 2. Problems Summary

Key violations driving the rewrite (details in Executive Summary):
- **SRP**: 6 responsibilities in one class (collect, aggregate, filter, 3×format, 2×export, lifecycle)
- **OCP**: New format = edit GPUProfiler class
- **ISP/DIP**: No interfaces, concrete singleton dependencies
- **GRASP**: Low cohesion (collection mixed with presentation), tight singleton cluster
- **GoF**: Missing Strategy (exporters), Facade (API vs engine separation)
- **Tech debt**: `std::cout` not testable (D2), 60% logic duplication in PrintReport/ExportMarkdown (D4), tests use `sleep_for` not `WaitEmpty` (D7), tests hardcoded to OpenCL backend (D9)

---

## 3. Proposed Architecture (TO-BE)

### 3.1 Design Principles

1. **Strategy Pattern** for exporters -- pluggable output formats
2. **Observer Pattern** -- profiler notifies when data batch ready
3. **Facade** separates public API from internal engine
4. **Interface Segregation** -- IProfilerRecorder (for modules), IProfilerReader (for exporters)
5. **Dependency Injection** -- no hardcoded singletons in business logic
6. **Testability** -- injectable clock, injectable output stream, no singletons in core logic

### 3.2-3.6 — SUPERSEDED

> **⚠️ SUPERSEDED**: Секции 3.2-3.6 описывали первоначальный дизайн aggregate-on-fly.
> После обсуждения с Alex (2026-04-16) принято решение **collect-then-compute**.
> Актуальная архитектура — **секции 14-18** (Part 2).
>
> Ключевые отличия:
> - `StatsSnapshot = map<..., ModuleStats>` → `ProfileStore::StoreData = map<..., vector<ProfilingRecord>>`
> - `ProfilingEngine` (aggregate) → `ProfileCollector` (push_back raw records)
> - `StatsStore` → `ProfileStore` + `ProfileAnalyzer` (stateless compute)
> - Exporters получают raw data + computed summaries, не агрегаты
>
> **Читать секции 14-18 как основной источник истины.**

---

## 4. File Structure (TO-BE)

```
core/include/core/services/
  profiling/                          <-- NEW subdirectory
    i_profiler_recorder.hpp           <-- Interface: Record()
    i_profiler_reader.hpp             <-- Interface: GetSnapshot()
    i_profiler_exporter.hpp           <-- Interface: Export()
    profile_collector.hpp             <-- AsyncService + push_back into ProfileStore
    profile_store.hpp                 <-- Thread-safe raw record storage
    profiling_facade.hpp              <-- Singleton facade (thin)
  exporters/                          <-- NEW subdirectory
    json_exporter.hpp                 <-- Strategy: JSON
    markdown_exporter.hpp             <-- Strategy: Markdown
    console_report_exporter.hpp       <-- Strategy: stdout table
    console_summary_exporter.hpp      <-- Strategy: stdout compact
  profiling_types.hpp                 <-- KEEP (unchanged)
  profiling_stats.hpp                 <-- KEEP (unchanged)
  async_service_base.hpp              <-- KEEP (unchanged)
  gpu_benchmark_base.hpp              <-- UPDATE (use facade)
  gpu_profiler.hpp                    <-- DEPRECATED shim -> ProfilingFacade
  service_manager.hpp                 <-- UPDATE (use facade)

core/src/services/
  profiling/
    profile_collector.cpp
    profile_store.cpp
    profiling_facade.cpp
  exporters/
    json_exporter.cpp                 <-- ~120 lines from gpu_profiler.cpp
    markdown_exporter.cpp             <-- ~100 lines from gpu_profiler.cpp
    console_report_exporter.cpp       <-- ~170 lines from gpu_profiler.cpp
    console_summary_exporter.cpp      <-- ~30 lines
  gpu_profiler.cpp                    <-- REMOVE (split into above)

core/tests/
  test_profile_collector.hpp          <-- Unit: collection + store append
  test_exporters.hpp                  <-- Unit: each exporter
  test_profiling_facade.hpp           <-- Integration: full pipeline
  test_gpu_profiler.hpp               <-- KEEP (backward compat)
```

---

## 5-6. Migration Plan & Effort Estimate

> **SUPERSEDED** by section 19 (phases A-E with collect-then-compute).
> **Revised estimate**: **19-28 hours**. See section 19 for full breakdown.

---

## 7. Backward Compatibility

**Zero breaking changes** during migration:

1. `GPUProfiler::GetInstance().Record(...)` -- works throughout (shim delegates to facade)
2. `GPUProfiler::GetInstance().ExportJSON(...)` -- works throughout
3. `GpuBenchmarkBase` API unchanged
4. `ServiceManager` API unchanged
5. All benchmark classes in other repos keep working
6. configGPU.json format unchanged

**Deprecation path**: `gpu_profiler.hpp` -> `[[deprecated]]` -> remove in v2.0

---

## 8. Quality Gates (before merge)

| Gate | Criterion |
|------|-----------|
| G1 | All 3 existing tests pass (multithread, library demo, PrintReport) |
| G2 | New unit tests for ProfileStore, ProfileAnalyzer (L1/L2/L3), each Exporter |
| G3 | ~~JSON byte-identical~~ → **JSON v2** matches NEW golden file (created in Phase B). V2 format has new fields: median, p95, pipeline breakdown |
| G4 | ~~MD byte-identical~~ → **Markdown v2** matches NEW golden file. V2 has L1/L2/L3 tables |
| G5 | ~~PrintReport visual diff~~ → **L1/L2/L3 console reports pass Alex's visual inspection** (format is completely new) |
| G6 | No new dependencies (no nlohmann for JSON -- keep manual) |
| G7 | Build: all 8 repos compile and link (ctest green) |
| G8 | No performance regression: Record() latency < 1us (non-blocking guarantee) |
| G9 | **NEW**: Memory usage < 200 MB for 1000 runs × 10 events × 10 GPUs |
| G10 | **NEW**: Compute() latency < 500ms for 10,000 total records (median + sort + percentiles) |
| G11 | **NEW**: BatchRecord() correctly converts ROCmProfilingData → ProfilingRecord (unit test with known values) |

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Singleton removal breaks static init order | High | Keep singleton in Facade, remove from Collector |
| Other repos use GPUProfiler directly | Medium | `using GPUProfiler = ProfilingFacade` shim |
| Exporter file creation fails (permissions) | Low | Already handled (DRVGPU_LOG_ERROR) |
| AsyncServiceBase vtable issue (R12) | Medium | Fix in Phase A -- document rule + add Stop() guard |
| Over-engineering for current needs | Medium | Stop at Phase B if no new formats needed soon |

---

## 10. Decision Points

> **SUPERSEDED** by section 21 (Q1-Q12 with updated recommendations).

---

*Part 1 created: 2026-04-16 | Part 2 added same day after Alex discussion*

---

# PART 2: Deep Analysis (after discussion with Alex)

> **Input from Alex**: убрать OpenCL, collect-then-compute, иерархия GPU->repo->class->vector,
> единая таблица ROCm, индекс времени.
> **Method**: sequential-thinking (9 steps), grep dependencies

---

## 11. Key Decision: Collect-Then-Compute

### 11.1 Current approach: Aggregate-on-the-fly

```
Record() → Enqueue → WorkerThread → ProcessMessage() → UpdateFull()
                                                         ↓
                                              EventStats (count, sum, min, max)
                                              ДАННЫЕ ПОТЕРЯНЫ — только агрегаты
```

**What we CAN compute**: avg, min, max, total, count
**What we CANNOT compute**: median, p95, p99, stddev, trend, histogram, outliers

### 11.2 New approach: Collect-Then-Compute (Alex's proposal)

```
Record() → Enqueue → WorkerThread → push_back(record) → vector<ProfilingRecord>
                                                          ↓
                                          [по команде Compute()]
                                                          ↓
                                          median, p95, p99, stddev, trend, bandwidth
```

**What we gain**:

| Metric | v1 (current) | v2 (collect) |
|--------|:---:|:---:|
| avg / min / max | YES | YES |
| median | NO | **YES** |
| p95, p99 percentiles | NO | **YES** |
| Standard deviation | NO | **YES** |
| Trend (degradation over time) | NO | **YES** |
| Histogram | NO | **YES** |
| Outlier detection | NO | **YES** |
| Bandwidth (GB/s) | NO | **YES** (bytes/exec_time) |
| Raw data export | NO | **YES** |
| **Pipeline breakdown (% per op)** | NO | **YES** (L1 report) |
| **Hardware counters profile** | NO | **YES** (L3 report, from counters map) |
| **Auto bottleneck detection** | NO | **YES** (compute/memory/cache-miss) |
| **Kind classification** (kernel/copy/barrier) | Partial | **YES** (per-record, groupable) |

### 11.3 Memory cost

```
100 runs x 10 events x 10 GPU = 10,000 records
sizeof(ProfilingRecord) ~ 250 bytes (with counters map, kernel_name strings)
Total: ~2.5 MB  ← NOTHING for GPU system with 16 GB VRAM

1,000 runs → ~25 MB (OK)
10,000 runs → ~250 MB (add max_records safety limit)

Note: counters map adds ~80 bytes per record when ~10 counters are present.
Without counters (hipEvent-only profiling): ~170 bytes per record.
```

#### 11.3.1 max_records semantics (clarified from review)

**Limit scope**: per `(gpu_id, module_name, event_name)` tuple — NOT global.

**Worst-case memory budget** (Alex has 10 GPUs):

| Scenario | Records | Memory | Status |
|----------|---------|--------|--------|
| Typical benchmark: 100 runs × 10 events × 1 GPU | 1,000 | ~250 KB | ✅ |
| Extended: 1,000 runs × 10 events × 10 GPU | 100,000 | ~25 MB | ✅ |
| Max limit: 10K/event × 10 events × 8 modules × 10 GPU | 8,000,000 | ~2 GB | ❌ |
| **Safe limit: 1K/event** × 10 events × 8 modules × 10 GPU | 800,000 | ~200 MB | ✅ |

**Recommendation**: Default `max_records_per_event = 1,000`. Configurable via `configGPU.json`.
When limit is hit → oldest records dropped (ring buffer) OR new records rejected with warning.
The `1,000` default covers 99% of benchmark scenarios. For extended runs, user sets higher limit explicitly.

---

## 12. OpenCL Removal — Impact Analysis

### 12.1 What gets deleted

| Item | File | Status |
|------|------|--------|
| `OpenCLProfilingData` struct | `profiling_types.hpp:54` | DELETE |
| `ProfilingTimeVariant` (variant) | `profiling_types.hpp:86` | DELETE |
| `MakeOpenCLFromDurationMs()` | `profiling_types.hpp:99-105` | REPLACE with `MakeRecordFromMs()` |
| `Record(..., OpenCLProfilingData)` | `gpu_profiler.hpp:128-136` | DELETE |
| `FillOpenCLProfilingData()` | `opencl_profiling.hpp/cpp` | DELETE (from profiler; keep in backends if OpenCL bridge needs) |
| `RecordEvent(cl_event)` | `gpu_benchmark_base.hpp:229-237` | REPLACE with `RecordHipEvent()` |
| `std::visit` in ProcessMessage | `gpu_profiler.cpp:517-524` | SIMPLIFY (no variant) |
| OpenCL table in PrintReport | `gpu_profiler.cpp:311-351` | DELETE (one ROCm table) |
| `is_rocm_module` branching | `gpu_profiler.cpp:244,246,311` | DELETE |
| `has_rocm_data` field in EventStats | `profiling_stats.hpp:116` | DELETE (always ROCm) |

### 12.2 What is NOT affected

- Other repos (spectrum, stats, radar...) — DO NOT use OpenCL profiling
- `backends/opencl/` directory — KEEP (needed for OpenCL data bridge, per Alex)
- `IMemoryBuffer` with cl_mem — KEEP (OpenCL bridge, per Alex)
- configGPU.json — no changes

### 12.3 Users of deleted APIs (grep results)

| File | Usage | Action |
|------|-------|--------|
| `test_gpu_profiler.hpp:34` | `MakeOpenCLFromDurationMs(0.5)` | Replace with `MakeRecordFromMs(0.5)` |
| `test_gpu_profiler.hpp:73-84` | `OpenCLProfilingData` struct init | Replace with `ProfilingRecord` |
| `test_gpu_profiler.hpp:179-209` | `OpenCLProfilingData` in loops | Replace with `ProfilingRecord` |
| `test_services.hpp:55` | `MakeOpenCLFromDurationMs(1.0)` | Replace |
| `gpu_benchmark_base.hpp:232-233` | `FillOpenCLProfilingData` | Replace with HIP timer |

**Scope**: 5 files in core/ only. Zero impact on other repos.

---

## 13. Unified Data Type: ProfilingRecord

### 13.1 New type (replaces OpenCL + ROCm + variant)

```cpp
namespace drv_gpu_lib {

/// Single profiling measurement — ROCm only, flat struct, ALL ROCm fields preserved
struct ProfilingRecord {
    // === Identity ===
    int         gpu_id = 0;
    std::string module_name;     // "spectrum", "strategies/BeamV1"
    std::string event_name;      // "FFT_Execute", "CGEMM"

    // === Timing (nanoseconds, GPU clock) ===
    uint64_t start_ns    = 0;    // kernel start on GPU
    uint64_t end_ns      = 0;    // kernel end on GPU
    uint64_t queued_ns   = 0;    // host queue time
    uint64_t submit_ns   = 0;    // GPU submit time
    uint64_t complete_ns = 0;    // data available time

    // === ROCm Classification (from roctracer activity records) ===
    uint32_t domain = 0;         // 0=HIP API, 1=HIP Activity, 2=HSA
    uint32_t kind   = 0;         // 0=kernel, 1=copy, 2=barrier, 3=marker
    uint32_t op     = 0;         // HIP operation code (hipLaunchKernel=0, hipMemcpy=1, etc.)
    uint64_t correlation_id = 0; // links API call → GPU execution

    // === ROCm Device Info ===
    int      device_id = 0;      // GPU device index
    uint64_t queue_id  = 0;      // stream/queue ID
    size_t   bytes     = 0;      // data transfer size (for bandwidth calc)

    // === ROCm Kernel Info ===
    std::string kernel_name;     // "hipFFT_r2c_batch_kernel"

    // === Hardware Performance Counters (from rocprofiler) ===
    //
    // Filled when rocprof/rocprofiler-SDK is active. Empty otherwise.
    // Known counters (AMD MI300/MI200/RDNA):
    //   "GPUBusy"         — % GPU busy (0-100)
    //   "VALUBusy"        — % vector ALU utilization
    //   "SALUBusy"        — % scalar ALU utilization
    //   "MemUnitBusy"     — % memory unit active
    //   "MemUnitStalled"  — % memory unit stalled
    //   "L2CacheHit"      — % L2 cache hit rate
    //   "LDSBankConflict" — % LDS bank conflict rate
    //   "ALUStalledByLDS" — % ALU stalled by LDS
    //   "FetchSize"       — KB fetched from VRAM
    //   "WriteSize"       — KB written to VRAM
    //   "Wavefronts"      — total wavefronts launched
    //   "VALUUtilization" — % active threads in wave (divergence indicator)
    //
    std::map<std::string, double> counters;

    // === Record Index (for trend analysis) ===
    uint64_t record_index = 0;   // auto-assigned sequential by ProfileStore

    // === Computed helpers ===
    double ExecTimeMs()      const { return (end_ns - start_ns) * 1e-6; }
    double QueueDelayMs()    const { return submit_ns >= queued_ns ? (submit_ns - queued_ns) * 1e-6 : 0; }
    double SubmitDelayMs()   const { return start_ns >= submit_ns ? (start_ns - submit_ns) * 1e-6 : 0; }
    double CompleteDelayMs() const { return complete_ns >= end_ns ? (complete_ns - end_ns) * 1e-6 : 0; }
    double BandwidthGBps()   const {
        double ms = ExecTimeMs();
        return (ms > 0 && bytes > 0) ? (bytes / (ms * 1e-3)) / 1e9 : 0;
    }

    // === Kind classification helpers ===
    bool IsKernel()  const { return kind == 0; }
    bool IsCopy()    const { return kind == 1; }
    bool IsBarrier() const { return kind == 2; }
    bool IsMarker()  const { return kind == 3; }
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

/// Helper for tests (replaces MakeOpenCLFromDurationMs)
inline ProfilingRecord MakeRecordFromMs(double duration_ms,
                                         const std::string& module = "Test",
                                         const std::string& event = "Op",
                                         uint32_t kind = 0) {
    ProfilingRecord r;
    r.module_name = module;
    r.event_name  = event;
    r.kind        = kind;
    r.start_ns    = 0;
    r.end_ns      = static_cast<uint64_t>(duration_ms * 1e6);
    r.queued_ns = r.submit_ns = r.complete_ns = r.end_ns;
    return r;
}

} // namespace drv_gpu_lib
```

### 13.2 Comparison

| Aspect | v1 (3 types + variant) | v2 (1 flat struct) |
|--------|----------------------|-------------------|
| Types count | 4 (Base, OpenCL, ROCm, Variant) | 1 (ProfilingRecord) |
| Inheritance | Yes (OpenCL/ROCm : Base) | No |
| variant dispatch | std::visit in ProcessMessage | No dispatch needed |
| ROCm classification | domain/kind/op | domain/kind/op (KEPT) |
| Hardware counters | map<string,double> | map<string,double> (KEPT) |
| Kind helpers | none | IsKernel()/IsCopy()/KindString() |
| sizeof | OpenCL ~40B, ROCm ~200B | ~250B with counters map (uniform) |
| Includes | `<variant>` | `<map>` (already included) |

---

## 14. Data Hierarchy & Storage

### 14.1 Alex's vision

```
GPU 0
 |- spectrum
 |    |- FFT_Execute          → [rec1, rec2, ..., rec100]
 |    |- Padding_Kernel       → [rec1, rec2, ..., rec100]
 |
 |- stats
 |    |- Welford_Mean         → [rec1, ..., rec50]
 |    |- Radix_Sort           → [rec1, ..., rec50]
 |
GPU 1
 |- strategies/BeamV1         (sub-hierarchy via "/" in module_name)
 |    |- CGEMM                → [rec1, ..., rec200]
 |    |- FFT                  → [rec1, ..., rec200]
 |    |- PostFFT              → [rec1, ..., rec200]
```

### 14.2 ProfileStore class

```cpp
class ProfileStore {
public:
    /// Thread-safe append (called from worker thread)
    void Append(ProfilingRecord record);

    /// Get all records for specific event (for analysis)
    std::vector<ProfilingRecord> GetRecords(int gpu_id,
        const std::string& module, const std::string& event) const;

    /// Get snapshot of entire store (for export)
    using StoreData = std::map<int,                    // gpu_id
                      std::map<std::string,            // module
                      std::map<std::string,            // event
                      std::vector<ProfilingRecord>>>>; // raw data
    StoreData GetSnapshot() const;

    /// Stats
    size_t TotalRecords() const;
    void Reset();

    /// Reserve hint — call at Start() with expected n_runs to avoid reallocations
    void ReserveHint(int gpu_id, const std::string& module,
                     const std::string& event, size_t expected_count);

private:
    // === Per-GPU sharding (review recommendation: 10 GPUs → reduce contention) ===
    struct GpuShard {
        std::map<std::string,              // module
                 std::map<std::string,     // event
                 std::vector<ProfilingRecord>>> modules;
        mutable std::mutex mutex;          // one mutex per GPU, not global
    };
    std::map<int, std::unique_ptr<GpuShard>> shards_;
    mutable std::mutex shards_map_mutex_;  // protects shards_ map itself (rare: only on new GPU)
    std::atomic<uint64_t> next_index_{0};  // auto-increment for record_index (global, atomic)

    GpuShard& GetOrCreateShard(int gpu_id);  // lazy creation, locks shards_map_mutex_ only once per GPU
};
```

### 14.3 Automatic depth via "/" separator

```cpp
// Module writes:
profiler.Record(gpu_id, "spectrum", "FFT_Execute", data);

// Strategies writes deeper:
profiler.Record(gpu_id, "strategies/BeamV1", "CGEMM", data);
profiler.Record(gpu_id, "strategies/BeamV1", "FFT", data);

// Export parses "/" for tree view:
// strategies
//   BeamV1
//     CGEMM: avg=2.5ms, p95=3.1ms
//     FFT:   avg=1.2ms, p95=1.8ms
```

No code change needed in ProfileStore — "/" is just a convention.
Exporters can split by "/" to build tree for display.

---

## 15. ProfileAnalyzer — Stateless Compute

### 15.1 Core structures

```cpp
/// Level 2: Statistical summary for one event
struct EventSummary {
    std::string event_name;
    std::string kernel_name;      // most frequent kernel name
    uint32_t    kind = 0;         // 0=kernel, 1=copy, etc.
    uint64_t    count = 0;
    double avg_ms = 0, min_ms = 0, max_ms = 0;
    double median_ms = 0;
    double p95_ms = 0, p99_ms = 0;
    double stddev_ms = 0;
    double total_ms = 0;
    // Bandwidth (if bytes > 0)
    double avg_bw_gbps = 0;
    double peak_bw_gbps = 0;
    size_t total_bytes = 0;
    // Delays
    double avg_queue_delay_ms = 0;
    double avg_submit_delay_ms = 0;
    double avg_complete_delay_ms = 0;
};

/// Level 1: Pipeline breakdown entry (one event's contribution to module total)
struct PipelineEntry {
    std::string event_name;
    std::string kind_string;      // "kernel", "copy", "barrier"
    double avg_ms = 0;            // average time for this event
    double percent = 0;           // % of total module time
    uint64_t count = 0;
};

/// Level 1: Full pipeline breakdown for one module
struct PipelineBreakdown {
    std::string module_name;
    double total_avg_ms = 0;      // sum of all event averages
    std::vector<PipelineEntry> entries;  // sorted by execution order (record_index)
};

/// Level 3: Aggregated hardware counters for one event
struct HardwareProfile {
    std::string event_name;
    std::string kernel_name;
    uint64_t sample_count = 0;    // how many records had counters
    // Averaged counter values:
    std::map<std::string, double> avg_counters;   // "GPUBusy" → 92.3
    std::map<std::string, double> min_counters;   // "GPUBusy" → 85.0
    std::map<std::string, double> max_counters;   // "GPUBusy" → 98.7
};
```

### 15.2 Analyzer class

```cpp
class ProfileAnalyzer {
public:
    // === Level 2: Statistical Summary ===

    /// Compute full statistics from raw records
    static EventSummary ComputeSummary(const std::vector<ProfilingRecord>& records);

    /// Find outliers (> sigma standard deviations from mean)
    static std::vector<size_t> DetectOutliers(
        const std::vector<ProfilingRecord>& records, double sigma = 3.0);

    /// Compute moving average for trend analysis
    static std::vector<double> MovingAverage(
        const std::vector<ProfilingRecord>& records, size_t window = 10);

    // === Level 1: Pipeline Breakdown (NEW!) ===

    /// Compute % contribution of each event to total module time
    /// Groups all events for given module, computes avg time per event,
    /// returns sorted list with percentages
    static PipelineBreakdown ComputePipelineBreakdown(
        const std::map<std::string, std::vector<ProfilingRecord>>& module_events);

    /// Group records by kind (kernel/copy/barrier) and compute totals
    static std::map<std::string, double> GroupByKind(
        const std::map<std::string, std::vector<ProfilingRecord>>& module_events);

    // === Level 3: Hardware Counters (NEW!) ===

    /// Aggregate hardware counters from records that have them
    /// Returns averaged values across all records with non-empty counters
    static HardwareProfile AggregateCounters(
        const std::vector<ProfilingRecord>& records);

    /// Detect bottleneck type from hardware counters
    /// Returns: "compute-bound", "memory-bound", "cache-miss", "balanced"
    static std::string DetectBottleneck(const HardwareProfile& profile);
};
```

### 15.3 Design principles

- **Stateless** — takes const data, returns result. No side effects.
- **Composable** — Level 1, 2, 3 are independent. Exporters call only what they need.
- **Testable** — unit-test each method with synthetic ProfilingRecord vectors.
- **DetectBottleneck** — automatic analysis:
  - `VALUBusy > 80%` AND `MemUnitBusy < 40%` → **compute-bound**
  - `MemUnitBusy > 70%` AND `VALUBusy < 50%` → **memory-bound**
  - `L2CacheHit < 50%` → **cache-miss** (fetch from VRAM instead of L2)
  - Otherwise → **balanced**

> **⚠️ Architecture-dependent thresholds**: These values are tuned for **RDNA 3.x** (gfx1150/gfx1201,
> Radeon RX 9070 XT). CDNA architectures (MI200/MI300) have different compute/memory balance points.
> **Recommendation**: Store thresholds in a config struct, default to RDNA 3.x values.
> Allow override via `configGPU.json` → `"profiler_thresholds": { "compute_valu_min": 80, ... }`

---

## 16. Three-Level ROCm Report (after discussion with Alex 2026-04-16)

> **Alex**: "мне нужно видеть не только общую цифру по времени но и детально
> сколько времени вносит каждая операция в кернел"
> **Alex**: "в rocm больше параметров и мы их закладывали для анализа"

### 16.1 Level 1 — Pipeline Breakdown (NEW! answers "where is the time spent?")

Shows % contribution of each operation to total module time.
Visual bar chart for instant bottleneck identification.

```
+============================================================================================================+
|                              GPU PROFILING REPORT — PIPELINE BREAKDOWN                                     |
|  GPU 0: AMD Radeon RX 9070 XT  |  ROCm 7.2 / HIP 6.4  |  2026-04-16 14:30:00                            |
+============================================================================================================+

  heterodyne | 100 runs | avg total: 15.200 ms
  +--------------------------+----------+--------+-------+--------------------------------------------------+
  | Event                    | Kind     | Avg ms |    %  | Distribution                                     |
  +--------------------------+----------+--------+-------+--------------------------------------------------+
  | Upload_Input             | copy     |  0.350 |  2.3% | ##                                               |
  | GenConjugate             | kernel   |  1.200 |  7.9% | ########                                         |
  | Multiply                 | kernel   |  2.100 | 13.8% | ##############                                   |
  | FFT_Execute              | kernel   | 11.000 | 72.4% | ######################################################################## |
  | Download_Result          | copy     |  0.550 |  3.6% | ####                                             |
  +--------------------------+----------+--------+-------+--------------------------------------------------+
  | TOTAL                    |          | 15.200 |  100% | kernel: 94.1%  copy: 5.9%  barrier: 0%          |
  +--------------------------+----------+--------+-------+--------------------------------------------------+

  spectrum | 100 runs | avg total: 13.350 ms
  +--------------------------+----------+--------+-------+--------------------------------------------------+
  | FFT_Execute              | kernel   | 12.500 | 93.6% | ############################################################### |
  | Padding_Kernel           | kernel   |  0.850 |  6.4% | ######                                           |
  +--------------------------+----------+--------+-------+--------------------------------------------------+
  | TOTAL                    |          | 13.350 |  100% | kernel: 100%  copy: 0%                           |
  +--------------------------+----------+--------+-------+--------------------------------------------------+

  strategies/BeamV1 | 200 runs | avg total: 28.500 ms
  +--------------------------+----------+--------+-------+--------------------------------------------------+
  | Upload_Covariance        | copy     |  0.800 |  2.8% | ###                                              |
  | CGEMM                    | kernel   |  8.200 | 28.8% | #############################                    |
  | PostGEMM_Stats           | kernel   |  1.500 |  5.3% | #####                                            |
  | FFT_Batch                | kernel   | 14.000 | 49.1% | ################################################# |
  | PostFFT_Normalize        | kernel   |  2.500 |  8.8% | #########                                        |
  | Download_Result          | copy     |  1.500 |  5.3% | #####                                            |
  +--------------------------+----------+--------+-------+--------------------------------------------------+
  | TOTAL                    |          | 28.500 |  100% | kernel: 91.9%  copy: 8.1%                        |
  +--------------------------+----------+--------+-------+--------------------------------------------------+
```

### 16.2 Level 2 — Statistical Summary (extended from original proposal)

Detailed statistics per event — median, percentiles, stddev.

```
+============================================================================================================+
|                              GPU PROFILING REPORT — STATISTICAL SUMMARY                                    |
+============================================================================================================+
|  GPU 0: AMD Radeon RX 9070 XT                                                                              |
+------------------------------------------------------------------------------------------------------------+
| Module          | Event           | Kind   |   N  | Avg(ms) | Med(ms)| p95(ms)|StdDev| Min(ms)| Max(ms)   |
+-----------------+-----------------+--------+------+---------+--------+--------+------+--------+-----------+
| heterodyne      | Upload_Input    | copy   |  100 |   0.350 |  0.340 |  0.410 | 0.03 |  0.300 |    0.450  |
|                 | GenConjugate    | kernel |  100 |   1.200 |  1.190 |  1.350 | 0.05 |  1.100 |    1.450  |
|                 | Multiply        | kernel |  100 |   2.100 |  2.080 |  2.300 | 0.08 |  1.950 |    2.550  |
|                 | FFT_Execute     | kernel |  100 |  11.000 | 10.900 | 12.100 | 0.45 | 10.500 |   15.200  |
|                 | Download_Result | copy   |  100 |   0.550 |  0.540 |  0.620 | 0.03 |  0.480 |    0.700  |
|                 | --- TOTAL ---   |        |  100 |  15.200 |        |        |      |        |           |
+-----------------+-----------------+--------+------+---------+--------+--------+------+--------+-----------+
| spectrum        | FFT_Execute     | kernel |  100 |  12.500 | 12.300 | 14.800 | 0.90 | 11.000 |   15.200  |
|                 | Padding_Kernel  | kernel |  100 |   0.850 |  0.830 |  0.980 | 0.07 |  0.700 |    1.000  |
|                 | --- TOTAL ---   |        |  100 |  13.350 |        |        |      |        |           |
+-----------------+-----------------+--------+------+---------+--------+--------+------+--------+-----------+

  Extended columns (--verbose):
  | ... | Kernel Name              | Bytes(MB) | BW(GB/s) | Q_delay(ms) | S_delay(ms) | C_delay(ms) |
  | ... | hipFFT_r2c_batch_kernel  |     100.0 |      8.4 |       0.145 |       0.060 |       0.025 |
```

### 16.3 Level 3 — Hardware Counters Profile (NEW! uses counters map from ROCm)

Deep analysis of kernel performance using hardware performance counters.
Only for kernel events (kind=0) that have non-empty `counters` map.
Data source: rocprofiler / rocprof --stats.

```
+============================================================================================================+
|                              GPU PROFILING REPORT — HARDWARE PROFILE                                       |
+============================================================================================================+
|  GPU 0: AMD Radeon RX 9070 XT  |  Architecture: RDNA 3.5 (gfx1201)                                       |
+------------------------------------------------------------------------------------------------------------+

  heterodyne | FFT_Execute (kernel) | 100 samples
  +-------------------------+---------+---------+---------+----------------------------------------------+
  | Counter                 |     Avg |     Min |     Max | Assessment                                   |
  +-------------------------+---------+---------+---------+----------------------------------------------+
  | GPUBusy                 |  92.3%  |  85.0%  |  98.7%  | EXCELLENT — GPU well utilized                |
  | VALUBusy                |  78.5%  |  70.2%  |  85.1%  | GOOD — vector ALU active                     |
  | SALUBusy                |  12.3%  |   8.0%  |  18.5%  | LOW — scalar path not bottleneck             |
  | MemUnitBusy             |  45.2%  |  38.0%  |  55.8%  | MODERATE — some memory pressure              |
  | MemUnitStalled          |   8.7%  |   3.2%  |  15.4%  | OK — acceptable stall rate                   |
  | L2CacheHit              |  88.7%  |  82.0%  |  94.5%  | EXCELLENT — cache working well               |
  | LDSBankConflict         |   2.1%  |   0.5%  |   5.3%  | OK — minimal conflicts                       |
  | ALUStalledByLDS         |   1.8%  |   0.2%  |   4.7%  | OK — LDS not blocking ALU                    |
  | FetchSize               | 1024 KB |  980 KB | 1100 KB | Total VRAM reads per run                     |
  | WriteSize               |  512 KB |  490 KB |  540 KB | Total VRAM writes per run                    |
  | Wavefronts              |   16384 |   16384 |   16384 | Consistent occupancy                         |
  | VALUUtilization         |  95.2%  |  92.0%  |  98.0%  | EXCELLENT — minimal thread divergence        |
  +-------------------------+---------+---------+---------+----------------------------------------------+
  | VERDICT: COMPUTE-BOUND (VALUBusy=78.5% >> MemUnitBusy=45.2%)                                          |
  | Optimization: consider reducing ALU operations or increasing occupancy                                  |
  +--------------------------------------------------------------------------------------------------------+
  (second example with MEMORY-BOUND verdict omitted for brevity)
```

### 16.4 Report Levels Summary

| Level | Shows | When | Key Question Answered |
|-------|-------|------|----------------------|
| **L1: Pipeline** | % time per operation, bar chart | Always | "WHERE is the time spent?" |
| **L2: Statistics** | median/p95/stddev per event | Always | "HOW STABLE is each operation?" |
| **L3: Hardware** | GPU counters, bottleneck verdict | When counters available | "WHY is this kernel slow?" |

### 16.5 Export formats

| Format | Level 1 | Level 2 | Level 3 |
|--------|:---:|:---:|:---:|
| **Console** (PrintReport) | YES | YES | YES (--verbose) |
| **JSON** | YES | YES | YES (counters array) |
| **Markdown** | YES | YES | YES (separate table) |
| **CSV** (future) | Flat | YES | Counter columns |

---

## 17. ScopedProfileTimer — RAII for Benchmarks

```cpp
/// RAII timer — measures GPU kernel execution and records to profiler
class ScopedProfileTimer {
public:
    ScopedProfileTimer(int gpu_id, const std::string& module,
                       const std::string& event, hipStream_t stream);
    ~ScopedProfileTimer();  // records elapsed time

    ScopedProfileTimer(const ScopedProfileTimer&) = delete;
    ScopedProfileTimer& operator=(const ScopedProfileTimer&) = delete;

private:
    ScopedHipEvent start_, end_;
    hipStream_t stream_;
    int gpu_id_;
    std::string module_, event_;
};

// Usage in benchmark:
void ExecuteKernelTimed() override {
    ScopedProfileTimer timer(gpu_id_, "spectrum", "FFT_Execute", stream_);
    fft_.Process(input_, output_);  // timer dtor records timing
}
```

**Scope**: ScopedProfileTimer — for simple cases (one external kernel = one timer).

### 17a. ROCmProfEvents Pattern — BatchRecord API (CRITICAL, from review)

> **Review finding**: ALL 17 benchmark files in GPUWorkLib use module-internal
> `*ROCmProfEvents` maps, NOT external ScopedProfileTimer. Each module collects
> per-operation hipEvent timing INSIDE its Process() call. Benchmarks iterate
> the events map and batch-record to profiler.

#### 17a.1 Real pattern (from GPUWorkLib — 21 files use this)

```cpp
// heterodyne_benchmark_rocm.hpp:61-65 — REAL CODE
void ExecuteKernelTimed() override {
    HeterodyneROCmProfEvents events;                    // module-specific map
    proc_.Dechirp(rx_data_, ref_data_, params_, &events); // module fills internally
    for (auto& [name, data] : events)
        RecordROCmEvent(name, data);                    // batch record to profiler
}

// Each module has its own *ROCmProfEvents type:
//   FFTROCmProfEvents, FiltersROCmProfEvents, StatisticsROCmProfEvents,
//   HeterodyneROCmProfEvents, SignalGenROCmProfEvents, CaponROCmProfEvents, etc.
//
// These are typically: using XxxROCmProfEvents = std::vector<std::pair<std::string, ROCmProfilingData>>;
```

#### 17a.2 Why ScopedProfileTimer alone is NOT enough

```
ScopedProfileTimer wraps ONE call from OUTSIDE:
  { ScopedProfileTimer t(...); proc.Process(...); }  // only total time

ROCmProfEvents collects N operations INSIDE Process():
  Process() internally records: Upload(0.3ms), Kernel1(2.1ms), Kernel2(11ms), Download(0.5ms)

L1 Pipeline Breakdown REQUIRES per-operation granularity → ROCmProfEvents pattern stays.
```

#### 17a.3 Two recording approaches (BOTH supported)

| Approach | When to use | Example |
|----------|-------------|---------|
| **ScopedProfileTimer** | Simple cases: one kernel, external timing | `{ ScopedProfileTimer t(...); kernel(); }` |
| **BatchRecord** | Pipeline modules: N operations timed internally | `for (auto& [name, data] : events) Record(...)` |

#### 17a.4 API additions to ProfilingFacade

```cpp
class ProfilingFacade {
public:
    // === Single record (ROCm data → internal conversion to ProfilingRecord) ===
    void Record(int gpu_id, const std::string& module,
                const std::string& event, const ROCmProfilingData& data);

    // === Batch record (for ROCmProfEvents pattern) ===
    /// Records all events from a module's profiling events map.
    /// Internally converts each ROCmProfilingData → ProfilingRecord.
    template<typename EventsContainer>
    void BatchRecord(int gpu_id, const std::string& module,
                     const EventsContainer& events) {
        for (const auto& [event_name, data] : events) {
            Record(gpu_id, module, event_name, data);
        }
    }
    // ...
};
```

#### 17a.5 ProfilingRecord::FromROCm factory

```cpp
/// Convert legacy ROCmProfilingData to new ProfilingRecord
static ProfilingRecord FromROCm(const ROCmProfilingData& src,
                                 int gpu_id,
                                 const std::string& module,
                                 const std::string& event) {
    ProfilingRecord r;
    r.gpu_id       = gpu_id;
    r.module_name  = module;
    r.event_name   = event;
    // Timing
    r.start_ns     = src.start_ns;
    r.end_ns       = src.end_ns;
    r.queued_ns    = src.queued_ns;
    r.submit_ns    = src.submit_ns;
    r.complete_ns  = src.complete_ns;
    // ROCm classification
    r.domain       = src.domain;
    r.kind         = src.kind;
    r.op           = src.op;
    r.correlation_id = src.correlation_id;
    r.device_id    = src.device_id;
    r.queue_id     = src.queue_id;
    r.bytes        = src.bytes;
    r.kernel_name  = src.kernel_name;
    r.counters     = src.counters;
    return r;
}
```

#### 17a.6 Migration path for benchmarks

```
BEFORE (v1 — current GPUWorkLib pattern):
  #include "DrvGPU/services/gpu_benchmark_base.hpp"
  HeterodyneROCmProfEvents events;
  proc_.Dechirp(..., &events);
  for (auto& [name, data] : events)
      RecordROCmEvent(name, data);        // → GPUProfiler::Record(ROCmProfilingData)

AFTER (v2 — new_profiler branch):
  #include <core/services/profiling/profiling_facade.hpp>
  HeterodyneROCmProfEvents events;
  proc_.Dechirp(..., &events);
  ProfilingFacade::GetInstance().BatchRecord(gpu_id_, "heterodyne", events);
  // OR keep per-event loop — both work
```

Production module code (Process/Dechirp/etc.) is UNCHANGED — only benchmark files update.

---

## 17b. ReportPrinter — Block-Based Console Output (NEW)

> **Alex**: вывод на консоль через специальный класс и вывод блоками

### 17b.1 Problem

Current PrintReport() uses raw `std::cout` — 170 lines of `std::cout <<` with manual formatting.
Problems:
- Not testable (can't capture output)
- Not redirectable (always stdout)
- Mixed formatting logic with data access
- Can't suppress specific blocks

### 17b.2 ReportPrinter class

```cpp
/// Block-based report printer — replaces raw std::cout in profiler
/// Supports: console, file, stringstream (for tests)
class ReportPrinter {
public:
    explicit ReportPrinter(std::ostream& out = std::cout);

    // === Block API — each method prints one self-contained block ===

    /// Print report header (GPU info, date, driver)
    void PrintHeader(const GPUReportInfo& info, int gpu_id);

    /// Print Level 1: Pipeline breakdown with bar chart
    void PrintPipelineBreakdown(const PipelineBreakdown& breakdown);

    /// Print Level 2: Statistical summary table
    void PrintStatisticalTable(const std::string& module,
                               const std::vector<EventSummary>& summaries);

    /// Print Level 3: Hardware counters profile
    void PrintHardwareProfile(const HardwareProfile& profile);

    /// Print footer (legend, timestamp)
    void PrintFooter();

    /// Print separator line
    void PrintSeparator(char ch = '-', int width = 110);

    // === Configuration ===

    void SetWidth(int width);           // table width (default 110)
    void SetVerbose(bool verbose);      // show extended columns
    void SetColorEnabled(bool enable);  // ANSI colors for terminal (future)

private:
    std::ostream& out_;
    int width_ = 110;
    bool verbose_ = false;
    bool color_ = false;

    // Internal formatting helpers
    std::string Pad(const std::string& s, int w) const;
    std::string FmtMs(double val, int prec = 3) const;
    std::string BarChart(double percent, int max_width = 50) const;
};
```

### 17b.3 Usage pattern

```cpp
// In ConsoleExporter — compose L1+L2+L3 blocks:
ReportPrinter printer(std::cout);  // or stringstream for tests
printer.PrintHeader(gpu_info, gpu_id);
printer.PrintPipelineBreakdown(ProfileAnalyzer::ComputePipelineBreakdown(events));
printer.PrintStatisticalTable(module, summaries);
printer.PrintHardwareProfile(ProfileAnalyzer::AggregateCounters(records));
printer.PrintFooter();

// In tests — capture output:
std::ostringstream oss;
ReportPrinter printer(oss);
printer.PrintPipelineBreakdown(test_breakdown);
ASSERT(oss.str().contains("72.4%"));
```

---

## 17c. Git Branching Strategy (NEW)

> **Alex**: все это делать в отдельных ветках типа new_profiler

### 17c.1 Branch naming

All profiler v2 work happens in branch **`new_profiler`** in each affected repo.
Main branch stays untouched until work is tested and approved.

| Repo | Branch | What changes |
|------|--------|-------------|
| **core** | `new_profiler` | ALL new profiler code (ProfilingRecord, Store, Analyzer, Exporters, ReportPrinter) |
| **spectrum** | `new_profiler` | Update benchmark classes to use new Record() API |
| **stats** | `new_profiler` | Update benchmark classes |
| **signal_generators** | `new_profiler` | Update benchmark classes |
| **heterodyne** | `new_profiler` | Update benchmark classes |
| **linalg** | `new_profiler` | Update benchmark classes |
| **radar** | `new_profiler` | Update benchmark classes |
| **strategies** | `new_profiler` | Update benchmark classes |
| **DSP** | `new_profiler` | Update meta-build if needed |

### 17c.2 Workflow

```
main ──────────────────────────────────────────── (stable, Phase 4 testing)
  \
   new_profiler ── Phase A ── Phase B ── Phase C ── Phase D ── PR → main
```

1. `git checkout -b new_profiler` from main (after Phase 4 baseline passes)
2. All profiler v2 work in `new_profiler`
3. Periodically rebase on main if main gets fixes
4. When all tests pass → PR to main
5. After merge → tag `v0.3.0` (profiler v2)

### 17c.3 Cross-repo dependency order

```
core/new_profiler        (FIRST — all new code here)
  ↓ (FetchContent from core new_profiler branch)
spectrum/new_profiler
stats/new_profiler
signal_generators/new_profiler
heterodyne/new_profiler
linalg/new_profiler
radar/new_profiler
strategies/new_profiler   (LAST — depends on all above)
  ↓
DSP/new_profiler          (meta-build verification)
```

### 17c.4 CMakePresets for branch testing

Each repo's `CMakePresets.json` in `new_profiler` branch points FetchContent to
`core/new_profiler` branch (or local dir via `FETCHCONTENT_SOURCE_DIR_DSP_CORE`):

```bash
# Local dev — all repos checked out to new_profiler:
cd /home/alex/DSP-GPU/core && git checkout new_profiler
cd /home/alex/DSP-GPU/spectrum && git checkout new_profiler
# ... etc.
cmake -S . -B build --preset debian-local-dev  # uses local dirs
```

### 17c.5 Cross-repo migration: what changes per repo

> Migration pattern: see **section 17a.6** for correct BEFORE/AFTER
> (uses ROCmProfEvents → BatchRecord, NOT cl_event → ScopedProfileTimer).

Files to update per repo (benchmark/test files only — production code UNCHANGED):

> **Updated 2026-04-16 (review)**: verified by grep across GPUWorkLib/modules/*/tests/

| Repo | Benchmark files (verified) | Count |
|------|---------------------------|-------|
| spectrum | `fft_processor_benchmark_rocm.hpp`, `fft_maxima_benchmark_rocm.hpp`, `test_fft_benchmark_rocm.hpp`, `test_fft_maxima_benchmark_rocm.hpp`, `filters_benchmark_rocm.hpp`, `test_filters_benchmark_rocm.hpp`, `lch_farrow_benchmark_rocm.hpp`, `test_lch_farrow_benchmark_rocm.hpp` | **8** |
| stats | `statistics_compute_all_benchmark.hpp`, `snr_estimator_benchmark.hpp` | **2** |
| signal_generators | `signal_generators_benchmark_rocm.hpp`, `test_signal_generators_benchmark_rocm.hpp` | **2** |
| heterodyne | `heterodyne_benchmark_rocm.hpp`, `test_heterodyne_benchmark_rocm.hpp` | **2** |
| linalg | `capon_benchmark.hpp`, `test_capon_benchmark_rocm.hpp` | **2** |
| radar | _(нет benchmark-файлов в GPUWorkLib — нужно создать в Phase 4)_ | **0** |
| strategies | `strategies_profiling_benchmark.hpp` | **1** |
| **Total** | | **17 files** |

> **Note**: radar не имеет benchmark-файлов. Их нужно будет написать с нуля (module-tester agent).

---

## 18. Updated Architecture Diagram (v2 Final)

```
+============================================================================+
|                    GPUProfiler v2 — Collect-Then-Compute                    |
|                    Branch: new_profiler (per repo)                          |
+============================================================================+
|                                                                             |
|  +---- ProfilingFacade (Singleton, thin API) --------+                     |
|  |                                                    |                     |
|  |  Record(gpu, module, event, ROCmData) ---+         |                     |
|  |  BatchRecord(gpu, module, events_map) ---+         |  (17a: ROCmProfEvents) |
|  |  WaitEmpty()                             |         |                     |
|  |  Compute() ---- lazy on Export if dirty -|--+      |                     |
|  |  Export()  ---- calls exporters ---------|--|--+   |                     |
|  |  Reset()                                 |  |  |   |                     |
|  +------------------------------------------+  |  |   |                     |
|            |                              |  |       |                     |
|  +---------v---- ProfileCollector ----+   |  |       |                     |
|  |  : AsyncServiceBase<ProfilingRecord>|   |  |       |                     |
|  |  WorkerThread:                      |   |  |       |                     |
|  |    push_back(record) → store_.Append|   |  |       |                     |
|  +------------------+------------------+   |  |       |                     |
|                     |                      |  |       |                     |
|  +------------------v---- ProfileStore ---+|  |       |                     |
|  |  gpu_id → module → event → vector<Rec> ||  |       |                     |
|  |  Thread-safe (mutex per GPU)           ||  |       |                     |
|  |  GetSnapshot() → full copy             ||  |       |                     |
|  +-------------------+--------------------+|  |       |                     |
|                      |                      |  |       |                     |
|  +-------------------v-- ProfileAnalyzer --+|  |       |                     |
|  |  STATELESS — const data → results      ||  |       |                     |
|  |                                         ||  |       |                     |
|  |  L1: ComputePipelineBreakdown()         |<--+       |                     |
|  |  L2: ComputeSummary() → EventSummary    |           |                     |
|  |  L3: AggregateCounters() → HwProfile    |           |                     |
|  |      DetectBottleneck() → verdict       |           |                     |
|  |  DetectOutliers(), MovingAverage()      |           |                     |
|  +-----------------------------------------+           |                     |
|                                                        |                     |
|  +---- Exporters (Strategy) --------------------------+                     |
|  |                                                                          |
|  |  IProfileExporter::Export(store, gpu_info)                               |
|  |    +-- JsonExporter         → file.json                                  |
|  |    +-- MarkdownExporter     → file.md                                    |
|  |    +-- ConsoleExporter      → ReportPrinter → ostream                    |
|  |    +-- [future: CSV, InfluxDB, Grafana...]                               |
|  |                                                                          |
|  |  +---- ReportPrinter (block-based output) ----+                          |
|  |  |  PrintHeader()           → GPU info block   |                          |
|  |  |  PrintPipelineBreakdown()→ L1 bar chart     |                          |
|  |  |  PrintStatisticalTable() → L2 stats table   |                          |
|  |  |  PrintHardwareProfile()  → L3 counters      |                          |
|  |  |  PrintFooter()           → legend            |                          |
|  |  |  Injectable ostream (cout / file / sstream)  |                          |
|  |  +---------------------------------------------+                          |
|  +--------------------------------------------------------------------------+
|                                                                              |
|  +---- GpuBenchmarkBase (Template Method) ----+                             |
|  |  Run():  warmup → measure (ScopedProfileTimer)                           |
|  |  Report(): WaitEmpty → Compute → Export → Stop                           |
|  +--------------------------------------------+                             |
+==============================================================================+
```

---

## 19. Updated Migration Phases

> All work in branch **`new_profiler`** per repo. Main stays stable.

### Phase A: Branch + Remove OpenCL (core/new_profiler only)

| Step | Action | Files | Risk |
|------|--------|-------|------|
| A0 | `git checkout -b new_profiler` in core/ | — | None |
| A1 | Delete `OpenCLProfilingData`, `ProfilingTimeVariant` | profiling_types.hpp | Low |
| A2 | Replace `Record(OpenCL)` with `Record(ROCm)` everywhere | gpu_profiler.hpp, tests | Low |
| A3 | Remove `std::visit` in ProcessMessage, always ROCm | gpu_profiler.cpp | Low |
| A4 | Remove OpenCL table from PrintReport (keep ROCm only) | gpu_profiler.cpp | Low |
| A5 | Replace `MakeOpenCLFromDurationMs` with `MakeRecordFromMs` | profiling_types.hpp, tests | Low |
| A6 | Delete `opencl_profiling.hpp/.cpp` from profiler | 2 files | Low |
| A7 | Remove `RecordEvent(cl_event)` from GpuBenchmarkBase | gpu_benchmark_base.hpp | Low |
| A8 | **Build + test core/new_profiler** | ctest | Gate |

### Phase B: Collect-Then-Compute (core/new_profiler)

| Step | Action | Files | Risk |
|------|--------|-------|------|
| B1 | Create `ProfilingRecord` (flat struct, ALL ROCm fields + counters) | profiling_types.hpp (rewrite) | Low |
| B2 | Create `ProfileStore` (vector storage, thread-safe) | NEW: profile_store.hpp/cpp | Low |
| B3 | Create `ProfileAnalyzer` (L1+L2+L3 compute) | NEW: profile_analyzer.hpp/cpp | Low |
| B4 | Rewrite `ProcessMessage()`: push_back instead of aggregate | gpu_profiler.cpp | Medium |
| B5 | Add `Compute()` method to facade | gpu_profiler.hpp | Low |
| B6 | Create `ReportPrinter` (block-based console output) | NEW: report_printer.hpp/cpp | Low |
| B7 | Rewrite export methods using ProfileAnalyzer + ReportPrinter | gpu_profiler.cpp | Medium |
| B8 | Add L1 pipeline breakdown + L2 median/p95/stddev + L3 hardware | gpu_profiler.cpp | Medium |
| B9 | **Build + test core/new_profiler** | ctest | Gate |

### Phase C: Strategy Exporters + ScopedProfileTimer (core/new_profiler)

| Step | Action | Files | Risk |
|------|--------|-------|------|
| C1 | Create `IProfileExporter` interface | NEW | None |
| C2 | Extract JsonExporter, MarkdownExporter, ConsoleExporter | 3 NEW files | Low |
| C3 | Create `ScopedProfileTimer` RAII class | NEW | Low |
| C4 | Update GpuBenchmarkBase to use ScopedProfileTimer | gpu_benchmark_base.hpp | Low |
| C5 | **Build + test core/new_profiler** | ctest | Gate |

### Phase D: Cross-Repo Migration (new_profiler in each repo)

| Step | Action | Repos | Risk |
|------|--------|-------|------|
| D0 | `git checkout -b new_profiler` in each repo | all 7 | None |
| D1 | Update benchmark files: `RecordROCmEvent()` loop → `BatchRecord()` | spectrum (8), stats (2), signal_generators (2), heterodyne (2), linalg (2), strategies (1) = **17 files** | Medium |
| D2 | Update includes: `opencl_profiling.hpp` → `profiling_facade.hpp` | 17 files | Low |
| D3 | radar: **create** benchmark files from scratch (no benchmarks exist in GPUWorkLib) | radar | Medium |
| D4 | Build + test each repo on `new_profiler` branch | all 8 | Gate |
| D5 | **Full pipeline test**: all 8 repos on `new_profiler` | `debian-local-dev` preset | Gate |

### Phase E: Polish + Merge

| Step | Action | Risk |
|------|--------|------|
| E1 | Rewrite profiler tests for new API | Low |
| E2 | Add unit tests for ProfileAnalyzer (L1, L2, L3) | None |
| E3 | Golden file tests (JSON/MD output comparison) | None |
| E4 | Memory safety: max_records limit (default 10,000) | None |
| E5 | PR `new_profiler → main` in core/ (review with Alex) | Gate |
| E6 | PR `new_profiler → main` in all other repos | Gate |
| E7 | Tag `v0.3.0` in all repos after merge | After Alex OK |

### Phase summary + Effort Estimate (updated from review)

```
main ──────────────────────────────────────────────────── (stable)
  \                                                    /
   new_profiler ── A ── B ── C ── D ── E ── PR ── merge
                   |         |         |
                 core     core     7 repos
                 only     only     update
```

| Phase | Scope | Effort (revised) | Key risk |
|-------|-------|-----------------|----------|
| A (OpenCL removal) | core only | **2-3 hours** | Low |
| B (Collect-then-compute) | core only | **8-12 hours** | ProfileAnalyzer (300-400 LOC stat code) + ReportPrinter (300+ LOC L1/L2/L3 formatting) |
| C (Strategy + Timer) | core only | **3-4 hours** | Low (ScopedProfileTimer scope reduced — ROCmProfEvents stays) |
| D (Cross-repo) | 7 repos, 17 files | **5-7 hours** | ROCmProfEvents → BatchRecord migration in 17 files. radar needs benchmarks from scratch |
| E (Polish + merge) | all repos | **1-2 hours** | Gate: Alex review PRs |
| **TOTAL** | | **19-28 hours** | Original 10-15h was underestimate |

---

## 20. Recommendations from Review (2026-04-16)

| # | Recommendation | Rationale |
|---|---------------|-----------|
| R1 | **Lazy Compute()** — auto-trigger on first Export() if data changed since last compute | User forgetting `Compute()` before `Export()` is error-prone. Add `dirty_` flag, set on `Append()`, clear on `Compute()`. `Export()` calls `Compute()` if dirty. |
| R2 | **Reserve hint** — `ProfileStore::ReserveHint(gpu, module, event, n_runs)` called in GpuBenchmarkBase::InitProfiler() | Avoids vector reallocations in hot path. `n_runs` is known from BenchmarkConfig. |
| R3 | **Ring buffer option** for max_records — when limit hit, drop oldest records instead of rejecting new ones | Keeps latest data for trend analysis. Alternative: reject with `DRVGPU_LOG_WARNING`. |
| R4 | **ProfilingRecord::FromROCm() factory** — single conversion point | All 17 benchmark files pass ROCmProfilingData. Conversion to ProfilingRecord should be in ONE place, not scattered across Record() calls. See section 17a.5. |

---

## 21. Updated Decision Points for Alex

| # | Question | Recommendation |
|---|----------|---------------|
| Q1 | Full rewrite (A-E) or partial? | **Full** — collect-then-compute needs B+C+D minimum |
| Q2 | Keep manual JSON? | **Yes** — no new deps in core |
| Q3 | Subdirectories? | **Yes** — `profiling/` + `exporters/` for clarity |
| Q4 | When to start? | **After Phase 4 testing** — need working baseline first |
| Q5 | ~~New formats?~~ | Deferred — Strategy makes adding them trivial later |
| Q6 | Max records safety limit? | **1,000 per (gpu, module, event)** default (revised from 10K — see 11.3.1 memory budget). Configurable via configGPU.json |
| Q7 | roctracer integration for full 5-field timing? | **Later** — start with hipEvent start/end |
| Q8 | Export raw data in JSON? | **Optional flag** — useful for Jupyter analysis |
| Q9 | Branch name? | **`new_profiler`** in each repo |
| Q10 | Merge strategy? | PR per repo, core first, then 7 repos |
| Q11 | **NEW**: Ring buffer or reject on max_records? | **Ring buffer** recommended (keeps latest data for trends) |
| Q12 | **NEW**: Lazy Compute() or explicit? | **Lazy** (auto on Export if dirty) — safer API |


