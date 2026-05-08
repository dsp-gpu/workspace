# Deep Analysis: LLM ↔ RAG в DSP-GPU — что улучшить (2026-05-08, v1.2 после ревью)

> **Что:** глубокий ревью текущего RAG-стека DSP-GPU с акцентом на **тесную работу LLM с RAG** (контекст для AI-генерации тестов, doxygen-тегов, кода).
>
> **Две цели (раздельные):**
> 1. **RAG для inference-time** (Continue/Cline + dsp-asst MCP) — этот документ. Плотный типизированный контекст для уже обученной модели.
> 2. **Расширение fine-tune датасета** через RAG-генерацию raw примеров (1500-3000 QA пар) для следующего QLoRA — отдельная задача (`finetune_diagnostic_2026-05-08.md`).
>
> **Источники анализа:** spec'и 03/09/12/13, схема БД, `dsp_health`, ревью 2026-05-05, eval rerank 2026-05-06, web-research 2026 (LightRAG, ColBERT, CRAG, Late Chunking, voyage-code-3, nomic-embed-code, RAGAs).
> **Скоп:** только LLM+RAG. Bug-fixes, build, миграции — отдельно.
> **Связанные документы:** `RAG_kfp_design_2026-05-08.md` (детали КФП), `MemoryBank/tasks/TASK_RAG_context_fuel_2026-05-08.md` (actionable план).

---

## 1. TL;DR (1 минута)

