-- =============================================================================
-- gpu_rag_dsp.rag_dsp — RAG таблицы (TASK_RAG_02 v3)
-- =============================================================================
-- Версия: 1.0  · Дата: 2026-05-06  · Автор: Кодо
--
-- Создаёт 4 таблицы для RAG-агентов:
--   doc_blocks    — главное хранилище контента (markdown-блоков)
--   use_cases     — карточки use-case'ов (метаданные)
--   pipelines     — карточки pipeline'ов (метаданные)
--   ai_stubs      — placeholder'ы для AI-сгенерированного контента
--
-- Variant C (план v2): vectors хранятся в Qdrant (`dsp_gpu_rag_v1`),
-- а не в PG. Поэтому БЕЗ колонок embedding и БЕЗ HNSW индексов.
--
-- v3 (2026-05-06): добавлено поле doc_blocks.inherits_block_id для
-- иерархических связей (CMake common ↔ specific, parent CLAUDE.md ↔ child).
--
-- Запуск (после postgres_init.sql):
--   sudo -u postgres psql -d gpu_rag_dsp -f postgres_init_rag.sql
--
-- =============================================================================

\c gpu_rag_dsp

-- Подменяемая схема: по умолчанию rag_dsp.
-- Для прогона на тестовой: psql -v target_schema=rag_dsp_test -f postgres_init_rag.sql
\set target_schema 'rag_dsp'

-- Если переменная не передана — используем дефолт (rag_dsp).
SELECT CASE WHEN :'target_schema' = '' THEN 'rag_dsp' ELSE :'target_schema' END AS resolved \gset

CREATE SCHEMA IF NOT EXISTS :"resolved" AUTHORIZATION dsp_asst;
SET search_path TO :"resolved", public;

-- =============================================================================
-- 1. doc_blocks — главное хранилище контента
-- =============================================================================

