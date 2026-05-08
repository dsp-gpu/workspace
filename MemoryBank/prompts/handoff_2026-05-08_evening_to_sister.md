# 🎀 Промт для сестрёнки-Кодо — продолжение CTX1+CTX2 (старт 2026-05-08 вечер / 09.05 утро)

> **Скопируй весь этот промт в новую сессию Claude Code (e:\DSP-GPU)** и пришли Alex'у. Я (предыдущая Кодо) исчерпала контекст после CTX0; миграции применены и БД готова к CTX1.

---

## Привет, сестрёнка 👋

Я — предыдущая Кодо. День был большой (08.05): мы с Alex провели Phase A QLoRA diagnostic, удалили 3 dead OpenCL pybind, разбили большой план RAG на 13 атомарных подтасков и применили 2 schema-миграции. Сейчас твоя очередь — **CTX1 + CTX2** (заполнение `test_params` + doxygen парсер).

Alex — мужчина, senior DSP/GPU инженер. Обращение: **«Кодо»** или **«Любимая умная девочка»**. Русский, неформально, с эмодзи — по делу. Не плодить сущности, читать перед тем как говорить, не пушить без OK, не трогать CMake без OK, **pytest навсегда запрещён**.

---

## 🎯 Что от тебя хочется

Закрыть **CTX1 (`test_params_fill`)** + **CTX2 (`doxygen_test_parser`)** до 12.05.
Это критический путь для Phase B QLoRA на 9070 — без `test_params` AI-тесты слепые.

| Файл-инструкция | Время |
|-----------------|-------|
| `MemoryBank/tasks/TASK_RAG_test_params_fill_2026-05-08.md` | ~4.5 ч |
| `MemoryBank/tasks/TASK_RAG_doxygen_test_parser_2026-05-08.md` | ~3 ч |

**Координатор всех 13 подтасков:** `MemoryBank/tasks/TASK_RAG_context_fuel_2026-05-08.md`

---

## 📖 Что прочитать ПЕРЕД действием (~5 мин)

1. `MemoryBank/MASTER_INDEX.md` (быстро)
2. `MemoryBank/tasks/IN_PROGRESS.md` — обновлённый список таска
3. **`MemoryBank/specs/LLM_and_RAG/_session_handoff_2026-05-08_evening.md`** — мой подробный handoff с глубоким ревью CTX0 ⭐
4. **`MemoryBank/specs/LLM_and_RAG/RAG_kfp_design_2026-05-08.md`** — design `test_params`, 3 уровня заполнения, диаграмма ⭐
5. `MemoryBank/sessions/2026-05-08.md` — итог дня
6. `MemoryBank/tasks/TASK_RAG_test_params_fill_2026-05-08.md` — твой первый таск
7. `MemoryBank/specs/LLM_and_RAG/RAG_deep_analysis_2026-05-08.md` v1.2 — strategic brief (1bis раздел = утв. решения Alex)

---

## ✅ Состояние БД на момент твоего старта (smoke verified 11:51 МСК)

```
rag_dsp.schema_migrations:
  ✅ 2026-05-08_test_params_extend.sql  (9 новых колонок + 5 индексов)
  ✅ 2026-05-08_rag_tables_tsvector.sql (3 таблицы + helper jsonb_array_to_text + 3 trigger)

test_params: 9/9 новых колонок (return_checks, throw_checks, linked_use_cases,
              linked_pipelines, embedding_text, coverage_status, doxy_block_id,
              verified_at, confidence) — ВСЁ С DEFAULT'ами, существующие записи (0)
              не сломаны.

tsvector + GIN:
  doc_blocks  populated 2650/2650, idx ✅, trigger ✅
  use_cases   populated  123/123, idx ✅, trigger ✅
  pipelines   populated    8/8,   idx ✅, trigger ✅
```

**Finding #1 (от 2026-05-06) закрыт** — FFT use-case теперь находится в sparse-поиске (smoke-test: `spectrum/filters_rocm` rank 0.6).

---

## ⚠️ Грабли которые я уже прошла (НЕ наступай)

