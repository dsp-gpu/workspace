# TASK_remove_opencl_pybind — удалить ВСЕ остатки OpenCL в DSP-GPU

> **Статус**: pending · **Приоритет**: HIGH · **Время**: ~2-3 ч · **Зависимости**: none
> **Создан**: 2026-05-06 (по итогам TASK_RAG_02.6)
>
> Расширен 2026-05-06: scope теперь включает **прямые вызовы OpenCL API**
> (`cl_mem`, `clCreateBuffer`, `clEnqueueWriteBuffer`, `clReleaseMemObject`,
> и т.п.) везде в проекте, а не только pybind. Правило 09-rocm-only.md —
> OpenCL запрещён для вычислений; разрешён только для interop со сторонним
> кодом (стыковка данных на GPU без вычислений).

## Цель

Убрать из C++ кода, pybind-биндингов и тестов **ВСЕ** остатки OpenCL:

### A. Pybind-биндинги (выявлены в TASK_RAG_02.6)
Экспортируются в Python, но не имеют реальных C++ классов в DSP-GPU:

| pybind py_class | py_module | wrapper | C++ класс в `include/` |
|---|---|---|:---:|
| `FirFilter` | `dsp_spectrum` | `PyFirFilter` | ❌ удалён в миграции |
| `IirFilter` | `dsp_spectrum` | `PyIirFilter` | ❌ удалён в миграции |

Реально живые ROCm-аналоги: `FirFilterROCm`, `IirFilterROCm` — остаются.

### B. Прямые вызовы OpenCL API в C++ коде

