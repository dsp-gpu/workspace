# Handoff Кодо-сестрёнке — 2026-05-08 поздний вечер

> **От:** Кодо main (контекст ~25%, передаю эстафету)
> **К:** новой сестрёнке-Кодо
> **Главная цель:** Phase B QLoRA на AMD Radeon RX 9070 — стартует **12.05.26**, 4 дня до дедлайна.

---

## 0. Прочитать ПЕРВЫМ (15 мин)

1. **`MemoryBank/MASTER_INDEX.md`** + **`MemoryBank/tasks/IN_PROGRESS.md`** — статус 13 подтасков RAG.
2. **`MemoryBank/tasks/TASK_RAG_context_fuel_2026-05-08.md`** — координатор с картой зависимостей.
3. **Этот файл целиком.**
4. По мере необходимости:
   - `prompts/handoff_RAG_hybrid_eval_2026-05-08.md` — мой предыдущий handoff про hybrid+eval
   - `specs/LLM_and_RAG/_state_analysis_2026-05-08_pre_hybrid_eval.md` — факты о БД
   - `RAG_deep_analysis_2026-05-08.md` v1.2 — strategic brief

---

## 1. ЖЁСТКИЕ ПРАВИЛА (нарушать нельзя)

| # | Правило | Где |
|---|---|---|
| 1 | **Worktree safety** — писать только в `e:/DSP-GPU/` или `C:/finetune-env/dsp_assistant/`. **НЕ** в `.claude/worktrees/*/` | `.claude/rules/03` |
| 2 | **CMake** — не менять без явного OK Alex | `.claude/rules/12` |
| 3 | **git push/tag** — только по «да» от Alex | `.claude/rules/02`, исключение «запушь всё» по `rules/16` |
| 4 | **pytest ЗАПРЕЩЁН НАВСЕГДА** — только `gpu_test_utils::TestRunner` + `SkipTest` | `.claude/rules/04` |
| 5 | Не плодить — переиспользовать `_reciprocal_rank_fusion` (без weights), `Embedder.encode_texts` (НЕ encode_passages) | — |
| 6 | Перед утверждением про API/класс/путь — **прочитать реальный исходник** | `.claude/rules/00` |

**Стиль Alex:** русский, неформально. Обращение «Кодо» / «Любимая умная девочка». Болезненная реакция: запись в worktree, pytest, отсебятина (изменение архитектуры без согласования), длинные простыни без действий.

---

## 2. ЧТО ЗАКРЫТО ЗА ЭТУ СЕССИЮ (8.05)

| # | Что | Commits |
|---|---|---|
| ✅ CTX0 | Schema migration (M1+M2) — 9 cols в `test_params`, `search_tsv` в 3 RAG-таблицах | finetune-env `c0cb2c1` |
| ✅ CTX3.A.1 | Sparse BM25 + RRF в `rag_hybrid.py` — **Finding #1 закрыт** (FFT use-case в top-3 на русском NL) | finetune-env `ec006b3` |
| ✅ CTX3.A.2 | HyDE + auto-classifier + LRU/TTL cache (Qwen3-8B, `think=false`) | finetune-env `5aa92bd` |
| ✅ Meta-review | 11 inline правок промптов C8 + C9 (deep-reviewer agent) | DSP-GPU `581e304` |
| ✅ C9 deferred | C9 late_chunking → 12.05.26 (AMD Radeon, transformers 4.46 venv) | DSP-GPU `2248aca` |
| ✅ EV.E1 | `qa_v2.jsonl` 100 строк × 7 intents + `GoldenItem.intent` + `load_golden(intent=)` filter + `by_intent()` | DSP-GPU `5b9b517`, finetune-env `2a4aa84` |

**Параллельно сёстры (по статусу IN_PROGRESS):**
- 🚧 **CTX0/1/2** sister: `test_params_fill` (CTX1 ✅ 396 LEVEL 0) + `doxygen_test_parser` (CTX2)
- 🚧 **#2** sister (или на паузе — 0 коммитов): graph_extension, mcp_atomic_tools, context_pack
- 🚧 **C9** sister (deferred): scaffolding `embedder_bge_late.py` остался в C:/finetune-env

---

## 3. ЧТО ОСТАЛОСЬ (приоритет до 12.05)

### 🔴 P0 — критический путь к Phase B QLoRA

| # | Таск | Effort | Зависимости |
|---|---|---|---|
| **DS** | `TASK_RAG_dataset_generation_for_qlora_2026-05-08.md` | ~6-8 ч | CTX1 ✅ (396 LEVEL 0) — можно стартовать |
| **EV.E2** | RAGAs faithfulness/answer_relevance/context_precision/context_recall | ~1 ч | EV.E1 ✅ (мой) |

→ **DS — главное**: без датасета QLoRA не запустится 12.05. **EV.E2** — антигаллюцинация (faithfulness ≥ 0.7 на v2).

### 🟠 P1 — дополнительное качество

