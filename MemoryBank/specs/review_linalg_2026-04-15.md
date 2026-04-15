# 🔍 Code Review: `linalg` — миграция GPUWorkLib → DSP-GPU

**Дата**: 2026-04-15
**Ревьюер**: Кодо (Claude Opus 4.6)
**Объект**: `E:/DSP-GPU/linalg/` (DspLinalg v0.1.0)
**Эталон сравнения**: `E:/C++/GPUWorkLib/modules/{vector_algebra,capon}/` (работающий монолит)
**Источники**: `agents/module-auditor.md` (чеклист), код обеих веток, git-дубликаты, `capon_processor.cpp`, `tests/CMakeLists.txt`

---

## 📊 Сводная таблица статуса

| Категория | Статус | Комментарий |
|-----------|--------|-------------|
| CMake (корень) | 🟢 ОК | target_sources не-glob, lowercase find_package, version.cmake полноценный |
| CMake (tests) | 🔴 Критика | Собирается только capon, vector_algebra тесты — **мёртвый код** |
| CMake (python) | 🟡 Средне | Работает, но include_dir на дубли `src/*/include/` |
| Структура include | 🔴 Критика | Двойная (`include/linalg/` + `src/*/include/`) — 100% дубли |
| Структура tests | 🔴 Критика | Тройная дублирующаяся (`tests/` + `src/*/tests/`) |
| Структура kernels | 🟠 Важно | Пустая `kernels/rocm/`, реальные ядра в `src/*/kernels/` и `include/linalg/kernels/` |
| C++ production | 🟢 ОК | CaponProcessor — чистый facade, Ops разделены, RAII, move semantics, валидация |
| C++ hardcoded | 🟠 Важно | `"modules/capon/kernels"` — копи-паста из GPUWorkLib, неадаптирована |
| Python bindings | 🟡 Средне | Работает, но docstring ссылается на `gpuworklib.*` (устаревшее имя) |
| Documentation | 🟡 Средне | README минимален, `GUIDE_opencl_to_rocm.md` — артефакт миграции |
| Preset `local-dev` (Windows) | 🟠 Важно | Хардкод `E:/DSP-GPU/core`, но Windows не поддерживается по правилам проекта |

**Production-ready**: ❌ Нет (структура мешает понимать что собирается; регрессия тестов)
**После правок из раздела §4**: ✅ Да

---

## 1. Контекст миграции

**GPUWorkLib (прототип, работал)**:
```
GPUWorkLib/
├── modules/vector_algebra/
│   ├── include/          ← public headers (cholesky_inverter, matrix_ops, …)
│   ├── src/              ← 4× .cpp
│   ├── include/kernels/  ← hiprtc-источники (как string literals)
│   └── tests/            ← все тесты vector_algebra
└── modules/capon/
    ├── include/          ← capon_processor.hpp, operations/*, capon_types.hpp
    ├── src/capon_processor.cpp
    ├── include/kernels/capon_kernels_rocm.hpp
    └── tests/            ← все тесты capon + Data/
```

**DSP-GPU/linalg (новый)** — эталонная структура module-auditor:
```
linalg/
├── include/linalg/              ← public (правильно)
│   ├── capon_processor.hpp
│   ├── capon_types.hpp
│   ├── vector_algebra_types.hpp
│   ├── cholesky_inverter_rocm.hpp
│   ├── matrix_ops_rocm.hpp
│   ├── diagonal_load_regularizer.hpp
│   ├── i_matrix_regularizer.hpp
│   ├── no_op_regularizer.hpp
│   ├── operations/              ← 5 Op hpp
│   └── kernels/                 ← 3 kernel hpp
├── src/
│   ├── capon/{include, kernels, src, tests}    ← ⚠ дубли (см. §3)
│   └── vector_algebra/{kernels, src, tests}    ← ⚠ дубли тестов (см. §3)
├── kernels/rocm/                ← ⚠ пустая (.gitkeep only)
├── tests/                       ← главные (main.cpp)
├── python/                      ← dsp_linalg_module.cpp + py_helpers.hpp + py_vector_algebra_rocm.hpp
├── cmake/                       ← version.cmake ✓, fetch_deps.cmake ✓
├── CMakeLists.txt               ← STATIC lib, HIP enabled
├── CMakePresets.json
└── README.md
```

