# 🚧 IN PROGRESS

**Обновлено**: 2026-04-30 (после Phase A push)

## Активные таски

| # | Таск | Статус | Effort | Платформа |
|---|------|--------|--------|-----------|
| 1 | [TASK_python_migration_phase_B_debian_2026-05-03.md](TASK_python_migration_phase_B_debian_2026-05-03.md) — реальный прогон 54 t_*.py на gfx1201 + точечные tolerance | 📋 ожидает (стартует 2026-05-03+) | ~3-5 ч | Debian + RX 9070 |
| 2 | [TASK_KernelCache_v2_Closeout_2026-04-27.md](TASK_KernelCache_v2_Closeout_2026-04-27.md) — MemoryBank sync + core/Doc/Services/Full.md + опц. tag v0.3.0 | 📋 готов | 3-5 ч | Windows |
| 3 | [TASK_Profiler_v2_INDEX.md](TASK_Profiler_v2_INDEX.md) — 3 закрывающих таска (доки, CI, Q7 roctracer) | 📋 ждёт OK | 4-30 ч | Windows + опц. Debian |

## Перспективные (`.future/`)

- [TASK_script_dsl_rocm.md](../.future/TASK_script_dsl_rocm.md) — runtime HIP DSL (заменяет удалённый ScriptGenerator)
- [TASK_pybind_review.md](../.future/TASK_pybind_review.md) — заготовка под pybind issues, наполняется в Phase B

## ✅ Закрыто 2026-04-30 — Phase A Python migration

54 t_*.py мигрированы с `gpuworklib` на `dsp_*`, удалён shim, CMake POST_BUILD auto-deploy в 8 репо, sync правил 04+11. **Все 10 репо запушены** (workspace + 9 sub-репо). Подробности → коммит `44f4606` (DSP) + 8 cmake коммитов sub-репо + `3549a48` (workspace).

Артефакты: [migration_plan_2026-04-29.md](../specs/python/migration_plan_2026-04-29.md), [api_reference_2026-04-30.md](../specs/python/api_reference_2026-04-30.md), [legacy_to_dsp_gpu_mapping_2026-04-30.md](../specs/python/legacy_to_dsp_gpu_mapping_2026-04-30.md), [migration_review_retrospective_2026-04-30.md](../specs/python/migration_review_retrospective_2026-04-30.md).

---

*Maintained by: Кодо. История заархивирована — см. `MemoryBank/changelog/` и git log.*
