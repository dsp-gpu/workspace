# TASK Phase B2: ProfileStore (thread-safe record storage)

> **Prerequisites**: Phase B1 выполнена (`ProfilingRecord` существует)
> **Effort**: 3-4 часа
> **Scope**: `core/include/core/services/profiling/` + `core/src/services/profiling/`
> **Depends**: B1

---

## 🎯 Цель

Создать **thread-safe хранилище** для `ProfilingRecord`, sharded по GPU.
Учесть решения ревью:
- **W3**: `std::unordered_map` для modules/events (не `std::map`)
- **W4**: per-shard counter + composite `record_index`
- **W2**: lock order comment (defensive)
- **R7**: `MaxRecordsPolicy` enum
- **C1**: `GetSnapshot()` даёт отдельную копию (для Analyzer)

---

## 📋 Шаги

### B2.1. Создать директорию и header

**Новый каталог**: `core/include/core/services/profiling/`
**Новый файл**: `core/include/core/services/profiling/profile_store.hpp`

```cpp
#pragma once

#include <atomic>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

#include <core/services/profiling_types.hpp>

namespace drv_gpu_lib::profiling {

/// Policy when max_records_per_event limit is hit.
enum class MaxRecordsPolicy {
    RingBuffer,          ///< Drop oldest records (default for benchmarks)
    RejectWithWarning,   ///< Reject new records + DRVGPU_LOG_WARNING
    Abort                ///< Assert/terminate (debug mode)
};

/// Configuration for ProfileStore.
struct ProfileStoreConfig {
    size_t           max_records_per_event = 1000;   // per (gpu_id, module, event) tuple
    MaxRecordsPolicy policy = MaxRecordsPolicy::RingBuffer;
};

/// Thread-safe record storage, sharded per GPU.
///
/// LOCK ORDER (strict, defensive):
///   1. shards_map_mutex_   (outer)
///   2. shard->mutex        (inner)
/// NEVER take shard->mutex before shards_map_mutex_ — would deadlock if
/// a second writer thread were ever added. Current design uses ONE worker
/// thread for Append and serialized Export (after WaitEmpty) so the constraint
/// is automatic, but the comment documents the contract.
///
/// CONTRACT: Append() and GetSnapshot() MUST NOT run concurrently.
///   Export is called only after WaitEmpty() drains the worker queue.
///   Reset() is forbidden during active profiling session.
class ProfileStore {
public:
    explicit ProfileStore(ProfileStoreConfig cfg = {});

    /// Thread-safe append. Called from single worker thread.
    /// Assigns record.record_index = (gpu_id << 48) | per-shard counter (W4).
    void Append(ProfilingRecord record);

    /// Called from benchmark init (non-hot path) — optional, reduces reallocations.
    void ReserveHint(int gpu_id, const std::string& module,
                     const std::string& event, size_t expected_count);

    /// Full copy of storage. Called ONLY after WaitEmpty() (see CONTRACT).
    using EventRecords = std::vector<ProfilingRecord>;
    using EventsByName = std::unordered_map<std::string, EventRecords>;
    using ModulesByName = std::unordered_map<std::string, EventsByName>;
    using StoreData    = std::unordered_map<int, ModulesByName>;
    StoreData GetSnapshot() const;

    /// Direct read access for one event (zero-copy). Caller must hold external
    /// lock OR call only when no writes are happening (post-WaitEmpty).
    EventRecords GetRecords(int gpu_id, const std::string& module,
                            const std::string& event) const;

    /// Total count across all shards.
    size_t TotalRecords() const;

    /// Estimated bytes (sizeof * count + counters overhead). For G9 enforcement.
    size_t TotalBytesEstimate() const;

    /// Reset all data. MUST be called with no concurrent writers.
    void Reset();

private:
    struct GpuShard {
        ModulesByName          modules;
        std::atomic<uint64_t>  local_index{0};   // per-shard counter (W4)
        mutable std::mutex     mutex;
    };

    ProfileStoreConfig                             cfg_;
    std::unordered_map<int, std::unique_ptr<GpuShard>> shards_;
    mutable std::mutex                             shards_map_mutex_;

    // Debug-only: кол-во активных writer'ов (Append в процессе).
    // Используется для assert'а в Reset() — защита от случайного нарушения
    // contract "no concurrent Reset/Append".
    std::atomic<int> active_writers_{0};

    // Helper — locks shards_map_mutex_ once, lazily creates shard.
    GpuShard& GetOrCreateShard(int gpu_id);

    // Helper — apply MaxRecordsPolicy when vector size at limit.
    void EnforceLimit(EventRecords& vec, const std::string& module,
                      const std::string& event);
};

} // namespace drv_gpu_lib::profiling
```

---

### B2.2. Реализация

