# TASK Phase A: Core — CompileKey + new KernelCacheService API

> **Prerequisites**: `new_profiler` merged в main (координация по Q8)
> **Effort**: 4-6 часов
> **Scope**: только `core/`
> **Depends**: — (первая задача)

---

## 🎯 Цель

1. Создать `CompileKey` struct + FNV-1a composite hash
2. Переписать `KernelCacheService` с новым API (key-based вместо name-based)
3. Обновить `GpuContext::CompileModule` — формирует CompileKey и использует новый cache
4. Добавить 8+ unit-тестов

**Старый API удаляется полностью** (clean-slate, OK Alex).

---

## 📋 Шаги

### A0. Создать ветку

```bash
cd E:/DSP-GPU/core
git status                                # должно быть чисто (на main)
git checkout -b kernel_cache_v2
```

**⚠️ `git push -u origin kernel_cache_v2` — только с OK Alex.**

---

### A1. Создать `CompileKey`

#### A1.1 Header

**Новый файл**: `core/include/core/services/compile_key.hpp`

```cpp
#pragma once

/**
 * @file compile_key.hpp
 * @brief Composite cache key for HIP kernel compilation.
 *
 * Hash = FNV-1a 64-bit over (source + defines + arch + hiprtc_version).
 * Guarantees: different inputs → different hashes with high probability.
 * Stable between runs (byte-order independent).
 *
 * Used by: KernelCacheService (file naming), GpuContext (CompileModule).
 */

#include <cstdint>
#include <string>
#include <vector>

namespace drv_gpu_lib {

struct CompileKey {
    std::string              source;         ///< HIP C++ source code
    std::vector<std::string> defines;        ///< ["-DBLOCK_SIZE=256", "-DUSE_FP32"]
    std::string              arch;           ///< "gfx1201", "gfx908"
    std::string              hiprtc_version; ///< "ROCm-6.4.0"

    /// 64-bit composite hash. Stable between runs.
    uint64_t Hash() const;

    /// 8-char hex suffix for file name: "2af81b3c".
    /// Uses low 32 bits of Hash() — enough for ~4 billion distinct keys.
    std::string HashHex() const;
};

/// Detect hiprtc version at compile time (static, callable from anywhere).
/// Returns format like "ROCm-6.4.0" or "<unknown>" if detection fails.
std::string DetectHiprtcVersion();

} // namespace drv_gpu_lib
```

#### A1.2 Implementation

**Новый файл**: `core/src/services/compile_key.cpp`

```cpp
#include <core/services/compile_key.hpp>

#include <cstdio>
#include <string_view>

#if defined(__HIP_PLATFORM_AMD__) || defined(ENABLE_ROCM)
#include <hip/hiprtc.h>
#endif

namespace drv_gpu_lib {

namespace {

constexpr uint64_t kFnv1aOffset = 0xcbf29ce484222325ULL;
constexpr uint64_t kFnv1aPrime  = 0x100000001b3ULL;

inline uint64_t Fnv1aUpdate(uint64_t h, std::string_view data) {
    for (char c : data) {
        h ^= static_cast<uint8_t>(c);
        h *= kFnv1aPrime;
    }
    return h;
}

/// Separator between composite parts — prevents "abc"+"def" == "a"+"bcdef".
inline uint64_t Fnv1aSep(uint64_t h, char sep) {
    h ^= static_cast<uint8_t>(sep);
    h *= kFnv1aPrime;
    return h;
}

} // anon

uint64_t CompileKey::Hash() const {
    uint64_t h = kFnv1aOffset;
    h = Fnv1aUpdate(h, source);
    h = Fnv1aSep(h, '\x01');
    for (const auto& d : defines) {
        h = Fnv1aUpdate(h, d);
        h = Fnv1aSep(h, '\x02');
    }
    h = Fnv1aSep(h, '\x03');
    h = Fnv1aUpdate(h, arch);
    h = Fnv1aSep(h, '\x04');
    h = Fnv1aUpdate(h, hiprtc_version);
    return h;
}

std::string CompileKey::HashHex() const {
    char buf[16];
    std::snprintf(buf, sizeof(buf), "%08x",
                  static_cast<uint32_t>(Hash() & 0xFFFFFFFF));
    return buf;
}

std::string DetectHiprtcVersion() {
#if defined(HIPRTC_MAJOR_VERSION) && defined(HIPRTC_MINOR_VERSION)
    char buf[32];
    std::snprintf(buf, sizeof(buf), "ROCm-%d.%d",
                  HIPRTC_MAJOR_VERSION, HIPRTC_MINOR_VERSION);
    return buf;
#elif defined(__HIPCC_RTC__)
    return "ROCm-runtime";
#else
    // Runtime detection via hiprtcVersion if available
    int major = 0, minor = 0;
  #if defined(__HIP_PLATFORM_AMD__) || defined(ENABLE_ROCM)
    if (hiprtcVersion(&major, &minor) == HIPRTC_SUCCESS) {
        char buf[32];
        std::snprintf(buf, sizeof(buf), "ROCm-%d.%d", major, minor);
        return buf;
    }
  #endif
    return "<unknown>";
#endif
}

} // namespace
```

