# План: RAG-агенты для генерации `.rag/` карточек

> **Статус**: v3 (расширение под meta + Python coverage) · **Создан**: 2026-05-05 · **v3**: 2026-05-06 · **Автор**: Кодо
>
> Цель: построить инфраструктуру и агентов, которые на **9 репо** DSP-GPU (DSP вернулся в скоуп — критический источник Python use-cases)
> сгенерируют `<repo>/.rag/test_params/*.md`, `<repo>/.rag/use_cases/*.md`,
> `<repo>/.rag/pipelines/*.md`, `<repo>/.rag/meta/*.md` для расширения RAG-базы.
>
> **Цель проекта**: «слепок» кодовой базы для обучения локальной AI + семантический поиск.
>
> **v2 правки** (2026-05-05): vectors переехали в Qdrant `dsp_gpu_rag_v1` (Variant C из ревью v2.1), новые таблицы PG БЕЗ `embedding` колонок, DSP пропущен.
>
> **v3 правки** (2026-05-06):
> - **DSP вернулся в скоуп** (отмена варианта B). Причина: `DSP/Python/` содержит **53 t_*.py** теста (включая 5 кросс-репо integration) — главный источник use-case'ов и fine-tune датасета. Без DSP теряется ~50% потенциала RAG для запросов «как вызвать GPU из Python».
> - **Новый TASK_RAG_02.5** — meta-источники: локальные `CLAUDE.md`, CMake summaries, build_orchestration (граф репо↔репо через `cmake/fetch_deps.cmake`).
> - **Новый TASK_RAG_02.6** — Python-биндинги (`<repo>/python/py_*.hpp`) + Python-тесты (`DSP/Python/<module>/t_*.py`) как use-case карточки.
> - **Расширение схемы `doc_blocks`**: поле `inherits_block_id` (для CMake common+specific), новые concept slug'и: `meta_*`, `build_orchestration`, `python_binding`, `python_test_usecase`, `cross_repo_pipeline`.
> - PG (после TASK_RAG_01 от 2026-05-06): БД=`gpu_rag_dsp`, schema=`rag_dsp`. Qdrant 1.17.1 standalone в WSL Ubuntu, portproxy 6333. pgvector остаётся для symbols (5432 строк), Qdrant `dsp_gpu_rag_v1` — для новых RAG-блоков.
>
> **Связан с**: `13_RAG_Extension_RoadMap.md`, `09_RAG_md_Spec.md`,
> `12_DoxyTags_Agent_Spec.md`, `examples/use_case_fft_batch_signal.example.md`,
> `examples/pipelines.example.md`, `examples/fft_processor_FFTProcessorROCm.md`,
> `RAG_Phase0_error_values_audit_2026-05-05.md`,
> `tasks/TASK_remove_opencl_enum_2026-05-05.md`.

---

## 1. TL;DR

| | |
|---|---|
| **Сколько агентов** | **3** (class-card / usecase / pipeline) + Phase 0 audit-скрипт |
| **Где код** | `C:/finetune-env/dsp_assistant/` (новые модули рядом с существующими — `agent_doxytags/`, `modes/`) |
| **Где промпты** | `MemoryBank/specs/LLM_and_RAG/prompts/` (`010_class_card.md`, `011_usecase.md`, `012_pipeline.md`) |
| **Что переиспользуем** | `db/`, `llm/`, `agent_doxytags/extractor.py + walker.py + heuristics.py`, схема `symbols/files/test_params/pybind_bindings/includes` |
| **БД** | PostgreSQL `gpu_rag_dsp` (переименование с `dsp_assistant`), schema **`rag_dsp`** (переименование с `dsp_gpu`), +4 новые таблицы |
| **Источник правды** | `Doc/*.md` (копирование секций) + `@test*` теги (315 в spectrum) + headers (сигнатуры) |
| **LLM роль** | только **synonyms (ru/en)**, **related_***, и короткое «Когда применять» если в Doc/ нет такой секции |
| **Pilot** | `spectrum` целиком (~6 use_cases + N class-cards) → ревью → `strategies` (~3 pipelines) → раскатка на 7 |
| **Стоп-точки** | После каждой фазы — green tests + ревью Alex'а до следующей |

---

## 2. Решения после Phase 0 audit (фундаментальные правила)

Из `RAG_Phase0_error_values_audit_2026-05-05.md`:

