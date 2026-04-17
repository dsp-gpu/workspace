# TASK Phase E: Polish — CLI + Docs + PR + Tag

> **Prerequisites**: Phase D выполнена, D3 integration зелёный
> **Effort**: 1-2 часа
> **Scope**: core/ + PR management
> **Depends**: D

---

## 🎯 Цель

1. **E1**: CLI tool `dsp-cache-list` (использует `ListEntries()`) + docs
2. **E2**: Обновить `core/Doc/Services/Full.md` (новый API KernelCacheService)
3. **E3**: PR `kernel_cache_v2 → main` в каждом репо (с OK Alex)
4. **E4**: Tag `v0.3.0` после merge (с OK Alex)

---

## 📋 Шаги

### E1. CLI tool `dsp-cache-list`

#### E1.1 Создать utility

**Новый файл**: `core/tools/dsp_cache_list.cpp`

```cpp
/**
 * @file dsp_cache_list.cpp
 * @brief CLI utility to list cached kernels in DSP-GPU kernel cache.
 *
 * Usage:
 *   dsp-cache-list <cache_root>
 *   dsp-cache-list <cache_root> <module>  # filter by module
 */

#include <core/services/kernel_cache_service.hpp>
#include <core/services/cache_dir_resolver.hpp>

#include <filesystem>
#include <iostream>

namespace fs = std::filesystem;

int main(int argc, char** argv) {
    const std::string cache_root = (argc > 1)
        ? argv[1]
        : drv_gpu_lib::ResolveCacheDir("").string();  // default

    std::cout << "DSP-GPU Kernel Cache: " << cache_root << "\n";
    std::cout << std::string(80, '=') << "\n";

    if (!fs::exists(cache_root)) {
        std::cout << "Cache directory does not exist.\n";
        return 0;
    }

    size_t total_kernels = 0;
    size_t total_bytes = 0;

    for (const auto& mod_entry : fs::directory_iterator(cache_root)) {
        if (!mod_entry.is_directory()) continue;
        const auto module = mod_entry.path().filename().string();
        if (argc > 2 && module != argv[2]) continue;   // filter

        drv_gpu_lib::KernelCacheService cache(cache_root, module);
        auto entries = cache.ListEntries();
        if (entries.empty()) continue;

        std::cout << "\n[" << module << "]\n";
        std::cout << "  " << std::left
                  << std::setw(30) << "Kernel"
                  << std::setw(12) << "Hash"
                  << std::setw(12) << "Arch"
                  << std::setw(12) << "Size (KB)" << "\n";
        std::cout << "  " << std::string(64, '-') << "\n";

        for (const auto& e : entries) {
            std::cout << "  " << std::left
                      << std::setw(30) << e.kernel_name
                      << std::setw(12) << e.hash_hex
                      << std::setw(12) << e.arch
                      << std::setw(12) << (e.file_size / 1024) << "\n";
            ++total_kernels;
            total_bytes += e.file_size;
        }
    }

    std::cout << "\n" << std::string(80, '=') << "\n";
    std::cout << "Total: " << total_kernels << " kernels, "
              << (total_bytes / 1024 / 1024) << " MB\n";
    return 0;
}
```

#### E1.2 CMake — ⚠️ ТРЕБУЕТ OK ALEX

`core/CMakeLists.txt` (новый executable):

```cmake
# Optional CLI tool — disabled by default
option(DSP_BUILD_CLI_TOOLS "Build CLI tools (dsp-cache-list)" OFF)
if(DSP_BUILD_CLI_TOOLS)
    add_executable(dsp-cache-list tools/dsp_cache_list.cpp)
    target_link_libraries(dsp-cache-list PRIVATE core)
endif()
```

**Это CMake-правка** — добавление новой цели. **Спросить OK Alex** перед коммитом.

Альтернатива: оставить `dsp_cache_list.cpp` как пример в `tools/`, не собирать автоматически. Пользователь компилирует вручную если нужно.

---

### E2. Docs update

**Файл**: `core/Doc/Services/Full.md`

Обновить секцию про `KernelCacheService`:
- Убрать примеры со старым API `Load(name)`
- Добавить пример с `CompileKey`
- Показать структуру директории `<module>/<arch>/<kernel>_<hash8>.hsaco`
- Добавить секцию "Cache invalidation" — как hash автоматически инвалидирует stale binaries

Структура секции:

```markdown
## KernelCacheService v2 (2026-04-17)

### API

```cpp
// Create service per module
KernelCacheService cache("/tmp/dsp_cache", "my_module");

// Compile key — всё что влияет на бинарник
CompileKey key{
    .source = my_hip_source,
    .defines = {"-DBLOCK_SIZE=256"},
    .arch = "gfx1201",
    .hiprtc_version = DetectHiprtcVersion()
};

// Save compiled HSACO
cache.Save("my_kernel", key, binary);

