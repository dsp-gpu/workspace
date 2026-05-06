# Схема баз данных — PostgreSQL (+ Qdrant на work/server)

> **Версия:** 1.1 · **Создан:** 2026-04-30 · **Автор:** Кодо
> **Контекст:** Гибридная схема (выбор Alex):
> - **Дома (Win):** только PostgreSQL с `pgvector` — без Qdrant (на Win нет нативной сборки).
> - **Работа (Debian) + мини-сервер (Ubuntu) + prod:** PostgreSQL + Qdrant (как раньше планировали).
>
> **Init script:** `configs/postgres_init.sql` (создаёт БД, схему, расширения, **включая `vector`**).
> **Migrations:** `alembic` после Phase 1.

---

## 1. Общая картина

### Stage 1 (home, Windows) — одна БД

| БД | Что хранит |
|----|-----------|
| **PostgreSQL + pgvector** | symbols, deps, files, includes, test_params, ai_summary, rag_logs, BM25 (tsvector), **dense embeddings (vector(1024))** |

### Stage 2+ (work, mini-server, prod) — две БД

| БД | Что хранит |
|----|-----------|
| **PostgreSQL** | symbols, deps, files, includes, test_params, ai_summary, rag_logs, BM25 (tsvector). Расширение `vector` установлено, но таблица `embeddings` **не используется** (пуста). |
| **Qdrant** | dense embeddings BGE-M3 (1024-dim), 2 коллекции: `public_api` и `internal`. Payload содержит `symbol_id` для join. |

### Абстракция в коде

В `dsp_assistant/retrieval/vector_store.py` — интерфейс `VectorStore` с двумя реализациями:
- `PgvectorStore` (для stage 1)
- `QdrantStore` (для stage 2+)

Выбор по `configs/stack.json` → `stages.<active>.vector_db.provider`. Остальной код retrieval-pipeline неизменен.

---

## 2. PostgreSQL — DDL

### 2.1. База и схема

```sql
CREATE DATABASE gpu_rag_dsp;
\c gpu_rag_dsp

CREATE SCHEMA rag_dsp;
SET search_path TO rag_dsp, public;

-- Расширения
CREATE EXTENSION IF NOT EXISTS pg_trgm;        -- trigram-поиск
CREATE EXTENSION IF NOT EXISTS btree_gin;      -- комбинированные индексы
CREATE EXTENSION IF NOT EXISTS vector;         -- pgvector — на stage 1 активно используется,
                                               -- на stage 2+ остаётся пустой (vectors в Qdrant)
```

### 2.2. Таблица `files`

Один файл = одна запись. Хеш для инкрементального ре-индексирования.

```sql
CREATE TABLE files (
    id              SERIAL PRIMARY KEY,
    path            TEXT UNIQUE NOT NULL,         -- абсолютный путь, нормализованный к / на Windows
    repo            TEXT NOT NULL,                -- core / spectrum / stats / ...
    language        TEXT NOT NULL,                -- cpp / python / cmake / json / md
    file_ext        TEXT NOT NULL,                -- .hpp / .cpp / .py / .json / .md
    size_bytes      BIGINT NOT NULL,
    line_count      INT,
    blake3_hash     TEXT NOT NULL,                -- для инкрементального ре-индексирования
    last_indexed    TIMESTAMPTZ DEFAULT NOW(),
    is_indexable    BOOLEAN DEFAULT TRUE          -- false для бинарных fixtures (только метаданные)
);

CREATE INDEX idx_files_repo ON files(repo);
CREATE INDEX idx_files_language ON files(language);
CREATE INDEX idx_files_hash ON files(blake3_hash);
```

### 2.3. Таблица `symbols`

Главная таблица — все классы, методы, поля, enum, free functions, macros.

