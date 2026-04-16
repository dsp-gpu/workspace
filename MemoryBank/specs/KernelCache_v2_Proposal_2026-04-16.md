# Kernel Cache v2 -- Deep Analysis & Per-Repo Improvement Plan

**Date**: 2026-04-16 (v2 — after Alex review, fixed architecture)
**Author**: Codo (AI Assistant)
**Object**: Kernel compilation, disk caching, GPU memory persistence — ALL 8 repos
**Method**: 2 Explore agents + Context7 ROCm + sequential-thinking (9 steps)
**Status**: PROPOSAL v2 — fixed per Alex: NO global singleton, per-GPU architecture

---

## 0. Architecture Principle (from Alex)

> "10 GPU, у всех свой объектник, не пересекаются.
> Критерий — **надёжность** и **скорость**!"

Each GPU has its own address space. `hipModule_t` is device-specific.
**NO global singleton**. Each GPU independently:
1. Compiles its own kernels (or loads from disk cache)
2. Keeps them in its own memory until processor destroyed
3. Disk cache shared (per-architecture subdirs: gfx1201/, gfx908/)

GpuContext (per-module, per-GPU) is the **correct** ownership model.
Fix: ensure ALL modules use it, fix stale cache, add preloading.

---

## 1. Full Project Inventory (every file, every repo)

### 1.1 Pattern A: Through GpuContext (correct) — 21 files

| Repo | Class | File | Status |
|------|-------|------|--------|
| **spectrum** | FFTProcessorROCm | `fft_processor_rocm.cpp` | ✅ |
| | SpectrumProcessorROCm | `spectrum_processor_rocm.cpp` | ✅ |
| | ComplexToMagPhaseROCm | `complex_to_mag_phase_rocm.cpp` | ✅ |
| | LchFarrowROCm | `lch_farrow_rocm.cpp` | ✅ |
| | FirFilterROCm | `fir_filter_rocm.cpp` | ✅ |
| | IirFilterROCm | `iir_filter_rocm.cpp` | ✅ |
| | KalmanFilterROCm | `kalman_filter_rocm.cpp` | ✅ |
| | MovingAverageFilterROCm | `moving_average_filter_rocm.cpp` | ⚠️ recreates GpuContext on N_WINDOW change |
| | KaufmanFilterROCm | `kaufman_filter_rocm.cpp` | ⚠️ recreates GpuContext on N_WINDOW change |
| **stats** | StatisticsProcessor | `statistics_processor.cpp` | ✅ clean Ref03 |
| **heterodyne** | HeterodyneProcessorROCm | `heterodyne_processor_rocm.cpp` | ✅ |
| **signal_gen** | CwGeneratorROCm | `cw_generator_rocm.cpp` | ✅ |
| | LfmGeneratorROCm | `lfm_generator_rocm.cpp` | ✅ |
| | LfmConjugateGeneratorROCm | `lfm_conjugate_generator_rocm.cpp` | ✅ |
| | LfmGeneratorAnalyticalDelayROCm | `lfm_generator_analytical_delay_rocm.cpp` | ✅ |
| | NoiseGeneratorROCm | `noise_generator_rocm.cpp` | ✅ |
| | FormSignalGeneratorROCm | `form_signal_generator_rocm.cpp` | ✅ |
| **radar** | RangeAngleProcessor | `range_angle_processor.cpp` | ✅ |
| | FMCorrelatorProcessorROCm | `fm_correlator_processor_rocm.cpp` | ⚠️ legacy dead code |
| **linalg** | CaponProcessor | `capon_processor.cpp` | ✅ |
| **strategies** | AntennaProcessorV1 | `antenna_processor_v1.cpp` | ✅ |

### 1.2 Pattern B: Manual hiprtc (NEEDS FIX) — 6 files

| Repo | Class | File | Problem |
|------|-------|------|---------|
| **spectrum** | AllMaximaPipelineROCm | `all_maxima_pipeline_rocm.cpp` | Own hipModule_t + KernelCacheService, ~150 lines boilerplate |
| **signal_gen** | ScriptGeneratorROCm | `script_generator_rocm.cpp` | Own hipModule_t, **NO disk cache!** Recompiles every run! |
| **linalg** | CholeskyInverterROCm | `cholesky_inverter_rocm.cpp` | Own kernel_cache_ + hipModule_t, ~100 lines |
| **linalg** | SymmetrizeGpuROCm | `symmetrize_gpu_rocm.cpp` | Own KernelCacheService + hiprtc, ~90 lines |
| **linalg** | DiagonalLoadRegularizer | `diagonal_load_regularizer.cpp` | Manual hiprtc, own module_/function_ |
| **strategies** | StrategiesFloatApi | `strategies_float_api.hpp` | ~120 lines INLINE in header! Own kernel_module_ |

