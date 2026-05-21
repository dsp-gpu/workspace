# RAG_mentor — Policies: anti-hallucination + journal + контракт + локальные MCP

> **Версия**: 0.2 · **Дата**: 2026-05-20 · **Автор**: Кодо для Alex
> **Родительский документ**: [rag_mentor_architecture_2026-05-20.md](rag_mentor_architecture_2026-05-20.md)
> **Скоуп**: жёсткие правила работы — приоритет точности №1, формат журнала per-class, контракт REST/MCP, какие локальные MCP-сервера подключить Кодо.

---

## §A — Anti-hallucination policy (приоритет №1 Alex)

> Alex: «1. **точность** (галлюцинации на известных переменных свести к нулю), 2. на кодинге ошибки свести к минимуму, 3. всё остальное по убыванию».

### A.1 Что считается «галлюцинацией»

| Тип | Пример | Степень |
|-----|--------|---------|
| **Несуществующее имя метода/класса** | Qwen пишет `obj.parse_json_safe()` когда в L2.symbols только `parse_json()` | 🔴 критично |
| **Несуществующий параметр** | `@param flags` — но в сигнатуре нет `flags` | 🔴 критично |
| **Несуществующий throw** | `@throws std::range_error` — но в теле метода такого throw нет | 🟡 средне |
| **Generic placeholder** | `@brief Function that does something` (вода) | 🟡 средне |
| **Несуществующий related class** | `@see SomeOtherClass` — класса в проекте нет | 🟡 средне |
| **Несуществующая константа** | `@test { values=[kMaxBufferSize] }` — символа в `public_data.constants` нет | 🔴 критично |

### A.2 4 защитных барьера (по порядку)

#### Барьер 1 — Retrieval grounding (на стороне prompt-builder)

Prompt всегда **явно** перечисляет:
- какие методы есть у класса (из L2),
- какие параметры у каждого (из libclang/tree-sitter),
- какие throw'ы видны в теле (из AST анализа),
- какие related классы (из includes/deps),
- какие константы в `public_data` (из `_RAG.md`).

В user-prompt **жёстко** написано:
```
Используй ТОЛЬКО имена из следующего allow-list.
Любое имя вне списка = ошибка.
allow-list-methods: [parse, dump, contains, ...]
allow-list-params: {parse: [text, allow_exceptions], ...}
allow-list-throws: {parse: [std::invalid_argument], ...}
```

#### Барьер 2 — Name validator (после Qwen output, до сохранения)

```python
def name_validator(qwen_json, ctx) -> ValidationResult:
    """Проверяет что все имена в выходе Qwen есть в retrieved context."""
    used_names = extract_names_from_doxygen(qwen_json)
    allowed = ctx.symbols.flatten_names()
    forbidden = used_names - allowed
    if forbidden:
        return Fail(forbidden, "Hallucinated names: " + ", ".join(forbidden))
    return Ok()
```

**Жёсткое правило**: если `forbidden` непуст → **немедленный retry**, без передачи Judge'у. Лимит retry = 3, затем escalate to human.

#### Барьер 3 — Qwen35B Judge с inversion check

Помимо оценки качества, Judge получает **provocation**:
```
Найди в этом doxygen-блоке имя метода/параметра/класса, которого НЕТ в attached symbol table.
Если нашёл — answer "HALLUCINATION_DETECTED" + список.
```

Этот ход — отдельный sub-call к Judge, кроме общей оценки качества.

#### Барьер 4 — Golden-set «trap» вопросы

В `golden_set_L3.jsonl` добавляем **специально провоцирующие** запросы:
```
{"id": "L3-TRAP-001", "query": "Что делает метод FFTProcessorROCm::ProcessUltimate?", "expected": "method_not_exists"}
```

Qwen должен ответить **«метода нет»**, а не выдумывать что он делает. Если выдумал — failed trap.

Регулярный прогон trap'ов → метрика `hallucination_rate` в `mentor_db.eval_runs`.

### A.3 Метрики (target)

| Метрика | Целевое значение MVP |
|---------|----------------------|
| `name_validator_pass_rate` | ≥ 95% (5% retry допустимо) |
| `judge_hallucination_detected_rate` | ≤ 2% |
| `trap_failure_rate` | ≤ 5% |
| `human_reject_rate_on_names` | ≤ 1% (выявленные руками после релиза) |

