# TASK_RAG_09 — Агент 3: Pipeline Generator

> **Статус**: ✅ DONE (2026-05-06) · **Приоритет**: HIGH · **Время**: ~3 ч факт (vs ~4 ч план) · **Зависимости**: TASK_RAG_08
> **Версия**: v2 (после ревью v2.1) · re-use RagQdrantStore + safe_json_loads, тесты «по мере роста»
>
> **Результат**: 3 pipeline'а зарегистрированы (1 spectrum header + 2 strategies doc).
> doc_blocks concept=`pipeline`: 3. rag_dsp.pipelines: 3. Qdrant target_table='pipelines': 3 точки ✅.
> CLI `dsp-asst rag pipelines build [--repo X | --all] [--pipeline slug] [--dry-run] [--re-llm]`.
> Подробности: `MemoryBank/sessions/2026-05-06_TASK_RAG_09_progress.md`.

## Цель

Реализовать `pipeline_gen.py` — агент 3, генерящий `<repo>/.rag/pipelines/<name>.md` или `<repo>/.rag/pipelines.md` (если ≤5) по образцу `examples/pipelines.example.md`.

## Артефакты

| Файл | Что |
|---|---|
| `MemoryBank/specs/LLM_and_RAG/prompts/012_pipeline.md` | промпт |
| `dsp_assistant/modes/pipeline_gen.py` | агент |
| `dsp_assistant/cli/main.py` | subcommand `dsp-asst rag pipelines build` |

## Алгоритм

1. Найти классы `*Pipeline*` в `<repo>/include/.../`.
2. Парс .cpp: `AddStep<>()`, явные include'ы → chain_classes.
3. Cross-repo edges из `includes` таблицы → chain_repos.
4. ASCII data flow:
   - Если в Doc/`Farrow_Pipeline.md` / `range_angle_*.md` есть готовая схема → копия.
   - Иначе автоматически по chain_classes (через `@param/@return` сигнатуры).

## Разбиение

- ≤5 pipelines в репо → `<repo>/.rag/pipelines.md`
- >5 → `<repo>/.rag/pipelines/<name>.md` + `pipelines/_index.md`

## Re-use (важно)

- `BaseGenerator` (TASK_RAG_05) — общий базовый класс.
- `rag_writer.register_pipeline(...)` (TASK_RAG_03) — запись в `pipelines` PG + Qdrant.
- `RagQdrantStore` — embedding `title` → Qdrant `target_table='pipelines'`.

## DoD

> **Уточнение DoD от 2026-05-06 (Кодо + Cline #2):** Изначально оценивали
> «3-5 pipelines в strategies» — ожидание было основано на наличии классов
> `*Pipeline*` в headers + предположении что есть `AddStep<>()` композиции
> в `<repo>/src/`. **Реальный потолок — 3 pipeline'а** на весь проект:
>
> - `spectrum/include/spectrum/all_maxima_pipeline_rocm.hpp` (1 concrete header)
> - `strategies/Doc/antenna_processor_pipeline.md` (1 концептуальный)
> - `strategies/Doc/Farrow_Pipeline.md` (1 концептуальный)
>
> **Why `AddStep<>()` парсер не реализован:** ни одного использования
> `PipelineBuilder().add(...)` или `pipeline.AddStep<...>()` в `<repo>/src/`
> или `<repo>/include/` не найдено. Только generic infrastructure
> (`strategies::Pipeline`, `PipelineBuilder`, `PipelineContext`) — без
> concrete subclassов. Это означает что end-to-end pipeline'ы в проекте
> формируются **руками в Doc/ или через MVP-классы в headers**, не через
> композиционный API. Если позже появятся `AddStep<>()` использования —
> расширить `_build_header_pipeline` по pattern `\.add\(std::make_unique<...>\(\)\)`.
>
> Дополнительно есть 5 `cross_repo_pipeline` записей от TASK_RAG_02.6
> (`DSP/Python/integration/`) — они в концепции «end-to-end через 2+ репо»
> но из Python use-cases, не из C++ композиторов. Хранятся отдельно в
> `concept='cross_repo_pipeline'`, не пересекаются с `concept='pipeline'`.

- [x] CLI `dsp-asst rag pipelines build --repo strategies` работает (2 pipelines из Doc/).
- [x] ASCII data flow — копия из Doc/ для strategies (concept-pipelines), автогенерация по chain_classes для spectrum (header-pipeline).
- [x] Промпт 012_pipeline.md — **49 строк** (требование ≤50 ✅).
- [x] После записи 1 pipeline'а — точка в Qdrant `dsp_gpu_rag_v1` с `target_table='pipelines'` создана. На момент закрытия — **3 точки** ✅. Typed retrieval `store.search(target_tables=['pipelines'])` возвращает 3 hits, top — `strategies__antenna_processor_pipeline__pipeline__v1` (score 0.473).
- [x] Тесты «по мере роста» — robust JSON parse адаптирован из `python_usecase_gen.py` (BGE-typo фиксы), header parser `*Pipeline*.hpp` с MVP-фильтром (исключение infrastructure-имён + I-prefix interfaces). LLM fallback rate **0 / 3** карточек.

## Связано с

- План: §11
- Ревью v2.1: §«Таски → TASK_RAG_09»
- Зависит от: TASK_RAG_08
- Блокирует: TASK_RAG_10