| # | Таск | Effort | Прим. |
|---|---|---|---|
| **CTX4** | `TASK_RAG_mcp_atomic_tools` — 4 новых MCP-инструмента | ~1.5 ч | **Я (Кодо main) перехватила, не успела** — см. §4 |
| **EV.E3** | CI workflow `.github/workflows/rag_eval.yml` | ~1.5 ч | После EV.E2 |
| **EV.E4** | Pre-commit hook `_RAG.md` старения | ~30 мин | Простой shell-скрипт |
| **CTX3.A.3** | Eval отчёт `_eval_hybrid_upgrade_2026-05-XX.md` | ~30 мин | **Требует Qdrant** → только на Debian |

### 🟡 P2 — нет блокеров

- **CTX6** code_embeddings (Nomic-Embed-Code) ~5-6 ч — независим
- **CTX8** telemetry ~1 ч — ждёт `TestRunner::OnTestComplete` (от V2 sister linalg pilot)
- **GR** graph_extension ~9 ч — у sister #2 в работе (если она вернётся)

### ⏸️ Отложено

- **CTX7** late_chunking → 12.05.26 (AMD Radeon, transformers 4.46 venv)

---

## 4. CTX4 mcp_atomic_tools — детальный план (если возьмёшь)

**Зачем:** 4 atomic MCP-инструмента дают LLM прямой доступ к таблицам RAG-схемы (без HybridRetriever).

**Файлы:**
- `C:/finetune-env/dsp_assistant/server/mcp_server.py` (или где определены `dsp_find` / `dsp_search` / `dsp_show_symbol`) — расширить.
- TASK: `MemoryBank/tasks/TASK_RAG_mcp_atomic_tools_2026-05-08.md`

**Новые tools:**

| Имя | SQL источник | Назначение |
|---|---|---|
| `dsp_test_params(class, method?)` | `rag_dsp.test_params` | edge_values + return_checks + throw_checks для AI-генерации тестов |
| `dsp_use_case(use_case_id ИЛИ slug)` | `rag_dsp.use_cases` | full body use-case'а (примеры использования + код) |
| `dsp_pipeline(pipeline_id ИЛИ slug)` | `rag_dsp.pipelines` | composer_class + chain_classes + chain_repos |
| `dsp_doc_block(block_id)` | `rag_dsp.doc_blocks` | content_md полного блока (для AI который нашёл фрагмент через dsp_search и хочет полный контекст) |

**Зависимости:**
- ✅ CTX1 закрыт — `test_params` имеет 396 LEVEL 0 записей
- ❓ CTX2 (doxygen parser) — проверь IN_PROGRESS, может ещё не закрыт. **Если не закрыт — `dsp_test_params` всё равно работает, просто без LEVEL 1 enrichment.**

**Smoke** — каждый tool через `dsp-asst rag mcp call <name> --args '{...}'` либо JSON-RPC roundtrip.

**Не плодить** — рядом с существующими `dsp_find` / `dsp_search`, тот же registration pattern.

---

## 5. EV.E2 RAGAs (~1 ч) — антигаллюцинация

**Файл:** `C:/finetune-env/dsp_assistant/eval/ragas_metrics.py` (НОВЫЙ).

**4 функции** (judge-LLM = Qwen3-8B локально по умолчанию, опционально Claude API через `ANTHROPIC_API_KEY`):

```python
def faithfulness(answer: str, retrieved: list[str], judge_llm) -> float
def answer_relevance(question: str, answer: str, judge_llm) -> float
def context_precision(question: str, retrieved: list[str], judge_llm) -> float
def context_recall(question: str, expected_fqns: list[str], retrieved: list[str], judge_llm) -> float
```

**Воспроизводимость** (Alex настаивал в анкете 8.05): `random_seed=42`, `temperature=0` в judge-вызовах. Snapshot БД до прогона. Полный per-item лог в `eval_reports/YYYY-MM-DD_HH-MM_<commit_sha>.json`.

**Abstain (новая фича от ответов Alex):** добавить `dsp_assistant/eval/confidence.py` — `should_abstain(top1_rerank_score, threshold=0.4) → bool`. Метрика `abstain_rate` в RAGAs отчёте.

**CLI:** `dsp-asst eval run --ragas` — поверх существующего runner.

**DoD:** faithfulness ≥ 0.7 на golden v2.

---

## 6. КЛЮЧЕВЫЕ ФАКТЫ (экономия времени)

### БД
- **Таблица `embeddings` живёт в схеме `rag_dsp`**, не `public` (предыдущая сестра в part2-review ошиблась — TASK был прав, я зафиксировала).
- `rag_dsp.test_params` — **396 LEVEL 0 записей** (CTX1 закрыт).
- `search_tsv` колонки в `doc_blocks(2650)` / `use_cases(123)` / `pipelines(8)` — заполнены, GIN индексы есть.
- `rag_logs.hyde_*` колонки — **отсутствуют** (миграция из `configs/postgres_migration_2026-05-08.sql` не применена). HyDE-кэш в моей реализации **in-memory LRU/TTL**, не БД.

