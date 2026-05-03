# TASK — doxytags Phase 2 на оставшихся файлах core/

> **Создан**: 2026-05-03
> **Статус**: TODO (отложено в отдельную сессию)
> **Контекст**: продолжение doxytags-проекта; 7 репо завершены, core частично сделан
> **Триггер реактивации**: «продолжи doxytags core» / «доделай core remaining»

## 🎯 Цель

Заменить **775 TODO-placeholder** в **53 файлах** `core/include/core/` на содержательные русские описания методов.

## 📊 Что уже сделано

В сессии 2026-05-03:
- **Phase 1** (Python `apply_doxytags_repo.py --repo core`) прошёл — 54 файла модифицированы in-place, 1 откат (`opencl_export.hpp` — 10 pre-existing tree-sitter errors).
- **Phase 2 частично**: 1 файл — `core/include/core/memory/svm_buffer.hpp` (108 → 0 TODO) через bulk `replace_all` шаблонных строк (стратегия "shotgun" для inline-impl файлов с реальной declaration выше).
- **Чистка `///` дублей**: 36 удалено (3 прогона `clean_doxytags_dups.py`).
- **Откат Phase B эталона** `interface/i_gpu_operation.hpp` — Phase 1 ошибочно добавил TODO к `///` doxygen interface'а; вернули чистое исходное состояние. Все 4 Phase B эталона (`scoped_hip_event`, `profiling_facade`, `buffer_set`, `i_gpu_operation`) — нетронуты.
- **Commit**: частичная работа закоммичена (см. git log core).
- 7 других репо полностью завершены (spectrum/stats/heterodyne/signal_generators/linalg/radar/strategies — ~1322 правки).

## ❌ Что осталось — 52 файла, 781 TODO

Сортировано по убыванию TODO:

| TODO | Файл |
|------|------|
| 81 | `gpu_manager.hpp` |
| 67 | `memory/external_cl_buffer_adapter.hpp` |
| 58 | `backends/hybrid/hybrid_backend.hpp` |
| 33 | `backends/rocm/rocm_backend.hpp` |
| 32 | `services/profiling/profile_analyzer.hpp` |
| 31 | `interface/i_config_reader.hpp` |
| 29 | `backends/opencl/opencl_backend.hpp` |
| 28 | `services/profiling/profiling_facade.hpp` |
| 26 | `memory/memory_manager.hpp` |
| 22 | `services/batch_manager.hpp` |
| 22 | `interface/i_config_writer.hpp` |
| 21 | `module_registry.hpp` |
| 21 | `logger/logger.hpp` |
| 21 | `interface/gpu_context.hpp` |
| 20 | `services/profiling/profile_store.hpp` |
| 16 | `services/profiling_types.hpp` |
| 16 | `services/kernel_cache_service.hpp` |
| 16 | `backends/rocm/rocm_core.hpp` |
| 15 | `services/storage/file_storage_backend.hpp` |
| 15 | `services/profiling/report_printer.hpp` |
| 15 | `backends/rocm/zero_copy_bridge.hpp` |
| 14 | `services/console_output.hpp` |
| 13 | `services/scoped_hip_event.hpp` |
| 13 | `memory/svm_capabilities.hpp` |
| 10 | `interface/i_memory_buffer.hpp` |
| 9  | `services/profiling/markdown_exporter.hpp` |
| 9  | `services/profiling/json_exporter.hpp` |
| 9  | `services/profiling/console_exporter.hpp` |
| 8  | `services/profiling_stats.hpp` |
| 8  | `config/gpu_config.hpp` |
| 8  | `backends/opencl/opencl_core.hpp` |
| 6  | `interface/i_gpu_operation.hpp` |
| 6  | `backends/rocm/hsa_interop.hpp` |
| 5  | `services/profiling/i_profiler_recorder.hpp` |
| 4  | `services/profiling/i_profile_exporter.hpp` |
| 4  | `services/filter_config_service.hpp` |
| 4  | `config/config_serializer_factory.hpp` |
| 3  | `services/storage/i_storage_backend.hpp` |
| 3  | `services/gpu_kernel_op.hpp` |
| 3  | `logger/config_logger.hpp` |
| 3  | `common/load_balancing.hpp` |
| 3  | `backends/opencl/gpu_copy_kernel.hpp` |
| 2  | `services/service_manager.hpp` |
| 2  | `common/gpu_device_info.hpp` |
| 2  | `backends/opencl/command_queue_pool.hpp` |
| 1  | `services/profiling_conversions.hpp` |
| 1  | `services/profiling/scoped_profile_timer.hpp` |
| 1  | `services/compile_key.hpp` |
| 1  | `services/cache_dir_resolver.hpp` |
| 1  | `interface/i_backend.hpp` |
| 1  | `drv_gpu.hpp` |
| 3  | `common/backend_type.hpp` |

