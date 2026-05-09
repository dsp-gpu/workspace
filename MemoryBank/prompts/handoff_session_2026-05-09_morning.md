# Handoff Кодо-сестрёнке — 2026-05-09 утро (после большой смены)

> **От:** Кодо main (контекст ~65%, передаю эстафету)
> **К:** новой сестрёнке-Кодо
> **Главная цель:** Phase B QLoRA на AMD Radeon RX 9070 — стартует **12.05.26**, ~3 дня до дедлайна.
> **Ключевое:** RAG-инфраструктура **готова**, осталось 2 трека качества.

---

## 0. Прочитать ПЕРВЫМ (15 мин)

1. **`MemoryBank/MASTER_INDEX.md`** + **`MemoryBank/tasks/IN_PROGRESS.md`** — статус 13 RAG-подтасков.
2. **Этот файл целиком.**
3. **`MemoryBank/tasks/TASK_RAG_claude_md_c4_tags_2026-05-09.md`** — твой следующий после ENRICH_TG.
4. По мере необходимости:
   - `prompts/handoff_session_2026-05-08_late_evening.md` — мой handoff с прошлой сессии
   - `RAG_deep_analysis_2026-05-08.md` v1.2 — strategic brief

---

## 1. ЖЁСТКИЕ ПРАВИЛА (нарушать нельзя)

| # | Правило | Где |
|---|---|---|
| 1 | **Worktree safety** — только `e:/DSP-GPU/` или `C:/finetune-env/dsp_assistant/`. **НЕ** `.claude/worktrees/*/` | rules/03 |
| 2 | **CMake** — не менять без явного OK Alex | rules/12 |
| 3 | **git push/tag** — только по «да» от Alex (исключение «запушь всё» по rules/16) | rules/02, rules/16 |
| 4 | **pytest ЗАПРЕЩЁН** — только `gpu_test_utils::TestRunner` + `SkipTest` | rules/04 |
| 5 | Не плодить — переиспользовать `_reciprocal_rank_fusion` (без weights), `Embedder.encode_texts` (НЕ `encode_passages`) | — |
| 6 | Перед утверждением про API/класс/путь — **прочитать реальный исходник** | rules/00 |

**Стиль Alex:** русский, неформально. Обращение «Кодо» / «Любимая умная девочка». Болезненная реакция: запись в worktree, pytest, отсебятина, длинные простыни без действий.

---

## 2. ЧТО ЗАКРЫТО ЗА СМЕНУ 9.05 УТРО (4 трека)

| # | Задача | Commit | Эффект |
|---|---|---|---|
| 1 | **EV.E2 RAGAs + abstain** | `62a067d` finetune-env | faithfulness(grounded)=0.8, faithfulness(hallucination)=0.0 — антигаллюцинация работает |
| 2 | **CTX4 mcp_atomic_tools** | `0a2882b` finetune-env | 4 tools (test_params/use_case/pipeline/doc_block) |
| 3 | **DS dataset_v3** | `49851a6` finetune-env (мой) + последующий доп от сестры (5 шаблонов) | 1347 → **2213** пар, DoD ≥ 2000 ✅ |
| 4 | **RAG_MAN _RAG.md** (8 саб-репо) | `b424f29` finetune-env + 8 коммитов в саб-репо | 8/8 манифестов с key_classes из CTX1 |

**Параллельно сестра закрыла:**
- ✅ **CTX2 doxygen_test_parser** (БЛОКЕР снят!) — `parse_test_tags.py` + `ingest_test_tags.py`. 219 hpp обработано в 8 репо, **+645 inserted + 505 updated** в `rag_dsp.test_params`. Total **674 → 1319** rows; **983 ready_for_autotest** (было 111). Это **критический рост**: теперь можно автогенерить тесты для 983 методов, а не 111.
- ✅ Последняя докрутка DS до 2213 пар (test_gen вырос 287 → 480 после CTX2).

---

## 3. ЧТО ОСТАЛОСЬ (приоритет до 12.05)

### 🔴 Текущий трек (мой, не закончила)

**RAG_ENRICH_TG** — `C:/finetune-env/enrich_test_gen.py`
- **Статус:** скрипт готов (commit-ready), smoke 5/5 ✅ (без gtest, без обрывов)
- **НЕ запущен на полные 480** (test_gen вырос с 287 до 480 благодаря CTX2 LEVEL 1)
- **Что делать:** прогнать `python enrich_test_gen.py --output dataset_test_gen_enriched.jsonl` — ETA ~40-80 мин на 480 records (qwen3:8b ~5-10s/record)
- **После:** перезапустить `python build_dataset_v3.py --max-per-class 30` чтобы placeholder'ы заменились реальным C++ → финальный `dataset_v3.jsonl` для Phase B
- **Качество:** smoke v2 показал C++ через `gpu_test_utils::TestRunner` без gtest, корректные namespace, правильный API (`runner.Section`/`Pass`/`Fail`)

