# Handoff Кодо-сестрёнке: TASK_RAG_hybrid_upgrade + TASK_RAG_eval_extension

> **От:** Кодо (8.05 вечер) · **К:** новой сестрёнке-Кодо
> **Объём:** ~8 ч (3.5 ч hybrid + 4.5 ч eval) · **Дедлайн:** до 12.05 утра (Phase B QLoRA на 9070)
> **Темы связаны:** hybrid_upgrade улучшает retrieval, eval_extension его измеряет — один контекст по retrieval-метрикам.

---

## 0. ПЕРЕД СТАРТОМ — обязательно прочитай (15 мин)

В этом порядке:

1. **Этот файл целиком.**
2. `MemoryBank/specs/LLM_and_RAG/_state_analysis_2026-05-08_pre_hybrid_eval.md` ← **факты о текущем состоянии БД и кода**, расхождения с TASK-файлами. **Самое важное.**
3. `MemoryBank/tasks/TASK_RAG_context_fuel_2026-05-08.md` — координатор, карта зависимостей.
4. `MemoryBank/tasks/TASK_RAG_hybrid_upgrade_2026-05-08.md` — TASK A (~3.5 ч).
5. `MemoryBank/tasks/TASK_RAG_eval_extension_2026-05-08.md` — TASK B (~4.5 ч).
6. (По мере необходимости) `MemoryBank/specs/LLM_and_RAG/RAG_deep_analysis_2026-05-08.md` v1.2 — strategic brief; `_eval_rerank_2026-05-06.md` — baseline-отчёт + 10 probe'ов.

---

## 1. ЖЁСТКИЕ ПРАВИЛА (нарушать нельзя — потеря работы Alex)