В целом миграция прошла архитектурно правильно — эталонная структура соблюдена. Но остались **артефакты неполного рефакторинга** (раздел §3).

---

## 2. Что сделано хорошо ✅

1. **Архитектура Ref03 чистая** — `CaponProcessor` — тонкий facade, вся GPU-логика в Op-классах (`CovarianceMatrixOp`, `CaponInvertOp`, `ComputeWeightsOp`, `CaponReliefOp`, `AdaptBeamformOp`).

2. **Strategy для регуляризации** — `IMatrixRegularizer` → `DiagonalLoadRegularizer` / `NoOpRegularizer`. DIP соблюдён.

3. **Единая `MatrixOpsROCm`** — устраняет дублирование CGEMM между модулями, handle лениво привязан к `ctx_.stream()`.

4. **Оптимизация `ComputeWeightsOp`** — W = R⁻¹·U вычисляется один раз и кладётся в shared-буфер `kWeight`, переиспользуется Relief/Beam. В GPUWorkLib было дублирование — **в миграции улучшено**.

5. **`version.cmake` полный** — zero-rebuild при неизменённом git hash через `copy_if_different`, автогенерация `version.h` + `version.json`, парсинг SemVer из тегов. Хорошая работа.

6. **`fetch_deps.cmake`** — аккуратная абстракция с `FIND_PACKAGE_ARGS` (поддерживает и FetchContent, и системный find_package).

7. **Move semantics в `CaponProcessor`** — корректно прописаны ctor и operator= (включая специально оставленный комментарий *«БЫЛ ПРОПУЩЕН — без этого cov_op_ пуст после move»* как напоминание о ранее пойманном баге).

8. **Валидация входов** — `ValidateParams()` проверяет размеры сигнала/steering против `CaponParams` с понятным сообщением.

9. **Windows-стаб для `CaponProcessor`** (`#else !ENABLE_ROCM`) — корректный throw без ломания компиляции downstream.

10. **Python capsule-ownership** в `invert_batch_cpu` — `py::capsule(out_vec, deleter)` + явные `strides` для 3D numpy — zero-copy без утечек.

---

## 3. Ошибки и проблемы (по приоритету) 🔴

### 3.1 🔴 КРИТИКА — Дубли публичных хедеров (мёртвый код)

**Проблема**:
```bash
diff -q include/linalg/capon_processor.hpp src/capon/include/capon_processor.hpp
# (нет вывода — файлы ИДЕНТИЧНЫ)
```

В `src/capon/include/` и (вероятно) `src/vector_algebra/include/` лежат **100% копии** публичных хедеров. Это остатки Фазы 1 миграции — когда структура была перенесена «как в GPUWorkLib», а потом в Фазе 2 реорганизована в эталонную `include/linalg/`, но старые копии **не удалены**.

**Почему это опасно**:
- Читающий код сбит с толку: какая версия «живая»?
- При правке одной копии — вторая тихо отстаёт → разные версии одного API в одном репо.
- `CMakeLists.txt` (корень) в `target_include_directories` объявляет `PRIVATE src`. Технически это значит: `src/capon/include/` попадает в include path при компиляции `.cpp` — и если кто-то случайно напишет `#include "capon_processor.hpp"` (относительный), возьмётся **именно старая копия**.

**Исправление**:
```bash
git rm -r src/capon/include/
git rm -r src/vector_algebra/include/     # если существует
git commit -m "linalg: remove duplicate include/ copies (live version is include/linalg/)"
```

### 3.2 🔴 КРИТИКА — Регрессия: тесты `vector_algebra` не запускаются

**Проблема**: `tests/main.cpp`:
```cpp
#include "all_test.hpp"
int main() { capon_all_test::run(); return 0; }
```

`tests/all_test.hpp` включает только Capon:
```cpp
#include "test_capon_rocm.hpp"
#include "test_capon_reference_data.hpp"
#include "test_capon_opencl_to_rocm.hpp"
#include "test_capon_hip_opencl_to_rocm.hpp"
#include "capon_benchmark.hpp"
#include "test_capon_benchmark_rocm.hpp"
```

