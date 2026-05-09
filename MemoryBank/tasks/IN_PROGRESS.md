# 🚧 IN PROGRESS

**Обновлено**: 2026-05-08 (после деления `TASK_RAG_context_fuel` на 13 подтасков + Phase A QLoRA diagnostic + OpenCL Part A)

---

## ✅ Закрыто 2026-05-08 (сегодня)

### TASK_remove_opencl_pybind Part A — 3 dead pybind удалены
- `spectrum/python/py_filters.hpp` (-276 строк, OpenCL PyFirFilter/PyIirFilter)
- `signal_generators/python/py_lfm_analytical_delay.hpp` (-184 строки)
- `heterodyne/python/py_heterodyne.hpp` (-215 строк)
- Doc DEPRECATED markers в `spectrum/Doc/{API,filters_API}.md` + `heterodyne/Doc/{API,Full,copy/heterodyne_Full}.md`
- Часть B (5 legacy OpenCL .hpp классов) → `TASK_remove_opencl_legacy_classes_2026-05-08.md`
- Подробности: коммиты `74d7c0a` (spectrum) + `74c34dd` (signal_generators) + `cba392e` (heterodyne)

### Phase A QLoRA diagnostic
3 эксперимента на 2080 Ti (r=4 dirty / r=8 dirty / r=8 clean), парадокс CLEAN — гипотеза «датасет=bottleneck (max-5/class)» опровергнута. План Phase B пересмотрен.
Подробности: `sessions/2026-05-08.md`, `specs/LLM_and_RAG/finetune_diagnostic_2026-05-08.md`.

---

## ✅ Закрыто 2026-05-06

- TASK_RAG_09 Pipeline Generator — 3 pipeline'а зарегистрированы. Подробности: `sessions/2026-05-06_TASK_RAG_09_progress.md`.
- TASK_RAG_02.6 Python use-cases + pybind bindings — 83 doc_blocks, 42 pybind. Подробности: `sessions/2026-05-06_TASK_RAG_02.6_progress.md`.

---

## 📋 Активные таски

### Phase B QLoRA + RAG до 12.05

