# TASK_RAG_07 — Агент 2: Use-Case Generator

> **Статус**: pending · **Приоритет**: HIGH · **Время**: ~3.5 ч · **Зависимости**: TASK_RAG_06
> **Версия**: v2 (после ревью v2.1) · re-use BaseGenerator + RagQdrantStore, тесты «по мере роста»

## Цель

Реализовать `usecase_gen.py` — агент 2, генерящий `<repo>/.rag/use_cases/<slug>.md` по образцу `examples/use_case_fft_batch_signal.example.md`.

## Гранулярность

**B** — одна семантическая задача = одна карточка (см. план §10).

## Артефакты

| Файл | Что |
|---|---|
| `MemoryBank/specs/LLM_and_RAG/prompts/011_usecase.md` | промпт |
| `dsp_assistant/modes/usecase_gen.py` | агент (наследуется от `BaseGenerator` из TASK_05) |
| `dsp_assistant/cli/main.py` | subcommand `dsp-asst rag usecases build` |

## Алгоритм определения use-case'ов

1. Из Doc/ — h2 `## Pipeline:` / `## Use-case:` / маркеры.
2. Из тестов `tests/test_*.cpp` — каждый `TEST(...)` с brief'ом.
3. Из `examples/cpp/*.cpp` (если есть в репо).
4. Опция `--suggest-via-ai` — Qwen предлагает 5-15 кандидатов, Alex отбирает.

## Что детерминированно vs LLM

Детерминированно: id, frontmatter, primary_class, related_classes (через retrieval — Qdrant search по primary_class FQN), ссылки на `test_params` блоки (TASK_05), граничные случаи (из @throws).

LLM: synonyms (8 ru + 8 en), tags (5-10), краткое «Когда применять» если нет в Doc/.

## Re-use (важно)

- `BaseGenerator` (TASK_RAG_05) — общий базовый класс, переиспользуем.
- `rag_writer.register_use_case(...)` (TASK_RAG_03) — запись в `use_cases` PG + Qdrant.
- `RagQdrantStore` — embedding `title + synonyms` → Qdrant `target_table='use_cases'`.

## DoD

- [ ] Запуск `--dry-run` на spectrum предлагает 6-10 кандидатов.
- [ ] CLI `dsp-asst rag usecases build --repo spectrum --use-case fft_batch_signal` создаёт корректный файл.
- [ ] Все `block_refs` в YAML-frontmatter указывают на существующие записи в `doc_blocks`.
- [ ] После записи 1 use_case'а — точка в Qdrant `dsp_gpu_rag_v1` с `target_table='use_cases'` создана.
- [ ] Тесты «по мере роста на самые важные моменты» (без жёсткого `≥80%`).

## Связано с

- План: §10
- Ревью v2.1: §«Таски → TASK_RAG_07»
- Зависит от: TASK_RAG_06
- Блокирует: TASK_RAG_08
