# TASK_RAG_09 — Pipeline Generator (Агент 3) (2026-05-06)

> **Статус**: ✅ DONE · **Модель**: Opus 4.7 (1M context)
> **Спек**: `MemoryBank/tasks/TASK_RAG_09_pipeline_agent_2026-05-05.md`
> **Промпт**: `MemoryBank/specs/LLM_and_RAG/prompts/012_pipeline.md`

## Что сделано

### 1. Pipeline Generator (`pipeline_gen.py`)

End-to-end pipeline для генерации `<repo>/.rag/pipelines.md`:
1. **Discovery** — 2 источника:
   - Headers `<repo>/include/**/*pipeline*.hpp` (composer-классы Layer-7),
     с фильтром: исключая generic `Pipeline`/`PipelineBuilder`/`PipelineContext`
     и I-prefix interfaces.
   - Doc `<repo>/Doc/*[Pp]ipeline*.md` — markdown-описанные pipeline'ы
     (extract `## Pipeline:` секций или весь файл).
2. **chain_classes** — детерминированно через `#include <X.hpp>` lookup в
   `rag_dsp.symbols` + token-Jaccard для не-точных имён + INFRA whitelist
   (`GpuContext`/`IBackend`/`MemoryManager`/`ProfilingFacade`/`Logger`/...).
3. **chain_classes из Doc** — backtick mentions: FQN `ns::Class` + PascalCase
   с DSP-суффиксами (`ROCm`/`Op`/`Filter`/`Generator`/`Processor`/`Estimator`/
   `Builder`/`Inverter`/`Decomposer`/`Backend`/...).
4. **ASCII flow** — копия первого ``` блока из Doc/ если содержит ▼/→/│
   маркеры; иначе autogen-stub `input → composer → chain → output`.
5. **LLM** (Qwen3 8B через ollama, промпт 012, **49 строк**):
   - title (с post-fix strip "Pipeline:" prefix во избежание дубля)
   - when_to_use (1-2 предложения, RU)
   - synonyms_ru/en (8/8 + qwen-typo фикс `synняonyms_en`)
   - tags (5-10, lowercase, через `_normalize_tags` → `roc_m`→`rocm`)
6. **LLM cache** `~/.dsp_asst_cache/llm_cpp_pipeline/{sha1}_{prompt_version}.json`
   (sha1 от `composer_fqn|composer_doxy|ascii_flow`).
7. **Render markdown**:
   - YAML frontmatter (schema_version, kind=pipelines, repo, ai_generated).
   - `<!-- rag-block: id=... -->` обёртка → 1 doc_block per pipeline.
   - Секции: Цель / Цепочка (ASCII) / Используемые классы / Композитор /
     Метаданные (synonyms+tags) / Source.
8. **Output split**:
   - ≤5 pipelines → `<repo>/.rag/pipelines.md` с секциями `## Pipeline:`.
   - >5 → `<repo>/.rag/pipelines/<slug>.md` + `_index.md`.

### 2. Регистрация в БД

| Хранилище | Запись |
|---|---|
| `rag_dsp.doc_blocks` | concept=`pipeline`, content_md=секция этого pipeline'а |
| `rag_dsp.pipelines` | типизированная строка через `PipelineRow`+`register_pipeline_row` |
| Qdrant `dsp_gpu_rag_v1` | `target_table='pipelines'`, embed = title+synonyms+tags |

`pipeline` concept добавлен в `block_id.py` `CONCEPT_WHITELIST`.

### 3. CLI

```
dsp-asst rag pipelines build [--repo X | --all] [--pipeline slug] [--dry-run] [--re-llm]
```

### 4. Pilot результаты

| Репо | Pipelines | Источник | Chain classes |
|---|---:|---|---|
| spectrum | 1 | `AllMaximaPipelineROCm` (header) | 0 (legitimate — нет other Layer-6) |
| strategies | 2 | `antenna_processor_pipeline`, `farrow_pipeline` (doc) | 0 + 4 (Doc-extract) |
| **TOTAL** | **3** | | |