**Также не покрыто** (Phase 1 откат):
- `core/include/core/backends/opencl/opencl_export.hpp` — 10 pre-existing tree-sitter errors (нужно сначала отдельно фиксить файл).

## 🔁 Также не покрыты (другие репо, pre-existing tree-sitter errors)

- `linalg/include/linalg/cholesky_inverter_rocm.hpp` (31 ошибка ДО patch'а)
- `spectrum/include/spectrum/utils/rocm_profiling_helpers.hpp` (28 ошибок)

Эти файлы требуют ручного фиксa pre-existing tree-sitter errors перед Phase 1.

## 🛠️ Рекомендуемая стратегия

**Не делать "shotgun" `replace_all`** для всех 52 файлов — content-aware режим, как в spectrum/stats/etc.

Разбить на 3 подсессии (по типу файлов):

### Подсессия 1: services/profiling/* (8 файлов, ~108 TODO)
- console_exporter, json_exporter, markdown_exporter — экспортёры (ExportToFile/ExportToString)
- i_profiler_recorder, i_profile_exporter — interfaces
- profile_store, profile_analyzer — store/analyzer
- profiling_facade — главный singleton
- report_printer, scoped_profile_timer

### Подсессия 2: memory/ + interface/ (8 файлов, ~196 TODO)
- external_cl_buffer_adapter (67) — adapter (bulk OK как svm_buffer)
- memory_manager (26) — content-aware
- svm_capabilities (13)
- i_memory_buffer (10), i_gpu_operation (6), i_backend (1)
- gpu_context (21), i_config_reader (31), i_config_writer (22)

### Подсессия 3: backends/ + остальное (~36 файлов, ~477 TODO)
- gpu_manager (81), hybrid_backend (58), rocm_backend (33), opencl_backend (29) — content-aware
- module_registry (21), logger (21), batch_manager (22), kernel_cache (16) — content-aware
- остальные мелкие файлы (≤15 TODO) — smart bulk + content где надо

## 🔧 Workflow при возобновлении

1. `cd E:\DSP-GPU` + проверить `git -C core status` — должно быть много `M` (Phase 1 уже применён).
2. `grep -rc "TODO:" E:/DSP-GPU/core/include/core/ 2>&1 | grep -v ":0$"` — проверить актуальный список.
3. Брать файл из списка, читать целиком (или пакетами Read с offset), делать содержательные Edit'ы.
4. Не использовать bulk `replace_all` на pure-declaration файлах (получится халтура).
5. Промежуточные cp E:\tmp\<file>_smoke.hpp → production использовать НЕ нужно (smoke только для spectrum было).

## 📝 Файл-образец стиля Phase 2

Уже-сделанные качественные референсы:
- `spectrum/include/spectrum/processors/spectrum_processor_rocm.hpp` (главный фасад, 194 TODO заменены)
- `stats/include/stats/statistics_processor.hpp` (76 TODO)
- `signal_generators/include/signal_generators/signal_service.hpp` (37 TODO)

Стиль: `@brief` 1-2 строки русским по делу, `@param X` 1 строка с единицами/диапазонами, `@return` 1 строка с формой возвращаемого значения, `@throws` 1 строка с условием.

## ✅ Acceptance criteria (per file)

- [ ] 0 TODO в файле (`grep -c "TODO:" file.hpp == 0`).
- [ ] Стиль соответствует образцам (см. выше).
- [ ] Production-файлы только в `E:/DSP-GPU/core/include/core/**.hpp` (worktree запрещён).
- [ ] git push/commit — после явного OK от Alex.