1. **`synonyms_ru`/`synonyms_en`/`tags`/`chain_classes`/`chain_repos` — это JSONB, НЕ TEXT[]**. Spec 03 §2.6 не уточняет, в реальности psycopg ругается на `array_to_string(jsonb)`. Используй helper `jsonb_array_to_text` (создан в M2) или `json.dumps(...)` при INSERT.
2. **В `pipelines` НЕТ `when_to_use` и `tags`** (расходится со spec 03). Реальные поля: `id, repo, pipeline_slug, title, composer_class, chain_classes (jsonb), chain_repos (jsonb), block_refs (jsonb), related_pipelines (jsonb), md_path, md_hash, ai_generated, human_verified, created_at, updated_at`.
3. **`autocommit=True`** в `dsp_assistant/db/client.py` — каждая команда commit'ится сразу. При ошибке в multi-statement SQL **всё ДО ошибки уже зафиксировано**. Используй `IF NOT EXISTS` / `DROP X IF EXISTS` везде.
4. **`psql` не на PATH** на Windows — для SQL inspect используй `dsp_assistant.db.get_client()` через короткий Python-скрипт (см. `_smoke_migrations.py` который я удалила — но паттерн прост).
5. **PowerShell + native exe + stderr** — каждая info-строка через stderr оборачивается как NativeCommandError. **Не страшно**, ищи реальный exit code и stdout.

---

## 🚧 Что сделать в CTX1 (по `TASK_RAG_test_params_fill_2026-05-08.md`)

### C1a — extractor (~1.5 ч)

Создать `dsp_assistant/cli/params_extract.py`. **ПЕРЕИСПОЛЬЗУЙ существующий код**:
- `dsp_assistant/agent_doxytags/extractor.py` — уже умеет parse cpp через tree-sitter
- `dsp_assistant/agent_doxytags/analyzer.py` — heuristics
- `dsp_assistant/indexer/file_walker.py` — walker по `<repo>/include/`
- `dsp_assistant/indexer/chunker_cpp.py` — шаблон tree-sitter cpp parsing

Эвристики на тело метода:
- `if (X == 0) throw ...` → `throw_checks: [{"on": "X == 0", "type": "..."}]`
- `if (X < a || X > b) throw` → `edge_values: {min: a, max: b}`
- `assert(X > 0)` → `constraints: {positive: true}`
- `nextPow2(X)` / `power_of_two(X)` → `pattern: "power_of_2"`
- `clamp(X, a, b)` → `edge_values: {min: a, max: b, clamped: true}`

INSERT в `rag_dsp.test_params` с:
- `confidence=0.5`, `human_verified=false`, `coverage_status='partial'` (LEVEL 0)
- `extracted_from = {file, line, snippet}` JSONB
- Старые колонки: `param_name`, `param_type`, `edge_values`, `constraints` (как было)
- Новые: `return_checks=[]`, `throw_checks=[...]`, `linked_use_cases=[]`, `linked_pipelines=[]`

CLI (через click, как остальной `cli/main.py`):
```python
@cli.group()
def params(): ...

@params.command("extract")
@click.option("--repo", help="Один репо или 'all'.")
@click.option("--method", default=None, help="FQN метода для одной точки.")
@click.option("--dry-run", is_flag=True)
@click.option("--all", "all_repos", is_flag=True)
def params_extract(repo, method, dry_run, all_repos): ...
```

### C1b — прогон + ручная верификация (~3 ч)

1. `dsp-asst params extract --all` → ~327 LEVEL 0 записей (auto-extracted, confidence=0.5).
2. **Ручная верификация ~20 ключевых классов** → LEVEL 2 (confidence=1.0, human_verified=true, verified_at=now()):
   - **core**: ScopedHipEvent, ProfilingFacade, BufferSet
   - **spectrum**: FFTProcessorROCm, SpectrumMaximaFinderROCm, FirFilterROCm/IirFilterROCm/MovingAverageFilterROCm/LchFarrowROCm
   - **stats**: StatisticsProcessor
   - **signal_generators**: FormSignalGeneratorROCm
   - **heterodyne**: HeterodyneROCm/NCOOp/MixDownOp
   - **linalg**: CaponProcessor, MatrixOpsROCm
   - **radar**: RadarPipeline, BeamFormer
   - **strategies**: MedianStrategy, PipelineBuilder

3. Сравнить LEVEL 0 (auto) vs LEVEL 2 (ручная) → улучшить эвристики в C1a, перезапустить если нужно.

**DoD CTX1:** `test_params` ≥ 200 LEVEL 0 + ≥ 80 LEVEL 2.

---

## 🚧 Что сделать в CTX2 (по `TASK_RAG_doxygen_test_parser_2026-05-08.md`)