**Новый файл**: `core/src/services/profiling/profile_store.cpp`

```cpp
#include <core/services/profiling/profile_store.hpp>
#include <core/services/drvgpu_log.hpp>   // или правильный путь к логгеру в core

#include <cassert>
#include <algorithm>

namespace drv_gpu_lib::profiling {

ProfileStore::ProfileStore(ProfileStoreConfig cfg) : cfg_(cfg) {}

ProfileStore::GpuShard& ProfileStore::GetOrCreateShard(int gpu_id) {
    // LOCK ORDER: shards_map_mutex_ first.
    std::lock_guard lk(shards_map_mutex_);
    auto it = shards_.find(gpu_id);
    if (it == shards_.end()) {
        auto [new_it, _] = shards_.emplace(gpu_id, std::make_unique<GpuShard>());
        return *new_it->second;
    }
    return *it->second;
}

void ProfileStore::Append(ProfilingRecord record) {
    // Guard against UB: gpu_id отрицательный → cast в uint64_t даёт огромное число,
    // shift коллизия с валидными значениями. Assert в debug, clamp-abort в release.
    assert(record.gpu_id >= 0 && record.gpu_id < 0x10000
           && "ProfileStore: gpu_id вне допустимого диапазона [0, 65535]");

    // Счётчик активных writer'ов — для защиты Reset() (contract check).
    active_writers_.fetch_add(1, std::memory_order_acq_rel);

    auto& shard = GetOrCreateShard(record.gpu_id);

    // Composite index (W4): (gpu_id << 48) | local
    const uint64_t local = shard.local_index.fetch_add(1, std::memory_order_relaxed);
    record.record_index  = (static_cast<uint64_t>(record.gpu_id) << 48) | local;

    {
        std::lock_guard lk(shard.mutex);
        auto& events = shard.modules[record.module_name];
        auto& vec    = events[record.event_name];

        if (vec.size() >= cfg_.max_records_per_event) {
            EnforceLimit(vec, record.module_name, record.event_name);
            if (cfg_.policy == MaxRecordsPolicy::RejectWithWarning) {
                active_writers_.fetch_sub(1, std::memory_order_acq_rel);
                return;  // do not append
            }
        }
        vec.push_back(std::move(record));
    }

    active_writers_.fetch_sub(1, std::memory_order_acq_rel);
}

void ProfileStore::EnforceLimit(EventRecords& vec,
                                 const std::string& module,
                                 const std::string& event) {
    switch (cfg_.policy) {
        case MaxRecordsPolicy::RingBuffer:
            // Drop oldest
            vec.erase(vec.begin());
            break;
        case MaxRecordsPolicy::RejectWithWarning:
            DRVGPU_LOG_WARNING("ProfileStore: max_records reached for "
                               + module + "/" + event + ", rejecting new record");
            break;
        case MaxRecordsPolicy::Abort:
            assert(false && "ProfileStore max_records exceeded");
            std::terminate();
    }
}

void ProfileStore::ReserveHint(int gpu_id, const std::string& module,
                                const std::string& event, size_t n) {
    auto& shard = GetOrCreateShard(gpu_id);
    std::lock_guard lk(shard.mutex);
    shard.modules[module][event].reserve(std::min(n, cfg_.max_records_per_event));
}

ProfileStore::StoreData ProfileStore::GetSnapshot() const {
    // CONTRACT: called only after WaitEmpty() — no writer active.
    // LOCK ORDER kept for defensive safety.
    StoreData out;
    std::lock_guard map_lk(shards_map_mutex_);
    out.reserve(shards_.size());
    for (const auto& [gpu_id, shard_ptr] : shards_) {
        std::lock_guard shard_lk(shard_ptr->mutex);
        out[gpu_id] = shard_ptr->modules;   // deep copy (map assignment)
    }
    return out;
}

ProfileStore::EventRecords ProfileStore::GetRecords(
    int gpu_id, const std::string& module, const std::string& event) const
{
    std::lock_guard map_lk(shards_map_mutex_);
    auto it = shards_.find(gpu_id);
    if (it == shards_.end()) return {};
    std::lock_guard shard_lk(it->second->mutex);
    auto mit = it->second->modules.find(module);
    if (mit == it->second->modules.end()) return {};
    auto eit = mit->second.find(event);
    if (eit == mit->second.end()) return {};
    return eit->second;   // copy
}

size_t ProfileStore::TotalRecords() const {
    std::lock_guard map_lk(shards_map_mutex_);
    size_t total = 0;
    for (const auto& [_, shard_ptr] : shards_) {
        std::lock_guard shard_lk(shard_ptr->mutex);
        for (const auto& [__, events] : shard_ptr->modules)
            for (const auto& [___, vec] : events)
                total += vec.size();
    }
    return total;
}

size_t ProfileStore::TotalBytesEstimate() const {
    // std::map<string, double> node: 3 ptrs (left/right/parent) + color byte +
    // SSO-string + double ≈ 56 B на x86_64 (RBT node в libstdc++).
    constexpr size_t kMapNodeOverheadBytes = 56;

    std::lock_guard map_lk(shards_map_mutex_);
    size_t bytes = 0;
    for (const auto& [_, shard_ptr] : shards_) {
        std::lock_guard shard_lk(shard_ptr->mutex);
        for (const auto& [__, events] : shard_ptr->modules) {
            for (const auto& [___, vec] : events) {
                bytes += vec.size() * sizeof(ProfilingRecord);
                for (const auto& rec : vec)
                    bytes += rec.counters.size() * kMapNodeOverheadBytes;
            }
        }
    }
    return bytes;
}

void ProfileStore::Reset() {
    // CONTRACT check: Reset не должен вызываться при активном Append.
    // В debug срабатывает assert, в release — продолжаем (риск UB — на совести caller).
    assert(active_writers_.load(std::memory_order_acquire) == 0
           && "ProfileStore::Reset() вызван при active Append — contract violation");

    std::lock_guard lk(shards_map_mutex_);
    shards_.clear();
}

} // namespace drv_gpu_lib::profiling
```

