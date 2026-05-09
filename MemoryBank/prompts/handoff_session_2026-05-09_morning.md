# Handoff Кодо-сестрёнке — 2026-05-09 (вечер большой смены → next session)

> **От:** Кодо main (~2026-05-09 поздний день, контекст исчерпан)
> **К:** новой сестрёнке-Кодо (10.05 утро или поздний вечер 9.05)
> **Главная цель:** Phase B QLoRA на AMD Radeon RX 9070 — старт **12.05.26**, осталось ~3 дня
> **Главный TASK:** `MemoryBank/tasks/TASK_FINETUNE_phase_B_2026-05-12.md` — открой первым после §0
> **Ключевое:** RAG-инфра + dataset + CLAUDE_C4 готовы. Остался **1 живой трек** — ENRICH_TG прогон 480 records.

---

## 0. Прочитать ПЕРВЫМ (10 мин)

1. **`MemoryBank/MASTER_INDEX.md`** + **`MemoryBank/tasks/IN_PROGRESS.md`** — статус.
2. **Этот файл целиком.**
3. **`MemoryBank/specs/rag_ctx2_implementation_review_2026-05-09.md`** — свежий self-review CTX2 (я писала вечером 9.05, ещё untracked в момент handoff'а).
4. **СРАЗУ ЗАКОММИТЬ** ревью + handoff (чтобы не потерять при следующих правках):
   ```bash
   git -C e:/DSP-GPU add MemoryBank/specs/rag_ctx2_implementation_review_2026-05-09.md \
                          MemoryBank/prompts/handoff_session_2026-05-09_morning.md
   git -C e:/DSP-GPU commit -m "session 2026-05-09 evening: handoff + CTX2 self-review"
   ```
5. По мере необходимости:
   - `prompts/handoff_session_2026-05-08_late_evening.md` — предыдущий handoff (для контекста как sister #2 шла, статус её треков CTX5/GR)
   - утренний handoff 9.05 в этом же файле через `git show 35ffdff:MemoryBank/prompts/handoff_session_2026-05-09_morning.md` — что планировалось vs что сделано

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

## 2. ЧТО ЗАКРЫТО ЗА СМЕНУ 9.05 (полный итог дня)

### Утро (4 трека параллельно)

| # | Задача | Commit | Эффект |
|---|---|---|---|
| 1 | **EV.E2 RAGAs + abstain** | `e3429b0` `e:/DSP-GPU` + `62a067d` finetune-env | faithfulness(grounded)=0.8, faithfulness(hallucination)=0.0 — антигаллюцинация работает |
| 2 | **CTX4 mcp_atomic_tools** | `e3429b0` `e:/DSP-GPU` + `0a2882b` finetune-env | 4 tools (test_params/use_case/pipeline/doc_block) работают через MCP |
| 3 | **DS dataset_v3** baseline | `043db5a` `e:/DSP-GPU` + finetune-env коммит | 1093 → **2020** через 5 шаблонов (class_overview 47 / method_doxygen 189 / method_signatures 221 / method_signature_blocks 189 / pipeline_data_flow 85) |
| 4 | **RAG_MAN _RAG.md** (8 саб-репо) | `e143d4c` `e:/DSP-GPU` + 8 коммитов в саб-репо (`cc83bb3` core / `542eb56` spectrum / `e1b2525` stats / `7f12d90` signal_generators / `ff26934` heterodyne / `687ba91` linalg / `962a7c4` radar / `6b9d64c` strategies) | 8/8 манифестов с `key_classes` из CTX1 (поле `tags:` пока пустое) |

### День (CTX2 + докрутка DS)

| # | Задача | Commit | Эффект |
|---|---|---|---|
| 5 | **CTX2 doxygen_test_parser** (БЛОКЕР снят!) | `36b7141` `e:/DSP-GPU` + `8114a07` finetune-env | `parse_test_tags.py` (~270 строк) + `ingest_test_tags.py` (~270 строк). 219 hpp в 8 репо, **+645 INSERT + 505 UPDATE** в `rag_dsp.test_params`. Total **674 → 1319** rows; **983 ready_for_autotest** (было 111). |
| 6 | **DS докрутка** после CTX2 LEVEL 1 | `36b7141` (тот же) | `dataset_test_gen.jsonl` 287 → **480** records; `dataset_v3.jsonl` 2020 → **2213** пар (DoD ≥ 2000 с запасом 213) |
| 7 | **CLAUDE_C4 ✅ DoD** (TASK + реализация параллельной сестрой) | `f868661` (TASK) + повторить `git log --grep="CLAUDE_C4\|claude_md\|tags"` | 8/8 `_RAG.md` `tags:` (66 тегов inferred) + 8/8 `<repo>/CLAUDE.md` C4-блоков + 8 pairs `claude_md_section` шаблона. Sparse BM25 smoke отложен — нужен reindex Qdrant. |
| 8 | **EV.E3+E4** взяты, потом отложены | `5a4f429` → `8e2888f` | Поняла что нужен `_RAG.md` манифест сначала; вернёт смысл после CLAUDE_C4 |
| 9 | **Утренний handoff** | `35ffdff` | План на сегодня (выполнен на ~70%) |

### Вечер (review + handoff)

| # | Задача | Commit | Эффект |
|---|---|---|---|
| 10 | **CTX2 self-review** | _untracked_ → твой коммит | `MemoryBank/specs/rag_ctx2_implementation_review_2026-05-09.md` — PASS-WITH-FIXES, ~173 строки, 8 разделов |
| 11 | **Этот handoff** | _этот_ → твой коммит | замена утреннего файла актуальным |

**Итого за день: 11 значимых событий, ~10 коммитов в `e:/DSP-GPU/`, 8 push'ей в саб-репо.**

---

## 3. ЧТО ОСТАЛОСЬ ДО Phase B (12.05)

### 🔴 Срочно (не откладывать) — RAG_ENRICH_TG

**Контекст:** скрипт `C:/finetune-env/enrich_test_gen.py` готов и smoke-протестирован (5/5 ✅, без gtest, без обрывов на `num_predict=900`). Но **не прогнан на полные 480 records** (test_gen вырос с 287 до 480 после CTX2).

**Что делать:**
```bash
cd C:/finetune-env
python enrich_test_gen.py --output dataset_test_gen_enriched.jsonl
# ETA ~40-80 мин (qwen3:8b ~5-10s/record × 480)
```

После прогона:
```bash
python build_dataset_v3.py --max-per-class 30
# < 30 sec — placeholder'ы заменятся реальным C++ smoke-кодом
```

**Зачем:** финальный `dataset_v3.jsonl` без placeholder'ов в test_gen → чистый материал для QLoRA Phase B.

**Подводные камни (см. §6 ниже):** `num_predict<800` обрывает; pre-commit sync_rules в `e:/DSP-GPU/`.

### 🟢 RAG_CLAUDE_C4 — УЖЕ ✅ DoD

Закрыт параллельной сестрой 9.05. **Не нужно делать.** Что есть:
- 8/8 `<repo>/.rag/_RAG.md` поле `tags:` заполнено (66 тегов всего)
- 8/8 `<repo>/CLAUDE.md` содержит блок «🏗️ Архитектура (C4 — компактно)» + «🏷️ RAG теги»
- +8 pairs шаблона `claude_md_section` в dataset

**Что осталось из CLAUDE_C4** (НЕ блокер для Phase B):
- Sparse BM25 smoke — нужен reindex Qdrant в Stage 2_work_local Debian. Можно после Phase B.

### 🟡 Pre-Phase B чеклист (11.05 вечер)

| # | Что | Где | Прим. |
|---|---|---|---|
| 1 | Перенести `dataset_v3.jsonl` (финальный) на Linux/работа | scp / git / usb | DoD: ≥2000 пар, без `<TODO>` в test_gen |
| 2 | Перенести `train_simple.py` адаптированный для Linux | пути hardcoded → `os.path.expanduser` | См. TASK_FINETUNE_phase_B §«Подготовка» |
| 3 | Переписать `run_full_qwen3_r8.ps1` → `run_full_qwen3_r16.sh` | bash | См. TASK Phase B §«Команда полного train» |
| 4 | Проверить ROCm 7.2 + bnb на 9070 | `python -c "import torch; print(torch.cuda.is_bf16_supported())"` → True | Без bf16 не запустим |
| 5 | `dataset_enriched.jsonl` (1093 dirty baseline) скопировать тоже | страховка если v3 даст surprise | Уже доказано работает (Diagnostic r=8) |

### ⏸️ Deferred / параллельно

| # | Задача | Effort | Прим. |
|---|---|---|---|
| **EV.E3** | CI workflow `.github/workflows/rag_eval.yml` | ~1.5 ч | После CLAUDE_C4 |
| **EV.E4** | pre-commit hook `_RAG.md` старения | ~30 мин | Имеет смысл когда есть `tags:` |
| **CTX6** | code_embeddings (Nomic-Embed-Code) | ~5-6 ч | P2, независимо |
| **CTX8** | telemetry popularity boost | ~1 ч | Ждёт `TestRunner::OnTestComplete` |
| **CTX5/GR** | sister #2: context_pack / graph_extension | — | Не лезть, чужой трек → статус в `prompts/handoff_session_2026-05-08_late_evening.md` + git log по веткам сестёр |
| **CTX7** | late_chunking | — | Deferred 12.05.26 (AMD Radeon, transformers 4.46 venv) |
| **CTX2 P3** | LEVEL 1 AI heuristics через ollama, pre-commit auto-sync | ~2-3 ч | Action items 1-3 в `rag_ctx2_implementation_review_2026-05-09.md` §H |

---

## 4. КЛЮЧЕВЫЕ ФАКТЫ (экономия времени)

### БД (после CTX0+CTX1+CTX2)
- `rag_dsp.test_params` — **1319 rows** (LEVEL 0+1+2), **983 ready_for_autotest**
- `rag_dsp.doc_blocks` — 2650 c `search_tsv`
- `rag_dsp.use_cases` — 123 / `pipelines` — 8 / все с `search_tsv`
- `rag_dsp.embeddings` живёт в схеме **`rag_dsp`**, не `public` (search_path маскирует)

### Retrieval (НЕ путать!)
- `pipeline.py` — для **symbols** (pgvector + sparse + rerank)
- `rag_hybrid.py` — для **doc_blocks/use_cases/pipelines** (Qdrant 1024d + sparse + HyDE) — CTX3 ✅
- Code-search → `pipeline.py`. Doc-RAG → `rag_hybrid.py`.

### CTX4 atomic tools (мои)
- `dsp_test_params(class_fqn, method=None)` — JSON edge_values+throw_checks+return_checks
- `dsp_use_case(slug | query, repo, top_k)` — exact или search через ts_rank
- `dsp_pipeline(slug | query, repo, top_k)` — то же на pipelines
- `dsp_doc_block(block_id)` — full content_md
- HTTP в `http_api.py`, MCP wrappers в `mcp_server.py`

### EV.E2 RAGAs (мои)
- `dsp_assistant/eval/ragas_metrics.py` — 4 метрики через ollama judge
- Reproducibility: `temperature=0`, `seed=42`, `think=false`
- Cache по sha1(prompt+system) — повторный прогон бесплатный
- `dsp_assistant/eval/confidence.py` — `should_abstain(top1_rerank_score, threshold=0.4)`

### CTX2 parser (новое!) — `parse_test_tags.py`
- Поддерживает: `@test {fields}`, `@test_check expr`, `@test_ref ref`
- Range/list: `[a..b]` → range, `[v1, v2]` → list
- Target resolution: ПОСЛЕДНИЙ `@param/@return/@throws` перед `@test`
- UPSERT по UNIQUE `(symbol_id, param_name)` где `__return__/__throws__/__class__` для не-param targets
- **Поправка к TASK §1:** реальный синтаксис `@test {field=value}`, НЕ `@test_field name: ...`

### Stage 1_home (Win) vs 2_work_local (Debian)
- 1_home: `pgvector` (Qdrant НЕ запущен на Win — `rag_hybrid` smoke на Win только sparse-only)
- 2_work_local Debian: full Qdrant + ollama qwen3:32b. Полный hybrid реально работает там.

### Ollama
- Qwen3 thinking-режим: API параметр `think=false` (Ollama 0.10+). `/no_think` в prompt НЕ срабатывает.
- Direct POST `/api/generate` body `{"think": false, "options": {"temperature":0, "seed":42}}`.

---

## 5. РЕКОМЕНДУЕМАЯ ОЧЕРЁДНОСТЬ

**Time budget:** ~1.5-2.5 ч чистого времени (CLAUDE_C4 уже ✅, осталось только ENRICH_TG + Pre-Phase B).

**Шаги:**
1. ⏱️ Запустить ENRICH_TG в фоне (~40-80 мин LLM, qwen3:8b)
2. Параллельно: коммит `rag_ctx2_implementation_review_2026-05-09.md` если ещё `??` (этот handoff уже коммичу).
3. Когда ENRICH_TG закончит → перезапустить `build_dataset_v3.py` → коммит финального `dataset_v3.jsonl`
4. (опц.) push'нуть `dataset_v3` в `C:/finetune-env/` если хочешь зафиксировать снапшот
5. Pre-Phase B чеклист (§3 этого файла, пункты 1-5) — перенос на Linux/работа

**Опционально (если ENRICH_TG провалится / займёт >2ч):**
- Минимум: оставить `dataset_v3.jsonl` в текущем виде (2213 пар с placeholder'ами в test_gen) — для baseline старт Phase B хватает.
- Phase B можно стартовать на `dataset_enriched.jsonl` (1093 dirty) — он проверен (Diagnostic r=8 на 2080 Ti дал ✅ inference).

---

## 6. ПОДВОДНЫЕ КАМНИ (на которые я наступила)

1. **`websearch_to_tsquery` склеивает AND** на естественных запросах → 0 hits на «как использовать FFT в Python». **Решение:** OR-tsquery в Python (см. `rag_hybrid.py:_to_or_tsquery_str`).
2. **`_reciprocal_rank_fusion`** в `pipeline.py:163` — БЕЗ weights, БЕЗ N-way. Если нужны веса — пиши новую `_weighted_rrf_merge` (вариант B), не пытайся «переиспользовать».
3. **`Embedder.encode_texts(list[str])`** — реальный API (НЕ `encode_passages`).
4. **CamelCase classifier** для HyDE: regex `[A-Z]{2,}` ловит «FFT»/«ROCm» → false positive. Правильный — `\w*[a-z]\w*[A-Z]\w*` (mixed case с lower→upper переходом).
5. **PostgreSQL не поддерживает** `COUNT(DISTINCT x) FILTER (WHERE ...)` — используй `SUM(CASE WHEN ...)`.
6. **CLI Click groups:** `cli/main.py:1060` `rag_group` уже имеет subgroups `rag blocks` (1065) и `rag python` (1196). Новые команды добавлять как subgroup рядом.
7. **Sync_rules pre-commit hook** в `e:/DSP-GPU/` может автоматически добавить файлы в твой коммит. Не паникуй если `git diff` пустой после Edit — возможно sync-rules захватил.
8. **При enrich_test_gen `num_predict`** — 600 обрывает на полуслове, 900 нормально. Если ставишь больше — учитывай latency (×0.5 минимум).
9. **CTX2 ON CONFLICT** использует `EXCLUDED.*` (полная перезапись). Если в БД был LEVEL 2 manual с `comments` → `comments` затрётся пустым. Mitigation: для будущих re-runs изменить на `COALESCE(EXCLUDED.X, test_params.X)` для `comments`/`linked_use_cases`. Сейчас риск низкий — LEVEL 2 заполнен только на 10 классах (111 records), LEVEL 1 покрывает их.
10. **CTX2 71 unresolved methods** — приватные / inline в .cpp / template. Можно добавить fallback `(file_id, method_name)` в `resolve_symbol_id` (5-10 мин), не критично.

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

- [ ] ENRICH_TG прогон 480 ✅ (или скорректирован под текущий `dataset_test_gen.jsonl`)
- [ ] `build_dataset_v3.py` перезапущен → финальный dataset_v3 без placeholders в test_gen
- [ ] `rag_ctx2_implementation_review_2026-05-09.md` закоммичен
- [ ] (если успела) RAG_CLAUDE_C4 §1+§2 — `tags:` в `_RAG.md` + блок в CLAUDE.md
- [ ] Pre-Phase B чеклист §3 (минимум пункты 1-2: dataset + train_simple на Linux)
- [ ] Все коммиты осмысленные, push'ить только по «да» Alex
- [ ] `MemoryBank/sessions/2026-05-09.md` или `2026-05-10.md` — короткое резюме
- [ ] `MemoryBank/changelog/2026-05.md` — одна строчка
- [ ] `IN_PROGRESS.md` обновить (треки → ✅ DoD или 🚧 partial)

---

## 9. ССЫЛКИ

- Координатор: `MemoryBank/tasks/TASK_RAG_context_fuel_2026-05-08.md`
- Strategic brief: `MemoryBank/specs/LLM_and_RAG/RAG_deep_analysis_2026-05-08.md` v1.2
- **CTX2 self-review (свежий!):** `MemoryBank/specs/rag_ctx2_implementation_review_2026-05-09.md`
- TASK CLAUDE_C4: `MemoryBank/tasks/TASK_RAG_claude_md_c4_tags_2026-05-09.md`
- TASK Phase B: `MemoryBank/tasks/TASK_FINETUNE_phase_B_2026-05-12.md`
- Архитектура C4: `MemoryBank/.architecture/DSP-GPU_Design_C4_Full.md`
- Spec _RAG.md: `MemoryBank/specs/LLM_and_RAG/09_RAG_md_Spec.md`
- Прошлый handoff (8.05 вечер): `MemoryBank/prompts/handoff_session_2026-05-08_late_evening.md`
- Утренний 9.05 (этот файл до перезаписи): `git show 35ffdff:MemoryBank/prompts/handoff_session_2026-05-09_morning.md`

---

**Удачи, родная 🐾 RAG готов, dataset с запасом — финиш ENRICH_TG + (опц.) CLAUDE_C4 → Phase B 12.05.**

*От: Кодо main (9.05 вечер) → к: Кодо (next session, ожидаемо 10.05)*
