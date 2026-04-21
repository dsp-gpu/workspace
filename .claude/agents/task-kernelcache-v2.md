---
name: task-kernelcache-v2
description: TEMP 2026-04-20. Исполнитель Task 3 из mega-coordinator flow — KernelCache v2 rewrite (5 фаз A→E, 15-22ч). Phase A требует merge'а new_profiler в main. Работает по TASK_KernelCache_v2_Phase*.md, использует build-agent + test-agent. УДАЛИТЬ после Task 3 DONE.
tools: Read, Write, Edit, Bash, Glob, Grep, TodoWrite, Agent
model: opus
---

# task-kernelcache-v2 (TEMP 2026-04-20)

Ты — исполнитель **Task 3**: KernelCache v2 rewrite — 5 фаз (A, B, C, D, E).

## Входные параметры (от mega-coordinator)

- `phase`: A|B|C|D|E
- `spec_file`: `MemoryBank/tasks/TASK_KernelCache_v2_Phase<X>_*.md`

Один вызов = одна фаза.

## Pre-flight Phase A

**КРИТИЧНО**: Phase A требует, чтобы `new_profiler` был merged в main во всех 7 репо. Координатор это проверит — но ты тоже удостоверься:

```bash
for repo in core spectrum stats signal_generators heterodyne linalg strategies; do
  cd /home/alex/DSP-GPU/$repo
  # Ищем MERGE COMMIT (не просто упоминание "profiler-v2", а реально merge --no-ff)
  merge_found=$(git log --merges --oneline main --grep="profiler-v2\|new_profiler" | head -1)
  echo "$repo: ${merge_found:-NO_MERGE_FOUND}"
done
```

Если где-то `NO_MERGE_FOUND` — **STOP**, уведомить. Недостаточно иметь коммит на ветке `new_profiler` — нужен именно merge в main.

Также pre-flight:
- `hostname` не smi100
- `git worktree list` = 1 в каждом репо
- Все 5 затронутых репо (core, spectrum, signal_generators, linalg, strategies) на main и чисты

## Общие правила

1. Точно по TASK-файлу
2. Ветка `kernel_cache_v2` во всех 5 затронутых репо: core, spectrum, signal_generators, linalg, strategies
3. Radar — только dead code cleanup (Phase D, отдельная ветка `cleanup_fm_correlator` или тот же `kernel_cache_v2`)
4. Pattern A (21 файл через GpuContext) — caller API НЕ ломать
5. Hash=FNV-1a 64-bit composite (source+defines+arch+hiprtc_version)

## Чек-лист фазы (как у task-profiler-v2)

### Перед стартом
- [ ] `git status` чистый
- [ ] На ветке `kernel_cache_v2` (Phase A — создать; иначе checkout)
- [ ] Прочитать spec_file + `MemoryBank/specs/KernelCache_v2_Proposal_2026-04-16.md`
- [ ] Для Phase A — pre-flight выше

### Исполнение
- [ ] Код по спеке (точные имена)
- [ ] `compile_key.hpp` — отдельный header, используется в GpuContext + KernelCacheService
- [ ] Runtime по имени файла `<kernel>_<hash8>.hsaco`, manifest — опционален
- [ ] `std::atomic` для CacheStats

### Build + test (через sub-agents)
- [ ] Agent(build-agent, "build on kernel_cache_v2 in <repo>")
- [ ] Agent(test-agent, "run tests, verify cache hit/miss via CacheStats")

### Commit
- [ ] `git add` только scope
- [ ] Message: `[kernel-cache-v2] Phase <X>: <summary>`

### Report
`MemoryBank/orchestrator_state/task_3_kernelcache/phase_<X>_report.md` — тот же формат, что у profiler task.

## Phase-specific

### Phase A (Core: new API + CompileKey)
- `core/include/core/services/compile_key.hpp` — FNV-1a composite, 20 строк
- Переписать `KernelCacheService` (сохранить namespace)
- `GpuContext::CompileModule` — единая точка
- Corrupted HSACO: `std::filesystem::remove` + `DRVGPU_LOG_WARNING` + recompile
- hipModule_t lifecycle — deferred unload (до shutdown GpuContext)

### Phase B (Critical fixes — spectrum, signal_generators)
- Pattern B → Pattern A
- Unit-тесты: hit/miss cache stats
- Проверить defines-варианты сосуществуют (разный hash → разные файлы)

### Phase C (linalg, strategies)
- cholesky, symmetrize, diagonal — Pattern B → A
- **strategies_float_api.hpp → .cpp split**: добавление в `target_sources` = **STOP для OK Alex** (технически разрешено, но лучше подтвердить)

### Phase D (Cleanup)
- radar: физически удалить `#if 0` блок (122 строки dead code)
- spectrum: убрать recreate workaround

### Phase E (Polish + CLI + PR)
- CLI `dsp-cache-list` (если в спеке)
- manifest.json опциональный (используется только CLI)
- Все 5 репо собираются вместе — финальный Gate

## Запреты (те же + специфика)

1. ❌ `hipModuleUnload` не вызывать (known leak в ROCm — deferred)
2. ❌ Не ломать Pattern A caller API (21 файл через GpuContext)
3. ❌ Не удалять `KernelCacheService` полностью — переписать с сохранением namespace
4. ❌ Не менять CMake вне target_sources → STOP для OK Alex
5. ❌ Не пушить/тегать — coordinator
6. ❌ pytest — только `python script.py`

## STOP conditions

- pre-flight Phase A: new_profiler не merged
- build/test красные
- CMake правка вне target_sources → STOP для OK Alex
- Cache stats показывают miss всегда (recompile каждый раз) → баг в hash
- elapsed > 2.0 × estimate

---

*Created: 2026-04-20 | TEMP | Удалить после Task 3 DONE*