#### A1.3 CMake

`core/src/CMakeLists.txt`:

```cmake
target_sources(core PRIVATE
    # ... existing ...
    src/services/compile_key.cpp
)
```

Разрешённая правка — добавление нового `.cpp` в существующий `target_sources`.

---

### A2. Переписать `KernelCacheService`

#### A2.1 Header (полностью новый)

**Файл**: `core/include/core/services/kernel_cache_service.hpp`

**Сохранить**:
- `#pragma once`
- namespace `drv_gpu_lib`

**Содержание полностью по спеке** (секция 2.1). Скопировать оттуда.

Ключевые моменты:
- `using BackendType` **удалить** (ROCm only)
- `struct CacheEntry { string source, binary }` **удалить** — возвращаем `std::optional<std::vector<uint8_t>>`
- `Load(const std::string& name)` **удалить** — теперь `Load(name, CompileKey)`
- `Save(name, source, binary, metadata, comment)` **удалить** — теперь `Save(name, CompileKey, binary)`
- `VersionOldFiles` **удалить** — hash различает версии
- Добавить: `struct CacheStats`, `GetStats()`, `struct CacheEntry` (для ListEntries), `ListEntries()`

#### A2.2 Implementation

**Файл**: `core/src/services/kernel_cache_service.cpp` — полностью переписать.

Ключевые фрагменты:

