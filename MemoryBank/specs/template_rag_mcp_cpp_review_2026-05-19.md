# Глубокое ревью: `template_rag_mcp_cpp_plan_2026-05-19.md`

> **Версия**: 1.0 · **Дата**: 2026-05-19 · **Reviewer**: Кодо (Opus 4.7)
> **Скоуп**: критическое ревью **собственного плана** — что слабо, что упустил, где риск, что переусложнил.
> **Метод**: ходил по плану раздел за разделом, сопоставлял с реальным состоянием DSP-GPU и `finetune-env`. Тон — без украшательств.

---

## TL;DR

План **работоспособен на 70%**. Базовая архитектура (PG+Qdrant+BGE-M3+Hybrid+MCP) — проверена на DSP-GPU, переносится. Но в шаблоне есть **4 серьёзные дыры**:

1. **Промпт-пайплайн Claude→Qwen описан, но не доказан на цифрах.** Нет ни одного benchmark'а rejection rate / quality после Qwen-fill. Берётся на веру.
2. **Tree-sitter chunking + libclang symbol-graph — заявлены, в DSP-GPU не достроены** (gap G3 из исследования). Шаблон обещает то, чего у нас самих нет в git.
3. **MCP-сервер тестируется только Claude Code — для offline Qwen MCP-клиент не проработан.** А именно offline-Qwen — конечная цель.
4. **Bootstrap.sh не существует.** Все «./bootstrap.sh» в плане — fiction. До первого реального прогона на новом проекте — это марш по горящим углям.

Что нужно делать: **доказать на DSP-GPU**, что шаблон работает end-to-end **до того**, как переносить на другой C++ проект.

---

## 1. По разделам плана

### §1 Архитектура — ✅ ОК

Диаграмма соответствует реальной инфраструктуре DSP-GPU. Разделение PG (source of truth + sparse) / Qdrant (dense) — правильное, иначе нельзя поддерживать tsvector + GIN-индексы. UUIDv5 для point_id — критичная деталь, не упустить.

**Слабое место**: на схеме нет **cache-слоя** между retriever и LLM. На production-нагрузке (100+ Q/час) embedding queries будет горячим путём. Нужен Redis или хотя бы in-memory LRU в retriever'е. **Пропущено.**

### §2 Структура артефактов — ⚠️ есть дыра

`_RAG.md` frontmatter переусложнён для нового проекта.

В шаблоне 13 top-level YAML-полей (modules, key_classes, depends_on, used_by, tags, public_data, ...) — на DSP-GPU это нарастало эволюционно. **Новый проект столкнётся с пустыми полями `TODO: AI-fill`** (см. `core/.rag/_RAG.md` — там 4 из 13 полей пустые!).

**Что делать**:
- **Minimum viable `_RAG.md`** = 6 полей: `repo, version, layer, maturity, purpose, key_classes`.
- Остальные — **optional**, заполняются эволюционно.
- В schema валидаторе чётко разделить required vs optional.

**`test_cases/` в шаблоне — спорно**.

