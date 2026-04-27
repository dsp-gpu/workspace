# TASK: Profiler v2 — снос legacy `GPUProfiler` + миграция ServiceManager

> **Дата создания**: 2026-04-27
> **Источник**: оценка scope 2026-04-27 (during E2/E3/E4 polish session)
> **Effort**: 3-4 часа
> **Scope**: `core/` + 1 место в `spectrum/`
> **Зависит от**: `core` зелёный после Phase E (E2+E3+E4 закрыты 2026-04-27)
> **Требует**: явный OK Alex на CMake-правку

---

## 🎯 Цель

Финально удалить `@deprecated GPUProfiler` из проекта. После Phase D (2026-04-23)
все benchmark-pipeline'ы переведены на `ProfilingFacade::BatchRecord`, но
**ServiceManager** и пара legacy-мест остались.

Когда задача закрыта — singleton `GPUProfiler` исчезает, `ProfilingFacade`
становится единственной точкой профилирования (правило `06-profiling.md`).

---

## 📋 Что трогаем

### 🔴 Удалить файлы

| Файл | LOC | Почему |
|------|----:|--------|
| `core/include/core/services/gpu_profiler.hpp` | ~250 | Legacy singleton |
| `core/src/services/gpu_profiler.cpp` | ~600 | Реализация Legacy |
| `core/include/core/services/gpu_benchmark_base.hpp` | ~290 | Сирота, использует только `GPUProfiler::GetInstance` (15 мест) |
| `core/tests/test_gpu_profiler.hpp` | 262 | Тест legacy API |
| `core/tests/test_gpu_profiler_baseline.hpp` | 72 | Baseline-замер legacy |

### 🟡 Edit (миграция на `ProfilingFacade`)

| Файл | Что | Сложность |
|------|-----|:---------:|
| `core/include/core/services/service_manager.hpp` | 10 мест: `Start/Stop/SetEnabled/ExportJSON/PrintSummary` обёртки переключить на `ProfilingFacade::GetInstance()` | 🟡 средне |
| `core/tests/test_services.hpp` | `GPUProfiler::Record` → `ProfilingFacade::Record` (или удалить тест если он именно legacy) | 🟢 просто |
| `core/tests/main.cpp` | убрать `#include test_gpu_profiler_baseline.hpp` + вызов | 🟢 1 строка |
| `core/tests/all_test.hpp` | убрать `test_gpu_profiler.hpp` include + `test_gpu_profiler::run()` | 🟢 1 строка |
| `spectrum/src/fft_func/src/fft_processor_rocm.cpp:693` | `GPUProfiler::GetStats()` — переписать через `ProfilingFacade::GetSnapshot()` или удалить (использовался для PrintSummary) | 🟡 средне |
| `core/python/dsp_core_module.cpp:69` | комментарий про `CL_QUEUE_PROFILING_ENABLE` — обновить (косметика) | 🟢 косметика |
| `core/CMakeLists.txt:56` | удалить `src/services/gpu_profiler.cpp` из source-list | 🔴 **ТРЕБУЕТ OK Alex** |
| `core/CMakeLists.txt:71` | удалить комментарий про `#include <core/services/gpu_profiler.hpp>` | 🟢 1 строка |
| `core/CLAUDE.md` | удалить упоминание `@deprecated GPUProfiler` — оно больше неактуально | 🟢 косметика |

### 🟢 Косметика (комментарии в benchmark-файлах)

В spectrum/stats/SG/heterodyne/linalg есть `*_benchmark_rocm.hpp` с **комментариями**
вида «→ GPUProfiler» или «через GPUProfiler». Сами вызовы уже мигрированы — это
просто текст в /* doxygen */ блоках. Заменить на «→ ProfilingFacade» — поиск-замена.
Не блокирующее, но красиво.

```bash
# Подсчитать места:
grep -rln "GPUProfiler" spectrum/ stats/ signal_generators/ heterodyne/ linalg/ \
  | grep -v ".git" | grep -v "build/" | grep -v "/Logs/" | grep -v "/Doc/"
```

---

## 🚦 Порядок выполнения

1. **Просмотр зависимостей**:
   ```bash
   grep -rn "GPUProfiler\|gpu_profiler" core/ spectrum/ stats/ signal_generators/ \
     heterodyne/ linalg/ radar/ strategies/ DSP/ --include="*.hpp" --include="*.cpp" \
     --include="*.h" --include="*.hip" | grep -v "build/" | grep -v ".git/" | grep -v "/Logs/"
   ```