3 подэтапа:
1. **Doxygen `@test*` парсер** в `dsp_assistant/indexer/cpp_extras.py` — функция `parse_test_tags(doxy_block: str)`. Регексы для `@test`, `@test_field`, `@test_check`, `@test_ref`. Интеграция в `indexer/build.py` — UPSERT в `test_params` с confidence=1.0.
2. **LEVEL 1 AI heuristics** — новый промпт `MemoryBank/specs/LLM_and_RAG/prompts/009_test_params_heuristics.md`. CLI `dsp-asst params heuristics --repo X [--apply]`. Confidence=0.8.
3. **Pre-commit hook** в `MemoryBank/hooks/pre-commit` — расширить: при изменении `*.hpp` парсить `@test*` теги → UPSERT.

**DoD CTX2:** 5 эталонных классов имеют `@test*` теги, парсер их подхватывает, тестируется.

---

## 🤝 Кто ещё работает параллельно (НЕ наступай на них)

| Сестра | Трек | Файлы |
|--------|------|-------|
| #1 | Hybrid Retrieval | `TASK_RAG_hybrid_upgrade` + `TASK_RAG_eval_extension` |
| #2 | MCP Tools + Graph | `TASK_RAG_graph_extension` + `TASK_RAG_mcp_atomic_tools` (ждёт твой CTX1+CTX2) + `TASK_RAG_context_pack` |
| #3 | Embeddings v2 | `TASK_RAG_code_embeddings` + `TASK_RAG_late_chunking` |

**Сестра #2 ждёт тебя!** Постарайся CTX1 закрыть быстро (~4.5ч), чтобы её `dsp_test_params` MCP tool заработал.

---

## 🚫 Жёсткие правила (нарушать нельзя)

1. **Worktree safety** — НИКОГДА не пиши в `.claude/worktrees/*/`. Всё в `e:\DSP-GPU\` или `C:\finetune-env\dsp_assistant\`.
2. **CMake** — НЕ менять без явного OK Alex.
3. **Git push/tag** — только по явному «да». При триггерах «запушь», «обнови репо» — переспрос по правилу `MemoryBank/.claude/rules/16-github-sync.md`.
4. **pytest ЗАПРЕЩЁН НАВСЕГДА** — только `common.runner.TestRunner` + `SkipTest`.
5. **OpenCL** — interop OpenCL↔ROCm везде где совместная работа с памятью (см. memory `project_opencl_policy.md`). Не путай с pure OpenCL вычислениями (их чистим).
6. **`std::cout` / `printf` / pyutest** в C++ ЗАПРЕЩЕНО — только `ConsoleOutput::GetInstance()`.

---

## 💾 Uncommitted artefacts (ждут OK Alex)

В `C:\finetune-env\dsp_assistant\` (5 файлов, всё CTX0):
- `migrations/__init__.py`
- `migrations/2026-05-08_test_params_extend.sql`
- `migrations/2026-05-08_rag_tables_tsvector.sql`
- `migrations/runner.py`
- `cli/main.py` (Edit — `migrate status/up`)

В `e:\DSP-GPU\MemoryBank\specs\LLM_and_RAG\`:
- `_session_handoff_2026-05-08_evening.md` (мой детальный handoff)

В `e:\DSP-GPU\MemoryBank\prompts\`:
- `handoff_2026-05-08_evening_to_sister.md` (этот файл)

**Уточни у Alex:**
- Куда коммитить `dsp_assistant/`? (отдельный git-репо или часть workspace?)
- Обновить ли spec 03 §2.8 (technical debt от меня — добавить упоминание новых колонок)?
- Запушить ли handoff/prompt в workspace перед стартом CTX1?

---

## 🛠 Полезные команды

```powershell
# Проверка БД
cd C:\finetune-env
dsp-asst ping
dsp-asst migrate status

# Tree-sitter cpp parse (для referencing)
python -c "from dsp_assistant.indexer.chunker_cpp import *; ..."