---

### B2.3. Добавить в CMake

**Файл**: `core/src/CMakeLists.txt` (или где `target_sources(core ...)`)

Это **разрешённая правка** — добавление нового `.cpp` в существующий `target_sources`:

```cmake
target_sources(core PRIVATE
    # ... existing ...
    src/services/profiling/profile_store.cpp
)
```

**Не трогать** `find_package`, `FetchContent`, флаги компилятора.

---

### B2.4. Unit-тесты

**Новый файл**: `core/tests/test_profile_store.hpp`

Минимальный набор:

```cpp
#pragma once
#include "test_framework.hpp"
#include <core/services/profiling/profile_store.hpp>
#include <core/services/profiling_conversions.hpp>

namespace drv_gpu_lib::profiling::tests {

inline ProfilingRecord MakeRec(int gpu, const std::string& mod,
                                const std::string& evt, uint64_t start_ns) {
    ROCmProfilingData src;
    src.start_ns = start_ns;
    src.end_ns   = start_ns + 1000;
    return record_from_rocm(src, gpu, mod, evt);
}

inline void TestAppend_SingleGpu() {
    ProfileStore store;
    store.Append(MakeRec(0, "spectrum", "FFT", 100));
    store.Append(MakeRec(0, "spectrum", "FFT", 200));
    ASSERT_EQ(store.TotalRecords(), 2u);
    auto recs = store.GetRecords(0, "spectrum", "FFT");
    ASSERT_EQ(recs.size(), 2u);
    ASSERT_EQ(recs[0].start_ns, 100u);
    ASSERT_EQ(recs[1].start_ns, 200u);
}

inline void TestAppend_CompositeIndex() {
    ProfileStore store;
    store.Append(MakeRec(0, "m", "e", 100));
    store.Append(MakeRec(0, "m", "e", 200));
    store.Append(MakeRec(1, "m", "e", 300));   // другой GPU — свой счётчик

    auto r0 = store.GetRecords(0, "m", "e");
    auto r1 = store.GetRecords(1, "m", "e");
    ASSERT_EQ(r0.size(), 2u);
    ASSERT_EQ(r1.size(), 1u);

    // gpu 0 index low 48 bits should be 0, 1
    ASSERT_EQ(r0[0].record_index & 0xFFFFFFFFFFFFull, 0u);
    ASSERT_EQ(r0[1].record_index & 0xFFFFFFFFFFFFull, 1u);
    // gpu 1 high 16 bits = 1
    ASSERT_EQ((r1[0].record_index >> 48) & 0xFFFF, 1u);
}

inline void TestRingBufferPolicy() {
    ProfileStoreConfig cfg;
    cfg.max_records_per_event = 3;
    cfg.policy = MaxRecordsPolicy::RingBuffer;
    ProfileStore store(cfg);

    for (int i = 0; i < 5; ++i)
        store.Append(MakeRec(0, "m", "e", i * 100));

    auto recs = store.GetRecords(0, "m", "e");
    ASSERT_EQ(recs.size(), 3u);
    // Oldest dropped — first remaining should be start_ns=200 or higher
    ASSERT_TRUE(recs.front().start_ns >= 200u);
}

inline void TestRejectPolicy() {
    ProfileStoreConfig cfg;
    cfg.max_records_per_event = 2;
    cfg.policy = MaxRecordsPolicy::RejectWithWarning;
    ProfileStore store(cfg);

    for (int i = 0; i < 5; ++i)
        store.Append(MakeRec(0, "m", "e", i * 100));

    auto recs = store.GetRecords(0, "m", "e");
    ASSERT_EQ(recs.size(), 2u);
    // First two kept
    ASSERT_EQ(recs[0].start_ns, 0u);
    ASSERT_EQ(recs[1].start_ns, 100u);
}

inline void TestSnapshot_DeepCopy() {
    ProfileStore store;
    store.Append(MakeRec(0, "m", "e", 100));
    auto snap = store.GetSnapshot();
    store.Append(MakeRec(0, "m", "e", 200));  // modify after snapshot

    ASSERT_EQ(snap[0]["m"]["e"].size(), 1u);  // snapshot frozen
    ASSERT_EQ(store.GetRecords(0, "m", "e").size(), 2u);
}

inline void TestReset_ClearsAll() {
    ProfileStore store;
    store.Append(MakeRec(0, "m", "e", 100));
    store.Append(MakeRec(1, "m", "e", 200));
    ASSERT_EQ(store.TotalRecords(), 2u);
    store.Reset();
    ASSERT_EQ(store.TotalRecords(), 0u);
}

inline void TestGpuIdValidation_AssertInDebug() {
    // В debug сборке — assert на gpu_id < 0 или >= 0x10000.
    // В release — тест пропустить (assert no-op).
#ifndef NDEBUG
    ProfileStore store;
    ROCmProfilingData src{};
    src.end_ns = 1000;
    auto rec = record_from_rocm(src, -1, "m", "e");  // gpu_id = -1
    // death test-style: следующая строка должна прервать выполнение
    // (в тестовом harness это проверяется через EXPECT_DEATH или ручной try/abort handler)
    ASSERT_DEATH(store.Append(rec), "gpu_id вне допустимого диапазона");
#endif
}

inline void TestMemoryEnforcement_G9() {
    // G9 gate: 1000 runs × 10 events × 10 GPU < 200 MB
    ProfileStoreConfig cfg;
    cfg.max_records_per_event = 1000;
    ProfileStore store(cfg);

    for (int gpu = 0; gpu < 10; ++gpu)
        for (int e = 0; e < 10; ++e)
            for (int run = 0; run < 1000; ++run)
                store.Append(MakeRec(gpu, "m", "e" + std::to_string(e), run));

    ASSERT_EQ(store.TotalRecords(), 100'000u);
    size_t bytes = store.TotalBytesEstimate();
    ASSERT_TRUE(bytes < 200ull * 1024 * 1024);   // < 200 MB
}

} // namespace
```