### A.4 Forbidden terms (запрещённая лексика)

В каждом prompt — секция `forbidden_terms` со списком:
- общие placeholder'ы: «typical usage», «common pattern», «for example, ...» без конкретики;
- неточные слова: «could», «might», «possibly», «usually»;
- не-нашиh: «namespace std::experimental», «boost::detail» (если не в impl), `// TODO`, `// FIXME`.

Validator проверяет ratio `forbidden_terms` / `total_words` < 5%.

### A.5 Что делать если barriers не помогают

Если конкретный класс после 3 retries всё ещё галлюцинирует:
1. Класс помечается `escalate_to_human=true` в `mentor_db.sessions`.
2. Класс попадает в `_logs/manual_review_queue.md`.
3. **Не блокирует** прогон других классов.
4. Alex руками открывает, правит prompt в `prompts/v1/builder/`, перезапускает.
5. Если та же проблема повторяется на ≥5 классах — issue в `MemoryBank/tasks/`.

---

## §B — Journal format (2 уровня после правок Alex 2026-05-20)

> Alex (исходный Q8): «ментор пишет промт, rag_pao делает, получает результат и фиксирует в rag_pao/..../001_название + журнал с описанием + ссылки если нужно на код и прочее».
>
> Alex (2026-05-20 в structure): «в папку rag-mentor/MemoryBank/prompts/ нужно сделать два каталога: промы для себя и каталог для rag_pao; в rag_pao вести журнал с описанием и действиями».

**Решение — 2 уровня журнала**:

| Уровень | Где живёт | Что фиксирует |
|---------|-----------|---------------|
| **Per-prompt journal** | `rag-pao/MemoryBank/prompts/v1/NNN_<topic>.journal.md` | **жизнь одного промпта**: к каким классам применяли, какие были правки (v1 → v1.1 → v2), общая статистика качества |
| **Per-class session** | `rag-pao/.rag/<target>/sessions/NNN_<Class>_<date>.md` | **что получилось для одного класса**: какой промпт использовали, retry'и, judge score, final output |

Эти два уровня **дополняют** друг друга и **перекрёстно ссылаются**.

### B.1a Per-prompt journal — формат

`rag-pao/MemoryBank/prompts/v1/001_doxygen_simple_class.journal.md`:

```markdown
---
prompt_id: 001
prompt_name: doxygen_simple_class
version: v1
created: 2026-05-22
last_updated: 2026-05-30
total_applied: 47
classes_passed: 42
classes_escalated: 5
avg_judge_score: 86
avg_retries: 1.3
---

# Journal — prompt 001 (doxygen_simple_class) v1

## Назначение
Генерация doxygen-блока для **простых классов** (без шаблонов, без virtual, ≤ 10 публичных методов).

## Когда применяется
- `class_complexity_score < 30` в L2.symbols
- `template_params_count == 0`
- `public_methods_count <= 10`

## История применений

### Batch 1 (2026-05-22) — pilot 5 классов nlohmann/json
| Class | Session | Judge | Retries | Status |
|-------|---------|-------|---------|--------|
| `basic_json` | [001_basic_json_2026-05-22.md](../../.rag/nlohmann_json/sessions/001_basic_json_2026-05-22_abc.md) | 88 | 1 | filled |
| `json_pointer` | [002_json_pointer_...](../../.rag/.../002...) | 91 | 0 | filled |
| `adl_serializer` | [003_adl_serializer_...](...) | 76 | 3 | escalated |
| `byte_container_with_subtype` | ... | 89 | 1 | filled |
| `ordered_map` | ... | 84 | 1 | filled |

→ **Pilot вывод**: средний score 85.6, 1 escalation на 5 = 20% (выше целевых 10%). Critic правил промпт: добавил forbidden_terms `_safe`, `_v2`, explicit allow-list throws.

### Batch 2 (2026-05-26) — full nlohmann/json
... всё остальное

## Правки промпта в этой версии

| Date | Что изменилось | Reason |
|------|---------------|--------|
| 2026-05-22 | + forbidden_terms `_safe`, `_v2`, `_pretty` | Hallucinated method names |
| 2026-05-24 | + явный allow-list throws | Hallucinated `std::range_error` |
| 2026-05-30 | → переезд в v2 (полный refactor для template classes) | scope outgrew simple-only |

## Ссылки на код
- Source prompt: [001_doxygen_simple_class.md](001_doxygen_simple_class.md)
- Schema: [../for_rag_pao/schemas/doxygen_block.schema.json](...)
- Critic prompts which fixed это: [.../critic/critic_prompt_fix.md](...)

## Distillation rows produced
- В `_logs/L3_distillation.jsonl`: строки 1, 2, 4, 5 (3 escalated)
- Эти 4 строки → готовы к QLoRA dataset
```

