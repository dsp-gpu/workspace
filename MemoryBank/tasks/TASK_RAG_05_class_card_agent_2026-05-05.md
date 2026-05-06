# TASK_RAG_05 — Агент 1: Class-Card Generator

> **Статус**: ✅ DONE v1 (2026-05-06, без LLM) · **Приоритет**: HIGH · **Время**: ~3 ч факт · **Зависимости**: TASK_RAG_04, **TASK_remove_opencl_enum**
> **Версия**: v2 (после ревью v2.1) · убрано ≥80% покрытие, запись в test_params + doc_blocks
> **Исполнитель**: Кодо в основном чате.
>
> **Pilot результат** (FFTProcessorROCm в spectrum):
> - 5 public методов извлечено через `agent_doxytags/extractor.py`
> - 11 doc_blocks зарегистрировано (1 class_overview + 5 method_signature + 5 method_doxygen)
> - Перегрузки `ProcessComplex` (×2) и `ProcessMagPhase` (×2) различены через `sub_index 001/002`
> - `<repo>/.rag/test_params/fft_processor_FFTProcessorROCm.md` (10 KB) создан
> - PG ↔ Qdrant: spectrum 460 → 471 (+11) ✅
> - 17 Layer-6 классов в spectrum найдены через эвристику (имя + namespace + path)
>
> **Реализация v1** (в `C:\finetune-env\dsp_assistant\`, не в DSP-GPU):
> - `modes/class_card.py` — основная логика, find_layer6_classes, build_class_card
> - `cli/main.py` — добавлен `dsp-asst rag cards build --repo X [--class Y] [--dry-run]`
> - Smart `to_snake_case_smart`: handle ROCm/OpenCL mixed-case acronyms (FFTProcessorROCm → fft_processor_rocm, не fft_processor_ro_cm)
> - Sub_index для перегрузок: `method_<name>_signature_001/_002__v1`
>
> **v2 follow-up** (отдельный таск): промпт `010_class_card.md` для LLM AI summary `class_overview` (сейчас стоит первая строка doxy_brief — слабо). Раскатка на 16 оставшихся Layer-6 классов spectrum + 7 других репо.
>
> **v2 DONE** (2026-05-06):
> - Промпт `prompts/010_class_card.md` создан (JSON-output: what/why/how/usage_example/synonyms_ru/synonyms_en/tags).
> - `class_card.py` расширен функцией `generate_ai_overview()` через `OllamaClient` (Qwen3 8B, temperature=0.2).
> - `AIOverview` dataclass + интеграция в `build_class_card_md()` и `_make_overview_block()`.
> - CLI: флаг `--llm/--no-llm` (default: no-llm для backward compat).
> - Pilot v2 на FFTProcessorROCm: 22.6 сек, 1158 output tokens, JSON распарсен, frontmatter обогащён synonyms+tags, ЧТО/ЗАЧЕМ/КАК секции вместо одной строки `/// @ingroup grp_fft_func`.
> - `ai_generated=true, parser_version=2` в frontmatter.
>
> **v2 Full pilot на spectrum** (2026-05-06):
> - Эвристика `find_layer6_classes` улучшена:
>   - `DISTINCT ON (s.fqn)` в SQL — устраняет дубликаты forward decl vs definition
>   - `_is_interface_name()` — exclude `I[A-Z][a-z]*Pattern` (interfaces НЕ Layer-6)
>   - `_is_factory_name()` — exclude `*Factory$` (фабрики НЕ Layer-6)
> - 17 (raw) → 11 (after DISTINCT) → **8 (after filter)** чистых Layer-6 классов
> - Прогон `--llm` на 8 классов: 0 errors, все ai=🤖, ~88 блоков в БД
> - `cleanup_class_card_orphans.py` удалил 3 orphan-карточки (IAllMaximaPipeline, ISpectrumProcessor, SpectrumProcessorFactory) + 31 связанный блок из PG+Qdrant
>
> Финальный набор spectrum class-cards (8): AllMaximaPipelineROCm, FFTProcessorROCm, FirFilterROCm, IirFilterROCm, KalmanFilterROCm, KaufmanFilterROCm, MovingAverageFilterROCm, SpectrumProcessorROCm.

## Цель

Реализовать первого из трёх RAG-агентов: `class_card.py`, который генерит `<repo>/.rag/test_params/<ns>_<Class>.md` по образцу `examples/fft_processor_FFTProcessorROCm_old.md`.

## Pre-requirements

- **TASK_remove_opencl_enum** завершён (иначе агент столкнётся с OPENCL enum-веткой).
- TASK_RAG_04 завершён — `doc_blocks` для spectrum существуют.

## Артефакты

| Файл | Что |
|---|---|
| `MemoryBank/specs/LLM_and_RAG/prompts/010_class_card.md` | промпт для AI-stub частей |
| `dsp_assistant/modes/class_card.py` | агент |
| `dsp_assistant/modes/base_generator.py` | общий базовый класс для 3 агентов (`db`, `llm`, `walker`, `extractor`, `rag_writer`, `rag_qdrant_store` слоты) |
| `dsp_assistant/cli/main.py` | subcommand `dsp-asst rag cards build` |

## Архитектура

См. план §9. Главное:
- **Детерминированно (Python)**: frontmatter, сигнатуры из header, методы, параметры из @test*, throws, перегрузки.
- **LLM (Qwen)**: только если в Doc/ нет `class_overview` или `usage_example` — короткий стаб с placeholder Q-номером.
- **Re-use**: `agent_doxytags/extractor.py` для парса @test, `index_class.py` для JSON-сводки (опц.), `rag_writer` (TASK_03), `RagQdrantStore` (TASK_03).

## Куда пишет class-card (решение Alex'а #1, ревью v2.1)

| Цель | Куда пишется |
|---|---|
| Метаданные методов класса (сигнатуры, @test, params) | существующая таблица **`test_params`** (одна запись на метод) |
| Описательные блоки (`class_overview`, `usage_example`) | таблица **`doc_blocks`** + Qdrant |
| Use-cases | **НЕ пишет** — это работа TASK_RAG_07 (агент 2) |

## DoD

- [ ] `class_card.py` написан и работает (тесты «по мере роста на самые важные моменты» — без жёсткого `≥80% coverage`).
- [ ] `base_generator.py` написан — общий базовый класс для 3 агентов с слотами `db`, `llm`, `rag_writer`, `rag_qdrant_store`.
- [ ] Промпт 010 в `prompts/010_class_card.md`.
- [ ] Запуск `--dry-run` на FFTProcessorROCm даёт корректный diff.
- [ ] CLI `dsp-asst rag cards build --repo spectrum --class FFTProcessorROCm --dry-run` работает.
- [ ] Smoke-тест: запись 1 method'а в `test_params` + 1 блока `class_overview` в `doc_blocks` + точка в Qdrant `dsp_gpu_rag_v1`.
- [ ] **НЕ пишет** в `use_cases` (проверка `\d rag_dsp.use_cases` после прогона — count тот же).

## Связано с

- План: §9
- Ревью v2.1: §«Решения Alex'а» #1, §«Таски → TASK_RAG_05»
- Зависит от: TASK_RAG_04 + TASK_remove_opencl_enum
- Блокирует: TASK_RAG_06
