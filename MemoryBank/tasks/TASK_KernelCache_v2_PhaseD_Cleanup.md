# TASK Phase D: Cleanup — dead code + filter workaround

> **Prerequisites**: Phase C выполнена
> **Effort**: 1-2 часа
> **Scope**: `radar/`, `spectrum/`
> **Depends**: C

---

## 🎯 Цель

1. **D1**: Убрать workaround recreate GpuContext в spectrum filters (теперь не нужен)
2. **D2**: Физически удалить 122 строки dead code `#if 0` блока в FM Correlator
3. **D3**: Full-pipeline integration test (все 8 репо вместе)

---

## 📋 Шаги

### D1. Убрать filter workaround (spectrum)

**Файлы**:
- `spectrum/src/filters/src/moving_average_filter_rocm.cpp` (строка ~137)
- `spectrum/src/filters/src/kaufman_filter_rocm.cpp` (строка ~119)

#### D1.1 Текущий паттерн (workaround)

```cpp
void MovingAverageFilter::SetWindowSize(int n_window) {
    if (n_window == n_window_) return;
    n_window_ = n_window;

    // ❌ WORKAROUND: пересоздаём весь GpuContext — ~5ms penalty
    ctx_ = drv_gpu_lib::GpuContext(backend_, "SMA", cache_dir_);
    ctx_.CompileModule(kernels::GetSmaSource(), {"sma_kernel"},
                       {"-DN_WINDOW=" + std::to_string(n_window)});
}
```

**Проблема**: GpuContext recreation — hipModuleUnload + reset buffers + пересоздание rocblas_handle. Избыточно.

#### D1.2 После Phase A — workaround не нужен

```cpp
void MovingAverageFilter::SetWindowSize(int n_window) {
    if (n_window == n_window_) return;
    n_window_ = n_window;

    // ✅ Просто вызываем CompileModule с новыми defines.
    // CompileKey с новым N_WINDOW → другой hash → новый hipModule_t
    // в GpuContext (сосуществует со старым или deferred-unload).
    ctx_.CompileModule(kernels::GetSmaSource(), {"sma_kernel"},
                       {"-DN_WINDOW=" + std::to_string(n_window)});
}
```

**⚠️ Важно**: `GpuContext::CompileModule` из Phase A3 должен **поддерживать повторный вызов** с разными defines. Если текущая реализация имеет guard `if (module_) return;` (см. комментарий "Idempotent: second call is a no-op" в gpu_context.hpp:113) — **это нужно исправить в Phase A3**.

**Если не исправлено в A3** — добавить такое поведение: CompileModule принимает разные defines, для нового hash → новый hipModule_t, старый deferred-unload (или сохраняется до shutdown per Q7).

#### D1.3 Build + test

```bash
cd E:/DSP-GPU/spectrum
export FETCHCONTENT_SOURCE_DIR_DSP_CORE=E:/DSP-GPU/core
cmake --build build -j
ctest --test-dir build -R "moving_average\|kaufman" --output-on-failure
```

---

### D2. FM Correlator — удалить dead code физически

**Файл**: `radar/src/fm_correlator/src/fm_correlator_processor_rocm.cpp` (строки 573-710)

#### D2.1 Текущее состояние

```cpp
// Строка 573:
#if 0  // ════ REMOVED: legacy CompileKernels ═══════════════════════════════
/**
 * @brief (REMOVED) Компилирует 4 HIP кернела через hiprtc (lazy, один раз).
 * ...
 * 122 строки закомменченного кода
 * ...
*/
#endif
```

Плюс — проверить:

```bash
grep -n "kernel_cache_" E:/DSP-GPU/radar/src/fm_correlator/src/fm_correlator_processor_rocm.cpp
grep -n "kernel_cache_" E:/DSP-GPU/radar/include/
```

Если поле `kernel_cache_` тоже неиспользуемое — удалить из class definition.

#### D2.2 Удалить физически

Из `fm_correlator_processor_rocm.cpp` — удалить строки 569-710 (весь `#if 0` блок + его комментарий `// Legacy CompileKernels replaced by EnsureCompiled()...`).

Также:
- Удалить `std::unique_ptr<drv_gpu_lib::KernelCacheService> kernel_cache_;` если объявлен
- Удалить `#include <core/services/kernel_cache_service.hpp>` если больше не нужен (grep — используется ли где-то ещё)

#### D2.3 Branch strategy

Radar **НЕ в scope** kernel_cache_v2 (Phase A-C). Но dead code удалить нужно. Два варианта:

**Вариант 1 (рекомендую)**: отдельная ветка в radar
```bash
cd E:/DSP-GPU/radar
git checkout -b cleanup_fm_correlator
# ... удалить dead code ...
git commit -m "[cleanup] Remove legacy CompileKernels dead code from FM Correlator"
```
Merge в radar/main когда Alex одобрит — независимо от kernel_cache_v2.