### 1.3 Summary

```
Pattern A (GpuContext): 21 files ✅  (reliable, cached, fast)
Pattern B (manual):      6 files ❌  (duplicated, fragile, some without cache)
Issues in Pattern A:     3 files ⚠️  (dead code, GpuContext recreation)

Total duplicated boilerplate: ~670 lines across 6 Pattern B files
```

---

## 2. Critical Issues Found

### 2.1 CRITICAL: ScriptGeneratorROCm has NO disk cache!

**File**: `signal_generators/src/.../script_generator_rocm.cpp`
```cpp
// Lines 298-305:
hipError_t err = hipModuleLoadData(&module_, code.data());
// ...
err = hipModuleGetFunction(&kernel_fn_, module_, "script_signal");
```
**Problem**: NO KernelCacheService, NO Save() call. **Recompiles hiprtc EVERY time.**
Cost: ~100-200ms per script generator creation on each of 10 GPUs.
**Fix**: Add GpuContext with disk cache → ~1-5ms after first run.

### 2.2 HIGH: Stale binary risk (no source hash)

**File**: `core/src/services/kernel_cache_service.cpp` Load()
```cpp
if (entry->has_binary()) return *entry;  // No hash check!
```
**Problem**: If kernel source changes (bug fix), old binary still loaded from cache.
**Fix**: SHA256 hash of source in manifest.json, verify on Load().

### 2.3 MEDIUM: 6 files with Pattern B — ~670 lines duplication

Each Pattern B file repeats:
```cpp
hiprtcCreateProgram → hiprtcCompileProgram → hiprtcGetCode →
hipModuleLoadData → hipModuleGetFunction → kernel_cache_->Save()
```
**Fix**: Replace with `ctx_.CompileModule(source, names)` — 1 line.

### 2.4 LOW: GpuContext recreation in spectrum filters

**Files**: `moving_average_filter_rocm.cpp:137`, `kaufman_filter_rocm.cpp:119`
```cpp
ctx_ = drv_gpu_lib::GpuContext(backend, "SMA", "modules/filters/kernels");
ctx_.CompileModule(...);  // recompile with new N_WINDOW define
```
**Acceptable**: N_WINDOW changes are rare. Disk cache covers reloading.
But hipModuleUnload → hipModuleLoadData = ~5ms penalty.

### 2.5 LOW: Dead code in FMCorrelator

**File**: `radar/src/fm_correlator/src/fm_correlator_processor_rocm.cpp:590-710`
Legacy `CompileKernels()` method + own `kernel_cache_` member.
Already replaced by `EnsureCompiled()` + GpuContext. ~120 lines dead code.

---

## 3. Current Kernel Lifecycle Per GPU

```
GPU 0 starts:
  ┌─ HeterodyneProcessor(backend_gpu0)
  │    └─ GpuContext("heterodyne", cache_dir)
  │         └─ CompileModule():
  │              1. disk hit? → hipModuleLoadData (~1ms) → DONE
  │              2. disk miss → hiprtc (~150ms) → hipModuleLoadData → Save()
  │         └─ hipModule_t lives in GPU 0 memory
  │         └─ hipFunction_t pointers cached in map
  │
  ├─ FFTProcessor(backend_gpu0)
  │    └─ GpuContext("fft_func", cache_dir) ... same flow
  │
  ├─ StatisticsProcessor(backend_gpu0) ...
  └─ ... (all modules)

GPU 0 runs N iterations:
  Each call → ctx_.GetKernel("name") → O(1) lookup → hipModuleLaunchKernel
  NO recompilation, NO disk I/O. Pure GPU speed.

GPU 0 shutdown:
  ~Processor → ~GpuContext → hipModuleUnload → memory freed
```

This is CORRECT for reliability. Each GPU is independent.
Kernel stays in GPU memory for entire processor lifetime.

---

## 4. Proposed Fixes (per file)

### CORE: 3 improvements

| # | File | Change | Priority |
|---|------|--------|----------|
| **C1** | `kernel_cache_service.cpp` | Add SHA256 source hash validation in Load() | HIGH |
| **C2** | `kernel_cache_service.hpp` | Add CacheStats: hits, misses, compile_time_ms | MEDIUM |
| **C3** | `gpu_context.hpp/cpp` | Add `static PreloadFromCache()` for startup warming | LOW |

### SPECTRUM: 1 migration

| # | File | Change | Lines removed |
|---|------|--------|:---:|
| **S1** | `all_maxima_pipeline_rocm.cpp` + `.hpp` | Replace manual hiprtc with GpuContext | ~150 |

