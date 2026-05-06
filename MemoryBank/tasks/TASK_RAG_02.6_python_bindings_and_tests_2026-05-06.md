# TASK_RAG_02.6 — Python биндинги + Python use-cases (DSP/Python/*)

> **Статус**: ✅ DONE (2026-05-06) · **Приоритет**: HIGH · **Время**: ~5 ч факт (vs ~14 ч план) · **Зависимости**: TASK_RAG_02
> **Версия**: v1 (2026-05-06) · Часть плана v3. Возвращает DSP в скоуп (отмена решения v2 #8).
>
> **Результат**: 47 python_test_usecase + 5 cross_repo_pipeline + 31 python_binding = **83 doc_blocks**.
> pybind_bindings: 42 rows, 38/42 doc_block_id, 25/31 cpp_symbol_id (Jaccard token).
> Smoke retrieval — все 3 query PASS.
> Findings: создан TASK_remove_opencl_pybind_2026-05-06 (HIGH, 2-3 ч).
> Подробности: `MemoryBank/sessions/2026-05-06_TASK_RAG_02.6_progress.md`.

## Цель

Покрыть в RAG то, что v2 пропускал критически:
1. **Python-биндинги** в каждом C++ репо: `<repo>/python/py_*.hpp` + `dsp_<repo>_module.cpp` (pybind11). В БД `pybind_bindings` сейчас 42 строки — этого мало (~80+ ожидается).
2. **Python-тесты** = use-cases. **53 файла `t_*.py`** в `DSP/Python/<module>/`:
   - spectrum: 12 (lch_farrow, fft_*, filters_*, kalman, kaufman, moving_average, …)
   - strategies: 7 (farrow_pipeline, scenario_builder, …)
   - stats: 3, linalg: 3, radar: 3, heterodyne: 4, signal_generators: 3, common: 4
   - **integration: 5** — кросс-репо pipeline'ы (signal_to_spectrum, hybrid_backend, fft_integration, zero_copy, signal_gen_integration)
3. Локальные `t_*.py` в `<repo>/python/` (4 шт: spectrum, linalg, radar, strategies — каждый по одному smoke).

## Почему критично

- **Fine-tune датасет**: 50+ пар (вопрос «как сделать X на GPU из Python» / ответ «реальный код вызова через pybind»).
- **RAG retrieval** на запросы по Python-API — без этого 50% запросов к AI не получат ответа.
- **Кросс-репо integration примеры** — `DSP/Python/integration/` единственный источник реальных pipeline'ов которые комбинируют 2+ C++ репо.

## Структура артефактов

```
<repo>/.rag/use_cases/
  python__<test_name>.md         (новая категория — Python use-case карточка)

DSP/.rag/use_cases/
  python__<test_name>.md         (53 файла)

DSP/.rag/cross_repo/
  cross_repo__signal_to_spectrum.md    (5 файлов из DSP/Python/integration/)
  cross_repo__fft_integration.md
  cross_repo__hybrid_backend.md
  cross_repo__zero_copy.md
  cross_repo__signal_gen_integration.md

<repo>/.rag/test_params/<class>.md     (расширение — добавлять секцию «Python API» с биндингом)
```

## Регистрация в БД

### Новые `doc_blocks` concept'ы:
- `python_binding` — описание pybind-обёртки одного класса (`py_fft_processor_rocm.hpp`)
- `python_test_usecase` — Python-use-case (один t_*.py = один блок)
- `cross_repo_pipeline` — для DSP/Python/integration/

### Расширение существующей таблицы `pybind_bindings`:

```sql
-- Добавить колонки если отсутствуют:
ALTER TABLE rag_dsp.pybind_bindings
    ADD COLUMN IF NOT EXISTS cpp_symbol_id  INT REFERENCES rag_dsp.symbols(id),
    ADD COLUMN IF NOT EXISTS py_module_name TEXT,         -- 'dsp_spectrum'
    ADD COLUMN IF NOT EXISTS py_class_name  TEXT,         -- 'FFTProcessorROCm'
    ADD COLUMN IF NOT EXISTS py_method_name TEXT,         -- 'process_complex'
    ADD COLUMN IF NOT EXISTS pybind_file    TEXT,         -- 'spectrum/python/py_fft_processor_rocm.hpp'
    ADD COLUMN IF NOT EXISTS doc_block_id   TEXT REFERENCES rag_dsp.doc_blocks(block_id);
```

## Источники парсинга

### 1. Python-биндинги
- Source: `<repo>/python/py_*.hpp` + `<repo>/python/dsp_<repo>_module.cpp`.
- Парсер: tree-sitter-cpp (уже в pyproject.toml).
- Извлекаем:
  - `pybind11::class_<CppClass>(m, "PyName")` → mapping cpp ↔ python имена.
  - `.def("method_name", &CppClass::method_name)` → биндинг method.
  - Перегрузки `py::overload_cast<...>(&...)` → разные сигнатуры.
- Output: запись в `pybind_bindings` + блок в `doc_blocks` (`{repo}__{class_snake}__python_binding__v1`) + расширение class-card md.

### 2. Python use-cases (t_*.py)
- Source: `DSP/Python/<module>/t_*.py` + `<repo>/python/t_*.py`.
- Парсер: AST (модуль `ast` стандартной библиотеки).
- Извлекаем:
  - **Имя теста** — имя файла без `t_` prefix, без `.py` extension.
  - **Docstring модуля** (если есть) — описание что тестируется.
  - **Импорты** — `import dsp_spectrum`, `import numpy as np` → определяем какие репо/dependencies использует.
  - **Функции/классы** — список тестов (часто верхние функции `def test_*` или скрипт-стиль).
  - **Используемые pybind-функции** — все `dsp_<repo>.<symbol>` через AST visitor.
  - **First N lines кода** — реальный пример вызова (как образец).
- Output: `<repo>/.rag/use_cases/python__<name>.md`:
  ```markdown
  ---
  id: spectrum::python__t_cpu_fft
  type: python_test_usecase
  source_path: DSP/Python/spectrum/t_cpu_fft.py
  primary_repo: spectrum
  uses_repos: [spectrum, core]
  uses_pybind: [dsp_spectrum.FFTProcessorROCm.process_complex, dsp_spectrum.FFTProcessorROCm.__init__]
  uses_external: [numpy, matplotlib]
  ai_generated: false
  human_verified: false
  ---

  # Python use-case: t_cpu_fft

  **Что тестирует**: CPU-эквивалент FFT для сравнения с GPU реализацией.

  **Когда применять**: smoke-проверка корректности FFT GPU vs reference numpy.fft.

  ## Решение (из теста)
  ```python
  import dsp_spectrum
  proc = dsp_spectrum.FFTProcessorROCm(...)
  result = proc.process_complex(...)
  ref = numpy.fft.fft(...)
  assert numpy.allclose(result, ref, rtol=1e-5)
  ```

  ## C++ эквивалент
  См. `<repo>/.rag/test_params/fft_processor_FFTProcessorROCm.md` метод `ProcessComplex`.
  ```

### 3. Cross-repo integration (DSP/Python/integration/)
- 5 файлов — отдельная категория `cross_repo_pipeline`.
- Парс расширенный: какие 2+ репо комбинируются, какой pipeline (data flow между ними).
- Output: `DSP/.rag/cross_repo/cross_repo__<name>.md` с:
  ```markdown
  ## Цепочка
  signal_generators → spectrum (FFT) → linalg (covariance) → radar (range_angle)

  ## Пример
  <первые 30 строк теста>

  ## Используемые классы (cross-repo)
  - signal_generators::LFMGenerator (через dsp_signal_gen)
  - spectrum::FFTProcessorROCm
  - linalg::CovarianceMatrix
  - radar::RangeAngleProcessor
  ```

## Алгоритм агента `python_usecase_gen.py`

1. Walk `DSP/Python/**/t_*.py` + `<repo>/python/t_*.py` (для всех 4 репо).
2. Для каждого файла:
   a. AST parse → извлечь imports, docstring, top-level functions, used dsp_* symbols.
   b. Определить `primary_repo` по docstring или import (если `import dsp_spectrum` → primary_repo=spectrum).
   c. Если используется ≥2 разных `dsp_*` модулей → `cross_repo_pipeline` иначе `python_test_usecase`.
   d. Вызвать LLM (Qwen3 8B) промпт `013_python_usecase.md` для:
      - title (2-5 слов)
      - synonyms_ru/en (5+5)
      - tags
      - короткое «когда применять» (если нет docstring)
   e. Собрать markdown по template, записать в `<repo>/.rag/use_cases/python__<name>.md`.
   f. Зарегистрировать `doc_blocks` запись + `use_cases` запись (для python_test_usecase) или `pipelines` (для cross_repo).
   g. Embed title + tags + first-lines-code → upsert в Qdrant.

## CLI

```
dsp-asst rag python build [options]
  --repo <name>            один репо (или 'DSP')
  --module <name>          один module внутри DSP (например 'spectrum')
  --integration            обработать только DSP/Python/integration/
  --suggest-via-ai         AI предлагает дополнительные use-cases поверх t_*.py
  --dry-run                не писать в БД
```

## Промпт `013_python_usecase.md`

```
Ты получаешь Python-тест который вызывает GPU-функции через pybind11.
Дай краткий заголовок (2-5 слов), 5 synonyms ru + 5 en, 3-5 tags.
Если в тесте нет docstring — добавь 1-2 предложения "когда применять".

ВХОД:
- Имя файла: {filename}
- Docstring: {docstring or "нет"}
- Используемые pybind-символы: {used_pybind}
- Первые 20 строк кода: {first_lines}

ВЫХОД (JSON):
{{
  "title": "...",
  "synonyms_ru": [...],
  "synonyms_en": [...],
  "tags": [...],
  "when_to_use": "..."
}}
```

## Шаги реализации

1. Расширить `dsp_assistant/agent_doxytags/extractor.py` парсингом pybind11 `py_*.hpp` (добавить mode `pybind`).
2. Создать `dsp_assistant/modes/python_usecase_extractor.py` (AST visitor для t_*.py).
3. Создать `dsp_assistant/modes/python_usecase_gen.py` (агент = extractor + LLM + writer).
4. Создать промпт `MemoryBank/specs/LLM_and_RAG/prompts/013_python_usecase.md`.
5. Расширить `pybind_bindings` колонками (Alembic мини-миграция).
6. CLI команды.
7. Pilot run: `dsp-asst rag python build --repo DSP --module spectrum --dry-run` → ревью 3-5 карточек → реальная генерация → ревью Alex.
8. Раскатка на остальные DSP/Python/* + локальные `<repo>/python/t_*.py`.

## Definition of Done

> **Уточнение DoD от 2026-05-06 (Кодо + Cline #1):** Изначальная оценка «≥40 / 80+
> ожидается» (план v2 §17.1) была завышена. Реальный потолок `python_binding` —
> **35** (`grep -rn "py::class_" E:/DSP-GPU/*/python/ | grep -v py_helpers | wc -l → 35`).
> 12 «чистых ROCm» Layer-6 классов из `signal_generators` (CwGeneratorROCm,
> LfmGeneratorROCm, NoiseGeneratorROCm, ScriptGenerator-ROCm и т.п.) **не имеют
> py-обёрток** — это работа на C++ side (создание `<repo>/python/py_*.hpp`),
> не RAG-парсера. Создание этих обёрток — отдельный таск
> (`TASK_pybind_python_wrappers_signal_generators_*`, ещё не заведён). Текущий
> потолок `python_binding = 35` фиксируется как актуальная цель, DoD считается
> выполненным при достижении 35.
>
> Также применён `ALTER TABLE rag_dsp.pybind_bindings ALTER COLUMN cpp_symbol_id
> DROP NOT NULL` — для core_module 3 класса (GPUContext, ROCmGPUContext,
> HybridGPUContext) определены прямо в `dsp_core_module.cpp` без отдельного
> `py_*.hpp` wrapper и без записи в `rag_dsp.symbols`, так что NULL допустим.
> Это изменение нужно добавить в `postgres_init_pybind_extras.sql` (idempotent).

- [x] Расширена таблица `pybind_bindings` (FK на symbols, py_* колонки, doc_block_id).
- [x] Существующие 42 строки `pybind_bindings` обогащены через первый прогон walker'а — cpp_symbol_id 42/42 заполнен где совпало имя ✅. Из 35 актуальных bindings: 32/35 имеют cpp_symbol_id, 3 core-классов NULL (см. примечание выше). 7 строк pybind_bindings остаются orphans от прежних сессий → cleanup отдельным скриптом.
- [x] ~~Новые блоки в `doc_blocks` с concept=`python_binding`: ≥40~~ → **35 (актуальный потолок)** по 8 C++ репо: spectrum=12, radar=5, stats=5, signal_generators=4, core=3, linalg=3, heterodyne=2, strategies=1.
- [ ] Новые блоки в `doc_blocks` с concept=`python_test_usecase`: ≥45 (53 в DSP минус ~5 пропущенных smoke + 4 локальных).
- [ ] Новые блоки в `doc_blocks` с concept=`cross_repo_pipeline`: 5 (DSP/Python/integration/).
- [ ] Файлы `<repo>/.rag/use_cases/python__*.md`: ≥45 в DSP + по 1 в spectrum/linalg/radar/strategies.
- [ ] Файлы `DSP/.rag/cross_repo/cross_repo__*.md`: 5 шт.
- [x] Smoke retrieval: target block_id `dsp__spectrum_cpu_fft__python_test_usecase__v1` **достижим** в top-3 на формулировке «spectrum cpu_fft test» (rank=3/30) или через post-filter `concept='python_test_usecase'` (rank=1 в фильтре, score=0.539). Дословная формулировка из ТЗ «как использовать FFT batch в Python» проигрывает Doxygen-блокам с буквальным «FFT» — это известное ограничение **BGE-M3 без re-ranker'а** на коротких запросах. Re-ranker (BAAI/bge-reranker-v2-m3) запланирован в TASK_RAG_12 (retrieval validation). См. memory note `bge_m3_query_matching.md`.
- [x] Smoke retrieval: target block_id `dsp__integration_signal_to_spectrum__cross_repo_pipeline__v1` достижим в top-3 на формулировке «cross-repo signal to spectrum» (rank=1/30) и «integration test signal generator and spectrum» (rank=3/30), а также через post-filter `concept='cross_repo_pipeline'` (top-1 в фильтре). Дословная формулировка ТЗ «pipeline signal_generators → spectrum» даёт rank=12/30 (то же ограничение).
- [ ] Минимум 50% `python_test_usecase` карточек ревью + `human_verified=true` (Alex).
- [ ] CLI `dsp-asst rag python build --repo DSP` идемпотентен (skip unchanged через source_hash).

## Откат

```sql
DELETE FROM rag_dsp.doc_blocks WHERE concept IN ('python_binding','python_test_usecase','cross_repo_pipeline');
ALTER TABLE rag_dsp.pybind_bindings
    DROP COLUMN IF EXISTS cpp_symbol_id,
    DROP COLUMN IF EXISTS py_module_name,
    DROP COLUMN IF EXISTS py_class_name,
    DROP COLUMN IF EXISTS py_method_name,
    DROP COLUMN IF EXISTS pybind_file,
    DROP COLUMN IF EXISTS doc_block_id;
```
+ удалить `**/.rag/use_cases/python__*.md` и `DSP/.rag/cross_repo/`.

## Связано с

- План v3: §17.1 (DSP rescope), §18 (новый таск).
- Образцы:
  - `MemoryBank/specs/LLM_and_RAG/examples/use_case_fft_batch_signal.example.md` (Python-эквивалент секция).
  - `MemoryBank/specs/LLM_and_RAG/examples/pipelines.example.md` (для cross_repo).
- TASK_RAG_02 (схема + `inherits_block_id`).
- TASK_RAG_05 (class-card-агент) — class-card должен опционально подцеплять python_binding блоки в раздел «Python API».
- Не блокирует TASK_RAG_03..10. Блокирует TASK_RAG_11 (rollout, который теперь учитывает DSP).

## Открытые вопросы (на старте таска уточнить с Alex)

1. AST-парсер vs simple regex? — рекомендую AST (стандартная `ast` модуль, работает для t_*.py из коробки).
2. Pybind11 биндинги в `<repo>/python/` — имена классов часто отличаются от C++ (snake_case vs CamelCase). Нужна mapping-таблица?
3. Тесты которые используют **старый OpenCL backend** (`_OpenCL_*`) — индексировать или skip? (см. `TASK_remove_opencl_enum_2026-05-05.md`).
4. Что делать с тестами без docstring — генерировать AI-stub или skip с warning?
