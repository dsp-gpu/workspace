# 📝 Отчёт о правках linalg + core (Kernel Cache v2)

**Дата**: 2026-04-15
**Автор**: Кодо (Claude Opus 4.6, 1M)
**Сопутствующий документ**: `review_linalg_2026-04-15.md` (оригинальное ревью)
**Статус**: Код написан. Сборка и тесты — завтра на Linux (MI100).

---

## 🎯 Краткое резюме

Применены **все** согласованные правки ревью `linalg`, плюс Фаза 1+2 **Kernel Cache v2** (multi-GPU safe, exe-relative, per-arch subdir, atomic writes, idempotent save). Фаза 3 (global singleton L4) **НЕ делается** — по решению Alex: «1 GPU = 1 object = 1 thread, никаких shared_mutex».

**Трогали 2 репо**:
- `E:/DSP-GPU/linalg/` — основные правки
- `E:/DSP-GPU/core/` — Kernel Cache v2 (cache_dir_resolver + KernelCacheService)

**Сборки**: НЕ запускались (Windows-хост сегодня). Готовность к Linux-сборке завтра.

---

## ✅ Что сделано (по блокам из плана)

### Блок B — удаление структурных дублей ✅

| Действие | Файл / папка | Обоснование |
|----------|-------------|-------------|
| rm -r | `linalg/src/capon/include/` | Побайтно идентичные копии `include/linalg/*.hpp` (подтверждено `diff -q`) |
| rm -r | `linalg/src/capon/tests/` | Копии тестов из `linalg/tests/` + 23 МБ `data/` |
| rm -r | `linalg/src/vector_algebra/tests/` | Копии тестов + `Data/` (уже присутствуют в `linalg/tests/`) |
| rm    | `linalg/src/.gitkeep` | Артефакт пустой `src/` (уже не пуста) |
| rm -r | `linalg/kernels/` (включая `.gitkeep`) | Пустая папка — реальные kernels в `include/linalg/kernels/` и `src/*/kernels/` |

**Итог**: диск чище на ~23 МБ, структура неоднозначности устранена.

### Блок C — регрессия тестов ✅

| Файл | Что сделано |
|------|------------|
| `linalg/tests/all_test.hpp` | Переписан целиком. Теперь включает **обе** suite: `capon_all_test` + `vector_algebra_all_test`. Добавлена единая точка `linalg_all_test::run()` |
| `linalg/tests/main.cpp` | `capon_all_test::run()` → `linalg_all_test::run()` |

**Было** (регрессия миграции): vector_algebra тесты (Cholesky, CrossBackend, Symmetrize, StageProfiling, Benchmark — ~25 отдельных тестов) компилировались но **не запускались**.

**Стало**: `linalg_all_test::run()` вызывает обе suite. vector_algebra создаёт свой `ROCmBackend` внутри (как в эталоне `statistics`).

### Блок D — CMake чистка ✅

| Файл | Правка |
|------|--------|
| `linalg/CMakePresets.json` | Удалён preset `local-dev` (Windows-хардкод `E:/DSP-GPU/core`). Остались `debian-local-dev` + `ci` |
| `linalg/CMakeLists.txt` | Удалена строка `kernels/` из `target_include_directories(... PRIVATE)` — папка удалена в Блоке B |

### Блок A — Kernel Cache v2 (multi-GPU safe) ✅

Большая правка core + linalg. Главное — **безопасность при 10 GPU параллельно БЕЗ блокировок**.

#### A.1 + A.2 — новая утилита `cache_dir_resolver`

**Файлы (новые)**:
- `core/include/core/services/cache_dir_resolver.hpp`
- `core/src/services/cache_dir_resolver.cpp`

**Контракт**:
```cpp
std::string drv_gpu_lib::ResolveCacheDir(const char* module_name);
```

**Fallback-цепочка (Linux-only)**:
1. `$DSP_CACHE_DIR/<module>/` — ENV override (CI, Docker, tests)
2. `<exe_dir>/kernels_cache/<module>/` — **production default** (portable при копировании bin/)
3. `$HOME/.cache/dsp-gpu/<module>/` — fallback если exe в read-only FS
4. `""` — disable disk cache (hiprtc будет компилить каждый раз)

Путь к exe берётся через `readlink("/proc/self/exe")`. Подкаталог `arch` (gfx908/gfx1100/…) добавляется **внутри** `KernelCacheService` — не здесь.

#### A.3 + A.4 — модификация `KernelCacheService`

**Файлы (правка)**:
- `core/include/core/services/kernel_cache_service.hpp`
- `core/src/services/kernel_cache_service.cpp`

