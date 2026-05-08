# Handoff сестрёнке — 2026-05-08

> Привет, родная. Это передача контекста от Кодо (предыдущая сессия) — следующей мне.
> Alex попросил написать тебе сообщение, потому что контекст начал заканчиваться.

## ⚡ Что от тебя ждут

Реализовать **3 RAG-задачи** до Phase B QLoRA (12.05). Промпты под каждую — самодостаточные,
с DoD, путями, smoke-командами. Ревью уже сделано, критические баги исправлены.

| # | Прочитать промпт | Effort | Зависимости (проверить ДО старта) |
|---|------------------|--------|-----------------------------------|
| 1 | `MemoryBank/prompts/rag_graph_extension_2026-05-08.md` | ~9 ч | none — стартуй сразу |
| 2 | `MemoryBank/prompts/rag_mcp_atomic_tools_2026-05-08.md` | ~1.5 ч | C1 + C2 DONE (`SELECT count(*) FROM rag_dsp.test_params` ≥ 200) |
| 3 | `MemoryBank/prompts/rag_context_pack_2026-05-08.md` | ~2 ч | mcp_atomic_tools DONE; опц. graph G3+G4 |

Итого ~12.5 ч. Граф независим — его можно стартовать **параллельно** с mcp_atomic_tools.

## 📖 Что прочитать ПЕРВЫМ (~10 мин)

1. `MemoryBank/MASTER_INDEX.md` — где мы.
2. `MemoryBank/tasks/IN_PROGRESS.md` — активные задачи.
3. `MemoryBank/tasks/TASK_RAG_context_fuel_2026-05-08.md` — координатор всех 13 RAG-подтасков.
4. `MemoryBank/specs/rag_prompts_review_2026-05-08.md` — **самое важное для тебя**: ревью промптов
   с обоснованием правок. Покажет где можно споткнуться + чек-лист уже применённых исправлений.
5. Свой целевой промпт из таблицы выше.

## 🚨 Жёсткие правила (не нарушать)

- ❌ **`pytest` запрещён** — только `common.runner.TestRunner` + `SkipTest`.
- ❌ **CMake** не трогать без явного OK Alex (SQL-миграции — OK, они в `dsp_assistant/migrations/`).
- ❌ **Worktree:** писать ТОЛЬКО в `e:/DSP-GPU/`, НЕ в `.claude/worktrees/*/` — там работа теряется.
- ❌ **git push / tag** — только по явному OK от Alex.
- ❌ `std::cout` / `printf` — если правишь C++, только `ConsoleOutput::GetInstance()`.
- ✅ Не плодить новые сущности — расширяй существующие классы (`HybridRetriever`, `cpp_extras.py`).

## 🧠 Что я уже узнала про инфраструктуру (экономия времени)

**dsp_assistant живёт в `c:/finetune-env/dsp_assistant/`** (не в `e:/DSP-GPU/`!). Структура:
- `agent/tools.py` — `TOOL_REGISTRY` (sync dispatcher через `call_tool`).
- `server/mcp_server.py` — FastMCP, тонкий клиент через HTTP.
- `server/http_api.py` — warm-models backend (BGE-M3 + reranker).
- `retrieval/rag_hybrid.py` — `HybridRetriever.query()` возвращает `list[EnrichedHit]`
  (поля: `target_table, target_id, dense_score, rerank_score, payload, content_text, repo`).
- `db/client.py` — **синхронный** DbClient: `execute / fetchone / fetchall` (НЕТ `fetch` / `fetch_one` / async).
- `target_tables` поддерживает только **`{doc_blocks, use_cases, pipelines}`** — НЕ `symbols`/`test_params`.
- `migrations/` — SQL-миграции с `SET search_path TO rag_dsp, public; ... IF NOT EXISTS`.

**Регистрация нового MCP-tool — В ТРЁХ МЕСТАХ:**
1. `agent/tools.py` → `ToolSpec` в `TOOL_REGISTRY`
2. `server/http_api.py` → POST endpoint
3. `server/mcp_server.py` → `@mcp.tool()` обёртка вокруг HTTP

Если зарегистрировать только в одном — Continue VSCode в Agent mode tool НЕ увидит.

## 💡 Подводные камни (применены в ревью, но повторяю)

1. **psycopg interval interpolation:** `interval '%s seconds'` НЕ работает. Используй
   `make_interval(secs => %s)`.
2. **Async/sync:** orchestrator (context_pack) — async, но `agent/tools.py:call_tool` — sync.
   Решение в промпте: `dsp_context_pack_sync = lambda ...: asyncio.run(dsp_context_pack(...))`.
3. **Reranker scores — это logits**, не вероятности. Cascade threshold в G5 = `2.0`, не `0.5`.
4. **EnrichedHit.target_id** — это id записи в PG, не `payload["use_case_id"]`. Не путать.

## 🎯 Стиль Alex (важно)

- **Кодо** или «Любимая умная девочка» — обращение от Alex.
- Русский, неформально, эмодзи **по делу**.
- **Коротко, max 5 строк** перед действием.
- Признаём ошибки взаимно — без самобичевания.
- **Не переспрашивать очевидное.** Если сомнение — один вопрос с A/B/C, дальше выполняем.
- Болезненная реакция на: запись в worktree, `pytest`, отсебятину в архитектуре, длинные простыни.

## 📦 Граф зависимостей промптов

```
graph_extension     ─── independent (стартуй сразу)
                          │
                          └── G3+G4 опционально нужны context_pack для siblings

mcp_atomic_tools    ─── ждёт C1+C2 (test_params_fill ≥ 200 записей)
                          │
                          ↓
context_pack        ─── ждёт mcp_atomic_tools DONE; опц. graph G3+G4
```

## ✅ Что я успела в этой сессии (готово)

- 3 промпта в `MemoryBank/prompts/` (graph_extension, mcp_atomic_tools, context_pack)
- 1 ревью-документ в `MemoryBank/specs/rag_prompts_review_2026-05-08.md`
- 5 критических правок (C1-C3 + W1, W3-W5) применены прямо в промптах
- Этот handoff

## 🔚 Что осталось от меня (для тебя)

1. Подобрать 1-3 промпта в зависимости от готовности зависимостей.
2. Проверить что `dsp-asst` HTTP-сервер запущен (`dsp-asst serve`).
3. Идти по DoD каждого промпта пошагово, smoke после каждого подэтапа.
4. По завершении — пометить чекбоксы в `MemoryBank/tasks/TASK_RAG_*.md` и обновить
   `MemoryBank/sessions/YYYY-MM-DD.md`.
5. **НЕ git push** без OK Alex.

Удачи, родная. Контекст у тебя ясный, промпты вычитаны. Поехали.

— Кодо, 2026-05-08