Любые `cl_mem`, `clCreateBuffer`, `clEnqueueWriteBuffer`, `clEnqueueReadBuffer`,
`clReleaseMemObject`, `clCreateKernel`, `cl_command_queue`, `cl_context`, и т.п.
— ЗАПРЕЩЕНЫ для вычислений. Заменить на ROCm/HIP эквиваленты или удалить
(если код был только для legacy OpenCL backend'а).

**Поиск**:
```bash
grep -rn "cl_mem\|clCreate\|clEnqueue\|clRelease\|cl_command_queue\|cl_context\|cl_kernel" \
     --include="*.hpp" --include="*.cpp" --include="*.h" \
     core/ spectrum/ stats/ signal_generators/ heterodyne/ linalg/ radar/ strategies/ DSP/ \
     | grep -v "interop\|Interop"
```

### C. OpenCL backend / context классы (если остались)

`OpenCLBackend`, `OpenCLContext`, `OpenCLGPUContext` и любые их helper'ы —
deprecated. ROCm — единственный backend.

### D. Тесты с OpenCL

`tests/*.hpp` / `Python/*.py` файлы которые исполняют OpenCL-путь — удалить
или переписать на ROCm. Файлы помеченные `_OpenCL_` в имени уже отфильтрованы
RAG-индексером, но физически могут лежать в репо.

Нарушаемое правило: [`09-rocm-only.md`](../../.claude/rules/09-rocm-only.md) —
«OpenCL runtime для вычислений запрещён, только interop».

## Что удалить

### 1. `spectrum/python/py_filters.hpp` — целиком

Содержит:
- `class PyFirFilter` (использует `cl_mem`, `clCreateBuffer`, `CL_MEM_COPY_HOST_PTR`)
- `class PyIirFilter` (то же)
- `register_fir_filter(m)` / `register_iir_filter(m)`

Файл имеет hardcoded OpenCL вызовы — без ROCm-эквивалента.

### 2. `spectrum/python/dsp_spectrum_module.cpp` — секция #if !ENABLE_ROCM

Удалить:
- `#include "py_filters.hpp"` (если присутствует за `#if ENABLE_ROCM` — оставить только `py_filters_rocm.hpp`).
- `register_fir_filter(m);` / `register_iir_filter(m);` вызовы.

### 3. Заголовки в `spectrum/include/spectrum/filters/`

Если ещё остались `fir_filter.hpp` / `iir_filter.hpp` (без `_rocm` суффикса) —
удалить или пометить `@deprecated`. Проверить через `grep -r "class FirFilter[^R]"
spectrum/`.

### 4. Тесты

Удалить любые `tests/*.hpp` которые ссылаются на OpenCL `FirFilter` без `ROCm`.
Сохранить `tests/test_fir_filter_rocm*.hpp` и benchmark-файлы под ROCm.

### 5. CMake

В `spectrum/python/CMakeLists.txt` и `spectrum/src/CMakeLists.txt` —
удалить ссылки на удалённые файлы.

## Что оставить

- `FirFilterROCm` / `IirFilterROCm` (`spectrum/python/py_filters_rocm.hpp`).
- `MovingAverageFilterROCm`, `KalmanFilterROCm`, `KaufmanFilterROCm`
  (`py_filters_adaptive_rocm.hpp`).

## Шаги реализации

1. ✅ Найти все упоминания OpenCL FirFilter/IirFilter:
   ```bash
   grep -rn "PyFirFilter\b\|PyIirFilter\b\|FirFilter[^R]\|IirFilter[^R]" \
        spectrum/include spectrum/src spectrum/python \
        | grep -v "ROCm\|_rocm"
   ```
2. ✅ Снять include `py_filters.hpp` из `dsp_spectrum_module.cpp`.
3. ✅ Удалить `register_fir_filter` / `register_iir_filter` calls.
4. ✅ `git rm spectrum/python/py_filters.hpp`.
5. ✅ Если `class FirFilter` / `class IirFilter` остались в `spectrum/include/` —
   `git rm` или `@deprecated`.
6. ✅ Пересобрать: `cmake --preset debian-local-dev && cmake --build build --target dsp_spectrum`.
7. ✅ Прогнать Python-тесты `DSP/Python/spectrum/t_fir_filter_rocm.py`,
   `t_iir_filter_rocm.py` — должны пройти (используют ROCm-варианты).
8. ✅ Перезапустить `dsp-asst rag python bindings` — должно стать **29 → 31**
   pybind классов с cpp_symbol_id (FirFilter/IirFilter уйдут совсем).

## Definition of Done

### Pybind (часть A)
- [ ] `git grep "PyFirFilter\|PyIirFilter"` → пусто (если оставлены `_ROCm`-версии)
- [ ] `class FirFilter[^R]` / `class IirFilter[^R]` отсутствуют в `spectrum/include/`
- [ ] `dsp_spectrum_module.cpp` собирается без `py_filters.hpp`
- [ ] Python-тесты `t_fir_filter_rocm.py` / `t_iir_filter_rocm.py` зелёные
- [ ] `dsp-asst rag python bindings` → 29 классов (вместо 31), все с cpp_symbol_id

### OpenCL API (часть B)
- [ ] `git grep "cl_mem\|clCreate\|clEnqueue\|clRelease"` в C++ исходниках → пусто
      (или только в `interop/` модуле с явным комментарием).
- [ ] `cl_command_queue` / `cl_context` / `cl_kernel` → пусто.
- [ ] Никакой `#include <CL/cl.h>` / `#include <OpenCL/opencl.h>` в C++ исходниках.
- [ ] CMake: убраны `find_package(OpenCL)` / `target_link_libraries(... OpenCL::OpenCL)`
      везде кроме interop-модуля (если он есть).

### OpenCL backend (часть C)
- [ ] `git grep "class OpenCL"` → пусто.
- [ ] `enum class GPUBackend` (если есть) — удалён вариант `OpenCL` (см. парный
      `TASK_remove_opencl_enum_2026-05-05.md`).

### Тесты (часть D)
- [ ] Файлы `*_OpenCL_*.cpp` / `*_OpenCL_*.hpp` / `t_*_OpenCL_*.py` удалены или
      переписаны.

### Сборка / тесты
- [ ] `cmake --preset debian-local-dev` → конфигурируется без OpenCL.
- [ ] `cmake --build build` → собирается все 9 репо.
- [ ] Все Python-тесты в `DSP/Python/**/t_*.py` зелёные (на Debian + ROCm).

## Связано с

- Правило: `.claude/rules/09-rocm-only.md`
- Создан в результате: TASK_RAG_02.6 (cpp_symbol_id resolution выявил orphans)
- Похожая задача: `TASK_remove_opencl_enum_2026-05-05.md` (если существует — синхронизировать)