```sql
CREATE TABLE symbols (
    id              SERIAL PRIMARY KEY,
    file_id         INT NOT NULL REFERENCES files(id) ON DELETE CASCADE,

    -- Идентификация
    name            TEXT NOT NULL,                -- "FFTProcessorROCm" / "Process" / "fft_size_"
    fqn             TEXT NOT NULL,                -- fully-qualified: "fft_processor::FFTProcessorROCm::Process"
    namespace       TEXT,                          -- "fft_processor"
    parent_id       INT REFERENCES symbols(id) ON DELETE CASCADE,  -- метод → класс, поле → класс

    -- Тип сущности
    kind            TEXT NOT NULL,
        -- enum значений:
        --   class, struct, interface, enum, enum_class, typedef, using,
        --   namespace, method, ctor, dtor, free_function, public_field,
        --   protected_field, private_field, public_method, protected_method,
        --   private_method, macro, template_class, friend, global_const

    -- Локация
    line_start      INT NOT NULL,
    line_end        INT NOT NULL,
    column_start    INT,
    column_end      INT,

    -- Сигнатура (для методов/функций)
    return_type     TEXT,
    args_signature  TEXT,                          -- "size_t window_size, float* out"
    args_jsonb      JSONB,                         -- [{"name":"window_size","type":"size_t"}]

    -- C++ атрибуты
    access          TEXT,                          -- public / protected / private (для методов и полей)
    is_static       BOOLEAN DEFAULT FALSE,
    is_const        BOOLEAN DEFAULT FALSE,
    is_virtual      BOOLEAN DEFAULT FALSE,
    is_override     BOOLEAN DEFAULT FALSE,
    is_final        BOOLEAN DEFAULT FALSE,
    is_noexcept     BOOLEAN DEFAULT FALSE,
    is_constexpr    BOOLEAN DEFAULT FALSE,
    is_template     BOOLEAN DEFAULT FALSE,
    template_params TEXT,                          -- "typename T, size_t N"

    -- Документация
    doxy_brief      TEXT,
    doxy_full       TEXT,
    doxy_params     JSONB,                         -- {"window_size":"размер окна",...}
    doxy_returns    TEXT,
    doxy_throws     TEXT[],
    doxy_see        TEXT[],                        -- ["ScopedHipEvent","ProfilingFacade"]

    -- AI-summary (генерится промптом 001 если нет doxy)
    ai_summary      TEXT,
    ai_summary_at   TIMESTAMPTZ,
    ai_model        TEXT,                          -- "qwen3:8b"

    -- Флаги статуса
    is_deprecated   BOOLEAN DEFAULT FALSE,
    deprecation_note TEXT,

    -- Полнотекстовый поиск (BM25-подобный) — генерится триггером
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

-- Trigram для fuzzy-поиска по именам ("FFTProc" → FFTProcessorROCm)
CREATE INDEX idx_symbols_name_trgm ON symbols USING GIN (name gin_trgm_ops);
CREATE INDEX idx_symbols_fqn_trgm ON symbols USING GIN (fqn gin_trgm_ops);

-- Полнотекстовый поиск
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
```

### 2.4. Таблица `deps` (рёбра графа)

```sql
CREATE TABLE deps (
    id              SERIAL PRIMARY KEY,
    from_symbol_id  INT NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
    to_symbol_id    INT REFERENCES symbols(id) ON DELETE SET NULL,  -- может быть NULL для внешних
    to_external     TEXT,                                           -- "hipFFT" / "rocBLAS" / "std::vector"
    kind            TEXT NOT NULL,
        -- enum:
        --   inherits, implements, calls, uses_type, reads_field, writes_field,
        --   returns, parameter, throws, includes, friend_of, instantiates,
        --   factory_creates, raii_for, pybind_for, cmake_link, doc_see
    line            INT,
    extracted_by    TEXT,                                           -- 'tree-sitter' / 'clangd' / 'doxygen' / 'ai'
    confidence      REAL DEFAULT 1.0,                               -- 0..1
    created_at      TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(from_symbol_id, to_symbol_id, kind, line)
);

CREATE INDEX idx_deps_from ON deps(from_symbol_id);
CREATE INDEX idx_deps_to ON deps(to_symbol_id);
CREATE INDEX idx_deps_kind ON deps(kind);
CREATE INDEX idx_deps_external ON deps(to_external) WHERE to_external IS NOT NULL;
```

