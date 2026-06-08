# Обучаемый агентный кодинг-оркестратор (`llm-router`) — спецификация

> **Дата**: 2026-06-07 · **Автор**: Кодо · **Статус**: рабочая спека (утверждена Alex)
> **Железо PoC**: AMD Core 9 + 64 GB RAM + RX 9070 (16 GB VRAM), ROCm 7.2+
> **Dev**: дома Windows (клиент), БД (Postgres+Qdrant) на Linux — данные те же.
>
> ⚠️ Все факты (модели, embedder, порты, конфиги, скорости, формат реестра) **сверены** с
> работающим стеком `rag-mentor` и отчётами `finetune-env` 2026-06-07 — не выдуманы.

---

## 1. Цель и принципы

Система с **развилкой на N трактов через реестр способностей** + **агентный pipeline**. Не «просто роутер».

**Тракты (растущий реестр, §4):** каждый тракт = профиль способностей в `tract_registry`. Старт — 2, добавление нового = запись профиля (голову почти не трогаем):
- **Tract A — доменный**: код с нашими библиотеками/устройствами. `Qwen2.5-Coder-14B-FT` + RAG.
- **Tract B — независимый**: новый/общий код. `Qwen3.6-35B-A3B-MTP`.
- **Tract C+ (план):** отчёты, и др. спец-модели — добавляются как профили без переобучения роутера.

**Принципы:**
1. **N трактов через реестр**: маршрут = similarity(запрос, профили трактов), не фиксированный switch.
2. **FT + RAG вместе** (§6.3): FT — стиль/паттерны, RAG — точные факты.
3. **Не угадывать — переспрашивать** (CLARIFY через порог уверенности, §4.3).
4. **Контроль галлюцинаций** через БД-реестр сущностей (§5).
5. **Переносимость**: модели за `LLMBackend`, смена `14B/35B → DeepSeek v4` = правка конфига.
6. **Не плодить сущности**: embedder/Qdrant/реестр — reuse rag-mentor.

**PoC**: переносимый полигон RX 9070 → сервер → локальный **DeepSeek v4**.

---

## 2. Что переиспользуем (факты rag-mentor)

| Компонент | Значение | Источник |
|-----------|----------|----------|
| Embedder | `BAAI/bge-m3`, dim **1024**, COSINE | `rag-mentor/config/stack.*.json` |
| Reranker | `BAAI/bge-reranker-v2-m3` | там же |
| Vector store | Qdrant `:6333`, size 1024 | `mentor_db/qdrant_bootstrap.py.template` |
| RAG REST API | `:7821` — `POST /search {query,k,rerank}`, плюс `/find_symbol`, `/symbol_search`, `/list_symbols`, `/get_card`, `/dependencies`, `/health` | `_tools/mcp_rest_server.py` |
| Tract B (работает) | `Qwen3.6-35B-A3B-MTP` @ `llama-server :8080`, `-ngl 26`, ctx 16384, KV q8 → **15.8 GB** | `StartProjectMentor/00_START_HERE.md` |
| Реестр символов | `.rag/pao_contrib/<mod>/L2_symbols/<mod>.json` + `graph/edges.jsonl` (tree-sitter+libclang, `.rag/pao_contrib/_tools/cpp_parse`) | `rag-mentor/.rag/pao_contrib/` |
| Postgres | `:5432`, db `gpu_rag_dsp`, schema `llm_bench` (⚠️ pgvector НЕ установлен; projects: dsp-gpu, rag-mentor — pao-contrib нет) | rule 17 + `01_create_llm_bench_schema.sql` |

> 💡 rag-mentor уже отдаёт символы по REST (`/find_symbol`, `/list_symbols`) — для entity_hit/anti-hallucination можно частично reuse эти эндпоинты. Но `entity_registry` в Postgres всё равно нужен для batch-lookup + JOIN с `router_decisions` (быстрее, чем HTTP на каждый идентификатор).

**Замеренные скорости** (RX 9070, no_think, max_tokens=4000, MTP; `finetune-env/.../results_*`):

