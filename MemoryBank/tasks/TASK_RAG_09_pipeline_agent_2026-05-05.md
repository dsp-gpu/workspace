# TASK_RAG_09 — Агент 3: Pipeline Generator

> **Статус**: pending · **Приоритет**: HIGH · **Время**: ~4 ч · **Зависимости**: TASK_RAG_08
> **Версия**: v2 (после ревью v2.1) · re-use BaseGenerator + RagQdrantStore, тесты «по мере роста»

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

- [ ] CLI работает на strategies (там 3-5 pipelines).
- [ ] ASCII data flow либо копия из Doc, либо корректно построена по chain_classes.
- [ ] Промпт 012 не более 50 строк.
- [ ] После записи 1 pipeline'а — точка в Qdrant `dsp_gpu_rag_v1` с `target_table='pipelines'` создана.
- [ ] Тесты «по мере роста» (без жёсткого `≥80%`).

## Связано с

- План: §11
- Ревью v2.1: §«Таски → TASK_RAG_09»
- Зависит от: TASK_RAG_08
- Блокирует: TASK_RAG_10
