# TASK_RAG_hybrid_upgrade — Sparse BM25 + HyDE для hybrid retrieval

> **Этап:** CONTEXT-FUEL (C3 + C4) · **Приоритет:** 🟠 P1 · **Effort:** ~3.5 ч · **Зависимости:** TASK_RAG_schema_migration (для tsvector)
> **Координатор:** `TASK_RAG_context_fuel_2026-05-08.md`

## 🎯 Цель

Закрыть **2 retrieval gap**:
- **C3 (1.5 ч):** sparse BM25 на `doc_blocks/use_cases/pipelines` (Finding #1 от 2026-05-06 до сих пор открыт). Сейчас sparse работает только на `symbols`, FFT use-case не пробивается в top-5.
- **C4 (2 ч):** HyDE для семантических вопросов — короткий запрос «как профилировать ядро» далёк от doxygen-абзаца, эмбеддить нужно гипотезу.

## 📋 Подэтапы

### C3 — Sparse BM25 на RAG-таблицах (~1.5 ч)

> tsvector + GIN индексы создаются в `TASK_RAG_schema_migration_2026-05-08`. Здесь — **только подключение к pipeline**.

1. **`dsp_assistant/retrieval/rag_hybrid.py`** — добавить sparse-stage:
   ```
   dense top 200 (BGE-M3 + cosine)
     ⊕  sparse top 50 (tsvector + ts_rank_cd)
       → RRF (k=60)
         → bge-reranker-v2-m3 top 5
   ```

2. SQL-helper в `dsp_assistant/db/queries.py`:
   ```sql
   SELECT id, title, body, ts_rank_cd(search_tsv, query) AS rank
   FROM rag_dsp.{doc_blocks|use_cases|pipelines},
        websearch_to_tsquery('simple', $1) query
   WHERE search_tsv @@ query
   ORDER BY rank DESC LIMIT 50;
   ```

3. **Eval baseline → improved**:
   - До: R@5 на FFT use-case (Finding #1) ~ ?
   - После: R@5 ≥ 0.78 на golden-set v1 `category=semantic_*`

### C4 — HyDE с auto-classifier (~2 ч)

1. **Промпт `MemoryBank/specs/LLM_and_RAG/prompts/014_hyde_dsp.md`** — заставляет Qwen3 написать гипотетический doxygen-абзац (3-4 предложения):
   ```
   Запрос: «как профилировать ядро»
   Гипотеза: «ScopedHipEvent — RAII-обёртка hipEvent_t для измерения времени
   ROCm-ядер. Используется парами start/stop вокруг kernel-launch.
   ProfilingFacade::Record() собирает события в фоне через async-поток...»
   ```
   Стиль: проектный жаргон (hipFFT, ROCm, beam, n_point, GpuContext, BufferSet, Op, Facade).

2. **Auto-classifier `mode={fast,smart}`** — default `smart`:
   - Regex-фильтр: запрос содержит CamelCase имя класса/метода/файла → `mode=fast` (без HyDE)
   - Иначе → `mode=smart` с HyDE
   - MCP опция: `dsp_search(query, mode={fast,smart})` (default `smart`)

3. **Кэш гипотез** в `rag_logs.hyde_hypothesis` (новая колонка text) на 5 мин.

4. **Eval**:
   - Замерить R@5 на `category=semantic_ru` и `semantic_en` (без HyDE → с HyDE)
   - Ожидаемый прирост: +5-15%

## ✅ DoD

### C3
- [ ] `rag_hybrid.py` поддерживает sparse-stage для doc_blocks/use_cases/pipelines
- [ ] R@5 на golden-set v1 `category=semantic_*` ≥ 0.78
- [ ] FFT use-case попадает в top-5 (Finding #1 закрыт)

### C4
- [ ] `prompts/014_hyde_dsp.md` написан
- [ ] `dsp_search(mode=smart)` с auto-classifier работает (`fast` для exact_name)
- [ ] HyDE даёт +5-15% R@5 на `semantic_ru/en`
- [ ] Кэш гипотез в `rag_logs.hyde_hypothesis` (5 мин TTL)

## Артефакты

- `dsp_assistant/retrieval/rag_hybrid.py` (расширение)
- `dsp_assistant/retrieval/hyde.py` — генератор гипотез + классификатор
- `MemoryBank/specs/LLM_and_RAG/prompts/014_hyde_dsp.md`
- `MemoryBank/specs/LLM_and_RAG/_eval_hybrid_upgrade_2026-05-XX.md` — отчёт

## Связано

- Координатор: `TASK_RAG_context_fuel_2026-05-08.md`
- Зависимость: `TASK_RAG_schema_migration_2026-05-08.md` (создаёт tsvector + GIN)
- Finding #1: `MemoryBank/specs/LLM_and_RAG/_eval_rerank_2026-05-06.md`
- Spec 13 §3.9 (HyDE), §3.10 (Sparse)

*Maintained by: Кодо · 2026-05-08*