| Модель | tok/s | Конфиг | Роль |
|--------|-------|--------|------|
| Qwen3.6-35B-A3B-**MTP** | **~50** | `-ngl 26`, 15.8 GB | Tract B |
| Qwen2.5-Coder-14B-**FT** | **~44** | `-ngl 99`, ~9 GB | Tract A |
| Qwen3.6-35B-A3B Q8 | ~26 | тяжёлый квант | — |
| r1-distill-32b | ~4.3 | partial offload | — |

🔑 **35B-A3B-MTP (~50 t/s) не медленнее 14B (~44 t/s)** — A3B активирует ~3B + MTP. «5-17×» = MTP/no_think vs Q8 / thinking-on / r1-32b.
⚠️ Замеров `-cmoe` нет. Оценки качества FT vs base в БД не оцифрованы.

---

## 3. Архитектура (обзор)

```
HTTP query
   │
   ▼
┌──────────────────── llm-router (FastAPI :8010) ────────────────────┐
│ RAG retrieve (rag-mentor POST /search :7821 → top-k, bge-m3 1024)  │
│         │                                                          │
│         ▼                                                          │
│ ROUTER (§4): сигналы → тракт по реестру (similarity) | CLARIFY     │
│         │                                                          │
│         ▼  ОРКЕСТРАНТ (state-machine, §7)                          │
│   GENERATE   tract из реестра: A=14B-FT+RAG · B=35B-MTP · C+=…     │
│         ▼                                                          │
│   DEEP REVIEW   Tract B (35B) — всегда, независимый критик         │
│         ▼                                                          │
│   VERIFY   (a) anti-hallucination: имена ↔ entity_registry (§5)    │
│            (b) RUN sandbox (опц.) → traceback/artifact             │
│         │ ошибки → loop в GENERATE (≤N)                            │
│         ▼                                                          │
│   результат (состав зависит от задачи, Appendix A)                 │
└───────────────────────────────────────────────────────────────────┘
   каждый шаг → Postgres llm_bench (router_decisions, agent_steps)

backends: Tract A llama-server :8001 · Tract B :8080 · rag-mentor HTTP
```

---

## 4. Router — выбор тракта по реестру способностей

### 4.1. Реестр трактов (`tract_registry`)

Каждый тракт = профиль способностей. Маршрут = **similarity(сигналы запроса, профили)**, не фиксированный switch → новый тракт (отчёты и т.д.) добавляется записью, без переобучения роутера.

```sql
CREATE TABLE llm_bench.tract_registry (
  tract_id   TEXT PRIMARY KEY,          -- 'A' | 'B' | 'reports' | ...
  role       TEXT,                       -- domain_codegen | general_codegen | reports
  endpoint   TEXT,                       -- llama-server :8001 / :8080 / ...
  capability_text TEXT,                  -- описание «что умеет» → bge-m3 эмбеддинг
  capability_emb  BYTEA,                 -- кэш эмбеддинга профиля (1024)
  keywords   TEXT[],                     -- триггер-лексика тракта
  enabled    BOOL DEFAULT true, priority INT DEFAULT 0
);
```

### 4.2. Decision-логика (старт — rule-based, без обучения)

```python
rag   = rag_mentor.search(query, k=5, rerank=True)        # POST /search :7821
feats = build_features(query, rag)                         # §4.3
scores = {t.tract_id: tract_score(feats, t)               # similarity + keyword + intent
          for t in tract_registry if t.enabled}
top, second = top2(scores)

if   feats.intent_forces_tract:        route = forced     # явное «используя наши X» / «с нуля»
elif top.score - second.score < τ_margin:  route = CLARIFY  # неуверенно — переспрос (§4.4)
else:                                   route = top.tract_id
```

rag-mentor индексирует **только наши** библиотеки → его score сам разделяет «наше/не наше». Профиль Tract A ловит высокий RAG-score + domain-сигналы; Tract B — дефолт при низком score.

### 4.3. Сигналы запроса (`build_features`)

1. **`entity_hit`** — имя сущности из реестра (`N0121`, `FFTProcessor`), §5.
2. **`domain_keyword`** — `GPU/HIP/ROCm/kernel/DSP` + имена 10 репо.
3. **`intent_marker`** — `use_ours` → форс домен-тракт; `from_scratch` → форс независимый.
4. **`rag_top1_score`** + число кандидатов.

