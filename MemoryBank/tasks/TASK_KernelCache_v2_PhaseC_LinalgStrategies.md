# TASK Phase C: linalg + strategies migration

> **Prerequisites**: Phase A выполнена
> **Effort**: 5-7 часов
> **Scope**: `linalg/`, `strategies/`
> **Depends**: A

---

## 🎯 Цель

Перевести 4 оставшихся Pattern B файла на GpuContext:
- **C1**: `CholeskyInverterROCm` (567 LOC)
- **C2**: `SymmetrizeGpuROCm` (201 LOC)
- **C3**: `DiagonalLoadRegularizer` (175 LOC)
- **C4**: `StrategiesFloatApi` (337 LOC, **header-inline!** требует split .hpp → .cpp)

---

## 📋 Шаги

### C0. Создать ветки

```bash
cd E:/DSP-GPU/linalg && git checkout -b kernel_cache_v2
cd E:/DSP-GPU/strategies && git checkout -b kernel_cache_v2
```

---

### C1. CholeskyInverterROCm → GpuContext (1.5 ч)

**Файл**: `linalg/src/vector_algebra/src/cholesky_inverter_rocm.cpp`
**Header**: `linalg/include/linalg/cholesky_inverter_rocm.hpp` (проверить путь)

#### C1.1 Grep и план

```bash
cd E:/DSP-GPU/linalg
grep -n "hiprtc\|hipModule\|kernel_cache_" src/vector_algebra/src/cholesky_inverter_rocm.cpp
```

#### C1.2 Миграция

Паттерн как в Phase B1.2:
1. Добавить `drv_gpu_lib::GpuContext ctx_` в члены класса
2. Инициализация в конструкторе: `ctx_(backend, "CholeskyInverter", ResolveCacheDir("vector_algebra"))`
3. Заменить manual hiprtc block на:
   ```cpp
   ctx_.CompileModule(kernels::GetCholeskySource(), {"cholesky_kernel_a", "cholesky_kernel_b"});
   ```
4. `GetKernel` вместо manual function handle storage
5. Удалить: `kernel_cache_`, `module_`, `kernel_*_`, `hipModuleUnload` в деструкторе, `#include <hip/hiprtc.h>`

#### C1.3 Build + test

```bash
cd E:/DSP-GPU/linalg
export FETCHCONTENT_SOURCE_DIR_DSP_CORE=E:/DSP-GPU/core
cmake --build build -j
ctest --test-dir build -R cholesky --output-on-failure
```

---

### C2. SymmetrizeGpuROCm → GpuContext (1 ч)

**Файл**: `linalg/src/vector_algebra/src/symmetrize_gpu_rocm.cpp`

Тот же паттерн. Текущий grep показывает:
```
41:  hip_err = hipModuleLoadData(&module, binary_data);
106: rtc_err = hiprtcCompileProgram(prog, ...);
```

Замена:
```cpp
ctx_.CompileModule(kernels::GetSymmetrizeSource(), {"symmetrize_upper_to_full"});
```

Build + test:
```bash
ctest --test-dir build -R symmetrize --output-on-failure
```

---

### C3. DiagonalLoadRegularizer → GpuContext (1 ч)

**Файл**: `linalg/src/vector_algebra/src/diagonal_load_regularizer.cpp` (175 LOC)

Тот же паттерн. Kernel name: найти через grep `hipModuleGetFunction`.

---

### C4. StrategiesFloatApi → .cpp split + GpuContext (3-4 ч ⚠️)

**Файл**: `strategies/include/strategies/strategies_float_api.hpp` (337 LOC, HEADER-INLINE!)

#### C4.1 Почему это сложнее

Текущий файл — **header с inline реализацией**. Hiprtc + hipModuleLoadData в `.hpp`. Это плохо:
- Компилируется в каждом cpp включающем заголовок → duplicate code
- `hipModule_t` в static context = одинаковый handle в разных TU (UB)

#### C4.2 План split

Создать `strategies/src/strategies/src/strategies_float_api.cpp`:
- Вынести все function bodies из .hpp в .cpp
- В .hpp оставить **только объявления**
- Добавить GpuContext member в класс
- Заменить manual hiprtc на `ctx_.CompileModule`

#### C4.3 CMake — ⚠️ ТРЕБУЕТ OK ALEX

