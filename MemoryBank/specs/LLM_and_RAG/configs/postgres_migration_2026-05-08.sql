-- =============================================================================
-- Migration 2026-05-08: schema upgrade для CONTEXT-FUEL (C3/C4/C10) + KFP P1
-- =============================================================================
-- Версия: 1.0  · Дата: 2026-05-08  · Автор: Кодо
--
-- Что делает:
--   1) tsvector + GIN на rag_dsp.doc_blocks/use_cases/pipelines (для C3 sparse BM25)
--   2) Расширение rag_dsp.test_params (для KFP design v1, kfp_design §3.1)
--   3) Новая таблица rag_dsp.usage_stats (для C10 telemetry-driven boost)
--   4) Новые колонки в rag_dsp.rag_logs (для C4 HyDE + будущего CRAG-loop)
--
-- Ссылки:
--   - RAG_deep_analysis_2026-05-08.md §5.1, §5.3, §8.3
--   - RAG_kfp_design_2026-05-08.md §3.1
--   - 03_Database_Schema_2026-04-30.md §2.8 (test_params исходная схема)
--
-- Зависимости: postgres_init.sql + postgres_init_rag.sql уже применены.
-- Идемпотентно: все ADD COLUMN/CREATE с IF NOT EXISTS.
--
-- Запуск:
--   sudo -u postgres psql -d gpu_rag_dsp -f postgres_migration_2026-05-08.sql
-- (или Win: psql -U dsp_asst -h localhost -d gpu_rag_dsp -f ...)
--
-- Откат: см. секцию ROLLBACK в конце файла (закомментирован).
-- =============================================================================

\c gpu_rag_dsp
SET search_path TO rag_dsp, public;

-- =============================================================================
-- 1. tsvector + GIN на doc_blocks / use_cases / pipelines  (C3: Sparse BM25)
-- =============================================================================
-- Назначение: чтобы запросы вроде "Python FFT batch" находили doc_blocks/use_cases
-- по буквальному совпадению токенов (не только через dense embedding).
-- Результат используется в HybridRetriever.rag_hybrid.py перед rerank'ом.

-- 1.1 doc_blocks.search_vector
ALTER TABLE doc_blocks
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

CREATE INDEX IF NOT EXISTS idx_doc_blocks_search
  ON doc_blocks USING GIN (search_vector);

CREATE OR REPLACE FUNCTION doc_blocks_search_vector_update() RETURNS trigger AS $$
BEGIN
  -- Веса:
  --   A = block_id (semantic slug, точное попадание класса/концепта)
  --   B = class_or_module + concept (метаданные)
  --   C = content_md (тело блока)
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.block_id,'')),         'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.class_or_module,'')),  'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.concept,'')),          'B') ||
    setweight(to_tsvector('simple', LEFT(COALESCE(NEW.content_md,''), 8000)), 'C');
  NEW.updated_at := NOW();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_doc_blocks_search_vector ON doc_blocks;
CREATE TRIGGER trg_doc_blocks_search_vector
  BEFORE INSERT OR UPDATE ON doc_blocks
  FOR EACH ROW EXECUTE FUNCTION doc_blocks_search_vector_update();

-- Backfill для существующих ~570 строк
UPDATE doc_blocks SET updated_at = NOW();  -- триггер пересчитает search_vector

-- 1.2 use_cases.search_vector
ALTER TABLE use_cases
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

CREATE INDEX IF NOT EXISTS idx_use_cases_search
  ON use_cases USING GIN (search_vector);

CREATE OR REPLACE FUNCTION use_cases_search_vector_update() RETURNS trigger AS $$
BEGIN
  -- Веса:
  --   A = title + primary_class + primary_method (буквальные совпадения важнее)
  --   B = synonyms_ru + synonyms_en + tags (расширения для семантики)
  --   C = use_case_slug
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.title,'')),          'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.primary_class,'')),  'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.primary_method,'')), 'A') ||
    setweight(to_tsvector('simple',
      jsonb_path_query_array(NEW.synonyms_ru, '$[*]')::text), 'B') ||
    setweight(to_tsvector('simple',
      jsonb_path_query_array(NEW.synonyms_en, '$[*]')::text), 'B') ||
    setweight(to_tsvector('simple',
      jsonb_path_query_array(NEW.tags,        '$[*]')::text), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.use_case_slug,'')), 'C');
  NEW.updated_at := NOW();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_use_cases_search_vector ON use_cases;
CREATE TRIGGER trg_use_cases_search_vector
  BEFORE INSERT OR UPDATE ON use_cases
  FOR EACH ROW EXECUTE FUNCTION use_cases_search_vector_update();

UPDATE use_cases SET updated_at = NOW();

-- 1.3 pipelines.search_vector
ALTER TABLE pipelines
  ADD COLUMN IF NOT EXISTS search_vector TSVECTOR;

CREATE INDEX IF NOT EXISTS idx_pipelines_search
  ON pipelines USING GIN (search_vector);