### 🟠 Новый трек (TASK создан, готов к старту)

**RAG_CLAUDE_C4** — `MemoryBank/tasks/TASK_RAG_claude_md_c4_tags_2026-05-09.md`
- **Идея от Alex:** добавить компактный C4-блок + RAG-теги в каждый из 8 `<repo>/CLAUDE.md`
- **НЕ копировать** полные C4-диаграммы — только ссылка на `MemoryBank/.architecture/` + 5-10 строк специфики
- **Effort:** ~1.5-2 ч, 4 подэтапа в TASK
- **Ключевой результат:** улучшит 3-слойный контекст для QLoRA (workspace/repo/classes) + sparse BM25 retrieval по тегам

### 🟡 Отложено / параллельно

| # | Задача | Effort | Прим. |
|---|---|---|---|
| **EV.E3** | CI workflow `.github/workflows/rag_eval.yml` | ~1.5 ч | После RAG_CLAUDE_C4 |
| **EV.E4** | pre-commit hook `_RAG.md` старения | ~30 мин | Теперь имеет смысл — файлы есть |
| **CTX6** | code_embeddings (Nomic-Embed-Code) | ~5-6 ч | P2, независимо |
| **CTX8** | telemetry popularity boost | ~1 ч | Ждёт `TestRunner::OnTestComplete` |
| **CTX5/GR** | sister #2: context_pack / graph_extension | — | Не лезть, чужой трек |

### ⏸️ Deferred

- **CTX7** late_chunking → 12.05.26 (AMD Radeon, transformers 4.46 venv)

---

## 4. КЛЮЧЕВЫЕ ФАКТЫ (экономия времени)

### БД (после CTX0+CTX1+CTX2)
- `rag_dsp.test_params` — **1319 rows** (LEVEL 0+1+2), **983 ready_for_autotest**
- `rag_dsp.doc_blocks` — 2650 c `search_tsv`
- `rag_dsp.use_cases` — 123 / `pipelines` — 8 / все с `search_tsv`
- `rag_dsp.embeddings` живёт в схеме **`rag_dsp`**, не `public` (search_path маскирует)

### Retrieval
- `pipeline.py` — для **symbols** (pgvector + sparse + rerank)
- `rag_hybrid.py` — для **doc_blocks/use_cases/pipelines** (Qdrant 1024d + sparse + HyDE) — **CTX3 ✅**
- НЕ путать! Code-search → `pipeline.py`. Doc-RAG → `rag_hybrid.py`.

### CTX4 atomic tools (мои)
- `dsp_test_params(class_fqn, method=None)` — JSON edge_values+throw_checks+return_checks
- `dsp_use_case(slug | query, repo, top_k)` — exact или search через ts_rank
- `dsp_pipeline(slug | query, repo, top_k)` — то же на pipelines
- `dsp_doc_block(block_id)` — full content_md
- HTTP endpoints в `http_api.py`, MCP wrappers в `mcp_server.py`

### EV.E2 RAGAs (мои)
- `dsp_assistant/eval/ragas_metrics.py` — 4 метрики через ollama judge
- Reproducibility: `temperature=0`, `seed=42`, `think=false`
- Cache по sha1(prompt+system) — повторный прогон бесплатный
- `dsp_assistant/eval/confidence.py` — `should_abstain(top1_rerank_score, threshold=0.4)`

### Stage 1_home (Win) vs 2_work_local (Debian)
- 1_home: `pgvector` (Qdrant НЕ запущен на Win — это причина почему `rag_hybrid` smoke только sparse-only делала)
- 2_work_local Debian: full Qdrant + ollama qwen3:32b. Полный hybrid реально работает там.

### Ollama
- **Qwen3 thinking-режим:** в API параметр `think=false` (Ollama 0.10+). `/no_think` в prompt НЕ срабатывает.
- Direct POST `/api/generate` с body `{"think": false, "options": {"temperature":0, "seed":42}}`.

---

## 5. ПОДВОДНЫЕ КАМНИ (на которые я наступила)