`strategies/src/strategies/CMakeLists.txt` — добавить новый .cpp в `target_sources`:

```cmake
target_sources(dsp_strategies PRIVATE
    # ... existing ...
    src/strategies_float_api.cpp  # NEW
)
```

**Это разрешённая правка** (добавление нового .cpp в существующий target_sources — "очевидная правка" по CLAUDE.md), но из-за размера и важности лучше **спросить Alex** перед коммитом CMake.

#### C4.4 Миграция

**Было** (в .hpp, строки 262-310):
```cpp
// Inline в header:
hipError_t err = hipModuleLoadData(&kernel_module_, entry->binary.data());
// ...
hiprtcResult res = hiprtcCompileProgram(prog, ...);
// ...
hipModuleLoadData(&kernel_module_, code.data());
```

**Стало** (в .cpp):
```cpp
void StrategiesFloatApi::CompileKernel() {
    ctx_.CompileModule(kernels::GetStrategiesSource(), {"beam_kernel_a", "beam_kernel_b"}, extra_defines_);
}
```

В .hpp остаётся:
```cpp
class StrategiesFloatApi {
public:
    void CompileKernel();   // declaration only
private:
    drv_gpu_lib::GpuContext ctx_;
    std::vector<std::string> extra_defines_;
    // ... другие члены ...
};
```

#### C4.5 Проверка что include работает

После split — пересобрать весь `strategies` и зависимости (DSP meta):
```bash
cd E:/DSP-GPU/strategies
cmake --build build -j
ctest --test-dir build --output-on-failure

# И зависимые:
cd E:/DSP-GPU/DSP
cmake --build build -j
```

---

### C5. Commits

**linalg**:
```
[kernel-cache-v2] Phase C1-C3: linalg processors → GpuContext

- CholeskyInverterROCm: replace manual hiprtc with ctx_.CompileModule
- SymmetrizeGpuROCm: replace own KernelCacheService with ctx_.CompileModule
- DiagonalLoadRegularizer: replace manual hiprtc with ctx_.CompileModule

Removes ~270 lines of boilerplate across 3 files.
```

**strategies**:
```
[kernel-cache-v2] Phase C4: strategies_float_api header → .cpp + GpuContext

- Split header-inline implementation to .cpp (fixes duplicate code across TUs)
- Replace manual hiprtc with ctx_.CompileModule
- CMakeLists.txt: add src/strategies_float_api.cpp to target_sources (OK Alex)

Removes ~120 lines of boilerplate + architectural cleanup.
```

**⚠️ git push только с OK Alex.**

---

## ✅ Acceptance Criteria

| # | Критерий | Проверка |
|---|----------|---------|
| 1 | C1: cholesky без manual hiprtc | `grep hiprtcCompileProgram linalg/.../cholesky_inverter_rocm.cpp` пусто |
| 2 | C2: symmetrize без manual hiprtc | same |
| 3 | C3: diagonal без manual hiprtc | same |
| 4 | C4: strategies_float_api.hpp — только declarations | `grep "hipModule\|hiprtc" strategies/include/strategies/strategies_float_api.hpp` пусто |
| 5 | C4: .cpp создан и в CMake | `test -f strategies/src/strategies/src/strategies_float_api.cpp` |
| 6 | linalg собирается + тесты | ctest exit 0 |
| 7 | strategies собирается + тесты | ctest exit 0 |
| 8 | DSP meta собирается | `cmake --build build` в DSP exit 0 |
| 9 | Нет Pattern B в DSP-GPU (финальная проверка) | `grep -rn "hiprtcCompileProgram" */src/ \| grep -v gpu_context` — только в core/src/gpu_context.cpp |

---

## 🚨 Риски и mitigation

### C4 split может сломать external callers
**Симптом**: `strategies_float_api.hpp` используется в DSP или тестах, после split — undefined references.
**Mitigation**: после split — полный rebuild DSP meta.
**Если падает** — проверить что все methods-reality перенесены в .cpp, нет дублирующих inline definitions.

### C4 CMake правка blocks build
**Симптом**: `target_sources` добавили, но `strategies_float_api.cpp` ещё не создан → compile error.
**Mitigation**: сначала создать .cpp файл с пустой реализацией, потом править CMake. Или atomic commit (CMake + .cpp).

---

*Task created: 2026-04-17 | Phase C | Status: READY after A*
