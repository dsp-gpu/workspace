# Kernel Cache v2 — Clean-Slate Design

**Date**: 2026-04-17 (v3 — clean-slate rewrite)
**Author**: Codo (AI Assistant)
**Object**: Kernel compilation + disk cache — ALL 8 repos, GreenField
**Method**: 2 Explore agents + grep актуального кода + sequential-thinking
**Status**: PROPOSAL v3 — clean slate, нет legacy constraints

---

## 0. Архитектурный принцип (Alex)

> "10 GPU, у всех свой объектник, не пересекаются.
> Критерий — **надёжность** и **скорость**!"
>
> "Мы создаём все с чистого листа — если нужно переделать на правильную конфигурацию, переделывай."

### Следствия clean-slate
- ❌ Нет legacy `Load(name)` API → делаем правильный сразу
- ❌ Нет миграции старых `manifest.json` → новая схема с первого коммита
- ❌ Нет "workaround recreate GpuContext on N_WINDOW change" — это уходит
- ✅ Единый правильный дизайн кеша с первого дня

---

## 1. Правильный дизайн — композитный ключ

### 1.1 Проблема старого дизайна

```cpp
cache.Save("symmetrize", source, binary, "", "");  // ❌
```
Ключ = только имя. Значит:
- `symmetrize` с `-DBLOCK_SIZE=256` → H1
- `symmetrize` с `-DBLOCK_SIZE=512` → перетирает H1
- `symmetrize` на gfx908 → перетирает gfx1201

**Workaround сейчас**: пересоздают GpuContext при смене defines. Лишние unload/load, ~5ms penalty, архитектурная кривизна.

### 1.2 Решение — `CompileKey`

```cpp
namespace drv_gpu_lib {

struct CompileKey {
    std::string              source;        ///< HIP C++ source
    std::vector<std::string> defines;       ///< ["-DBLOCK_SIZE=256", "-DN_WIN=5"]
    std::string              arch;          ///< "gfx1201"
    std::string              hiprtc_version;///< "ROCm-6.4.0"

    /// Composite 64-bit hash (xxHash64 или FNV-1a composite).
    /// Стабилен между запусками → disk cache работает корректно.
    uint64_t Hash() const;

    /// 8-значный hex для вставки в имя файла: "2af81b3c".
    std::string HashHex() const;
};

} // namespace drv_gpu_lib
```

**Свойства**:
- Разные `defines` → разный hash → разные бинарники в кеше → **сосуществуют**
- Разные `arch` → разный hash → защита от кросс-загрузки HSACO
- Разная `hiprtc_version` (обновился ROCm) → автоматическая recompile
- Неизменный source + defines + arch + hiprtc → **гарантированный hit**

### 1.3 Структура директории

```
kernels_cache/
├── <module>/                       # "capon", "symmetrize", "script_gen", "fft"
│   └── <arch>/                     # "gfx1201", "gfx908"
│       ├── <kernel>_<hash8>.hsaco  # "symmetrize_2af81b3c.hsaco"
│       ├── <kernel>_<hash8>.hsaco  # та же kernel, другие defines → другой hash
│       └── manifest.json           # optional index для CLI `list-kernels`
```

**Плюсы**:
- Один модуль — одна директория
- Per-arch — HSACO не смешиваются
- Hash в имени — сосуществуют все варианты defines
- Manifest — опционален, для CLI утилит, не критичен для runtime

---

## 2. Новый API `KernelCacheService`

### 2.1 Header (полный, clean-slate)

**Файл**: `core/include/core/services/kernel_cache_service.hpp`

