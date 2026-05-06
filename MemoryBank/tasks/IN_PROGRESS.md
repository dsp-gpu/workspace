# 🚧 IN PROGRESS

**Обновлено**: 2026-05-06 (после TASK_RAG_09 closeout)

## ✅ Закрыто 2026-05-06 — TASK_RAG_09 Pipeline Generator (Агент 3)

3 pipeline'а зарегистрированы (1 spectrum header `AllMaximaPipelineROCm` + 2 strategies doc `antenna_processor_pipeline`/`farrow_pipeline`). doc_blocks concept=`pipeline`: 3. `rag_dsp.pipelines`: 3 типизированных строки. Qdrant `target_table='pipelines'`: 3 точки ✅. CLI `dsp-asst rag pipelines build`. Применены 4 ревью-фикса (title prefix strip, INFRA whitelist, расширенный PascalCase regex, --pipeline slug filter).
Подробности: [sessions/2026-05-06_TASK_RAG_09_progress.md](../sessions/2026-05-06_TASK_RAG_09_progress.md), [changelog/2026-05.md](../changelog/2026-05.md).

## ✅ Закрыто 2026-05-06 — TASK_RAG_02.6 Python use-cases + pybind bindings

83 новых doc_blocks (47 python_test_usecase + 5 cross_repo_pipeline + 31 python_binding), `pybind_bindings` extended (42 rows, 38 with doc_block_id, 25/31 cpp_symbol_id через token-Jaccard через `#include <X.hpp>` paths). CLI `dsp-asst rag python build/bindings`. Smoke retrieval PASS.
Подробности: [sessions/2026-05-06_TASK_RAG_02.6_progress.md](../sessions/2026-05-06_TASK_RAG_02.6_progress.md), [changelog/2026-05.md](../changelog/2026-05.md).
Создан follow-up: [TASK_remove_opencl_pybind_2026-05-06.md](TASK_remove_opencl_pybind_2026-05-06.md) (HIGH, 2-3 ч).



## Активные таски

| # | Таск | Статус | Effort | Платформа |
|---|------|--------|--------|-----------|
| 1 | [TASK_python_migration_phase_B_debian_2026-05-03.md](TASK_python_migration_phase_B_debian_2026-05-03.md) — реальный прогон 54 t_*.py на gfx1201 + точечные tolerance | 📋 ожидает (стартует 2026-05-03+) | ~3-5 ч | Debian + RX 9070 |
| 2 | [TASK_KernelCache_v2_Closeout_2026-04-27.md](TASK_KernelCache_v2_Closeout_2026-04-27.md) — MemoryBank sync + core/Doc/Services/Full.md + опц. tag v0.3.0 | 📋 готов | 3-5 ч | Windows |
| 3 | [TASK_Profiler_v2_INDEX.md](TASK_Profiler_v2_INDEX.md) — 3 закрывающих таска (доки, CI, Q7 roctracer) | 📋 ждёт OK | 4-30 ч | Windows + опц. Debian |
| 4 | [TASK_validators_port_from_GPUWorkLib_2026-05-03.md](TASK_validators_port_from_GPUWorkLib_2026-05-03.md) — `MaxRelError/RmseError/...` → `core/test_utils/` (родительский) | ≈90% ✅ (см. ниже) | — | Debian |
| 5 | [TASK_validators_linalg_pilot_2026-05-04.md](TASK_validators_linalg_pilot_2026-05-04.md) — пилот раскатки `gpu_test_utils::*` в `linalg/tests/` | 📋 active | ~3-4 ч | Debian + RX 9070 |

## Перспективные (`.future/`)

- [TASK_script_dsl_rocm.md](../.future/TASK_script_dsl_rocm.md) — runtime HIP DSL (заменяет удалённый ScriptGenerator)
- [TASK_pybind_review.md](../.future/TASK_pybind_review.md) — заготовка под pybind issues, наполняется в Phase B
- [TASK_gtest_variant_for_external_projects.md](../.future/TASK_gtest_variant_for_external_projects.md) — GTest вариант AI-генератора (для проектов на GoogleTest)
- [TASK_namespace_migration_legacy_to_dsp.md](../.future/TASK_namespace_migration_legacy_to_dsp.md) — `fft_processor::*` → `dsp::spectrum::*` (после стабилизации doxytags + первого обучения AI)

## ✅ Закрыто 2026-04-30 — Phase A Python migration

54 t_*.py мигрированы с `gpuworklib` на `dsp_*`, удалён shim, CMake POST_BUILD auto-deploy в 8 репо, sync правил 04+11. **Все 10 репо запушены** (workspace + 9 sub-репо). Подробности → коммит `44f4606` (DSP) + 8 cmake коммитов sub-репо + `3549a48` (workspace).

Артефакты: [migration_plan_2026-04-29.md](../specs/python/migration_plan_2026-04-29.md), [api_reference_2026-04-30.md](../specs/python/api_reference_2026-04-30.md), [legacy_to_dsp_gpu_mapping_2026-04-30.md](../specs/python/legacy_to_dsp_gpu_mapping_2026-04-30.md), [migration_review_retrospective_2026-04-30.md](../specs/python/migration_review_retrospective_2026-04-30.md).

---

*Maintained by: Кодо. История заархивирована — см. `MemoryBank/changelog/` и git log.*