| # | Таск | Статус | Effort | Зависимости |
|---|------|--------|--------|-------------|
| F1 | [TASK_FINETUNE_phase_B_2026-05-12.md](TASK_FINETUNE_phase_B_2026-05-12.md) — QLoRA на 9070, dirty 1093 + r=16 + bf16 | 📋 12.05 | 3-4 ч | — |
| **CTX0** | [TASK_RAG_schema_migration_2026-05-08.md](TASK_RAG_schema_migration_2026-05-08.md) — `test_params` extend + tsvector | ✅ 8.05 11:51 | — | — |
| **CTX1** | [TASK_RAG_test_params_fill_2026-05-08.md](TASK_RAG_test_params_fill_2026-05-08.md) — заполнить `test_params` LEVEL 0+2 (9 репо) | ✅ DoD 8.05 (674 LEVEL 0 / 111 LEVEL 2 на 10 классах) | — | CTX0 ✅ |
| **CTX2** | [TASK_RAG_doxygen_test_parser_2026-05-08.md](TASK_RAG_doxygen_test_parser_2026-05-08.md) — `@test*` парсер + LEVEL 1 | ✅ **DoD 9.05 утро** (parse_test_tags.py + ingest_test_tags.py, 8 репо/219 hpp обработано: 645 inserted + 505 updated в `rag_dsp.test_params`; total 674→**1319** rows; 983 ready_for_autotest vs 111 раньше; dataset_v3 2020→**2213** пар, test_gen 287→480) | — | CTX1 ✅ |
| **CTX3** | [TASK_RAG_hybrid_upgrade_2026-05-08.md](TASK_RAG_hybrid_upgrade_2026-05-08.md) — sparse BM25 + HyDE | 🚧 я (Кодо main) 8.05 вечер | ~3.5 ч | CTX0 ✅ |
| **CTX4** | [TASK_RAG_mcp_atomic_tools_2026-05-08.md](TASK_RAG_mcp_atomic_tools_2026-05-08.md) — 4 atomic MCP tools | ✅ DoD 9.05 (test_params 6 rec / use_case 3 hits / pipeline 3 hits / doc_block 2874 chars; commit `0a2882b` в finetune-env) | — | CTX1 ✅ |
| **CTX5** | [TASK_RAG_context_pack_2026-05-08.md](TASK_RAG_context_pack_2026-05-08.md) — orchestrator с cache | 🚧 сестра #2 | ~2 ч | CTX4 (опц. GRAPH) |
| **CTX6** | [TASK_RAG_code_embeddings_2026-05-08.md](TASK_RAG_code_embeddings_2026-05-08.md) — Nomic-Embed-Code | 📋 P2 | ~5-6 ч | — |
| **CTX7** | [TASK_RAG_late_chunking_2026-05-08.md](TASK_RAG_late_chunking_2026-05-08.md) — Late Chunking BGE-M3 | ⏸️ **deferred 12.05.26** | ~2 ч | venv `transformers==4.46.0` на AMD Radeon |
| **CTX8** | [TASK_RAG_telemetry_2026-05-08.md](TASK_RAG_telemetry_2026-05-08.md) — popularity boost | 📋 P2 | ~1 ч | TestRunner::OnTestComplete |
| **GR** | [TASK_RAG_graph_extension_2026-05-08.md](TASK_RAG_graph_extension_2026-05-08.md) — G1-G5 (без call-graph) | 🚧 сестра #2 | ~9 ч | — |
| **EV** | [TASK_RAG_eval_extension_2026-05-08.md](TASK_RAG_eval_extension_2026-05-08.md) — RAGAs + golden-set v2 + CI · E1 ✅ + E2 ✅; E3+E4 отложено (нужен `_RAG.md` манифест сначала) | 🚧 partial | ~4.5 ч | C-этап ✅ |
| **RAG_MAN** | _RAG.md manifest generator (8 репо) — auto-поля из symbols+test_params, AI-brief позже | ✅ DoD 9.05 (8/8 файлов созданы и запушены: core `cc83bb3` / spectrum `542eb56` / stats `e1b2525` / signal_generators `7f12d90` / heterodyne `ff26934` / linalg `687ba91` / radar `962a7c4` / strategies `6b9d64c`; скрипт в finetune-env) | — | CTX1 ✅ |
| **RAG_ENRICH_TG** | enrich 480 test_gen placeholders → real C++ smoke-tests через ollama qwen3:8b | ✅ **DoD 9.05 вечер** (480/480 records обогащены, 0 fail; финальный `dataset_v3.jsonl` = **2221** пар, DoD ≥2000 ✅; +heartbeat+flush+`watch_enrich.py` наблюдатель — урок зафиксирован в memory) | — | DS ✅, CTX1 ✅ |
| **DS_BALANCE** | [TASK_RAG_dataset_balance_2026-05-09.md](TASK_RAG_dataset_balance_2026-05-09.md) — добор под-представленных классов (count<5) → +200-400 пар, dataset_v4 ≥ 2400 | ✅ **DoD 9.05** (сестра + audit-tool от Кодо main) | — | ENRICH_TG ✅, CLAUDE_C4 ✅ |
| **DS_TP_PAIRS** | [TASK_RAG_dataset_test_params_pairs_2026-05-09.md](TASK_RAG_dataset_test_params_pairs_2026-05-09.md) — пары на основе `rag_dsp.test_params` (3 шаблона: param_edges/method_throws/method_return) | ✅ **DoD 9.05 поздний вечер** (Кодо main: 780 новых пар, 97% покрытие 983 ready_for_autotest; `dataset_v3` 2662→**3565** +34%; classes 724→**1456** +101%) | — | CTX2 ✅, DS_BALANCE ✅ |
| **RAG_CLAUDE_C4** | [TASK_RAG_claude_md_c4_tags_2026-05-09.md](TASK_RAG_claude_md_c4_tags_2026-05-09.md) — Архитектура C4 + теги в `<repo>/CLAUDE.md` | ✅ **DoD 9.05 утро** (8/8 `_RAG.md` tags inferred 66 total / 8/8 `<repo>/CLAUDE.md` C4-блоков вставлены / +8 pairs `claude_md_section` шаблона; sparse BM25 smoke отложен — нужен reindex Qdrant) | — | RAG_MAN ✅ |
| **DS** | [TASK_RAG_dataset_generation_for_qlora_2026-05-08.md](TASK_RAG_dataset_generation_for_qlora_2026-05-08.md) — dataset v3 для QLoRA | ✅ **FINAL 9.05** (1093→2020→2213→2662→2876→**3565** пар, +226% от baseline; 1456 уник. классов; 11 шаблонов; +usage_docs 217 (8 concepts с pseudo-class filter) + sister test_params_pairs 780; commit `26c5ba0`) | — | CTX1 ✅, CTX2 ✅, CTX4 ✅ |