```cpp
#pragma once

#include <core/common/backend_type.hpp>

#include <atomic>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace drv_gpu_lib {

/// Composite cache key — всё что влияет на бинарник.
struct CompileKey {
    std::string              source;
    std::vector<std::string> defines;
    std::string              arch;
    std::string              hiprtc_version;

    uint64_t    Hash() const;
    std::string HashHex() const;
};

/// Thread-safe cache statistics (atomic counters).
struct CacheStats {
    std::atomic<uint64_t> hits{0};
    std::atomic<uint64_t> misses{0};
    std::atomic<uint64_t> total_compile_ms{0};
    std::atomic<uint64_t> total_load_ms{0};

    CacheStats() = default;
    CacheStats(const CacheStats& o)
        : hits(o.hits.load()), misses(o.misses.load()),
          total_compile_ms(o.total_compile_ms.load()),
          total_load_ms(o.total_load_ms.load()) {}
};

/// On-disk cache for compiled HIP kernels.
///
/// KEY: (source + defines + arch + hiprtc_version) → 64-bit hash.
/// FILE: <base_dir>/<module>/<arch>/<kernel>_<hash8>.hsaco
///
/// Thread-safety: per-GPU instance (no global singleton, per Alex).
/// Multi-process safety: atomic rename → partial writes never visible.
class KernelCacheService {
public:
    /// @param base_dir  Cache root (e.g. "<exe>/kernels_cache")
    /// @param module    Module subdir (e.g. "capon", "symmetrize")
    KernelCacheService(std::string base_dir, std::string module);

    /// Load HSACO binary by (kernel_name, key). Returns nullopt on miss.
    /// Updates CacheStats (hits/misses).
    std::optional<std::vector<uint8_t>>
    Load(const std::string& kernel_name, const CompileKey& key);

    /// Save HSACO binary for (kernel_name, key).
    /// Atomic write: tmp → rename → durable.
    /// Idempotent: если файл уже есть с тем же размером — skip IO.
    void Save(const std::string& kernel_name,
              const CompileKey&  key,
              const std::vector<uint8_t>& binary);

    /// Cache statistics snapshot (thread-safe).
    CacheStats GetStats() const;

    /// List all cached kernels (for CLI / debugging).
    /// Returns: [{kernel_name, hash_hex, arch, file_size_bytes}, ...]
    struct CacheEntry {
        std::string kernel_name;
        std::string hash_hex;
        std::string arch;
        size_t      file_size;
    };
    std::vector<CacheEntry> ListEntries() const;

    /// Root directory for this service instance.
    const std::string& ModuleDir() const { return module_dir_; }

private:
    std::string base_dir_;
    std::string module_;
    std::string module_dir_;     // base_dir_ + "/" + module_
    mutable CacheStats stats_;

    std::string HsacoPath(const std::string& kernel, const CompileKey& key) const;

    static void        AtomicWrite(const std::string& path, const std::vector<uint8_t>& data);
    static std::string DetectHiprtcVersion();    // "ROCm-6.4.0" или "<unknown>"
};

} // namespace drv_gpu_lib
```

### 2.2 Что УДАЛЕНО из старого API (clean-slate)

| Было | Стало | Почему |
|------|-------|--------|
| `Load(const std::string& name)` без source | `Load(name, CompileKey)` | Без key — нет stale detection |
| `Save(name, source, binary, metadata, comment)` | `Save(name, CompileKey, binary)` | `metadata`/`comment` → входят в CompileKey.defines |
| `CacheEntry{ source, binary }` | `std::vector<uint8_t>` | source хранить не нужно, живёт в коде |
| `VersionOldFiles(name_00, name_01, ...)` | (удалено) | hash различает версии, versioning избыточен |
| `BackendType` параметр (OpenCL vs ROCm) | — (только ROCm) | OpenCL уходит (Phase A профайлера) |
| `GetBinarySuffix()` | hard-coded `.hsaco` | ROCm only |

---

## 3. Единственный паттерн использования — `GpuContext::CompileModule`

### 3.1 После clean-slate

Все 27 processor-файлов используют **ОДНО API** — через GpuContext:

```cpp
// В конструкторе processor:
ctx_ = GpuContext(backend, "Capon", ResolveCacheDir("capon"));

// При первом Process():
ctx_.CompileModule(kernels::GetCaponSource(),
                   {"capon_kernel_a", "capon_kernel_b"},
                   {"-DBLOCK_SIZE=256", "-DUSE_FP32"});
// внутри CompileModule:
//   CompileKey key{source, defines, arch_, hiprtc_ver_};
//   auto bin = cache_->Load(name, key);
//   if (!bin) {
//       bin = Hiprtc(source, defines);  // ~150ms
//       cache_->Save(name, key, bin);
//   }
//   hipModuleLoadData(...);
```