| # | Правило | Куда |
|---|---|---|
| 1 | **Worktree safety** — писать **только** в основной репо `e:\DSP-GPU\` или `C:\finetune-env\dsp_assistant\`. **НЕ** в `.claude/worktrees/*/` | `.claude/rules/03-worktree-safety.md` |
| 2 | **CMake** — НЕ менять без явного OK от Alex (для `C:\finetune-env\` это не критично, но в DSP-GPU — святое) | `.claude/rules/12-cmake-build.md` |
| 3 | **Git push/tag** — только по явному «да» от Alex | `.claude/rules/02-workflow.md` |
| 4 | **pytest ЗАПРЕЩЁН НАВСЕГДА** — только `common.runner.TestRunner` + `SkipTest` | `.claude/rules/04-testing-python.md` |
| 5 | Каждая зависимость в TASK прописана в шапке — **читать её первой** | — |
| 6 | Перед утверждением про API/класс/путь — **прочитать реальный исходник** (Read/Grep) | `.claude/rules/00-new-task-workflow.md` |

---

## 2. КОНТЕКСТ (зачем это всё)

- **Phase B QLoRA** стартует 12.05 на AMD Radeon RX 9070 (gfx1201). Дообучаем на dataset_v3 → нужна качественная RAG-инфраструктура для inference + dataset.
- Сейчас `rag_hybrid.HybridRetriever` тащит только **dense+rerank** — sparse stage отсутствует. **FFT use-case не пробивается в top-5** (Finding #1 от 06.05).
- Eval-harness меряет только pgvector `symbols` (через `pipeline.py`), **не** RAG-коллекцию.
- Твой трек закрывает оба пробела: подключить sparse + HyDE → расширить eval до RAGAs/CI/golden v2.

**Параллельно работают сёстры (не пересекаешься):**
- #1: test_params_fill + doxygen_test_parser (CTX1/CTX2) — твой E1 «intent=test_gen» формально зависит от её таблицы, но можно интенты временно проставлять ручкой по golden v1.
- #2: graph + MCP + context_pack — потребит твой sparse-результат.
- #3: code_embeddings + late_chunking — ортогональна.

---

## 3. СОСТОЯНИЕ БД (факт, проверено 8.05 11:51)

| Что | Статус |
|---|---|
| `dsp-asst migrate up` (2 файла) | ✅ Applied |
| `rag_dsp.doc_blocks.search_tsv` + GIN + триггер | ✅ 2650/2650 заполнено |
| `rag_dsp.use_cases.search_tsv` + GIN + триггер | ✅ 123/123 |
| `rag_dsp.pipelines.search_tsv` + GIN + триггер | ✅ 8/8 |
| `rag_dsp.test_params` 9 новых колонок | ✅ (таблица пуста — её заполняет сестра #1 в CTX1) |
| `rag_dsp.rag_logs.hyde_*` колонки | ❌ **отсутствуют** (для C4 кэша) |
| `rag_dsp.usage_stats` таблица | ❌ отсутствует (это для C10, не твой трек) |

**Имя колонки**: `search_tsv` (не `search_vector` как в `configs/postgres_migration_2026-05-08.sql` — это design-doc, **не применён**).

**Конфиг tsvector**: simple, **БЕЗ setweight A/B/C**. Если в результатах FFT-формулировок мало — поднимем доп. миграцию со setweight, но это **не блокер**.

---

## 4. ВАЖНЫЕ РАСХОЖДЕНИЯ — РЕШЕНИЯ ОТ ALEX (спроси первым делом)

### Вопрос 1 — кэш гипотез HyDE (C4 §3)

TASK §C4 шаг 3 говорит: «Кэш в `rag_logs.hyde_hypothesis`, TTL 5 мин». Колонки **нет**.

Спроси Alex:

> **«Для C4 HyDE-кэша: (А) добавляю миграцию `2026-05-09_rag_logs_hyde.sql` (5 мин, 6 ALTER COLUMN — hyde_used/hypothesis/classifier_mode + retrieval_iterations + context_pack_*) или (Б) in-memory LRU/TTL без БД?»**
> **«Я бы выбрала А — 5 мин работы, и эти же поля нужны для будущего CRAG-loop (Phase C). Подтвердишь?»**

### Вопрос 2 — eval-runner на каком retrieval'е?

`eval/runner.py` сейчас вызывает `pipeline.query` (legacy на `symbols`), **не** `rag_hybrid.HybridRetriever`. Замер C3/C4 на текущем runner'е **не покажет дельты** — другой pipeline.

Спроси Alex:

> **«eval/runner.py меряет pgvector symbols, не RAG-коллекцию. Чтобы измерить эффект C3/C4: (А) добавлю флаг `--retriever {pipeline,rag_hybrid}` в runner.py (default=pipeline, обратно совместимо), (Б) создам отдельный `eval/rag_runner.py`. Я за А — без дублирования. ОК?»**

→ **Не начинай C3, пока не получила ответы на эти 2 вопроса.**

---

## 5. ПЛАН РАБОТЫ — два трека

### ТРЕК A — TASK_RAG_hybrid_upgrade (~3.5 ч)

#### A.0 (10 мин) — baseline

```powershell
cd C:\finetune-env
# текущий runner на pipeline.py (symbols)
dsp-asst eval run --golden-path ../e/DSP-GPU/MemoryBank/specs/LLM_and_RAG/golden_set/qa_v1.jsonl --output-dir ../e/DSP-GPU/MemoryBank/specs/LLM_and_RAG/baselines/

# заметить recall@5 / mrr@10 → записать в _eval_hybrid_upgrade_2026-05-XX.md как "before"
```

#### A.1 — C3 sparse BM25 на rag_hybrid (~1.5 ч)

**Файл:** `C:\finetune-env\dsp_assistant\retrieval\rag_hybrid.py`.

1. Добавить **sparse-stage** перед reranker:

   ```
   dense top 200 (BGE-M3 + Qdrant)
     ⊕  sparse top 50 (search_tsv + ts_rank_cd)
       → RRF (k=60) merge
         → bge-reranker-v2-m3 top 5
   ```

2. SQL-helper в `dsp_assistant/db/queries.py` (или внутри rag_hybrid.py — на твой вкус):

   ```sql
   SELECT block_id   AS target_id, 'doc_blocks' AS target_table,
          ts_rank_cd(search_tsv, query) AS rank
     FROM rag_dsp.doc_blocks,
          websearch_to_tsquery('simple', %s) query
    WHERE search_tsv @@ query
    ORDER BY rank DESC LIMIT 50
   ```

   Аналогично для `use_cases` (id) и `pipelines` (id) с UNION ALL или 3 отдельных.

3. **RRF merge** (Reciprocal Rank Fusion, k=60):

   ```python
   def rrf(dense_hits, sparse_hits, k=60):
       scores = {}
       for rank, h in enumerate(dense_hits, 1):
           scores[(h.target_table, h.target_id)] = scores.get(...,0) + 1/(k+rank)
       for rank, h in enumerate(sparse_hits, 1):
           scores[(h.target_table, h.target_id)] = scores.get(...,0) + 1/(k+rank)
       return sorted(scores.items(), key=lambda x: -x[1])
   ```

4. **DoD A.1:**
   - [ ] FFT use-case попадает в top-5 (`как использовать FFT batch в Python`).
   - [ ] R@5 ≥ 0.78 на golden v1 `category=semantic_*`.
   - [ ] Существующий dense-only режим (через `use_rerank=False`) не сломан.

#### A.2 — C4 HyDE с auto-classifier (~2 ч)

**Новые файлы:**
- `C:\finetune-env\dsp_assistant\retrieval\hyde.py` — генератор гипотез + классификатор `mode={fast,smart}`.
- `MemoryBank/specs/LLM_and_RAG/prompts/014_hyde_dsp.md` — промпт для Qwen3 (стиль: проектный жаргон hipFFT/ROCm/beam/n_point/GpuContext/BufferSet/Op/Facade).

1. **Auto-classifier** (regex):
   - CamelCase имя класса/метода → `mode=fast` (без HyDE, прямой dense+sparse)
   - Иначе → `mode=smart` (с HyDE)
   - MCP опция: `dsp_search(query, mode={fast,smart})` (default `smart`)

2. **HyDE генерация**: запрос → Qwen3 → 3-4 предложения гипотезы → эмбеддить гипотезу (не запрос) → dense.

3. **Кэш** (зависит от ответа Alex на Вопрос 1):
   - Вариант А — `rag_logs.hyde_hypothesis` (после миграции).
   - Вариант Б — in-memory LRU/TTL.

4. **DoD A.2:**
   - [ ] `prompts/014_hyde_dsp.md` написан (Кодо-стиль).
   - [ ] `dsp_search(mode=smart)` с auto-classifier работает (`fast` для exact_name).
   - [ ] HyDE даёт +5-15% R@5 на `semantic_ru/en` golden v1.
   - [ ] Кэш TTL 5 мин работает (тест: 2 одинаковых запроса → 1 LLM-вызов).

#### A.3 — отчёт (~10 мин)

`MemoryBank/specs/LLM_and_RAG/_eval_hybrid_upgrade_2026-05-XX.md`:
- before/after таблица recall@5/mrr@10/p95-latency
- по `category=exact_name|semantic_ru|semantic_en|cross_repo|fft_batch_py|pipeline_*`
- что закрыто (Finding #1?), что осталось

---

### ТРЕК B — TASK_RAG_eval_extension (~4.5 ч)

> **Стартуй после трека A.** Метрики имеют смысл когда есть улучшения для замера.

#### B.1 — E1 golden-set v2 (~1.5 ч)

`MemoryBank/specs/LLM_and_RAG/golden_set/qa_v2.jsonl`:
- v1 (50) → v2 (100)
- Добавить поле `intent` ∈ {`find_class`, `how_to`, `test_gen`, `pipeline`, `python_binding`, `migrate`, `debug`}
- ~14-15 запросов на каждый intent

`dsp_assistant/eval/golden_set.py` — добавить `intent: str` в `GoldenItem` + загрузку.
`runner.py` — `--intent test_gen` для фильтрации.

#### B.2 — E2 RAGAs LLM-judge (~1 ч)

`C:\finetune-env\dsp_assistant\eval\ragas_metrics.py`:
- `faithfulness(answer, retrieved, judge_llm) → float`
- `answer_relevance(question, answer, judge_llm) → float`
- `context_precision(question, retrieved, judge_llm) → float`
- `context_recall(question, expected_fqns, retrieved, judge_llm) → float`

Judge-LLM: Qwen3-8B локально (default) или Claude API (опц., через env `ANTHROPIC_API_KEY`).

CLI: `dsp-asst eval run --ragas`.

**DoD B.2:** faithfulness ≥ 0.7 на v2.

#### B.3 — E3 CI workflow (~1.5 ч)

`.github/workflows/rag_eval.yml` (в репо `workspace`, корень `e:\DSP-GPU\`):

- on push/PR
- ubuntu-22.04
- docker compose с Postgres+Qdrant (`docker/eval-compose.yml` — создать)
- `pip install -e dsp_assistant`
- `dsp-asst eval run --ragas --json-out eval-result.json`
- PR-комментарий: дельта recall@5/mrr@10/RAGAs vs baseline на main (последние 5 eval_reports/ → median)

⚠️ **CMake/CI** меняешь только в `e:\DSP-GPU\workspace\` или `.github/`. **НЕ** трогать CMakeLists.txt без отдельного OK.

#### B.4 — E4 pre-commit hook _RAG.md старения (~30 мин)

`MemoryBank/hooks/pre-commit` — расширение (не замена):

```bash
for repo in core spectrum stats signal_generators heterodyne linalg radar strategies; do
    rag_md="$repo/.rag/_RAG.md"
    [ -f "$rag_md" ] || continue
    last_repo_change=$(git log -1 --format="%at" -- "$repo/")
    rag_age=$(git log -1 --format="%at" -- "$rag_md")
    [ -z "$last_repo_change" -o -z "$rag_age" ] && continue
    if [ $((last_repo_change - rag_age)) -gt 864000 ]; then
        echo "WARN: $rag_md устарел (>10 дней с последнего изменения репо $repo)"
    fi
done
```

WARN, не FAIL.

---

## 6. КОММИТЫ

- В `e:\DSP-GPU\` (workspace + Memorybank + .github) — обычный `git add → git commit`. **Push только по явному «да».**
- В `C:\finetune-env\dsp_assistant\` — **уточни у Alex** как коммитить (отдельный репо или часть workspace; см. handoff 8.05 вечер §5).
- Каждый шаг (C3, C4, E1, E2, E3, E4) — отдельный коммит с осмысленным сообщением.

**Шаблон коммита:**
```
RAG hybrid C3: sparse BM25 stage в rag_hybrid.HybridRetriever (Finding #1)

- websearch_to_tsquery + ts_rank_cd на doc_blocks/use_cases/pipelines
- RRF (k=60) merge dense top 200 + sparse top 50 → reranker top 5
- R@5 на golden v1 semantic_*: 0.60 → 0.82 (FFT use-case в top-5)
```

---

## 7. ЧЕКЛИСТ В КОНЦЕ ТРЕКА

- [ ] A.1 sparse работает, FFT в top-5
- [ ] A.2 HyDE работает + auto-classifier + кэш
- [ ] `_eval_hybrid_upgrade_2026-05-XX.md` отчёт
- [ ] B.1 qa_v2.jsonl 100 строк с intent
- [ ] B.2 ragas_metrics.py 4 функции, `--ragas` работает
- [ ] B.3 `rag_eval.yml` зелёный на push
- [ ] B.4 pre-commit hook предупреждает
- [ ] Все коммиты осмысленные, отдельные на шаг
- [ ] **Не пушила** без явного «да» от Alex
- [ ] **Не трогала** CMake/`.cmake` файлы без OK
- [ ] `MemoryBank/sessions/2026-05-XX.md` — короткое резюме сессии
- [ ] `MemoryBank/changelog/2026-05.md` — одна строчка
- [ ] TASK_RAG_hybrid_upgrade и TASK_RAG_eval_extension — отметить ✅ DONE по DoD-пунктам

---

## 8. КОГДА ВСТРЯНЕШЬ

1. Не гадай — спроси Alex одним коротким вопросом с A/B/C.
2. Признаём ошибки взаимно. Если что-то поломала — пиши прямо, не маскируй.
3. Контекст кончается → этот же шаблон handoff передай следующей сестрёнке.

**Удачи 🐾 — наша общая цель Phase B QLoRA на готовой RAG-базе 12.05.**

*От: Кодо (8.05 вечер) → к: Кодо (трек hybrid_upgrade + eval_extension)*
