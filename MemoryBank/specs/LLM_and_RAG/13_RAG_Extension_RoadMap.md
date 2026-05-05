# RAG Extension — Roadmap

> **Статус**: финальный план · **Версия**: 1.0 · **Дата**: 2026-05-01
>
> Сводный документ всей дискуссии про расширение RAG-системы DSP-GPU.
> Что построено, что добавляем, в каком порядке, с какими источниками.
>
> Связан с: `09_RAG_md_Spec.md`, `12_DoxyTags_Agent_Spec.md`,
> `examples/fft_processor_FFTProcessorROCm.md`,
> `examples/use_case_fft_batch_signal.example.md`,
> `examples/pipelines.example.md`.

---

## 1. TL;DR

Текущая RAG-система DSP-GPU на R@5=0.88 — это **vector RAG базового уровня**.
Чтобы поднять до **production-grade Code-RAG** (как Cody/Cursor) добавляем:

1. **HyDE + домен-промпт** — до +42 п.п. precision на семантических запросах.
2. **Use-case карточки** + синонимы — статичный HyDE без LLM-латентности.
3. **Pipelines.md** — иерархия strategy → repo → module → class → method.
4. **Examples индексер с boost** — реальный код-копипаста для AI и человека.
5. **GraphRAG** поверх existing includes/pybind/inheritance.
6. **Doxygen `@test*` инфраструктура** — автогенерация тестов и `_RAG_TEST_PARAMS.md`.
7. **`@autoprofile` инфраструктура** — автогенерация бенчмарков.
8. **Telemetry** — boost популярных методов в retrieval.

---

## 2. Текущее состояние (что построено)

| Слой | Статус | Файлы / таблицы |
|---|---|---|
| **Indexer** | ✅ tree-sitter, 6172 cpp-символа | `dsp_assistant/indexer/`, table `symbols` |
| **Embeddings** | ✅ BGE-M3 fp16 на CUDA | `dsp_assistant/retrieval/embedder.py`, table `embeddings` |
| **Retrieval** | ✅ hybrid + reranker, R@5=0.88 | `dsp_assistant/retrieval/pipeline.py`, BGE-reranker-v2-m3 |
| **Граф (частично)** | ⚠️ только includes (3395), pybind (42), cmake (31) | tables `includes`, `pybind_bindings`, `cmake_targets` |
| **Test penalty** | ✅ `tests/`, `examples/`, `references/`, Mock — все боjоятся | `pipeline.py:_is_test_or_helper` |
| **Agent (Phase 7)** | ✅ ReAct + 4 tools (find/search/show/read_file) | `dsp_assistant/agent/` |
| **Auto-индекс** | ✅ git post-commit во все 9 репо + cron-готов | `update_index.bat`, `install_git_hooks.bat` |
| **CUDA torch pin** | ✅ wheels offline + fix-bat | `wheels_offline/`, `fix_torch_cu118.bat` |

**Чего НЕТ**:
- call-graph (clangd LSP, отложено до Debian)
- inheritance tree (легко добавить)
- code-specific embeddings (BGE-M3 — общего назначения)
- knowledge-graph queries (`who_uses_X`, `inherits_from_Y`)
- HyDE / query expansion
- use-cases, pipelines как индексируемые сущности
- examples как kind=`example`
- telemetry от прогонов тестов

---

## 3. Что добавляем — 11 категорий

### 3.1 Doxygen `@test*` инфраструктура (стандарт уже описан)

См. `09_RAG_md_Spec.md` §5.
- Теги `@test`, `@test_field`, `@test_ref`, `@test_check`.
- Источник правды для тестовых параметров.
- Правило «нет тега → нет автотеста».
- Программистам не нужно учить YAML — пишут стандартный doxygen.

### 3.2 Doxygen-Filler агент (стандарт уже описан)

См. `12_DoxyTags_Agent_Spec.md`.
- CLI: `dsp-asst doxytags fill --all/--repo/--file/--method`.
- Пилот на `fft_processor_rocm.hpp`.
- Раскатка на остальные 8 репо.

### 3.3 Карточки `_RAG_TEST_PARAMS.md` (формат описан)

