# TASK — llm-router Phase 0: каркас + реестр

> **Спека**: `MemoryBank/specs/llm_router_architecture_2026-06-07.md`
> **Фаза**: 0 (каркас) · **Оценка**: 2-3 дня (pgvector-суперюзер + cpp_parse на Debian + выяснение /search) · **Создано**: 2026-06-07
> **Цель Phase 0**: поднять скелет сервиса, подключить rag-mentor, залить реестр сущностей.
> **DoD**: `/healthz` зелёный · `/v1/route/dry-run` классифицирует A/B/CLARIFY · `entity_registry` залит из L2_symbols.

---

## Контекст (одной строкой)

Новый микросервис `llm-router` (FastAPI), путь A = Tract A (14B-FT @ :8001) + RAG, путь B = Tract B (35B-MTP @ :8080, уже работает). Reuse rag-mentor (bge-m3, Qdrant, реестр L2_symbols). Метрики → Postgres `llm_bench`. Старт routing = rule-based (RAG-similarity), не LLM.

---

## Шаги

### S0. Репо и скелет
- [ ] Создать репо в `E:\llm-router` (дома) / `~/llm-router` (Debian). НЕ в worktree (rule 03). **git init локально, push — по отдельному OK** (rule 02).
- [ ] Структура `src/router/` по §9 спеки (api, orchestrator, agents/, router, registry, backend, backends/, rag_client, training/).
- [ ] `pyproject.toml` (FastAPI, uvicorn, httpx, psycopg[binary], pydantic, pyyaml). **БЕЗ pytest** (rule 04 — TestRunner).
- [ ] `tests/` на TestRunner + SkipTest — **портировать `common/runner.py`** из DSP-GPU (в новом репо его нет).
- [ ] `config.yaml`/`.env`: порты (router **:8010**, Tract A :8001, Tract B :8080, **rag-mentor :7821**, Qdrant :6333, PG :5432), пути GGUF/.rag, пороги θ (заглушки).

### S1. Постгрес-схема (в `llm_bench`)
- [ ] **PRE: pgvector** — `CREATE EXTENSION vector` требует **суперюзера** (dsp_asst не может). Под postgres-суперюзером: `sudo -u postgres psql -d gpu_rag_dsp -c 'CREATE EXTENSION IF NOT EXISTS vector;'`. **Если нельзя/нет — ОК**: `query_embed` в Phase 0 НЕ создаём (нужен только trained head Phase 3).
- [ ] **PRE: projects** — `INSERT INTO llm_bench.projects(name,...) VALUES ('pao-contrib',...) ON CONFLICT DO NOTHING;` (сейчас только dsp-gpu, rag-mentor; FK требует регистрации).
- [ ] `router_decisions` (§10) — БЕЗ `query_embed` в Phase 0; route CHAR(1), rag_top1_module/brief (НЕ doc_id), FK project.
- [ ] `entity_registry` (§5) — FK project, UNIQUE(project,fqn,kind,**signature**) + индекс `(project, lower(name))`.
- [ ] `entity_edges` (§5) — FK project, from_fqn/to_fqn/rel + индекс `(project, from_fqn)`.
- [ ] DDL применить через `host=localhost` TCP (rule 17: peer auth для dsp_asst не работает).

### S2. Загрузчик реестра (`registry.py`)
- [ ] Парсер `L2_symbols/<mod>.json` → строки `entity_registry` (рекурсивно по fields/methods/nested, заполнить parent_fqn; `signature` в ключе для перегрузок; учесть `bases[]` для наследования).
- [ ] Парсер `graph/edges.jsonl` → `entity_edges`.
- [ ] Залить **pao-contrib** (готов): `rag-mentor/.rag/pao_contrib/*/L2_symbols/*.json` (project='pao-contrib').
- [ ] Для **dsp-gpu**: прогнать `rag-mentor/.rag/pao_contrib/_tools/cpp_parse` на репо DSP-GPU → L2_symbols → залить. ⚠️ требует **libclang** → **только на Debian** (на Windows-клиенте не заводится). Дома пропускаем.
- [ ] Sanity: `SELECT project, count(*) FROM entity_registry GROUP BY project;` — pao-contrib ненулевой.