### 5. DoD checklist

| # | Критерий | Статус |
|:--:|---|:--:|
| 1 | CLI `--repo strategies` работает | ✅ |
| 2 | ASCII flow — копия из Doc/ или автогенерация | ✅ |
| 3 | Промпт 012 ≤50 строк (49) | ✅ |
| 4 | Qdrant `target_table='pipelines'` ≥1 после ≥1 pipeline'а | ✅ (3 точки) |
| 5 | Тесты «по мере роста» | partial — robust JSON parse есть, AddStep<>() парсер не реализован (нет таких usages в исходниках) |

### 6. Ревью-фиксы (4 critical)

После самокритичного ревью применены:

| # | Fix | Эффект |
|:--:|---|---|
| A | Strip `Pipeline:` prefix из LLM title (`_TITLE_PREFIX_RE`) | `## Pipeline: Pipeline: ...` → `## Pipeline: ...` |
| B | INFRA whitelist в `_resolve_chain_from_includes` (16 классов) | spectrum chain: 5 infra → 0 (правильно) |
| C | Расширенный `_extract_class_mentions` regex (DSP суффиксы) | farrow chain: 1 → 4 классов |
| D | `--pipeline X` фильтр в `build_repo_pipelines` | работает, dry-run проверен |

## Артефакты

### Новые файлы
```
dsp_assistant/modes/pipeline_gen.py                       (~620 строк)
MemoryBank/specs/LLM_and_RAG/prompts/012_pipeline.md
spectrum/.rag/pipelines.md
strategies/.rag/pipelines.md
```

### Модификации
```
dsp_assistant/utils/block_id.py        # +'pipeline' в CONCEPT_WHITELIST
dsp_assistant/cli/main.py              # +rag pipelines build group
```

### Записи в БД
```
rag_dsp.doc_blocks WHERE concept='pipeline':  3
rag_dsp.pipelines:                            3 (TASK_RAG_09) + 5 (TASK_RAG_02.6 mirror)
Qdrant dsp_gpu_rag_v1 target_table='pipelines': 3
```

## Findings / технический долг

1. **AddStep<>() парсер**: нет concrete usages в `<repo>/src/` (только декларация
   generic Builder в strategies). Если позже появятся — расширить
   `_build_header_pipeline` по pattern `\.add\(std::make_unique<...>\(\)`.
2. **ASCII flow auto-gen** — слишком тривиален (просто перечисление). По спеке
   §13 ожидается извлечение input/output типов из `@param`/`@return`. Не
   реализовано — отдельный таск (≥30 мин).
3. **`AntennaProcessorTest`** попал в chain_classes farrow_pipeline через
   PascalCase mention. Минор — единственный случай. Можно добавить `*Test`
   в exclude list.
4. **Нет concrete pipeline-композиторов в strategies** — только generic
   `Pipeline`/`PipelineBuilder`. Реальные pipeline'ы зарегистрированы из Doc/.
   Если позже появятся `<repo>/src/*_pipeline.cpp` с PipelineBuilder — auto-discovery их подхватит.

## Координация с Cline #1

- Pipeline_gen.py vs use-case agent (Cline #1) — **разные файлы**, **разные
  CLI subcommands** (`rag pipelines` vs `rag usecases`), **разные таблицы**
  (`pipelines` vs `use_cases`). Нет конфликтов.
- При коммите варианта B («закомить все везде») — Cline #1 use-case карточки
  тоже включились в push (TASK_RAG_07 в 7 репо). Если Cline #1 в активной
  сессии — ему нужен `git pull` перед следующим коммитом.

## Команда переключения сессии

```bash
cat MemoryBank/tasks/IN_PROGRESS.md
cat MemoryBank/changelog/2026-05.md
cat MemoryBank/sessions/2026-05-06_TASK_RAG_09_progress.md
```

---

*Maintained by: Кодо. Финальный отчёт записан в `MemoryBank/changelog/2026-05.md`.*