CREATE OR REPLACE FUNCTION pipelines_search_vector_update() RETURNS trigger AS $$
BEGIN
  -- Веса:
  --   A = title + composer_class
  --   B = chain_classes + chain_repos + tags
  --   C = pipeline_slug
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.title,'')),           'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.composer_class,'')),  'A') ||
    setweight(to_tsvector('simple',
      jsonb_path_query_array(NEW.chain_classes, '$[*]')::text), 'B') ||
    setweight(to_tsvector('simple',
      jsonb_path_query_array(NEW.chain_repos,   '$[*]')::text), 'B') ||
    setweight(to_tsvector('simple',
      jsonb_path_query_array(NEW.tags,          '$[*]')::text), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.pipeline_slug,'')), 'C');
  NEW.updated_at := NOW();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pipelines_search_vector ON pipelines;
CREATE TRIGGER trg_pipelines_search_vector
  BEFORE INSERT OR UPDATE ON pipelines
  FOR EACH ROW EXECUTE FUNCTION pipelines_search_vector_update();

UPDATE pipelines SET updated_at = NOW();

COMMENT ON COLUMN doc_blocks.search_vector IS 'tsvector для sparse BM25 на rag_hybrid (C3, миграция 2026-05-08).';
COMMENT ON COLUMN use_cases.search_vector  IS 'tsvector для sparse BM25 на rag_hybrid (C3, миграция 2026-05-08).';
COMMENT ON COLUMN pipelines.search_vector  IS 'tsvector для sparse BM25 на rag_hybrid (C3, миграция 2026-05-08).';

-- =============================================================================
-- 2. Расширение rag_dsp.test_params (KFP design v1)
-- =============================================================================
-- См. RAG_kfp_design_2026-05-08.md §3.1.
-- Цель: дать AI достаточно полей чтобы генерировать смысленные тесты:
--   return_checks (что проверять), throw_checks (когда бросает), linked_* (связь с RAG),
--   embedding_text (для Qdrant), coverage_status (фильтрация), confidence (LEVEL 0/1/2).