| Слой | Сегодня (2026-05-08) | Зрелость | Главный gap |
|------|---------------------|----------|-------------|
| **Indexer** | tree-sitter cpp+py, 6172 cpp-символа, 5432 эмбеддинга | ✅ stable | нет inheritance, нет `@test*` парсера, нет examples |
| **Embeddings** | BGE-M3 fp16, vector(1024) в pgvector | ✅ stable | общий (не код-специфичный); chunking «один символ = один вектор» (часто короткий контекст) |
| **Retrieval (symbols)** | dense + tsvector + RRF + bge-reranker-v2-m3, R@5=0.88 | ✅ stable | нет HyDE, нет MMR, нет CRAG-loop; KIND_BOOST статичен |
| **RAG-таблицы** | `doc_blocks` + `use_cases`(123) + `pipelines`(8), Qdrant `dsp_gpu_rag_v1` | ✅ stable | sparse BM25 не подключён к doc_blocks (Finding #1 ещё открыт) |
| **КФП-таблица (`test_params`)** | таблица создана, **записей 0** | 🔴 **критичный gap** | без неё AI-тесты генерируются «вслепую». Детали → `RAG_kfp_design_2026-05-08.md` |
| **Tools агента** | `dsp_find`, `dsp_search`, `dsp_show_symbol`, `read_file` | ⚠️ узкий | нет `dsp_graph_neighbors`, `dsp_use_case`, `dsp_pipeline`, `dsp_test_params`, `dsp_inheritance` |
| **Граф знаний** | includes(3395) + pybind(42) + cmake(31) | ⚠️ частично | нет inheritance, нет calls (clangd на Debian, Phase B+), нет «who_uses_X» BFS |
| **Eval-harness** | `runner.py`+`retrieval_metrics.py` (3 режима hybrid/dense/sparse), `golden_set/qa_v1.jsonl` 50 typed запросов, 8+ history reports | ✅ работает | нет RAGAs LLM-judge (faithfulness/answer_relevance), нет CI на merge |
| **LLM ↔ RAG связь** | через MCP/HTTP `dsp-asst` | ⚠️ односторонняя | LLM получает контекст, но **не возвращает фидбэк** в БД (нет `rag_logs.user_correction` потока) |

**Вердикт:** базовая RAG-инфраструктура готова на ~75%, рычаги для качественного LLM:
1. **КФП-таблица** заполнена → AI знает границы → тесты осмысленные.
2. **Иерархический контекст** (use_case → method → @test → constraints + соседи в графе) собирается одним вызовом, а не пятью search'ами.
3. **CRAG-loop / Self-RAG** — LLM сама проверяет качество retrieval'а и переформулирует запрос.
4. **Code-specific embeddings** (Nomic Embed Code) — точечно для код-блоков.
5. **Eval-цикл расширен** + telemetry — измеряем эффект каждого изменения.

---

## 1bis. Утверждённые решения (Alex ↔ Кодо 2026-05-08)

| # | Вопрос | Решение |
|---|--------|---------|
| 1 | Где `test_params` MD-карточки | ✅ `<repo>/.rag/test_params/` (как в spec 09 — ближе к коду) |
| 2 | Сколько репо до 12.05 | ✅ **Все 9 репо**. LEVEL 0 (auto) + LEVEL 1 (AI) — все, LEVEL 2 (ручная правка) — ~20 ключевых классов до 12.05 |
| 3 | HyDE on/opt-in | ✅ **Hybrid: `mode={fast,smart}` по умолчанию `smart` с auto-classifier** — regex-фильтр на имена → fast (без HyDE), иначе → HyDE |
| 4 | Code-specific embeddings когда | ✅ **Сейчас** (Nomic-Embed-Code в CONTEXT-FUEL C8) + Late Chunking для BGE-M3 (C9) |
| 5 | CRAG-loop где | ✅ **Внутри dsp-asst** — единая точка истины для команды >10 человек, любая IDE/CLI/agent получает CRAG из коробки |
| 6 | Telemetry когда | ✅ **Сейчас** — hook в `TestRunner::OnTestComplete()` (CONTEXT-FUEL C10) |
| 7 | EVAL до 12.05 | ✅ **RAGAs LLM-judge поверх существующего runner + CI-workflow** |
| 8 | GRAPH до 12.05 | ✅ Перенесён в 10-11.05 — Phase B стартует с базовым графом (без call-graph — он Phase B+ на Debian) |
| 9 | Tools архитектура | ✅ **X основной (7 малых параллельных tools) + Y как cache-layer (`dsp_context_pack` оркестрирует и кэширует)** |
| 10 | Связка RAG ↔ QLoRA | ✅ **Раздельные цели:** RAG = inference-time; расширение датасета QLoRA = отдельный handoff |
| 11 | Время | ✅ **«Делаем по максимуму, сколько успеем до 12.05»** — без жёсткой 38ч-таблицы |

---

## 2. Что такое «КФП» в DSP-GPU (терминология)

**КФП = Конфигурация Функциональных Параметров** = таблица `rag_dsp.test_params` + JSON-файлы в `test_params/` + doxygen-теги `@test/@test_field/@test_ref/@test_check` в `.hpp`.

Это **доменное знание о коде, которое нельзя извлечь грепом**:
- допустимый диапазон параметра (`fft_size ∈ [1..1300000]`),
- типичные значения (`fft_size ∈ [256, 1024, 4096]`),
- паттерн (`power_of_2`, `prime`, `gpu_pointer`),
- единица (`Гц`, `доля VRAM`, `complex samples`),
- зависимости (`data.size() == beam_count * n_point`),
- что бросает (`throws on n_point=0`),
- что проверять в результате (`result[0].magnitudes.size() == nextPow2(n_point) * repeat_count`).

**Три представления одних и тех же знаний** (так задумано в spec 09):
1. **Doxygen `@test*`** в `.hpp` — источник правды (правит программист).
2. **MD-карточка** в `<repo>/.rag/test_params/<ns>_<class>.md` — для AI-генератора тестов и для поиска.
3. **JSON в `test_params/`** + строки в БД — для CLI/API/sync.

**Зачем это критично для LLM на 9070:**
> Без `test_params` AI на запрос «сгенерируй smoke-тест для `FFTProcessorROCm::ProcessComplex`» возвращает заведомо неправильные значения (`fft_size = 100` вместо `power_of_2`), потому что **в коде эти знания не маркированы**. С `test_params` промпт получает блок:
> ```
> @param data: size=[100..1300000], typical=6000, edge=[0,1], unit="complex samples"
> @param params.n_point: power_of_2, throws on 0
> @return: result[0].magnitudes.size() == nextPow2(n_point) * repeat_count
> ```
> и AI генерит **рабочий** тест.

---

## 3. Текущее состояние — что есть, что заявлено, что не сделано

### 3.1 Таблицы БД (по `dsp_health`)

```
schema: rag_dsp
tables: ai_stubs, cmake_targets, deps, doc_blocks, embeddings, enum_values,
        files, includes, pipelines, pybind_bindings, rag_logs, symbols,
        test_params, use_cases
embeddings_count: 5432
```

| Таблица | Создана? | Заполнена? | Главный gap |
|---------|----------|-----------|-------------|
| `symbols` | ✅ | ✅ ~6172 | — |
| `files`, `includes`, `enum_values`, `cmake_targets` | ✅ | ✅ | — |
| `embeddings` (pgvector) | ✅ | ✅ 5432 | один вектор / символ → короткий контекст |
| `pybind_bindings` | ✅ | ✅ 42 (25/31 cpp_symbol_id связано) | 6 биндингов без cpp_symbol_id |
| `doc_blocks` (RAG v3) | ✅ | ✅ ~570 | концептов 30+, но `tests`/`benchmark` почти пустые |
| `use_cases` | ✅ | ✅ 123 (76 cpp + 47 python) | мало синонимов EN, low coverage `radar`/`heterodyne` |
| `pipelines` | ✅ | ✅ 8 (3 cpp + 5 cross-repo) | мало (целевая 15-20) |
| `ai_stubs` | ✅ | ⚠️ частично | placeholder'ы из 011/012/013 промптов не зафиксированы |
| **`test_params`** | ✅ | 🔴 **0 записей** | **главный блокер качественной AI-генерации тестов** |
| `rag_logs` | ✅ | ⚠️ есть | `user_rating`/`user_correction` пишутся редко → SFT-корпус не растёт |

### 3.2 Что сделано из roadmap 13

**Сделано:** RAG-таблицы (schema), hybrid retrieval (dense+tsvector+RRF), bge-reranker-v2-m3, indexer cpp+py (tree-sitter), `agent_doxytags` (analyzer/extractor/heuristics/patcher/walker), eval-harness (runner+metrics+50 golden).

**Не сделано:** ~15 задач из roadmap-spec 13 — конкретный actionable список со статусами, зависимостями и DoD → `MemoryBank/tasks/TASK_RAG_context_fuel_2026-05-08.md`. Этот документ описывает **архитектуру и приоритеты**, TASK — **что и как делать**.

---

## 4. КФП-таблица — design вынесен

> **Полный design** (схема, 3 уровня заполнения LEVEL 0/1/2, 5 направлений расширения, диаграмма связей) → **`RAG_kfp_design_2026-05-08.md`**.

**Краткое резюме почему это критично для Phase B:**
- `test_params` — единственное место где живут «знания о коде, которые **нельзя извлечь грепом**»: edge_values, throws_on, constraints, return_checks.
- Без неё AI генерирует тесты с заведомо неправильными значениями (`fft_size = 100` вместо `power_of_2`).
- 3 представления одних знаний: `@test*` теги в .hpp (источник правды), MD-карточки в `<repo>/.rag/test_params/`, БД + JSON.
- 3 уровня заполнения: LEVEL 0 (auto, confidence=0.5) → LEVEL 1 (AI heuristics, 0.8) → LEVEL 2 (программист, 1.0).
- 🔴 P0 на 12.05: запустить LEVEL 0 на 9 репо + LEVEL 2 на ~20 ключевых классах (FFTProcessorROCm, ScopedHipEvent, ProfilingFacade, CaponProcessor, …).

---

## 5. RAG pipeline — gaps и улучшения 2026

### 5.1 Sparse поверх RAG-таблиц (Finding #1, 2026-05-06 — до сих пор открыт)

**Сегодня:** sparse работает на `symbols` (через tsvector), **не работает** на `doc_blocks/use_cases/pipelines`. Поэтому FFT use-case не пробивается в top-5 даже после re-embed + typed (см. `_eval_rerank_2026-05-06.md`).

**Что сделать:**
- В `rag_dsp.doc_blocks/use_cases/pipelines` добавить `tsvector` + GIN-индекс (по аналогии с `symbols`).
- В `dsp_assistant/retrieval/rag_hybrid.py` добавить sparse-stage **до** rerank'а: `dense top 200 ⊕ sparse top 50 → RRF (k=60) → rerank → top 5`.
- Ожидаемый эффект (по analogии с symbols): R@5 0.60 → ≥0.78.

### 5.2 HyDE для семантических вопросов (Spec 13 §3.9)

**Сегодня:** запрос «как профилировать ядро» не даёт `ScopedHipEvent` в top-5, потому что эмбеддинг короткого вопроса далёк от doxygen-абзаца.

**Что сделать:**
- `prompts/014_hyde_dsp.md` — заставляет Qwen3 написать гипотетический doxygen-абзац на запрос (3-4 предложения с проектным жаргоном: hipFFT, ROCm, beam, n_point, GpuContext, BufferSet, Op, Facade).
- Эмбеддить **гипотезу**, а не оригинальный запрос → искать.
- Кэш гипотез на 5 мин (в `rag_logs` или Redis).
- Опция `--no-hyde` для baseline-замера.
- Ожидаемый эффект: +5-15% R@5 на семантических.

### 5.3 CRAG-loop / Self-RAG — adaptive retrieval

**Идея 2026 (Self-RAG, CRAG, Adaptive-RAG):** LLM сама оценивает качество retrieval'а и при низкой confidence делает **корректирующий цикл**:
1. retrieval → если top-1 score < threshold → переформулировать запрос → retrieval повторно;
2. итераций ≤ 5;
3. на финальной итерации generation.

**Для DSP-GPU:**
- threshold по rerank-score (0.6) + по семантической дистанции к use-case (если найденный класс не входит в `linked_use_cases` — флаг «doubt»).
- query-rewriter промпт: «запрос вернул классы X,Y,Z но они не похожи на ответ. Переформулируй запрос на C++ DSP-сленге».
- логировать каждую итерацию в `rag_logs.retrieval_iterations` (новая колонка JSONB).

### 5.4 Late Chunking для длинных файлов

**Сегодня:** один символ = один эмбеддинг. Класс на 200 строк → один вектор 1024d → теряется внутренняя структура (e.g. ProcessComplex vs ProcessReal).

**Late Chunking (Jina 2024)** — встраиваемся в long-context модель (8192), ставим chunk-границы **после** прохода трансформера, mean-pool по чанку. Каждый чанк имеет контекст всего файла.

**Применение:**
- `core/spectrum/fft_processor_rocm.hpp` (~600 строк) → 6 чанков, каждый «знает» что вокруг.
- Embedder: либо BGE-M3 (8192 ctx) с pooling-патчем, либо Jina-v3 (нативно).
- Эффект: метод `ProcessReal` находится по запросу «реальный FFT» точнее, потому что его embedding включает контекст «класс — обёртка hipFFT».

### 5.5 ColBERT-style late interaction в стадии rerank (опц.)

**Сегодня:** rerank через bge-reranker-v2-m3 (cross-encoder, ~278M, 130ms на 16 пар).

**ColBERTv2** — token-level MaxSim, 180× быстрее cross-encoder при k=10. Нативно лучше для кода (token-level важнее).

**Когда брать:** если выходим на >50 RPS или хотим качество ColBERT при низкой latency. **Не приоритет** на Stage 1 (одна машина дома). Поставить в `.future/`.

### 5.6 Code-specific embeddings (Nomic Embed Code / Voyage-code-3 / Jina-code)

**Сегодня:** BGE-M3 — общий, MTEB ~71. На код уступает специализированным.

| Модель | Open? | Размерность | MTEB code | Локально? |
|--------|-------|-------------|-----------|-----------|
| BGE-M3 (наш) | ✅ | 1024 | ~71 | ✅ fp16 на CUDA/CPU |
| nomic-ai/CodeRankEmbed | ✅ | 768 | ~78 | ✅ |
| jinaai/jina-embeddings-v2-base-code | ✅ | 768 | ~76 | ✅ |
| voyage-code-3 | ❌ SaaS | 256-2048 | **84** (+13.8% vs BGE) | ❌ |

**Рекомендация:** не выбрасывать BGE-M3 (универсальный для русских запросов и markdown), но **добавить вторую коллекцию `embeddings_code`** на nomic-embed-code для cpp/hpp/py/hip-чанков. Гибридный score: `0.6*BGE + 0.4*Nomic` на финальном RRF.

### 5.7 Tools агента — расширение с 4 до 9

| Tool | Что | Когда вызывать |
|------|-----|----------------|
| `dsp_find` (✅) | substring + trgm | пользователь явно назвал имя |
| `dsp_search` (✅) | hybrid + rerank | семантический вопрос |
| `dsp_show_symbol` (✅) | детали | drill-down |
| `read_file` (✅) | читать файл | drill-down |
| **`dsp_graph_neighbors`** (NEW) | BFS по includes/inheritance/calls/pybind | «что использует X», «от чего наследуется X» |
| **`dsp_use_case`** (NEW) | поиск по use_cases | «как сделать Y» |
| **`dsp_pipeline`** (NEW) | поиск по pipelines | «pipeline для Z», «strategy chain X→Y→Z» |
| **`dsp_test_params`** (NEW) | возврат КФП по классу/методу | «нормальные значения для X», «что бросает X» |
| **`dsp_inheritance`** (NEW) | parents+children | «какие реализации IBackend» |
| **`dsp_repo_overview`** (NEW, см. spec 09 §12) | без args — список репо; с args — `_RAG.md` репо | старт сессии агента |

**Вызов нескольких tools параллельно** (агентский паттерн 2026): когда LLM получает запрос «сделай тест для FFTProcessorROCm», вызывает **одновременно** `dsp_show_symbol(FFTProcessorROCm)` + `dsp_test_params(FFTProcessorROCm)` + `dsp_use_case(FFT batch)` + `dsp_graph_neighbors(FFTProcessorROCm, depth=1)` → собирает плотный контекст в один проход.

---

## 6. Граф знаний — расширение

Сегодня `deps` ≈ 30k рёбер задокументировано в spec 03 §2.4 (kind: 18 видов), но реально заполнено только: includes (~3395), pybind (~42), cmake_link (~31). Остальные `inherits/calls/uses_type/throws/...` — пусто.

### 6.1 Quick-wins (2-3 ч кода)

1. **Inheritance** через tree-sitter `: public Base` → таблица `deps(kind=inherits)`. Tool `dsp_inheritance(fqn)`.
2. **`uses_type`** — когда метод принимает/возвращает `T&`, `T*` → ребро `parameter`/`returns` в `deps`. Через extractor.
3. **`throws`** — `@throws` в doxygen + `throw std::X(...)` в `.cpp` → ребро `throws_in`.
4. **`raii_for`** — class пары через `~ClassA() { hipEventDestroy(event_); }` → автодетект (для `ScopedHipEvent` + `std::lock_guard`-like).

### 6.2 Полноценный call-graph (отложено до Debian)

clangd LSP на Debian → JSON dump → парсер заполняет `deps(kind=calls)`. Это даёт **вопросы вида** «что вызывает `ProfilingFacade::Record()`» и «что вызывает `hipFFT_C2C`».

### 6.3 GraphRAG-traversal паттерны

Без community-detection (наш граф мал, 30k рёбер — тривиально для BFS):

| Паттерн | Реализация | Запрос пользователя |
|---------|-----------|---------------------|
| **«who_uses_X»** | BFS по `kind ∈ {calls, parameter, uses_type}`, depth=2 | «где используется ScopedHipEvent» |
| **«inheritance_tree»** | parents + children через `kind=inherits` | «какие наследники IBackend» |
| **«python_for_cpp»** | join `pybind_bindings` + `symbols` | «как из Python вызвать FFTProcessorROCm» |
| **«dependency_chain»** | path `A → B → C` через `kind=calls` или `kind=includes` | «цепочка зависимостей до hipFFT» |
| **«personalized_pagerank»** (опц., HippoRAG) | взвешенный PR с инициализацией от запроса | «верни 10 ключевых классов для запроса X» |

**LightRAG dual-level retrieval** — high-level (концепты, репо, pipeline'ы) + low-level (конкретные классы, методы). Для нас: первый уровень = `pipelines/use_cases`, второй = `symbols/test_params`.

---

## 7. Главный фокус — плотная связка LLM ↔ RAG

> **3 цели Alex:** (1) **правдивый ответ без галлюцинаций**, (2) **надёжность**, (3) **производительность**.
>
> **Архитектура (X основной + Y cache-layer):**
> - **X (atomic tools — 7 малых)** = `dsp_find/search/show_symbol/test_params/use_case/pipeline/graph_neighbors/inheritance`. LLM сама вызывает параллельно те, что нужны. → **надёжность** (atomic = можно отлаживать каждый), **галлюцинации меньше** (LLM видит факты по отдельности, не «склеенный JSON»).
> - **Y (orchestrator — `dsp_context_pack`)** = ВНУТРИ зовёт нужные tools параллельно (вариант X) **и кэширует результат по `(query_hash, intent)`** на 5 мин. Default: минимальный набор (`primary_symbol` + `test_params`). Расширение через `include=[...]`. → **производительность** (cache hit = одна БД-роль вместо 7), **правдивость** (LLM получает только запрошенные поля, контекст-окно не загромождено).
>
> Один и тот же `dsp_context_pack` обеспечивает все три цели — это **не противоречие, а слой**.

### 7.1 Concept: **Context Pack**

Для запроса «сгенерируй smoke-тест для FFTProcessorROCm::ProcessComplex»:

```jsonc
// dsp_context_pack(query, intent="generate_test", include=["test_params","use_case","siblings"])
{
  "intent": "generate_test",
  "primary_symbol": { /* dsp_show_symbol — всегда */ },
  "test_params": [ /* dsp_test_params — opt-in */ ],
  "use_case": { /* dsp_use_case — opt-in */ },
  "siblings": [ /* dsp_graph_neighbors depth=1 — opt-in */ ],
  "pybind": { /* python биндинг если есть, opt-in */ },
  "examples": [ /* топ-2 examples/cpp/* и tests/test_*.hpp, opt-in */ ],
  "templates": {                                  // opt-in (default off — большие)
    "test_skeleton": "...gpu_test_utils::TestRunner snippet...",
    "validators": "...RelativeValidator/RmseValidator..."
  }
}
```

`include` управляется LLM или промптом — не загромождаем контекст-окно полями которые не нужны для конкретного intent. Default: `["primary_symbol", "test_params"]`. Промпт-шаблон `prompts/003_test_cpp_functional.md` (уже есть) использует этот пакет.

### 7.2 Многоуровневый промпт-шаблон

```
SYSTEM: Ты — генератор C++ тестов DSP-GPU. Стиль gpu_test_utils::TestRunner.
USER:    Сгенерируй smoke-тест для {symbol_fqn}.

CONTEXT (auto):
  ## Класс
  {primary_symbol.doxy_full + signature}

  ## КФП (источник правды)
  {test_params formatted as @test bullet-list}

  ## Use-case
  {use_case.body 10-15 строк}

  ## Что вокруг (соседи)
  - inherits: {parents}
  - uses: {siblings_uses}
  - is_used_by: {who_uses_me top 3}

  ## Шаблон
  {test_skeleton}

ASSISTANT: <генерация>
```

### 7.3 Feedback-loop в `rag_logs`

Сегодня `rag_logs` имеет `user_rating` и `user_correction` колонки, но **не используются** (никто не пишет фидбэк).

**Что сделать:**
- В CLI `dsp-asst test gen X` после генерации спрашивать: `[A]ccept / [E]dit / [R]eject`. Запись в `rag_logs.user_rating`.
- Если `R` — попросить причину → `user_correction`.
- Накапливаем 100-500 пар `(query, retrieved_chunks, llm_response, correction)` → SFT-корпус для следующего fine-tune (Phase C, после 9070).

Это замыкает цикл: LLM учится на ошибках своих собственных RAG-генераций. (Принцип Self-RAG / DPO-on-RAG из 2026.)

### 7.4 MCP — двусторонний канал

Сейчас MCP-сервер `dsp-asst` отдаёт 5 tools для Continue/VSCode. **Что добавить:**
- **Resource endpoint** `dsp://test_params/{class}` — IDE может подсветить параметры в `.hpp` прямо границами из БД.
- **Prompt endpoint** `dsp:prompt:003_test` — IDE автоматически подгружает наш шаблон при `/test` команде.
- **Notification** `dsp_logs_query_done` — после генерации LLM в Continue MCP пишет в `rag_logs` факт прогона.

Это превращает RAG из «search-tool» в **полноценную живую базу знаний DSP-GPU**, к которой подключены и AI-агент, и IDE, и pre-commit hook'и, и тесты.

---

## 8. Eval & telemetry — расширяем существующее

### 8.1 Golden-set: уже есть v1, расширяем до v2

**Сегодня (✅ работает):**
- `golden_set/qa_v1.jsonl` — **50 typed запросов**: `category ∈ {exact_name, semantic_ru, semantic_en}`, `lang ∈ {ru, en}`.
- `dsp_assistant/eval/runner.py` (171 строк) — 3 режима `hybrid/dense/sparse`.
- `dsp_assistant/eval/retrieval_metrics.py` — recall@k, MRR, hit-rate.
- `golden_set/eval_reports/` — **8+ накопленных run'ов** с 2026-05-01.

**Что расширить (E1, ~1.5ч):**
- v1 (50) → **v2 (100)**, типизировать по **intent**: `find_class`, `how_to`, `test_gen`, `pipeline`, `python_binding`, `migrate`, `debug`.
- Поле `intent` в записи + поддержка фильтрации в runner.
- Версионируется в `MemoryBank/specs/LLM_and_RAG/golden_set/qa_v2.jsonl`.

### 8.2 RAGAs (LLM-judge метрики)

**Что добавить поверх существующего runner (E2, ~1ч):**
- **faithfulness** — ответ AI основан на retrieved chunks?
- **answer_relevance** — ответ отвечает на вопрос?
- **context_precision** — retrieved chunks релевантны?
- **context_recall** — все нужные chunks нашлись?
- Раз в неделю на 100 golden-запросах + на каждый merge в CI.

### 8.3 Telemetry-driven boost

Таблица `usage_stats(symbol_id, calls_total, last_called, avg_latency_ms, error_rate)` заполняется при прогоне `gpu_test_utils::TestRunner`. В retrieval-этапе:
```
score_final = score_rerank * (1 + 0.1*log1p(calls_total))
```
Живые классы выходят впереди dead-кода. Без этого RAG ранжирует одинаково и `FFTProcessorROCm` (вызывается 1000 раз) и `LegacyFFTV1` (никогда).

---

## 9. Концепт «embedding upgrade» — выбор

| Опция | Effort | Эффект | Риск |
|-------|--------|--------|------|
| **A. Late Chunking** на BGE-M3 | 2 ч (pooling-патч) | +5-10% R@5 на длинных классах | низкий |
| **B. Вторая коллекция Nomic-Embed-Code** | 3 ч + 30 мин re-embed | +5-15% на cpp/hip запросах | средний (диск +30 MB) |
| **C. Voyage-code-3 SaaS** | 1 ч + платно | +13-15% (по бенчмарку) | внешний API, latency, $ |
| **D. ничего не менять** | 0 | 0 | — |

**Рекомендую A → B**, в таком порядке. Late Chunking даёт быстрый win на одном эмбеддере. Nomic — следующий шаг, чтобы код-запросы не упирались в общий BGE.

---

## 10. Roadmap до Phase B QLoRA (12.05) и после

> **Принцип:** «Делаем по максимуму, сколько успеем до 12.05» (Alex 08.05). Без жёсткого таймбюджета — приоритет важнее времени. Конкретные actionable задачи + миграция include'ов → `MemoryBank/tasks/TASK_RAG_context_fuel_2026-05-08.md`.

### Этап **«CONTEXT-FUEL»** — критичен для качества Phase B

| # | Задача | Effort | Зачем для LLM |
|---|--------|--------|---------------|
| **C1a** | CLI `dsp-asst params extract` (extractor через tree-sitter cpp + regex `throw`/`if`/`assert` + запись `test_params` confidence=0.5) | 1.5 ч | written tool для LEVEL 0 |
| **C1b** | Прогон C1a по 9 репо + ручная верификация ~20 ключевых классов (FFTProcessorROCm, ScopedHipEvent, ProfilingFacade, CaponProcessor, …) → confidence=1.0 | 3 ч | заполнить `test_params` 0 → ~327 LEVEL 0 + ~20 LEVEL 2 |
| C2 | Doxygen `@test*` парсер + интеграция в indexer + LEVEL 1 AI heuristics | 3 ч | связать `test_params` с doxygen в .hpp |
| C3 | Sparse BM25 (tsvector + GIN) на doc_blocks/use_cases/pipelines | 1.5 ч | закрыть Finding #1 (FFT use-case → top-5) |
| C4 | HyDE: prompt 014_hyde_dsp.md + auto-classifier (`mode=smart` по умолчанию, regex-фильтр на имена → fast) + опция MCP | 2 ч | +5-15% R@5 на семантических |
| C5 | Tool `dsp_test_params(class, method=None)` в MCP | 30 мин | ключевой tool для AI-генератора тестов |
| C6 | Tools `dsp_use_case(query)` + `dsp_pipeline(name)` | 1 ч | плотный контекст для LLM |
| C7 | Tool `dsp_context_pack(query, intent, include=[...])` — orchestrator с cache 5 мин | 2 ч | one-call с opt-in полями (см. §7) |
| C8 | **Nomic-Embed-Code** коллекция в pgvector + гибрид BGE+Nomic в `rag_hybrid.py` | 5-6 ч | code-specific эмбеддинги, +5-15% на cpp/hip |
| C9 | **Late Chunking** patch для BGE-M3 (pooling после трансформера, 8192 ctx) | 2 ч | +5-10% R@5 на длинных классах |
| C10 | Telemetry hook `gpu_test_utils::TestRunner::OnTestComplete()` → `usage_stats` + `popularity_boost` в retrieval | 1 ч | живые классы выше dead-кода |

**DoD CONTEXT-FUEL:**
- [ ] `test_params` ≥ 200 записей (LEVEL 0+1)
- [ ] sparse в hybrid даёт R@5 ≥ 0.78 на golden-set v2
- [ ] `dsp_context_pack` отвечает <500ms p99 (с cache hit <50ms)
- [ ] HyDE даёт +5-15% R@5 на semantic_ru/en запросах

### Этап **«GRAPH»** — базовый граф до 12.05, call-graph после

| # | Задача | Effort |
|---|--------|--------|
| G1 | Inheritance tree (tree-sitter `: public Base` parsing + `deps(kind=inherits)` + миграция) | 1.5 ч |
| G2 | `uses_type` / `throws` / `parameter` / `returns` через extractor | 2 ч |
| G3 | Tool `dsp_graph_neighbors(symbol, depth, edge_types)` BFS | 2 ч |
| G4 | Tool `dsp_inheritance(fqn)` parents+children | 30 мин |
| G5 | LightRAG-style dual-level retrieval (high-level: pipelines+use_cases; low-level: symbols+test_params) | 3 ч |

> **G-calls (clangd LSP-based call-graph) = Phase B+, выполняется на Debian после 12.05.** На Windows clangd для DSP-GPU работает плохо. Без него `dsp_graph_neighbors` всё равно работает через `includes` + `inherits` + `uses_type` + `parameter`.

**DoD GRAPH:**
- [ ] `dsp_inheritance(IBackend)` возвращает ≥ 3 наследников
- [ ] `dsp_graph_neighbors` BFS depth=2 работает <300ms
- [ ] LightRAG dual-level `dsp_search(level="high")` приоритизирует pipelines+use_cases

### Этап **«EVAL»** — расширяем существующее (runner+metrics уже работают)

| # | Задача | Effort |
|---|--------|--------|
| E1 | Golden-set v1 (50 ✅) → **v2 (100)** + поле `intent ∈ {find_class, how_to, test_gen, pipeline, python_binding, migrate, debug}` + фильтрация в runner | 1.5 ч |
| E2 | RAGAs harness — 4 LLM-judge метрики (faithfulness, answer_relevance, context_precision, context_recall) поверх существующего runner.py + CLI `dsp-asst eval run --ragas` | 1 ч |
| E3 | CI workflow `.github/workflows/rag_eval.yml` — docker-compose с Postgres+Qdrant, прогон eval на каждом push/merge, PR-комментарий с дельтой метрик | 1.5 ч |
| E4 | Pre-commit hook `_RAG.md` старения (warn если файл репо изменился, а `.rag/_RAG.md` старше 10 дней) | 30 мин |

**DoD EVAL:**
- [ ] CI прогоняет 100 запросов на push, PR-комментарий с дельтой metrics
- [ ] RAGAs faithfulness ≥ 0.7, context_precision ≥ 0.7
- [ ] eval-history доступна в `golden_set/eval_reports/` за ≥ 5 коммитов

12.05.26 — Phase B QLoRA на 9070 стартует на готовой RAG-базе (что успели — то стало baseline; Phase B параллельно копит телеметрию).

### Этап **«AGENTIC RAG»** — после Phase C QLoRA

| # | Задача | Effort |
|---|--------|--------|
| A1 | CRAG-loop (relevance evaluator + corrective rewrite) — **внутри dsp-asst** через `dsp_search(mode="agentic")` | 3 ч |
| A2 | Self-RAG reflection tokens (опционально, в нашем DSL для Qwen3-8B fine-tuned) | 2 ч |
| A3 | Feedback-loop CLI `[A]ccept/[E]dit/[R]eject` + `rag_logs` накопитель | 2 ч |
| A4 | SFT-корпус из `rag_logs.user_correction` для Phase C QLoRA | 2 ч |

---

## 11. Что я НЕ предлагаю (даже при «всё по максимуму»)

- **GraphRAG community-detection (Microsoft)** — overkill для 30k рёбер. Простой BFS закрывает 95% задач.
- **HippoRAG personalized PageRank** — даст +1-2% при сложности 3 дня. После Phase C, не сейчас.
- **Voyage-code-3** — SaaS, $, внешняя зависимость. Nomic-Embed-Code (open-source) даст 80% эффекта бесплатно. Возвращаемся к Voyage только если Nomic + Late Chunking не закроют gap.
- **Полноценный agentic ReAct с 10+ tools и AutoGPT-style loops** — латентность взлетит, отладка кошмар. Лучше 1 умный `dsp_context_pack` tool + CRAG-loop в `dsp_search`.

---

## 12. Источники (web-research, 2026)

### Hybrid retrieval & rerank
- [Production RAG that works: Hybrid + ColBERT + SPLADE + e5/BGE](https://machine-mind-ml.medium.com/production-rag-that-works-hybrid-search-re-ranking-colbert-splade-e5-bge-624e9703fa2b)
- [Sparse vs Dense vs Hybrid RRF (Robert Dennyson)](https://medium.com/@robertdennyson/dense-vs-sparse-vs-hybrid-rrf-which-rag-technique-actually-works-1228c0ae3f69)
- [Graph-Augmented Hybrid Retrieval and Multi-Stage Re-ranking](https://dev.to/lucash_ribeiro_dev/graph-augmented-hybrid-retrieval-and-multi-stage-re-ranking-a-framework-for-high-fidelity-chunk-retrieval-in-rag-systems-50ca)
- [BGE-Reranker-v2 cross-encoder benchmarks 2026](https://markaicode.com/bge-reranker-cross-encoder-reranking-rag/)
- [ColBERT and Friends: Re-ranking that feels instant](https://medium.com/@2nick2patel2/colbert-and-friends-re-ranking-that-feels-instant-6c09102b7526)

### Late Chunking (Jina)
- [Late Chunking in Long-Context Embedding Models (Jina blog)](https://jina.ai/news/late-chunking-in-long-context-embedding-models/)
- [arXiv 2409.04701 — Late Chunking](https://arxiv.org/abs/2409.04701)
- [Late chunking GitHub repo](https://github.com/jina-ai/late-chunking)

### GraphRAG / LightRAG / HippoRAG
- [Awesome-GraphRAG (DEEP-PolyU)](https://github.com/DEEP-PolyU/Awesome-GraphRAG)
- [Graph RAG in 2026 — Practitioner's Guide (Shereshevsky)](https://medium.com/graph-praxis/graph-rag-in-2026-a-practitioners-guide-to-what-actually-works-dca4962e7517)
- [LightRAG (HKUDS, EMNLP'25)](https://github.com/hkuds/lightrag)
- [GraphRAG vs HippoRAG vs PathRAG vs OG-RAG](https://medium.com/graph-praxis/graphrag-vs-hipporag-vs-pathrag-vs-og-rag-choosing-the-right-architecture-for-your-knowledge-graph-a4745e8b125f)
- [When to use Graphs in RAG (arXiv 2506.05690)](https://arxiv.org/html/2506.05690v3)

### Code embeddings
- [voyage-code-3 (Voyage AI blog)](https://blog.voyageai.com/2024/12/04/voyage-code-3/)
- [Nomic Embed Code — Hugging Face](https://huggingface.co/nomic-ai/CodeRankEmbed)
- [Nomic Embed Code: SOTA Code Retriever](https://www.nomic.ai/news/introducing-state-of-the-art-nomic-embed-code)
- [6 Best Code Embedding Models Compared (Modal)](https://modal.com/blog/6-best-code-embedding-models-compared)
- [Best Embedding Models 2026: MTEB benchmarks](https://pecollective.com/tools/best-embedding-models/)

### Agentic RAG & CRAG / Self-RAG
- [Agentic RAG: 2026 Production Guide (MarsDevs)](https://www.marsdevs.com/guides/agentic-rag-2026-guide)
- [Agentic-RAG Survey (asinghcsu)](https://github.com/asinghcsu/AgenticRAG-Survey)
- [Agentic RAG Survey — arXiv 2501.09136v4](https://arxiv.org/html/2501.09136v4)
- [Corrective RAG (CRAG) — Kore.ai](https://www.kore.ai/blog/corrective-rag-crag)
- [Next-Generation Agentic RAG with LangGraph (2026)](https://medium.com/@vinodkrane/next-generation-agentic-rag-with-langgraph-2026-edition-d1c4c068d2b8)

### Eval (RAGAs)
- [RAGAs metrics list (docs)](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/)
- [RAG Evaluation 2026 (Premai blog)](https://blog.premai.io/rag-evaluation-metrics-frameworks-testing-2026/)
- [How to Evaluate Your RAG System (kuldeep_paul, dev.to)](https://dev.to/kuldeep_paul/how-to-evaluate-your-rag-system-a-complete-guide-to-metrics-methods-and-best-practices-18ne)

---

*Конец deep analysis v1.1 (план финализирован 2026-05-08 после диалога с Alex).*
*План: 38 ч за 4 дня (08-11.05) — CONTEXT-FUEL + GRAPH + EVAL до Phase B QLoRA 12.05.26.*
*Maintained by: Кодо. Дата: 2026-05-08.*
