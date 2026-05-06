-- =============================================================================
-- pybind_bindings — расширение для TASK_RAG_02.6 (additive, per-class)
-- =============================================================================
-- Версия: 1.1  ·  Дата: 2026-05-06  ·  Автор: Кодо
--
-- Контекст:
--   Базовая схема `rag_dsp.pybind_bindings` (postgres_init.sql §8) хранит
--   биндинги per-class: UNIQUE(py_module, py_class), методы в JSONB
--   `methods_exposed`. На момент TASK_RAG_02.6 в таблице 42 строки.
--
--   TASK_RAG_02.6 (v1.1, по решению Alex 2026-05-06):
--     • additive ALTER TABLE — НЕ ломаем 42 существующих строки;
--     • per-class granularity сохраняется (UNIQUE py_module, py_class);
--     • перегрузки методов учитываются sub_index в block_id
--       (`__python_binding_001__v1`, `__002`, …) на уровне doc_blocks,
--       а в pybind_bindings — в JSONB `methods_exposed`.
--
--   Колонки `py_module_name` / `py_class_name` / `py_method_name`
--   добавляются как denormalized (для индексинга и FK), они дополняют
--   существующие `py_module` / `py_class`. На pilot этапе
--   py_method_name = NULL (заполняется только если позднее перейдём
--   на per-method granularity).
--
-- Запуск:
--   sudo -u postgres psql -d gpu_rag_dsp -f postgres_init_pybind_extras.sql
--   или через psycopg3 (DbClient.execute с file_contents).
--
-- Откат:
--   ALTER TABLE rag_dsp.pybind_bindings
--       DROP COLUMN IF EXISTS py_module_name,
--       DROP COLUMN IF EXISTS py_class_name,
--       DROP COLUMN IF EXISTS py_method_name,
--       DROP COLUMN IF EXISTS pybind_file,
--       DROP COLUMN IF EXISTS doc_block_id;
-- =============================================================================

\c gpu_rag_dsp

-- 1. Дополнительные колонки (idempotent — IF NOT EXISTS).
--    cpp_symbol_id уже существует в базовой схеме, не дублируем.
ALTER TABLE rag_dsp.pybind_bindings
    ADD COLUMN IF NOT EXISTS py_module_name TEXT,    -- 'dsp_spectrum'         (denorm от py_module)
    ADD COLUMN IF NOT EXISTS py_class_name  TEXT,    -- 'FFTProcessorROCm'     (denorm от py_class)
    ADD COLUMN IF NOT EXISTS py_method_name TEXT,    -- NULL для per-class; per-method для будущей миграции
    ADD COLUMN IF NOT EXISTS pybind_file    TEXT,    -- 'spectrum/python/py_fft_processor_rocm.hpp'
    ADD COLUMN IF NOT EXISTS doc_block_id   TEXT;    -- FK на rag_dsp.doc_blocks(block_id)

-- 2. FK constraint (idempotent через DO-block).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = 'rag_dsp'
          AND table_name = 'pybind_bindings'
          AND constraint_name = 'pybind_bindings_doc_block_id_fkey'
    ) THEN
        ALTER TABLE rag_dsp.pybind_bindings
            ADD CONSTRAINT pybind_bindings_doc_block_id_fkey
            FOREIGN KEY (doc_block_id)
            REFERENCES rag_dsp.doc_blocks(block_id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Индексы для retrieval (по py_class_name и pybind_file).
CREATE INDEX IF NOT EXISTS idx_pybind_doc_block       ON rag_dsp.pybind_bindings(doc_block_id);
CREATE INDEX IF NOT EXISTS idx_pybind_file            ON rag_dsp.pybind_bindings(pybind_file);
CREATE INDEX IF NOT EXISTS idx_pybind_py_class_name   ON rag_dsp.pybind_bindings(py_class_name);

-- 4. Backfill denormalized колонок из существующих 42 строк
--    (py_module → py_module_name, py_class → py_class_name).
--    Безопасно: WHERE NULL — не перезаписывает уже заполненные.
UPDATE rag_dsp.pybind_bindings
   SET py_module_name = py_module
 WHERE py_module_name IS NULL
   AND py_module IS NOT NULL;

UPDATE rag_dsp.pybind_bindings
   SET py_class_name = py_class
 WHERE py_class_name IS NULL
   AND py_class IS NOT NULL;

-- 5. Smoke — выводит схему таблицы для визуальной проверки после ALTER.
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'rag_dsp'
  AND table_name   = 'pybind_bindings'
ORDER BY ordinal_position;