### 4.4. CLARIFY — переспрос (порог `τ_margin`, не отдельный класс)

Когда top-2 тракта близки или конфликт сигналов (`entity_hit` vs `intent=from_scratch`):
```
Нашёл варианты — какой?
  A) GPU-модуль dsp::spectrum::FFTProcessor (C++ HIP) + python-binding — из наработок
  B) независимая реализация с нуля на python (numpy)
```
Ответ → `router_decisions` (обучающий пример). Пороги/веса — калибруем в Phase 1-2.

---

## 5. Реестр сущностей — один источник на оба конца

**Источник готов**: `.rag/pao_contrib/<module>/L2_symbols/<module>.json` (tree-sitter+libclang). Символ: `kind` (class/method/field/function/enum/typedef), `fqn`, `signature`, `params/fields/methods/bases`, `file:line`. Плюс `graph/edges.jsonl` `{from,to,rel,evidence}`. → заливаем JSON в Postgres, markdown не парсим.

> DSP-GPU `.rag/` пока только markdown → прогнать `.rag/pao_contrib/_tools/cpp_parse` (Phase 0). ⚠️ требует **libclang** → на Windows-клиенте не заводится → реестр dsp-gpu строим **только на Debian**.

```sql
-- pao-contrib не зарегистрирован в projects — добавить ДО заливки реестра:
INSERT INTO llm_bench.projects(name, ...) VALUES ('pao-contrib', ...) ON CONFLICT DO NOTHING;

CREATE TABLE llm_bench.entity_registry (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project     TEXT NOT NULL REFERENCES llm_bench.projects(name),  -- FK как в rule 17
  module      TEXT,
  name        TEXT NOT NULL,           -- FFTProcessor | object_statements
  fqn         TEXT,                    -- dsp::spectrum::FFTProcessor
  kind        TEXT NOT NULL,           -- class|method|field|function|enum|typedef
  parent_fqn  TEXT,                    -- класс-владелец (для method/field)
  signature   TEXT,  return_type TEXT,
  lang        TEXT,  has_python BOOL DEFAULT false,
  src_file    TEXT,  src_line INT,
  doc_ref     TEXT,                    -- L3/<sym>.md для RAG-контекста
  UNIQUE (project, fqn, kind, signature)  -- signature: различает перегрузки методов
);
CREATE INDEX ix_entity_name ON llm_bench.entity_registry (project, lower(name));

CREATE TABLE llm_bench.entity_edges (  -- из graph/edges.jsonl
  project TEXT NOT NULL REFERENCES llm_bench.projects(name),
  from_fqn TEXT, to_fqn TEXT, rel TEXT, evidence TEXT
);
CREATE INDEX ix_edges_from ON llm_bench.entity_edges (project, from_fqn);
```

**Применение 1 — ВХОД (routing)**: `entity_hit(query)` = lookup по `(project, lower(name))` → сигнал A.

**Применение 2 — ВЫХОД (anti-hallucination, шаг VERIFY §7)**:
```
1. из сгенеренного кода извлечь идентификаторы наших проектов (namespace dsp::/odb:: + реестр)
2. проверки по БД (индекс):
   a) класс/функция есть?     → entity_registry by fqn
   b) метод принадлежит классу? → kind=method AND parent_fqn=<class>
   c) связь реальна?           → entity_edges (from→to)
3. не найдено → ГАЛЛЮЦИНАЦИЯ → loop:
   «FFTProcessor::do_magic() не существует. Доступные методы: [process, inverse, ...].»
```
- Только наши сущности (не stdlib). Ловит и выдуманный **класс**, и выдуманный **метод существующего класса** (частая галлюцинация), и фейковую **связь**.
- `has_python` → для «FFT модуль GPU» система знает: есть C++ impl + python-binding, даёт модели оба.
- ⚠️ **Реализация извлечения (Phase 2, не готовое решение)**: кандидаты = regex по `dsp::`/`odb::` + совпадения с именами реестра. **Known limitations**: `using namespace` без префикса (false-negative), унаследованные методы (parent_fqn = класс, метод объявлен в базе → ложная галлюцинация — проверять и bases[]), перегрузки/шаблоны/макросы. libclang-парсинг сгенеренного (некомпилируемого) кода ненадёжен. Уточняем в Phase 2 на реальных примерах.

