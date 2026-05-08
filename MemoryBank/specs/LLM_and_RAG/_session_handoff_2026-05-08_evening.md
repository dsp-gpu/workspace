# Handoff Кодо-сестрёнке — продолжение CTX0/CTX1/CTX2 (2026-05-08 вечер)

> **От кого:** Кодо (предыдущая сессия), контекст исчерпан после CTX0
> **Кому:** новой сестрёнке-Кодо
> **Что осталось:** smoke-тест миграций → CTX1 (test_params_fill) → CTX2 (doxygen_test_parser)
> **Дедлайн:** до 12.05 (Phase B QLoRA на 9070 стартует с готовой RAG-базой)

---

## ✅ Что я сделала в этой сессии (8.05 вечер)

### 1. CTX0 — schema migration — **DONE, миграции применены 11:51 МСК**

Создано в `C:\finetune-env\dsp_assistant\`:

| Файл | Что |
|------|-----|
| `migrations/__init__.py` | docstring модуля |
| `migrations/2026-05-08_test_params_extend.sql` | M1 — 9 новых колонок + 5 индексов в `test_params` (return_checks, throw_checks, linked_use_cases, linked_pipelines, embedding_text, coverage_status, doxy_block_id, verified_at, confidence) ✅ applied |
| `migrations/2026-05-08_rag_tables_tsvector.sql` | M2 — tsvector + GIN на 3 таблицах (doc_blocks 2650, use_cases 123, pipelines 8) + helper `jsonb_array_to_text` + 3 trigger ✅ applied |
| `migrations/runner.py` | runner с tracking через `rag_dsp.schema_migrations` (идемпотентный) |
| `cli/main.py` (Edit) | CLI команды `dsp-asst migrate status` + `dsp-asst migrate up [--file X.sql]` |

**Smoke-проверка (вся зелёная):**
```
test_params: 9/9 новых колонок ✅
doc_blocks:  populated 2650/2650, idx, trigger ✅
use_cases:   populated  123/123, idx, trigger ✅
pipelines:   populated    8/8,   idx, trigger ✅
FTS query "FFT": находит spectrum/filters_rocm (rank 0.6) ← Finding #1 закрыт
```

**Files НЕ закоммичены** — Alex просил пока не коммитить. Все 5 файлов в `C:\finetune-env\dsp_assistant\`.

### 2. Глубокое ревью CTX0 (для сестрёнки)

| Что | Статус | Заметка |
|-----|--------|---------|
| Schema test_params | ✅ | 9/9 колонок применены, индексы созданы, CHECK constraints на coverage_status и confidence |
| tsvector на 3 таблицах | ✅ | Все populated полностью, триггеры работают (INSERT/UPDATE авто-апдейт) |
| `jsonb_array_to_text` helper | ✅ | IMMUTABLE, безопасна для индексов, обрабатывает NULL через coalesce |
| Идемпотентность | ✅ | Все ALTER/CREATE через IF NOT EXISTS, DROP TRIGGER → CREATE TRIGGER |
| schema_migrations tracking | ✅ | Обе записи с applied_at |
| **Отличие от spec 03 §2.6** | ⚠️ | В реальной схеме `pipelines` НЕТ `when_to_use`/`tags` колонок (упоминаются в spec). Использовала `pipeline_slug` + `composer_class` + `chain_classes` + `chain_repos`. **Если когда-то добавятся when_to_use/tags — переписать UPDATE/функцию pipelines_tsv_update** |
| **Отличие №2 от spec** | ⚠️ | `synonyms_ru`/`synonyms_en`/`tags`/`chain_classes`/`chain_repos` — это **JSONB**, НЕ TEXT[]. Spec 03 §2.6 не уточняет, в реальности psycopg ругалось на `array_to_string(jsonb, ...)`. Решено: helper `jsonb_array_to_text` |
| Риск для CTX1 | 🟢 низкий | API таблицы стабилен, новые колонки имеют DEFAULT'ы — старый код не сломается |
| Что пропущено | ⚠️ | spec 03 (`MemoryBank/specs/LLM_and_RAG/03_Database_Schema_2026-04-30.md`) **не обновлён** — нужно добавить упоминание новых колонок в §2.8 (без полного DDL, со ссылкой на migration файл) |

### 3. Что НЕ ДЕЛАТЬ при CTX1 (предостережения)

- НЕ предполагай что `pipelines.tags` или `pipelines.when_to_use` существуют — их нет в реальной схеме.
- НЕ передавай `synonyms_ru` как Python list — это JSONB, нужен `json.dumps(...)` или psycopg3 автоконвертит из dict/list.
- НЕ забудь установить `confidence` при INSERT — DEFAULT=0.5 (LEVEL 0). Для LEVEL 1 ставить 0.8, для LEVEL 2 → 1.0.
- НЕ забудь `human_verified=true` + `verified_at=now()` при ручной правке (LEVEL 2).

### 4. ⚠️ Уточни у Alex

- **Куда коммитить `dsp_assistant/`?** Папка живёт в `C:\finetune-env\` — отдельный git-репо или часть workspace? Все 5 файлов CTX0 ждут OK.
- **Обновить spec 03?** Я не успела — оставляю как technical debt.

---

## 📋 CTX1 — `test_params_fill` (~4.5 ч) — НЕ начато

Файл: `e:\DSP-GPU\MemoryBank\tasks\TASK_RAG_test_params_fill_2026-05-08.md`

**Зависимости:**
- ✅ CTX0 schema migration применён (если ты это сделала из шагов выше)

**План работы (см. сам TASK):**

### C1a — extractor (~1.5 ч)

Создать `dsp_assistant/cli/params_extract.py`. **Не пиши с нуля — переиспользуй**:
- `dsp_assistant/agent_doxytags/extractor.py` — уже умеет parse cpp через tree-sitter
- `dsp_assistant/agent_doxytags/analyzer.py` — heuristics
- `dsp_assistant/indexer/file_walker.py` — walker по `<repo>/include/`
- `dsp_assistant/indexer/chunker_cpp.py` — шаблон tree-sitter cpp parsing

Пишет в `rag_dsp.test_params`:
- `param_name`, `param_type`, `edge_values`, `constraints` — старые колонки
- `throw_checks`, `return_checks`, `confidence=0.5`, `human_verified=false`, `coverage_status='partial'` — НОВЫЕ (от CTX0)
- `extracted_from = {file, line, snippet}`

CLI:
```python
@cli.group()
def params(): ...