// Load — returns nullopt if hash mismatch (stale binary)
auto loaded = cache.Load("my_kernel", key);
```

### File layout

```
/tmp/dsp_cache/
├── my_module/
│   └── gfx1201/
│       ├── my_kernel_2af81b3c.hsaco  # BLOCK_SIZE=256
│       └── my_kernel_8fa40219.hsaco  # BLOCK_SIZE=512 — сосуществуют
└── another_module/
    └── gfx908/
        └── another_kernel_a3b2c1d0.hsaco
```

### Stats

```cpp
auto stats = cache.GetStats();
std::cout << "Hits: " << stats.hits.load() << "\n";
std::cout << "Misses: " << stats.misses.load() << "\n";
```
```

---

### E3. PR в каждом репо (⚠️ OK Alex)

#### E3.1 Порядок PR (строго!)

```
1. core          — сначала (все зависят)
2. wait merge
3. spectrum, signal_generators, linalg, strategies — параллельно
4. radar         — независимо (D2 в отдельной ветке cleanup_fm_correlator)
```

#### E3.2 Команды (ВЫПОЛНЯТЬ С OK ALEX на каждый шаг)

```bash
# 1. core first
cd E:/DSP-GPU/core
gh pr create --base main --head kernel_cache_v2 \
    --title "[kernel-cache-v2] New API + CompileKey + cleanup" \
    --body-file ../MemoryBank/tasks/TASK_KernelCache_v2_INDEX.md

# Ждать merge...

# 2. Downstream repos (параллельно)
for repo in spectrum signal_generators linalg strategies; do
    cd E:/DSP-GPU/$repo
    gh pr create --base main --head kernel_cache_v2 \
        --title "[kernel-cache-v2] Migrate processors to GpuContext" \
        --body "Phase B/C of kernel cache v2. Depends on core v0.3.0."
done

# 3. radar cleanup (независимо)
cd E:/DSP-GPU/radar
gh pr create --base main --head cleanup_fm_correlator \
    --title "[cleanup] Remove FM Correlator dead code" \
    --body "Phase D2. 122 lines of #if 0 block physically removed."
```

**⚠️ `gh pr create` и merge — по одному, каждый с OK Alex.**

---

### E4. Tag `v0.3.0` после всех merge

После мёржа всех PR в `main`:

```bash
for repo in core spectrum signal_generators linalg strategies; do
    cd E:/DSP-GPU/$repo
    git checkout main
    git pull
    git tag -a v0.3.0 -m "Kernel Cache v2 — composite hash, unified GpuContext pattern"
    # git push origin v0.3.0 — ТОЛЬКО с OK ALEX
done
```

**Для radar — отдельный тег** (cleanup, не kernel cache):
```bash
cd E:/DSP-GPU/radar
git tag -a v0.2.1 -m "Cleanup: remove FM Correlator legacy dead code"
```

**⚠️ Теги неизменяемы** (CLAUDE.md) — если ошибка, `v0.3.1`, не перезаписывать.

---

### E5. Session report

**Новый файл**: `MemoryBank/sessions/kernel_cache_v2_done_<date>.md`

```markdown
# Kernel Cache v2 — DONE

- Phase A-E completed in <N> hours actual
- 6 Pattern B files migrated to GpuContext (740 LOC boilerplate removed)
- 122 LOC dead code deleted in FM Correlator
- ScriptGen startup: 150ms → 1ms (first-time disk cache support)
- Composite hash protects against stale binaries

### Cache stats после integration test
- Total kernels cached: <N>
- Total disk size: <MB>
- Hit rate 2nd run: ~99%

### Merged PRs
- core#NN
- spectrum#NN, signal_generators#NN, linalg#NN, strategies#NN
- radar#NN (cleanup)

### Tags
- v0.3.0 in 5 repos
- v0.2.1 in radar

Next: integration with rest of DSP pipeline.
```

---

## ✅ Acceptance Criteria

| # | Критерий | Проверка |
|---|----------|---------|
| E1 | CLI tool создан (optional build) | `test -f core/tools/dsp_cache_list.cpp` |
| E2 | Docs/Services/Full.md обновлён | `grep CompileKey core/Doc/Services/Full.md` |
| E3.1 | core PR создан | `gh pr list --state open` содержит core |
| E3.2 | 4 downstream PR созданы | `gh pr list --state open` |
| E3.3 | radar cleanup PR создан | same |
| E4 | После merge — тег v0.3.0 в 5 репо | `git tag -l v0.3.0` |
| E5 | Session report создан | `ls MemoryBank/sessions/kernel_cache_v2_done*.md` |

---

## 🚨 Action items для Alex

1. **OK на CMake правку** E1.2 (CLI tool, optional build)
2. **OK на PR creation** (каждый репо)
3. **Ревью PR** (core первым)
4. **Merge PR** (порядок: core → downstream → radar)
5. **OK на git tag + push tags**

---

## 📖 Замечания

- **CLI tool — optional**. Если Alex не хочет add_executable в core — просто файл в `tools/`, компилируется вручную.
- **Docs update** можно сделать в отдельном PR для читаемости main PR.
- **v0.3.0** — произвольный номер. Согласовать с Alex.

---

*Task created: 2026-04-17 | Phase E | Status: READY after D*