ALTER TABLE test_params
  ADD COLUMN IF NOT EXISTS return_checks    JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS throw_checks     JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS linked_use_cases TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS linked_pipelines TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS embedding_text   TEXT,
  ADD COLUMN IF NOT EXISTS coverage_status  TEXT
       CHECK (coverage_status IS NULL OR
              coverage_status IN ('ready_for_autotest','partial','skipped','trivial')),
  ADD COLUMN IF NOT EXISTS confidence       REAL
       CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0)),
  ADD COLUMN IF NOT EXISTS verified_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS doxy_block_id    TEXT REFERENCES doc_blocks(block_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_test_params_coverage    ON test_params(coverage_status);
CREATE INDEX IF NOT EXISTS idx_test_params_confidence  ON test_params(confidence);
CREATE INDEX IF NOT EXISTS idx_test_params_doxy_block  ON test_params(doxy_block_id);
CREATE INDEX IF NOT EXISTS idx_test_params_use_cases   ON test_params USING GIN (linked_use_cases);
CREATE INDEX IF NOT EXISTS idx_test_params_pipelines   ON test_params USING GIN (linked_pipelines);

COMMENT ON COLUMN test_params.return_checks    IS 'JSONB [{expr, context}] — что проверять в @return (KFP §3.1).';
COMMENT ON COLUMN test_params.throw_checks     IS 'JSONB [{on, type}] — для negative-тестов (KFP §3.1).';
COMMENT ON COLUMN test_params.linked_use_cases IS 'use_cases.id[] где параметр используется (KFP §3.1, P1).';
COMMENT ON COLUMN test_params.linked_pipelines IS 'pipelines.id[] где параметр используется (KFP §3.1, P1).';
COMMENT ON COLUMN test_params.embedding_text   IS 'Compiled text для Qdrant target_table=test_params (KFP §3.1).';
COMMENT ON COLUMN test_params.coverage_status  IS 'spec 09 §5.4: ready_for_autotest/partial/skipped/trivial.';
COMMENT ON COLUMN test_params.confidence       IS 'LEVEL 0=0.5 (auto), LEVEL 1=0.8 (AI heuristics), LEVEL 2=1.0 (programmer).';
COMMENT ON COLUMN test_params.doxy_block_id    IS 'FK на doc_blocks — источник doxygen блока (KFP §3.1).';

-- =============================================================================
-- 3. Новая таблица rag_dsp.usage_stats (C10 telemetry-driven boost)
-- =============================================================================
-- Заполняется hook'ом gpu_test_utils::TestRunner::OnTestComplete().
-- Используется в rag_hybrid.py как popularity_boost = log1p(calls_total)/10.

CREATE TABLE IF NOT EXISTS usage_stats (
    symbol_id        INT PRIMARY KEY REFERENCES symbols(id) ON DELETE CASCADE,
    calls_total      BIGINT NOT NULL DEFAULT 0,
    last_called      TIMESTAMPTZ,
    avg_latency_ms   REAL,
    p50_latency_ms   REAL,
    p99_latency_ms   REAL,
    error_rate       REAL DEFAULT 0.0
        CHECK (error_rate >= 0.0 AND error_rate <= 1.0),
    last_run_id      TEXT,
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_stats_calls       ON usage_stats(calls_total DESC);
CREATE INDEX IF NOT EXISTS idx_usage_stats_last_called ON usage_stats(last_called DESC NULLS LAST);

COMMENT ON TABLE  usage_stats IS 'Telemetry от gpu_test_utils::TestRunner::OnTestComplete() (C10).';
COMMENT ON COLUMN usage_stats.calls_total IS 'Сколько раз symbol тестировался; popularity_boost = log1p(calls_total)/10.';

-- =============================================================================
-- 4. Расширение rag_dsp.rag_logs (C4 HyDE + future CRAG)
-- =============================================================================

ALTER TABLE rag_logs
  ADD COLUMN IF NOT EXISTS hyde_used             BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hyde_hypothesis       TEXT,
  ADD COLUMN IF NOT EXISTS hyde_classifier_mode  TEXT
       CHECK (hyde_classifier_mode IS NULL OR
              hyde_classifier_mode IN ('fast','smart_hyde','smart_no_hyde')),
  ADD COLUMN IF NOT EXISTS retrieval_iterations  JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS context_pack_intent   TEXT,
  ADD COLUMN IF NOT EXISTS context_pack_include  JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_rag_logs_hyde       ON rag_logs(hyde_used) WHERE hyde_used = TRUE;
CREATE INDEX IF NOT EXISTS idx_rag_logs_classifier ON rag_logs(hyde_classifier_mode);

COMMENT ON COLUMN rag_logs.hyde_used            IS 'C4: была ли гипотеза HyDE сгенерирована для этого запроса.';
COMMENT ON COLUMN rag_logs.hyde_hypothesis      IS 'C4: текст гипотезы (для дебага и кэша).';
COMMENT ON COLUMN rag_logs.hyde_classifier_mode IS 'C4: fast / smart_hyde / smart_no_hyde — что выбрал auto-classifier.';
COMMENT ON COLUMN rag_logs.retrieval_iterations IS 'A1 (Phase C): JSONB лог CRAG-loop итераций.';
COMMENT ON COLUMN rag_logs.context_pack_intent  IS 'C7: intent с которым был вызван dsp_context_pack.';

-- =============================================================================
-- 5. Sanity check
-- =============================================================================
SELECT
    'doc_blocks'    AS tbl, count(*) AS rows, count(search_vector) AS with_tsv FROM doc_blocks
UNION ALL SELECT 'use_cases',   count(*), count(search_vector) FROM use_cases
UNION ALL SELECT 'pipelines',   count(*), count(search_vector) FROM pipelines
UNION ALL SELECT 'test_params', count(*), count(coverage_status) FROM test_params
UNION ALL SELECT 'usage_stats', count(*), 0 FROM usage_stats;

-- =============================================================================
-- ROLLBACK (если что-то пошло не так — раскомментировать и применить)
-- =============================================================================
-- DROP TRIGGER IF EXISTS trg_doc_blocks_search_vector ON doc_blocks;
-- DROP TRIGGER IF EXISTS trg_use_cases_search_vector  ON use_cases;
-- DROP TRIGGER IF EXISTS trg_pipelines_search_vector  ON pipelines;
-- DROP FUNCTION IF EXISTS doc_blocks_search_vector_update();
-- DROP FUNCTION IF EXISTS use_cases_search_vector_update();
-- DROP FUNCTION IF EXISTS pipelines_search_vector_update();
-- DROP INDEX IF EXISTS idx_doc_blocks_search;
-- DROP INDEX IF EXISTS idx_use_cases_search;
-- DROP INDEX IF EXISTS idx_pipelines_search;
-- ALTER TABLE doc_blocks DROP COLUMN IF EXISTS search_vector;
-- ALTER TABLE use_cases  DROP COLUMN IF EXISTS search_vector;
-- ALTER TABLE pipelines  DROP COLUMN IF EXISTS search_vector;
-- ALTER TABLE test_params
--   DROP COLUMN IF EXISTS return_checks,
--   DROP COLUMN IF EXISTS throw_checks,
--   DROP COLUMN IF EXISTS linked_use_cases,
--   DROP COLUMN IF EXISTS linked_pipelines,
--   DROP COLUMN IF EXISTS embedding_text,
--   DROP COLUMN IF EXISTS coverage_status,
--   DROP COLUMN IF EXISTS confidence,
--   DROP COLUMN IF EXISTS verified_at,
--   DROP COLUMN IF EXISTS doxy_block_id;
-- DROP TABLE IF EXISTS usage_stats;
-- ALTER TABLE rag_logs
--   DROP COLUMN IF EXISTS hyde_used,
--   DROP COLUMN IF EXISTS hyde_hypothesis,
--   DROP COLUMN IF EXISTS hyde_classifier_mode,
--   DROP COLUMN IF EXISTS retrieval_iterations,
--   DROP COLUMN IF EXISTS context_pack_intent,
--   DROP COLUMN IF EXISTS context_pack_include;

-- Конец миграции.