2. **Миграция ServiceManager** (`service_manager.hpp` — header-only, чистая правка):
   - `GPUProfiler::GetInstance().SetGPUEnabled(...)` → `ProfilingFacade::GetInstance().SetGpuInfo(...)` *(уточнить API: enable per-GPU есть в Facade?)*
   - `GPUProfiler::GetInstance().Start/Stop()` → удалить (Facade async-worker сам стартует)
   - `GPUProfiler::GetInstance().ExportJSON(path)` → `ProfilingFacade::GetInstance().Export(JsonExporter, path)` или `ExportJsonAndMarkdown(...)`
   - `GPUProfiler::GetInstance().PrintSummary()` → `ProfilingFacade::GetInstance().PrintReport()`
   - `GPUProfiler::GetInstance().GetProcessedCount()` → удалить или заменить на `GetSnapshot()` size

3. **Миграция spectrum/fft_processor_rocm.cpp:693**:
   ```cpp
   // ДО:
   auto stats = drv_gpu_lib::GPUProfiler::GetInstance().GetStats(gpu_id);
   // ПОСЛЕ — варианты:
   //   (a) удалить весь блок если он использовался только для отладочного PrintSummary
   //   (b) auto snap = ProfilingFacade::GetInstance().GetSnapshot();  + ComputeSummary
   ```
   Сначала **прочитать контекст** строки 693 — может это вообще dead code после Phase D.

4. **Удалить `gpu_benchmark_base.hpp`** — сирота, не используется никем.

5. **Удалить test_gpu_profiler.hpp + test_gpu_profiler_baseline.hpp + ссылки**.

6. **Удалить gpu_profiler.{hpp,cpp}** — после того как все ссылки сняты.

7. **CMake-правка** (`core/CMakeLists.txt:56` — удалить `src/services/gpu_profiler.cpp`):
   - **СТОП** — показать Alex DIFF: `git diff core/CMakeLists.txt`.
   - Только после явного «OK» — `git add` + commit.

8. **Сборка + прогон тестов** (87 → должны остаться 85, минус 2 теста legacy):
   ```bash
   cmake --build core/build --target test_core_main
   ./core/build/tests/test_core_main 2>&1 | grep -cE "\[PASS\]|\[FAIL\]"
   ```

9. **Сборка зависимых репо** (так как `core/CMakeLists.txt` изменён):
   ```bash
   for r in spectrum stats signal_generators heterodyne linalg strategies radar DSP; do
     cmake --build $r/build 2>&1 | tail -3
   done
   ```
   Если хоть один упал на «`undefined reference to drv_gpu_lib::GPUProfiler`» — найти место → миграция на Facade.

---

## ✅ Acceptance Criteria

| # | Критерий | Проверка |
|---|----------|----------|
| 1 | Файлы `gpu_profiler.{hpp,cpp}` удалены | `ls core/include/core/services/gpu_profiler.hpp 2>&1 \| grep "No such"` |
| 2 | `gpu_benchmark_base.hpp` удалён | `ls core/include/core/services/gpu_benchmark_base.hpp 2>&1 \| grep "No such"` |
| 3 | Нет ссылок `GPUProfiler` в коде | `grep -rn "GPUProfiler" --include="*.{hpp,cpp,hip}" \| grep -v "/Doc/" \| grep -v "/Logs/"` пусто |
| 4 | `test_core_main` зелёный | 85 PASS / 0 FAIL (минус 2 legacy теста) |
| 5 | Все 7 dep-репо собираются | без `undefined reference` ошибок |
| 6 | Doc обновлён | `core/CLAUDE.md` без `@deprecated GPUProfiler`; `06-profiling.md` тоже актуализирован |

---

## 🚫 Не входит в эту задачу

- **`Doc/Services/Profiling/Full.md`** — отдельный E5/E8.5 docs-таск (можно дома).
- **roctracer integration** — Q7 спеки, отдельный backlog.
- **Снос упоминаний `GPUProfiler` в комментариях бенчмарков** — желательно, но не блокирует.

---

## 📞 Когда спрашивать Alex

- **Обязательно**: `core/CMakeLists.txt:56` правка (удаление source-line).
- **Желательно**: если `service_manager.hpp` Public API ломается → согласовать (downstream код может инициализировать через ServiceManager).
- **Не нужно**: при чистке комментариев / тестов / dead code.

---

*Created: 2026-04-27 by Кодо. Owner: следующая Debian+GPU сессия.*
