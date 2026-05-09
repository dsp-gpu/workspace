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
| **DS_PYBIND** | [TASK_RAG_dataset_pybind_bridge_2026-05-09.md](TASK_RAG_dataset_pybind_bridge_2026-05-09.md) — Python ↔ C++ из `rag_dsp.pybind_bindings` (3 шаблона: py_class_overview/py_method_call/cpp_to_py_lookup) | ✅ **DoD 9.05 ночь** (Кодо main: 224 пары из 42 bindings + 140 methods_exposed; `dataset_v3` 3565→**3726** +4.5%; от baseline 1093 = **+241%**; top-15 полностью cap=30) | — | DS_TP_PAIRS ✅ |
| **DS_DOC_RICH** | [TASK_RAG_dataset_doc_rich_2026-05-09.md](TASK_RAG_dataset_doc_rich_2026-05-09.md) — rich blocks из `rag_dsp.doc_blocks` (python_test_usecase / python_binding / example / usage / parameters / benchmark / cross_repo_pipeline / c1-c2 / спец-алгоритмы) | ✅ **DoD 9.05 ночь** (Кодо main: 519 пар из 2287 rich blocks с 2-уровневым blacklist concepts+modules; `dataset_v3` 3726→**4253** +14%; **+289% от baseline 1093**; 0 dedup'ов с прошлыми SOURCES) | — | DS_PYBIND ✅ |
| **DS_NS_FILES** | [TASK_RAG_dataset_namespace_files_2026-05-09.md](TASK_RAG_dataset_namespace_files_2026-05-09.md) — namespace_overview (22) + file_grouping (125) | ✅ **DoD 9.05 поздняя ночь** (Кодо main: +147 пар = `dataset_v3` 4253→**4398** (+3.4%); **+302% от baseline 1093** = 4x) | — | DS_DOC_RICH ✅ |
| **DS_CLASS_FACTS** | детерминированная факт-карточка топ-44 классов (kind=class, ≥3 methods, has doxy) — заменила AI-summary (qwen3:8b галлюцинировал паттерны) | ✅ **DoD 10.05 ночь** (Кодо main: 37 пар, 0 галлюцинаций, with py_binding 4; `dataset_v3` 4398→**4434** +0.8%; **+306% от baseline**) | — | DS_NS_FILES ✅ |
| **DS_FIELDS_CMAKE** | public_field (108 классов с ≥2 полями) + cmake_targets (31) | ✅ **DoD 10.05 ночь** (Кодо main: 139 пар; `dataset_v3` 4434→**4573** +3.1%) | — | DS_CLASS_FACTS ✅ |
| **DS_FREE_FN** | real free_function с doxy (жёсткий фильтр /tests/, Test*, run_*, _* prefixes) | ✅ **DoD 10.05** (Кодо main: 58 пар; `dataset_v3` 4573→**4631** +1.3%) | — | DS_FIELDS_CMAKE ✅ |
| **DS_PYTHON_AUG** | instruction augmentation для 47 python_test_usecase: +2 формулировки на каждый блок | ✅ **DoD 10.05** (Кодо main: 94 пары; `dataset_v3` 4631→**4725** +2%) | — | DS_FREE_FN ✅ |
| **DS_NEGATIVE** | anti-hallucination: typo→real lookup (4 типа опечаток × 79 классов) | ✅ **DoD 10.05** (Кодо main: 261 пара; `dataset_v3` 4725→**4986** +5.5%; лечит «Rochester GPU» из CLEAN-247) | — | DS_PYTHON_AUG ✅ |
| **DS_USAGE_AUG** | augmentation для 141 doc_blocks (usecase 76 + python_binding 35 + example 13 + usage 11) | ✅ **DoD 10.05** (Кодо main: 135 пар; `dataset_v3` 4986→**5113** +2.5%; **+368% baseline = 4.68x**; перевалили 5000) | — | DS_NEGATIVE ✅ |
| **DS_HUMAN_DOCS** | human-written доки: repo_docs 41 + membank_specs 19 + architecture 4 + dsp_docs 75 + doc_deep 179 = **318 пар** | ✅ **DoD 10.05** (Кодо main: 5 скриптов; `dataset_v3` 5113→**5696** +11%; **+421% baseline = 5.21x**; **30 шаблонов финал**; 2165 уникальных классов) | — | DS_USAGE_AUG ✅ |
| **DS_HIP_KERNELS** | [TASK_RAG_dataset_hip_kernels_2026-05-10.md](TASK_RAG_dataset_hip_kernels_2026-05-10.md) — HIP+OpenCL kernel sources из `<repo>/include/<repo>/kernels/*_rocm.hpp` (universal regex для 2 backend'ов) | ✅ **DoD 10.05** (Кодо main: 58 kernels из 23 файлов → 81 пара; HIP=56, OpenCL=2 interop; **0/23 файлов с 0 kernels**; 4 итерации regex: \d+→[^)]+ макрос / [^{}]→[^()] комментарии / trailing comments / balanced parens) | — | нет |
| **DS_TEST_OVERVIEW** | [TASK_RAG_dataset_test_overview_2026-05-10.md](TASK_RAG_dataset_test_overview_2026-05-10.md) — пары из C++ `test_*.hpp` 8 репо (header `ЧТО/ЗАЧЕМ/ПОЧЕМУ` + doxygen + run-функции) | ✅ **DoD 10.05** (Кодо main: 75 файлов → **77 пар**; покрытие core 22 + spectrum 18 + linalg 9 + radar 8 + stats 6 + strategies 5 + heterodyne 4 + signal_generators 3; `dataset_v3` 4683→**4756**) | — | нет |
| **RAG_CLAUDE_C4** | [TASK_RAG_claude_md_c4_tags_2026-05-09.md](TASK_RAG_claude_md_c4_tags_2026-05-09.md) — Архитектура C4 + теги в `<repo>/CLAUDE.md` | ✅ **DoD 9.05 утро** (8/8 `_RAG.md` tags inferred 66 total / 8/8 `<repo>/CLAUDE.md` C4-блоков вставлены / +8 pairs `claude_md_section` шаблона; sparse BM25 smoke отложен — нужен reindex Qdrant) | — | RAG_MAN ✅ |
| **ARCH_FILES** | [TASK_RAG_arch_files_per_repo_2026-05-09.md](TASK_RAG_arch_files_per_repo_2026-05-09.md) — полные C2/C3/C4 файлы внутри 9 репо (`<repo>/.rag/arch/`) + DSP спец-шаблон + новый dataset шаблон `arch_levels` | ✅ **DoD 10.05** (Кодо main: 27 файлов чистые, 8 `_RAG.md` обновлены полем `architecture_files`, 27 пар arch_levels в `dataset_v3`; 3 фикса в `_clean_brief` + CTE-дедуп классов + dedup тегов после deep-review) | — | RAG_MAN ✅, RAG_CLAUDE_C4 ✅ |
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