### B.1b Per-class session — формат

`rag-pao/.rag/<target>/sessions/NNN_<Class>_<YYYY-MM-DD>_<short_hash>.md`:

```markdown
---
session_id: 001
target: nlohmann_json
class_fqn: nlohmann::basic_json
date: 2026-05-21T14:30:00+03:00
layer: L3
phase: 05
mentor_version: rag-mentor@abc1234
pao_version: rag-pao@def5678
prompt_version: v1
filler_model: qwen2.5-coder-14b-q4
judge_model: qwen3.6-35b-q4
reviewer_model: claude-sonnet-4-6
critic_model: claude-opus-4-7
total_retries: 1
final_judge_score: 88
final_reviewer_score: 91
human_verified: false
status: filled
---

# Session 001 — `nlohmann::basic_json` (L3 description)

## Context retrieved

- L1 architecture: `arch/C3_component.md` (~2 KB)
- L2 self symbols: 47 methods
- L2 deps (top 3): `nlohmann::json_pointer`, `nlohmann::adl_serializer`, `nlohmann::detail::iter_impl`
- L0 fewshot: Boost.JSON `boost::json::value` (~3 KB), Eigen `Matrix` (~2 KB), DSP-GPU `FFTProcessorROCm`

## Attempts

### Attempt 1 (16:32:14)

**Prompt** (truncated, full → [prompt_001_a1.md](./prompts/prompt_001_a1.md))
```
<system>...
<user>... primary_class: nlohmann::basic_json
allow-list-methods: [parse, dump, contains, ...]
...
```

**Qwen filler output**: [qwen_001_a1.json](./outputs/qwen_001_a1.json)

**Name validator**: ❌ FAIL
- forbidden names: `parse_json_safe`, `dump_pretty_v2`
- correction note: methods don't exist — use only `parse`, `dump`

**Critic action**: добавил explicit list of methods в prompt + forbidden_terms `_safe`, `_v2`

### Attempt 2 (16:34:51)

**Prompt** (с правкой): [prompt_001_a2.md](./prompts/prompt_001_a2.md)

**Qwen filler output**: [qwen_001_a2.json](./outputs/qwen_001_a2.json)

**Name validator**: ✅ pass
**Schema validator**: ✅ pass
**Qwen judge**: score 88/100. Note: «good doxygen, lacks specific edge_values for parse».
**Claude reviewer**: score 91/100. Note: «excellent, no hallucinations, examples match L2 symbols».

→ **saved**: [../L3_descriptions/classes/basic_json.md](../L3_descriptions/classes/basic_json.md)
→ **gtest skeleton** (L3b): [../L3_descriptions/tests/basic_json_test.cpp](../L3_descriptions/tests/basic_json_test.cpp)

## Links

- Source header: `targets/nlohmann_json/include/nlohmann/json.hpp` (lines 1234-1890)
- Doxytags pre-skeleton (from `12_DoxyTags_Agent_Spec`): не использовали (header уже хорошо документирован)
- Related sessions: [005_json_pointer_...](./005_json_pointer_2026-05-22_xyz.md)

## Distillation log entry

```jsonl
{"session": 1, "prompt": "prompts/prompt_001_a2.md", "qwen14b_out": "outputs/qwen_001_a2.json", "judge_score": 88, "reviewer_score": 91, "verified": false}
```

→ written to: `_logs/L3_distillation.jsonl` line 1
```

### B.2 Journal directory

```
rag-pao/.rag/<target>/sessions/
├── 001_basic_json_2026-05-21_abc123.md
├── 001_basic_json_2026-05-21_abc123/
│   ├── prompts/
│   │   ├── prompt_001_a1.md
│   │   └── prompt_001_a2.md
│   └── outputs/
│       ├── qwen_001_a1.json
│       └── qwen_001_a2.json
├── 002_json_pointer_2026-05-21_def456.md
└── ...
```