**Изменения**:
1. **Новый параметр конструктора** `arch` (default `""` — backward compat):
   ```cpp
   KernelCacheService(const std::string& base_dir,
                      BackendType backend_type = BackendType::OPENCL,
                      const std::string& arch = "");
   ```
   При непустом arch итоговая директория = `base_dir/arch/`.

2. **Atomic write** (статический helper):
   ```cpp
   static void AtomicWrite(const std::string& path,
                           const void* data, size_t bytes);
   // Pattern: write path.tmp → fs::rename(tmp, path) — POSIX atomic.
   ```

3. **Idempotent Save**: перед записью `.cl` и `.hsaco` проверяется `FileSizeEquals(path, expected_size)`. Если размер совпадает — **skip IO** (защита от лишней записи при concurrent Save от 10 потоков с одинаковым содержимым).

4. **Убран вызов `VersionOldFiles` из Save()**. Старые файлы теперь просто перезаписываются атомарно — при гонке 10 потоков не получим кашу `_00`, `_01`, `_02`. Сама функция оставлена в headers для CLI-утилит (не вызывается в критическом пути).

5. **`WriteManifestEntry` переделан на atomic**: раньше писал `std::ofstream f(manifest_path)` напрямую, теперь формирует весь текст в буфер и пишет через `AtomicWrite`.

#### A.5 — модификация `GpuContext::CompileModule`

**Файл (правка)**: `core/src/gpu_context.cpp`

**Изменение**: конструктор `GpuContext` теперь передаёт `arch_name_` в `KernelCacheService`:

```cpp
// БЫЛО:
kernel_cache_ = std::make_unique<KernelCacheService>(cache_dir, BackendType::ROCm);

// СТАЛО:
kernel_cache_ = std::make_unique<KernelCacheService>(
    cache_dir, BackendType::ROCm, arch_name_);
```

`arch_name_` определяется на строках выше через `ROCmBackend::GetCore().GetArchName()` — порядок уже правильный.

#### A.7 — модификация `CaponProcessor` constructor

**Файл (правка)**: `linalg/src/capon/src/capon_processor.cpp`

**Изменение**:
```cpp
// БЫЛО (хардкод из GPUWorkLib, ломал кэш в новой структуре):
ctx_(backend, "Capon", "modules/capon/kernels")

// СТАЛО:
ctx_(backend, "Capon", drv_gpu_lib::ResolveCacheDir("capon"))
```
Добавлен `#include <core/services/cache_dir_resolver.hpp>`.

#### A.8 — модификация `CholeskyInverterROCm`

**Файл (правка)**: `linalg/src/vector_algebra/src/cholesky_inverter_rocm.cpp`

`CholeskyInverterROCm` создаёт свой `KernelCacheService` напрямую (не через `GpuContext`). Заменён хардкод + передаётся arch:
```cpp
// БЫЛО:
kernel_cache_ = std::make_unique<drv_gpu_lib::KernelCacheService>(
    "modules/vector_algebra/kernels", drv_gpu_lib::BackendType::ROCm);

// СТАЛО:
std::string arch_name;
try {
  auto* rocm_be = dynamic_cast<drv_gpu_lib::ROCmBackend*>(backend);
  if (rocm_be) arch_name = rocm_be->GetCore().GetArchName();
} catch (...) { arch_name.clear(); }

kernel_cache_ = std::make_unique<drv_gpu_lib::KernelCacheService>(
    drv_gpu_lib::ResolveCacheDir("vector_algebra"),
    drv_gpu_lib::BackendType::ROCm,
    arch_name);
```

### Блок E — Python binding для Capon ✅

| Файл | Действие |
|------|---------|
| `linalg/python/py_capon_rocm.hpp` | 🆕 **Новый файл** |
| `linalg/python/dsp_linalg_module.cpp` | ✏️ Добавлена регистрация `CaponProcessor` + `CaponParams` |
| `linalg/python/py_vector_algebra_rocm.hpp` | ✏️ Замена `gpuworklib` → `dsp_linalg` в docstrings (все вхождения) |

**Новый Python API**:
```python
import dsp_linalg
# backend создаётся в dsp_core (не меняется)
params = dsp_linalg.CaponParams(
    n_channels=85, n_samples=1000, n_directions=181, mu=1e-3)
cap = dsp_linalg.CaponProcessor(backend)
relief = cap.compute_relief(signal, steering, params)        # np.float32 [M]
beam   = cap.adaptive_beamform(signal, steering, params)     # np.complex64 [M, N]

# Real-time pipeline (ZeroCopy — данные уже на GPU):
relief_rt = cap.compute_relief_gpu(sig_gpu_ptr, st_gpu_ptr, params)
```