**Больше нет Pattern B. Вообще.**

### 3.2 Как решается "spectrum filters N_WINDOW change"

**Было** (workaround):
```cpp
void SetWindow(int n) {
    ctx_ = GpuContext(backend, "SMA", ...);  // recreate — ~5ms penalty
    ctx_.CompileModule(source, names, {"-DN_WIN=" + std::to_string(n)});
}
```

**Стало** (чисто):
```cpp
void SetWindow(int n) {
    // GpuContext НЕ пересоздаётся
    ctx_.CompileModule(source, names, {"-DN_WIN=" + std::to_string(n)});
    // внутри: CompileKey с новым N_WIN → другой hash → либо disk hit,
    // либо компиляция + save. hipModuleUnload делается только для СТАРОГО module.
}
```

`GpuContext` внутри хранит map `hash → hipModule_t` — можно держать несколько вариантов live одновременно или unload старый при смене. Это уже детали реализации GpuContext (Phase A3).

---

## 4. Realt inventory — что меняется

### 4.1 Pattern B (manual hiprtc) — 6 файлов, все переводим на GpuContext

Подтверждено grep'ом 2026-04-17:

| Repo | Файл | Изменение |
|------|------|-----------|
| spectrum | `fft_func/src/all_maxima_pipeline_rocm.cpp` | Заменить manual hiprtc на `ctx_.CompileModule()` |
| signal_generators | `signal_generators/src/script_generator_rocm.cpp` | **CRITICAL**: сейчас без disk cache → добавить GpuContext |
| linalg | `vector_algebra/src/cholesky_inverter_rocm.cpp` | GpuContext |
| linalg | `vector_algebra/src/symmetrize_gpu_rocm.cpp` | GpuContext |
| linalg | `vector_algebra/src/diagonal_load_regularizer.cpp` | GpuContext |
| strategies | `include/strategies/strategies_float_api.hpp` (337 строк, header-inline!) | Вынести в .cpp + GpuContext |

### 4.2 Pattern A (через GpuContext) — 21 файл

Переписывать не надо. Но `GpuContext::CompileModule` внутри получит новый API — все 21 caller **останутся работающими** (API для caller-а не меняется, меняется только внутренности + поведение кеша).

### 4.3 Dead code — удалить физически

| Файл | Что удалить |
|------|-------------|
| `radar/src/fm_correlator/src/fm_correlator_processor_rocm.cpp:573-710` | `#if 0 // REMOVED` блок → **удалить строки**, не оставлять обёрнутым. Плюс `kernel_cache_` member если не используется. |

### 4.4 filter recreation — убрать workaround

| Файл | Что поменять |
|------|--------------|
| `spectrum/src/filters/src/moving_average_filter_rocm.cpp:137` | Убрать `ctx_ = GpuContext(...)` — просто `ctx_.CompileModule(source, names, new_defines)` |
| `spectrum/src/filters/src/kaufman_filter_rocm.cpp:119` | То же |

---

## 5. Phase Plan — clean slate

> Ветка: `kernel_cache_v2` во всех репо.
> **Координация с `new_profiler`**: см. секцию 7.

### Phase A: Core — новый API + hash infrastructure (4-6 ч)

| Step | Что | Файл | Effort |
|------|-----|------|--------|
| A1 | `CompileKey` struct + Hash (FNV-1a composite) | NEW: `core/include/core/services/compile_key.hpp` + `.cpp` | 1 ч |
| A2 | Перепечатать `KernelCacheService` (новый API) | `kernel_cache_service.hpp/.cpp` полностью переписать | 2 ч |
| A3 | Обновить `GpuContext::CompileModule` — использовать CompileKey | `gpu_context.hpp/.cpp` | 1 ч |
| A4 | Unit-тесты (8+ тестов) | `tests/test_compile_key.hpp`, `test_kernel_cache_service.hpp` | 1-2 ч |
| | Build + test core | | **GATE** |

