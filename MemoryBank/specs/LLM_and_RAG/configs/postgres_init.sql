-- =============================================================================
-- dsp_assistant — PostgreSQL init script
-- =============================================================================
-- Версия: 1.0  · Дата: 2026-04-30  · Автор: Кодо
--
-- Создаёт пользователя, базу, схему, расширения и все таблицы для
-- локального AI-ассистента DSP-GPU.
--
-- Запуск (Windows):
--   set PGPASSWORD=<superuser-pass>
--   psql -U postgres -v pg_password='secret' -f postgres_init.sql
--
-- Запуск (Debian/Ubuntu):
--   sudo -u postgres psql -v pg_password='secret' -f postgres_init.sql
--
-- =============================================================================

-- 1. ПОЛЬЗОВАТЕЛЬ И БАЗА
-- -----------------------------------------------------------------------------

CREATE USER dsp_asst WITH PASSWORD :'pg_password';
CREATE DATABASE dsp_assistant OWNER dsp_asst ENCODING 'UTF8' LC_COLLATE='C' LC_CTYPE='C' TEMPLATE template0;

\c dsp_assistant

-- 2. СХЕМА И РАСШИРЕНИЯ
-- -----------------------------------------------------------------------------

CREATE SCHEMA dsp_gpu AUTHORIZATION dsp_asst;
GRANT ALL ON SCHEMA dsp_gpu TO dsp_asst;
ALTER USER dsp_asst SET search_path TO dsp_gpu, public;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- pgvector ставим ОТДЕЛЬНО через configs/postgres_init_pgvector.sql
-- (нужен для stage 1_home, требует компиляции из source через MSVC на Windows
-- или apt install postgresql-16-pgvector на Linux).

SET search_path TO dsp_gpu, public;

-- 3. ТАБЛИЦА files
-- -----------------------------------------------------------------------------

CREATE TABLE files (
    id              SERIAL PRIMARY KEY,
    path            TEXT UNIQUE NOT NULL,
    repo            TEXT NOT NULL,
    language        TEXT NOT NULL,
    file_ext        TEXT NOT NULL,
    size_bytes      BIGINT NOT NULL,
    line_count      INT,
    blake3_hash     TEXT NOT NULL,
    last_indexed    TIMESTAMPTZ DEFAULT NOW(),
    is_indexable    BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_files_repo ON files(repo);
CREATE INDEX idx_files_language ON files(language);
CREATE INDEX idx_files_hash ON files(blake3_hash);

-- 4. ТАБЛИЦА symbols
-- -----------------------------------------------------------------------------

CREATE TABLE symbols (
    id              SERIAL PRIMARY KEY,
    file_id         INT NOT NULL REFERENCES files(id) ON DELETE CASCADE,

    name            TEXT NOT NULL,
    fqn             TEXT NOT NULL,
    namespace       TEXT,
    parent_id       INT REFERENCES symbols(id) ON DELETE CASCADE,

    kind            TEXT NOT NULL,

    line_start      INT NOT NULL,
    line_end        INT NOT NULL,
    column_start    INT,
    column_end      INT,

    return_type     TEXT,
    args_signature  TEXT,
    args_jsonb      JSONB,

    access          TEXT,
    is_static       BOOLEAN DEFAULT FALSE,
    is_const        BOOLEAN DEFAULT FALSE,
    is_virtual      BOOLEAN DEFAULT FALSE,
    is_override     BOOLEAN DEFAULT FALSE,
    is_final        BOOLEAN DEFAULT FALSE,
    is_noexcept     BOOLEAN DEFAULT FALSE,
    is_constexpr    BOOLEAN DEFAULT FALSE,
    is_template     BOOLEAN DEFAULT FALSE,
    template_params TEXT,

    doxy_brief      TEXT,
    doxy_full       TEXT,
    doxy_params     JSONB,
    doxy_returns    TEXT,
    doxy_throws     TEXT[],
    doxy_see        TEXT[],

    ai_summary      TEXT,
    ai_summary_at   TIMESTAMPTZ,
    ai_model        TEXT,

    is_deprecated   BOOLEAN DEFAULT FALSE,
    deprecation_note TEXT,

    search_vector   TSVECTOR,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_symbols_file ON symbols(file_id);
CREATE INDEX idx_symbols_name ON symbols(name);
CREATE INDEX idx_symbols_fqn ON symbols(fqn);
CREATE INDEX idx_symbols_kind ON symbols(kind);
CREATE INDEX idx_symbols_namespace ON symbols(namespace);
CREATE INDEX idx_symbols_parent ON symbols(parent_id);
CREATE INDEX idx_symbols_access ON symbols(access);
CREATE INDEX idx_symbols_deprecated ON symbols(is_deprecated) WHERE is_deprecated = TRUE;

CREATE INDEX idx_symbols_name_trgm ON symbols USING GIN (name gin_trgm_ops);
CREATE INDEX idx_symbols_fqn_trgm ON symbols USING GIN (fqn gin_trgm_ops);
CREATE INDEX idx_symbols_search ON symbols USING GIN (search_vector);

-- Триггер обновления search_vector
CREATE OR REPLACE FUNCTION symbols_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.name,'')),       'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.fqn,'')),        'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.doxy_brief,'')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.ai_summary,'')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.doxy_full,'')),  'C');
  NEW.updated_at := NOW();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_symbols_search_vector
BEFORE INSERT OR UPDATE ON symbols
FOR EACH ROW EXECUTE FUNCTION symbols_search_vector_update();

-- 5. ТАБЛИЦА deps
-- -----------------------------------------------------------------------------

