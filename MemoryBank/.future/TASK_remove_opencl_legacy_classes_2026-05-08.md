# TASK — миграция legacy OpenCL классов в spectrum + signal_generators

> **Создан**: 2026-05-08 (по итогам OpenCL inventory)
> **Приоритет**: MEDIUM · **Эффорт**: ~2-4 ч · **Платформа**: Debian (рекомендуется) или Windows
> **Зависимости**: none
> **Связанный**: [TASK_remove_opencl_pybind_2026-05-06.md](TASK_remove_opencl_pybind_2026-05-06.md)
>   (закрыт частично — Часть A `py_filters.hpp` удалён 2026-05-08)

## 🎯 Цель

Удалить **5 legacy OpenCL классов** в spectrum + signal_generators которые имеют parallel `*_rocm.hpp`
ROCm-версии. Мигрировать все include'ы и обновить документацию.

**Политика OpenCL** (от Alex 2026-05-08): OpenCL остаётся **только** для interop
(совместная работа с памятью OpenCL ↔ ROCm: ZeroCopy, dma-buf, void* нейтральные API,
учебные примеры связки). **Pure OpenCL код для вычислений — удалить**.

## 📋 5 классов под удаление

| # | Старый OpenCL файл | ROCm замена | Где используется legacy |
|---|--------------------|-------------|-------------------------|
| 1 | `spectrum/include/spectrum/lch_farrow.hpp` | `lch_farrow_rocm.hpp` | `signal_generators/...delayed_form_signal_generator.hpp:48` + Doc |
| 2 | `signal_generators/include/.../cw_generator.hpp` | `cw_generator_rocm.hpp` | `signal_service.hpp`, `signal_generator_factory.cpp` |
| 3 | `signal_generators/include/.../form_script_generator.hpp` | `form_script_generator_rocm.hpp` | проверить |
| 4 | `signal_generators/include/.../delayed_form_signal_generator.hpp` | `_rocm` версия есть | проверить |
| 5 | `signal_generators/include/.../form_signal_generator.hpp` | `_rocm` версия есть | проверить |

Соответствующие `.cpp` файлы реализаций — удалить вместе с заголовками.

## ✅ Что НЕ трогать (legitimate interop)

- `core/` — основная инфраструктура interop (ZeroCopyBridge и т.п.)
- `linalg/cholesky_inverter_rocm.{hpp,cpp}` — `Invert(InputData<cl_mem>&)` через ZeroCopy dma-buf
- `linalg/tests/test_capon_hip_opencl_to_rocm.hpp` — interop тест
- `heterodyne/i_heterodyne_processor.hpp` — `void* rx_cl_mem` (нейтральный API)
- `heterodyne/python/py_heterodyne.hpp` — interop через void*
- Любые **примеры** ROCm↔OpenCL стыковки памяти

## 📋 Шаги

### 1. Подготовка (15 мин)
- [ ] Прочитать `*_rocm.hpp` версии — убедиться что API совместим
- [ ] Если API расходится — задокументировать что меняется в каждом callsite

### 2. Миграция include'ов в `signal_generators` (~1 ч)

```bash
# найти все callsites
grep -rn 'include.*"signal_generators/generators/cw_generator\.hpp"\|include.*<signal_generators/generators/cw_generator\.hpp>' \
  --include="*.hpp" --include="*.cpp" /e/DSP-GPU/

# заменить на _rocm версии
# Файлы которые знаем:
#   signal_generators/include/signal_generators/signal_service.hpp:55
#   signal_generators/src/signal_generators/src/signal_generator_factory.cpp:10
```

Аналогично для `lch_farrow.hpp`, `form_script_generator.hpp`, `delayed_form_signal_generator.hpp`,
`form_signal_generator.hpp`.

### 3. Удаление legacy .hpp/.cpp (15 мин)

После миграции include'ов — удалить файлы:
- `spectrum/include/spectrum/lch_farrow.hpp` + `spectrum/src/.../lch_farrow.cpp`
- `signal_generators/include/.../cw_generator.hpp` + `cw_generator.cpp`
- `signal_generators/include/.../form_script_generator.hpp` + `.cpp`
- `signal_generators/include/.../delayed_form_signal_generator.hpp` + `.cpp`
- `signal_generators/include/.../form_signal_generator.hpp` + `.cpp`

Проверить что `target_sources()` в CMake — обновляется автоматически или требует правки.

### 4. CMake (только если нужно)

⚠️ **Не править CMake без явного OK Alex** (правило `12-cmake-build.md`).
Если файлы перечислены в `target_sources()` — снять с них упоминания после согласования.

### 5. Обновление документации (~30 мин)

Файлы для обновления:
- `spectrum/Doc/API.md` — секция «Python API (OpenCL)» (строки ~1223-...) — переписать под ROCm версии
- `spectrum/Doc/filters_API.md` — секция «Python API (OpenCL)» (~582-...) — переписать
- `spectrum/Doc/lch_farrow_API.md` — заменить `lch_farrow.hpp` → `lch_farrow_rocm.hpp`
- `spectrum/Doc/Full.md:2573` — заменить include путь
- `DSP/Doc/Modules/lch_farrow/{API,Full,Quick}.md` — заменить include
- `DSP/Doc/Modules/lch_farrow/API.md:14,231` — заменить include

### 6. Сборка + тесты (15 мин на Debian)

```bash
cmake --preset debian-local-dev
cmake --build build/debian-local-dev --target dsp_spectrum dsp_signal_generators
# C++ тесты:
./build/debian-local-dev/spectrum/tests/spectrum_tests
./build/debian-local-dev/signal_generators/tests/signal_generators_tests
# Python тесты:
python3 DSP/Python/spectrum/t_*.py
python3 DSP/Python/signal_generators/t_*.py
```

### 7. Commit + push (5 мин, по OK Alex)

```
spectrum + signal_generators: remove legacy OpenCL classes (5 classes)

Migrated include sites to *_rocm.hpp parallel versions, removed:
- spectrum/lch_farrow.{hpp,cpp}
- signal_generators/{cw,form_script,delayed_form_signal,form_signal}_generator.{hpp,cpp}

OpenCL preserved for interop (ZeroCopy, dma-buf, void* APIs) per OpenCL policy 2026-05-08.
```

## DoD

- [ ] 5 legacy OpenCL классов удалены (10 файлов: 5 .hpp + 5 .cpp)
- [ ] Все callsites мигрированы на `*_rocm.hpp` версии
- [ ] Сборка `dsp_spectrum` + `dsp_signal_generators` зелёная (Debian)
- [ ] C++ тесты spectrum + signal_generators — PASS
- [ ] Python тесты `DSP/Python/spectrum/`, `DSP/Python/signal_generators/` — PASS
- [ ] Документация обновлена (~6-8 markdown файлов)
- [ ] OpenCL policy в memory `project_opencl_policy.md` — соблюдена
- [ ] Commit + push (по OK Alex)

## Точки опоры

- Memory: `project_opencl_policy.md` (OpenCL policy)
- TASK предшественник: `TASK_remove_opencl_pybind_2026-05-06.md`
- Сессия с inventory: `MemoryBank/sessions/2026-05-08.md`
- Правило: `.claude/rules/09-rocm-only.md`