**Acceptance для Phase A**:
- CompileKey с разными defines даёт разный hash (тест)
- Разный arch → разный hash (тест)
- Сохранил с key1, load с key2 → nullopt (stale detection)
- Hash стабилен между запусками (bit-exact regression)

### Phase B: Critical fixes (4-5 ч)

| Step | Что | Файл | Effort |
|------|-----|------|--------|
| B1 | ScriptGeneratorROCm → GpuContext (впервые получит disk cache!) | `script_generator_rocm.cpp` | 2 ч |
| B2 | AllMaximaPipelineROCm → GpuContext | `all_maxima_pipeline_rocm.cpp` | 1-2 ч |
| B3 | Build + test signal_generators, spectrum | | **GATE** |

**Ценность**: ScriptGen перестаёт recompile'иться на каждый запуск — это **-150ms на создание** на 10 GPU.

### Phase C: linalg + strategies (5-7 ч)

| Step | Что | Файл | Effort |
|------|-----|------|--------|
| C1 | CholeskyInverterROCm → GpuContext | `cholesky_inverter_rocm.cpp` | 1.5 ч |
| C2 | SymmetrizeGpuROCm → GpuContext | `symmetrize_gpu_rocm.cpp` | 1 ч |
| C3 | DiagonalLoadRegularizer → GpuContext | `diagonal_load_regularizer.cpp` | 1 ч |
| C4 | StrategiesFloatApi → .cpp + GpuContext | `strategies_float_api.hpp` → `.cpp` | 3-4 ч ⚠️ |
| | Build + test linalg, strategies | | **GATE** |

**⚠️ C4**: 337 строк header-inline → .cpp split + CMake правка. **Требует OK Alex на CMake** (добавить `.cpp` в `target_sources`).

### Phase D: Cleanup workaround + dead code (1-2 ч)

| Step | Что | Файл | Effort |
|------|-----|------|--------|
| D1 | Убрать recreate GpuContext в filters | `moving_average_filter_rocm.cpp`, `kaufman_filter_rocm.cpp` | 30 мин |
| D2 | Удалить `#if 0` dead code в FM Correlator | `fm_correlator_processor_rocm.cpp` | 30 мин |
| D3 | Integration test: все 8 репо, full pipeline | DSP meta | 1 ч |
| | PR → main (с OK Alex) | | **GATE** |

### Phase E: Polish (1-2 ч)

| Step | Что | Effort |
|------|-----|--------|
| E1 | `KernelCacheService::ListEntries` + CLI tool `dsp-cache-list` | 1 ч |
| E2 | Документация Full.md обновить (новый API) | 30 мин |
| E3 | Tag `v0.3.0` (с OK Alex) | |

### Total effort
**15-22 часа** (realistic) вместо 14-16 первоначальных.

---

## 6. Quality Gates

| # | Gate | Criterion | Checkpoint |
|---|------|-----------|------------|
| G1 | Hash correctness | Изменение source / defines / arch / hiprtc_ver → разный hash (unit test) | Phase A |
| G2 | Stale detection | Save(k1), Load(k2) → nullopt (unit test) | Phase A |
| G3 | Hash stability | Hash стабилен между запусками — regression test с bit-exact golden value | Phase A |
| G4 | No legacy API | `grep "Load(const std::string& name)"` → 0 occurrences | Phase A |
| G5 | Cache hit rate | ScriptGen после 1st run: `CacheStats.hits > 0` на 2nd run (integration test) | Phase B |
| G6 | No pattern B | `grep "hiprtcCompileProgram\|hipModuleLoadData" ALL_REPOS/src` — только в GpuContext | Phase C |
| G7 | Filter reconfig without reload | SetWindow(5) → SetWindow(10) — обе compiled, обе в кеше, no GpuContext recreate | Phase D |
| G8 | All repos build+test | `debian-local-dev preset` зелёный для 8 репо | Phase D |
| G9 | Memory — no leaks | `rocm-smi` после 1000 iterations: hipModule не накапливается | Phase D |
| G10 | Performance regression | GpuContext::CompileModule 1st call (cache miss): ≤ baseline + 10% | Phase D |