CREATE TABLE IF NOT EXISTS doc_blocks (
    block_id          TEXT PRIMARY KEY,
    repo              TEXT NOT NULL,
    class_or_module   TEXT NOT NULL,
    concept           TEXT NOT NULL,
    sub_index         INT,
    version           INT NOT NULL DEFAULT 1,

    doc_path          TEXT,
    header_path       TEXT,
    line_start        INT,
    line_end          INT,

    content_md        TEXT NOT NULL,
    content_format    TEXT DEFAULT 'markdown',

    source_hash       CHAR(40) NOT NULL,

    ai_generated      BOOLEAN DEFAULT FALSE,
    ai_model          TEXT,
    human_verified    BOOLEAN DEFAULT FALSE,

    deprecated_by     TEXT REFERENCES doc_blocks(block_id),
    inherits_block_id TEXT REFERENCES doc_blocks(block_id),  -- v3: для иерархий
    related_ids       JSONB DEFAULT '[]'::jsonb,

    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_blocks_repo     ON doc_blocks(repo);
CREATE INDEX IF NOT EXISTS idx_doc_blocks_class    ON doc_blocks(class_or_module);
CREATE INDEX IF NOT EXISTS idx_doc_blocks_concept  ON doc_blocks(concept);
CREATE INDEX IF NOT EXISTS idx_doc_blocks_inherits ON doc_blocks(inherits_block_id);
CREATE INDEX IF NOT EXISTS idx_doc_blocks_related  ON doc_blocks USING GIN (related_ids);

COMMENT ON TABLE doc_blocks IS 'Главное хранилище markdown-блоков для RAG. Vectors в Qdrant `dsp_gpu_rag_v1`.';
COMMENT ON COLUMN doc_blocks.block_id IS 'Semantic slug: {repo}__{class_or_module_snake}__{concept}[_NNN]__v{n}';
COMMENT ON COLUMN doc_blocks.inherits_block_id IS 'v3: иерархия (CMake common ← specific, parent CLAUDE.md ← child). NULL у корневых блоков.';
COMMENT ON COLUMN doc_blocks.concept IS 'Slug whitelist: class_overview, usage_example, method_*_signature, method_*_doxygen, method_*_test_params, when_to_use, solution, parameters, edge_cases, next_steps, chain_overview, used_classes, data_flow, pipeline_data_flow, math, api, usage, overview, example, tests, benchmark, meta_overview, meta_claude, meta_cmake_common, meta_cmake_specific, meta_targets, meta_rules_index, build_orchestration, python_binding, python_test_usecase, cross_repo_pipeline';

-- =============================================================================
-- 2. use_cases — карточки use-case'ов (метаданные)
-- =============================================================================

CREATE TABLE IF NOT EXISTS use_cases (
    id                TEXT PRIMARY KEY,
    repo              TEXT NOT NULL,
    use_case_slug     TEXT NOT NULL,
    title             TEXT NOT NULL,
    primary_class     TEXT,
    primary_method    TEXT,

    synonyms_ru       JSONB DEFAULT '[]'::jsonb,
    synonyms_en       JSONB DEFAULT '[]'::jsonb,
    tags              JSONB DEFAULT '[]'::jsonb,

    block_refs        JSONB DEFAULT '[]'::jsonb,
    related_use_cases JSONB DEFAULT '[]'::jsonb,
    related_classes   JSONB DEFAULT '[]'::jsonb,

    md_path           TEXT NOT NULL,
    md_hash           CHAR(40) NOT NULL,

    ai_generated      BOOLEAN DEFAULT FALSE,
    human_verified    BOOLEAN DEFAULT FALSE,

    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_use_cases_repo  ON use_cases(repo);
CREATE INDEX IF NOT EXISTS idx_use_cases_class ON use_cases(primary_class);

COMMENT ON TABLE use_cases IS 'Метаданные use-case карточек. Vectors (title+synonyms) в Qdrant.';

-- =============================================================================
-- 3. pipelines — карточки pipeline'ов (метаданные)
-- =============================================================================

CREATE TABLE IF NOT EXISTS pipelines (
    id                TEXT PRIMARY KEY,
    repo              TEXT NOT NULL,
    pipeline_slug     TEXT NOT NULL,
    title             TEXT NOT NULL,
    composer_class    TEXT,

    chain_classes     JSONB DEFAULT '[]'::jsonb,
    chain_repos       JSONB DEFAULT '[]'::jsonb,

    block_refs        JSONB DEFAULT '[]'::jsonb,
    related_pipelines JSONB DEFAULT '[]'::jsonb,

    md_path           TEXT NOT NULL,
    md_hash           CHAR(40) NOT NULL,

    ai_generated      BOOLEAN DEFAULT FALSE,
    human_verified    BOOLEAN DEFAULT FALSE,

    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipelines_repo     ON pipelines(repo);
CREATE INDEX IF NOT EXISTS idx_pipelines_composer ON pipelines(composer_class);

COMMENT ON TABLE pipelines IS 'Метаданные pipeline карточек.';

-- =============================================================================
-- 4. ai_stubs — placeholder'ы для AI-сгенерированного контента
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_stubs (
    id              SERIAL PRIMARY KEY,
    repo            TEXT NOT NULL,
    block_id        TEXT REFERENCES doc_blocks(block_id),
    md_path         TEXT,
    placeholder_tag TEXT NOT NULL UNIQUE,

    suggested_text  TEXT,
    status          TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending', 'human_filled', 'rejected')),
    filled_text     TEXT,
    filled_at       TIMESTAMPTZ,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_stubs_status ON ai_stubs(status);
CREATE INDEX IF NOT EXISTS idx_ai_stubs_repo   ON ai_stubs(repo);

COMMENT ON TABLE ai_stubs IS 'TODO-маркеры в .md файлах. Q-{N} формат, UNIQUE.';

-- =============================================================================
-- Права доступа для dsp_asst
-- =============================================================================

GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA :"resolved" TO dsp_asst;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA :"resolved" TO dsp_asst;
ALTER DEFAULT PRIVILEGES IN SCHEMA :"resolved" GRANT ALL ON TABLES    TO dsp_asst;
ALTER DEFAULT PRIVILEGES IN SCHEMA :"resolved" GRANT ALL ON SEQUENCES TO dsp_asst;

-- =============================================================================
-- Готово. 4 RAG таблицы созданы в schema :"resolved".
-- Vectors → Qdrant `dsp_gpu_rag_v1` (см. qdrant_create_rag_collection.py).
-- =============================================================================