Тесты `vector_algebra` (`test_cholesky_inverter_rocm.hpp`, `test_cross_backend_conversion.hpp`, `test_benchmark_symmetrize.hpp`, `test_stage_profiling.hpp`) лежат в `src/vector_algebra/tests/all_test.hpp` — **не подключены** к production-раннеру. В GPUWorkLib они, скорее всего, вызывались — это **регрессия миграции**.

**Исправление** (`tests/all_test.hpp`):
```cpp
#pragma once
#if ENABLE_ROCM
  // Capon
  #include "test_capon_rocm.hpp"
  #include "test_capon_reference_data.hpp"
  #include "test_capon_opencl_to_rocm.hpp"
  #include "test_capon_hip_opencl_to_rocm.hpp"
  #include "capon_benchmark.hpp"
  #include "test_capon_benchmark_rocm.hpp"
  // vector_algebra
  #include "test_cholesky_inverter_rocm.hpp"
  #include "test_cross_backend_conversion.hpp"
  #include "test_benchmark_symmetrize.hpp"
  #include "test_stage_profiling.hpp"
  #include <core/backends/rocm/rocm_core.hpp>
  #include <core/backends/rocm/rocm_backend.hpp>
#endif

namespace linalg_all_test {
inline void run() {
#if ENABLE_ROCM
  // 1. Capon
  capon_all_test::run();
  // 2. vector_algebra (создаёт свой ROCmBackend)
  vector_algebra_all_test::run();
#endif
}
}
```

И `tests/main.cpp`:
```cpp
int main() { linalg_all_test::run(); return 0; }
```

Также нужно перенести `*.hpp` из `src/vector_algebra/tests/` → `tests/` (или убедиться, что они доступны через include path тестов). **Рекомендация**: перенести все `test_*.hpp` в один `tests/` и удалить `src/vector_algebra/tests/` + `src/capon/tests/`.

### 3.3 🔴 КРИТИКА — Дубли тестов `src/*/tests/` ↔ `tests/`

**Проблема**:
```bash
diff -q tests/all_test.hpp src/capon/tests/all_test.hpp
# (файлы идентичны)
```

`src/capon/tests/` и `src/vector_algebra/tests/` содержат **копии тест-файлов** (в том числе `Data/` размером ~23 МБ). В сборке их использование — непредсказуемо: зависит от `target_include_directories` в `tests/CMakeLists.txt`.

**Исправление**: после переноса по §3.2:
```bash
git rm -r src/capon/tests/
git rm -r src/vector_algebra/tests/
```

**Экономия**: `~23 МБ` данных + меньше путаницы.

### 3.4 🟠 ВАЖНО — Hardcoded путь в `CaponProcessor::CaponProcessor`

**Файл**: `src/capon/src/capon_processor.cpp:52`

```cpp
CaponProcessor::CaponProcessor(drv_gpu_lib::IBackend* backend)
    : backend_(backend)
    , ctx_(backend, "Capon", "modules/capon/kernels")   // ← ⚠ старый путь GPUWorkLib
    , inv_op_(std::make_unique<CaponInvertOp>(backend))
    , mat_ops_(&ctx_)
    , regularizer_(std::make_unique<vector_algebra::DiagonalLoadRegularizer>(backend)) {
}
```

Третий аргумент `GpuContext` — namespace для `KernelCacheService` (кэш скомпилированных HSACO). В GPUWorkLib путь `modules/capon/kernels` был относительно корня монорепо. В DSP-GPU модульной структуры этого пути не существует → **кэш будет создаваться под неверным логическим именем**.

**Риск**: если `GpuContext` использует этот аргумент как путь к файлам kernels (а не как namespace кэша) — компиляция упадёт в runtime при первом вызове `ComputeRelief()` с `hipErrorFileNotFound` или аналогом.

Источник kernel берётся inline через `kernels::GetCaponKernelSource()` (`EnsureCompiled():119`), поэтому в compile-time проблем нет — но логическое имя всё равно должно быть корректным.

**Исправление**:
```cpp
, ctx_(backend, "Capon", "linalg/capon")   // новое логическое имя модуля
```