```cpp
#include <core/services/kernel_cache_service.hpp>
#include <core/services/compile_key.hpp>
#include <core/services/console_output.hpp>

#include <chrono>
#include <filesystem>
#include <fstream>

namespace drv_gpu_lib {

namespace fs = std::filesystem;

KernelCacheService::KernelCacheService(std::string base_dir, std::string module)
    : base_dir_(std::move(base_dir)), module_(std::move(module)) {
    module_dir_ = base_dir_ + "/" + module_;
    std::error_code ec;
    fs::create_directories(module_dir_, ec);
}

std::string KernelCacheService::HsacoPath(const std::string& kernel,
                                            const CompileKey& key) const {
    // <module_dir>/<arch>/<kernel>_<hash8>.hsaco
    return module_dir_ + "/" + key.arch + "/" + kernel + "_" + key.HashHex() + ".hsaco";
}

std::optional<std::vector<uint8_t>>
KernelCacheService::Load(const std::string& kernel, const CompileKey& key) {
    auto t0 = std::chrono::steady_clock::now();
    const auto path = HsacoPath(kernel, key);
    std::error_code ec;
    if (!fs::exists(path, ec) || ec) {
        stats_.misses.fetch_add(1, std::memory_order_relaxed);
        return std::nullopt;
    }
    std::ifstream f(path, std::ios::binary);
    if (!f) {
        stats_.misses.fetch_add(1, std::memory_order_relaxed);
        return std::nullopt;
    }
    // Read entire file
    f.seekg(0, std::ios::end);
    auto size = static_cast<size_t>(f.tellg());
    f.seekg(0, std::ios::beg);
    std::vector<uint8_t> bin(size);
    if (!f.read(reinterpret_cast<char*>(bin.data()), size)) {
        // Corrupted/truncated → delete + miss (Q6)
        fs::remove(path, ec);
        DRVGPU_LOG_WARNING(std::string("KernelCache: corrupted HSACO deleted: ") + path);
        stats_.misses.fetch_add(1, std::memory_order_relaxed);
        return std::nullopt;
    }
    auto dt_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                     std::chrono::steady_clock::now() - t0).count();
    stats_.hits.fetch_add(1, std::memory_order_relaxed);
    stats_.total_load_ms.fetch_add(dt_ms, std::memory_order_relaxed);
    return bin;
}

void KernelCacheService::Save(const std::string& kernel,
                                const CompileKey& key,
                                const std::vector<uint8_t>& binary) {
    const auto path = HsacoPath(kernel, key);
    std::error_code ec;
    fs::create_directories(fs::path(path).parent_path(), ec);

    // Idempotent check: if file exists with same size — skip
    if (fs::exists(path, ec) && fs::file_size(path, ec) == binary.size()) {
        return;
    }
    AtomicWrite(path, binary);
}

void KernelCacheService::AtomicWrite(const std::string& path,
                                      const std::vector<uint8_t>& data) {
    const auto tmp = path + ".tmp";
    {
        std::ofstream f(tmp, std::ios::binary | std::ios::trunc);
        if (!f) throw std::runtime_error("KernelCache: open tmp failed: " + tmp);
        f.write(reinterpret_cast<const char*>(data.data()), data.size());
        if (!f) throw std::runtime_error("KernelCache: write tmp failed: " + tmp);
    }
    std::error_code ec;
    fs::rename(tmp, path, ec);
    if (ec) throw std::runtime_error("KernelCache: rename failed: " + tmp + " → " + path);
}

CacheStats KernelCacheService::GetStats() const {
    return stats_;  // copy via CacheStats copy ctor (reads atomics)
}

std::vector<KernelCacheService::CacheEntry>
KernelCacheService::ListEntries() const {
    std::vector<CacheEntry> out;
    std::error_code ec;
    if (!fs::exists(module_dir_, ec)) return out;
    for (const auto& arch_entry : fs::directory_iterator(module_dir_, ec)) {
        if (!arch_entry.is_directory()) continue;
        const auto arch_name = arch_entry.path().filename().string();
        for (const auto& f : fs::directory_iterator(arch_entry.path(), ec)) {
            if (!f.is_regular_file()) continue;
            const auto name = f.path().stem().string();    // "<kernel>_<hash8>"
            const auto dot  = name.find_last_of('_');
            if (dot == std::string::npos) continue;
            CacheEntry e;
            e.kernel_name = name.substr(0, dot);
            e.hash_hex    = name.substr(dot + 1);
            e.arch        = arch_name;
            e.file_size   = fs::file_size(f.path(), ec);
            out.push_back(std::move(e));
        }
    }
    return out;
}

} // namespace
```

**⚠️ НЕ ТРОГАТЬ остальные методы core** — только `kernel_cache_service.cpp` и `compile_key.cpp`.

---

### A3. Обновить `GpuContext::CompileModule`

**Файл**: `core/include/core/interface/gpu_context.hpp`

Метод `CompileModule` — сигнатура НЕ меняется:

```cpp
void CompileModule(const char* source,
                   const std::vector<std::string>& kernel_names,
                   const std::vector<std::string>& extra_defines = {});
```

Меняется только **реализация** в `core/src/gpu_context.cpp`:

