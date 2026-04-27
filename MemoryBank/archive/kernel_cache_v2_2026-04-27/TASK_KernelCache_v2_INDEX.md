# TASK: Kernel Cache v2 Rewrite — Master Index

> **Дата создания**: 2026-04-17
> **Источник спеки**: `MemoryBank/specs/KernelCache_v2_Proposal_2026-04-16.md` (v3 clean-slate)
> **Ветка**: `kernel_cache_v2` (в core + 4 репо: spectrum, signal_generators, linalg, strategies)
> **Effort**: 15-22 часа
> **Scope**: `core/` + 4 репо

---

## 🎯 Цель

Переписать Kernel Cache на **clean-slate** дизайн:
- **CompileKey** (source + defines + arch + hiprtc_version) → 64-bit hash
- Hash уходит в имя файла: `<kernel>_<hash8>.hsaco`
- Единый паттерн использования — только `GpuContext::CompileModule`
- Выкинуть 6 Pattern B файлов (manual hiprtc) + 122 строки dead code

---

## 📂 Задачи (по порядку выполнения)

| # | Task | Файл | Scope | Effort | Depends |
|---|------|------|-------|-------:|---------|
| A | Core: new API + CompileKey | `TASK_KernelCache_v2_PhaseA_CoreNewApi.md` | core/ | 4-6 ч | profiler merged |
| B | Critical fixes (SG1 + S1) | `TASK_KernelCache_v2_PhaseB_CriticalFixes.md` | spectrum, signal_gen | 4-5 ч | A |
| C | linalg + strategies migration | `TASK_KernelCache_v2_PhaseC_LinalgStrategies.md` | linalg, strategies | 5-7 ч | A |
| D | Cleanup (dead code + workaround) | `TASK_KernelCache_v2_PhaseD_Cleanup.md` | radar, spectrum | 1-2 ч | C |
| E | Polish + CLI + PR | `TASK_KernelCache_v2_PhaseE_Polish.md` | all | 1-2 ч | D |

---

## 🔑 Финальные архитектурные решения (Q1-Q10 из спеки)

### Q1 — Hash: FNV-1a 64-bit composite
- 20 строк своей реализации, no external deps
- Composite: hash(source) + hash(defines) + hash(arch) + hash(hiprtc_version)
- Стабилен между запусками (byte-order independent)

### Q2 — `compile_key.hpp` отдельный header
- `core/include/core/services/compile_key.hpp`
- Используется и в `KernelCacheService`, и в `GpuContext`

### Q3 — manifest.json опционален
- Runtime работает ТОЛЬКО по имени файла с hash
- manifest.json нужен только для CLI `dsp-cache-list`

### Q4 — CacheStats atomic
```cpp
struct CacheStats {
    std::atomic<uint64_t> hits, misses, total_compile_ms, total_load_ms;
};
```

### Q5 — хранить все варианты defines
- Разные defines → разный hash → разные файлы в кеше
- Сосуществуют (диск дешёвый, ~1 MB на 10 вариантов)

### Q6 — Corrupted HSACO
- Обнаружили (hipModuleLoadData fail или truncated file) → `std::filesystem::remove` + `DRVGPU_LOG_WARNING` + recompile

### Q7 — hipModuleUnload = deferred
- Старый hipModule_t живёт до shutdown GpuContext
- Избегаем known hipModuleUnload leak в ROCm

### Q8 — **Координация с new_profiler = Вариант B (параллельно)**
```
main ─── new_profiler ─── merge ─── ...
      └─ kernel_cache_v2 (Phase A ЖДЁТ merge, Phase B-D идут параллельно)
```
- `Phase A` (core) стартует **ПОСЛЕ** merge `new_profiler` в main
- `Phase B-D` (processors) могут идти параллельно с new_profiler
- Daily rebase если конфликт в CMakeLists (1-2 строки, trivial)

### Q9 — ветка `kernel_cache_v2` в каждом затронутом репо
- core (обязательно)
- spectrum (Phase B2, D1)
- signal_generators (Phase B1)
- linalg (Phase C1-C3)
- strategies (Phase C4)
- radar (Phase D2 — только dead code cleanup, можно в отдельной ветке `cleanup_fm_correlator`)

### Q10 — TASK-файлы = этот набор

---

## 🚫 АБСОЛЮТНЫЕ ЗАПРЕТЫ

1. **CMake без OK Alex** — особенно Phase C4 (вынос strategies_float_api.hpp в .cpp = добавление в target_sources).
2. **pytest запрещён** — только `python script.py`.
3. **git push / git tag** — только с OK Alex.
4. **Не удалять `KernelCacheService` полностью** — переписать, сохраняя namespace.
5. **Не ломать Pattern A (21 файл через GpuContext)** — их caller API остаётся.

---

## 🎯 Definition of Done per task

1. ✅ Код написан по спецификации
2. ✅ `cmake --preset debian-local-dev && cmake --build build` — зелёно
3. ✅ `ctest --test-dir build --output-on-failure` — зелёно
4. ✅ Acceptance criteria из TASK-файла выполнены
5. ✅ Commit `[kernel-cache-v2] Phase X: <summary>` в ветку `kernel_cache_v2`

---

## 📞 Когда спрашивать Alex

**Обязательно**:
- Любое изменение CMake (особенно C4 — добавление strategies_float_api.cpp в target_sources)
- git push / git tag
- Если acceptance criteria невыполнимо → стоп, описать, спросить

**Не нужно**:
- Выбор имён локальных переменных, комментариев, стиль тестов — по существующему коду

---

## 🔁 Проверка после каждой задачи

```bash
cd E:/DSP-GPU/core
git status
git diff --stat
cmake --build build --target core
ctest --test-dir build --output-on-failure
```

Красный — **стоп, не переходи к следующей**. Сообщи Alex.

---

## 📊 Сводная таблица изменений

| Репо | Файлы изменены | Phase | Эффект |
|------|:---:|:---:|-------|
| core | 3 new + 3 rewrite | A | New API + CompileKey |
| spectrum | 2 rewrite + 2 tweak | B, D | Pattern B→A, убрать recreate workaround |
| signal_generators | 1 rewrite | B | Впервые disk cache для ScriptGen |
| linalg | 3 rewrite | C | Pattern B→A для cholesky/symmetrize/diagonal |
| strategies | 1 rewrite + split .hpp→.cpp | C | Pattern B→A + header cleanup |
| radar | 1 dead code delete | D | Физически удалить #if 0 блок (122 строки) |

**Итого**: ~13 файлов значимо изменены, ~740 строк boilerplate удалены, ~250 строк нового кода добавлено.

---

*Created: 2026-04-17 | Тех-лид: Кодо (v3 spec + Q1-Q10 согласованы) | Исполнитель: Кодо (следующая сессия)*
