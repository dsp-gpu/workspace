# TASK Phase A: Branch + Remove OpenCL from GPUProfiler

> **Prerequisites**: читать `TASK_Profiler_v2_INDEX.md` и разделы 11-12 спеки `GPUProfiler_Rewrite_Proposal_2026-04-16.md`
> **Effort**: 2-3 часа
> **Scope**: только `core/`
> **Depends**: — (первая задача)

---

## 🎯 Цель

Создать ветку `new_profiler` в `core/`, зафиксировать baseline performance, удалить всё OpenCL-specific из профайлера.
**OpenCL НЕ удаляется целиком** — `backends/opencl/` папка с IMemoryBuffer остаётся (см. спека 12.2).

---

## 📋 Шаги

### A0. Создать ветку

```bash
cd E:/DSP-GPU/core
git status                            # должно быть чисто (на main)
git checkout -b new_profiler
git push -u origin new_profiler       # ⚠️ после OK от Alex
```

**⚠️ Сам push НЕ делай без OK Alex** — создай локально и сообщи.

---

### A0.5. Baseline performance measurement (R2 из ревью)

Перед любыми изменениями — замерить текущий `Record()` latency как референс:

```bash
cd E:/DSP-GPU/core
cmake --preset debian-local-dev
cmake --build build --target core_unit_tests
ctest --test-dir build -R test_gpu_profiler --output-on-failure
```

Записать цифры в `MemoryBank/sessions/profiler_v2_baseline_2026-04-17.md`:
- `GPUProfiler::Record()` min/avg/max latency (если тест их измеряет)
- `GPUProfiler::ExportJSON()` wall-clock time на reference payload
- Размер `libcore.so` до изменений

Если в текущих тестах нет measurement — добавь microbench в `tests/test_gpu_profiler_baseline.hpp`:

```cpp
TEST(GpuProfiler_Baseline) {
    auto& prof = GPUProfiler::GetInstance();
    prof.Enable(true);
    const int N = 10000;
    auto start = std::chrono::steady_clock::now();
    for (int i = 0; i < N; ++i) {
        ROCmProfilingData data{};
        data.start_ns = i * 1000;
        data.end_ns   = data.start_ns + 500;
        prof.Record(0, "baseline_test", "op", data);
    }
    prof.WaitEmpty();
    auto elapsed = std::chrono::steady_clock::now() - start;
    auto us_per_record = std::chrono::duration_cast<std::chrono::nanoseconds>(elapsed).count() / (1000.0 * N);
    std::cout << "Baseline: " << us_per_record << " us/Record()\n";
}
```

**Acceptance**: цифры записаны в session-файл.

---

### A1. Удалить OpenCLProfilingData + ProfilingTimeVariant

**Файл**: `core/include/core/services/profiling_types.hpp`

Что удалить (опираясь на спека 12.1):
- `struct OpenCLProfilingData` (строка ~54)
- `using ProfilingTimeVariant = std::variant<...>` (строка ~86)
- `inline ProfilingTimeVariant MakeOpenCLFromDurationMs(...)` (строки ~99-105)

**Что НЕ трогать**:
- `struct ProfilingDataBase`
- `struct ROCmProfilingData`
- `struct GPUReportInfo`

**Add**:
```cpp
/// Helper for tests — creates ROCmProfilingData from duration (replaces MakeOpenCLFromDurationMs)
/// Semantics: queued → submit → start → end → complete, последовательная цепочка.
/// Избегает отрицательных Submit/CompleteDelay в юнит-тестах.
inline ROCmProfilingData MakeRocmFromDurationMs(double duration_ms) {
    ROCmProfilingData d{};
    d.queued_ns   = 0;
    d.submit_ns   = 0;
    d.start_ns    = 0;
    d.end_ns      = static_cast<uint64_t>(duration_ms * 1e6);
    d.complete_ns = d.end_ns;
    return d;
}
```

**Убрать include** `<variant>` из profiling_types.hpp если больше не нужен.

---

### A2. Упростить GPUProfiler::Record — только ROCm

**Файл**: `core/include/core/services/gpu_profiler.hpp`

Удалить overload:
```cpp
// УДАЛИТЬ:
void Record(int gpu_id, const std::string& module_name,
            const std::string& event_name,
            const OpenCLProfilingData& data);
```

Оставить ТОЛЬКО ROCm-версию:
```cpp
void Record(int gpu_id, const std::string& module_name,
            const std::string& event_name,
            const ROCmProfilingData& data);
```

**Файл**: `core/src/services/gpu_profiler.cpp`

Удалить реализацию OpenCL overload и упростить `ProcessMessage`:
- Убрать `std::visit` (строки ~517-524)
- Удалить `is_rocm_module` branching (строки ~244, 246, 311)
- Удалить OpenCL-таблицу из `PrintReport()` (строки ~311-351)
- Оставить ТОЛЬКО ROCm code path

---

### A3. Удалить has_rocm_data

**Файл**: `core/include/core/services/profiling_stats.hpp`

Удалить поле `bool has_rocm_data` из `EventStats` (строка ~116) и все его использования в `gpu_profiler.cpp`.

**Обоснование**: теперь все данные ROCm — флаг не нужен.

---

### A4. Удалить opencl_profiling.hpp/.cpp (из profiler)

Удалить из `core/`:
- `core/include/core/backends/opencl/opencl_profiling.hpp`
- `core/src/backends/opencl/opencl_profiling.cpp`

**⚠️ Проверить `core/src/CMakeLists.txt`**: удалить эти файлы из `target_sources()`.
**Это разрешённая правка CMake** (удаление файлов из target_sources — "очевидная правка" по CLAUDE.md).

