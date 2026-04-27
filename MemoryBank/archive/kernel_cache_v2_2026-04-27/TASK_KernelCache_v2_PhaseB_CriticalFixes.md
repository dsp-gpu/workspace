# TASK Phase B: Critical Fixes — ScriptGen + AllMaxima

> **Prerequisites**: Phase A выполнена (в `core/kernel_cache_v2`)
> **Effort**: 4-5 часов
> **Scope**: `signal_generators/`, `spectrum/`
> **Depends**: A

---

## 🎯 Цель

Перевести 2 самых проблемных Pattern B файла на GpuContext:
- **B1**: `ScriptGeneratorROCm` — сейчас без disk cache, recompile каждый запуск (~150ms)
- **B2**: `AllMaximaPipelineROCm` — ~150 LOC boilerplate

---

## 📋 Шаги

### B0. Создать ветки в репо

```bash
cd E:/DSP-GPU/signal_generators && git checkout -b kernel_cache_v2
cd E:/DSP-GPU/spectrum && git checkout -b kernel_cache_v2
```

Для локальной разработки обе ветки используют локальный core:
```bash
export FETCHCONTENT_SOURCE_DIR_DSP_CORE=E:/DSP-GPU/core
```

---

### B1. ScriptGeneratorROCm → GpuContext

**Файлы**:
- `signal_generators/src/signal_generators/src/script_generator_rocm.cpp` (332 LOC, содержит manual hiprtc)
- `signal_generators/include/.../form_script_generator.hpp` (возможно класс)

#### B1.1 Исследовать текущую реализацию

```bash
grep -n "hiprtc\|hipModule\|kernel_cache_\|module_\|kernel_fn_" \
    E:/DSP-GPU/signal_generators/src/signal_generators/src/script_generator_rocm.cpp
```

Понять:
- Как генерируется `source` (динамически из script?)
- Какие kernel names извлекаются
- Какие defines используются

#### B1.2 Миграция

**Было** (приблизительно, строки 280-305):
```cpp
hiprtcProgram prog;
hiprtcCreateProgram(&prog, source.c_str(), "script_gen.hip", 0, nullptr, nullptr);
hiprtcCompileProgram(prog, 2, opts);
size_t code_size; hiprtcGetCodeSize(prog, &code_size);
std::vector<char> code(code_size);
hiprtcGetCode(prog, code.data());
hipModuleLoadData(&module_, code.data());
hipModuleGetFunction(&kernel_fn_, module_, "script_signal");
```

**Стало**:
```cpp
// В .hpp — добавить member:
drv_gpu_lib::GpuContext ctx_;

// В конструкторе ScriptGeneratorROCm:
ScriptGeneratorROCm(drv_gpu_lib::IBackend* backend, ...)
    : ctx_(backend, "ScriptGen",
           drv_gpu_lib::ResolveCacheDir("script_gen")),
      ...
{}

// Вместо hiprtc блока — один вызов:
void ScriptGeneratorROCm::CompileScript(const std::string& generated_source) {
    // Generated source уникален для каждого user-script → hash будет разным
    ctx_.CompileModule(generated_source.c_str(), {"script_signal"}, {});
    kernel_fn_ = ctx_.GetKernel("script_signal");
}

// Deleter module_ + hipModuleUnload — УБРАТЬ, GpuContext сам управляет
```

**⚠️ Если script source содержит уникальные константы** (user-provided formula) — каждый script → уникальный hash → уникальный cache entry. Disk cache будет расти — это **ожидаемо** (Q5: хранить все).

**Если одинаковый script компилируется повторно** — второй вызов будет **1ms cache hit** вместо 150ms recompile. **Это и есть основной выигрыш**.

#### B1.3 Удалить всё что больше не нужно

- `hipModule_t module_` → удалить (GpuContext владеет)
- `hipFunction_t kernel_fn_` → можно оставить как кеш pointer после `ctx_.GetKernel("script_signal")`
- Деструктор с `hipModuleUnload` → удалить (GpuContext делает)
- `#include <hip/hiprtc.h>` → удалить если не нужен для других вещей
- Private method типа `CompileViaHiprtc` → удалить

#### B1.4 Проверить existing tests

