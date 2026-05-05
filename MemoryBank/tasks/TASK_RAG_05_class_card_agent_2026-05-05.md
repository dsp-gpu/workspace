# TASK_RAG_05 — Агент 1: Class-Card Generator

> **Статус**: pending · **Приоритет**: HIGH · **Время**: ~4 ч · **Зависимости**: TASK_RAG_04, **TASK_remove_opencl_enum**
> **Версия**: v2 (после ревью v2.1) · убрано ≥80% покрытие, запись в test_params + doc_blocks

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