**Grep**: убедиться что `#include "opencl_profiling.hpp"` или `FillOpenCLProfilingData` не встречаются нигде:
```bash
cd E:/DSP-GPU/core
grep -rn "opencl_profiling" include/ src/ tests/
grep -rn "FillOpenCLProfilingData" include/ src/ tests/
```
Результат должен быть пустым. Если есть — удалить/заменить.

---

### A5. Убрать RecordEvent(cl_event) из GpuBenchmarkBase

**Файл**: `core/include/core/services/gpu_benchmark_base.hpp`

Удалить метод (строки ~229-237):
```cpp
// УДАЛИТЬ:
void RecordEvent(const std::string& event_name, cl_event event) { ... }
```

**Grep**: `grep -rn "RecordEvent" include/ src/ tests/` — должно быть пусто или только `RecordROCmEvent`.

---

### A6. Обновить тесты — убрать OpenCL usage

**Файл**: `core/tests/test_gpu_profiler.hpp`

Найти и заменить:
```cpp
// БЫЛО:
auto data = MakeOpenCLFromDurationMs(0.5);
profiler.Record(0, "test", "op", data);

// СТАЛО:
auto data = MakeRocmFromDurationMs(0.5);
profiler.Record(0, "test", "op", data);
```

Аналогично в `test_services.hpp` (если есть — строка ~55).

Удалить `OpenCLProfilingData`-инициализации (строки ~73-84, 179-209) — заменить на `ROCmProfilingData{}`.

---

### A7. Build + test

```bash
cd E:/DSP-GPU/core
rm -rf build
cmake --preset debian-local-dev
cmake --build build --target core -j
cmake --build build --target core_unit_tests -j
ctest --test-dir build --output-on-failure
```

**Acceptance**:
- ✅ Сборка зелёная (0 errors)
- ✅ Все тесты проходят
- ✅ Warnings не увеличились (сравнить с baseline-замером из A0.5)
- ✅ `nm build/libcore.so | grep -i opencl` — только backend, не profiler
- ✅ `size build/libcore.so` — размер ≤ baseline (т.к. удалили код)

---

### A8. Commit (локально)

```bash
cd E:/DSP-GPU/core
git add -A
git status                            # проверить что попало
git commit -m "[profiler-v2] Phase A: remove OpenCL from profiler

- Remove OpenCLProfilingData, ProfilingTimeVariant
- Remove GPUProfiler::Record(OpenCL) overload
- Remove std::visit dispatch in ProcessMessage (ROCm only now)
- Remove OpenCL table from PrintReport
- Remove opencl_profiling.hpp/.cpp from profiler (keep in backends/)
- Remove RecordEvent(cl_event) from GpuBenchmarkBase
- Replace MakeOpenCLFromDurationMs → MakeRocmFromDurationMs in tests

Refs: MemoryBank/specs/GPUProfiler_Rewrite_Proposal_2026-04-16_REVIEW.md
Phase A of profiler v2 rewrite. Next: Phase B1 (ProfilingRecord)."
```

**⚠️ `git push` — только после OK Alex.**

---

## ✅ Acceptance Criteria

| # | Критерий | Способ проверки |
|---|----------|----------------|
| 1 | Ветка `new_profiler` создана | `git branch --show-current` → `new_profiler` |
| 2 | Baseline цифры сохранены | есть файл `MemoryBank/sessions/profiler_v2_baseline_2026-04-17.md` |
| 3 | OpenCLProfilingData удалён | `grep -r OpenCLProfilingData core/` пусто |
| 4 | ProfilingTimeVariant удалён | `grep -r ProfilingTimeVariant core/` пусто |
| 5 | std::visit в profiler удалён | `grep -n "std::visit" core/src/services/gpu_profiler.cpp` пусто |
| 6 | Сборка зелёная | `cmake --build` exit code 0 |
| 7 | Тесты зелёные | `ctest` exit code 0 |
| 8 | `backends/opencl/` НЕ удалён | `ls core/include/core/backends/opencl/` не пусто |
| 9 | Commit локально | `git log -1` показывает commit |

---

## 🚨 Что делать при ошибке

### Если build красный
1. Не пушить коммит.
2. Записать ошибку в `MemoryBank/sessions/phase_a_error_<date>.md`.
3. Сообщить Alex — не применять нестандартные fixes.

### Если test красный
1. Не переходить к Phase B.
2. Проверить — тест реально о OpenCL, или побочка?
3. Если побочка — описать и спросить Alex.

### Если обнаружено неожиданное (backends/opencl используется где-то ещё)
1. Спросить Alex — может там baseline код для IMemoryBuffer.
2. НЕ удалять по своей инициативе.

---

## 📖 Контекст решений

- **Почему удаляем OpenCL из profiler, а не из всего core?**
  Спека 12.2: "backends/opencl keeps (IMemoryBuffer with cl_mem — OpenCL bridge, per Alex)". Профайлер не нужен OpenCL, а буферы — нужны.

- **Почему baseline нужен?**
  Р2 ревью: после Phase B добавим counters map + factory → регрессия возможна. Без baseline не поймём.

- **Почему без CMake изменений кроме target_sources?**
  CLAUDE.md: любое изменение `find_package`, `FetchContent`, `target_link_libraries` — только с OK Alex. Удаление файлов из `target_sources` — разрешено как очевидная правка.

---

*Task created: 2026-04-17 | Reviewer pending: Alex | Status: READY TO EXECUTE*
