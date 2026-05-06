-- =============================================================================
-- gpu_rag_dsp — pgvector add-on (renamed from dsp_assistant 2026-05-06)
-- =============================================================================
-- Версия: 1.0  · Дата: 2026-04-30  · Автор: Кодо
--
-- Запускать ПОСЛЕ postgres_init.sql, и только когда установлен pgvector extension.
--
-- Установка pgvector:
--   Windows:  компиляция из source (см. https://github.com/pgvector/pgvector#windows)
--             требует Visual Studio Build Tools + nmake.
--   Debian:   sudo apt install postgresql-16-pgvector
--   Ubuntu:   sudo apt install postgresql-16-pgvector
--
-- Запуск (Windows):
--   set PGPASSWORD=<dsp_asst-pass>
--   "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U dsp_asst -d gpu_rag_dsp -f postgres_init_pgvector.sql
--
-- Запуск (Linux):
--   sudo -u postgres psql -d gpu_rag_dsp -f postgres_init_pgvector.sql
--
-- =============================================================================

\c gpu_rag_dsp

CREATE EXTENSION IF NOT EXISTS vector;

SET search_path TO rag_dsp, public;

-- ТАБЛИЦА embeddings — используется на stage 1_home (Win, без Qdrant)
-- На stage 2+ создаётся, но не наполняется (vectors хранятся в Qdrant).

CREATE TABLE IF NOT EXISTS embeddings (
    id              SERIAL PRIMARY KEY,
    symbol_id       INT UNIQUE NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
    collection      TEXT NOT NULL DEFAULT 'public_api',  -- public_api / internal
    embedding       vector(1024),                        -- BGE-M3
    model           TEXT NOT NULL DEFAULT 'BAAI/bge-m3',
    indexed_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embeddings_symbol ON embeddings(symbol_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_collection ON embeddings(collection);

-- HNSW индекс для cosine-расстояния (быстрый ANN-поиск)
CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw ON embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);

-- =============================================================================
-- Готово. Таблица embeddings + HNSW индекс созданы.
-- Проверка: \d rag_dsp.embeddings
-- =============================================================================
