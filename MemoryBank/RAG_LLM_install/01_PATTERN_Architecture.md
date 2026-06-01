# 🧬 01 — Архитектурный паттерн проекта

> **Вопрос Alex**: «к какому паттерну относится наш проект?»
> **Ответ**: проект — это **Modular Code-Aware RAG over a Knowledge Graph**, доставляемый
> как **Tool-Augmented LLM через MCP**, под стратегией **RAG-for-facts / FT-for-style**.
> По классу систем — **Repository-level Code RAG Assistant** (родня Cody/Sourcegraph,
> Continue, Tabby), но специализированный под C++/HIP/ROCm DSP-GPU.

---

## 1. Каноническое имя паттерна

Проект не сводится к одному GoF-паттерну — это **составной архитектурный паттерн**
из 4 ортогональных измерений:

| Измерение | Паттерн | Источник в литературе |
|-----------|---------|----------------------|
| **Парадигма RAG** | **Modular RAG** | Gao et al. 2023, «RAG for LLMs: A Survey» (Naive → Advanced → **Modular**) |
| **Структура знаний** | **GraphRAG / Code-Knowledge-Graph**, dual-level | Microsoft GraphRAG; LightRAG (high+low level) |
| **Доставка** | **Tool-Augmented LLM via MCP** | Anthropic Model Context Protocol; ReAct (tool-use) |
| **Стратегия знаний** | **RAG-for-facts / FT-for-style** | RAG-vs-Fine-tuning trade-off (RAFT, консенсус 2024-26) |

> Короткая формула: **«Модульный код-ориентированный RAG над графом знаний +
> атомарные MCP-инструменты + факты в RAG, стиль в LoRA».**

---

## 2. Где наш проект на карте RAG-паттернов

```
        Naive RAG            Advanced RAG               Modular RAG  ◄── МЫ ЗДЕСЬ
   index→retrieve→gen   +query-rewrite +rerank    заменяемые модули + routing + agentic
        │                      │                          │
   плоские чанки         HyDE, reranker            hybrid fusion (RRF), atomic tools,
   1 embedding model     dense-only                 graph, CRAG/Self-RAG, context-pack
```

Мы прошли Naive → Advanced и находимся в **Modular RAG**: компоненты (search, fusion,
rewrite, rerank, routing, predict) — заменяемые модули, pipeline перестраивается.

**Доказательства принадлежности к Modular RAG** (статус: ✅ работает · ⚠️ частично · 🔜 roadmap):
1. ✅ **Fusion** — hybrid `dense (BGE-M3) ⊕ sparse (BM25/tsvector) → RRF (k=60)`. ⚠️ sparse пока только на `symbols`, не на doc_blocks/use_cases/pipelines (открытый Finding).
2. 🔜 **Rewrite (pre-retrieval)** — HyDE: запрос → гипотетический doxygen-абзац → эмбеддинг гипотезы (промпт `014_hyde_dsp.md` готов, интеграция в roadmap).
3. ✅ **Rerank (post-retrieval)** — bge-reranker-v2-m3 (cross-encoder).
4. ⚠️ **Routing / Tool-use** — atomic MCP tools (X-слой) ✅ работают; `dsp_context_pack` orchestrator (Y-слой) 🔜 roadmap.
5. 🔜 **Predict / Reflection** — agentic loop CRAG/Self-RAG (query-rewrite при низком score) — roadmap.

> Принадлежность к Modular RAG определяется **архитектурой** (модули заменяемы, pipeline перестраивается), а не процентом готовности. Базовый контур (✅ 1,3 + atomic tools + storage) работает; модули 2,5 и orchestrator — план развития.

---

## 3. Что делает наш RAG «code-aware» (а не текстовым)

Это ключевое отличие от обычного doc-RAG. Мы индексируем **структуру кода**, а не плоский текст:

| Обычный doc-RAG | Наш Code-Aware RAG |
|-----------------|---------------------|
| режет документ на чанки по N токенов | **1 символ = 1 эмбеддинг** (tree-sitter AST, не рвёт функцию) |
| эмбеддит raw-текст | эмбеддит **скомпилированный текст из полей** символа (FQN+doxygen+сигнатуры) |
| плоский список документов | **граф знаний**: symbols + deps + includes + pybind (C++↔Python) + cmake |
| нет типизации | **типизированные карточки**: `test_params` (КФП), `use_cases`, `pipelines` |
| один уровень | **dual-level (LightRAG)**: high (pipelines/use_cases) + low (symbols/test_params) |

**Граф знаний кода (Code-KG)** — узлы: символы (классы/методы/поля/enum/free-fn);
рёбра: `inherits / calls / uses_type / includes / pybind_for / cmake_link`.

---

## 4. Доставка: Tool-Augmented LLM через MCP

RAG отдаётся **не** prompt-stuffing'ом, а как набор **атомарных инструментов**, которые
LLM-агент (Claude Code / Continue) вызывает по необходимости (паттерн ReAct + MCP):

```
LLM-агент (Claude/Continue)
   │ вызывает по необходимости
   ▼
┌─ X-слой (atomic MCP tools, параллельные) ──────────────────┐
│ dsp_find · dsp_search · dsp_show_symbol · dsp_test_params  │
│ dsp_use_case · dsp_pipeline · dsp_doc_block · dsp_repos     │
└──────────────────────────┬─────────────────────────────────┘
                           ▼
┌─ Y-слой (orchestrator) ───────────────────────────────────┐
│ dsp_context_pack(query, intent, include=[...]) + cache 5м  │
└────────────────────────────────────────────────────────────┘
```