**Вариант 2**: в ветке kernel_cache_v2 в radar
```bash
cd E:/DSP-GPU/radar
git checkout -b kernel_cache_v2
# только D2 (dead code)
```

**Мой выбор**: Вариант 1 — cleanup не связан с Kernel Cache v2 архитектурно.

#### D2.4 Build + test

```bash
cd E:/DSP-GPU/radar
cmake --build build -j
ctest --test-dir build --output-on-failure
```

---

### D3. Integration test — все 8 репо на kernel_cache_v2

**Цель**: убедиться что full pipeline собирается и работает end-to-end с новым cache.

#### D3.1 Клонировать/переключить все репо

```bash
cd E:/DSP-GPU
for repo in core spectrum signal_generators linalg strategies; do
    cd $repo
    git branch --show-current   # должно быть kernel_cache_v2
    cd ..
done

# radar — на main или cleanup_fm_correlator
# stats, heterodyne — на main (они не в scope Phase A-C)
```

#### D3.2 Собрать DSP meta

```bash
cd E:/DSP-GPU/DSP
export FETCHCONTENT_SOURCE_DIR_DSP_CORE=E:/DSP-GPU/core
export FETCHCONTENT_SOURCE_DIR_DSP_SPECTRUM=E:/DSP-GPU/spectrum
# ... для всех репо ...
rm -rf build
cmake --preset debian-local-dev
cmake --build build -j
ctest --test-dir build --output-on-failure
```

#### D3.3 Проверить cache stats

После запуска любого теста использующего процессор:

```bash
ls -la ~/.cache/dsp-gpu/kernels_cache/  # или где у нас ResolveCacheDir
# Должны быть папки: fft_func/, statistics/, capon/, symmetrize/, ...
# Внутри: gfx1201/*.hsaco
```

Второй прогон того же теста **должен быть заметно быстрее** (cache hits).

---

### D4. Финальный grep — no Pattern B anywhere

```bash
cd E:/DSP-GPU
grep -rn "hiprtcCompileProgram\|hipModuleLoadData" \
    */include/ */src/ \
    2>/dev/null \
    | grep -v "core/src/gpu_context.cpp" \
    | grep -v "core/include/core/interface/gpu_context.hpp"
```

**Ожидание**: пустой результат. Если что-то нашлось — значит пропустили Pattern B файл, вернуться к Phase B/C.

---

### D5. Commits

**spectrum** (D1):
```
[kernel-cache-v2] Phase D1: remove filter recreate workaround

- moving_average_filter_rocm.cpp: SetWindowSize no longer recreates GpuContext
- kaufman_filter_rocm.cpp: same
- Relies on Phase A (GpuContext::CompileModule supports re-invocation with
  different defines, new hash → new hipModule_t)

Latency: ~5ms → ~1ms (disk hit) per SetWindowSize call.
```

**radar** (D2):
```
[cleanup] Remove legacy CompileKernels dead code from FM Correlator

- Delete #if 0 block (lines 569-710, 122 LOC)
- Remove unused kernel_cache_ member
- Clean header: remove unused include <core/services/kernel_cache_service.hpp>

No functional change — all profiling goes through EnsureCompiled + GpuContext
since Phase 3 migration.
```

---

## ✅ Acceptance Criteria

| # | Критерий | Проверка |
|---|----------|---------|
| D1.1 | moving_average без recreate | `grep "GpuContext(backend" spectrum/.../moving_average_filter_rocm.cpp` пусто |
| D1.2 | kaufman без recreate | same для kaufman |
| D1.3 | SetWindowSize работает | `ctest -R moving_average` зелёный, перформанс измерен |
| D2.1 | FM Correlator: `#if 0` удалён | `grep "#if 0" radar/src/fm_correlator/src/fm_correlator_processor_rocm.cpp` пусто |
| D2.2 | FM Correlator: 122 строки удалены | `wc -l` показывает ~728 вместо 850 |
| D2.3 | radar собирается и тесты | ctest exit 0 |
| D3.1 | Все репо на kernel_cache_v2 | 5 репо + core |
| D3.2 | DSP meta full build | cmake --build exit 0 |
| D3.3 | Integration tests зелёные | ctest --test-dir DSP/build exit 0 |
| D4 | Zero Pattern B | grep hiprtcCompileProgram вне gpu_context пустой |

---

## 📖 Замечания

- **D2 радар — отдельная ветка** `cleanup_fm_correlator`. Merge независимо от kernel_cache_v2.
- **D3 integration test** — **критичный gate** перед Phase E merge. Если что-то падает — вернуться к соответствующей phase.
- **Cache stats после integration** — записать в `MemoryBank/sessions/kernel_cache_v2_integration_<date>.md`.

---

*Task created: 2026-04-17 | Phase D | Status: READY after C*