См. `09_RAG_md_Spec.md` §4 + `examples/fft_processor_FFTProcessorROCm.md`.
- Один файл = один класс.
- Имя `<namespace>_<ClassName>.md`, без подчёркивания, в `<repo>/.rag/test_params/`.
- Генерится из `@test*` тегов через `dsp-asst manifest refresh`.

### 3.4 Use-case карточки (формат описан)

См. `examples/use_case_fft_batch_signal.example.md`.
- Расположение: `<repo>/.rag/use_cases/<id>.md`.
- YAML-frontmatter: title, synonyms (ru+en), primary_class, related, tags.
- Body: «Когда применять», копипастный код 10-15 строк, граничные случаи, ссылки.
- **Синонимы — статичный HyDE**: эмбеддятся отдельно, индексер boost'ает.
- 5-15 use-case'ов на репо. Пишутся руками или AI с правкой.

### 3.5 Pipelines.md (формат описан)

См. `examples/pipelines.example.md`.
- Расположение: `<repo>/.rag/pipelines.md` (один на репо).
- ASCII data flow + списки классов по слоям.
- Особенно важно для composer-репо (`strategies`).
- Эмбеддится как отдельный kind=`pipeline`.

### 3.6 Examples индексер с boost

- Расположение: `<repo>/examples/cpp/*.cpp` + `<repo>/examples/python/*.py`.
- В indexer добавить kind=`example` (отличать от tests).
- В `pipeline.py:KIND_BOOST` добавить `example: 1.30`.
- НЕ применять `_is_test_or_helper` penalty к этому пути.
- Examples всплывают первыми на «как сделать X».

### 3.7 Inheritance tree

- Расширение indexer'а: парсить `: public Base` через tree-sitter.
- Новая таблица `inheritance(child_id, parent_fqn, access_specifier)`.
- Tool в агент: `dsp_inheritance(class)` → returns parents + children.
- ~1 ч кода.

### 3.8 GraphRAG поверх existing

- Существующие edges: `includes`, `pybind_bindings`, `cmake_targets`, новый `inheritance`.
- Будущие: `call-graph` (Debian + clangd).
- Tool `dsp_graph_neighbors(symbol_id, depth=2, edge_types=...)`.
- Алгоритм Microsoft GraphRAG community-detection — НЕ реализуем (наш граф меньше). Вместо этого простой BFS по нужным типам рёбер.
- См. https://github.com/microsoft/graphrag для референса.

### 3.9 HyDE + домен-промпт

- Новый шаг в `pipeline.py` ПЕРЕД dense-search.
- Промпт `prompts/010_hyde_dsp.md`:
  ```
  Ты — senior C++ DSP/GPU engineer проекта DSP-GPU.
  Запрос пользователя: «{query}».
  Напиши краткий (3-4 предложения) doxygen-style абзац,
  описывающий ВЕРОЯТНЫЙ класс/метод который отвечает на запрос.
  Не выдумывай конкретные имена. Используй термины: hipFFT, ROCm, beam,
  n_point, sample_rate, GpuContext, BufferSet, Op, Facade.
  ```
- Эмбеддить вывод Qwen → искать ближайшие реальные символы.
- Опция `--use-hyde` в CLI, по дефолту on.
- Оверхед: +1.5-2 сек на запрос (можно кэшировать запрос → гипотезу на 5 мин).
- Ожидаемый эффект: +5-15% R@5 на семантических запросах.

### 3.10 `@autoprofile` инфраструктура

См. `09_RAG_md_Spec.md` §7.5 + `12_DoxyTags_Agent_Spec.md` §7.
- Тег для GPU-классов.
- Два режима: при создании AI (Alex просил → ставит true) и при mass-fill (детект существующего benchmark-класса).
- Pipeline `manifest refresh` генерирует `<repo>/tests/auto/<ns>_<Class>_benchmark.hpp`.
- Регрессия perf'а пишется в `notes:` главного `_RAG.md`.

### 3.11 Telemetry-driven boost

- Новая таблица `usage_stats(symbol_id, calls_total, last_called, avg_latency_ms, error_rate)`.
- Заполняется при прогоне тестов / бенчмарков.
- В `pipeline.py:_apply_kind_boost` добавить `popularity_boost = log1p(calls_total) / 10`.
- «Живые» классы выходят впереди dead-кода.
- Можно начинать собирать с самого начала — Alex согласен (п.4).