### Retrieval
- `pipeline.py` — для **symbols** (pgvector), **есть sparse + RRF** (для symbols через `symbols.search_vector`).
- `rag_hybrid.py` — для **doc_blocks/use_cases/pipelines** (Qdrant `dsp_gpu_rag_v1` 1024d) + **мой sparse + HyDE** (CTX3 ✅).
- **NE путать!** Code-search → `pipeline.py`. Doc-RAG → `rag_hybrid.py`. Объединение — отдельная задача (C10+).

### Embedder API
- `Embedder.encode_texts(list[str])` — **существующий API**. **НЕ** `encode_passages` (мой баг в промпте C9 §4.3, исправлен в `581e304`).
- `Embedder.encode_query(str)` — single query.

### Stage 1_home (Windows) vs 2_work_local (Debian)
- **1_home** Windows: `vector_db.provider = pgvector` (НЕ Qdrant). Qdrant не запущен.
- **2_work_local** Debian: `vector_db.provider = qdrant`, endpoint `http://localhost:6333`, collection `dsp_gpu_rag_v1`. **Hybrid retrieval (мой CTX3) реально работает только на Debian.**
- Поэтому `CTX3.A.3 eval отчёт` нужно делать на Debian — на 1_home Qdrant нет.

### LLM
- 1_home: Ollama `qwen3:8b` на `http://localhost:11434`. Для thinking-моделей нужно `think=false` в API (Ollama 0.10+) либо `/no_think` в prompt.
- 2_work_local: Ollama `qwen3:32b`.
- Мой HyDE-генератор проходит direct POST `/api/generate` с `think=false` (см. `dsp_assistant/retrieval/hyde.py:_ollama_generate_no_think`).

### transformers версия
- В `c:/finetune-env/.venv` стоит `transformers==5.7.0`. Несовместим с custom-code моделями (Jina v3 LoRA, Nomic-text-v1.5 BERT). Для C9 нужен **отдельный venv** с `transformers==4.46.0`.

### CLI Click
- `cli/main.py:1060` — `rag_group`. Подгруппы: `rag blocks` (1065), `rag python` (1196).
- Для CTX6 добавлять `rag embed nomic-code` — новая subgroup рядом, **НЕ** трогать `index embeddings` (legacy).

---

## 7. ПОДВОДНЫЕ КАМНИ (на которые я наступила)

1. **Qwen3 thinking-режим**: `/no_think` в prompt НЕ срабатывает на ollama 0.10+. Нужно `think=false` в body параметре `/api/generate`. См. `hyde.py:_ollama_generate_no_think`.
2. **websearch_to_tsquery склеивает AND**: на русском NL «как использовать FFT в Python» — 0 hits потому что слова 'как'/'в' не в content_md. **Решение**: токенизация в Python + OR-tsquery (`'как | использовать | fft | python'`). См. `rag_hybrid.py:_to_or_tsquery_str`.
3. **CamelCase classifier для HyDE**: regex `[A-Z]{2,}` ловил `FFT`/`ROCm` как класс. Правильный — `\w*[a-z]\w*[A-Z]\w*` (mixed case с переходом lower→upper). См. `hyde.py:_RE_CAMELCASE_CLASS`.
4. **`_reciprocal_rank_fusion`** в `pipeline.py:163` — **БЕЗ weights, БЕЗ N-way merge**. Если нужны веса — пиши новую `_weighted_rrf_merge` или расширяй существующую (вариант B рекомендую — меньше регресса).
5. **Sync_rules pre-commit hook** в `e:/DSP-GPU/` — может автоматически добавить файлы в чужой коммит через `git add -A`. Не паникуй если твой `git diff` пустой — возможно сестра захватила твои edit'ы своим коммитом.

---

## 8. КОГДА ВСТРЯНЕШЬ

1. Не гадай — спроси Alex одним коротким вопросом A/B/C.
2. Признаём ошибки взаимно. Если что-то поломала — пиши прямо, не маскируй.
3. Контекст кончается → этот же шаблон handoff передай следующей сестрёнке.
4. **Финальная фраза в session log:** `MemoryBank/sessions/2026-05-XX.md` + строчка в `MemoryBank/changelog/2026-05.md`.

---

## 9. ССЫЛКИ

- Координатор: `MemoryBank/tasks/TASK_RAG_context_fuel_2026-05-08.md`
- Strategic brief: `MemoryBank/specs/LLM_and_RAG/RAG_deep_analysis_2026-05-08.md` v1.2
- Predecessor handoff (моё первое): `MemoryBank/prompts/handoff_RAG_hybrid_eval_2026-05-08.md`
- State analysis: `MemoryBank/specs/LLM_and_RAG/_state_analysis_2026-05-08_pre_hybrid_eval.md`
- Sister review C9: `MemoryBank/specs/rag_late_chunking_implementation_review_2026-05-08.md`
- Sister C9 eval: `MemoryBank/specs/LLM_and_RAG/_eval_late_chunking_2026-05-08.md`
- Phase B QLoRA: `MemoryBank/tasks/TASK_FINETUNE_phase_B_2026-05-12.md`

---

**Удачи, родная 🐾 Главное — DS dataset до 12.05, остальное по приоритету. Phase B QLoRA на 9070 ждёт.**

*От: Кодо main (8.05 поздний вечер) → к: Кодо (новая сессия)*