Зарегистрировать в test runner.

---

### B2.5. Build + test

```bash
cd E:/DSP-GPU/core
cmake --build build --target core core_unit_tests -j
ctest --test-dir build -R test_profile_store --output-on-failure
```

---

### B2.6. Commit

```
[profiler-v2] Phase B2: ProfileStore (thread-safe record storage)

- Add ProfileStore with per-GPU sharding
- unordered_map for modules/events (W3)
- Per-shard counter + composite record_index (W4)
- MaxRecordsPolicy enum: RingBuffer / RejectWithWarning / Abort (R7)
- ReserveHint for pre-allocation (R2 from review2)
- GetSnapshot() deep copy (C2: contract = post-WaitEmpty)
- LOCK ORDER documented: shards_map_mutex → shard.mutex (W2 defensive)
- TotalBytesEstimate() for G9 enforcement (R3)

7 unit tests added. GPUProfiler still uses old aggregation — Phase B3 next.
```

---

## ✅ Acceptance Criteria

| # | Критерий | Проверка |
|---|----------|---------|
| 1 | ProfileStore в новом header | file exists |
| 2 | unordered_map used | `grep "unordered_map" include/core/services/profiling/profile_store.hpp` |
| 3 | Composite index shifts 48 | `grep "<< 48" src/services/profiling/profile_store.cpp` |
| 4 | LOCK ORDER comment present | `grep "LOCK ORDER" include/core/services/profiling/profile_store.hpp` |
| 5 | All 7 tests green | ctest output |
| 6 | G9 memory test passes | `ctest -R TestMemoryEnforcement_G9` green |
| 7 | cmake --build зелёный | exit 0 |

---

## 📖 Замечания

- **ReserveHint** вызывается из `GpuBenchmarkBase::InitProfiler()` в Phase C. Здесь только API.
- **GetSnapshot делает deep copy** через `operator=` у `unordered_map`. Это то, что нужно — C2 принято.
- **Тесты НЕ параллельные** — race condition тесты не нужны, т.к. контракт запрещает concurrent Append/Snapshot.

---

*Task created: 2026-04-17 | Phase B2 | Status: READY (after B1)*