---

## 4. Архитектурная схема каталога — финальная

```
<repo>/                                    ← один из 9 репо DSP-GPU
├── .rag/
│   ├── _RAG.md                            ← главный манифест репо (см. 09 §3)
│   ├── _RAG_repo_overview.md              ← (опц.) расширенный обзор
│   ├── _RAG_changelog.md                  ← (опц.) история RAG-правок
│   ├── pipelines.md                       ← цепочки strategy → modules
│   ├── use_cases/
│   │   ├── fft_batch_signal.md
│   │   ├── filter_apply_fir.md
│   │   └── ...
│   └── test_params/
│       ├── fft_processor_FFTProcessorROCm.md
│       ├── filters_FirFilterROCm.md
│       └── ...
├── examples/
│   ├── cpp/
│   │   ├── fft_basic.cpp
│   │   └── filter_pipeline.cpp
│   └── python/
│       ├── fft_basic.py
│       └── filter_pipeline.py
├── include/<repo>/                        ← код с doxygen `@test*` тегами
├── src/                                   ← реализация
├── tests/                                 ← существующие тесты
│   ├── test_<class>.hpp
│   └── auto/                              ← автогенерируется из @test
│       ├── test_<ns>_<Class>_processcomplex.hpp
│       └── <ns>_<Class>_benchmark.hpp     ← из @autoprofile
└── Doc/                                   ← существующая документация
```

---

## 5. Research summary (выводы)

| Источник | Главный insight |
|---|---|
| **Sourcegraph Cody** | 3-слойный context (file/repo/remote), agentic context fetching через MCP, до 1M токенов |
| **Cursor** | Tree-sitter chunking никогда не режет посредине функции/statement |
| **HyDE (HyPE)** | До +42 п.п. precision, +45 recall. Domain-tailored промпт критичен |
| **voyage-code-3** | SOTA код-эмбеддинги (MTEB 84.0). +13.8% vs OpenAI. Но SaaS, не подходит |
| **CodeRankEmbed / jina-code-v2** | Open-source альтернативы BGE-M3 для кода |
| **Microsoft GraphRAG** | Community-detection на больших графах. Для нас — оверкилл. Берём только идеи |
| **Code-Graph-RAG** | Tree-sitter + multi-language → KG → MCP server. Прямой референс для нашего graph-tool |

Источники: `Cody`, `Cursor`, `HyDE arXiv 2212.10496`, `Voyage-code-3 blog`, `Microsoft GraphRAG GitHub`.

---

## 6. Приоритизация Top-11

| Ранг | Что | ROI | Сложность | Кто делает |
|---|---|---|---|---|
| 1 | **HyDE + домен-промпт** | ★★★★★ | M (1.5 ч) | Кодо |
| 2 | **Use-case карточки** | ★★★★★ | L (по 15 мин на штуку) | Alex руками |
| 3 | **Pipelines.md в `<repo>/.rag/`** | ★★★★ | L (по 15 мин) | Alex руками |
| 4 | **Inheritance tree** | ★★★★ | L (1 ч) | Кодо |
| 5 | **GraphRAG над existing edges** | ★★★★ | M (3 ч) | Кодо |
| 6 | **Doxygen `@test*` инфраструктура** | ★★★★ | M (см. 09 §13) | оба |
| 7 | **Doxygen-Filler агент** | ★★★★ | M (см. 12 §11) | Кодо |
| 8 | **Examples индексер с boost** | ★★★ | L (30 мин) | Кодо |
| 9 | **`@autoprofile` инфраструктура** | ★★★ | M (2 ч) | Кодо |
| 10 | **Telemetry** | ★★★ | M (2 ч) | Кодо |
| 11 | **CodeRankEmbed/jina-code трайл** | ★★ | M (3 ч) | Кодо, опц. |

---

## 7. Детальный поэтапный план

### Этап А — быстрые победы (без блокировок) — 1 день