CREATE TABLE deps (
    id              SERIAL PRIMARY KEY,
    from_symbol_id  INT NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
    to_symbol_id    INT REFERENCES symbols(id) ON DELETE SET NULL,
    to_external     TEXT,
    kind            TEXT NOT NULL,
    line            INT,
    extracted_by    TEXT,
    confidence      REAL DEFAULT 1.0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(from_symbol_id, to_symbol_id, kind, line)
);

CREATE INDEX idx_deps_from ON deps(from_symbol_id);
CREATE INDEX idx_deps_to ON deps(to_symbol_id);
CREATE INDEX idx_deps_kind ON deps(kind);
CREATE INDEX idx_deps_external ON deps(to_external) WHERE to_external IS NOT NULL;

-- 6. ТАБЛИЦА includes
-- -----------------------------------------------------------------------------

CREATE TABLE includes (
    id              SERIAL PRIMARY KEY,
    file_id         INT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    included_path   TEXT NOT NULL,
    is_system       BOOLEAN NOT NULL,
    resolved_file_id INT REFERENCES files(id) ON DELETE SET NULL,
    line            INT,

    UNIQUE(file_id, included_path)
);

CREATE INDEX idx_includes_file ON includes(file_id);
CREATE INDEX idx_includes_resolved ON includes(resolved_file_id);

-- 7. ТАБЛИЦА enum_values
-- -----------------------------------------------------------------------------

CREATE TABLE enum_values (
    id              SERIAL PRIMARY KEY,
    enum_id         INT NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    value           TEXT,
    doxy_brief      TEXT,
    sort_order      INT NOT NULL,

    UNIQUE(enum_id, name)
);

-- 8. ТАБЛИЦА pybind_bindings
-- -----------------------------------------------------------------------------

CREATE TABLE pybind_bindings (
    id                  SERIAL PRIMARY KEY,
    cpp_symbol_id       INT NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
    py_module           TEXT NOT NULL,
    py_class            TEXT NOT NULL,
    binding_file_id     INT REFERENCES files(id),
    binding_line        INT,
    methods_exposed     JSONB,

    UNIQUE(py_module, py_class)
);

CREATE INDEX idx_pybind_module ON pybind_bindings(py_module);
CREATE INDEX idx_pybind_class ON pybind_bindings(py_class);

-- 9. ТАБЛИЦА test_params
-- -----------------------------------------------------------------------------

CREATE TABLE test_params (
    id                  SERIAL PRIMARY KEY,
    symbol_id           INT NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
    param_name          TEXT NOT NULL,
    param_type          TEXT NOT NULL,
    edge_values         JSONB NOT NULL,
    constraints         JSONB,
    auto_extracted      BOOLEAN DEFAULT TRUE,
    human_verified      BOOLEAN DEFAULT FALSE,
    comments            TEXT,
    extracted_from      JSONB,
    operator_name       TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(symbol_id, param_name)
);

CREATE INDEX idx_test_params_symbol ON test_params(symbol_id);
CREATE INDEX idx_test_params_verified ON test_params(human_verified);

-- 10. ТАБЛИЦА rag_logs
-- -----------------------------------------------------------------------------

CREATE TABLE rag_logs (
    id                  SERIAL PRIMARY KEY,
    timestamp           TIMESTAMPTZ DEFAULT NOW(),
    mode                TEXT NOT NULL,
    user_query          TEXT NOT NULL,
    retrieved_chunks    JSONB NOT NULL,
    prompt_used         TEXT,
    llm_model           TEXT NOT NULL,
    llm_response        TEXT,
    response_time_ms    INT,
    user_rating         INT,
    user_correction     TEXT,
    used_for_sft        BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_rag_logs_mode ON rag_logs(mode);
CREATE INDEX idx_rag_logs_timestamp ON rag_logs(timestamp DESC);
CREATE INDEX idx_rag_logs_for_sft ON rag_logs(used_for_sft) WHERE used_for_sft = FALSE;
CREATE INDEX idx_rag_logs_rating ON rag_logs(user_rating) WHERE user_rating >= 4;

-- 11. ТАБЛИЦА cmake_targets
-- -----------------------------------------------------------------------------

CREATE TABLE cmake_targets (
    id                  SERIAL PRIMARY KEY,
    file_id             INT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    target_name         TEXT NOT NULL,
    target_type         TEXT NOT NULL,
    sources             JSONB,
    public_links        JSONB,
    private_links       JSONB,
    line                INT,

    UNIQUE(file_id, target_name)
);

CREATE INDEX idx_cmake_target_name ON cmake_targets(target_name);

-- 12. ПРАВА ДОСТУПА для dsp_asst
-- -----------------------------------------------------------------------------
-- Все таблицы создаются от имени суперюзера postgres → dsp_asst по умолчанию
-- не может INSERT/UPDATE. Выдаём права + DEFAULT PRIVILEGES для будущих таблиц.

GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA dsp_gpu TO dsp_asst;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA dsp_gpu TO dsp_asst;
ALTER DEFAULT PRIVILEGES IN SCHEMA dsp_gpu GRANT ALL ON TABLES    TO dsp_asst;
ALTER DEFAULT PRIVILEGES IN SCHEMA dsp_gpu GRANT ALL ON SEQUENCES TO dsp_asst;

-- =============================================================================
-- Готово. Базовая схема (9 таблиц) создана.
-- Проверка: \dt dsp_gpu.*  (должно быть 9 таблиц)
--
-- Таблица embeddings (pgvector) создаётся ОТДЕЛЬНО через
-- configs/postgres_init_pgvector.sql — после установки pgvector extension.
-- =============================================================================
