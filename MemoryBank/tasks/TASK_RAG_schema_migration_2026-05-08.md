# TASK_RAG_schema_migration — миграция schema БД для CONTEXT-FUEL

> **Этап:** CONTEXT-FUEL (предусловие) · **Приоритет:** 🔴 P0 · **Effort:** ~1 ч · **Зависимости:** none
> **Координатор:** `TASK_RAG_context_fuel_2026-05-08.md`
> **Design-doc:** `MemoryBank/specs/LLM_and_RAG/RAG_kfp_design_2026-05-08.md` §3.1

## 🎯 Цель

Применить **2 schema migration** в `rag_dsp` для разблокировки CONTEXT-FUEL:
- **M1: расширение `test_params`** — 6 новых колонок для AI-генерации тестов (см. RAG_kfp_design §3.1)
- **M2: tsvector + GIN на RAG-таблицах** — для sparse BM25 (Finding #1)

Должен быть выполнен **ДО** TASK_RAG_test_params_fill (C1) и TASK_RAG_hybrid_upgrade (C3+C4).

## 📋 Миграции

### M1 — `test_params` расширение

`dsp_assistant/migrations/2026-05-08_test_params_extend.sql`:

```sql
ALTER TABLE rag_dsp.test_params
  ADD COLUMN return_checks    JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN throw_checks     JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN linked_use_cases TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN linked_pipelines TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN embedding_text   TEXT,
  ADD COLUMN coverage_status  TEXT DEFAULT 'partial'
    CHECK (coverage_status IN ('ready_for_autotest', 'partial', 'skipped'));

CREATE INDEX idx_test_params_coverage  ON rag_dsp.test_params (coverage_status);
CREATE INDEX idx_test_params_use_cases ON rag_dsp.test_params USING GIN (linked_use_cases);
CREATE INDEX idx_test_params_pipelines ON rag_dsp.test_params USING GIN (linked_pipelines);
```

Также обновить `edge_values` (JSONB) — добавить поля `step`, `formula`, `pattern` (через
schema-doc, не через ALTER, JSONB free-form).

### M2 — tsvector + GIN на 3 RAG-таблицах

`dsp_assistant/migrations/2026-05-08_rag_tables_tsvector.sql`:

```sql
-- doc_blocks
ALTER TABLE rag_dsp.doc_blocks ADD COLUMN search_tsv tsvector;
UPDATE rag_dsp.doc_blocks
  SET search_tsv = to_tsvector('simple',
    coalesce(title,'') || ' ' || coalesce(body,'') || ' ' || coalesce(repo,''));
CREATE INDEX idx_doc_blocks_tsv ON rag_dsp.doc_blocks USING GIN (search_tsv);

-- use_cases
ALTER TABLE rag_dsp.use_cases ADD COLUMN search_tsv tsvector;
UPDATE rag_dsp.use_cases
  SET search_tsv = to_tsvector('simple',
    coalesce(title,'') || ' ' || coalesce(body,'') || ' ' || array_to_string(synonyms_ru,' ') || ' ' || array_to_string(synonyms_en,' '));
CREATE INDEX idx_use_cases_tsv ON rag_dsp.use_cases USING GIN (search_tsv);

-- pipelines
ALTER TABLE rag_dsp.pipelines ADD COLUMN search_tsv tsvector;
UPDATE rag_dsp.pipelines
  SET search_tsv = to_tsvector('simple',
    coalesce(title,'') || ' ' || coalesce(when_to_use,'') || ' ' || array_to_string(tags,' '));
CREATE INDEX idx_pipelines_tsv ON rag_dsp.pipelines USING GIN (search_tsv);
```

### M2-trigger — авто-обновление tsv при insert/update

```sql
CREATE OR REPLACE FUNCTION rag_dsp.doc_blocks_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_tsv := to_tsvector('simple',
    coalesce(NEW.title,'') || ' ' || coalesce(NEW.body,'') || ' ' || coalesce(NEW.repo,''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_doc_blocks_tsv
  BEFORE INSERT OR UPDATE ON rag_dsp.doc_blocks
  FOR EACH ROW EXECUTE FUNCTION rag_dsp.doc_blocks_tsv_trigger();

-- аналогично для use_cases, pipelines
```

## ✅ DoD

- [ ] M1 применён, `\d rag_dsp.test_params` показывает 6 новых колонок + 3 индекса
- [ ] M2 применён, `\d rag_dsp.{doc_blocks,use_cases,pipelines}` показывает `search_tsv` + GIN
- [ ] Триггеры работают: INSERT/UPDATE автоматически обновляет tsv
- [ ] Smoke-проверка: `SELECT count(*) FROM rag_dsp.doc_blocks WHERE search_tsv IS NOT NULL` = всего записей
- [ ] Существующий dense retrieval не сломан (smoke-eval на 5 запросах из golden-set)
- [ ] Schema-doc обновлён: `MemoryBank/specs/LLM_and_RAG/03_Database_Schema_2026-04-30.md` §2.8

## Артефакты

- `dsp_assistant/migrations/2026-05-08_test_params_extend.sql`
- `dsp_assistant/migrations/2026-05-08_rag_tables_tsvector.sql`
- `dsp_assistant/db/migrate.py` — runner (если ещё нет)
- Обновление `MemoryBank/specs/LLM_and_RAG/03_Database_Schema_2026-04-30.md`

## Связано

- Координатор: `TASK_RAG_context_fuel_2026-05-08.md`
- Design: `RAG_kfp_design_2026-05-08.md` §3.1
- Зависимости в перёд: `TASK_RAG_test_params_fill` (использует M1), `TASK_RAG_hybrid_upgrade` (использует M2)

*Maintained by: Кодо · 2026-05-08*