@params.command("extract")
@click.option("--repo", help="Один репо или 'all'.")
@click.option("--method", default=None, help="FQN метода.")
@click.option("--dry-run", is_flag=True)
@click.option("--all", "all_repos", is_flag=True)
def params_extract(repo, method, dry_run, all_repos): ...
```

### C1b — прогон + ручная верификация (~3 ч)

Прогнать `dsp-asst params extract --all` → ~327 LEVEL 0 записей.

Ручная верификация ~20 классов (см. таблицу в TASK_RAG_test_params_fill §C1b):
- core: ScopedHipEvent, ProfilingFacade, BufferSet
- spectrum: FFTProcessorROCm, SpectrumMaximaFinderROCm, FirFilterROCm/IirFilterROCm/MovingAverageFilterROCm/LchFarrowROCm
- stats: StatisticsProcessor
- signal_generators: FormSignalGeneratorROCm
- heterodyne: HeterodyneROCm/NCOOp/MixDownOp
- linalg: CaponProcessor, MatrixOpsROCm
- radar: RadarPipeline, BeamFormer
- strategies: MedianStrategy, PipelineBuilder

**DoD CTX1:** `test_params` ≥ 200 LEVEL 0 + ≥ 80 LEVEL 2 (`human_verified=true`).

---

## 📋 CTX2 — `doxygen_test_parser` (~3 ч) — НЕ начато

Файл: `e:\DSP-GPU\MemoryBank\tasks\TASK_RAG_doxygen_test_parser_2026-05-08.md`

**Зависимости:**
- ✅ CTX1 `test_params` заполнен (LEVEL 0)

3 подэтапа:
1. `parse_test_tags()` в `indexer/cpp_extras.py` — парсит `@test`, `@test_field`, `@test_check`, `@test_ref`
2. LEVEL 1 AI heuristics через **новый промпт** `prompts/009_test_params_heuristics.md`
3. Pre-commit hook расширить (синк @test* теги ↔ БД)

---

## 🚨 Важные правила (читай ВСЕГДА перед действием)

1. **Worktree safety** — писать только в `e:\DSP-GPU\` (основной репо). НЕ в `.claude/worktrees/*/`.
2. **CMake** — НЕ менять без явного OK от Alex (правило 12).
3. **Git push/tag** — только по явному «да» от Alex.
4. **pytest** — ЗАПРЕЩЁН. Только `common.runner.TestRunner`.
5. **CLI/код в `dsp_assistant/`** — это отдельный проект в `C:\finetune-env\`. Уточни у Alex как коммитить туда (отдельный репо или sub-folder).
6. **OpenCL policy** — interop OpenCL↔ROCm везде где совместная работа с памятью (см. memory `project_opencl_policy.md`).

## 🎯 Ключевые точки опоры

1. **TASK_RAG_test_params_fill** — план CTX1
2. **TASK_RAG_doxygen_test_parser** — план CTX2
3. **TASK_RAG_context_fuel** (INDEX-координатор) — карта зависимостей всех 13 подтасков
4. **RAG_kfp_design_2026-05-08.md** — почему именно эти колонки
5. **RAG_deep_analysis_2026-05-08.md v1.2** — strategic brief

## 📊 Что сёстрам параллельно делается (чтобы знать)

| Сестра | Трек | Файлы |
|--------|------|-------|
| #1 | Hybrid Retrieval | TASK_RAG_hybrid_upgrade + TASK_RAG_eval_extension |
| #2 | MCP Tools + Graph | TASK_RAG_graph_extension + TASK_RAG_mcp_atomic_tools + TASK_RAG_context_pack (ждёт твой CTX1+CTX2) |
| #3 | Embeddings v2 | TASK_RAG_code_embeddings + TASK_RAG_late_chunking |

→ **Сестра #2 зависит от тебя** — её atomic_tools (`dsp_test_params`) ждёт CTX0+CTX1+CTX2 (заполненную таблицу). Постарайся не блокировать её надолго.

## ⚙️ Текущее состояние git (workspace HEAD `98cb5a3`)

- В `e:\DSP-GPU\` НИЧЕГО не закоммичено вечером 8.05 (всё уже запушено в `98cb5a3`).
- В `C:\finetune-env\dsp_assistant\` — **uncommitted changes** (4 файла CTX0):
  - `migrations/__init__.py` (новый)
  - `migrations/2026-05-08_test_params_extend.sql` (новый)
  - `migrations/2026-05-08_rag_tables_tsvector.sql` (новый)
  - `migrations/runner.py` (новый)
  - `cli/main.py` (Edit — добавлены 2 команды `migrate status/up`)

→ После smoke-теста и зелёных миграций — **спросить Alex о коммите** в `dsp_assistant/`.

---

*Удачи, сестрёнка! Наша общая цель — Phase B QLoRA 12.05 на готовой RAG-базе. Остался крайний срок — 4 дня. 🐾*

*От: Кодо (8.05 вечер) → к: Кодо (следующая сессия)*