### 2.5. Таблица `includes` (граф C++ #include)

Отдельная таблица — частная зависимость, нужна для retrieval-режима «контекстное окно».

```sql
CREATE TABLE includes (
    id              SERIAL PRIMARY KEY,
    file_id         INT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    included_path   TEXT NOT NULL,                                  -- "core/services/profiling/profiling_facade.hpp"
    is_system       BOOLEAN NOT NULL,                               -- <vector> vs "..."
    resolved_file_id INT REFERENCES files(id) ON DELETE SET NULL,   -- если разрешили путь
    line            INT,

    UNIQUE(file_id, included_path)
);

CREATE INDEX idx_includes_file ON includes(file_id);
CREATE INDEX idx_includes_resolved ON includes(resolved_file_id);
```

### 2.6. Таблица `enum_values`

```sql
CREATE TABLE enum_values (
    id              SERIAL PRIMARY KEY,
    enum_id         INT NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,                                  -- "ROCm", "Hybrid"
    value           TEXT,                                           -- "0", "1<<2", или NULL если auto
    doxy_brief      TEXT,
    sort_order      INT NOT NULL,

    UNIQUE(enum_id, name)
);
```

### 2.7. Таблица `pybind_bindings`

Связь C++ class ↔ Python class (для запросов «как из Python вызывать `FFTProcessorROCm`»).

```sql
CREATE TABLE pybind_bindings (
    id                  SERIAL PRIMARY KEY,
    cpp_symbol_id       INT NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
    py_module           TEXT NOT NULL,                              -- "dsp_spectrum"
    py_class            TEXT NOT NULL,                              -- "FFTProcessorROCm"
    binding_file_id     INT REFERENCES files(id),                   -- "spectrum/python/dsp_spectrum_module.cpp"
    binding_line        INT,
    methods_exposed     JSONB,                                      -- {"Process":"process","GetSize":"size"}

    UNIQUE(py_module, py_class)
);

CREATE INDEX idx_pybind_module ON pybind_bindings(py_module);
CREATE INDEX idx_pybind_class ON pybind_bindings(py_class);
```

### 2.8. Таблица `test_params` (база граничных значений)

```sql
CREATE TABLE test_params (
    id                  SERIAL PRIMARY KEY,
    symbol_id           INT NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
    param_name          TEXT NOT NULL,                              -- "window_size", "params.fft_size"
    param_type          TEXT NOT NULL,                              -- "size_t", "float", "std::complex<float>"

    -- Значения и ограничения
    edge_values         JSONB NOT NULL,
        -- {"min": 1, "max": "N", "typical": [256,1024,4096], "edge": [0,3,"N+1","max_size_t"]}
    constraints         JSONB,
        -- {"power_of_two": true, "throws_if_zero": true, "must_match_input_dtype": true}

    -- Метки
    auto_extracted      BOOLEAN DEFAULT TRUE,
    human_verified      BOOLEAN DEFAULT FALSE,
    comments            TEXT,
    extracted_from      JSONB,
        -- {"file":"...", "line":142, "snippet":"if (n & (n-1)) throw"}
    operator_name       TEXT,                                       -- 'alex' если верифицировано

    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(symbol_id, param_name)
);

CREATE INDEX idx_test_params_symbol ON test_params(symbol_id);
CREATE INDEX idx_test_params_verified ON test_params(human_verified);
```

### 2.9. Таблица `rag_logs` (для будущего SFT-корпуса)