| # | Задача | Время | Зависимости |
|---|---|---|---|
| A1 | Inheritance tree (indexer + table + миграция БД) | 1 ч | — |
| A2 | Examples индексер с boost (kind=example, KIND_BOOST['example']=1.30) | 30 мин | — |
| A3 | HyDE: промпт `010_hyde_dsp.md` + опция в `pipeline.py:query` | 1.5 ч | — |
| A4 | Замер R@5 на golden_set с/без HyDE | 30 мин | A3 |
| A5 | Tool `dsp_inheritance(fqn)` для агента | 30 мин | A1 |

**Критерий готовности этапа А**: R@5 ≥ 0.90 (текущий 0.88 + 2-5 пп от HyDE).

### Этап Б — Doxygen `@test*` инфраструктура — 2 дня

| # | Задача | Время | Зависимости |
|---|---|---|---|
| Б1 | JSON-Schema `_RAG.schema.json` + `class_card.schema.json` | 1 ч | — |
| Б2 | Парсер doxygen `@test*` тегов + юнит-тесты | 1.5 ч | — |
| Б3 | CLI `dsp-asst manifest check / init / refresh / sync` | 2 ч | Б2 |
| Б4 | Пилот на `spectrum`: сгенерировать `.rag/` | 1 ч | Б3 |
| Б5 | Alex добавляет `@test` теги к 1-2 классам | 1 ч (Alex) | — |
| Б6 | Прогон автогенерации тестов | 1 ч | Б5 |
| Б7 | Раскатка на 8 остальных репо | 1 ч код + 4 ч Alex | — |

**Критерий готовности**: 1 класс полностью покрыт `@test*` тегами и автогенерируется
рабочий тест `gpu_test_utils::TestRunner`-стиля.

### Этап В — Doxygen-Filler агент — 2 дня

| # | Задача | Время | Зависимости |
|---|---|---|---|
| В1 | `extractor.py` (tree-sitter parser) | 1.5 ч | — |
| В2 | `analyzer.py` (diff что есть/чего нет) | 1 ч | В1 |
| В3 | `git_check.py` (pre-flight) | 30 мин | — |
| В4 | `prompts/009_test_params_extract.md` (эвристики) | 1 ч | — |
| В5 | `llm_filler.py` (Qwen с тремя контекстами) | 1.5 ч | В1, В4 |
| В6 | `patcher.py` (вставка + tree-sitter валидация) | 1 ч | В1 |
| В7 | `walker.py` + CLI | 1 ч | В1-В6 |
| В8 | Smoke на одном методе `ProcessComplex` | 30 мин | В1-В7 |
| В9 | Прогон на `fft_processor_rocm.hpp` целиком | 30 мин | В8 |
| В10 | Прогон на всём `spectrum` `--dry-run` | 1 ч | В9 |
| В11 | Alex смотрит diff, правит эвристики | 1 ч (Alex) | В10 |
| В12 | Раскатка на 8 репо | 30 мин код + 2-4 ч Alex | В11 |

**Критерий готовности**: один class fully-tagged через агент без ручных правок,
`@test*` теги соответствуют доменным эвристикам, тесты автогенерированы и проходят.

### Этап Г — Use-cases + Pipelines + Examples (параллельно с Б/В)

| # | Задача | Время | Кто |
|---|---|---|---|
| Г1 | Перенести шаблон use_case в `<repo>/.rag/use_cases/.template.md` | 15 мин | Кодо |
| Г2 | Перенести шаблон pipelines.md в `<repo>/.rag/.pipelines.template.md` | 15 мин | Кодо |
| Г3 | Написать 3-5 use-case'ов на `spectrum` | 1.5 ч | Alex |
| Г4 | Написать 1-3 pipeline'а на `strategies` | 1.5 ч | Alex |
| Г5 | Написать `<repo>/examples/cpp|python/*` для 1-2 классов на `spectrum` | 2 ч | Alex |
| Г6 | Tool `dsp_use_case(query)` для агента | 30 мин | Кодо |
| Г7 | Tool `dsp_pipeline(name)` для агента | 30 мин | Кодо |

### Этап Д — GraphRAG — 1 день