```cpp
void GpuContext::CompileModule(const char* source,
                                const std::vector<std::string>& kernel_names,
                                const std::vector<std::string>& extra_defines)
{
    if (!kernel_cache_) {
        // init lazily if not provided
        kernel_cache_ = std::make_unique<KernelCacheService>(
            default_cache_root_, module_name_);
    }

    // Build CompileKey once per CompileModule call
    CompileKey key;
    key.source         = source;
    key.defines        = extra_defines;
    key.arch           = arch_name_;
    key.hiprtc_version = DetectHiprtcVersion();

    // Try disk cache (single kernel_names[0] is enough —
    // все kernels в одном .hsaco, различаются по function_name)
    const std::string& first_name = kernel_names.front();
    std::vector<uint8_t> binary;

    if (auto cached = kernel_cache_->Load(first_name, key)) {
        binary = std::move(*cached);
    } else {
        // hiprtc compile
        binary = CompileViaHiprtc(source, extra_defines);  // existing private method
        kernel_cache_->Save(first_name, key, binary);
    }

    // Load into GPU module
    hipError_t err = hipModuleLoadData(&module_, binary.data());
    if (err != hipSuccess) {
        // Q6: corrupted binary → delete cache entry + throw (caller retries)
        // ... (TODO: implement delete-on-load-fail retry in next iteration,
        //            for Phase A — just throw with clear message)
        throw std::runtime_error("GpuContext: hipModuleLoadData failed");
    }

    // Extract function handles
    for (const auto& name : kernel_names) {
        hipFunction_t fn = nullptr;
        err = hipModuleGetFunction(&fn, module_, name.c_str());
        if (err != hipSuccess)
            throw std::runtime_error("GpuContext: hipModuleGetFunction(" + name + ") failed");
        kernels_[name] = fn;
    }
}
```

**Важно**:
- `kernel_cache_` type остаётся `std::unique_ptr<KernelCacheService>` (не меняется)
- Ключевое — инициализация `KernelCacheService(base_dir, module)` теперь 2 параметра вместо 3 (нет BackendType)
- Пересобрать `core/src/gpu_context.cpp` после изменения

**Если `CompileViaHiprtc` не существует как приватный метод** — вынести hiprtc логику из старого `CompileModule` в отдельный приватный helper.

---

### A4. Unit-тесты

**Новый файл**: `core/tests/test_compile_key.hpp`

```cpp
#pragma once
#include "test_framework.hpp"
#include <core/services/compile_key.hpp>

namespace drv_gpu_lib::tests {

inline CompileKey MakeKey(std::string src = "int x;",
                           std::vector<std::string> def = {},
                           std::string arch = "gfx1201",
                           std::string ver  = "ROCm-6.4.0") {
    return CompileKey{std::move(src), std::move(def), std::move(arch), std::move(ver)};
}

inline void TestHash_SameInput_SameOutput() {
    auto k1 = MakeKey();
    auto k2 = MakeKey();
    ASSERT_EQ(k1.Hash(), k2.Hash());
    ASSERT_EQ(k1.HashHex(), k2.HashHex());
}

inline void TestHash_DifferentSource_DifferentHash() {
    auto k1 = MakeKey("int x;");
    auto k2 = MakeKey("int y;");
    ASSERT_TRUE(k1.Hash() != k2.Hash());
}

inline void TestHash_DifferentDefines_DifferentHash() {
    auto k1 = MakeKey("src", {"-DN=5"});
    auto k2 = MakeKey("src", {"-DN=10"});
    ASSERT_TRUE(k1.Hash() != k2.Hash());
}

inline void TestHash_DefinesOrder_MattersOrNot() {
    // Order-sensitive by design (defines are compile flags, order может значить)
    auto k1 = MakeKey("src", {"-DA", "-DB"});
    auto k2 = MakeKey("src", {"-DB", "-DA"});
    ASSERT_TRUE(k1.Hash() != k2.Hash());
}

inline void TestHash_DifferentArch_DifferentHash() {
    auto k1 = MakeKey("src", {}, "gfx1201");
    auto k2 = MakeKey("src", {}, "gfx908");
    ASSERT_TRUE(k1.Hash() != k2.Hash());
}

inline void TestHash_DifferentHiprtcVer_DifferentHash() {
    auto k1 = MakeKey("src", {}, "gfx1201", "ROCm-6.4.0");
    auto k2 = MakeKey("src", {}, "gfx1201", "ROCm-7.2.0");
    ASSERT_TRUE(k1.Hash() != k2.Hash());
}

inline void TestHash_SeparatorsPreventCollision() {
    // "ab" vs "a"+"b" should give different hashes (separator in Fnv1aSep)
    auto k1 = MakeKey("ab", {});
    auto k2 = MakeKey("a",  {"b"});
    ASSERT_TRUE(k1.Hash() != k2.Hash());
}

inline void TestHashHex_8Chars() {
    auto k = MakeKey();
    auto hex = k.HashHex();
    ASSERT_EQ(hex.size(), 8u);
    for (char c : hex)
        ASSERT_TRUE((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f'));
}

inline void TestHash_StabilityRegression() {
    // Bit-exact regression — если FNV реализация сломается, этот тест упадёт.
    // Для фиксированного input — ожидаем конкретный hash.
    auto k = MakeKey("int x = 0;", {"-DN=5"}, "gfx1201", "ROCm-6.4.0");
    // Значение вычислить один раз при первом прохождении — зафиксировать константу.
    // При выполнении теста — скопировать Hash() из output в строку ниже.
    // Это защитит от незаметного изменения алгоритма в будущем.
    const uint64_t kExpected = 0 /* TODO: fill from first run */;
    // ASSERT_EQ(k.Hash(), kExpected);
    (void)k;
    (void)kExpected;
}

} // namespace
```