---

## 6. Тракты A и B

### 6.1. Tract A — доменный путь (14B-FT + RAG)

```
query + RAG_chunks(top-3) → Qwen2.5-Coder-14B-FT.generate(system=<DSP-GPU expert>, ...)
  → код (+ тест по эталону, если просили) → mean_logprob → confidence (для эскалации)
```
- Конфиг: `llama-server :8001 --model qwen2.5-coder-14b-ft.gguf -ngl 99 -fa on -c 8192`.
- FT (loss ~0.45, домен выучен): system prompt и формат I/O фиксируем в Phase 1, далее меняем только вместе с переобучением.

### 6.2. Tract B — независимый путь + review (35B-A3B-MTP)

Две роли: **(1) генерация нового независимого кода**, **(2) deep review** для обоих путей.
```
query (+ опц. RAG) → Qwen3.6-35B-A3B-MTP.generate(system=<codegen | review>, ...)
```
- Генерирует: новый/общий код, out-of-domain, RAG пусто, эскалация из A по logprob.
- Ревьюит: шаг DEEP REVIEW (§7) для A (cross) и B (self).
- Конфиг (рабочий): `:8080 -ngl 26 -fa on -c 16384 --cache-type-k/v q8_0` (для V1 → `-ngl 99 -cmoe` — выгрузка всех expert-слоёв MoE на CPU; см. §8).

### 6.3. Почему И FT, И RAG (не выбор)

| | Fine-tune (A) | RAG |
|---|---------------|-----|
| Даёт | стиль, паттерны, *что есть* N0121, как пишут тест+графики | точные поля/сигнатуры сейчас |
| Живёт | в весах | в промпте (Qdrant) |
| Слабость соло | факты устаревают | не знает стиль/связи домена |

Для «N0121 → тест → графики → протокол» работают вместе. base-модель без FT выдумает имена структур → single-model отменён, Tract A обязателен.

---

## 7. Агентный pipeline (оркестрант + агенты)

```
Router ─A/B─► [GENERATE] A:Tract A+RAG | B:Tract B
              ─► [DEEP REVIEW] Tract B (35B), всегда
              ─► [VERIFY] (a) anti-hallucination ↔ entity_registry (всегда для A)
                          (b) RUN sandbox (опц., если задача требует исполнения)
              ─► ошибки? → loop в GENERATE (≤N)  │  ok → результат
```
- **GENERATE** — развилка A/B.
- **DEEP REVIEW** — независимый критик (cross для A, self для B).
- **VERIFY (a)** anti-hallucination — статическая БД-сверка, дёшево (1 SQL), всегда для A.
- **VERIFY (b)** RUN — изолированный запуск (subprocess/контейнер), сбор stdout+artifact'ов; опционален.
- Лимит итераций N (защита от зацикливания). Каждый шаг → `router_decisions` + `agent_steps`.

Реализация: один оркестрант (FastAPI state-machine) + 4 агента-функции. Без тяжёлых фреймворков; LangGraph/CrewAI — позже, если граф усложнится.

**Нефункциональные требования (учесть, детали — Phase 2):**
- **Sandbox RUN** исполняет недоверенный LLM-код → ресурс-лимиты (CPU/RAM), таймаут, no-network, изолированный временный каталог. Для PoC дома допустимо упрощённо, но заложить.
- **Таймауты/ретраи LLM-бэкендов**: httpx timeout + понятная ошибка при недоступности/зависании `:8001`/`:8080` (degraded, как для rag-mentor).
- **Конкурентность на одной GPU**: одновременные запросы к A и B (V3) → риск OOM → **сериализация/очередь** запросов к GPU. Для PoC (один пользователь) — простой mutex/очередь.

---

## 8. Hardware / VRAM (открытый вопрос — режим резидентности)