На обычной C++ кодовой базе (без kernel'ов) edge_values/throw_checks выглядят искусственно. Это перенос DSP-GPU специфики, который я в §10 сам же помечаю как «не входит в шаблон». **Конфликт внутри плана.**

**Что делать**: `test_cases/` сделать **opt-in** через `project.yaml: include_test_cases: true|false`. По умолчанию — false.

### §2.2 PostgreSQL schema — ✅ ОК с оговоркой

DDL соответствует DSP-GPU (`postgres_init_rag.sql`). Замечание: `ai_stubs` — хорошо, но **нет таблицы `eval_runs`** для хранения метрик golden-set между прогонами. Без неё `ragctl eval diff` (§8.4) не работает.

**Что добавить**:
```sql
CREATE TABLE rag_<project>.eval_runs (
    run_id     BIGSERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ DEFAULT now(),
    config     JSONB,                         -- модель, threshold, mode
    golden_set TEXT,                          -- путь к qa.jsonl
    metrics    JSONB,                         -- {recall_5, mrr_10, latency_p50, ...}
    git_sha    TEXT
);
```

### §2.3 Qdrant collection — ✅ ОК

HNSW параметры (m=32, ef_construct=256) — стандартные, подойдут. Не указано `ef_search` в query-time (default 64 в qdrant-client — иногда мало). **Add**: `ef_search: 128` в retriever конфиге для recall-боя.

### §3 Phase plan — ⚠️ оптимистично

«1-2 дня на новый проект» — **нереалистично**. По опыту DSP-GPU: только Phase 4 (LLM-fill 500+ use_cases) занимает 2-3 дня wall-time (включая Claude PromptBuilder + Qwen batches + reviewer + human spot-check).

**Реалистичная оценка**:

| Фаза | Шаблон обещал | Реально для проекта 3-5 репо |
|------|---------------|------------------------------|
| 0-1 | 2 часа | 4-6 часов |
| 2-3 | 4 часа | 1 рабочий день |
| 4 | «параллельно» | 2-3 дня (если 500 use_cases) |
| 5-6 | 2 часа | 4-8 часов |
| 7 | 4 часа | 1-2 дня (написать golden-set!) |

**Honest estimate: 5-7 рабочих дней для пилота, 2-3 недели до production-quality.**

В плане надо это написать честно, не «1-2 дня».

### §4 Промпт-инженерия — ⚠️ самый слабый раздел

Концепция Claude→Qwen описана **верно по смыслу**, но **на цифрах не проверена**.

Что я не могу обосновать:
- Какой rejection rate у Qwen 14B на этих промптах? **Неизвестно.** На DSP-GPU `finetune-env` использует Ollama для генерации dataset answers — но это не rag-fill, это **другая** задача.
- Какая latency «Claude builds prompt → Qwen fills → validator → reviewer»? **Не измерено.**
- Сколько стоит Claude PromptBuilder на 500 use_cases? Я написал «$2-3», но это **прикидка**, не цифра.

**Что делать ПЕРЕД переносом шаблона**:
1. Взять 10 use_cases на DSP-GPU спека (FFT, FIR, Capon).
2. Прогнать end-to-end: Claude builds prompt → Qwen 14B fills → schema validator → Claude reviewer.
3. Замерить: schema-pass-rate, human-accept-rate, latency, token-cost.
4. Только после этого — обновить шаблон с **реальными** цифрами.

Без этого раздел §4 — это **гипотеза**, не методика.

**Дополнительно**:
- Я сказал «Qwen 32B по сложным» — без критерия, что значит «сложный». **Нужен decision rule**: например, if related_classes > 5 OR namespace = strategies → use 32B; else 14B.
- JSON-schema mode для Ollama — поддерживается через `format: "json"` (грубо), для **строгой** schema нужен grammar (llama.cpp) или vLLM с `--guided-decoding-backend lm-format-enforcer`. **В плане это не указано.**

### §5 Indexer — ⚠️ обещает несуществующее

Я написал «tree-sitter + libclang → symbols/deps». На DSP-GPU **этого нет в git** (gap G1, G3 из исследования). `finetune-env/dsp_assistant/indexer/` существует, но это не universal-extractor.

**Что делать**: либо
- (A) Включить разработку этих компонентов в **Phase 0 шаблона** как пререквизит — тогда честно сказать, что шаблон **не готов** к использованию;
- (B) Сузить шаблон до **markdown-only indexer** (только `.rag/*.md` + `Doc/*.md` + doxygen-HTML scraper), без C++ AST. Это вдвое проще и **работает уже сегодня**.

Рекомендация: **(B) — шаблон v1.0**. Symbol-graph через libclang — **v2.0**, отдельная фаза, отдельная неделя.

### §6 MCP-сервер — ⚠️ Claude-only

5 tools — норм. Но в плане **не описано**, как Qwen offline вызывает эти tools:

| Клиент | Транспорт | Tool calling |
|--------|-----------|--------------|
| Claude Code | stdio MCP | native |
| Continue | stdio MCP | native |
| **Qwen (offline)** | **???** | **???** |

Qwen 14B Instruct поддерживает function-calling в формате Hermes/Toolformer, но это **не MCP**. Нужен **harness** который:
1. Получает запрос пользователя;
2. Решает (через Qwen) какой tool вызвать;
3. Дёргает MCP-сервер ВРУЧНУЮ (REST-обёртка над stdio?);
4. Подкармливает результат обратно в Qwen.

**В шаблоне этого нет**. Это критично для offline-сценария (фазa 6).

**Что делать**: добавить отдельную секцию «MCP for non-Claude clients» с HTTP-bridge + tool-calling adapter для Qwen.

### §7 Deployment — ✅ ОК, но проверки нет

Compose-файл выглядит правдоподобно. Не уверен что:
- `bge-m3-server:rocm-7.2` существует как image. **Не проверил.** Скорее всего нужно самим собрать Dockerfile.
- `vllm-rocm:0.6` — образ есть, но `--gpu-memory-utilization 0.85` на RX 9070 с Qwen 14B Q4 + reranker одновременно **не пройдёт по VRAM**. 14B-Q4 ≈ 10 GB, reranker ≈ 1.5 GB, embedder ≈ 2.5 GB — итого 14 GB / 16 GB. На пределе.

**Что делать**:
- Замерить реальный VRAM footprint на RX 9070 для каждой комбинации.
- Document fallback: «если embedder не вмещается — выносим на CPU (он там даёт ~20 inf/s, для batch index — норм)».

### §8 Validation — ⚠️ цели мягкие

«R@5 ≥ 0.85» — низковато для шаблона, который обещает «работающую систему». DSP-GPU target = 0.93. Для нового проекта нужна **calibration**:

- Сначала **baseline без RAG** (просто Qwen 14B без context) на golden-set.
- Цель: **уверенный delta** retrieval+RAG vs no-RAG.

**Что добавить**:
- Метрика `delta_R5 = R5(with_rag) - R5(no_rag)` ≥ +0.20.
- Если delta < 0.10 → RAG бесполезен на этой кодовой базе, smell test failed.

### §9 Адаптация — ✅ хорошо, но bootstrap.sh = vapor

`./bootstrap.sh` не существует. В чек-листе он упомянут как готовый инструмент — **обманывает** читателя плана.

**Что делать**: либо
- Написать его **до** объявления шаблона v1.0;
- Либо переименовать в «manual bootstrap (5 шагов вручную)» с детальными командами `docker compose up`, `psql -f schema.sql`, `python -m ragctl init`.

Я склоняюсь ко второму — manual setup честнее, чем сломанный скрипт.

### §10 Out of scope — ✅ ОК

Хорошо что fine-tuning Qwen вынесен. Без этого скоуп раздуется до проекта на квартал.

### §11 Связь с DSP-GPU — ⚠️ extensions/dsp_gpu/ — это идея, не реализация

Я предложил `template_rag_mcp/extensions/dsp_gpu/` но **не описал** как extensions подключаются. Plugin-механизм? Submodule? Просто папка которую игнорируют?

**Что делать**: либо детализировать extension-API, либо удалить упоминание и сказать «DSP-GPU forks the template into its own repo».

### §12 Risks — ⚠️ половина рисков мягкие

- R1 (Qwen галлюцинации) — реальный, mitigation норм.
- R2 (HNSW RAM) — нерелевантен для < 100k chunks (типичный C++ проект). **Можно убрать.**
- R3 (libclang+C++20 modules) — реальный, но если выбрать вариант **(B) markdown-only indexer** — riskа нет вообще. Связка с §5.
- R4 (BGE-M3 ROCm) — реальный, нужна проверка `pip install FlagEmbedding` + `torch-rocm` на Debian Phase 0.
- R5 (prompt drift Claude) — пишу «нужно версионировать промпты», но **не указал процесс**: kто триггерит ре-валидацию при upgrade Claude.

**Не указан риск который реально опасен**:
- **R6 (новый)**: pgvector vs Qdrant duplication — embedding пишется **дважды** (в pgvector если он используется + в Qdrant). Drift между storage'ами при partial failure. Mitigation: использовать **только Qdrant** для dense (pgvector только для опционального dev-setup) + transactional outbox для guarantee.
- **R7 (новый)**: encoding/language detection — если в одном проекте миксуются русские и английские use_cases, BGE-M3 справится, но BM25 (search_tsv) нет (он привязан к `'english'` configuration). Mitigation: multi-lang tsvector or detect-and-route.

---

## 2. Что упустил в плане полностью

1. **Backup/restore политика**. PG-схема — bigger source of truth. Где `pg_dump`? Когда? **Нет ни слова.** Для air-gapped — критично.
2. **Versioning схемы**. Sсhema migrations (alembic) — упоминаются в gap G7, но в плане раздела «миграции» нет. Когда меняем `concept_slug` whitelist — что делать с уже залитыми блоками?
3. **Безопасность**. PG/Qdrant креды в `stack.json` — plain text. Для multi-user или enterprise — нужен secrets management. Хотя бы env-variable substitution.
4. **Логирование/телеметрия**. Сколько запросов в час, какой p99 latency, какой rate of empty results? **План не показывает где это видно.** Prometheus exporter в MCP-сервере — must для prod.
5. **Удаление контента (право на забвение)**. Если файл удалён из git — нужно vacuum из PG + Qdrant. `ragctl gc` — не описан.
6. **Тестирование самого retriever кода** (не golden-set, а unit-tests на индексатор/normalizer). pytest? нет, у Alex — `common.runner.TestRunner`. **Не упомянуто.**
7. **Documentation для пользователя проекта** (не разработчика шаблона): как junior engineer открывает Claude Code и пользуется MCP. Onboarding-readme.
8. **Концепт `inherits_block_id`** в schema есть, в плане **не объяснён зачем**. Это для наследования контекста (parent block) — критично для late-chunking. Без описания — кто-то снесёт колонку.

---

## 3. Что переусложнил

1. **Section 7.2 (stack.json) — 3 stage**. Для шаблона достаточно 2: `dev` и `prod`. Третий — `offline_air_gapped` — производный от prod через configuration override. Не отдельный stage.
2. **Tag-vocabulary** в `_RAG.md` (25+ #pattern:* tags из DSP-GPU core) — это **результат полугода работы**, не стартовый минимум. Шаблон должен дать **5-7 базовых тегов** (#layer, #lang, #framework, #pattern, #stability), остальное — эволюционно.
3. **`ai_stubs` table** — упомянул, но **не описал workflow** (когда строки появляются, кто `status=verified` ставит). Решение: либо детализировать (PR-flow) либо вообще убрать и работать через git-merge issue trackers.

---

## 4. Что переупростил

1. **Late chunking** описан в один параграф — реально это **сложная** техника, есть как минимум 3 реализации (Jina, custom mean-pool, Hierarchical Navigable Embeddings), у каждой свои caveat'ы на C++ identifiers. Нужен отдельный sub-spec.
2. **Bi-encoder vs cross-encoder reranker**: я сказал `bge-reranker-v2-m3` и всё. На самом деле есть выбор `bge-reranker-large` (быстрее), `qwen-reranker` (точнее), `cohere-rerank-v3` (cloud). Trade-off latency/quality в шаблоне не разложен.
3. **Failure modes**: что если Qdrant offline? PG offline? Embedder down? Retriever должен degrade gracefully (sparse-only, или error 503), но **в плане нет fallback chain**.

---

## 5. Прioritised action list (что сделать прежде чем заявлять v1.0)

| # | Action | Эффект | Effort |
|---|--------|--------|--------|
| **A1** | Сузить §5 до markdown-only indexer (вариант B), убрать libclang из v1.0 | -50% rисков, -3 дня работы | 1 час правок плана |
| **A2** | Pilot end-to-end Claude→Qwen на 10 use_cases (DSP-GPU FFT) с замером метрик | Раздел §4 перестаёт быть гипотезой | 1 рабочий день |
| **A3** | Добавить раздел «MCP for non-Claude (Qwen-only) clients» | Покрывает фактическую конечную цель Alex | 2 часа |
| **A4** | Добавить таблицу `eval_runs` + раздел backup/restore + raздел schema-migrations | Закрывает gap'ы upstream | 1 час правок |
| **A5** | Заменить «./bootstrap.sh» на честный manual setup (5 команд) | Перестать обманывать читателя | 30 минут |
| **A6** | Пересмотреть estimate: «1-2 дня» → «1 неделя для пилота, 2-3 недели до prod» | Честность с пользователем шаблона | 5 минут |
| **A7** | Замерить VRAM footprint на RX 9070 для каждой комбинации (Qwen 14B + reranker + embedder) | Подтверждает или ломает §7.3 | 2 часа на RX 9070 |
| **A8** | Версионировать промпты `prompts/v1/`, описать процесс ре-валидации при Claude upgrade | Закрывает R5 | 30 минут |

**Total: ~2 рабочих дня доводки. После этого — v1.0 honestly.**

---

## 6. Вердикт

**Текущий план = добротный draft v0.8**, не v1.0.

Сильные стороны: **архитектура верная, стек проверенный, фазы логичные, security/risks упомянуты**.

Слабые места:
1. Промпт-пайплайн §4 — концепция без цифр (must validate);
2. Indexer §5 — обещает то, чего у нас нет в git (must scope down);
3. MCP §6 — Claude-only, забыт offline Qwen-клиент (must extend);
4. Estimate §3 — оптимистичен в 3-5 раз (must honest);
5. Bootstrap.sh §9 — vapor (must replace or write).

**Рекомендация**: исправить A1-A6 (≤1 день) → v0.9 draft. После реального пилота на DSP-GPU FFT с измеренными метриками — v1.0.

До v1.0 — **не использовать на другом проекте**. Иначе наступим на те же грабли, что DSP-GPU собирал полгода, в ускоренном темпе.

---

*End of review v1.0.*