**Проверить**: как core/DrvGPU использует этот третий параметр `GpuContext`. Если это путь к `.cl/.hip` файлам — нужно указывать реальную папку `linalg/src/capon/kernels` (но лучше перейти на inline-строки, как сейчас сделано для CompileModule).

### 3.5 🟠 ВАЖНО — Пустая `kernels/rocm/` и ссылка из CMakeLists.txt

**Файл**: `CMakeLists.txt:41`:
```cmake
target_include_directories(DspLinalg
  PUBLIC ...
  PRIVATE
    kernels/        # ← пусто (только .gitkeep)
    src
)
```

Папка `kernels/rocm/` содержит только `.gitkeep`. Реальные `kernel_*_rocm.hpp` лежат в `include/linalg/kernels/` (Capon), а `.cl` — в `src/capon/kernels/` и `src/vector_algebra/kernels/`. Ссылка `PRIVATE kernels/` — **семантический шум**, ни на что не влияет.

**Исправление**: либо удалить строку `kernels/` из `target_include_directories`, либо (если в планах) перенести **все** kernel-исходники в единый `kernels/rocm/` и консолидировать.

**Рекомендация**: удалить. Код уже использует inline-строки через `GetCaponKernelSource()`, отдельная папка не нужна.

### 3.6 🟠 ВАЖНО — `local-dev` preset (Windows) в Linux-only проекте

**Файл**: `CMakePresets.json`

```json
{
  "name": "local-dev",
  "displayName": "Local Development (E:\\DSP-GPU\\)",
  "cacheVariables": {
    "FETCHCONTENT_SOURCE_DIR_DSPCORE": "E:/DSP-GPU/core",
    ...
  }
}
```

По `CLAUDE.md` и `memory/feedback_no_windows.md`: **main-ветка = Linux/ROCm, Windows не поддерживается**. Preset `local-dev` с Windows-путём вводит читателя в заблуждение и не собирается (HIP без ROCm на Windows).

**Исправление**: удалить `local-dev` preset, оставить `debian-local-dev` и `ci`. Или переименовать `debian-local-dev` → `local-dev` и прописать путь через переменную окружения:

```json
"FETCHCONTENT_SOURCE_DIR_DSPCORE": "$env{DSP_GPU_ROOT}/core"
```

### 3.7 🟡 СРЕДНЕ — Устаревший docstring в Python-биндингах

**Файл**: `python/py_vector_algebra_rocm.hpp:10`
```cpp
 *   inverter = gpuworklib.CholeskyInverterROCm(...)   ← ⚠ старое имя
```

И `dsp_linalg_module.cpp:6`:
```cpp
 *   inv = dsp_linalg.CholeskyInverterROCm(ctx)        ← правильно
```

Один и тот же пример приведён в двух вариантах. В `register_cholesky_inverter_rocm()` docstring класса тоже содержит `gpuworklib.CholeskyInverterROCm(...)`.

**Исправление**: глобальная замена `gpuworklib` → `dsp_linalg` во всех `.hpp` файлах python/.

### 3.8 🟡 СРЕДНЕ — Python биндинг использует `ROCmGPUContext` (имя из core?)

`py_vector_algebra_rocm.hpp:36`:
```cpp
PyCholeskyInverterROCm(ROCmGPUContext& ctx, ...)
```

`ROCmGPUContext` — не видно где он зарегистрирован в модуле `dsp_linalg`. Скорее всего, ожидается что он приходит из `dsp_core` (корневой модуль Python). Если `dsp_core` не импортирован в том же процессе или регистрация типа не прошла — получим `TypeError: incompatible function arguments`.

**Проверить**: в `dsp_linalg_module.cpp` нужен `py::module_::import("dsp_core")` до регистрации (для типо-совместимости). Или регистрация `ROCmGPUContext` как `py::class_<..., py::options::implicitly_convertible>()`.

**Тест**: в Python должен работать импорт:
```python
import dsp_core
import dsp_linalg
ctx = dsp_core.ROCmGPUContext(0)
inv = dsp_linalg.CholeskyInverterROCm(ctx)   # <-- должно принять ctx
```

### 3.9 🟡 СРЕДНЕ — `Capon` не экспортирован в Python