Tract A (~9 GB) + Tract B (`-ngl 26` = 15.8 GB) одновременно в 16 GB **не влезают**. Выбор:

| | Режим | Плюс | Минус | Нужно от Alex |
|---|-------|------|-------|---------------|
| **V1** | `-cmoe` (оба резидентны: A ~9 + B **~6 GB — оценка, не замер**) | нет swap, ближе к целевому серверу | compute медленнее? | цифры ток/с `-cmoe` vs `-ngl 26` |
| **V2** | hot-swap | макс. скорость каждой | swap 20-40 с | — |
| **V3** | приоритет-резидент (A hot, B под review) | проще всего | swap под deep | — |

> ⚠️ `-cmoe` (все expert-слои на CPU) ≠ `--n-cpu-moe N` (только N слоёв) — разный VRAM-footprint. Оценка «B ~6 GB» = агрессивный `-cmoe`, **не замерена** на нашем железе → вывод «V1 влезает (9+6<16)» подтвердить бенчем перед выбором V1.

Старт — **V3** (A основная для доменного кодинга, B `:8080` под review/escalation). Параллельно бенч `-cmoe` → в Phase 2 выбор V1 vs V2.

> На целевом сервере (DeepSeek v4, 48-80+ GB) вопрос исчезает — всё always-on. V1 ближе к этой топологии → для переносимости предпочтителен, если скорость приемлема.

---

## 9. Repo & endpoints

Router = infrastructure layer (NVIDIA Blueprint, LLMOps 2026): отдельный репо, зовёт rag-mentor по HTTP.

```
llm-router/                         ← НОВЫЙ репо
├── src/router/
│   ├── api.py                FastAPI endpoints
│   ├── orchestrator.py       state-machine generate→review→verify→loop (§7)
│   ├── agents/{generate,review,run,verify}.py
│   ├── router.py             decision-логика A/B/CLARIFY (§4)
│   ├── registry.py          entity_registry/edges loader + lookup (§5)
│   ├── backend.py            LLMBackend интерфейс ← точка переноса на DeepSeek v4
│   ├── backends/{llama_server,residency}.py   (:8001, :8080; V1/V2/V3)
│   ├── rag_client.py         HTTP → rag-mentor POST /search :7821
│   └── training/             trained head (Phase 3)
├── tests/                    TestRunner, НЕ pytest (rule 04)
├── docker/  ·  pyproject.toml
```
rag-mentor и finetune-env — без изменений.

```
POST /v1/route          query → {code,tests,meta} | {review} | {answer} | {clarify}
POST /v1/route/dry-run  только классификация (тест router'а)
POST /v1/feedback       Alex score → данные на дообучение
GET  /v1/metrics        Prometheus (latency P50/P95, A/B/CLARIFY distribution, residency)
GET  /healthz
```

---

## 10. Метрики (Postgres llm_bench)

```sql
CREATE TABLE llm_bench.router_decisions (
  id SERIAL PRIMARY KEY, ts TIMESTAMPTZ DEFAULT now(),
  project TEXT REFERENCES llm_bench.projects(name),
  query_hash TEXT,
  -- query_embed VECTOR(1024)  ← ТОЛЬКО Phase 3 (нужен pgvector + суперюзер; в Phase 0 не создаём)
  rag_top1_score FLOAT, rag_top1_module TEXT, rag_top1_brief TEXT,  -- /search не отдаёт doc_id
  route TEXT,                    -- tract_id ('A'|'B'|'reports'|...) | 'CLARIFY' (FK tract_registry)
  route_margin FLOAT,            -- top.score - second.score (для калибровки τ_margin)
  classifier_version TEXT,       -- 'rule-v1' | 'trained-v1'
  chosen_model TEXT, escalated BOOL DEFAULT false, residency_switch BOOL DEFAULT false,
  latency_total_ms INT, latency_classify_ms INT, latency_generate_ms INT,
  quality_score INT, judge_model TEXT, user_feedback INT   -- 0-5 / judge / -1..+1
);
-- agent_steps (DDL — Phase 1, когда появится pipeline): id, decision_id FK, step, status, hallucinations JSONB, loop_iter
```
- ⚠️ **pgvector**: `CREATE EXTENSION vector` требует суперюзера (`dsp_asst` не может). `query_embed` нужен только trained head (Phase 3) → в Phase 0 колонку НЕ создаём, добавим в Phase 3 после установки extension под postgres-суперюзером. До тех пор retrain-эмбеддинги храним отдельно/пересчитываем.
- `/search` rag-mentor не возвращает `doc_id` → используем `module`+`brief`. Для trained head `d_emb_top1` (§11) считаем re-embed top1 `text` через bge-m3 (доп. вызов embedder) — либо добавляем эндпоинт в rag-mentor (правка rag-mentor → отдельный OK).