### SIGNAL_GENERATORS: 1 critical fix

| # | File | Change | Lines removed |
|---|------|--------|:---:|
| **SG1** | `script_generator_rocm.cpp` + `form_script_generator.hpp` | Add GpuContext + disk cache (currently NO CACHE!) | ~80 |

### RADAR: 1 cleanup

| # | File | Change | Lines removed |
|---|------|--------|:---:|
| **R1** | `fm_correlator_processor_rocm.cpp` | Delete dead CompileKernels() + own kernel_cache_ | ~120 |

### LINALG: 3 migrations

| # | File | Change | Lines removed |
|---|------|--------|:---:|
| **L1** | `cholesky_inverter_rocm.cpp` + `.hpp` | Replace with GpuContext | ~100 |
| **L2** | `symmetrize_gpu_rocm.cpp` | Replace with GpuContext | ~90 |
| **L3** | `diagonal_load_regularizer.cpp` + `.hpp` | Replace with GpuContext | ~80 |

### STRATEGIES: 1 migration

| # | File | Change | Lines removed |
|---|------|--------|:---:|
| **ST1** | `strategies_float_api.hpp` | Replace inline hiprtc with GpuContext, move to .cpp | ~120 |

### Total

| Metric | Value |
|--------|-------|
| Files to change | 12 |
| Repos affected | 6 of 8 (stats & heterodyne clean) |
| Lines removed (boilerplate) | **~740** |
| Lines added | ~50 (hash, stats, preload) |
| Net reduction | **~690 lines** |

---

## 5. Per-Fix Details

### C1: SHA256 Source Hash Validation

```cpp
// In KernelCacheService::Save():
void Save(name, source, binary, metadata, comment) {
    // ... existing atomic write ...
    WriteManifestEntry(name, comment, backend,
        ComputeHash(source));  // NEW: store hash
}

// In KernelCacheService::Load():
std::optional<CacheEntry> Load(name, const std::string& current_source) {
    auto entry = LoadFromDisk(name);
    if (!entry || !entry->has_binary()) return std::nullopt;
    
    // NEW: verify source hasn't changed
    std::string cached_hash = GetManifestHash(name);
    std::string current_hash = ComputeHash(current_source);
    if (cached_hash != current_hash) {
        // Source changed! Binary is stale.
        DRVGPU_LOG_WARNING("KernelCache",
            name + ": source hash mismatch, recompiling");
        return std::nullopt;  // Force recompile
    }
    return entry;
}
```

SHA256 implementation: ~50 lines standalone (no external dep), or simple FNV-1a hash (faster, sufficient for change detection).

### SG1: ScriptGeneratorROCm — Most Critical Fix

**Before** (no cache, recompiles every time):
```cpp
hiprtcCreateProgram(&prog, source.c_str(), ...);
hiprtcCompileProgram(prog, ...);  // ~150ms EVERY TIME!
hiprtcGetCode(prog, code.data());
hipModuleLoadData(&module_, code.data());
```

**After** (with GpuContext):
```cpp
// In constructor:
ctx_ = GpuContext(backend, "ScriptGen", ResolveCacheDir("script_gen"));

// In CompileScript():
ctx_.CompileModule(generated_source, {"script_signal"});
// First run: hiprtc → save HSACO. Next runs: load from disk (~1ms)
```

### L1-L3: linalg migration example

**Before** (symmetrize_gpu_rocm.cpp, ~90 lines):
```cpp
kernel_cache_ = make_unique<KernelCacheService>(cache_dir);
auto entry = kernel_cache_->Load(kKernelName);
if (entry && entry->has_binary()) {
    hipModuleLoadData(&module, entry->binary.data());
    hipModuleGetFunction(&func, module, "symmetrize_upper_to_full");
} else {
    hiprtcCreateProgram(...);
    hiprtcCompileProgram(...);
    // ... 50 more lines ...
    kernel_cache_->Save(...);
}
```

**After** (3 lines):
```cpp
// In constructor: ctx_(backend, "SymmetrizeGPU", ResolveCacheDir("vector_algebra"))
// In EnsureCompiled():
ctx_.CompileModule(kernels::GetSymmetrizeSource(), {"symmetrize_upper_to_full"});
```

---

## 6. Kernel Memory Persistence Guarantee

> Alex: "контроль что когда кернел вызывается, он остается в памяти до окончания работы"

**Current guarantee** (for Pattern A):
```
hipModule_t lifetime = GpuContext lifetime = Processor lifetime = Application lifetime
```