### S3. RAG-клиент (`rag_client.py`)
- [ ] Эндпоинт **подтверждён**: `POST http://localhost:7821/search` `{"query":str,"k":int,"rerank":bool}` → `{"hits":[{score,module,category,brief,text,source}]}` (источник `_tools/mcp_rest_server.py`). **doc_id и embeddings НЕ отдаёт** → используем `module`+`brief`+`score`.
- [ ] HTTP-клиент (httpx) с **таймаутом** → top-k hits.
- [ ] **Degraded-режим**: rag-mentor недоступен → dry-run работает на сигналах entity/keyword/intent **без score-веток** (не блокер DoD). Логировать `rag_unavailable`.
- [ ] (опц.) символьные эндпоинты `/find_symbol`, `/list_symbols` — для entity_hit альтернатива БД-реестру.

### S4. Router decision (`router.py`) — rule-based (§4)
- [ ] `entity_hit(query)` — lookup имён в `entity_registry` (по project).
- [ ] `domain_keyword(query)` — словарь GPU/HIP/ROCm/kernel/модуль/DSP + имена 10 репо.
- [ ] `intent_marker(query)` — use_ours / from_scratch (простые правила/regex).
- [ ] Decision-функция по §4.1 (пороги θ как **конфиг-параметры**, дефолты-заглушки — калибровка позже).
- [ ] Возврат: `route ∈ {A, B, CLARIFY}` + причина (для логов).

### S5. API + бэкенд-абстракция
- [ ] `backend.py` — интерфейс `LLMBackend.generate(...)` (точка переноса на DeepSeek v4).
- [ ] `backends/llama_server.py` — OpenAI-compat клиент (:8001 для A, :8080 для B).
- [ ] `api.py`: `GET /healthz`, `POST /v1/route/dry-run` (только классификация, без генерации).
- [ ] Запись каждого dry-run в `router_decisions` (route, score, latency_classify).

### S6. Tract A сервер (подготовка, без генерации в Phase 0)
- [ ] Найти GGUF `qwen2.5-coder-14b-ft` (loss 0.45). ⚠️ обучение было на Debian — дома (Windows) GGUF может не быть → генерация Tract A в Phase 1 на Linux.
- [ ] Команду запуска `:8001 -ngl 99 -fa on -c 8192` зафиксировать в README (§6.1). Генерацию подключаем в Phase 1.

---

## Проверки (DoD)
1. `curl :8010/healthz` → 200.
2. `curl -X POST :8010/v1/route/dry-run -d '{"query":"напиши FFT модуль GPU"}'` → `route: A` (domain_keyword=GPU, без RAG).
3. `curl ... -d '{"query":"напиши heap-сортировку на python"}'` → `route: B` (нет domain_signal → default).
4. `SELECT project, count(*) FROM llm_bench.entity_registry GROUP BY project;` — **pao-contrib > 0 (обязательно)**, dsp-gpu > 0 (желательно, см. риск).
5. Запись dry-run появилась в `router_decisions`.

> DoD #2/#3 работают **без RAG** (на сигналах) → не блокируются S3. Это намеренно: Phase 0 проверяет каркас+развилку, не качество routing.
> **CLARIFY** в Phase 0: router может вернуть `route='C'` (конфликт сигналов), но формулировка вопроса-переспроса (UX) — **Phase 1**. В Phase 0 достаточно что ветка достижима в dry-run.

---

## Зависимости / риски
- ✅ **Эндпоинт rag-mentor** — подтверждён: `POST /search :7821` (S3). Не блокер.
- ⚠️ **`cpp_parse` на DSP-GPU** (S2) — требует libclang, **только на Debian**. Дома (Windows) пропускаем → dsp-gpu реестр в Phase 1 на Debian. Phase 0 DoD = pao-contrib (см. DoD #4).
- ⚠️ **pgvector** (S1) — требует суперюзера. Если недоступен → `query_embed` не создаём в Phase 0 (нужен только Phase 3). НЕ блокер Phase 0.
- ⚠️ **`pao-contrib` не в `projects`** (S1) — добавить INSERT до заливки реестра (FK).
- Не трогать rag-mentor / finetune-env (только чтение).

## Не в Phase 0 (явно)
- Генерация кода (Phase 1), CLARIFY-UX (Phase 1), anti-hallucination в VERIFY (Phase 2), trained head (Phase 3), выбор V1/V2 (Phase 2).
- Калибровка порогов θ (позже — Alex: «рано»).