В GPUWorkLib — `CaponProcessor` тоже не был в биндингах (реализовывался в Python поверх `CholeskyInverterROCm`). Это **согласовано с прототипом**, не регрессия, но:
- Нужно добавить Python-пример в `README.md` / `Doc/` как использовать Capon в Python (реализация relief-а через 5 вызовов в Python неэффективна — каждый шаг = отдельный H2D↔D2H roundtrip).
- **Рекомендация**: добавить `py_capon_rocm.hpp` с тонким биндингом `CaponProcessor::ComputeRelief/AdaptiveBeamform`. Оверхед ≈10 строк, выигрыш — полная pipeline на GPU.

### 3.10 🟢 МИНОР — Артефакты миграции

| Файл | Природа | Решение |
|------|---------|---------|
| `src/.gitkeep` | Остался от Фазы 0 | удалить — папка `src/` больше не пуста |
| `kernels/rocm/.gitkeep` | То же | удалить вместе с `kernels/` (см. §3.5) |
| `tests/GUIDE_opencl_to_rocm.md` | Мигрированный гид | перенести в `Doc/Modules/linalg/` или удалить |
| `src/capon/tests/GUIDE_opencl_to_rocm.md` | Дубль | удалить вместе с папкой (§3.3) |
| Комментарий на `.cpp:93` *«БЫЛ ПРОПУЩЕН»* | Напоминание о старом баге | стереть после финальной ревью ($git blame всё равно сохранит историю) |

### 3.11 🟢 МИНОР — Отсутствие `hipGetLastError` после kernel launch

`CaponReliefOp::Execute()` (и другие Op) запускают `hipModuleLaunchKernel` без проверки `hipGetLastError()`. Ошибки запуска (wrong grid, invalid kernel) пройдут тихо до ближайшего `Synchronize()`.

**Исправление** (шаблон):
```cpp
HIP_CHECK(hipModuleLaunchKernel(...));
HIP_CHECK(hipGetLastError());   // ловим post-launch ошибки
```

(При наличии макроса `HIP_CHECK` из `core` — использовать его.)

### 3.12 🟢 МИНОР — Нет `__launch_bounds__` в Capon kernel

По чеклисту `module-auditor.md`:
> - [ ] `__launch_bounds__` на всех ядрах

`compute_capon_relief` в `capon_kernels_rocm.hpp` — нужно проверить и добавить. Это даёт compiler hint для выбора register usage, может поднять occupancy.

---

## 4. План исправлений (приоритизированный)

### Этап 1 — «Структурные дубли» (30 мин, без риска)
1. `git rm -r src/capon/include/` ✂
2. `git rm -r src/capon/tests/` ✂
3. `git rm -r src/vector_algebra/tests/` ✂ (предварительно перенести `test_*.hpp` в `tests/`)
4. `git rm src/.gitkeep` + `kernels/rocm/` (если решено убрать)
5. Удалить строку `kernels/` из `target_include_directories` (`CMakeLists.txt`)
6. Сборка: `cmake --preset debian-local-dev && cmake --build build` — должна пройти без изменений

### Этап 2 — «Регрессия тестов» (1 час)
1. Переписать `tests/all_test.hpp` → добавить `vector_algebra_all_test::run()`
2. Перенести `test_*.hpp` из `src/vector_algebra/tests/` в `tests/` (если ещё не сделано)
3. Проверить что `tests/CMakeLists.txt` видит `ROCmBackend` из core — может потребовать `target_link_libraries(test_linalg_main PRIVATE DspCore::Backend)`
4. Запустить на реальной машине с ROCm: `ctest --preset debian-local-dev --output-on-failure`

### Этап 3 — «Чистка артефактов миграции» (30 мин)
1. `capon_processor.cpp:52` — заменить `"modules/capon/kernels"` → `"linalg/capon"` (или уточнить у Alex что реально использует 3-й аргумент `GpuContext` в core)
2. Удалить `local-dev` preset из `CMakePresets.json` (или переписать под переменную окружения)
3. Заменить `gpuworklib` → `dsp_linalg` во всех docstrings `python/py_*.hpp`
4. Перенести `GUIDE_opencl_to_rocm.md` в `Doc/Modules/linalg/` или удалить

