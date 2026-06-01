# 🔁 04 — RAG Pipeline (ingestion → retrieval)

> Как наполняется и работает RAG. Статусы: ✅ работает · ⚠️ частично · 🔜 roadmap · 🔴 блокер.

---

## 1. Слои pipeline

```
L0 SOURCE      9 code-репо + Doc/ + .rag/*.md
   ▼
L1 INGESTION   tree-sitter (cpp+py) → symbols/files/includes/enum/cmake/pybind
               + парсеры: doxygen, @test*, агенты (doxytags/class_card)
   ▼
L2 CHUNKING    ✅ 1 символ = 1 эмбеддинг (не рвёт функцию)   🔜 Late Chunking (длинные классы)
   ▼
L3 EMBEDDING   ✅ BGE-M3 fp16 → vector(1024)                 🔜 Nomic-Embed-Code (2-я коллекция для cpp/hip)
   ▼
L4 STORAGE     ✅ pgvector (rag_dsp) + Qdrant (dsp_gpu_rag_v1, payload per target_table)
   ▼
L5 RETRIEVAL   ✅ dense ⊕ sparse → RRF(k=60)   ⚠️ sparse только на symbols   🔜 HyDE, CRAG
   ▼
L6 RERANK      ✅ bge-reranker-v2-m3 (~130мс/16 пар), KIND_BOOST статичен
   ▼
L7 CONTEXT     🔜 dsp_context_pack(query, intent, include=[...]) + cache 5мин
```
Готовность базового контура ~75%, R@5 hybrid = 0.88 на symbols.

---

## 2. Источники данных

| Источник | Таблица | Извлечение | Статус |
|----------|---------|-----------|--------|
| C++ символы | `symbols` (~6.2k) | tree-sitter cpp | ✅ |
| Doxygen-блоки | `doc_blocks` (~2.6k) | парсер `@brief/@param/@return/@throws` | ✅ |
| `@test*` теги (КФП) | `test_params` | doxygen `@test/@test_field/@test_ref/@test_check` | 🔴 проверь наполнение (см. ниже) |
| pybind C++↔Python | `pybind_bindings` (~42) | парс `dsp_{repo}_module.cpp` | ✅ |
| includes | `includes` (~3k) | tree-sitter `#include` | ✅; calls/inherits 🔴 пусто |
| cmake | `cmake_targets` (~31) | парс CMakeLists | ✅ |
| use-case карточки | `use_cases` (~123) | `<repo>/.rag/use_cases/*.md` (YAML+body, RU/EN синонимы) | ✅ |
| pipelines | `pipelines` (~8) | `<repo>/.rag/pipelines.md` | ⚠️ (цель 15-20) |
| `_RAG.md` манифест | repos_meta | auto (БД) + AI (brief) + человек (layer/maturity) | ⚠️ |
| CLAUDE.md/Patterns | — | паттерны через `dsp_repos` | ✅ |

**Эмбеддинг-текст** компилируется из полей сущности (не raw-код): для `test_params` — из `(param_name, type, edge_values, constraints, return_checks)`.

> 🔴 **Проверка `test_params`** (критично для генерации тестов):
> ```bash
> psql -h localhost -U dsp_asst -d gpu_rag_dsp -c "SELECT count(*) FROM rag_dsp.test_params;"
> ```
> Заполнение: `ingest_test_tags.py --all` (LEVEL 0, confidence 0.5) → ручная верификация ~20 ключевых классов (FFTProcessorROCm/ScopedHipEvent/ProfilingFacade/CaponProcessor) до LEVEL 2 (1.0). Зависит от `@test*` doxygen-тегов в коде → их ставит агент **doxytags**.

---

## 3. Retrieval (hybrid)

```
запрос
  │ 🔜 HyDE: Qwen3-8B → гипотетический doxygen-абзац (200-450 симв, проектный жаргон) → эмбеддят ГИПОТЕЗУ
  ▼
dense: BGE-M3 fp16 → cosine top-200   ⊕   sparse: tsvector+GIN top-50 (⚠️ только symbols)
  ▼ RRF (k=60)
  ▼ bge-reranker-v2-m3 (cross-encoder)
  ▼ top-5
```
- **Dense** ✅, **Rerank** ✅.
- **Sparse** ⚠️: работает только на `symbols`; на `doc_blocks/use_cases/pipelines` НЕ подключён (открытый Finding) → семантические use-case не пробиваются. Fix: tsvector+GIN на эти 3 таблицы (ожидаемо R@5 0.60→≥0.78).
- **HyDE** 🔜: промпт `prompts/014_hyde_dsp.md`, режим `{fast,smart}`, кэш гипотез 5мин, +5-15% R@5.
- **CRAG/Self-RAG** 🔜: `dsp_search(mode="agentic")` — при rerank-score top-1 < 0.6 → query-rewrite → повтор (≤5 итераций), лог в `rag_logs`.