```bash
cd E:/DSP-GPU/signal_generators
grep -rn "ScriptGenerator" tests/
```

Если есть test — убедиться что 2nd запуск быстрее первого:
```cpp
auto t0 = high_resolution_clock::now();
gen.CompileScript(source);
auto t1 = high_resolution_clock::now();  // 1st: ~150ms (miss)
gen.CompileScript(source);
auto t2 = high_resolution_clock::now();  // 2nd: ~1ms (hit!)

ASSERT_LT(duration_cast<milliseconds>(t2 - t1).count(), 10);
```

#### B1.5 Build + test

```bash
cd E:/DSP-GPU/signal_generators
export FETCHCONTENT_SOURCE_DIR_DSP_CORE=E:/DSP-GPU/core
rm -rf build
cmake --preset debian-local-dev
cmake --build build -j
ctest --test-dir build --output-on-failure
```

---

### B2. AllMaximaPipelineROCm → GpuContext

**Файл**: `spectrum/src/fft_func/src/all_maxima_pipeline_rocm.cpp` (576 LOC)

#### B2.1 Исследовать

```bash
grep -n "hiprtc\|hipModule\|kernel_cache_\|module_" \
    E:/DSP-GPU/spectrum/src/fft_func/src/all_maxima_pipeline_rocm.cpp
```

Типичный паттерн (наследованный) — **собственный** `KernelCacheService` + manual hiprtc.

#### B2.2 Миграция

То же что B1.2, но названия:
- module: `"AllMaxima"`
- cache dir: `ResolveCacheDir("fft_func")` или `"all_maxima"`
- kernel names: грепнуть `hipModuleGetFunction` чтобы найти

Удалить:
- `std::unique_ptr<KernelCacheService> kernel_cache_` → GpuContext имеет свой
- `hipModule_t module_`, `hipFunction_t kernel_funcs_[...]` → через GpuContext
- Manual hiprtc блок

#### B2.3 Build + test

```bash
cd E:/DSP-GPU/spectrum
export FETCHCONTENT_SOURCE_DIR_DSP_CORE=E:/DSP-GPU/core
cmake --build build -j
ctest --test-dir build --output-on-failure
```

---

### B3. Commits

**signal_generators**:
```
[kernel-cache-v2] Phase B1: ScriptGen → GpuContext (disk cache!)

- Replace manual hiprtc with GpuContext::CompileModule
- First-time disk caching for script_signal kernel
- Each user script → unique hash → unique cache entry
- 2nd compile of same script: ~150ms → ~1ms (disk hit)

Removes ~80 lines of boilerplate.
```

**spectrum**:
```
[kernel-cache-v2] Phase B2: AllMaximaPipeline → GpuContext

- Replace own KernelCacheService + manual hiprtc with ctx_.CompileModule
- Removes ~150 lines of boilerplate

Refs: MemoryBank/tasks/TASK_KernelCache_v2_INDEX.md
```

---

## ✅ Acceptance Criteria

| # | Критерий | Проверка |
|---|----------|---------|
| 1 | script_generator_rocm.cpp без `hiprtc` | `grep hiprtc signal_generators/.../script_generator_rocm.cpp` пусто |
| 2 | script_generator_rocm.cpp без `hipModuleLoadData` | grep пусто |
| 3 | ScriptGeneratorROCm имеет GpuContext member | `grep "GpuContext ctx_" signal_generators/include/` |
| 4 | all_maxima_pipeline_rocm.cpp без manual hiprtc | grep `hiprtcCompileProgram` пусто |
| 5 | signal_generators собирается и тестируется | cmake build + ctest exit 0 |
| 6 | spectrum собирается и тестируется | cmake build + ctest exit 0 |
| 7 | Cache hit measurable | 2nd-compile test показывает <10ms |

---

## 📖 Замечания

- **B1 — главная ценность**: ScriptGen впервые получает disk cache. На 10 GPU × каждый запуск = экономия ~1.5 сек startup.
- **Сигнатура `CompileScript(source)` публичная** — остаётся неизменной для users.
- **Cache directory**: Alex решит, `"script_gen"` или `"signal_generators/script_gen"` — не критично.

---

*Task created: 2026-04-17 | Phase B | Status: READY after A*