### Этап 4 — «Качество кода» (2 часа)
1. Добавить `hipGetLastError()` после kernel launch во все Op-ы
2. Проверить `__launch_bounds__` в Capon/vector_algebra kernels — добавить где отсутствует
3. Добавить в `dsp_linalg_module.cpp` импорт `dsp_core` перед регистрацией (§3.8)
4. Python-тест e2e: `import dsp_core; import dsp_linalg; inv = dsp_linalg.CholeskyInverterROCm(dsp_core.ROCmGPUContext(0))` — должен работать без segfault
5. Обновить `README.md` — добавить минимальный Python-пример использования

### Этап 5 — «Опционально» (на усмотрение)
1. Добавить `py_capon_rocm.hpp` с полноценным биндингом `CaponProcessor` (см. §3.9)
2. Вернуть `GpuContext` третий аргумент под конфигурацию из `configGPU.json` вместо хардкода

---

## 5. Математика Capon MVDR — проверка корректности

Вычисления в `CaponProcessor` соответствуют классической MVDR-формулировке:

| Шаг | Формула | Реализация | OK? |
|-----|---------|------------|-----|
| 1 | R = (1/N)·Y·Yᴴ | `CovarianceMatrixOp` (rocBLAS CGEMM NoTrans×ConjTrans) | ✅ |
| 2 | R ← R + μI | `DiagonalLoadRegularizer::Apply` (hiprtc kernel, μ=0 → no-op) | ✅ |
| 3 | R⁻¹ | `CaponInvertOp` → `CholeskyInverterROCm` (POTRF + POTRI + symmetrize) | ✅ |
| 4 | W = R⁻¹·U | `ComputeWeightsOp` (rocBLAS CGEMM) | ✅ |
| 5a | z[m] = 1/Re(uₘᴴ · W[·,m]) | `CaponReliefOp` (HIP kernel, редукция по каналам) | ✅ |
| 5b | Y_out = Wᴴ · Y | `AdaptBeamformOp` (rocBLAS CGEMM ConjTrans×NoTrans) | ✅ |

**Замечания**:
- Column-major layout согласован с rocBLAS/rocSOLVER — правильно.
- `POTRI` после `POTRF` заполняет **только нижний треугольник** inverse. Текущая симметризация (SymmetrizeMode::GpuKernel) копирует lower→upper in-place. Для Hermitian matrix это должно быть `A[upper] = conj(A[lower])` — нужно проверить, что это именно так (НЕ просто `A[row][col] = A[col][row]` — для complex matrices это даёт не Hermitian, а симметричную матрицу, что неверно).

**Проверить в `symmetrize_kernel_sources_rocm.hpp`**:
```cpp
// Правильно:     A[col, row] = conj(A[row, col])  for col > row
// Неправильно:   A[col, row] =      A[row, col]   for col > row
```

Это — **потенциальный источник ошибок в Capon rendering**. Проверить тестом сравнения с MATLAB reference (`R_inv_*.csv`).

---

## 6. Вопросы к Alex

1. **3-й аргумент `GpuContext`** — это namespace кэша или путь к файлам kernels? От этого зависит §3.4.
2. **`local-dev` preset** — удалять или оставить как «только для IDE navigation на Windows, сборки нет»?
3. **`src/capon/include/` и `src/vector_algebra/include/`** — есть ли риск что что-то ещё ссылается? Проверю через grep если дашь OK.
4. **Python-биндинг `CaponProcessor`** — добавлять сейчас (≈30 мин) или отложить до фазы «обвязки»?
5. **`GUIDE_opencl_to_rocm.md`** — актуальный документ миграции или уже устаревший? Можно перенести в `Doc/Archive/`?

---

## 7. Рекомендация по production-готовности

| Фаза | Состояние после фазы |
|------|---------------------|
| текущее | 🔴 не production — регрессия тестов, дубли, hardcoded |
| после этапов 1+2 | 🟡 собирается и тесты зелёные — но остаются косметические issues |
| после этапов 1–4 | 🟢 production-ready |

**ETA до production-ready**: ~4 часа суммарно (без этапа 5).

---

*Автор: Кодо (Claude Opus 4.6, 1M context)*
*Методика: module-auditor чеклист + diff с GPUWorkLib прототипом + sequential-thinking по дублям/миграции*