1. **`websearch_to_tsquery` склеивает AND** на естественных запросах → 0 hits на «как использовать FFT в Python». **Решение:** OR-tsquery в Python (см. `rag_hybrid.py:_to_or_tsquery_str`).
2. **`_reciprocal_rank_fusion`** в `pipeline.py:163` — БЕЗ weights, БЕЗ N-way. Если нужны веса — пиши новую `_weighted_rrf_merge` (вариант B), не пытайся «переиспользовать».
3. **`Embedder.encode_texts(list[str])`** — реальный API (НЕ `encode_passages`).
4. **CamelCase classifier** для HyDE: regex `[A-Z]{2,}` ловит «FFT»/«ROCm» → false positive. Правильный — `\w*[a-z]\w*[A-Z]\w*` (mixed case с lower→upper переходом).
5. **PostgreSQL не поддерживает** `COUNT(DISTINCT x) FILTER (WHERE ...)` — используй `SUM(CASE WHEN ...)`.
6. **CLI Click groups:** `cli/main.py:1060` `rag_group` уже имеет subgroups `rag blocks` (1065) и `rag python` (1196). Новые команды добавлять как subgroup рядом.
7. **Sync_rules pre-commit hook** в `e:/DSP-GPU/` может автоматически добавить файлы в твой коммит. Не паникуй если `git diff` пустой после Edit — возможно sync-rules захватил.
8. **При enrich_test_gen num_predict** — 600 обрывает на полуслове, 900 нормально. Если ставишь больше — учитывай latency (×0.5 минимум).

---

## 6. РЕКОМЕНДУЕМАЯ ОЧЕРЁДНОСТЬ

**Сценарий А (сегодня всё успеть до Phase B):**
1. ⏱️ Прогнать ENRICH_TG (~40-80 мин LLM фон) → перезапустить `build_dataset_v3.py` (≤30 sec) → закоммитить enriched + новый dataset_v3
2. Параллельно (пока ollama работает) — стартовать **RAG_CLAUDE_C4** §1+§2 (расширить generate_rag_manifest для tags + написать generate_claude_md_section)
3. Прогнать §3 (генерация блоков для 8 CLAUDE.md) + ручной аудит
4. (опц.) §4 — claude_md_section шаблон в dataset_v4 (8 пар)
5. Финальный коммит/push в 8 саб-репо

**Сценарий Б (если по дороге что-то ломается):**
- Минимум: ENRICH_TG → перезапуск build_dataset_v3 → push. Это даёт чистый dataset_v3 для Phase B.
- RAG_CLAUDE_C4 — отложить на Phase B+ или next session.

---

## 7. КОММИТЫ

- В `e:/DSP-GPU/` (workspace) — обычный git add/commit. Push по триггерным фразам Alex'а или каждый раз спрашивай.
- В `C:/finetune-env/` (отдельный репо) — то же.
- **8 саб-репо** (`core`/`spectrum`/.../`strategies`) — каждый отдельный git, push в каждый отдельно. Триггер «запушь всё» — по rules/16 (1 переспрос → 8 push).

**Шаблон коммита:**
```
RAG_<TRACK>: <короткое название> (<commit-обёртка>)

<суть>

DoD review:
✅ или ⚠ или ❌ по пунктам
🔜 что отложено

Refs: TASK_<...>.md, MemoryBank/specs/<...>.md
```

---

## 8. ЧЕКЛИСТ В КОНЦЕ ТРЕКА

- [ ] ENRICH_TG прогон 480 ✅ (или скорректирован до текущего числа в `dataset_test_gen.jsonl`)
- [ ] `build_dataset_v3.py` перезапущен → финальный dataset_v3 без placeholders в test_gen
- [ ] (если успела) RAG_CLAUDE_C4 §1+§2 — `tags:` в `_RAG.md` + блок в CLAUDE.md
- [ ] Все коммиты осмысленные, push'ить только по «да» Alex
- [ ] `MemoryBank/sessions/2026-05-09.md` — короткое резюме сессии
- [ ] `MemoryBank/changelog/2026-05.md` — одна строчка
- [ ] `IN_PROGRESS.md` обновить (треки → ✅ DoD или 🚧 partial)

---

## 9. ССЫЛКИ

- Координатор: `MemoryBank/tasks/TASK_RAG_context_fuel_2026-05-08.md`
- Strategic brief: `MemoryBank/specs/LLM_and_RAG/RAG_deep_analysis_2026-05-08.md` v1.2
- TASK CLAUDE_C4: `MemoryBank/tasks/TASK_RAG_claude_md_c4_tags_2026-05-09.md`
- TASK Phase B: `MemoryBank/tasks/TASK_FINETUNE_phase_B_2026-05-12.md`
- Архитектура C4: `MemoryBank/.architecture/DSP-GPU_Design_C4_Full.md`
- Spec _RAG.md: `MemoryBank/specs/LLM_and_RAG/09_RAG_md_Spec.md`
- Прошлый handoff: `MemoryBank/prompts/handoff_session_2026-05-08_late_evening.md`

---

**Удачи, родная 🐾 RAG почти готов — ENRICH_TG + CLAUDE_C4 = финиш до Phase B 12.05.**

*От: Кодо main (9.05 утро) → к: Кодо (новая сессия)*