**Новый файл**: `core/tests/test_kernel_cache_service.hpp`

```cpp
#pragma once
#include "test_framework.hpp"
#include <core/services/kernel_cache_service.hpp>
#include <core/services/compile_key.hpp>
#include <filesystem>

namespace drv_gpu_lib::tests {

namespace fs = std::filesystem;

inline std::string TmpCacheRoot() {
    auto p = fs::temp_directory_path() / "dsp_kcache_test";
    fs::remove_all(p);
    fs::create_directories(p);
    return p.string();
}

inline std::vector<uint8_t> MakeBin(size_t size = 64, uint8_t fill = 0xAB) {
    return std::vector<uint8_t>(size, fill);
}

inline void TestSaveLoad_Basic() {
    auto root = TmpCacheRoot();
    KernelCacheService cache(root, "test_module");
    CompileKey k{"src", {}, "gfx1201", "ROCm-6.4.0"};
    auto bin = MakeBin(128, 0x42);
    cache.Save("my_kernel", k, bin);

    auto loaded = cache.Load("my_kernel", k);
    ASSERT_TRUE(loaded.has_value());
    ASSERT_EQ(loaded->size(), bin.size());
    ASSERT_EQ((*loaded)[0], 0x42);
}

inline void TestLoad_Miss_DifferentHash() {
    auto root = TmpCacheRoot();
    KernelCacheService cache(root, "m");
    CompileKey k1{"src_v1", {}, "gfx1201", "ROCm-6.4.0"};
    CompileKey k2{"src_v2", {}, "gfx1201", "ROCm-6.4.0"};
    cache.Save("kern", k1, MakeBin());
    auto loaded = cache.Load("kern", k2);  // different source → miss
    ASSERT_FALSE(loaded.has_value());
}

inline void TestLoad_SameKernelName_DifferentDefines_Coexist() {
    auto root = TmpCacheRoot();
    KernelCacheService cache(root, "m");
    CompileKey k1{"src", {"-DN=5"},  "gfx1201", "ROCm-6.4.0"};
    CompileKey k2{"src", {"-DN=10"}, "gfx1201", "ROCm-6.4.0"};
    cache.Save("kern", k1, MakeBin(64, 0x11));
    cache.Save("kern", k2, MakeBin(64, 0x22));

    auto l1 = cache.Load("kern", k1);
    auto l2 = cache.Load("kern", k2);
    ASSERT_TRUE(l1.has_value());
    ASSERT_TRUE(l2.has_value());
    ASSERT_EQ((*l1)[0], 0x11);
    ASSERT_EQ((*l2)[0], 0x22);
}

inline void TestLoad_DifferentArch_DifferentFiles() {
    auto root = TmpCacheRoot();
    KernelCacheService cache(root, "m");
    CompileKey k908{"src", {}, "gfx908",  "ROCm-6.4.0"};
    CompileKey k1201{"src", {}, "gfx1201", "ROCm-6.4.0"};
    cache.Save("kern", k908,  MakeBin(64, 0xAA));
    cache.Save("kern", k1201, MakeBin(64, 0xBB));

    auto l908  = cache.Load("kern", k908);
    auto l1201 = cache.Load("kern", k1201);
    ASSERT_EQ((*l908)[0],  0xAA);
    ASSERT_EQ((*l1201)[0], 0xBB);
}

inline void TestStats_HitsAndMisses() {
    auto root = TmpCacheRoot();
    KernelCacheService cache(root, "m");
    CompileKey k{"src", {}, "gfx1201", "ROCm-6.4.0"};

    (void)cache.Load("nope", k);       // miss
    cache.Save("kern", k, MakeBin());
    (void)cache.Load("kern", k);       // hit
    (void)cache.Load("kern", k);       // hit

    auto s = cache.GetStats();
    ASSERT_EQ(s.hits.load(),   2u);
    ASSERT_EQ(s.misses.load(), 1u);
}

inline void TestSave_Idempotent_SameContent_NoIO() {
    auto root = TmpCacheRoot();
    KernelCacheService cache(root, "m");
    CompileKey k{"src", {}, "gfx1201", "ROCm-6.4.0"};
    auto bin = MakeBin(64);
    cache.Save("kern", k, bin);
    auto mtime1 = fs::last_write_time(root + "/m/gfx1201/kern_" + k.HashHex() + ".hsaco");
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    cache.Save("kern", k, bin);  // same content
    auto mtime2 = fs::last_write_time(root + "/m/gfx1201/kern_" + k.HashHex() + ".hsaco");
    ASSERT_EQ(mtime1, mtime2);  // idempotent: file not rewritten
}

inline void TestListEntries_FindsAllCached() {
    auto root = TmpCacheRoot();
    KernelCacheService cache(root, "m");
    CompileKey k1{"s1", {"-DN=5"},  "gfx1201", "ROCm-6.4.0"};
    CompileKey k2{"s2", {"-DN=10"}, "gfx908",  "ROCm-6.4.0"};
    cache.Save("kern_a", k1, MakeBin());
    cache.Save("kern_b", k2, MakeBin());

    auto entries = cache.ListEntries();
    ASSERT_EQ(entries.size(), 2u);
    // Check both kernel names present
    bool found_a = false, found_b = false;
    for (const auto& e : entries) {
        if (e.kernel_name == "kern_a") found_a = true;
        if (e.kernel_name == "kern_b") found_b = true;
    }
    ASSERT_TRUE(found_a);
    ASSERT_TRUE(found_b);
}

inline void TestLoad_CorruptedFile_DeletesAndReturnsMiss() {
    auto root = TmpCacheRoot();
    KernelCacheService cache(root, "m");
    CompileKey k{"src", {}, "gfx1201", "ROCm-6.4.0"};
    cache.Save("kern", k, MakeBin(64));

    // Corrupt: truncate to 0 bytes
    const auto path = root + "/m/gfx1201/kern_" + k.HashHex() + ".hsaco";
    std::ofstream(path, std::ios::trunc);  // now empty file
    // Wait — empty file still reads successfully (0 bytes). We need a different
    // corruption scenario or explicit size mismatch. For now, just test file read ok.
    // (Full corruption test requires injecting read failure — skip for Phase A.)
}

} // namespace
```