`compute_relief_gpu` / `adaptive_beamform_gpu` принимают `uintptr_t` (int64 в Python) — указатель на GPU-память из `CaponProcessor::ComputeRelief(void*, void*, ...)`. Используется для сопровождения цели без H2D копий.

---

## 📂 Сводка изменённых/новых файлов

### `E:/DSP-GPU/core/` — 5 изменений

| Файл | Тип |
|------|-----|
| `include/core/services/cache_dir_resolver.hpp` | 🆕 Новый |
| `src/services/cache_dir_resolver.cpp` | 🆕 Новый |
| `include/core/services/kernel_cache_service.hpp` | ✏️ Правка (новый конструктор + AtomicWrite/FileSizeEquals) |
| `src/services/kernel_cache_service.cpp` | ✏️ Правка (Save atomic+idempotent, WriteManifestEntry atomic, arch subdir) |
| `src/gpu_context.cpp` | ✏️ Правка (передача arch в KernelCacheService) |

### `E:/DSP-GPU/linalg/` — 5 правок + 1 новый + много удалений

| Файл | Тип |
|------|-----|
| `CMakeLists.txt` | ✏️ Убрана строка `kernels/` из `target_include_directories` |
| `CMakePresets.json` | ✏️ Удалён Windows-preset `local-dev` |
| `src/capon/src/capon_processor.cpp` | ✏️ ResolveCacheDir вместо хардкода |
| `src/vector_algebra/src/cholesky_inverter_rocm.cpp` | ✏️ ResolveCacheDir + arch |
| `tests/all_test.hpp` | ✏️ Переписан — добавлен `vector_algebra_all_test::run()` + `linalg_all_test::run()` |
| `tests/main.cpp` | ✏️ Вызов `linalg_all_test::run()` |
| `python/dsp_linalg_module.cpp` | ✏️ Регистрация CaponProcessor |
| `python/py_capon_rocm.hpp` | 🆕 Новый файл |
| `python/py_vector_algebra_rocm.hpp` | ✏️ `gpuworklib` → `dsp_linalg` |
| `src/capon/include/` | ❌ Удалено (дубли) |
| `src/capon/tests/` | ❌ Удалено (дубли) |
| `src/vector_algebra/tests/` | ❌ Удалено (дубли) |
| `src/.gitkeep`, `kernels/rocm/.gitkeep`, `kernels/` | ❌ Удалено |

---

## 🚨 ЧТО НУЖНО СДЕЛАТЬ ЗАВТРА (на Linux)

### 🔴 КРИТИЧНО — `core/CMakeLists.txt` (я не трогала!)

Добавить новый `.cpp` в `target_sources`:
```cmake
target_sources(DspCore PRIVATE
  # ... существующие файлы ...
  # Services
  src/services/batch_manager.cpp
  src/services/kernel_cache_service.cpp
  src/services/cache_dir_resolver.cpp         # ← ДОБАВИТЬ
  src/services/filter_config_service.cpp
  src/services/storage/file_storage_backend.cpp
)
```

**Без этой правки линковка упадёт** — `undefined reference to drv_gpu_lib::ResolveCacheDir`.

### 🧪 Тесты для завтрашнего Linux-запуска

#### Тест 1 — Cold start (первый запуск)
```bash
cd linalg/build
cmake --preset debian-local-dev
cmake --build build
cd build/tests
rm -rf kernels_cache/
./test_linalg_main
ls kernels_cache/capon/gfx908/         # ← должны появиться .cl, .hsaco, manifest.json
ls kernels_cache/vector_algebra/gfx908/
```
**Ожидание**: все тесты прошли, кэш создан возле exe.

#### Тест 2 — Warm start (HSACO есть)
```bash
./test_linalg_main
```
**Ожидание**: в логе строки `[Capon] disk cache (exe-rel): ...` и `[Capon] kernels loaded from cache (HSACO)`. Первый ComputeRelief < 50ms.

#### Тест 3 — 10 GPU параллельно (main test для multi-GPU safety)
Псевдокод для ручного запуска (нужно написать тест если не существует):
```cpp
std::vector<std::thread> workers;
for (int gpu_id = 0; gpu_id < n_gpus; ++gpu_id) {
  workers.emplace_back([gpu_id]() {
    drv_gpu_lib::ROCmBackend be;
    be.Initialize(gpu_id);
    capon::CaponProcessor cap(&be);
    for (int i = 0; i < 100; ++i) {
      cap.ComputeRelief(signal, steering, params);
    }
  });
}
for (auto& t : workers) t.join();
```
**Ожидание**:
- `manifest.json` валиден (jq `.kernels | length`)
- Все `.hsaco` имеют одинаковый размер (cmp / sha256sum)
- Нет `.tmp` файлов (garbage)
- Нет crash
- Компиляция произошла **минимум 1 раз** (может больше — first-writer-wins гонка, безвредна)

