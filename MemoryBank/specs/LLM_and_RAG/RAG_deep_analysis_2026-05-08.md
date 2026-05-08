# Deep Analysis: LLM ↔ RAG в DSP-GPU — что улучшить (2026-05-08)

> **Что:** глубокий ревью текущего RAG-стека DSP-GPU с акцентом на **тесную работу LLM с RAG** (контекст для AI-генерации тестов, doxygen-тегов, кода).
> **Зачем:** Phase A QLoRA на 2080 Ti показал — bottleneck НЕ в LoRA capacity, а в данных. Чтобы LLM на 9070 (Phase B 12.05) выдавала качество, ей нужен **плотный, типизированный, иерархический RAG-контекст**, а не просто похожие doxygen-блоки.
> **Источники анализа:** spec'и 03/09/12/13, схема БД, `dsp_health`, ревью 2026-05-05, eval rerank 2026-05-06, web-research 2026 (LightRAG, ColBERT, CRAG, Late Chunking, voyage-code-3, nomic-embed-code, RAGAs).
> **Скоп:** только LLM+RAG. Bug-fixes, build, миграции — отдельно.

---

## 1. TL;DR (1 минута)

| Слой | Сегодня (2026-05-08) | Зрелость | Главный gap |
|------|---------------------|----------|-------------|
| **Indexer** | tree-sitter cpp+py, 6172 cpp-символа, 5432 эмбеддинга | ✅ stable | нет inheritance, нет `@test*` парсера, нет examples |
| **Embeddings** | BGE-M3 fp16, vector(1024) в pgvector | ✅ stable | общий (не код-специфичный); chunking «один символ = один вектор» (часто короткий контекст) |
| **Retrieval (symbols)** | dense + tsvector + RRF + bge-reranker-v2-m3, R@5=0.88 | ✅ stable | нет HyDE, нет MMR, нет CRAG-loop; KIND_BOOST статичен |
| **RAG-таблицы** | `doc_blocks` + `use_cases`(123) + `pipelines`(8), Qdrant `dsp_gpu_rag_v1` | ✅ stable | sparse BM25 не подключён к doc_blocks (Finding #1 ещё открыт) |
| **КФП-таблица (`test_params`)** | таблица создана, **записей 0** | 🔴 **критичный gap** | без неё AI-тесты генерируются «вслепую» — нет границ, нет throws, нет typical |
| **Tools агента** | `dsp_find`, `dsp_search`, `dsp_show_symbol`, `read_file` | ⚠️ узкий | нет `dsp_graph_neighbors`, `dsp_use_case`, `dsp_pipeline`, `dsp_test_params`, `dsp_inheritance` |
| **Граф знаний** | includes(3395) + pybind(42) + cmake(31) | ⚠️ частично | нет inheritance, нет calls (clangd на Debian), нет «who_uses_X» BFS |
| **Eval-harness** | smoke-скрипт + 10 probe'ов | ⚠️ ad-hoc | нет golden-set ≥50, нет RAGAs, нет CI-замера на merge |
| **LLM ↔ RAG связь** | через MCP/HTTP `dsp-asst` | ⚠️ односторонняя | LLM получает контекст, но **не возвращает фидбэк** в БД (нет `rag_logs.user_correction` потока) |

**Вердикт:** базовая RAG-инфраструктура готова на ~75%, но **рычаги для качественного LLM**:
1. **КФП-таблица** заполнена → AI знает границы → тесты осмысленные.
2. **Иерархический контекст** (use_case → method → @test → constraints + соседи в графе) собирается одним вызовом, а не пятью search'ами.
3. **CRAG-loop / Self-RAG** — LLM сама проверяет качество retrieval'а и переформулирует запрос.
4. **Code-specific embeddings** (Nomic Embed Code) — точечно для код-блоков.
5. **Eval-цикл** + telemetry — измеряем эффект каждого изменения.

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

### 3.2 Запланировано в roadmap 13, но НЕ сделано

| # | Задача | Spec | Статус | Effort | ROI |
|---|--------|------|--------|--------|-----|
| 1 | HyDE + домен-промпт (010_hyde_dsp.md) | 13 §3.9 | ❌ нет | 1.5 ч | ★★★★★ |
| 2 | Inheritance tree (parsing + table + tool) | 13 §3.7 / Этап А1 | ❌ нет | 1 ч | ★★★★ |
| 3 | Examples индексер с boost (`kind=example`) | 13 §3.6 | ❌ нет | 30 мин | ★★★ |
| 4 | GraphRAG BFS поверх existing edges | 13 §3.8 | ❌ нет | 3 ч | ★★★★ |
| 5 | Doxygen `@test*` парсер для индексера | 13 §3.1 / 09 §5 | ❌ нет (есть в `agent_doxytags/analyzer.py`, не подключён) | 2 ч | ★★★★★ |
| 6 | CLI `dsp-asst manifest init/check/refresh/sync` | 09 §9 | ❌ нет | 2 ч | ★★★★ |
| 7 | CLI `dsp-asst doxytags fill --all/--repo/--method` | 12 | ❌ нет (`agent_doxytags/` есть, entry-point нет) | 1.5 ч | ★★★★★ |
| 8 | CLI `dsp-asst params extract/sync/edit/unverified` | test_params/README | ❌ нет | 2 ч | ★★★★★ |
| 9 | `_RAG.md` per-repo (9 репо) | 09 §3 | ❌ нет | 1 ч код + 2 ч руки | ★★★★ |
| 10 | `<repo>/.rag/test_params/*.md` | 09 §4 | ❌ нет | 1 ч на репо | ★★★★★ |
| 11 | Use-case карточки на 9 репо | 13 §3.4 | ⚠️ частично (123 в БД, не разнесены по репо) | 30 мин/репо | ★★★★ |
| 12 | Pipelines.md per composer-repo | 13 §3.5 | ⚠️ частично | 30 мин/репо | ★★★ |
| 13 | `@autoprofile` инфраструктура | 09 §7.5 | ❌ нет | 2 ч | ★★★ |
| 14 | Telemetry-driven boost (`usage_stats`) | 13 §3.11 | ❌ нет (таблицы нет) | 2 ч | ★★★ |
| 15 | Sparse BM25 на doc_blocks/use_cases/pipelines | rerank Finding #1 | ❌ нет | 1.5 ч | ★★★★★ |
| 16 | Code-specific embeddings (Nomic / Voyage / Jina) | 13 §3.11+ | ❌ нет | 3 ч | ★★★ |
| 17 | Tools агента: `dsp_graph_neighbors`, `dsp_use_case`, `dsp_pipeline`, `dsp_test_params`, `dsp_inheritance` | 13 §3.8 | ❌ нет (4 tool'а из 7-9 целевых) | 2 ч | ★★★★ |
| 18 | Pre-commit hook `_RAG.md` старения | 09 §10 | ⚠️ частично | 30 мин | ★★ |
| 19 | Weekly cron `manifest refresh` | 09 §11 | ❌ нет | 30 мин | ★★ |
| 20 | Golden-set 50-100 + RAGAs eval-harness | новый | ❌ нет | 4 ч | ★★★★★ |

**Итог:** из 20 задач roadmap'а реально сделано ~5 (RAG-таблицы, hybrid retrieval, reranker, indexer cpp+py, agent_doxytags `analyzer/extractor/heuristics/patcher`). Остальные 15 — критичны для качественного LLM-loop'а.

---

## 4. Что добавить/расширить в КФП-таблицу

### 4.1 Минимум для разблокировки AI-тестов (Phase B 12.05)

| Поле | Сейчас в schema 03 §2.8 | Что добавить | Зачем |
|------|------------------------|--------------|-------|
| `param_name`, `param_type` | ✅ | — | — |
| `edge_values` (JSONB) | ✅ — `{min, max, typical[], edge[]}` | + `step`, `formula`, `pattern` (см. spec 09 §5.2) | сейчас формат не совпадает с doxygen `@test` |
| `constraints` (JSONB) | ✅ — `{power_of_two, throws_if_zero, …}` | + `unit`, `boundary`, `depends`, `formula` | для AI важна **физическая** размерность и связи |
| `extracted_from` | ✅ — `{file, line, snippet}` | + `doxy_block_id` (FK на doc_blocks) | связать с источником в RAG |
| `human_verified`, `operator_name` | ✅ | + `verified_at`, `confidence` | track over time |
| **NEW: `return_checks` (JSONB)** | ❌ | `[{"expr": "result[0].size() == n_point", "context": "..."}]` | сегодня AI не знает что проверять в выходе |
| **NEW: `throw_checks` (JSONB)** | ❌ | `[{"on": "n_point == 0", "type": "std::invalid_argument"}]` | для negative-тестов |
| **NEW: `linked_use_cases` (TEXT[])** | ❌ | id'шники из `use_cases` | связь «параметр → use-case» |
| **NEW: `linked_pipelines` (TEXT[])** | ❌ | id'шники из `pipelines` | какие pipeline'ы используют этот параметр |
| **NEW: `embedding_text`** | ❌ | компилируется из (param_name, type, edge, constraints, return_checks) | чтобы попадать в Qdrant `target_table='test_params'` |

### 4.2 Концепция **«@test triple»** — 3 уровня заполнения

```
LEVEL 0 (auto, 100% coverage)     ← без участия Alex
  ├─ AI парсит код (if/throw/assert/clamp), пишет черновик
  └─ confidence=0.5, human_verified=false

LEVEL 1 (heuristics, ~80% coverage) ← agent_doxytags + промпт 009
  ├─ AI читает doxy_brief + связанные методы + use_cases
  └─ предлагает теги. Alex просматривает diff
  └─ confidence=0.8, partially verified

LEVEL 2 (programmer, 100% coverage) ← Alex руками или AI с правкой
  ├─ программист пишет @test в .hpp
  └─ pre-commit парсит, обновляет test_params
  └─ confidence=1.0, human_verified=true
```

Сегодня LEVEL 0/1/2 **не реализованы** — кроме базовой структуры таблицы.

### 4.3 Чем расширить КФП — 5 направлений (приоритет)

1. **🔴 P0: Заполнить хотя бы для `core` + `spectrum`** через CLI `dsp-asst params extract --repo X` + ручная правка ~20 ключевых классов. Без этого Phase B QLoRA на 9070 даст модель которая не умеет генерировать тесты с правильными границами.

2. **🟠 P1: Embeddable `test_params`** — в Qdrant как 4-я target_table (`doc_blocks` + `use_cases` + `pipelines` + **`test_params`**). Чтобы запрос «нормальные значения для FFT batch на 128 лучах» резолвился в конкретные граничные значения, а не в текст doxygen.

3. **🟠 P1: Связь с use_cases / pipelines** — поля `linked_use_cases[]`, `linked_pipelines[]` в test_params + JSONB-индексы. Tool `dsp_test_params(class_or_method, param=None)` возвращает edge-values + список где этот параметр используется в реальных pipeline'ах.

4. **🟡 P2: `coverage_status`** прямо в БД — `ready_for_autotest` / `partial` / `skipped` (см. spec 09 §5.4). Сейчас это вычисляется в `agent_doxytags/analyzer.py` ad-hoc — должно быть колонкой, чтобы фильтровать на retrieval-этапе.

5. **🟡 P2: `test_history`** — отдельная таблица, в которую `gpu_test_utils::TestRunner::OnTestComplete()` пишет результат прогона (`pass/fail`, `duration_ms`, `actual_vs_expected_diff`). Это превращает `test_params` в **живую базу** — AI видит «эти границы реально проверены, эти — гипотетические».

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
- `prompts/010_hyde_dsp.md` — заставляет Qwen3 написать гипотетический doxygen-абзац на запрос (3-4 предложения с проектным жаргоном: hipFFT, ROCm, beam, n_point, GpuContext, BufferSet, Op, Facade).
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

> **Идея:** LLM не должна делать 5 retrieval-вызовов и сама склеивать. Один tool — `dsp_context_pack(query, intent)` — возвращает структурированный JSON-контекст и сразу его форматирует под нужный промпт.

### 7.1 Concept: **Context Pack**

Для запроса «сгенерируй smoke-тест для FFTProcessorROCm::ProcessComplex»:

```jsonc
{
  "intent": "generate_test",
  "primary_symbol": { /* dsp_show_symbol */ },
  "test_params": [ /* dsp_test_params */ ],
  "use_case": { /* dsp_use_case */ },
  "siblings": [ /* dsp_graph_neighbors depth=1 */ ],
  "pybind": { /* python биндинг если есть */ },
  "examples": [ /* топ-2 examples/cpp/* и tests/test_*.hpp */ ],
  "templates": {
    "test_skeleton": "...gpu_test_utils::TestRunner snippet...",
    "validators": "...RelativeValidator/RmseValidator..."
  }
}
```

Промпт-шаблон `prompts/003_test_cpp_functional.md` (уже есть) использует этот пакет напрямую без дополнительных вопросов.

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

## 8. Eval & telemetry — без них всё гадание

### 8.1 Golden-set ≥50 запросов

Сегодня — 10 probe-запросов. Этого мало (95% CI шум).

**Что сделать (4 ч):**
- 50 query-blocks_id пар, типизированы по intent: `find_class`, `how_to`, `test_gen`, `pipeline`, `python_binding`, `migrate`, `debug`.
- Версионируется в `MemoryBank/specs/LLM_and_RAG/golden_set/v1.jsonl`.
- На каждый merge — CI прогон + замер R@5/MRR/nDCG → diff в PR-комменте.

### 8.2 RAGAs (LLM-judge метрики)

Помимо retrieval-метрик добавить **generation-метрики**:
- **faithfulness** — ответ AI основан на retrieved chunks?
- **answer_relevance** — ответ отвечает на вопрос?
- **context_precision** — retrieved chunks релевантны?
- **context_recall** — все нужные chunks нашлись?

Запускаем raz в неделю на 50 golden-запросах. Лог в `MemoryBank/specs/LLM_and_RAG/eval_history/`.

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

## 10. Roadmap — что сделать до Phase B QLoRA (12.05) и после

### Этап **«CONTEXT-FUEL»** — 2 дня (08-10.05) — критичен для качества Phase B

| # | Задача | Effort | Зачем для LLM |
|---|--------|--------|---------------|
| C1 | CLI `dsp-asst params extract --repo core --repo spectrum` (LEVEL 0) | 2 ч | заполнить `test_params` 0 → ~200 записей |
| C2 | Doxygen `@test*` парсер + интеграция в indexer | 2 ч | связать `test_params` с doxygen в .hpp |
| C3 | Sparse BM25 на doc_blocks/use_cases/pipelines | 1.5 ч | закрыть Finding #1 (FFT use-case → top-5) |
| C4 | HyDE prompt 010 + опция в CLI / MCP | 1.5 ч | +5-15% R@5 на семантических запросах |
| C5 | Tool `dsp_test_params(class, method=None)` в MCP | 30 мин | ключевой tool для AI-генератора тестов |
| C6 | Tool `dsp_use_case(query)` + `dsp_pipeline(name)` | 1 ч | плотный контекст для LLM |
| C7 | Tool `dsp_context_pack(query, intent)` — оркестратор | 2 ч | один вызов вместо пяти |

**Итого: ~10.5 часов кода.** Делает Phase B на 9070 вменяемой — модель учится на правильных границах, не выдумывает.

### Этап **«GRAPH»** — 1-1.5 дня (после 12.05)

| # | Задача | Effort |
|---|--------|--------|
| G1 | Inheritance tree (parsing + table + tool) | 1.5 ч |
| G2 | `uses_type` / `throws` через extractor | 2 ч |
| G3 | Tool `dsp_graph_neighbors(symbol, depth, edge_types)` | 2 ч |
| G4 | Tool `dsp_inheritance(fqn)` | 30 мин |
| G5 | LightRAG-style dual-level retrieval (pipelines+use_cases выше, symbols+test_params ниже) | 3 ч |

### Этап **«EVAL»** — 1 день

| # | Задача | Effort |
|---|--------|--------|
| E1 | Golden-set v1 (50 запросов) | 4 ч |
| E2 | RAGAs harness + 4 метрики | 2 ч |
| E3 | CI-замер R@5/MRR/nDCG на каждый merge | 1 ч |
| E4 | Pre-commit `_RAG.md` старения (warn только) | 30 мин |

### Этап **«AGENTIC RAG»** — 2 дня (после Phase C QLoRA)

| # | Задача | Effort |
|---|--------|--------|
| A1 | CRAG-loop (relevance evaluator + corrective rewrite) | 3 ч |
| A2 | Self-RAG reflection tokens (опционально, в нашем DSL) | 2 ч |
| A3 | Feedback-loop CLI `[A]ccept/[E]dit/[R]eject` + `rag_logs` накопитель | 2 ч |
| A4 | SFT-корпус из `rag_logs` для Phase C | 2 ч |

### Этап **«EMBEDDINGS-V2»** — 1 день (опц.)

| # | Задача | Effort |
|---|--------|--------|
| EM1 | Late Chunking patch для BGE-M3 | 2 ч |
| EM2 | Nomic-Embed-Code коллекция в pgvector | 3 ч |
| EM3 | Гибрид BGE+Nomic в `rag_hybrid.py` | 1 ч |

---

## 11. Открытые решения (для Alex)

1. **Где расположить `test_params` MD-карточки** — в `<repo>/.rag/test_params/` (как в spec 09) или в `MemoryBank/specs/LLM_and_RAG/test_params/`? Spec 09 — в репо (ближе к коду). Алекс согласен?
2. **Заполнить `test_params` ВСЕХ 9 репо или только `core`+`spectrum`+`stats` для Phase B?** Я бы взяла 3 репо до 12.05, остальные 6 — после 9070.
3. **HyDE on by default или opt-in?** По roadmap — on. Но первая неделя — opt-in для замера дельты.
4. **Code-specific embeddings — сейчас или после Phase B?** Я бы — после: на BGE-M3 ещё есть запас (Late Chunking + sparse дадут +10%).
5. **CRAG-loop — на стороне Continue (MCP-prompt) или внутри dsp-asst?** На стороне dsp-asst — иначе каждый клиент должен свой логику дублировать.
6. **Telemetry-table `usage_stats`** — сразу запустить или после стабилизации `gpu_test_utils::TestRunner` с `OnTestComplete()` hook'ом?

## ответы от Alex
1. я планировал и закладывал в `<repo>/.rag/test_params/` (как в spec 09) 
2. Берем все есть время готовим данные для 12.05.26
3. я тебя не понимаю обясни.
4. я думаю сейчас! готовим и тестируем все по полной что бы  12.05.26 время не терять
5. Как правильно!? должно быть удобно в работе это протатип думаем 

---

## 12. Что я НЕ предлагаю

- **GraphRAG community-detection (Microsoft)** — overkill для 30k рёбер. Простой BFS закрывает 95%.
- **HippoRAG personalized PageRank** — даст +1-2% при сложности 3 дня. После всего остального.
- **Voyage-code-3** — SaaS, $, attached external dependency. Рекомендую только если nomic-embed-code не помог.
- **Полноценный agentic ReAct с 10+ tools и AutoGPT-style loops** — латентность взлетит, отладка кошмар. Лучше 1 умный context-pack tool + CRAG-loop.

---

## 13. Источники (web-research, 2026)

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

*Конец deep analysis v1.0. Перечитать перед стартом этапа CONTEXT-FUEL (08-10.05).*
*Maintained by: Кодо. Дата: 2026-05-08.*