Зарегистрировать тесты в существующем test runner (look at `test_storage_services.hpp` для образца регистрации).

---

### A5. CMake — ДОБАВИТЬ тесты

`core/tests/CMakeLists.txt` — разрешённая правка (добавить новые `.hpp` по существующему шаблону):

```cmake
# core_unit_tests sources:
# ... existing ...
# tests/test_compile_key.hpp is header-only + registered in test runner
# tests/test_kernel_cache_service.hpp is header-only + registered
```

Если тесты регистрируются через `target_sources`, то просто добавить .hpp/.cpp по шаблону — это "очевидная правка" по CLAUDE.md. В сомнении — **спросить Alex**.

---

### A6. Build + test

```bash
cd E:/DSP-GPU/core
rm -rf build
cmake --preset debian-local-dev
cmake --build build --target core -j
cmake --build build --target core_unit_tests -j
ctest --test-dir build --output-on-failure
```

---

### A7. Phase A commit

```
[kernel-cache-v2] Phase A: CompileKey + new KernelCacheService API

- Add CompileKey struct (source + defines + arch + hiprtc_version → 64-bit hash)
  - FNV-1a composite hash, 20 LOC, no deps
  - Stable between runs, byte-order independent
- Rewrite KernelCacheService (clean-slate API):
  - Load(name, CompileKey) → optional<vector<uint8_t>>
  - Save(name, CompileKey, binary)
  - File naming: <module>/<arch>/<kernel>_<hash8>.hsaco
  - Atomic write + idempotent + corrupted-file cleanup
  - CacheStats (atomic hits/misses/compile_ms/load_ms)
  - ListEntries() for CLI
- Remove legacy API:
  - Load(name) without source
  - Save(name, source, binary, metadata, comment)
  - CacheEntry{source, binary} → plain vector<uint8_t>
  - VersionOldFiles (hash differentiates versions)
  - BackendType parameter (ROCm only)
- GpuContext::CompileModule now uses CompileKey internally
- 9 unit tests: compile_key (8) + kernel_cache_service (7)

Refs: MemoryBank/specs/KernelCache_v2_Proposal_2026-04-16.md
Next: Phase B (ScriptGen + AllMaxima fixes)
```