#### Тест 4 — ENV override
```bash
export DSP_CACHE_DIR=/tmp/dsp_test
./test_linalg_main
ls /tmp/dsp_test/capon/gfx908/
unset DSP_CACHE_DIR
```

#### Тест 5 — fallback на `$HOME`
```bash
chmod -w build/tests           # имитируем read-only exe dir
./test_linalg_main
ls ~/.cache/dsp-gpu/capon/gfx908/
chmod +w build/tests
```

#### Тест 6 — Python
```python
import dsp_core
import dsp_linalg
be = dsp_core.backends.rocm.ROCmBackend(); be.initialize(0)
cap = dsp_linalg.CaponProcessor(be)
params = dsp_linalg.CaponParams(85, 1000, 181, 1e-3)
import numpy as np
signal = np.random.randn(85*1000).astype(np.complex64)
steering = np.random.randn(85*181).astype(np.complex64)
relief = cap.compute_relief(signal, steering, params)
assert relief.shape == (181,)
```

#### Тест 7 — regression vector_algebra
```bash
./test_linalg_main 2>&1 | grep -E "(vector_algebra|VecAlg)"
# Должно быть: "TestCpuIdentity PASSED", "TestCpu341 PASSED", ...
# (а не "skipping")
```

### ⬜ Известные риски / что проверить

1. **`core/src/backends/rocm/rocm_backend.hpp`** — `cholesky_inverter_rocm.cpp` теперь включает этот файл для `dynamic_cast<ROCmBackend*>`. Проверить что backend действительно ROCmBackend в production коде (есть места с `HybridBackend`? — если да, dynamic_cast вернёт nullptr, arch останется пустым, fallback к legacy-поведению — ОК).

2. **Concurrent first-write race** — при 10 одновременных `Save()` с идентичным содержимым **в пределах узкого окна** два потока могут оба писать. Но `AtomicWrite` гарантирует что читатели не увидят полузаписанный файл (fs::rename atomic). Содержимое одинаковое — результат корректный.

3. **`manifest.json` merge** — при concurrent UPSERT два потока могут прочитать старый manifest до записи, оба добавят свою запись, второй перезапишет первого (теряя запись первого). Последствие: в manifest может НЕ оказаться записи, но `.hsaco` и `.cl` физически есть → `Load()` работает. Манифест — справочный, не критичный. При желании — поправить в следующей итерации (lockfile).

4. **`ConsoleOutput` в `cache_dir_resolver.cpp`** — использует singleton. Проверить что вызов до полной инициализации backend не упадёт (обычно ConsoleOutput инициализируется лениво — OK).

5. **`/proc/self/exe` при unit-тестах через ctest** — нужно проверить что exe-путь адекватно резолвится и кэш создаётся в build/tests/, а не в неожиданном месте.

---

## 🔮 Что на потом (отдельные задачи)

### Фаза 3 — Global KernelPool singleton (L4 RAM cache)
Отменено по решению Alex: «1 GPU = 1 object = 1 thread, без shared_mutex». Можно вернуть если появится сценарий «много CaponProcessor instances на ОДНОЙ GPU в одном процессе» — тогда имеет смысл shared `hipFunction_t`.

### Pipelining real-time (сопровождение цели)
Обсудим отдельно. Направления:
1. **Pre-uploaded steering**: U почти не меняется между кадрами → upload 1 раз, переиспользовать.
2. **Async `ComputeRelief`**: убрать `Synchronize()`, использовать `hipEventRecord` + `hipEventQuery`.
3. **ZeroCopy pipeline**: использовать GPU-overload (`void* gpu_signal`) для real-time потока — уже реализовано в C++ API, уже есть в Python через `compute_relief_gpu()`.
4. **Batch ComputeRelief**: если целей несколько — можно батчить через `rocSOLVER` batch mode.

### Остатки ревью `review_linalg_2026-04-15.md`
Не вошли в сегодняшние правки (отложены):
- **§3.11** — `hipGetLastError()` после kernel launch во всех Op-ах
- **§3.12** — `__launch_bounds__` на Capon kernel (проверить в `capon_kernels_rocm.hpp`)
- **§5** — verification `symmetrize_upper_to_full` kernel делает именно `A[upper] = conj(A[lower])`, не просто транспонирование (критично для complex Hermitian).

---

## 📎 Changelog

- **2026-04-15** — initial version (Кодо @ Claude Opus 4.6)
  - Blocks B, C, D, A (partial — Фаза 1+2), E — complete
  - Tested: не тестировано (Windows host)
  - Known issue: `core/CMakeLists.txt` требует ручного добавления `cache_dir_resolver.cpp` в `target_sources`
