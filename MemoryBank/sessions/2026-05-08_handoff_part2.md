# Handoff сестрёнке — 2026-05-08 (часть 2: C8 + C9)

> Привет, родная. Это вторая передача от Кодо в той же сессии.
> Первая была про graph_extension/mcp_atomic_tools/context_pack — см. `2026-05-08_handoff_to_next_session.md`.

## ⚡ Что от тебя ждут

Реализовать **2 RAG-задачи** (C8 + C9) — параллельный трек к первой группе. Полностью независимы
от всех остальных, разные файлы — конфликтов нет.

| # | Прочитать промпт | Effort | Зависимости |
|---|------------------|--------|-------------|
| 1 | `MemoryBank/prompts/rag_code_embeddings_2026-05-08.md` | ~5-6 ч | none |
| 2 | `MemoryBank/prompts/rag_late_chunking_2026-05-08.md` | ~2 ч | none |

Итого ~7-8 ч. Можно делать **параллельно разными сёстрами** (см. NOTE N1 в ревью).

## 📖 Прочитать ПЕРВЫМ

1. `MemoryBank/MASTER_INDEX.md` + `MemoryBank/tasks/IN_PROGRESS.md`
2. `MemoryBank/tasks/TASK_RAG_context_fuel_2026-05-08.md` — координатор
3. **`MemoryBank/specs/rag_prompts_review_part2_2026-05-08.md`** — ревью с warnings W1-W4 (важно!)
4. Свой целевой промпт

## 🚨 Жёсткие правила (повторно — не забывать)

- ❌ **`pytest` запрещён** — только `common.runner.TestRunner` + `SkipTest`
- ❌ **CMake** не трогать без OK Alex (SQL-миграции — OK)
- ❌ **Worktree:** ТОЛЬКО `e:/DSP-GPU/`, НЕ `.claude/worktrees/*/`
- ❌ **git push / tag** — только OK Alex
- ✅ **Не плодить:** существуют `Embedder` (BGE FlagEmbedding) и `_reciprocal_rank_fusion` —
  переиспользовать, не дублировать

## 🧠 Ключевые факты инфраструктуры (экономия времени)

`dsp_assistant` живёт в **`c:/finetune-env/dsp_assistant/`** (не в `e:/DSP-GPU/`!).

**Критические нюансы (учтены в промптах):**

1. **`embeddings` таблица в `public`, не `rag_dsp`**, PK по `symbol_id` → для Nomic нужна
   **отдельная таблица `embeddings_code`** (не `ALTER ADD COLUMN`).
2. **BGE-M3 через `BGEM3FlagModel`** (FlagEmbedding), не raw `transformers`. `.encode()` НЕ
   отдаёт `last_hidden_state` → для late chunking нужен **отдельный `transformers.AutoModel`**
   (тот же XLM-RoBERTa).
3. **Гибрид BGE+Nomic = в `pipeline.py`**, НЕ в `rag_hybrid.py`. Последний обслуживает
   doc_blocks/use_cases/pipelines, Nomic индексирует `symbols` — другая retrieval-область.
4. **`CppSymbol`** имеет только `line_start, line_end` — тело метода читать из файла отдельно.
5. **`_reciprocal_rank_fusion`** уже есть в `pipeline.py:163` — переиспользовать.
6. **GPU память**: BGE FlagEmbedding (~1.2 GB) + Nomic (~1 GB) + AutoModel (~1.2 GB) = ~3.5 GB.
   На 2080 Ti (11 GB) OK, но eval-прогоны разнести во времени.

## 🎯 Стиль Alex (важно)

- **Кодо** или «Любимая умная девочка» — обращение от Alex
- Русский, неформально, эмодзи **по делу**
- **Коротко** (max 5 строк) перед действием
- **Не переспрашивать очевидное.** Если сомнение — один вопрос с A/B/C, дальше выполняем
- Болезненная реакция на: запись в worktree, `pytest`, отсебятину, длинные простыни без действий

## 📦 Граф независимости

```
code_embeddings (C8) ─── independent
late_chunking   (C9) ─── independent
                          │
                          └── оба обновляют разные файлы — параллелятся свободно
                              (общий — только cli/main.py, флаги разные)
```

## ✅ Что я уже сделала (готово)

- 2 промпта в `MemoryBank/prompts/`:
  - `rag_code_embeddings_2026-05-08.md` (C8 — Nomic 768d, отдельная таблица + Qdrant collection)
  - `rag_late_chunking_2026-05-08.md` (C9 — прямой transformers.AutoModel + offset_mapping)
- 1 ревью-документ `MemoryBank/specs/rag_prompts_review_part2_2026-05-08.md` (3 critical archi-fixes
  vs исходный TASK + 4 warnings W1-W4)
- Этот handoff

## 🔚 Что осталось от меня (для тебя)

1. Прочитать handoff + ревью + свой промпт
2. Проверить что `dsp-asst` работает (HTTP сервер `dsp-asst serve` запущен)
3. **W1-W4** из ревью применить при имплементации (тело методов из файла, RRF переиспользовать,
   `use_fast=True`, truncation warning)
4. Eval-отчёт — обязательно (без него не понять эффект)
5. **НЕ** git push без OK Alex

Удачи. Контекст подготовлен полностью.

— Кодо, 2026-05-08