Retrain (Phase 3): `rows WHERE quality_score IS NOT NULL` ∪ основной 10-20K → train head → shadow A/B 5% → промоушн если accuracy ≥ prod−1%.

---

## 11. Trained router-head (Phase 3)

Когда rule-based пороги начнут ошибаться >~10% — заменяем на trained head (RAGRouter-подход, обгоняет rule-based на 10-20K+).

```
q_emb[1024] ⊕ d_emb_top1[1024] ⊕ rag_score_5[5] ⊕ meta[8]  → concat[2061]
  → MLP [2061 → 256 → 64 → N_tracts]  → score на каждый тракт
CLARIFY = (max - second) < τ_margin   # порог, НЕ отдельный класс → масштаб на N
```
Выход = **N трактов** (число строк `tract_registry`), не фикс-3. Эмбеддинги bge-m3 (`q_emb`, `d_emb_top1` router считает сам — re-embed). Trained head = **0 GB VRAM**.

> **Почему голова, а не генеративная LLM** (анализ `llm_router_model_choice_2026-06-08.md`): для выбора тракта генеративная LLM = +1-2 ГБ VRAM, ×10-20 latency, не точнее. Лучший роутер RouteLLM — лёгкая голова на эмбеддингах. Рост базы (42→600 модулей) живёт в RAG-индексе, не в классах.

---

## 11-bis. Цикл дообучения (data-flywheel + расписание)

Два независимых контура: **ежедневный inкремент RAG** (дёшево) и **выходное обучение** (тяжело).

### Ежедневный ingest — 00:00, git-driven
```
если за день были коммиты (DSP-GPU / pao):
  git diff → изменённые файлы → cpp_parse → затронутые символы
  → upsert в entity_registry + инкрементальный re-embed ТОЛЬКО новых → Qdrant
эмбеддер bge-m3 заморожен; полного переиндекса нет.
```
Нет коммитов / не влияет на RAG → пропуск. Накопленные `router_decisions` за день → к выходному обучению.

### Выходное обучение — Пт 18:00 → Пн 08:00 (VRAM-очередь, по одной модели)
```
1) Route-голова   (минуты)  — на router_decisions ∪ базовый 10-20K
2) Tract A 14B-FT (часы)    — если за неделю прирост датасета домена
3) Tract C+ генераторы (отчёты, …) — по очереди, если есть свежие данные
→ shadow A/B 5% → промоушн если accuracy ≥ prod − 1%
```
- Сериализация по VRAM (17 ГБ): **одна модель за раз**, не параллельно.
- Голова — каждые выходные (дёшево); тяжёлые тела — только при приросте данных.
- Эмбеддер bge-m3 еженедельно **НЕ** переобучаем (пере-индекс 600 модулей = дорого, без выигрыша).
- Окно ограничено Пн 08:00 — если очередь не успела, тела переносятся на след. выходные (голова приоритетна).

---

## 12. План фаз