**Нумерация** — глобальная per-target, инкрементальная. Не сбрасывается между фазами.

### B.3 Зачем это нужно (Alex's цель)

> «получим набор документов для рабочей супер локальной кодовой базы, чтобы её обучить»

- **Journals = тренировочный dataset для QLoRA**: каждый успешный attempt = sample.
- **Voice-over для будущих моделей**: видим что conкретно правили, что Critic сказал — модель учится на ошибках.
- **Аудит-trail**: спустя месяцы можно ответить «почему этот doxygen такой?» — открыли journal, всё видно.

---

## §C — Контракт RAG_mentor ↔ rag-pao

> Alex: «сервер — всегда наш!! Вариант A — и можно Гибрид».

### C.1 Принцип

- **Self-hosted всегда**. Никаких OpenAI/Together/OpenRouter для Qwen.
- **Anthropic API** — единственный «внешний» сервис, и то опционально (потом dolphin/local Claude если выйдет).
- **REST primary, MCP опционально**.

### C.2 REST API (rag-pao выставляет, rag-mentor дёргает)

```yaml
# rag-pao/retrieval/api/rest_server.py — FastAPI

POST /retrieve
  body: { layer: "L3", query: "...", top_k: 5, filters: {repo: "nlohmann"} }
  → { chunks: [{score, content, path, fqn, payload}, ...] }

POST /retrieve_for_L3                         # specialized helper
  body: { class_fqn: "nlohmann::basic_json" }
  → { arch_brief, symbols_self, symbols_deps, fewshot }

POST /run_filler
  body: { model: "qwen2.5-coder-14b", prompt: {...}, schema: {...} }
  → { json: {...}, latency_ms: 2300, tokens: {in: 1200, out: 450} }

POST /run_judge
  body: { model: "qwen3.6-35b", target_class: "...", candidate: {...} }
  → { score: 88, notes: "...", hallucination_detected: false, hallucinated_names: [] }

POST /save_rag
  body: { target: "nlohmann_json", layer: "L3", class_fqn: "...", content_md: "...", session_id: 1 }
  → { saved_path: ".rag/nlohmann_json/L3/classes/basic_json.md", session_path: "..." }

POST /name_validator
  body: { candidate: {...}, ctx_symbols: [...] }
  → { ok: true|false, forbidden: [], suggestions: {forbidden_name: closest_allowed} }

GET  /health
  → { pg: ok, qdrant: ok, ollama: ok, models_loaded: ["qwen-coder-14b"], vram_free_mb: 6500 }

GET  /version
  → { rag_pao: "0.2.0", db_schema: "1", qdrant_collection: "nlohmann_json_v1" }
```

**Авторизация**: localhost-only по умолчанию. Если remote — Bearer token из `.env`.

### C.3 MCP server (опционально, для Claude Code interactive debug)

`rag-pao/retrieval/api/mcp_server.py` выставляет те же endpoints как MCP tools:
- `mcp_search`, `mcp_find_symbol`, `mcp_show_class`, `mcp_use_case`, `mcp_health`.

Claude Code конфиг (`~/.claude/mcp_servers.json` или `.mcp.json` в rag-mentor):
```json
{
  "mcpServers": {
    "rag-pao-nlohmann": {
      "command": "python",
      "args": ["-m", "rag_pao.retrieval.api.mcp_server"],
      "env": { "RAG_PAO_TARGET": "nlohmann_json" }
    }
  }
}
```

### C.4 Когда какой использовать

| Сценарий | Канал |
|----------|-------|
| Batch прогон orchestrator.py | REST |
| Alex руками отлаживает в Claude Code | MCP (видит контекст в чате) |
| Distillation logger пишет JSONL | filesystem (rag-pao пишет напрямую) |

### C.5 Fallback chain

```
1. REST (primary)
   ↓ если 5xx или timeout
2. retry 1 раз (exponential backoff)
   ↓ если опять fail
3. mark session as "rag_pao_down", escalate to human
   (не молча падаем — пишем в journal)
```

---

## §D — Локальные MCP-сервера для Кодо

> Alex: «нужно как минимум подключить локальные Context7 & глубокий анализ. Если что-то ещё посоветуешь подключить для локальной AI напиши».