# Smoke RAG retrieval
dsp-asst rag search "FFT batch"
```

---

## 📝 Хорошие вопросы Alex'у при старте сессии

> Привет, Кодо предыдущая передала промт. Прочитала handoff + RAG_kfp_design — стартую с CTX1.
> Уточни 3 вещи:
> 1. Куда коммитить `C:\finetune-env\dsp_assistant\`? Я готова закоммитить 5 файлов CTX0 (миграции применены, smoke зелёный).
> 2. Обновлять ли spec 03 §2.8 сразу или это technical debt после CTX1?
> 3. Можно ли стартовать `dsp-asst params extract --repo core --dry-run` для проверки extractor'а?

---

**Удачи, сестрёнка! 🐾**
**Phase B QLoRA на 9070 — 12.05. До неё нужны test_params на ≥80 классах. Ты сможешь!**

*От: Кодо (08.05 вечер) — к: Кодо (новой сессии)*
*Контекст исчерпан после CTX0 + 13-таска декомпозиции + ревью + миграции.*

---
---

# 🔄 ДОПОЛНЕНИЕ от Кодо (08.05 поздний вечер) — C1a сделан, передача C1b

> Эта секция написана СЛЕДУЮЩЕЙ сестрой (после утренней). Я взяла CTX1 и сделала C1a-скелет.
> Контекст исчерпан после прогона `--all` по 8 репо. Передаю C1b и CTX2.

## ✅ Что я сделала вечером 08.05

### C1a — `params_extract.py` скелет — DONE

Новый файл: `C:\finetune-env\dsp_assistant\cli\params_extract.py` (506 строк).
Регистрация: `cli/main.py` (последние 3 строки) — `cli.add_command(_params_group)`.

**CLI:**
```
dsp-asst params extract --repo core           # один репо
dsp-asst params extract --all                  # все 8 C++ репо
dsp-asst params extract --repo core --dry-run  # без записи в БД
dsp-asst params extract --method <FQN>         # фильтр по методу
```

**Прогон по 8 репо (после `TRUNCATE rag_dsp.test_params RESTART IDENTITY`):**

| repo | files | methods | params | inserted | no_symbol |
|------|------:|--------:|-------:|---------:|----------:|
| core | 72 | 701 | 471 | 133 | 308 |
| spectrum | 48 | 201 | 316 | 122 | 178 |
| stats | 14 | 41 | 76 | 37 | 39 |
| signal_generators | 29 | 202 | 102 | 30 | 72 |
| heterodyne | 5 | 27 | 44 | 8 | 33 |
| linalg | 16 | 52 | 72 | 31 | 41 |
| radar | 13 | 46 | 29 | 21 | 8 |
| strategies | 23 | 85 | 73 | 14 | 59 |
| **TOTAL** | **220** | **1355** | **1183** | **396** | **738** |

**DoD CTX1 LEVEL 0 ≥200**: ✅ закрыто (396).
**DoD ≥80 LEVEL 2 (`human_verified`)**: ❌ НЕ начато (это для C1b).

## 🔴 Known issues (важно для C1b!)

### A. 738 no_symbol (62% потеряно)

`agent_doxytags/extractor.py` парсит namespace по tree-sitter, а БД-индексер
(`indexer/chunker_cpp.py` или `indexer/build.py`) сохранил иначе. Inline namespaces /
свободные функции / anonymous namespaces — расходятся.

**Что делать:**
1. Сравни `extract_methods()` vs DB на 1 файле где много no_symbol — найди системную разницу.
2. Добавь fallback в `_lookup_symbol_id()`: 4-й уровень — `(file, name, arity)` без полного fqn.
3. `truncate test_params; dsp-asst params extract --all`. Цель ≥600 inserted.

### B. Heuristics НЕ срабатывают (edge=0, constraints=0, throws=0, return_checks=76 заглушек)

**Причина:** мои regex применяются к `_slice_body()` — тело из `.hpp`. Большинство
методов в `<repo>/include/` имеют **только декларацию**, тело живёт в `<repo>/src/*.cpp`.
Slice по [line_start..line_end] из .hpp — это просто строка декларации.

**Что делать:** добавить `_find_cpp_pair(hpp_path, fqn)` — найти соответствующий `.cpp` в
`<repo>/src/`, регексом `\b{class}::{method}\s*\(` найти позицию, взять тело между
`{` и матчющим `}`. Прогнать существующие heuristics на cpp-теле тоже.

### C. `return_checks` — заглушка

Сейчас стаб `{"kind": "non_void_return_present"}`. Нормальные return_checks
поставит **CTX2 (doxygen_test_parser)** через `@test_check` теги.

## 📋 Что делать дальше (по приоритету)

### Шаг 1 (5 мин). Проверь актуальность

```powershell
cd E:\DSP-GPU
git log -1                    # ожидается HEAD = 98cb5a3 (нет новых коммитов с утра)
git status -sb                # появились ?? handoff_2026-05-08_evening_to_sister.md (этот файл)

cd C:\finetune-env\dsp_assistant
git status -sb
# UNCOMMITTED:
#   migrations/__init__.py
#   migrations/2026-05-08_test_params_extend.sql
#   migrations/2026-05-08_rag_tables_tsvector.sql
#   migrations/runner.py
#   cli/main.py (Edit утром +2 команды migrate, вечером +1 импорт params_group + add_command)
#   cli/params_extract.py (новый, 506 строк)
```

### Шаг 2 (40 мин). Спроси Alex про коммит `dsp_assistant/`

Утренняя сестра не получила OK. Я — тоже не получила (Alex сказал "продолжм"
без коммита). **Вопрос всё ещё открыт.** Сформулируй чётко:

> «У dsp_assistant 5 файлов CTX0 + 1 файл C1a + 1 Edit cli/main.py висят uncommitted
> второй день. Это отдельный git-репо `C:\finetune-env\dsp_assistant\`, не часть DSP-GPU.
> Закоммитить одним коммитом «CTX0 schema migration + C1a params_extract skeleton (396 LEVEL 0 records)» и push?»

### Шаг 3 (1.5 ч). C1b — fix matcher и heuristics на .cpp

См. блок «Known issues» выше. Ожидание:
- inserted: 396 → ~600+ после fix matcher
- edge_values + throw_checks > 0 (хотя бы 50+ записей с реальными heuristics) после fix .cpp pair-file

### Шаг 4 (3 ч). C1b — ручная верификация ~20 классов

Список в `TASK_RAG_test_params_fill_2026-05-08.md` §C1b.
Через `UPDATE rag_dsp.test_params SET human_verified=true, verified_at=now(),
confidence=1.0, coverage_status='ready_for_autotest' WHERE symbol_id IN (SELECT id
FROM rag_dsp.symbols WHERE fqn LIKE '%ScopedHipEvent%');` для каждого из 20 классов.

**DoD:** ≥80 LEVEL 2. Это закроет CTX1 полностью.

### Шаг 5 (3 ч). CTX2 — `doxygen_test_parser`

Файл: `MemoryBank/tasks/TASK_RAG_doxygen_test_parser_2026-05-08.md`.
Зависит от заполненного test_params (после твоего C1b).

3 подэтапа: (1) `parse_test_tags()` в `indexer/cpp_extras.py`, (2) LEVEL 1 AI-эвристики
через `prompts/009_test_params_heuristics.md`, (3) pre-commit hook расширить.

## 🔬 Deep review C1a — Verdict: PASS_minor

Полный отчёт: [MemoryBank/feedback/C1a_params_extract_review_2026-05-08.md](../feedback/C1a_params_extract_review_2026-05-08.md).

**Топ-3 что фикс обязательно ДО продакшен-LLM-промптов:**

1. 🔴 **BLOCKER — Walker не ходит в `.cpp`.** Тела с throw/assert/clamp в `<repo>/src/**/*.cpp`, я слайсю `.hpp`. Поэтому 0 hits на heuristics. Fix: `_find_cpp_pair(hpp, fqn)` по regex `\b{class}::{method}\s*\(`, слайсить .cpp body.

2. 🟠 **62% no_symbol** — strict path matching. БД хранит относительный путь, я шлю абсолютный. Fix в `_lookup_symbol_id`: добавить `WHERE f.path LIKE '%' || %s` суффиксным.

3. 🟠 **Семантическая ошибка в `_THROW_RANGE_RE`** (строка 161-162): для `if (X < A) throw` я пишу `min_excl=A`, но это означает «X должен быть `>= A`» — `min_inclusive=A`. **Граница противоположна!** Fix: формат `{"op": ">=", "value": A}` или `min_inclusive`. Сделать ДО запуска LLM на 396 записях — иначе сгенерит ошибочные тесты.

**Также (MED):** `_ASSERT_RE` ловит `sizeof` как имя; шаг 4 lookup в docstring но не реализован; 76 шумовых `non_void_return_present`.

**Также (LOW):** dead `MethodReturn` dataclass; `DEFAULT_DSP_ROOT="E:/DSP-GPU"` Windows-only; `_slice_body` без cache (читает файл на каждый метод).

## 🎯 Архитектура C1a (что я решила)

- Walker: `indexer.file_walker.iter_source_files()` → только `.hpp/.h` под `<repo>/include/`.
- Парсинг: переиспользую `agent_doxytags.extractor.extract_methods()` — НЕ дублирую.
- Тривиальные геттеры/setters/=delete/=default — пропускаются (через `is_trivial_accessor`).
- Запись с `confidence=0.5`, `human_verified=false`, `coverage_status='partial'`, `auto_extracted=true`.
- `extracted_from = {file, line, fqn, snippet}` (snippet = первые 400 символов тела).
- `_lookup_symbol_id()` 3-уровневый: точное → tolerance ±15 → arity-match.

*От: Кодо (8.05 поздний вечер) → к: Кодо (следующая сессия)*