| Phase | Длит. | Содержимое | DoD |
|-------|-------|-----------|-----|
| **0** | 1-2 дня | Repo + FastAPI скелет + `rag_client` + Tract A `:8001` + таблицы (`router_decisions`,`entity_registry`,`entity_edges`,**`tract_registry`** seed A/B) + загрузка `L2_symbols`/`edges` (pao готов; DSP-GPU прогнать `cpp_parse`) | `/healthz` зелёный, dry-run выбирает тракт, реестры залиты |
| **1** | 1 нед | Выбор тракта по реестру (§4) + CLARIFY(τ) + V3-резидентность + pipeline generate→review | тракты работают, спорное → переспрос, метрики копятся |
| **2** | 1-2 нед | VERIFY: anti-hallucination (БД) + RUN sandbox + logprob-эскалация A→B + Prometheus | галлюцинации ловятся БД, задача с исполнением → код+artifact, P95 A < 3 с |
| **2.5** | 3-5 дн | **Flywheel-scheduler (§11-bis)**: cron ежедн. git-ingest 00:00 + выходное окно Пт→Пн (VRAM-очередь) | ingest по коммиту инкрементальный; выходной прогон головы зелёный |
| **3** | 2-3 нед | Trained head (N трактов) на 10-20K + логах, shadow A/B | head accuracy ≥ rule + 5%, выкат |
| **4** | по железу | Перенос на сервер: backend-конфиг → DeepSeek v4, всё always-on | то же поведение на новом железе без правки оркестратора |

---

## 13. Зафиксировано / открыто

**Зафиксировано** (не переспрашивать):
- Архитектура = **N трактов через `tract_registry`** (similarity-выбор) + CLARIFY через порог + агентный pipeline + БД anti-hallucination.
- Tract A = `Qwen2.5-Coder-14B-FT` (~0.45). Tract B = `Qwen3.6-35B-A3B-MTP` @ `:8080` (~50 t/s). Tract C+ (отчёты) — профилем, без переобучения роутера.
- Routing-мозг = **лёгкая голова на bge-m3** (НЕ генеративная LLM — `llm_router_model_choice_2026-06-08.md`). Старт rule-based, trained head Phase 3, выход = N трактов.
- **Cadence (§11-bis):** ежедневный git-driven RAG-ingest 00:00; обучение Пт 18:00→Пн 08:00 (голова + тела по VRAM-очереди); bge-m3 не переобучаем.
- Embedder/Qdrant/реестр — reuse rag-mentor. Метрики → `llm_bench`. Репо = `llm-router`.

**Открыто (1 вопрос):** режим VRAM V1/V2/V3 (§8) — старт V3, цифры `-cmoe` → решение в Phase 2.

---

## Appendix A — классы задач (список открыт)

| # | Задача | Путь | Pipeline |
|---|--------|------|----------|
| 1 | «Просто напиши функцию X» (новая, независимая) | B | generate → review |
| 2 | «Код по алгоритму, GRASP, используя наши модули `<...>`» | A | generate → review |
| 3 | «Контроллер N0121: тест-структура в диапазоне → результат → графики Python → протокол» | A | generate → review → run → verify (loop) |
| 4 | «Deep review этого кода» | B | review-only |
| 5 | «Отрефактори под наши паттерны» | A | generate → review |

Принцип: опирается на наши библиотеки/паттерны → **A**; самодостаточно → **B**; неоднозначно → **CLARIFY**. N0121 (#3) — самый полный сценарий (4 агента); большинство задач короче. Список пополняется через `llm_bench.test_category`.

---

## Ссылки

- [RAGRouter (arxiv 2505.23052)](https://arxiv.org/pdf/2505.23052) — основа trained head (Phase 3)
- [Confidence Tokens (arxiv 2410.13284)](https://arxiv.org/pdf/2410.13284) — фон logprob-эскалации
- [Qwen3.6-A3B + `-cmoe` (habr 1026482)](https://habr.com/ru/articles/1026482/) — основа V1
- [MTP в llama.cpp](https://johnpaulwile.substack.com/p/multi-token-prediction-mtp-in-llamacpp)
- [LLM Router как infrastructure layer (2026)](https://sesamedisk.com/enterprise-llm-integration-patterns-2026/)
- [NVIDIA LLM Router Blueprint](https://github.com/NVIDIA-AI-Blueprints/llm-router)
- [Qwen2.5-Coder-14B (HF)](https://huggingface.co/Qwen/Qwen2.5-Coder-14B-Instruct) · [BAAI/bge-m3 (HF)](https://huggingface.co/BAAI/bge-m3)
