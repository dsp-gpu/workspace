# TASK_RAG_02.5 — Meta sources: CLAUDE.md + CMake + build_orchestration

> **Статус**: ✅ DONE (2026-05-06) · **Приоритет**: HIGH · **Время**: ~8 ч факт · **Зависимости**: TASK_RAG_02 (схема `doc_blocks` + поле `inherits_block_id`)
> **Версия**: v1 (2026-05-06) · Часть плана v3.
> **Исполнитель**: Cline #1 на Sonnet 4.6 → Opus 4.7. Code review: Кодо в основном чате (вердикт A).
>
> **Результат**:
> - 30 meta-блоков в `rag_dsp.doc_blocks`:
>   - 1 build_orchestration (граф зависимостей репо через fetch_dsp_*)
>   - 9 meta_claude (8 C++ + DSP)
>   - 1 meta_cmake_common (root template, 75% boilerplate intersection 8 файлов)
>   - 8 meta_cmake_specific (с `inherits_block_id = dsp_gpu__root__meta_cmake_common__v1`)
>   - 8 meta_targets (BUILD-флаги + deps + targets per-repo)
>   - 2 meta_overview (root CLAUDE.md + DSP doxygen modules index)
>   - 1 meta_rules_index (snapshot 16 правил из MemoryBank/.claude/rules/)
> - 30 .md файлов созданы:
>   - `MemoryBank/.rag/meta/` × 4
>   - `<repo>/.rag/meta/` × 8 C++ × 3 = 24
>   - `DSP/.rag/meta/` × 2 (без cmake)
> - PG ↔ Qdrant консистентны (30=30 по meta-list)
> - Все cmake_specific блоки имеют корректный inherits_block_id
> - Прогон `--all` идемпотентен через source_hash
>
> **Реализация** (в `C:\finetune-env\dsp_assistant\`, не в DSP-GPU):
> - `modes/meta_extractor.py` — главная логика (~37KB)
> - `cli/main.py` — расширен `dsp-asst rag meta build [--repo X | --all]`
>
> **Pilot session log**: `MemoryBank/sessions/2026-05-06_TASK_RAG_02.5_progress.md`

## Цель

Покрыть в RAG то, что v2 пропускал: локальные `CLAUDE.md`, CMake-конфиги (common + specific), описание сборки монорепо («какие репо собирать для задачи X»).

После: AI отвечает на запросы типа:
- «что делает spectrum» → tldr из локального `CLAUDE.md`
- «как собирать spectrum» → cmake_summary.md + cmake_template_common.md
- «какие репо нужны для range-angle radar» → build_orchestration.md (граф зависимостей)
- «где лежат правила про CMake» → meta_rules_index → ссылка на каноничные `MemoryBank/.claude/rules/12-cmake-build.md`

## Структура артефактов

```
E:\DSP-GPU\MemoryBank\.rag\meta\           ← глобальные (1 раз для всего DSP-GPU)
  dsp_gpu_overview.md                      (root CLAUDE.md → block_id: dsp_gpu__root__overview__v1)
  cmake_template_common.md                 (~85% boilerplate из CMakeLists.txt — общий шаблон)
  build_orchestration.md                   (граф репо↔репо, как комбинировать для задач)
  rules_index.md                           (snapshot 16 канонических правил из .claude/rules/)

<repo>/.rag/meta/                          ← per-repo (specific)
  claude_card.md                           (локальный CLAUDE.md = repo tldr)
  cmake_summary.md                         (~15% specific + frontmatter inherits cmake_template_common)
  build_targets.md                         (target'ы + BUILD_* флаги + опциональные deps)
```

**DSP репо дополнительно**:
```
DSP/.rag/meta/
  doxygen_modules_index.md                 (mapping 13 Doxyfile → какие .hpp/.cpp в каждом модуле)
```

## Регистрация в `doc_blocks`

| block_id (пример) | concept | inherits_block_id |
|---|---|---|
| `dsp_gpu__root__meta_overview__v1` | meta_overview | NULL |
| `dsp_gpu__root__meta_cmake_common__v1` | meta_cmake_common | NULL |
| `dsp_gpu__root__build_orchestration__v1` | build_orchestration | NULL |
| `dsp_gpu__root__meta_rules_index__v1` | meta_rules_index | NULL |
| `spectrum__meta__claude_card__v1` | meta_claude | NULL |
| `spectrum__meta__cmake_specific__v1` | meta_cmake_specific | `dsp_gpu__root__meta_cmake_common__v1` |
| `spectrum__meta__build_targets__v1` | meta_targets | NULL |
| `dsp__meta__doxygen_modules_index__v1` | meta_overview | NULL |

## Источники парсинга

### 1. Корневой `CLAUDE.md`
- Source: `E:\DSP-GPU\CLAUDE.md`
- Парс: разбить на h2/h3 → 1 блок на секцию (overview, режим работы, modules-таблица, единые точки, архитектура, MemoryBank).
- Output: `MemoryBank/.rag/meta/dsp_gpu_overview.md` + регистрация в `doc_blocks`.

### 2. Локальный `<repo>/CLAUDE.md`
- Source: `E:\DSP-GPU\<repo>\CLAUDE.md` (8 репо: core / spectrum / stats / signal_generators / heterodyne / linalg / radar / strategies; **DSP** — есть свой).
- Парс: одна карточка-tldr на репо (структура: что здесь, классы, специфика, запреты, ссылки на rules).
- Output: `<repo>/.rag/meta/claude_card.md` + 1 doc_block с concept=`meta_claude`.

### 3. CMake — common template
- Source: 8 файлов `<repo>/CMakeLists.txt`, diff-анализ → выявить общие 85% строк (find_package(hip), add_library STATIC + ALIAS, target_compile_features cxx_std_17, install/export, BUILD_TESTS/PYTHON/python switch'и, git_version target и т.д.).
- Алгоритм: построчный intersection всех 8 файлов + нормализация имён target'ов (Dsp{Repo} → `<TARGET>`).
- Output: `MemoryBank/.rag/meta/cmake_template_common.md` (один блок).
- Полезно: AI отвечает «как организован CMake в проекте».

### 4. CMake — specific per-repo
- Source: тот же `<repo>/CMakeLists.txt` минус общие 85%.
- Что попадает: имя проекта/target, дополнительные `find_package` (hipfft / rocblas / rocsolver / hiprtc), `target_link_libraries` уникальные, `target_compile_definitions` per-repo, `target_sources` список (исходники).
- Output: `<repo>/.rag/meta/cmake_summary.md` + блок с `inherits_block_id = dsp_gpu__root__meta_cmake_common__v1`.
- Frontmatter:
  ```yaml
  inherits: dsp_gpu__root__meta_cmake_common__v1
  specific_only: true
  adds_find_package: [hipfft]
  adds_links: [hip::hipfft]
  modifies_targets: []
  ```

### 5. Build targets per-repo
- Source: `<repo>/CMakeLists.txt` — извлечь все `add_library`, `add_executable`, `target_link_libraries`, `option(BUILD_*)`, секции `if(BUILD_TESTS) add_subdirectory(tests)`.
- Output: `<repo>/.rag/meta/build_targets.md`:
  ```markdown
  ## Targets
  - DspSpectrum (STATIC) — основная библиотека
  - DspSpectrum_tests (если -DBUILD_TESTS=ON)
  - dsp_spectrum_module (Python wheel, если -DBUILD_PYTHON=ON)

  ## BUILD-флаги
  - BUILD_TESTS (default OFF) — собирает tests/
  - BUILD_PYTHON (default OFF) — собирает python/ через pybind11
  - ENABLE_ROCM (default ON) — добавляет defines ENABLE_ROCM=1

  ## External deps
  - hip (REQUIRED)
  - hipfft (REQUIRED для FFTProcessorROCm)
  ```

### 6. Build orchestration (главный артефакт)
- Source: 8 файлов `<repo>/cmake/fetch_deps.cmake` + ручной анализ кросс-репо зависимостей через `fetch_dsp_*()` helpers.
- Парс: для каждого репо собрать список `fetch_dsp_*()` вызовов → построить DAG.
- Output: `MemoryBank/.rag/meta/build_orchestration.md`:
  ```markdown
  ## Граф зависимостей репо

  core (нет depends)
  ├── spectrum (depends: core)
  │   └── stats (depends: spectrum, core)
  ├── linalg (depends: core; uses spectrum для FFT-based linalg)
  │   └── radar (depends: linalg, spectrum, core)
  └── signal_generators (depends: core)
      └── heterodyne (depends: signal_generators, spectrum)

  strategies — composer-репо, depends: spectrum, stats, linalg, radar, signal_generators

  ## Рекомендации по конфигурации (для типовых задач)

  ### «FFT batch на GPU + Python»
  Репо: core, spectrum
  Флаги: -DBUILD_TESTS=OFF -DBUILD_PYTHON=ON -DENABLE_ROCM=1
  Сборка: cmake --build spectrum --target DspSpectrum dsp_spectrum_module

  ### «Range-angle radar pipeline»
  Репо: core, spectrum, linalg, radar
  Флаги: -DBUILD_TESTS=OFF -DBUILD_PYTHON=ON -DENABLE_ROCM=1

  ### «Полный smoke-тест всех модулей»
  Репо: все 8 + DSP
  Флаги: -DBUILD_TESTS=ON -DBUILD_PYTHON=ON -DENABLE_ROCM=1
  ```

### 7. Rules index
- Source: `E:\DSP-GPU\MemoryBank\.claude\rules\*.md` (16 файлов канонических правил).
- Output: `MemoryBank/.rag/meta/rules_index.md` — список с заголовками + `paths:` frontmatter каждого правила (без полного контента — отсылка через ссылки). При retrieval AI видит «есть правило 12-cmake-build для CMake вопросов».

## Шаги реализации

1. **Парсер** `dsp_assistant/modes/meta_extractor.py`:
   - `extract_claude_card(repo)` → markdown карточка из локального CLAUDE.md.
   - `extract_cmake_specific(repo, common_template_path)` → diff vs common.
   - `extract_build_targets(repo)` → target / flags / deps.
   - `compute_cmake_common(all_repos)` → построчный intersection 8 CMakeLists, normalised.
   - `extract_build_orchestration(all_repos)` → граф из fetch_deps.cmake.
2. **CLI** `dsp-asst rag meta build [--repo X | --all]`:
   - Сначала `--all` → пишет глобальные блоки в `MemoryBank/.rag/meta/`.
   - Затем per-repo → пишет `<repo>/.rag/meta/*.md`.
   - Регистрирует все блоки в `doc_blocks` с правильными `inherits_block_id`.
3. **Смок-проверка**:
   - В `doc_blocks` появилось ≥4 root-блока + ≥3 per-repo × 8 = 24+ блока (32 минимум).
   - Запрос «как собирать spectrum для Python» через retrieval поднимает `cmake_specific` + `build_targets` + parent `cmake_common`.
4. **Embedding & Qdrant**: каждый блок эмбеддится BGE-M3 → upsert в `dsp_gpu_rag_v1` с payload `{target_table:"doc_blocks", target_id:block_id, repo:repo}`.

## Definition of Done

- [ ] `MemoryBank/.rag/meta/` содержит 4 файла (overview, cmake_template_common, build_orchestration, rules_index).
- [ ] Каждый из 8 С++ репо имеет `<repo>/.rag/meta/{claude_card.md, cmake_summary.md, build_targets.md}`.
- [ ] DSP репо имеет `<repo>/.rag/meta/{claude_card.md, doxygen_modules_index.md}` (без cmake — у DSP нет своего C++ build).
- [ ] В `doc_blocks` ≥30 новых записей с concept ∈ {meta_*, build_orchestration}.
- [ ] Все specific-CMake-блоки имеют корректный `inherits_block_id` указывающий на `dsp_gpu__root__meta_cmake_common__v1`.
- [ ] Smoke retrieval: запрос «как собирать spectrum» возвращает в top-5 spectrum's `meta_cmake_specific` + `meta_targets` + parent common.
- [ ] CLI `dsp-asst rag meta build --all` идемпотентен (повторный запуск не дублирует блоки, обновляет если source_hash изменился).

## Откат

```sql
DELETE FROM rag_dsp.doc_blocks WHERE concept LIKE 'meta_%' OR concept = 'build_orchestration';
```
+ удалить файлы `**/.rag/meta/`.
+ Qdrant: `qdrant.delete(collection_name="dsp_gpu_rag_v1", points_selector=Filter(must=[FieldCondition(key="payload.target_table", match=MatchValue(value="doc_blocks"))]))` — если потребуется чистая переработка.

## Связано с

- План v3: §3, §5.2, §17.1, §18 — обоснование расширения.
- TASK_RAG_02 (схема `inherits_block_id`).
- Не блокирует TASK_RAG_03..10 — параллельная ветка.
- Блокирует: TASK_RAG_11 (rollout — там используется meta для построения индекса).
- Связанные правила: `MemoryBank/.claude/rules/10-modules.md`, `MemoryBank/.claude/rules/12-cmake-build.md`.