```sql
CREATE TABLE rag_logs (
    id                  SERIAL PRIMARY KEY,
    timestamp           TIMESTAMPTZ DEFAULT NOW(),
    mode                TEXT NOT NULL,                              -- explain / find / test / doxy / refactor / agent
    user_query          TEXT NOT NULL,
    retrieved_chunks    JSONB NOT NULL,                             -- список symbol_id + score + payload
    prompt_used         TEXT,                                       -- "002_test_python_runner.md"
    llm_model           TEXT NOT NULL,                              -- "qwen3:8b"
    llm_response        TEXT,
    response_time_ms    INT,

    -- Для последующей курации в SFT-пары
    user_rating         INT,                                        -- 1-5 (если оператор оценил)
    user_correction     TEXT,                                       -- если оператор поправил ответ
    used_for_sft        BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_rag_logs_mode ON rag_logs(mode);
CREATE INDEX idx_rag_logs_timestamp ON rag_logs(timestamp DESC);
CREATE INDEX idx_rag_logs_for_sft ON rag_logs(used_for_sft) WHERE user_rating >= 4;
```

### 2.10. Таблица `cmake_targets` (build graph)

Из CMakeLists для retrieval-фильтра «что зависит от чего».

```sql
CREATE TABLE cmake_targets (
    id                  SERIAL PRIMARY KEY,
    file_id             INT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    target_name         TEXT NOT NULL,                              -- "dsp_core", "spectrum_tests"
    target_type         TEXT NOT NULL,                              -- "library" / "executable" / "interface"
    sources             JSONB,                                      -- ["src/foo.cpp",...]
    public_links        JSONB,                                      -- ["hipFFT","core::core"]
    private_links       JSONB,
    line                INT,

    UNIQUE(file_id, target_name)
);

CREATE INDEX idx_cmake_target_name ON cmake_targets(target_name);
```

### 2.11. Таблица `embeddings` (pgvector — для stage 1_home)

На home-этапе все vectors хранятся здесь. На work/server этапах таблица создаётся, но не наполняется (vectors в Qdrant).

```sql
CREATE TABLE embeddings (
    id              SERIAL PRIMARY KEY,
    symbol_id       INT UNIQUE NOT NULL REFERENCES symbols(id) ON DELETE CASCADE,
    collection      TEXT NOT NULL DEFAULT 'public_api',  -- public_api / internal
    embedding       vector(1024),                        -- BGE-M3
    model           TEXT NOT NULL DEFAULT 'BAAI/bge-m3',
    indexed_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_embeddings_symbol ON embeddings(symbol_id);
CREATE INDEX idx_embeddings_collection ON embeddings(collection);

-- HNSW индекс для cosine-расстояния (быстрый ANN-поиск)
CREATE INDEX idx_embeddings_hnsw ON embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 200);
```

**Запрос на retrieval (pgvector):**
```sql
-- top-5 по cosine similarity для коллекции public_api
SELECT s.id, s.fqn, s.repo, 1 - (e.embedding <=> :query_vec) AS score
FROM embeddings e
JOIN symbols s ON s.id = e.symbol_id
WHERE e.collection = 'public_api'
  AND s.is_deprecated = FALSE
ORDER BY e.embedding <=> :query_vec
LIMIT 5;
```

**Гибридный поиск (dense + BM25 через tsvector + RRF):**
- Делаем 2 запроса (dense top-50, sparse top-50) → объединяем reciprocal rank fusion в Python (~30 строк).
- Производительность на 3000-5000 векторов: ~30-50 мс. Хватает с большим запасом.

---

## 3. Qdrant — коллекции (только stage 2+)

### 3.1. `public_api` (основная)

```python
collection_name = "public_api"
vector_size = 1024  # BGE-M3
distance = "Cosine"

# payload schema
{
    "symbol_id": 12345,        # ссылка на symbols.id в Postgres
    "fqn": "fft_processor::FFTProcessorROCm::Process",
    "kind": "method",
    "repo": "spectrum",
    "namespace": "fft_processor",
    "layer": "processor",
    "language": "cpp",
    "file_path": "spectrum/include/spectrum/fft_processor_rocm.hpp",
    "line_start": 140,
    "line_end": 200,
    "is_deprecated": false,
    "patterns": ["Operation"],
    "access": "public",
    "doxy_present": true
}
```

