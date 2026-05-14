# 🚧 IN PROGRESS

**Обновлено**: 2026-05-14 утро+обед (QLoRA Phase B Day-1 на RX 9070 + dataset_v6 ×2.5 → smoke #3 PASS)

---

## 🆕 2026-05-14 — QLoRA Phase B Day-1 на RX 9070

Закрыто 3 фазы Phase B на работе (~4 часа):
- **Phase 1** Smoke matrix: qwen3-8b eval **1.26** / coder-7b eval **1.18** → Coder выигрывает на 0.085
- **Phase 3** Выгрузка пар из RAG-БД через `collect_rag_v6.py`: **dataset_v6_train = 9159** (×2.5 к v4) + 1490 val, 12+ source-типов
- **Phase 4** Smoke #3 на v6 (coder-7b): **eval @ step 50 = 1.345 vs v4 1.44** → v6 ОБЫГРАЛ v4 на Δ=−0.095 на 1310 samples (×18 надёжнее) → **гипотеза Phase 3 подтверждена**

**Технические инсайты:**
- `bnb 0.49.2` 4-bit kernel падает в `csrc/ops.hip:83` на gfx1201 при `max_seq=1024+adamw_8bit` → safe Plan-B `seq=256-512, lora_r=8, adamw_torch`
- HIP `is_nonzero/item` race в HF Trainer → `illegal address` на ~step 50-120 (фундаментальный ROCm 7.2 RDNA4 bug) → для Phase 5 нужен `--save-steps 20` + auto-resume
- `expandable_segments` env молча игнорируется на ROCm 7.2 (warning «not supported»)
- Все доп GPU-приложения (Telegram/браузер) во время train запрещены — GPU compositor race
- Coder-7B > general-8B на DSP-GPU задачах → Phase 5 ставим **Qwen2.5-Coder-14B-Instruct**

**Артефакты:**
- `MemoryBank/prompts/prompt_for_sister_phase_b_2026-05-14.md` — переписан под нас (Debian + RX 9070), все 3 фазы + сравнительные таблицы
- `MemoryBank/tasks/TASK_FINETUNE_phase_B_9070_2026-05-14.md` — DoD по 6 фазам
- `MemoryBank/specs_Linux_Radion_9070/phase_b_models_analysis_2026-05-14.md` — VRAM budget + выбор моделей
- `finetune-env/collect_rag_v6.py` — выгрузка RAG→JSONL (310 строк, sudo psql, переиспользуемая)
- `finetune-env/dataset_v6_{pool,dedup,train,val}.jsonl` — Alpaca формат
- `MemoryBank/sessions/2026-05-14.md` — полный summary дня

**Не сделано / отложено:**
- **Phase 2 (вечером дома):** скачать Qwen/Qwen2.5-Coder-14B-Instruct (~28 GB) + Qwen3-14B + Coder-7B-Instruct (~70 GB суммарно)
- **Phase 5 (после привоза):** full Phase B на Coder-14B (8-12 ч ночью)
- **Phase 6:** post_train.sh (bash-аналог post_train.ps1) + Ollama deploy + inference_compare Q1-Q6

---

## 2026-05-13 вечер — RAG Stack Bringup на Debian

Подняли полный RAG стек с нуля. **19,961 row в `rag_dsp.*`** (5396 BGE-M3 embeddings + 2591 doc_blocks + 900 test_params + ...).
Все 5 сервисов с autostart через systemd + linger=yes (PG/Qdrant/Ollama/embed/dsp-asst).

**Документы:**
- `specs_Linux_Radion_9070/rag_stack_cheatsheet_2026-05-13.md` — команды управления стеком
- `specs_Linux_Radion_9070/rag_stack_boot_architecture_2026-05-13.md` — boot architecture + troubleshooting
- **`TASK_RAG_remaining_work_2026-05-13.md`** — что осталось доделать (план на завтра+)

**MCP в Claude Code:** `/home/alex/DSP-GPU/.claude/settings.json` (mcpServers.dsp-asst → `http://127.0.0.1:7821` stdio).
**Patches в finetune-env:** cli/main.py (5×`--root`), embedder.py (env+auto-cuda), ingest_test_tags.py (env), новые `migrate_pgvector_to_qdrant.py` + `re_ingest_all.sh`.

---

## ✅ Закрыто 2026-05-13

### TASK_install_rocm_hip_sdk_debian — ROCm 7.2 devkit на Debian 13 trixie ✅
- 76 .deb из offline-pack (Ubuntu noble) **не лезут** на Debian 13 (libc 2.41 vs 2.39, gcc-13 conflicts)
- Решение: `sudo apt install hipcc hip-dev rocm-llvm hipfft-dev rocblas-dev rocsolver-dev rocprim-dev rocrand-dev hipblas-dev rocm-opencl-runtime` напрямую из подключённого `repo.radeon.com/rocm/apt/7.2/noble` (~3.7 GB скачано)
- Smoke 9/9 PASS: hipcc 1.1.1 (ROCm 7.2.26015), AMD clang 22.0.0, /opt/rocm-7.2.0/lib/cmake/hip/hip-config.cmake ✅, headers (hipfft/rocblas/rocsolver/rocprim/rocrand) ✅
- Подробности: `changelog/2026-05.md`

### TASK_namespace_migration_debian_acceptance — 26/26 PASS 🎉
- Acceptance script `scripts/debian_deploy/acceptance_namespace_migration.sh` прошёл **26/26** после 8 групп фиксов (G1-G8) за 12 итераций
- G1 spectrum_maxima_types.h include → `<dsp/spectrum/types/...>` (1 файл, закрыло 4 build FAIL)
- G2 cmake configure stats+strategies — side-effect отсутствия hipcc, разрешилось при devkit
- G3 hipblas + rocm-opencl-runtime — отдельные apt пакеты
- G4 namespace shadow `dsp::X::` → `::dsp::X::` (34 файла)
- G5 fake-nested `namespace dsp::stats::snr_defaults` (внутри `dsp::stats`) → `namespace snr_defaults` (3 файла)
- G6 antenna_fft (global) vs dsp::spectrum + drv_gpu_lib::OutputDestination (5 файлов)
- G7 tests legacy `signal_gen::` + `drv_gpu_lib::Heterodyne*` (6 файлов)
- G8 HeterodyneROCmProfEvents namespace fix (тип жив в `dsp::heterodyne::`, ~2 файла)
- Результат: 7/7 build, 9/9 ctest, 8/8 Python imports, 2/2 Python integration tests
- Подробности: `tasks/TASK_namespace_migration_debian_acceptance_2026-05-12.md` + `changelog/2026-05.md`

### TASK_validators_linalg_pilot (V2) — обнаружено DONE inspection'ом ✅
- В `linalg/tests/` **0** ручных `if (err >= TOL) throw`, **15** использований `gpu_test_utils::ScalarAbsError`
- Все 4 целевых файла (test_cholesky_inverter_rocm, test_cross_backend_conversion, test_capon_opencl_to_rocm, test_capon_hip_opencl_to_rocm) уже мигрированы
- Файлы собрались зелёным в acceptance v12 (26/26)
- Подробности: `tasks/TASK_validators_linalg_pilot_2026-05-04.md` ✅ DONE
- Следующий шаг (отдельный TASK): rollout-фаза на остальные 7 модулей

### TASK_python_migration_phase_B_debian (P1) — 50 t_*.py: 43 PASS / 1 SKIP / 6 FAIL ✅
- Точный пересчёт через regex `Total: N passed, M failed, K skipped` (первая попытка дала ложные SKIP из-за case-insensitive 'SKIP' в output)
- **86% pass rate** на RX 9070 gfx1201 (43 из 50)
- 6 FAIL'ов — НЕ инфраструктурные (after namespace fix), а реальные numerical / API проблемы
- FAIL'ы зафиксированы в `tasks/TASK_python_migration_phase_B_FAILS_2026-05-04.md` (обновлён секцией 2026-05-13)
- Категории: heterodyne полный провал (1×4F), numerical mismatch (3 файла), API mismatch ai_pipeline (1×4F), linalg capon (1)
- Артефакты: `/tmp/python_tests_report_v2.json`, `/tmp/p1_v2_full.log`

### TASK_continue_embedding_setup — локальный bge-m3 для Continue @codebase ✅
- venv `~/.continue/.venv` (Python 3.13, ~30 MB из pypi: onnxruntime 1.26, fastapi, uvicorn, tokenizers, numpy, pydantic) — offline-pack cp312 wheels не подошли под системный 3.13
- `~/.continue/embed_server.py` (FastAPI + bge-m3 ONNX, dim=1024, 8K ctx)
- systemd user unit `embed.service` — active (running), ExecStart через venv-python
- `~/.continue/config.yaml` — добавлен `bge-m3 (local)` openai-совместимый embed provider (с backup); Qwen chat/autocomplete не тронуты
- Smoke: /health ok, /v1/embeddings en+ru → 2×1024
- Подробности: `tasks/TASK_continue_embedding_setup.md` + `changelog/2026-05.md`

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
| **DS_HUMAN_DOCS** | human-written доки: repo_docs 41 + membank_specs 19 + architecture 4 + dsp_docs 75 + doc_deep 179 + examples_agent 7 = **325 пар** | ✅ **DoD 10.05** (Кодо main: 6 скриптов; `dataset_v3` 5113→**5703** +12%) | — | DS_USAGE_AUG ✅ |
| **DS_FB_PY** | feedback (5) + DSP/Python/**/*.py (50 t_*.py + 48 lib) | ✅ **DoD 10.05** (Кодо main: 103 пары; `dataset_v3` 5703→**5822** +2%) | — | DS_HUMAN_DOCS ✅ |
| **DS_FINAL** | sister: prompts_changelog (47) + agent_examples (16) интегрированы | ✅ **DoD 10.05** (`dataset_v3` 5822→**5869**; **+437% baseline**) | — | DS_FB_PY ✅ |
| **DS_ACK** | A+C+K: inheritance 16 + pybind_modules 8 + cpp_files 69 (моё) + acк_advanced 57 (сестра) | ✅ **DoD 10.05** (`dataset_v3` 5869→**6017** +2.5%; **38 шаблонов**) | — | DS_FINAL ✅ |
| **DS_HIP_PRIM** | sister build_test_infra 28 (test_utils + cmake/*.cmake + CMakePresets) + my hip_primitives 22 (fundamental HIP/ROCm API: hipMalloc/Event/Stream/Kernel/FFT/BLAS/error_handling/device с реальными snippets из кода) | ✅ **DoD 10.05 ULTRA-FINAL** (`dataset_v3` 6017→**6067** +0.8%; **+455% baseline = 5.55x**; **40 шаблонов**; **2428 уникальных** классов; всё-всё-всё исчерпано) | — | DS_ACK ✅ |
| **DS_HIP_KERNELS** | [TASK_RAG_dataset_hip_kernels_2026-05-10.md](TASK_RAG_dataset_hip_kernels_2026-05-10.md) — HIP+OpenCL kernel sources из `<repo>/include/<repo>/kernels/*_rocm.hpp` (universal regex для 2 backend'ов) | ✅ **DoD 10.05** (Кодо main: 58 kernels из 23 файлов → 81 пара; HIP=56, OpenCL=2 interop; **0/23 файлов с 0 kernels**; 4 итерации regex: \d+→[^)]+ макрос / [^{}]→[^()] комментарии / trailing comments / balanced parens) | — | нет |
| **DS_TEST_OVERVIEW** | [TASK_RAG_dataset_test_overview_2026-05-10.md](TASK_RAG_dataset_test_overview_2026-05-10.md) — пары из C++ `test_*.hpp` 8 репо (header `ЧТО/ЗАЧЕМ/ПОЧЕМУ` + doxygen + run-функции) | ✅ **DoD 10.05** (Кодо main: 75 файлов → **77 пар**; покрытие core 22 + spectrum 18 + linalg 9 + radar 8 + stats 6 + strategies 5 + heterodyne 4 + signal_generators 3; `dataset_v3` 4683→**4756**) | — | нет |
| **DS_MEMBANK_SPECS_EXT** | [TASK_RAG_dataset_membank_specs_ext_2026-05-10.md](TASK_RAG_dataset_membank_specs_ext_2026-05-10.md) — `MemoryBank/specs/*.md` (28 .md ревью/аудиты/планы/proposals; не пересекается с membank_specs/architecture/repo_docs/dsp_docs) | ✅ **DoD 10.05** (Кодо main: 109 пар → 108 после dedup; spec_overview 28 + spec_section 81; `dataset_v3` 4943→**5122**) | — | нет |
| **DS_AGENT_EXAMPLES** | [TASK_RAG_dataset_agent_examples_2026-05-10.md](TASK_RAG_dataset_agent_examples_2026-05-10.md) — `MemoryBank/.agent/` (3 .md) + `DSP/Examples/` (overview + sections + code skeleton, дополняет `examples_agent` сестры) | ✅ **DoD 10.05** (Кодо main: 16 пар, 0 пересечений с `examples_agent`; `dataset_v3` 5122→**5145**; **32 источника**) | — | нет |
| **DS_PROMPTS_CHANGELOG** | [TASK_RAG_dataset_prompts_changelog_2026-05-10.md](TASK_RAG_dataset_prompts_changelog_2026-05-10.md) — `MemoryBank/prompts/` (12 .md handoff'ов + готовые промпты subagents) + `MemoryBank/changelog/` (5 .md) | ✅ **DoD 10.05** (Кодо main: 47 пар = 34 prompts + 13 changelog; `dataset_v3` 5145→**5295**; **34 источника**) | — | нет |
| **DS_ACК_ADVANCED** | [TASK_RAG_dataset_acк_advanced_2026-05-10.md](TASK_RAG_dataset_acк_advanced_2026-05-10.md) — A (cpp impl head топ-50, 25) + C (pybind module full, 8) + K (type hierarchies через regex, 24); решено после обсуждения с сестрой в `prompts/discuss_dataset_next_2026-05-10.md` | ✅ **DoD 10.05** (Кодо main: 57 пар; `dataset_v3` 5295→**5343**; **35 источников**) | — | нет |
| **DS_BUILD_TEST_INFRA** | [TASK_RAG_dataset_build_test_infra_2026-05-10.md](TASK_RAG_dataset_build_test_infra_2026-05-10.md) — `core/test_utils/*.hpp` (test infrastructure) + `<repo>/cmake/*.cmake` (fetch_deps, version) + `<repo>/CMakePresets.json` (debian-local-dev/mi100/rx9070) | ✅ **DoD 10.05** (Кодо main: 28 пар = test_utils 2 + cmake 17 + presets 9; `dataset_v3` 5343→**5464**; **39 источников**) | — | нет |
| **DS_EXPLICIT_PATTERNS** | [TASK_RAG_dataset_explicit_patterns_2026-05-10.md](TASK_RAG_dataset_explicit_patterns_2026-05-10.md) — anti-galлюц для GoF (HybridBackend = Bridge, **НЕ** Singleton); парсит `#pattern:Y:X` теги из 8 `<repo>/CLAUDE.md` + Test-фильтр + контр-список | ✅ **DoD 10.05 ночь** (старшая: 34 пары = 29 class_pattern + 5 pattern_list; +Test-fix в `collect_acк_advanced.py` K 57→56; `dataset_v3` 5464→**5506**; **41 источник**) | — | medium-train Q1 inference |
| **DS_PATTERNS_MD** | [TASK_RAG_dataset_patterns_md_2026-05-10.md](TASK_RAG_dataset_patterns_md_2026-05-10.md) — `<repo>/Doc/Patterns.md` × 8 (старшая ingest collect_patterns_md.py + сестра gen_patterns_drafts.py + cleanup _RAG.md/CLAUDE.md sync) | ✅ **DoD 10.05 ночь→вечер** (combined: 89 классов / 30 паттернов / 8 репо; gen 4 скрипта от сестры + ingest collect_patterns_md.py от старшей; `_RAG.md tags` +62/-5; CLAUDE.md sync +61/-7) | — | DS_EXPLICIT_PATTERNS ✅ + Alex Patterns.md |
| **DS_PATTERNS_P0_FIX** | 9 P0 правок Patterns.md по результатам deep-reviewer (старшая: 5 brief'ов с `@ingroup grp_*` → реальные из CLAUDE.md в stats/spectrum/linalg/heterodyne/radar; 3 wrong file:line в strategies — IPipelineStep :24→:70 / PipelineStepBase :34→:99 / PipelineContext :20→:57; 1 IStorageBackend Bridge→Strategy в core от сестры) | ✅ **DoD 10.05 ночь** (старшая: 9/9 P0 закрыто, dataset_patterns_md re-collected 115→106 в split; `dataset_v3` rebuild → **5883 пар, 44 источника, +438% baseline = 5.38x**; snapshot `dataset_v3_final_2026-05-10.jsonl` обновлён) | — | DS_PATTERNS_MD ✅ + deep-review |
| **V4_CLEANUP_FINAL** | [TASK_DATASET_v4_cleanup_2026-05-10.md](TASK_DATASET_v4_cleanup_2026-05-10.md) — Шаги 1+2+4 (трекики сестры, выполнены старшей после ухода сестры) | ✅ **DoD 10.05 вечер** (Кодо main: T1.1 collect_inheritance Test-фильтр → 16 ifaces / 28 impls (без Test*); P0 collect_negative_pairs FAKE 10→30 + limit 80→160 + 2 typo (typo_double/typo_case) → **418 пар** (было 261); T2 collect_namespace_correction NEW → **130 пар** (113 A + 8 B + 9 C); rebuild dataset_v3 = **5885**; snapshot `dataset_v4_2026-05-11.jsonl` = 5885; split train **5071** / val **814** seed=42) | — | DS_PATTERNS_MD ✅ |
| **PHASE_B_PREP** | [phase_b_dataset_prep_2026-05-10.md](../specs/LLM_and_RAG/phase_b_dataset_prep_2026-05-10.md) — train/val split + health-check `dataset_v3.jsonl` для Phase B 12.05 | ✅ **DoD 10.05** (Кодо main: stratified split seed=42 → train 4583 + val 760 = 5343; health: 0 missing, output median 604, 35 sources via `# Concept:`, 816 классов; `prepare_phase_b.py` NEW) | — | DS_ACК_ADVANCED ✅ |
| **DATASET_V3_FINAL** | snapshot `dataset_v3_final_2026-05-10.jsonl` (cap=30, 6067 пар, 40 шаблонов, 2428 классов, +455% baseline = 5.55x) + `preflight_smoke_check.py` (libs / GPU sm_75 / VRAM 11GB / model qwen3-8b 15.26GB / datasets) | ✅ **DoD 10.05** (Кодо main: snapshot защита от правок, preflight ALL CHECKS PASSED) | — | DS_BUILD_TEST_INFRA ✅ |
| **SMOKE_2080TI** | smoke train на 2080 Ti для проверки pipeline (alpaca + LoRA r=8 + fp16 + adamw_torch + 350 пар + 1 эпоха) | ✅ **DoD 10.05** (Alex запустил, Кодо main+сестра анализ: train_loss 2.51→**1.49**, eval_loss **1.909**, eval-train gap **−0.25** (НЕ overfit), runtime 6.6 мин (vs 10-15 прогноз), 0 OOM, 0 bf16 errors → spec [smoke_2080ti_2026-05-10_PASSED.md](../specs/LLM_and_RAG/smoke_2080ti_2026-05-10_PASSED.md)) | — | DATASET_V3_FINAL ✅ |
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