Преимущество: агент сам решает что и когда вызвать, контекст собирается точечно
(не «вали всё в prompt»), кэшируется, p99 < 500 мс.

---

## 5. Стратегия знаний: RAG-for-facts / FT-for-style

Главный стратегический вывод проекта (Phase 6/7, `training_strategy_2026-05-26`):

| | RAG (retrieval) | Fine-tune (LoRA) |
|---|-----------------|------------------|
| **Для чего** | **факты** (API, имена, паттерны, границы) | **стиль/форма** (как пишем тесты, doxygen) |
| Свежесть | мгновенная (ре-индекс) | требует переобучения |
| Проверяемость | да (источник виден) | нет (вшито в веса) |
| Стоимость | низкая | высокая (GPU-часы) |

**Вывод**: при размере датасета < 10k пар **RAG обгоняет FT по фактам**. FT держим
**опционально** — только на чистом «стилевом» датасете (v8a ~3-5k). Боевой FT
(`qwen-coder-14b-dsp` v6, q=3.17) проиграл базовым моделям с RAG (q=4.67-4.83).
→ **Факты — в RAG, стиль — опционально в LoRA. На 16 ГБ VRAM это оптимум.**

---

## 6. Полная диаграмма слоёв (7 уровней)

```
┌──────────────────────────────────────────────────────────────────────┐
│ L7  CONSUMERS:  Claude Code · Continue (VSCode) · CLI dsp-asst         │
├──────────────────────────────────────────────────────────────────────┤
│ L6  DELIVERY (MCP):  atomic tools (X) + dsp_context_pack (Y) + cache   │
├──────────────────────────────────────────────────────────────────────┤
│ L5  GENERATION:  llama-server (ROCm) — MTP-Q4 / 30B-A3B / 14B-DSP      │
│                  + Ollama (вспом.)   ◄─ "FT-for-style" (LoRA опц.)     │
├──────────────────────────────────────────────────────────────────────┤
│ L4  RETRIEVAL:  HyDE → dense(BGE-M3)⊕sparse(BM25)→RRF → rerank → top5  │
│                 + agentic CRAG/Self-RAG (roadmap)                      │
├──────────────────────────────────────────────────────────────────────┤
│ L3  STORAGE:  PostgreSQL16+pgvector (rag_dsp) · Qdrant (dsp_gpu_rag_v1)│
├──────────────────────────────────────────────────────────────────────┤
│ L2  KNOWLEDGE:  Code-KG (symbols+deps) · карточки (test_params/        │
│                 use_cases/pipelines) · _RAG.md манифесты · dual-level  │
├──────────────────────────────────────────────────────────────────────┤
│ L1  INGESTION:  tree-sitter (cpp+py) · doxygen · @test* · pybind ·     │
│                 CLAUDE.md/Patterns.md · агенты (doxytags/class_card)   │
├──────────────────────────────────────────────────────────────────────┤
│ L0  SOURCE:  9 code-репо DSP-GPU + Doc/ + .rag/*.md                    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 7. Почему именно так (обоснование выбора паттерна)

| Ограничение / требование | Следствие в паттерне |
|--------------------------|----------------------|
| **16 ГБ VRAM** (RX 9070) | одна большая LLM за раз; RAG разгружает модель от фактов → хватает 30B/MTP |
| **Offline** (нет интернета на сервере) | локальные модели (BGE-M3, llama-server), HF stubs, нет SaaS-эмбеддингов |
| **Code-domain** (C++/HIP/ROCm) | AST-индексация (tree-sitter), Code-KG, КФП вместо плоских чанков |
| **Русские + англ. комменты** | BGE-M3 (multilingual) вместо англоязычных эмбеддеров |
| **Анти-галлюцинации API** | `@test`-теги, negative pairs, явные паттерны (HybridBackend=Bridge), КФП-границы |
| **Интеграция в IDE** (Claude/Continue) | доставка через MCP atomic tools, не chat-bot |
| **Свежесть фактов** | RAG-first (ре-индекс мгновенный) vs FT (переобучение дорогое) |

---

## 8. Anti-hallucination by design (важная черта паттерна)

Код-ассистент **обязан** не выдумывать API. В паттерн встроены защиты:
- **«Нет `@test` тега → нет автотеста»** — LLM не генерит тест без проверенных границ
- **КФП (`test_params`)** — краевые значения (`n_point=power_of_2`, не `100`), confidence 0.5/0.8/1.0
- **Negative pairs** — `typo → real lookup` (лечит «выдуманные классы»)
- **Явные паттерны** — `HybridBackend = Bridge` (не Singleton) — ни одна базовая LLM не угадала
- **`human_verified: true`** — AI не перезаписывает проверенное человеком

---

## 9. Сводка: «паттерн нашего проекта» для презентации

> DSP-GPU AI-ассистент — это **Repository-level Code RAG Assistant**, построенный по
> паттерну **Modular RAG** (Gao taxonomy) поверх **графа знаний кода** (GraphRAG/
> Code-KG, dual-level LightRAG), доставляемый как **Tool-Augmented LLM через MCP**
> (atomic tools + orchestrator), под стратегией **RAG-for-facts / FT-for-style**.
> Оптимизирован под 16 ГБ VRAM / offline / C++/HIP-домен / RU+EN.

Реализация развёртывания → [`03_DEPLOY_FromScratch.md`](03_DEPLOY_FromScratch.md).

---

*Maintained by: Кодо · 2026-06-01 · на основе анализа 90+ источников MemoryBank*