Processors are created once at startup and destroyed at shutdown.
Kernels stay in GPU memory for the ENTIRE session. ✅

**Risk only in Pattern B** (manual hipModule):
- DiagonalLoadRegularizer: move-semantics can transfer ownership incorrectly
- StrategiesFloatApi: header-inline destructor may fire unexpectedly

**Fix**: Migrate Pattern B → GpuContext. Then guarantee is automatic.

**Additionally for spectrum filters** (S2/S3):
When N_WINDOW changes, GpuContext is recreated → hipModuleUnload → reload.
This is ~5ms penalty. Acceptable because:
- N_WINDOW changes are rare (user reconfiguration)
- Disk cache ensures fast reload
- Alternative (compile all N_WINDOW variants) wastes GPU memory

---

## 7. Migration Phases

> Branch: **`kernel_cache_v2`** per repo

### Phase A: Core improvements

| Step | What | Files | Effort |
|------|------|-------|--------|
| A1 | SHA256 hash in KernelCacheService | kernel_cache_service.hpp/cpp | 2h |
| A2 | CacheStats (hits/misses/ms) | kernel_cache_service.hpp/cpp | 1h |
| A3 | PreloadFromCache() static method | gpu_context.hpp/cpp | 1h |
| | Build + test core | | Gate |

### Phase B: Critical fixes (SG1 + S1)

| Step | What | Files | Effort |
|------|------|-------|--------|
| B1 | ScriptGeneratorROCm → GpuContext + cache | script_generator_rocm.cpp | 2h |
| B2 | AllMaximaPipelineROCm → GpuContext | all_maxima_pipeline_rocm.cpp | 2h |
| | Build + test signal_generators, spectrum | | Gate |

### Phase C: linalg + strategies migration (L1-L3, ST1)

| Step | What | Files | Effort |
|------|------|-------|--------|
| C1 | CholeskyInverterROCm → GpuContext | cholesky_inverter_rocm.cpp/hpp | 1.5h |
| C2 | SymmetrizeGpuROCm → GpuContext | symmetrize_gpu_rocm.cpp | 1h |
| C3 | DiagonalLoadRegularizer → GpuContext | diagonal_load_regularizer.cpp/hpp | 1h |
| C4 | StrategiesFloatApi → GpuContext + .cpp | strategies_float_api.hpp | 1.5h |
| | Build + test linalg, strategies | | Gate |

### Phase D: Cleanup + integration

| Step | What | Effort |
|------|------|--------|
| D1 | Delete dead CompileKernels() in FM Correlator | 30min |
| D2 | Integration test: all 8 repos on kernel_cache_v2 | 1h |
| D3 | PR → main per repo | Gate (Alex OK) |

### Total effort: ~14-16 hours

---

## 8. Expected Results

| Metric | Before | After |
|--------|--------|-------|
| Pattern consistency | 2 patterns (A+B) | **1 pattern** (A only) |
| Files with disk cache | 21 of 27 | **27 of 27** (100%) |
| ScriptGenerator startup | ~150ms (recompile) | **~1ms** (cache hit) |
| Stale binary protection | NONE | **SHA256 hash** |
| Duplicated boilerplate | ~740 lines | **0 lines** |
| Cache statistics | none | **hits/misses/compile_time** |
| Kernel memory persistence | depends on pattern | **guaranteed** (all through GpuContext) |
| Pre-warming option | none | **available** (startup load) |

---

## 9. Decision Points for Alex

| # | Question | Recommendation |
|---|----------|---------------|
| Q1 | Hash: SHA256 or FNV-1a? | **FNV-1a** — faster, no deps, sufficient for change detection |
| Q2 | Start with SG1 (most critical)? | **Yes** — ScriptGenerator without cache is a bug |
| Q3 | Phase A-D sequential or parallel? | **A first** (core), then B+C parallel |
| Q4 | Branch name? | **`kernel_cache_v2`** |
| Q5 | Pre-warming mandatory? | **Optional** — config flag `preload_kernels` |

---

## Appendix: ROCm Notes (from Context7)

1. HIP runtime (ROCm 6.4+) has built-in code object cache — but only for HIP API compiled kernels, NOT for hiprtc. Our hiprtc kernels NEED manual disk caching.
2. `hipModuleLoad/hipModuleUnload` has known memory leak in some ROCm versions → minimizing Unload calls is good practice.
3. rocFFT uses `ROCFFT_RTC_CACHE_PATH` env for RTC cache — same pattern as our `DSP_CACHE_DIR`.
4. Per-architecture HSACO is mandatory — gfx908 binary won't run on gfx1201.

---

*Created: 2026-04-16 | v2 after Alex review | Codo (AI Assistant)*