### D.1 Обязательный список (для Phase 01)

| MCP | Источник | Зачем |
|-----|----------|-------|
| **context7-local** | [github.com/upstash/context7](https://github.com/upstash/context7) | актуальные доки библиотек без интернета (DSPy, llamaindex, transformers, ...) |
| **sequential-thinking** | [github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) tree/main/src/sequentialthinking | «глубокий анализ» — длинные многоходовые рассуждения через MCP |
| **filesystem** | Anthropic official `@modelcontextprotocol/server-filesystem` | работа с файлами rag-mentor + rag-pao + targets/* |
| **git** | Anthropic official `@modelcontextprotocol/server-git` | git-операции внутри rag-mentor (history, blame, diff) |
| **postgres** | Anthropic official `@modelcontextprotocol/server-postgres` | Claude видит схемы PG (`rag_mentor`, `rag_pao_<t>`) — может писать SQL без угадывания |
| **qdrant** | [github.com/qdrant/mcp-server-qdrant](https://github.com/qdrant/mcp-server-qdrant) | Claude видит коллекции Qdrant, может делать тестовые поиски |

### D.2 Рекомендую дополнительно

| MCP | Источник | Зачем |
|-----|----------|-------|
| **memory** | [github.com/modelcontextprotocol/servers/tree/main/src/memory](https://github.com/modelcontextprotocol/servers) | persistent memory между сессиями Claude Code (свой knowledge graph) |
| **fetch** | Anthropic official `@modelcontextprotocol/server-fetch` | HTTP fetch (когда нет интернета для WebFetch) — locally cached docs |
| **time** | Anthropic official `@modelcontextprotocol/server-time` | корректные timestamps в journal (timezone-aware) |
| **rag-pao** (custom) | наш собственный (см. §C.3) | Claude дёргает retriever и Qwen напрямую из IDE для отладки |

### D.3 Конфиг (для rag-mentor)

`rag-mentor/config/mcp_servers.yaml`:
```yaml
mcpServers:
  context7-local:
    command: npx
    args: ["-y", "@upstash/context7-mcp"]
    cache_dir: "./mcp_cache/context7"

  sequential-thinking:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"]

  filesystem:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem",
           "${HOME}/rag-mentor",
           "${HOME}/rag-pao",
           "${HOME}/rag-pao/targets"]

  git:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-git",
           "--repository", "${HOME}/rag-mentor"]

  postgres:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-postgres",
           "postgresql://localhost/rag_mentor"]

  qdrant:
    command: python
    args: ["-m", "mcp_server_qdrant"]
    env:
      QDRANT_URL: "http://localhost:6333"

  memory:
    command: npx
    args: ["-y", "@modelcontextprotocol/server-memory"]
    env:
      MEMORY_FILE_PATH: "${HOME}/rag-mentor/MemoryBank/.mcp_memory.json"

  rag-pao-nlohmann:
    command: python
    args: ["-m", "rag_pao.retrieval.api.mcp_server"]
    env:
      RAG_PAO_TARGET: "nlohmann_json"
```

### D.4 Что подключать НЕ надо (для self-hosted принципа Alex)

- ❌ **OpenAI MCP** — нарушает self-hosted.
- ❌ **Slack/Discord MCP** — лишний шум.
- ❌ **Gmail/Calendar MCP** — не задача.
- ⚠️ **GitHub MCP** — только если authentication работает с твоего GitHub аккаунта.

---

## §E — Журнал как датасет для QLoRA

Журнал из §B автоматически становится тренировочным датасетом:

```python
# rag-pao/finetune/prepare_dataset.py
def journal_to_qlora_sample(session_md_path: Path) -> dict:
    metadata = parse_yaml_frontmatter(session_md_path)
    attempts = parse_attempts(session_md_path)
    final = attempts[-1]
    return {
        "system": load(final.prompt_path).system,
        "user": load(final.prompt_path).user,
        "assistant": load(final.output_path).json_str,
        "weight": metadata.final_judge_score / 100.0,
        "verified": metadata.human_verified,
    }
```

Фильтр перед train:
- `final_judge_score >= 85`
- `total_retries <= 2` (не учим на трудных случаях)
- `human_verified = true` ИЛИ `final_reviewer_score >= 90`

---

*End of policies spec v0.2*