> **Координатор:** [TASK_RAG_context_fuel_2026-05-08.md](TASK_RAG_context_fuel_2026-05-08.md) — INDEX с картой зависимостей.

### Прочие активные

| # | Таск | Статус | Effort | Платформа |
|---|------|--------|--------|-----------|
| O1 | [TASK_remove_opencl_legacy_classes_2026-05-08.md](TASK_remove_opencl_legacy_classes_2026-05-08.md) — миграция 5 legacy OpenCL классов на `*_rocm.hpp` | 📋 medium | 2-4 ч | Debian |
| O2 | [TASK_remove_opencl_pybind_2026-05-06.md](TASK_remove_opencl_pybind_2026-05-06.md) — Part A ✅ DONE 08.05; Part B/C/D — wait для конкретики | ⚠️ partial | — | Debian |
| P1 | [TASK_python_migration_phase_B_debian_2026-05-03.md](TASK_python_migration_phase_B_debian_2026-05-03.md) — реальный прогон 54 t_*.py на gfx1201 | 📋 ожидает | ~3-5 ч | Debian + RX 9070 |
| P2 | [TASK_KernelCache_v2_Closeout_2026-04-27.md](TASK_KernelCache_v2_Closeout_2026-04-27.md) — MemoryBank sync + Doc | 📋 готов | 3-5 ч | Windows |
| P3 | [TASK_Profiler_v2_INDEX.md](TASK_Profiler_v2_INDEX.md) — 3 закрывающих таска (доки, CI, Q7 roctracer) | 📋 ждёт OK | 4-30 ч | Windows + опц. Debian |
| V1 | [TASK_validators_port_from_GPUWorkLib_2026-05-03.md](TASK_validators_port_from_GPUWorkLib_2026-05-03.md) — `MaxRelError/RmseError/...` | ✅ ≈90% | — | Debian |
| V2 | [TASK_validators_linalg_pilot_2026-05-04.md](TASK_validators_linalg_pilot_2026-05-04.md) — пилот `gpu_test_utils::*` | 📋 active | ~3-4 ч | Debian + RX 9070 |

### Phase B+ (после 12.05)

| # | Таск | Статус |
|---|------|--------|
| AR | [TASK_RAG_agentic_loop_2026-05-08.md](TASK_RAG_agentic_loop_2026-05-08.md) — CRAG + Self-RAG + feedback + G-calls | 📋 wait Phase B done |

---

## Перспективные (`.future/`)

- [TASK_script_dsl_rocm.md](../.future/TASK_script_dsl_rocm.md) — runtime HIP DSL
- [TASK_pybind_review.md](../.future/TASK_pybind_review.md) — pybind issues
- [TASK_gtest_variant_for_external_projects.md](../.future/TASK_gtest_variant_for_external_projects.md) — GTest вариант AI-генератора
- [TASK_namespace_migration_legacy_to_dsp.md](../.future/TASK_namespace_migration_legacy_to_dsp.md) — `fft_processor::*` → `dsp::spectrum::*`

---

## ✅ Закрыто 2026-04-30 — Phase A Python migration

54 t_*.py мигрированы с `gpuworklib` на `dsp_*`, удалён shim, CMake POST_BUILD auto-deploy в 8 репо. **Все 10 репо запушены**. Артефакты: `specs/python/migration_*.md`.

---

*Maintained by: Кодо. История заархивирована — см. `MemoryBank/changelog/` и git log.*