| # | Задача | Время | Зависимости |
|---|---|---|---|
| Д1 | Tool `dsp_graph_neighbors(symbol_id, depth, edge_types)` | 2 ч | A1 (inheritance) |
| Д2 | Промпт-инструкция агенту: «когда вопрос про use/inherit — зови dsp_graph_neighbors» | 30 мин | Д1 |
| Д3 | Smoke: «что использует ProfilingFacade::Record?» через агента | 30 мин | Д1, Д2 |

### Этап Е — `@autoprofile` инфраструктура — 1 день

| # | Задача | Время |
|---|---|---|
| Е1 | Парсер `@autoprofile { ... }` тега | 30 мин |
| Е2 | Детект GPU-класса (по include'ам) | 30 мин |
| Е3 | Детект существующих benchmark-классов в репо (Вариант A) | 30 мин |
| Е4 | Шаблон benchmark-наследника `GpuBenchmarkBase` | 1 ч |
| Е5 | Генератор `<repo>/tests/auto/<ns>_<Class>_benchmark.hpp` | 1 ч |
| Е6 | Pipeline `manifest refresh` для `@autoprofile` | 30 мин |

### Этап Ж — Telemetry — 1 день

| # | Задача | Время |
|---|---|---|
| Ж1 | Таблица `usage_stats` + миграция | 30 мин |
| Ж2 | Hook в `gpu_test_utils::TestRunner::OnTestComplete()` → запись в БД | 1 ч (Alex или Кодо) |
| Ж3 | `popularity_boost` в `pipeline.py` | 30 мин |
| Ж4 | Замер R@5 с/без telemetry boost | 30 мин |

### Этап З (опц.) — Code-specific embeddings трайл — 1 день

| # | Задача | Время |
|---|---|---|
| З1 | Скачать `nomic-ai/CodeRankEmbed` или `jinaai/jina-embeddings-v2-base-code` | 30 мин |
| З2 | Параллельная коллекция `embeddings_code` в pgvector | 1 ч |
| З3 | Опция `--embedder code` в CLI | 30 мин |
| З4 | Замер R@5 на golden_set | 30 мин |
| З5 | Решение: оставлять / откатить (зависит от gain) | — |

---

## 8. Метрики готовности

| Метрика | Сейчас | Целевая | Этап |
|---|---|---|---|
| **R@5 на golden_set** | 0.88 | ≥0.93 | A (HyDE) |
| Семантические misses (Q006/Q016/Q018) | 3 | 0-1 | A |
| Покрытие `@test*` тегами | 0% | ≥80% классов | Б+В |
| Use-cases на репо | 0 | 5-15 | Г |
| Examples на репо | 0 | 3-10 | Г |
| Pipelines в `strategies` | 0 | 3-5 | Г |
| Tools агента | 4 | 7+ (graph, use_case, pipeline) | Д |

---

## 9. Связанные документы

- **`09_RAG_md_Spec.md`** v1.0 — стандарт `.rag/`, `_RAG.md`, doxygen `@test*`, профилирование.
- **`12_DoxyTags_Agent_Spec.md`** v1.0 — стандарт агента doxytags.
- **`examples/fft_processor_FFTProcessorROCm.md`** — пример карточки класса.
- **`examples/use_case_fft_batch_signal.example.md`** — пример use-case карточки.
- **`examples/pipelines.example.md`** — пример pipelines.md.
- **`Session_Handoff_2026-05-01.md`** — прошлый handoff, актуализировать.
- **`10_DataFlow_Visualization.md`** [DEPRECATED] — отменённая идея ASCII data_flow.

---

## 10. Открытые решения (на будущие сессии)

1. **Pre-commit hook для `_RAG.md` старения** — порог 10/30 дней?
2. **Weekly cron `manifest refresh-all`** — вторник 09:00, или другое время?
3. **CodeRankEmbed vs BGE-M3** — мерять? Или оставаться на BGE?
4. **Использование MCP** — наш агент уже есть, но Cody/Continue общаются через MCP. Стоит ли экспортировать `dsp_search` / `dsp_graph` через MCP-сервер для интеграции в IDE?
5. **Интеграция с Doxygen рендером** — сейчас Doxygen в проекте не запускается. Если включить, наши `@test*` теги могут поломать его дефолтный рендер. Нужны custom alias'ы.

---

*Конец roadmap v1.0. Возвращаемся к нему перед началом каждого этапа.*