1. **Enum-параметры** не получают `error_values` (5 случаев в spectrum).
2. **Bool-параметры** не получают `error_values` (3 случая в spectrum).
3. **JSON-пути** пока не получают `error_values` (6 случаев — может быть пересмотрено).
4. **Указатели** — `error_values=[nullptr, 0xDEADBEEF]` (один случай в #2 audit'а — применить).
5. **Размеры/диапазоны** — стандарт `error_values=[-1, large_value, 3.14]`.

Эти правила переедут в `dsp_assistant/agent_doxytags/heuristics.py` + `prompts/009_test_params_extract.md` отдельным коммитом.

**OPENCL enum** удаляется отдельным таском — `tasks/TASK_remove_opencl_enum_2026-05-05.md`.

---

## 3. Архитектура — общая картина

```
┌───────────────────────────────────────────────────────────────┐
│  CLI:  dsp-asst rag <command>                                  │
├───────────────────────────────────────────────────────────────┤
│  audit         → Phase 0 проверка (+spectrum за 5 сек)         │
│  blocks ingest → парс Doc/*.md → doc_blocks (PG)               │
│  cards         → агент 1: class-card                            │
│  usecases      → агент 2: use_case                              │
│  pipelines     → агент 3: pipeline                              │
│  refresh       → всё с re-run safety (skip unchanged)           │
│  status        → отчёт по покрытию (что есть, чего нет)         │
└───────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
       class_card.py    usecase_gen.py    pipeline_gen.py
              │               │                │
              └───────────────┼────────────────┘
                              ▼
              ┌───────────────────────────────────┐
              │  Общая инфраструктура (готовая):   │
              │   • agent_doxytags/extractor.py    │
              │   • agent_doxytags/walker.py        │
              │   • db/ (PG client)                 │
              │   • llm/ (Qwen + load_prompt)       │
              │   • modes/helpers.py                │
              │   • retrieval/embedder.py (BGE-M3)  │
              │   • retrieval/vector_store.py       │ ← НЕ ТРОГАЕМ (для symbols)
              │  Новая:                             │
              │   • modes/doc_block_parser.py      │
              │   • utils/block_id.py               │
              │   • modes/rag_writer.py (.md ↔ DB ↔ Qdrant) │
              │   • retrieval/rag_vector_store.py   │ ← RagQdrantStore + UUID v5
              │   • retrieval/resolver.py           │ ← PG lookup для reranker'а
              └───────────────────────────────────┘
                       ▼                  ▼
        ┌──────────────────────┐   ┌────────────────────────┐
        │ PostgreSQL           │   │ Qdrant (Ubuntu)        │
        │  gpu_rag_dsp.rag_dsp │   │                        │
        │   metadata only,     │   │ • dsp_gpu_code_v1      │
        │   БЕЗ vector колонок │   │   (existing — symbols) │
        │                      │   │                        │
        │  • symbols (existing)│   │ • dsp_gpu_rag_v1 (NEW) │
        │  • files, includes,  │   │   payload:             │
        │    pybind_*, ...     │   │     target_table       │
        │  • doc_blocks  (NEW) │   │     target_id          │
        │  • use_cases   (NEW) │   │     repo               │
        │  • pipelines   (NEW) │   │   point_id = UUID v5   │
        │  • ai_stubs    (NEW) │   │     (target_table,     │
        │                      │   │      target_id)        │
        └──────────────────────┘   └────────────────────────┘
                  ▲                          ▲
                  └─── Hybrid Retriever ─────┘
                  (Qdrant.search → resolver(PG) → reranker → top-K)
                              ▼
              <repo>/.rag/test_params/<class>.md
              <repo>/.rag/use_cases/<id>.md
              <repo>/.rag/pipelines/<name>.md  (или 1 файл если ≤5)
```

**Принципы**:
- **Один источник правды**: контент → PG (`doc_blocks`); .md — обёртка с `block_ref` + дублированной копией (Phase 1).
- **AI делает минимум**: synonyms, related_*, короткие связки. Всё остальное — копируется.
- **Re-run safety**: source_hash + ai_generated флаг + human_verified. Перегенерация **не трогает** human-helper'ы.

---

## 4. Block ID — финальная схема

```
{repo}__{class_or_module_snake}__{concept}[_{NNN}]__v{n}
```

| Часть | Что | Пример |
|---|---|---|
| `{repo}` | один из 9 репо | `spectrum`, `core`, `strategies` |
| `{class_or_module_snake}` | имя класса (snake_case) ИЛИ модуль/тема | `fft_processor_rocm`, `welford_accumulator`, `farrow_pipeline`, `zcopy` |
| `{concept}` | slug заголовка h2/h3 ИЛИ ручного якоря | `pipeline_data_flow`, `when_to_use`, `edge_cases`, `parameters` |
| `[_{NNN}]` | опционально, если блок разбит на N кусков (>500 симв) | `_001`, `_002` |
| `__v{n}` | версия (1 первая; 2+ только при появлении альтернативы) | `__v1`, `__v2` |

**Алгоритм определения `class_or_module_snake`**:
1. Если в Doc-секции в первых 200 симв упоминается CamelCase класс — берём его в snake_case.
2. Иначе из имени файла (`fft_func_Full.md` → `fft_func` после удаления `_Full`/`_Quick`/`_API`).
3. Иначе из имени h2-заголовка в snake_case.

**Примеры**:
- `spectrum__fft_processor_rocm__pipeline_data_flow__v1`
- `spectrum__fft_processor_rocm__when_to_use_001__v1`
- `spectrum__fft_processor_rocm__when_to_use_002__v1`
- `stats__welford_accumulator__init__v1`
- `stats__welford_accumulator__update_step__v1`
- `strategies__farrow_pipeline__chain_overview__v1`
- `radar__range_angle_3fft_lfm__simple_overview__v1`

---

## 5. Схема БД — миграция

### 5.1. Переименование БД и схемы

Решение Alex: «всё должно быть однотипно» → меняем оба:

| Было | Стало |
|---|---|
| database = `dsp_assistant` | database = **`gpu_rag_dsp`** |
| schema = `dsp_gpu` | schema = **`rag_dsp`** |
| user = `dsp_asst` | user = `dsp_asst` (остаётся) |

**Целевые stage'ы** (по `stack.json`):
- ~~stage 1_home (Win runtime + pgvector)~~ — **не рассматриваем**, dev на Win, runtime на Ubuntu.
- **2_work_local** (Debian локально, Qdrant) — основной целевой stage.
- **3_mini_server** (Ubuntu сервер, Qdrant) — копия 2_work_local.
- **4_production** (A100 сервер) — позже, per-проект коллекции.

**Реальная среда дома сейчас**: Win-клиент → Ubuntu (PG + Qdrant через шлюз). Для целей RAG-агентов важен только runtime stage = Linux + Qdrant.

**Метод переименования** (по решению ревью v2.1): `ALTER DATABASE ... RENAME` + `ALTER SCHEMA ... RENAME`. БД уже существует, perspective наращивания базы. Pre-step: `pg_dump` бэкап.

Затрагивает (одним коммитом, ДО первого `psql -f init.sql`):
- `MemoryBank/specs/LLM_and_RAG/configs/stack.json` — 4 stage'а
- `MemoryBank/specs/LLM_and_RAG/configs/postgres_init.sql`
- `MemoryBank/specs/LLM_and_RAG/configs/postgres_init_pgvector.sql`
- `MemoryBank/specs/LLM_and_RAG/03_Database_Schema_2026-04-30.md`
- `C:/finetune-env/dsp_assistant/db/client.py` если хардкод (проверить)
- `C:/finetune-env/dsp_assistant/config/loader.py` (читает stack.json)

### 5.2. Новые таблицы

```sql
-- 1. Блоки документации (главное хранилище контента)
CREATE TABLE doc_blocks (
    block_id        TEXT PRIMARY KEY,           -- {repo}__{class}__{concept}[_NNN]__v{n}
    repo            TEXT NOT NULL,
    class_or_module TEXT NOT NULL,              -- semantic slug часть
    concept         TEXT NOT NULL,              -- semantic slug часть
    sub_index       INT,                        -- NULL если блок не разбит, иначе 1..N
    version         INT NOT NULL DEFAULT 1,

    doc_path        TEXT,                       -- Doc/fft_func_Full.md (если из Doc/)
    header_path     TEXT,                       -- include/spectrum/fft_processor_rocm.hpp (если из header)
    line_start      INT,
    line_end        INT,

    content_md      TEXT NOT NULL,              -- сам markdown
    content_format  TEXT DEFAULT 'markdown',    -- 'markdown' | 'ascii_diagram' | 'code_cpp' | 'code_python'

    source_hash     CHAR(40) NOT NULL,          -- sha1 для re-run safety

    ai_generated    BOOLEAN DEFAULT FALSE,
    ai_model        TEXT,                       -- 'qwen3:8b' если ai_generated
    human_verified  BOOLEAN DEFAULT FALSE,

    deprecated_by   TEXT REFERENCES doc_blocks(block_id),  -- ссылка на новую версию
    related_ids     JSONB DEFAULT '[]',         -- ['stats__welford__init__v1', ...]

    -- v3: inheritance (CMake common ← specific, parent CLAUDE.md ← child, и т.д.)
    inherits_block_id TEXT REFERENCES doc_blocks(block_id),  -- NULL если корневой блок

    -- ❌ embedding — НЕ хранится в PG. Vectors → Qdrant `dsp_gpu_rag_v1` (Variant C из ревью v2.1)
    -- При индексации child-блока его embedding конкатенируется с parent.summary (см. §6.1).

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_doc_blocks_repo ON doc_blocks(repo);
CREATE INDEX idx_doc_blocks_class ON doc_blocks(class_or_module);
CREATE INDEX idx_doc_blocks_concept ON doc_blocks(concept);
CREATE INDEX idx_doc_blocks_inherits ON doc_blocks(inherits_block_id);  -- v3
-- ❌ HNSW vector index — НЕ создаётся. Поиск идёт через Qdrant.
CREATE INDEX idx_doc_blocks_related ON doc_blocks USING GIN (related_ids);


-- 2. Use-case карточки (метаданные)
CREATE TABLE use_cases (
    id              TEXT PRIMARY KEY,           -- 'spectrum::fft_batch_signal'
    repo            TEXT NOT NULL,
    use_case_slug   TEXT NOT NULL,              -- 'fft_batch_signal'
    title           TEXT NOT NULL,
    primary_class   TEXT,                       -- 'fft_processor::FFTProcessorROCm'
    primary_method  TEXT,                       -- 'ProcessComplex'

    synonyms_ru     JSONB DEFAULT '[]',
    synonyms_en     JSONB DEFAULT '[]',
    tags            JSONB DEFAULT '[]',

    block_refs      JSONB DEFAULT '[]',         -- [{section, block_id}, ...]
    related_use_cases JSONB DEFAULT '[]',
    related_classes JSONB DEFAULT '[]',

    md_path         TEXT NOT NULL,              -- '<repo>/.rag/use_cases/<slug>.md'
    md_hash         CHAR(40) NOT NULL,          -- актуальное состояние .md

    ai_generated    BOOLEAN DEFAULT FALSE,
    human_verified  BOOLEAN DEFAULT FALSE,

    -- ❌ embedding — НЕ в PG. title+synonyms эмбеддятся → Qdrant `dsp_gpu_rag_v1`, target_table='use_cases'

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_use_cases_repo ON use_cases(repo);
CREATE INDEX idx_use_cases_class ON use_cases(primary_class);
-- ❌ HNSW vector index — НЕ создаётся.


-- 3. Pipelines (метаданные)
CREATE TABLE pipelines (
    id              TEXT PRIMARY KEY,           -- 'strategies::antenna_covariance'
    repo            TEXT NOT NULL,
    pipeline_slug   TEXT NOT NULL,              -- 'antenna_covariance'
    title           TEXT NOT NULL,
    composer_class  TEXT,                       -- 'strategies::AntennaCovariancePipeline' (Layer 7)

    chain_classes   JSONB DEFAULT '[]',         -- ['spectrum::PadDataOp', ...]
    chain_repos     JSONB DEFAULT '[]',         -- ['spectrum', 'linalg', 'capon']

    block_refs      JSONB DEFAULT '[]',
    related_pipelines JSONB DEFAULT '[]',

    md_path         TEXT NOT NULL,
    md_hash         CHAR(40) NOT NULL,

    ai_generated    BOOLEAN DEFAULT FALSE,
    human_verified  BOOLEAN DEFAULT FALSE,
    -- ❌ embedding — НЕ в PG. title эмбеддится → Qdrant target_table='pipelines'

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);


-- 4. AI-stubs (заглушки которые Alex дозаполнит)
CREATE TABLE ai_stubs (
    id              SERIAL PRIMARY KEY,
    repo            TEXT NOT NULL,
    block_id        TEXT REFERENCES doc_blocks(block_id),
    md_path         TEXT,                       -- куда вставлен placeholder
    placeholder_tag TEXT NOT NULL UNIQUE,       -- 'Q-{ai_stubs.id}' либо 'TODO_ai_stub_YYYY-MM-DD_QN' — UNIQUE обязательно

    suggested_text  TEXT,                       -- что предложил Qwen
    status          TEXT DEFAULT 'pending',     -- 'pending' | 'human_filled' | 'rejected'
    filled_text     TEXT,                       -- финальный текст от Alex
    filled_at       TIMESTAMPTZ,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ai_stubs_status ON ai_stubs(status);
CREATE INDEX idx_ai_stubs_repo ON ai_stubs(repo);
```

### 5.2.5. Vector storage — Qdrant collection `dsp_gpu_rag_v1`

Решение Variant C из ревью v2.1: vectors **не** в PG (extension не нужен для новых таблиц), а в **отдельной Qdrant коллекции** рядом с существующей `dsp_gpu_code_v1` (для symbols).

**Создание коллекции** (Python, шаг TASK_RAG_02):

```python
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, HnswConfigDiff, PayloadSchemaType

qdrant = QdrantClient(url=cfg.qdrant_endpoint)
qdrant.create_collection(
    collection_name="dsp_gpu_rag_v1",
    vectors_config=VectorParams(size=1024, distance=Distance.COSINE),
    hnsw_config=HnswConfigDiff(m=16, ef_construct=200),
)
qdrant.create_payload_index("dsp_gpu_rag_v1", "target_table", PayloadSchemaType.KEYWORD)
qdrant.create_payload_index("dsp_gpu_rag_v1", "repo",         PayloadSchemaType.KEYWORD)
```

**Payload каждой точки**:
```json
{
  "target_table": "doc_blocks",   // 'doc_blocks' | 'use_cases' | 'pipelines' | future
  "target_id":    "spectrum__fft_processor_rocm__pipeline_data_flow__v1",
  "repo":         "spectrum"
}
```

**`point_id`** — UUID v5 от `(target_table, target_id)`, с фиксированным namespace `NS_RAG`. Детали — `RAG_three_agents_review_2026-05-05.md` v2.1 §«Архитектурное решение».

**Текст для retrieval** хранится **в PG** (`doc_blocks.content_md`, `use_cases.title`, `pipelines.title`). Между Qdrant.search и reranker'ом идёт **resolver** (PG lookup) — иначе reranker получает пустые тексты. См. ревью v2.1 §«Hybrid retrieval».

### 5.3. Старая таблица `test_params`

В `postgres_init.sql` уже есть `test_params` (была заглушка). **Решение**: использовать её для **методов класса**, а class-card-карточка собирает из неё данные. Структуру не меняем — она уже готова. Если её колонки не подходят (проверим при первой генерации) — добавим миграцию.

### 5.4. Миграции — `alembic`

После Phase 1 ставим `alembic` (как и было запланировано). Сейчас правим `postgres_init.sql` напрямую (БД ещё не наполнена).

---

## 6. Doc/\*.md ingestion — как парсим блоки

### Стратегия — **C** (гибрид h2/h3 + ручные якоря)

#### Авто-парсинг (по умолчанию)
- Разбиение по h2/h3-заголовкам через `markdown-it-py` или `mistune`.
- Whitelist concept'ов (для слугификации):
  ```
  pipeline → pipeline_data_flow
  цепочка → chain_overview
  параметры → parameters
  граничные → edge_cases
  математика → math
  api → api
  использование → usage
  обзор → overview
  пример → example
  тесты → tests
  бенчмарк → benchmark
  ```
- Содержимое >2000 симв → разбиваем на куски `_001`, `_002` по абзацам/h4.

#### Ручные якоря (когда автомат не справился)
В Doc/*.md можно поставить:
```markdown
<!-- rag-block: id=spectrum__fft_processor_rocm__plan_lru_cache__v1 -->
LRU-2 кэш hipfftHandle уменьшает re-allocate с 5ms до 0.
<!-- /rag-block -->
```
Парсер: ручные якоря **переопределяют** авто (приоритет выше).

#### Источники для каждого репо
| Репо | Файлы Doc/ для парса |
|---|---|
| core | Full.md, Architecture.md, Classes.md, OpenCL.md(?), Memory.md |
| spectrum | Full.md, fft_func_Full.md, filters_Full.md, lch_farrow_Full.md, lch_farrow_МНК_фазы_beat.md |
| stats | Full.md |
| signal_generators | Full.md, Architecture.md, ScriptGenerator.md |
| heterodyne | Full.md, Алгоритм гетероди.md |
| linalg | Full.md, capon_Full.md, vector_algebra_Full.md |
| radar | Full.md, fm_correlator_Full.md, range_angle_3fft_lfm_simple.md, range_angle_3fft_lfm_technical.md |
| strategies | Full.md, Farrow_Pipeline.md, AP_C1..C4_*.md, AP_Seq.md |
| DSP | Doc/Python/* (отдельная стратегия — Python use-cases) |

---

## 7. AI-stub workflow

Когда LLM пишет блок (нет описания в Doc/), процесс:

1. Qwen генерирует короткий черновик ≤300 симв.
2. Запись в БД:
   ```
   doc_blocks: block_id=spectrum__fft_processor_rocm__when_to_use__v1, ai_generated=true
   ai_stubs:   placeholder_tag=TODO_ai_stub_2026-05-05_Q42, suggested_text=<черновик>, status=pending
   ```
3. В .md файле:
   ```markdown
   <!-- rag-block: id=spectrum__...__when_to_use__v1 ai_generated=true stub=Q42 -->
   **Когда применять**: TODO_ai_stub_2026-05-05_Q42 — Alex напишет точный текст.
   <!-- /rag-block -->
   ```
4. Alex видит `Q42` в .md, открывает CLI:
   ```
   dsp-asst rag stub fill Q42 --text "Когда нужен batch FFT для антенного массива на GPU..."
   ```
5. CLI:
   - `ai_stubs.status='human_filled', filled_text=...`
   - `doc_blocks.content_md` обновляется
   - В .md: `ai_generated=false`, placeholder заменяется на текст
   - `human_verified=true` ставится после ревью

**История сохраняется**: `ai_generated=false`, но `ai_stubs.suggested_text` остаётся (виден в БД).

---

## 8. Re-run safety

При запуске `dsp-asst rag refresh --repo X`:

```python
for source_file in repo.docs + repo.headers:
    new_hash = sha1(source_file.content)
    existing = db.fetch("SELECT block_id, source_hash, human_verified FROM doc_blocks WHERE doc_path=%s", source_file)

    if existing.source_hash == new_hash:
        skip()                                        # ничего не изменилось
    elif existing.human_verified:
        warn("Source changed but human_verified — manual review needed")
        log_to_review_queue()                         # Alex смотрит
    else:
        regenerate()                                  # пересобираем блок
        update_md_files_referring_to(block_id)
```

**Принцип**: human-verified блоки никогда не перезаписываются молча.

---

## 9. Агент 1 — Class-Card Generator

### Назначение
Для каждого Layer-6 класса репо генерит `<repo>/.rag/test_params/<ns>_<Class>.md`
по образцу `examples/fft_processor_FFTProcessorROCm.md`.

### Вход
- `--repo spectrum` (обязательно)
- `--class FFTProcessorROCm` (опционально, если не указан — все Layer-6)
- `--dry-run` (опционально)

### Алгоритм
1. Из БД `symbols` вытянуть классы репо `kind='class' AND is_facade=true` (по эвристике: имя `*Processor`/`*Pipeline`/наследует `IBackend`/в namespace `dsp::<repo>` на верхнем уровне).
2. Для каждого класса:
   - **Header parsing** (через `agent_doxytags/extractor.py`):
     - Все public методы с `@brief` / `@param` / `@throws` / `@test*` тегами.
     - Сигнатуры, перегрузки.
   - **Doc parsing**: найти секции в `Doc/*.md` где упоминается класс (по h2/h3-заголовкам и тексту).
   - **JSON summary** через `index_class.py` (промпт 001 — ai_summary через Qwen).
   - **Регистрация блоков** в `doc_blocks`:
     - `<repo>__<class_snake>__class_overview__v1` (краткое ЧТО/ЗАЧЕМ/ПОЧЕМУ — копируется из Doc/ или AI-stub)
     - `<repo>__<class_snake>__usage_example__v1` (копируется из Doc/ если есть, иначе AI-stub)
     - На каждый метод: `<repo>__<class_snake>__method_<methodname>_signature__v1`,
       `_doxygen__v1`, `_test_params__v1` (из @test* тегов).
6. Сборка `.md` файла:
   - Frontmatter с метаданными (см. образец `fft_processor_FFTProcessorROCm.md`).
   - Описание класса — копия `class_overview` блока + копия `usage_example`.
   - Один раздел `## Method N: <name>` на метод с подразделами «Сигнатура / Doxygen-источник / Параметры / Возвращает / Бросает».
   - Везде вставлены `<!-- rag-block: id=... -->` маркеры.
7. Запись `<repo>/.rag/test_params/<ns>_<Class>.md`.

### Выход
- `<repo>/.rag/test_params/<class_card>.md`
- Записи в `doc_blocks` (10-30 блоков на класс)
- Записи в `test_params` (один на метод, как раньше)
- Лог в stdout с `dry-run` diff

### Промпт `010_class_card.md`
**LLM зовётся ТОЛЬКО**:
- Если нет `class_overview` в Doc/ → стаб из 100 симв «ЧТО/ЗАЧЕМ»
- Если нет `usage_example` в Doc/ → стаб из 5-7 строк кода (LLM собирает по сигнатуре)

Всё остальное — детерминистика на Python.

---

## 10. Агент 2 — Use-Case Generator

### Назначение
Для каждой **семантической задачи** (тип B из обсуждения) репо генерит карточку
по образцу `examples/use_case_fft_batch_signal.example.md`.

### Гранулярность
**B** (одна задача — одна карточка). Не один метод на карточку, не один класс.

### Алгоритм определения use-case'ов
1. **Из Doc/**: каждый h2 типа `## Pipeline:` или `## Use-case:` или маркеры `<!-- rag-usecase: id=... -->`.
2. **Из тестов**: `tests/test_*.cpp` — каждый `TEST(...)` с brief'ом «как сделать X».
3. **Из примеров кода**: `examples/cpp/*.cpp` (если есть) → один файл = один use_case (sweet-spot).
4. **AI-предложение** (опционально, по `--suggest-via-ai`): Qwen по списку Layer-6 методов предлагает 5-15 use_case'ов на репо. Alex ревьюит, оставляет нужные.

### Контракт
| Поле | Источник |
|---|---|
| `id`, `repo`, `title` | вход или AI |
| `synonyms.ru/en` (8-12 шт) | LLM (промпт 011) |
| `primary_class`, `primary_method` | по упоминанию в Doc/ или AI-эвристика |
| `related_classes`, `related_use_cases` | retrieval (BGE-M3 + reranker) по embedding |
| `tags` | вытяжка из Doc/ (FFT, hipFFT, batch, ...) + AI |
| Body «Когда применять» | копия из Doc/ (h3 `Назначение`, `Когда`) или AI-stub |
| Body «Решение» (код 10-15 строк) | копия из `examples/cpp/<related>.cpp` (если есть) или из header'а (TestRunner стиль) |
| Body «Параметры» | копия из class-card блоков test_params |
| Body «Граничные случаи» | копия из class-card edge_cases (из @throws+@test_check) |
| Body «Что делать дальше» | LLM на основе related_use_cases |

### Выход
- `<repo>/.rag/use_cases/<slug>.md`
- Запись в `use_cases` (метаданные + embedding(title+synonyms))
- block_refs указывают на `doc_blocks` (без дублирования контента в Phase 2)

### Промпт `011_usecase.md`
**LLM делает**:
1. Synonyms (8 ru + 8 en) на основе title + primary_class + tags.
2. Тэги (5-10 ключевых слов).
3. Если в Doc/ нет «Когда применять» — короткий стаб.

Всё остальное — детерминистика.

---

## 11. Агент 3 — Pipeline Generator

### Назначение
Для composer-репо (`strategies`, `radar`) генерит карточки pipeline'ов по образцу
`examples/pipelines.example.md`. На compute-репо (spectrum, stats, ...) — опционально 1-2.

### Алгоритм
1. Найти классы `*Pipeline*` в `<repo>/include/.../strategies/` или `<repo>/include/.../pipelines/`.
2. Для каждого:
   - **Композитор** — сам класс (`strategies::AntennaCovariancePipeline`).
   - **Цепочка steps** — парс `.cpp`: ищем `AddStep<>(...)`, `pipeline.AddStep<MyStep>()`, явные include'ы.
   - **Cross-repo связи** — для каждого Step из БД `includes` определить целевой репо/класс.
   - **ASCII data flow** — копия из `Doc/<pipeline>_*.md` если есть; иначе **строится автоматически** по chain_classes (data type через `@param/@return` сигнатуры).
3. Регистрация блоков:
   - `<repo>__<pipeline_snake>__chain_overview__v1`
   - `<repo>__<pipeline_snake>__used_classes__v1`
   - `<repo>__<pipeline_snake>__parameters__v1`
   - `<repo>__<pipeline_snake>__edge_cases__v1`
4. Запись `<repo>/.rag/pipelines/<name>.md`.

### Разбиение
- ≤5 pipelines в репо → один файл `<repo>/.rag/pipelines.md`.
- >5 → папка `<repo>/.rag/pipelines/<name>.md` + `pipelines/_index.md`.

### Промпт `012_pipeline.md`
**LLM делает**:
1. «Зачем» (1-2 предложения), если в Doc/ нет.
2. Synonyms названия pipeline.
3. Описание граничных случаев (объединяя из @throws всех steps).

---

## 12. CLI расширение

```
dsp-asst rag <command> [options]

  audit                     Phase 0 — покрытие @test/error_values
    --repo <name>           Один репо (по умолчанию все)
    --strict                Падать при пробелах (для CI)

  blocks ingest             Парсит Doc/*.md → doc_blocks
    --repo <name>           Один или несколько (multi-flag)
    --re-embed              После ingest — переэмбеддить
    --dry-run               Не писать в БД, только diff

  cards build               Агент 1 (class-card)
    --repo <name>           Обязателен
    --class <FQN>           Опционально, один класс
    --dry-run

  usecases build            Агент 2 (use_case)
    --repo <name>
    --suggest-via-ai        AI предлагает список use-cases
    --use-case <slug>       Опционально, один
    --dry-run

  pipelines build           Агент 3 (pipeline)
    --repo <name>
    --pipeline <name>       Опционально
    --dry-run

  refresh                   Re-run safety на всё (skip unchanged)
    --repo <name>
    --force                 Игнорировать source_hash, перегенерить всё

  status                    Отчёт покрытия
    --repo <name>           Что есть, чего нет

  stub fill <Q42>           Заполнить AI-stub
    --text "..."            Финальный текст от Alex
```

---

## 13. Pilot — `spectrum`

### Pre-flight
- [ ] **PG ping**: `psql -h <ubuntu-host> -U dsp_asst -d dsp_assistant -c "SELECT version();"` (через шлюз) или Python `psycopg2`.
- [ ] **PG бэкап**: `pg_dump -h <ubuntu-host> -U dsp_asst dsp_assistant > _backup_pre_rag_2026-05-05.sql`.
- [ ] **Qdrant ping**: `curl http://<ubuntu-host>:6333/collections` — должна быть видна `dsp_gpu_code_v1`.
- [ ] **Qdrant snapshot**: `curl -X POST http://<ubuntu-host>:6333/collections/dsp_gpu_code_v1/snapshots`.
- [ ] **Сколько данных в БД**: `psql ... -c "SELECT 'symbols' AS t, count(*) FROM dsp_gpu.symbols UNION ALL SELECT 'files', count(*) FROM dsp_gpu.files;"`.
- [ ] Применить **pointer-правку #2** в `spectrum/include/spectrum/factory/spectrum_processor_factory.hpp:57` (Doxygen-комментарий, на код не влияет — вместе с правилом enum/bool/json в одном коммите).
- [ ] Прогнать существующий `dsp-asst index build --repo spectrum` (наполнение symbols/files/etc) — если ещё не сделано.

Хост `<ubuntu-host>` берётся из `MemoryBank/specs/LLM_and_RAG/configs/stack.json` для целевого stage'а (2_work_local или 3_mini_server).

### Phase 1 (Pilot spectrum)
| # | Шаг | Время | Артефакт |
|---|---|---|---|
| 1 | Переименовать БД на `gpu_rag_dsp` (4 файла) | 30 мин | configs/* |
| 2 | DDL новых 4 таблиц + applied | 30 мин | postgres_init.sql append |
| 3 | `doc_block_parser.py` — h2/h3 + якоря | 2 ч | dsp_assistant/modes/ |
| 4 | `block_id.py` — slug-генератор + версионирование | 1 ч | dsp_assistant/utils/ |
| 5 | `dsp-asst rag blocks ingest --repo spectrum --dry-run` → ревью список | 30 мин | вывод |
| 6 | Реальный ingest spectrum | 15 мин | doc_blocks ~50 записей |
| 7 | Промпт `010_class_card.md` | 1 ч | prompts/ |
| 8 | `class_card.py` агент | 3 ч | dsp_assistant/modes/ |
| 9 | `dsp-asst rag cards build --repo spectrum --class FFTProcessorROCm --dry-run` | 30 мин | diff |
| 10 | Реальная генерация → ревью Alex | 2 ч | spectrum/.rag/test_params/fft_processor_FFTProcessorROCm.md |
| 11 | Промпт `011_usecase.md` | 1 ч | prompts/ |
| 12 | `usecase_gen.py` агент | 2.5 ч | dsp_assistant/modes/ |
| 13 | Генерация ~6 use_cases на spectrum + ревью | 2 ч | spectrum/.rag/use_cases/*.md |

**Definition of Done** для Pilot spectrum:
- 1 class-card сгенерирован 1-в-1 как `examples/fft_processor_FFTProcessorROCm.md` (дельта <10%).
- 6 use_cases на spectrum, Alex одобрил минимум 4.
- `gpu_rag_dsp.doc_blocks` содержит ≥50 записей по spectrum, ≥3 ai_stubs (если были).
- `dsp-asst rag refresh --repo spectrum` повторно запущенный — skip 100% (re-run safety работает).

### Phase 2 (Pilot strategies — pipelines)
| # | Шаг | Время |
|---|---|---|
| 1 | Промпт `012_pipeline.md` | 1 ч |
| 2 | `pipeline_gen.py` агент | 3 ч |
| 3 | Парс `Doc/Farrow_Pipeline.md`, `AP_*.md` → блоки | 30 мин |
| 4 | Генерация 3 pipelines в strategies + ревью | 2 ч |

**DoD Pilot strategies**: 3 pipeline-карточки соответствуют `examples/pipelines.example.md`.

---

## 14. Раскатка на 7 оставшихся репо (после двух pilot'ов)

После pilot'ов **spectrum** (TASK_04..08) + **strategies** (TASK_09..10) — раскатка на остальные **7 репо** (v3: DSP вернулся в скоуп через TASK_RAG_02.6).

| Репо | Use-cases (~оценка) | Pipelines | Class-cards | Python use-cases | Время агента+ревью |
|---|---|---|---|---|---|
| core | 5 | 0 | 4 | 0 | 2 ч |
| stats | 5 | 1 | 3 | 3 | 2 ч |
| signal_generators | 6 | 1 | 4 | 3 | 2 ч |
| heterodyne | 4 | 2 | 2 | 4 | 1.5 ч |
| linalg | 6 | 2 | 4 | 3 | 2.5 ч |
| radar | 4 | 3-5 | 3 | 3 | 3 ч |
| **DSP** (v3) | — | — | — | **53** (12 spectrum + 7 strategies + 5 integration + …) | 6 ч |

**Итого по 9 репо** (включая pilot'ы spectrum+strategies): ~30 use-cases + ~12 pipelines + ~25 class-cards + ~70 python_test_usecase + ~5 cross_repo_pipeline. После каждого репо — короткое ревью Alex'ом, минимум 50% карточек `human_verified=true`.

---

## 15. Переиспользование существующего

| Что | Где | Как используем |
|---|---|---|
| `agent_doxytags/extractor.py` | `dsp_assistant/agent_doxytags/` | Парс @test/@param/@throws тегов из header'ов |
| `agent_doxytags/walker.py` | то же | Обход `<repo>/include/<repo>/**/*.hpp` |
| `agent_doxytags/heuristics.py` | то же | Эвристики типов параметров (для error_values, теперь — для исключений enum/bool) |
| `db/client.py` | `dsp_assistant/db/` | PG-клиент, query helpers |
| `llm/ollama_client.py` | `dsp_assistant/llm/` | Qwen + load_prompt |
| `modes/index_class.py` (промпт 001) | `dsp_assistant/modes/` | JSON-сводка класса (одно из полей class-card) |
| `modes/helpers.py` | то же | `find_first_by_name`, `read_source_block`, `safe_json_loads` |
| Промпты 001/008 | `MemoryBank/specs/LLM_and_RAG/prompts/` | Базовые шаблоны для 010/011/012 |

**Не дублируем код** — все три агента наследуются от общего `BaseGenerator` (новый класс) с
`db`, `llm`, `walker`, `extractor`, `block_writer` слотами.

---

## 16. Сроки и метрики

### Сроки
| Этап | Часы Кодо | Часы Alex | Календарь |
|---|---|---|---|
| Phase 0 (audit + error_values правка #2) | 1 | 0 | сегодня |
| Phase 0 (TASK_remove_opencl) | 0 | (отдельно) | отложено |
| Phase 1 шаги 1-6 (БД + ingestion) | 5 | 0.5 | день 1-2 |
| Phase 1 шаги 7-10 (class-card + ревью FFT) | 5 | 2 | день 2-3 |
| Phase 1 шаги 11-13 (usecase + ревью) | 4 | 2 | день 3-4 |
| Phase 2 (pipelines на strategies) | 5 | 2 | день 5 |
| Раскатка на 7 репо | 6 | 8 | дни 6-9 |
| Полировка + retrieval validation | 3 | 1 | день 10 |
| **Итого** | **29 ч** | **15.5 ч** | **~2 недели** |

### Метрики готовности
| Метрика | Сейчас | Целевая |
|---|---|---|
| `doc_blocks` записей | 0 | ≥600 (по 9 репо) |
| `use_cases` карточек | 0 | ≥40 |
| `pipelines` карточек | 0 | ≥12 |
| `class-cards` (`.rag/test_params/`) | 1 (ручная) | ≥25 |
| `human_verified=true` карточек | 0 | ≥50% |
| R@5 на golden_set | 0.88 | ≥0.93 (после ingestion + статичный HyDE через synonyms) |

---

## 17. Решения после ревью Alex (2026-05-05)

| # | Вопрос | Решение |
|---|---|---|
| 1 | Старая `examples/fft_processor_FFTProcessorROCm.md` | **Переименована в `_old.md`**. Когда class-card-агент сгенерит новую — сравнить → если delta <10% удалить `_old`. ✅ Сделано. |
| 2 | Schema `dsp_gpu` или `rag_dsp` | **`rag_dsp`** (однотипно с `gpu_rag_dsp`). ✅ Внесено в план. |
| 3 | DSP мета-репо | См. ниже §17.1 — переформулирую |
| 4 | Когда стартуем Phase 1 | **Сегодня**, но сначала разбить план на таски, Alex прочитает, обсудим **правильный старт**. ✅ Делаю таски. |
| 5 | Connection string PostgreSQL | Порт 5432 локально слушает (туннель/WSL/Docker). `psql.exe` клиента в Win нет — подключусь через `psycopg2`. Жду пароль `DSP_ASST_PG_PASSWORD` или подтверждение что smoke от Alex'а нормально. |

### 17.1. DSP мета-репо — ПЕРЕСМОТРЕНО в v3 (DSP вернулся в скоуп)

**Прежнее решение** (план v2 / ревью v2.1 #8): «DSP пропускаем (вариант B)». **Отменено в v3**.

**Новое решение** (Alex, 2026-05-06): **DSP индексируем целиком**.

Причина пересмотра: при аудите перед TASK_RAG_02 обнаружено **53 файла `t_*.py`** в `DSP/Python/`:
- spectrum: 12 (lch_farrow, fft_*, filters_*, kalman, kaufman, moving_average, …)
- strategies: 7 (farrow_pipeline, scenario_builder, timing_analysis, …)
- stats: 3, linalg: 3, radar: 3, heterodyne: 4, signal_generators: 3, common: 4
- **integration: 5** (fft_integration, signal_to_spectrum, hybrid_backend, zero_copy, …) — **кросс-репо pipeline'ы**

Каждый — это пара (вопрос «как сделать X на GPU из Python», ответ «вот реальный код вызова через pybind»). Без DSP теряется:
- ~50% потенциала RAG для запросов по Python-API
- весь fine-tune датасет на «GPU C++ ↔ Python моделирование»
- кросс-репо integration примеры (нет другого источника)

**Как делаем**:
- TASK_RAG_02.6 — Python-биндинги + Python use-case'ы (новый агент `python_usecase_gen.py`).
- Class-card / Pipeline агенты на DSP **по-прежнему не работают** (там нет C++ классов и composer'ов) — это OK. DSP даёт только Python use-cases.
- Использовать существующую таблицу `pybind_bindings` (42 строки) + расширить через AST-парсер `<repo>/python/py_*.hpp` и `dsp_*_module.cpp`.
- Cross-repo integration тесты → новая категория `cross_repo_pipeline` в `doc_blocks`.

**Раскатка идёт на 9 репо** (v3): core, spectrum, stats, signal_generators, heterodyne, linalg, radar, strategies, **DSP**.

---

## 18. Что дальше — план разбивается на таски

Каждая фаза = отдельный `MemoryBank/tasks/TASK_RAG_*.md`:

| TASK | Что | Часы | Зависимости |
|---|---|---|---|
| `TASK_RAG_01_db_rename` | Переименование БД/schema (5 файлов) | 1 | — |
| `TASK_RAG_02_schema_migration` | DDL 4 таблиц + Qdrant collection + поле `inherits_block_id` (v3) | 2 | 01 |
| **`TASK_RAG_02.5_meta_sources`** **(v3)** | CLAUDE.md + CMake summary + build_orchestration | 8 | 02 |
| **`TASK_RAG_02.6_python_bindings_and_tests`** **(v3)** | pybind11 биндинги + 53 t_*.py из DSP как use-case'ы | 14 | 02 |
| `TASK_RAG_03_block_parser` | `doc_block_parser.py` + `block_id.py` | 3 | 02 |
| `TASK_RAG_04_doc_ingestion_spectrum` | Парс spectrum/Doc/* → doc_blocks | 1 | 03 |
| `TASK_RAG_05_class_card_agent` | Промпт 010 + `class_card.py` агент | 4 | 04 |
| `TASK_RAG_06_class_card_pilot_FFT` | Прогон агента 1 на FFTProcessorROCm | 1.5 | 05 |
| `TASK_RAG_07_usecase_agent` | Промпт 011 + `usecase_gen.py` агент | 3.5 | 06 |
| `TASK_RAG_08_usecase_pilot_spectrum` | 6 use_cases на spectrum + ревью | 2 | 07 |
| `TASK_RAG_09_pipeline_agent` | Промпт 012 + `pipeline_gen.py` агент | 4 | 08 |
| `TASK_RAG_10_pipeline_pilot_strategies` | 3 pipelines на strategies + ревью | 2 | 09 |
| `TASK_RAG_11_rollout` | Раскатка на 7 репо (включая DSP в v3) | 18 | 10, 02.5, 02.6 |
| `TASK_RAG_12_retrieval_validation` | R@5 на golden_set с/без HyDE | 1 | 11 |

**Параллельность**: 02.5 и 02.6 не блокируют 03..10. Можно делать в фоне после 02.

**Итого**: ~65 ч (Кодо ~40 + Alex ~25), календарь ~3 недели.

---

*План v3 готов (2026-05-06). Дальше — TASK_RAG_02 с расширением + 02.5 / 02.6.*