**Что попадает:** все public-методы, public-поля, free-функции, классы целиком, enum целиком, namespace docs, README/specs heading-блоки.

**HNSW параметры:**
- `m = 16` (стандарт)
- `ef_construct = 200` (качество индекса)
- `ef_search = 100` (per-query, можно снизить для скорости)

### 3.2. `internal` (для refactor / agent)

То же что `public_api` но включает private/protected методы и поля. Используется только в режимах `refactor` и `agent`.

```python
collection_name = "internal"
# тот же payload, но добавляется:
{
    "access": "private" | "protected" | "public"
}
```

---

## 4. Init script (краткая версия)

Полная версия — в `configs/postgres_init.sql`.

```sql
-- 1. Создать пользователя и базу
CREATE USER dsp_asst WITH PASSWORD :'pg_password';
CREATE DATABASE gpu_rag_dsp OWNER dsp_asst;

-- 2. Подключиться к gpu_rag_dsp
\c gpu_rag_dsp

-- 3. Создать схему и расширения
CREATE SCHEMA rag_dsp AUTHORIZATION dsp_asst;
GRANT ALL ON SCHEMA rag_dsp TO dsp_asst;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- 4. DDL всех таблиц (см. configs/postgres_init.sql)
```

---

## 5. Миграции (alembic)

После Phase 1 (когда схема стабилизируется):

```bash
cd C:\finetune-env
uv run alembic init alembic
# редактируем alembic.ini → sqlalchemy.url = postgresql+psycopg://dsp_asst@localhost/gpu_rag_dsp
uv run alembic revision --autogenerate -m "initial schema"
uv run alembic upgrade head
```

Все последующие изменения схемы — через `alembic revision --autogenerate`.

---

## 6. Размеры (оценка)

**Для DSP-GPU (388 hpp + 95 cpp + 10 hip + 123 py):**

| Таблица | Строк | Размер |
|---------|-------|--------|
| `files` | ~600 | ~100 KB |
| `symbols` | ~5 000 (классы + методы + поля) | ~5-10 MB |
| `deps` | ~30 000 | ~10-15 MB |
| `includes` | ~3 000 | ~500 KB |
| `enum_values` | ~200 | ~50 KB |
| `pybind_bindings` | ~50 | ~20 KB |
| `test_params` | ~500 (после ручного редактирования) | ~200 KB |
| `cmake_targets` | ~30 | ~30 KB |
| `rag_logs` | растёт с использованием | ~10 KB / запрос |
| `embeddings` (только stage 1) | ~3 000 × vector(1024) | ~13 MB + HNSW ~30 MB = **~45 MB** |
| **Postgres stage 1 (home)** | всё в одной БД | **~75 MB** |
| **Postgres stage 2+ (work/server)** | без vectors | **~30 MB** |
| **Qdrant stage 2+** | ~3 000 векторов × 1024 × 4 байта | **~12 MB + payload ~5 MB = ~17 MB** |

Итого: home ~75 MB, work ~50 MB. На сервере с 5 проектами — ~250 MB. Не критично.

---

## 7. Backup стратегия

```bash
# Postgres — ежедневный
pg_dump -U dsp_asst -d gpu_rag_dsp -n rag_dsp --format=custom > rag_dsp_$(date +%F).pgdump

# Qdrant — снапшот коллекции
curl -X POST "http://localhost:6333/collections/public_api/snapshots"
```

На dev-машинах backup не критичен (индекс пересоздаётся за 10 мин). На сервере (4_production) — обязательно ежедневно.

---

## 8. Что дальше

1. Phase 1: Indexer MVP — индексер пишет в `files` + `symbols` (без deps пока).
2. Phase 2: Retrieval — Qdrant загружается, гибридный поиск работает.
3. Phase 3: Symbol-graph — clangd LSP заполняет `deps`, `includes`.
4. После Phase 3: alembic зафиксирует стабильную схему.

---

*Конец схемы.*