---

## 4. Atomic MCP tools (X-слой)

| Tool | Что делает | Когда |
|------|-----------|-------|
| `dsp_find('Имя')` ✅ | substring + trgm по имени | назвали имя |
| `dsp_search('запрос')` ✅ | hybrid + rerank | семантический вопрос |
| `dsp_show_symbol(id)` ✅ | детали символа (doxygen, attrs, родитель) | drill-down |
| `dsp_test_params(fqn, method?)` ✅tool/🔴данные | edge_values + checks + confidence + coverage | генерация тестов |
| `dsp_use_case(slug/query)` ✅ | use-case карточка + RU/EN синонимы | «как сделать Y» |
| `dsp_pipeline(slug/query)` ✅ | composer + chain_classes + chain_repos | «pipeline для Z» |
| `dsp_doc_block(block_id)` ✅ | полный doc-блок | развернуть фрагмент |
| `dsp_repos()` ✅ | 10 репо + layer + depends_on + GoF-паттерны + build_order | старт сессии |
| `dsp_health()` ✅ | статус сервера/коллекции/reranker | отладка |

🔜 planned: `dsp_graph_neighbors`, `dsp_inheritance`, `dsp_context_pack` (Y-orchestrator, cache).

---

## 5. Агенты генерации

| Агент / промпт | Выход | Реализация |
|----------------|-------|-----------|
| **doxytags** (`12_DoxyTags_Agent_Spec`, prompt 009) | дописывает `@brief/@param/.../@test*/@autoprofile`; **не портит существующее**, `.bak`+re-validate, `--dry-run`, **не коммитит сам** | `dsp_assistant/agent_doxytags/*`, Qwen 8B |
| **class_card** (prompt 010) | JSON `what/why/how` + `usage_example` + `synonyms_ru/en` + `tags` → секция карточки | `modes/class_card.py`, qwen3:8b, temp 0.2 |
| **usecase** (prompt 011) | `.rag/use_cases/<id>.md` (synonyms = статичный HyDE) | planned |
| **pipeline** (prompt 012) | `.rag/pipelines.md` (ASCII data-flow) | planned |
| **HyDE** (prompt 014) | гипотетический doxygen для эмбеддинга | `retrieval/hyde.py` 🔜 |

Конвенция промптов: 1 промпт = 1 задача, жёсткий шаблон вывода, анти-паттерны (нет pytest/std::cout/GPUProfiler/выдуманных классов). Правило doxytags: **«нет `@test` тега → нет автотеста»**.

---

## 6. `_RAG.md` манифест (per-repo)

`<repo>/.rag/_RAG.md` — YAML-frontmatter. Ключевые поля: `layer` (core/compute/composer/meta), `maturity`, `key_classes[]` (fqn auto + brief AI), `depends_on`, `python_modules[]` (pybind), `test_params_summary`, `tags[]`, `notes[]` (+perf-регрессии). Правило: `human_verified: true` → AI не перезаписывает. CLI: `dsp-asst manifest init/check/refresh/sync`. Weekly cron (вт 09:00) обновляет AI-секции.

---

## 7. Расширения (roadmap)

| Расширение | Статус |
|-----------|--------|
| Graph (inheritance/uses_type, BFS, LightRAG dual-level) | 🔜 (call-graph через clangd — Phase B+) |
| Late chunking (BGE-M3 8192 ctx) | 🔜 (+5-10% R@5 на длинных классах) |
| Code-embeddings (Nomic-Embed-Code, 2-я коллекция) | 🔜 (+5-15% на cpp/hip) |
| Telemetry (popularity boost ← TestRunner::OnTestComplete) | 🔜 |
| Agentic loop (CRAG/Self-RAG + feedback → SFT) | 🔜 после Phase C |
| ColBERT / HippoRAG / GraphRAG community | ❌ отвергнуто (overkill) |

---

## 8. Eval

- **golden_set**: `golden_set/qa_v1.jsonl` (50 запросов: exact_name/semantic_ru/semantic_en); 🔜 v2 (100 + `intent`).
- **Harness**: `dsp_assistant/eval/runner.py` (3 режима hybrid/dense/sparse) + `retrieval_metrics.py` (recall@k, MRR, hit-rate). Отчёты в `golden_set/eval_reports/`.
- **Текущее**: R@5 hybrid = **0.88** на symbols; цель ≥0.93 после HyDE + sparse на RAG-таблицы.
- **RAGAs** 🔜 (faithfulness/context_precision ≥0.7), CI `rag_eval.yml` 🔜.
- ⚠️ Не путать с `llm_bench` (схема для оценки **моделей**, не retrieval) → `06_PRODUCTION`.

---

*Maintained by: Кодо · 2026-06-01*