---

## 7. Координация с `new_profiler` (минимальные пересечения)

### 7.1 Что уже есть в работе
**GPUProfiler v2** уже спланирован и разложен на таски:
- Спека: `GPUProfiler_Rewrite_Proposal_2026-04-16.md`
- Ревью (Round 3, все согласовано): `GPUProfiler_Rewrite_Proposal_2026-04-16_REVIEW.md`
- Индекс: `MemoryBank/tasks/TASK_Profiler_v2_INDEX.md`
- 8 TASK-файлов Phase A → E
- Effort: 28-40ч, ветка `new_profiler`

### 7.2 Реальные пересечения — их почти нет

Проверено grep'ом 2026-04-17:

| Что trогает | new_profiler | kernel_cache_v2 | Конфликт? |
|-------------|:-----:|:-----:|:-----:|
| `*benchmark*.hpp` (6 репо, 17 файлов) | ✅ | — | — |
| `*_rocm.cpp` processors (6 файлов в 4 репо) | — | ✅ | — |
| `core/include/core/services/profiling/` (новая папка) | ✅ создаёт | — | — |
| `core/include/core/services/kernel_cache_service.hpp` | — | ✅ переписывает | — |
| `core/include/core/services/compile_key.hpp` (новый) | — | ✅ создаёт | — |
| `core/include/core/interface/gpu_context.hpp` | — | ✅ API tweak | — |
| `core/src/services/gpu_profiler.cpp` (удаляется) | ✅ удаляет | — | — |
| `core/src/services/kernel_cache_service.cpp` | — | ✅ переписывает | — |
| `core/src/CMakeLists.txt` | ✅ add profiling/*.cpp | ✅ add compile_key.cpp | 🟡 trivial |
| `core/tests/CMakeLists.txt` | ✅ add test_profile_* | ✅ add test_compile_key | 🟡 trivial |

**Вывод**: файлы **кода** разные. Единственный шов — две строки в `target_sources(core)` у двух `CMakeLists.txt`. Это **auto-merge** в 95% случаев.

### 7.3 Рекомендуемый порядок

```
main ─── new_profiler ─── merge ─── kernel_cache_v2 ─── merge ─── v0.3.0
         (28-40ч)                  (15-22ч — стартует после profiler merged)
```

**Почему profiler первый**:
1. Уже разложен на таски (можно начинать исполнение сегодня)
2. Фундаментальнее — все benchmarks в 6 репо через него
3. Kernel_cache самодостаточен — может подождать

### 7.4 Если хочется ускорить

Если Alex согласен — **kernel_cache_v2 может стартовать параллельно в ветке `kernel_cache_v2`**, при условиях:
- Phase A (core — самая spornaya часть) ждёт merge profiler'а в main
- Phase B-D (processors) могут работать параллельно — они не trогают файлы profiler'а
- Ежедневный `git rebase origin/new_profiler` (дёшево — 1-2 строки CMake)

**Риск**: минимальный (только trivial CMake merge).
**Выигрыш**: ~15-20ч календарного времени.

### 7.5 Если хочется совсем просто

**Последовательно** (профайлер → потом kernel_cache). Гарантированно без конфликтов. 50-60ч календарных — нормально для итогового качества.

---

### 🎯 Решение за Alex (Q8)

| Вариант | Риск | Календ. время | Рекомендация |
|---------|:-----:|:-----:|:-----:|
| A — последовательно | 🟢 0 | 50-60ч | ✅ безопасно |
| B — параллельно с rebase | 🟡 trivial | 35-45ч | ✅ оптимально если есть bandwidth |
| C — одна ветка `v2_refactor` | 🔴 big PR | 45-55ч | ❌ не надо, PR станет гигантским |

Моя ставка — **B** (параллельно с rebase), если ты готов периодически ребейзить.
Если нет — **A** (сначала профайлер, потом cache).

---

## 8. Decision Points — FINAL (согласовано Alex 2026-04-17)

| # | Вопрос | Решение |
|---|--------|---------|
| Q1 | Hash функция | ✅ **FNV-1a 64-bit composite** — 20 строк своей реализации, no deps |
| Q2 | `CompileKey` размещение | ✅ Отдельный `core/include/core/services/compile_key.hpp` |
| Q3 | Manifest.json | ✅ **Optional** — для CLI tool, не для runtime (runtime по hash в имени файла) |
| Q4 | CacheStats типизация | ✅ **Atomic** счётчики (hits/misses/compile_ms/load_ms) |
| Q5 | Variants для разных defines | ✅ **Хранить все** (диск дешёвый) |
| Q6 | Corrupted HSACO at Load | ✅ Удалить файл + recompile + `DRVGPU_LOG_WARNING` |
| Q7 | hipModuleUnload при смене defines | ✅ **Deferred** — старый модуль живёт до shutdown GpuContext |
| Q8 | Порядок с new_profiler | ✅ **Вариант B**: параллельно в своих ветках, Phase A ждёт merge profiler'а, Phase B-D идут параллельно |
| Q9 | Branch name | ✅ `kernel_cache_v2` в каждом затронутом репо (core + 4: spectrum, signal_generators, linalg, strategies) |
| Q10 | TASK-файлы | ✅ Да — 6 файлов по образцу `TASK_Profiler_v2_*.md` |

---

## 9. Open Questions

1. **hipModuleUnload leak в ROCm** — Appendix спеки v2 упоминал что это known issue. Нужно подтвердить на ROCm 7.2+ (текущая версия проекта). Если issue ещё актуален → держать все варианты hipModule live до shutdown GpuContext.

2. **Hash collision probability** — FNV-1a 64-bit на realistic payload (source ~10KB × defines 20 строк × arch + hiprtc_version): коллизия вероятность ~2^-32. На 1000 kernels × 10 configs = 10K entries, probability collision < 10^-5. Достаточно.

3. **Cross-platform hash** — FNV-1a byte-order independent (побайтно). `std::hash` — implementation-defined → использовать нельзя для disk cache.

---

## 10. Expected Results

| Метрика | До (v1 текущий) | После (v3 clean) |
|---------|------------------|------------------|
| Pattern consistency | 2 паттерна | **1** (GpuContext only) |
| Файлов с disk cache | 21 из 27 | **27 из 27** |
| ScriptGen startup | ~150ms recompile | **~1ms** hit |
| Stale binary detection | нет | **composite hash** |
| Filter reconfig latency | ~5ms (GpuContext recreate) | **~1ms** (hash-miss → disk hit, no recreate) |
| Поддержка N_WINDOW variants | одно за раз | **все одновременно** в кеше |
| CacheStats | нет | `hits/misses/compile_ms/load_ms` |
| Duplicated boilerplate | ~740 строк | **0 строк** |
| Dead code | 122 строки (#if 0) | **0 строк** |

---

## 11. Что дальше

1. **Alex прочитает эту спеку** — даст OK или комментарии
2. Если OK → **написать TASK-файлы** (5-6 штук, по образцу `TASK_Profiler_v2_*.md`):
   - `TASK_KernelCache_v2_INDEX.md`
   - `TASK_KernelCache_v2_PhaseA_CoreNewApi.md`
   - `TASK_KernelCache_v2_PhaseB_Critical.md`
   - `TASK_KernelCache_v2_PhaseC_LinalgStrategies.md`
   - `TASK_KernelCache_v2_PhaseD_Cleanup.md`
   - `TASK_KernelCache_v2_PhaseE_Polish.md`
3. Решить Q8 (порядок с new_profiler) — **до** старта

---

*Created: 2026-04-16 | v3 clean-slate: 2026-04-17 | Codo (AI Assistant)*