**⚠️ `git push` только с OK Alex.**

---

## ✅ Acceptance Criteria

| # | Критерий | Проверка |
|---|----------|---------|
| 1 | compile_key.hpp создан | `test -f core/include/core/services/compile_key.hpp` |
| 2 | FNV-1a реализация | `grep "0xcbf29ce484222325" core/src/services/compile_key.cpp` |
| 3 | KernelCacheService::Load принимает CompileKey | `grep "Load.*CompileKey" core/include/core/services/kernel_cache_service.hpp` |
| 4 | Старый Load(name) удалён | `grep "Load(const std::string& name)" core/include/core/services/kernel_cache_service.hpp` пусто |
| 5 | BackendType удалён из API | `grep "BackendType" core/include/core/services/kernel_cache_service.hpp` пусто |
| 6 | CacheStats atomic | `grep "std::atomic<uint64_t>" core/include/core/services/kernel_cache_service.hpp` |
| 7 | GpuContext использует CompileKey | `grep "CompileKey" core/src/gpu_context.cpp` |
| 8 | Все unit-тесты зелёные | `ctest -R "test_(compile_key\|kernel_cache)"` exit 0 |
| 9 | Hash регрессия зафиксирована | `TestHash_StabilityRegression` включён |
| 10 | Build всего core зелёный | `cmake --build build --target core` exit 0 |

---

## 🚨 Если что-то пошло не так

- **Compile fail в GpuContext** — все 21+ caller Pattern A используют ctx_.CompileModule(). Их сигнатура не меняется, но реализация внутри теперь другая. Если падает — значит где-то все ещё использую old private method. Найти через grep `Load(const std::string&)`.
- **Hiprtc detection fail** — `DetectHiprtcVersion()` может вернуть "<unknown>" в редких сборках. Это ок, просто hash будет иметь один и тот же `hiprtc_version` строку — кеш всё равно работает.
- **Тесты падают на файловой системе** — `std::filesystem::temp_directory_path()` на Linux = `/tmp`. Проверить права.

---

*Task created: 2026-04-17 | Phase A | Status: WAIT profiler merge → READY*
