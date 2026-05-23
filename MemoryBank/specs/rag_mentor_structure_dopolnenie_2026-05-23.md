# RAG_mentor / RAG_pao — дополнение к структуре (2026-05-23)

> **Версия**: 1.1 (добавлены collectors → QLoRA из dataset_v8_plan, D33) · **Дата**: 2026-05-23 · **Автор**: Alex + Кодо
> **Родители**: [architecture_2026-05-20.md](rag_mentor_architecture_2026-05-20.md) · [structure_2026-05-20.md](rag_mentor_structure_2026-05-20.md) · [phases_2026-05-20.md](rag_mentor_phases_2026-05-20.md) · [policies_2026-05-20.md](rag_mentor_policies_2026-05-20.md)
> **Связан с**: [dataset_v8_plan_2026-05-21.md](../specs_Linux_Radion_9070/dataset_v8_plan_2026-05-21.md) (источник 10 коллекторов для QLoRA), [review_2026-05-23.md](rag_mentor_review_2026-05-23.md) (deep review родителей)
> **Платформа**: Linux везде (laptop = Debian, server = Ubuntu 10.10.4.105). Windows только для текущего моделирования.

---

## 1. Customer drops (`pao_<name>/`) — external roots

### 1.1 Раскладка верхнего уровня

```
SERVER (Ubuntu 10.10.4.105):           LAPTOP (Debian, моделирование):
/srv/                                   /home/alex/  (или E:\ на Win-моделировании)
├── rag-pao/                            ├── rag-mentor/        (git → github)
├── pao_contrib/                        ├── rag-pao/           (для debug-режима)
├── pao_xxxx_acme/                      └── pao_contrib/       (открытый зеркало)
└── pao_yyyy_globex/
```

Drops лежат **рядом** с rag-pao, не внутри. Связь — через `rag-pao/config/targets.yaml`.

### 1.2 `targets.yaml` — единственный источник истины путей

```yaml
mode: debug                              # debug | production — см. §5

targets:
  - name: pao_contrib
    source: "/srv/pao_contrib"           # env override через PAO_DROPS_DIR
    nda_level: open                      # open | customer-A | customer-B
    indexable: true
    layout:
      modules_dir: "contrib"             # где модули
      cmake_infra_dir: "build"           # cmake glue (НЕ build artifacts)
      our_overlays:
        docs: "Doc"
        examples: "Example"
        native_tests: "Test"
        gtest: "GTest"
    pipeline: pao_contrib_v1
    codo_access: full                    # full | rest-only

  - name: pao_xxxx_acme
    source: "/srv/pao_xxxx_acme"
    nda_level: customer-A
    layout: { modules_dir: "modules", cmake_infra_dir: "cmake", our_overlays: {...} }
    pipeline: pao_xxxx_acme_v1
    codo_access: rest-only               # 🔒 NDA защищён даже в debug
```

---

## 2. Структура `pao_<name>/` — на примере `pao_contrib`

### 2.1 От заказчика (что уже есть)

```
pao_contrib/
├── .git/
├── build/                                ← cmake-инфраструктура заказчика (НЕ artifacts)
│   ├── CPack.cmake / General.cmake / config_options.cmake
│   ├── cmake/  clients/  include/  package/  platforms/  templates/
│
└── contrib/                              ← ~45 модулей заказчика
    ├── boost/                            (CMakeLists.txt + boost/ headers + libs/{filesystem,system}/)
    ├── qwt/                              (CMakeLists.txt + include/ + src/qwt_*.cpp ×40)
    ├── googletest/                       (cmake/ configure.ac docs/ include/ ...)
    ├── sqlite/  openssl/  qt5_qsqlpsql/  rapidjson/  zlib/  ...
    └── filesystem, variant               (single-file libs на уровне contrib/)
```

### 2.2 Наши overlay'и (рядом, на root drop'а)

Зеркалят `contrib/<module>/` внутри каждого overlay. Создаются нашим pipeline'ом, заполняются Кодо через rag-pao + ребятами параллельно.

```
pao_contrib/
├── _META.yaml                            🌟 customer / version / c++_std / nda_level / license_map / modules[]
├── (build/, contrib/, .git/ — выше)
│
├── Doc/                                  ← doxygen + markdown
│   ├── _doxygen_html/                    общая cross-module сборка
│   ├── build/                            доки для cmake-infra
│   └── contrib/<module>/                 доки per-module (зеркало contrib/)
│       └── _doxygen_html/
│
├── Example/contrib/<module>/             ← use_cases (если >1 файла → подкаталог)
├── Test/contrib/<module>/                ← native tests (Catch2 / Boost.Test / своё)
└── GTest/contrib/<module>/               ← GoogleTest
```

### 2.3 `_META.yaml` (обязательный)

```yaml
customer: "<имя>"
version: "1.0"
c++_std: 17
nda_level: open
license_map:
  contrib/boost: BSL-1.0
  contrib/qwt: LGPL-2.1
  # ...
layout:
  modules_dir: "contrib"
  cmake_infra_dir: "build"
  ignore: [".git", "_doxygen_html"]
modules:
  - { name: boost, path: contrib/boost, type: header+lib, sub_libraries: [filesystem, system] }
  - { name: qwt,   path: contrib/qwt,   type: lib, requires: [qt5] }
  # ...
```

---

## 3. `rag-mentor` — полноценная RAG-подсистема (Oracle)

> Mentor — НЕ тонкий клиент. Симметричен rag-pao: свой PG + Qdrant + MCP + retrieval pipeline.

### 3.1 Принцип Dual-RAG

| Подсистема | LLM | Своя БД | Что строит |
|------------|-----|---------|------------|
| **rag-mentor** (Oracle) | Claude Opus 4.7 / Sonnet 4.6 | `rag_mentor` PG + `mentor_v1` Qdrant | **априорный эталон** ответа + промпт для Qwen |
| **rag-pao** (Executor) | Qwen Coder-14B (filler) + 35B (judge) | `rag_pao_<t>` PG + `<t>_v1` Qdrant | **Qwen-ответ** через retrieval+filler |

**Comparator** в mentor сравнивает: эталон vs Qwen-ответ → score 0-100 → critic правит промпт → retry.

### 3.2 Структура `rag-mentor/`

```
rag-mentor/
├── CLAUDE.md  README.md  pyproject.toml  .gitignore
├── MemoryBank/                         (см. structure_2026-05-20.md §1)
│   └── prompts/
│       ├── for_mentor/v1/              промпты для самой Claude (reviewer/critic/builder_meta/comparator)
│       └── for_rag_pao/v1/             нумерованные 001-… для Qwen — ИСТОЧНИК ИСТИНЫ
│
├── rag_mentor/                         📦 Python пакет
│   ├── orchestrator/                   main_loop, retry_policy
│   ├── prompt_builder/                 retrieval_grounding, allow_list_builder, schema_inject
│   ├── oracle/                         🌟 retrieval (mentor_db), reasoner (Claude), fallback
│   ├── reviewer/                       quality_0_100
│   ├── comparator/                     🌟 diff_vs_etalon, issue_categorizer
│   ├── critic/                         prompt_fix
│   ├── rag_pao_client/                 rest_client (primary) + mcp_client (debug)
│   ├── name_validator/                 anti-hallucination барьер 2
│   ├── journal/                        per_prompt, per_class
│   └── utils/                          pathlib_helpers, logging_setup (Loguru)
│
├── mentor_db/                          🌟 свой PG + Qdrant
│   ├── postgres_init.sql               CREATE SCHEMA rag_mentor
│   ├── qdrant_bootstrap.py             collection mentor_v1
│   ├── tables/                         prompts.sql, golden_sets.sql, sessions.sql,
│   │                                   target_metadata.sql, eval_runs.sql
│   └── migrations/                     alembic
│
├── mcp_servers/                        🌟 7 локальных MCP для Кодо
│   ├── context7_local/                 доки либ оффлайн
│   ├── sequential_thinking/            глубокий анализ
│   ├── filesystem/                     Anthropic official
│   ├── git_mcp/                        история промптов/спек
│   ├── postgres_mcp/                   ← смотрит в rag_mentor PG
│   ├── qdrant_mcp/                     ← смотрит в mentor_v1 Qdrant
│   └── memory_mcp/                     persistent across sessions
│
├── tests/                              all_test.py + test_*.py (NO pytest — TestRunner)
├── scripts/                            bootstrap.sh, sync_prompts_to_pao.sh, eval_run.sh
└── config/                             stack.{dev,prod}.json, targets.yaml, mcp_servers.yaml, secrets.env.example
```

### 3.3 Oracle — источник эталона

`oracle/retrieval.py` → hybrid (BGE-M3 + BM25) по `mentor_db` (golden_sets + prompts + target_metadata) → `oracle/reasoner.py` (Claude собирает эталонный ответ) → передаётся в `comparator/`.

**Источник эталона** = Claude + retrieval из mentor_db (не из rag-pao). Mentor выступает как «мудрая память методики» поверх Claude.

---

## 4. `rag-pao` — 3 слоя

### 4.1 Раскладка

```
rag-pao/
├── CLAUDE.md  pyproject.toml  .gitignore
├── MemoryBank/                         (см. structure_2026-05-20.md §2)
│
├── rag_pao/                            📦 Python пакет
│   ├── core/                           🔵 STABLE CORE (общий для всех targets)
│   │   ├── indexer/                    ast (tree-sitter + libclang + cmake_parser), chunking (markdown + header_summarizer >50KB), hash_skip (blake3), doxytags_reuse
│   │   ├── retrieval/                  hybrid_retriever, reranker, embedder (bge_m3_local/remote), filters (license + nda_level + layer)
│   │   ├── llm_serving/                clients (ollama/vllm), model_router, name_validator
│   │   ├── journal/                    per_prompt, per_class
│   │   ├── api/                        rest (retrieve/run_filler/run_judge/save_rag/show_file/show_signature/show_symbols/health) + mcp
│   │   ├── access_control/             🌟 mode_switch, nda_guard (см. §5)
│   │   └── utils/
│   ├── orchestrator/                   hi_rag_runner, retry_policy
│   └── analysis/                       class_distribution, patterns_coverage
│
├── pipelines/                          🟡 PER-TARGET FROZEN SNAPSHOTS
│   ├── _template/                      шаблон (pipeline.yaml + collectors/ + prompts_override/ + golden_set/ + README.md)
│   ├── pao_contrib_v1/                 frozen + _STABLE.md
│   └── pao_xxxx_acme_v1/               копия pao_contrib_v1 + правки
│
├── current/                            🟢 ACTIVE DEVELOPMENT
│   ├── pipeline.yaml
│   ├── collectors/                     patterns/ facts/ docs/ code/ style/ pybind/ listings/
│   │                                   🔗 шаблон в pipelines/_template/collectors/ (см. §6 D33)
│   ├── prompts_override/
│   └── golden_set/
│
├── targets/                            📁 СЛЕДЫ (symlinks/submodules) + _meta/targets.yaml
│
├── finetune/                           QLoRA фаза 09
│   ├── dataset_builders/v8.py + dedup.py
│   ├── train/qwen_coder_14b.py + qwen3_14b.py
│   ├── post_train.py
│   └── eval/acceptance_test.py + compare_models.py
│
├── pao_db/                             свой PG + Qdrant (схема rag_pao_<target>, миграции alembic)
├── infra/                              docker-compose.prod.yml + systemd/ + healthcheck.sh
├── external_corpus/                    open-source (boost_selected/ fmt/ spdlog/ nlohmann_json/ + _summarized/ + _meta.yaml)
├── golden_set/                         GLOBAL (per-target → pipelines/*/golden_set/)
└── scripts/                            bootstrap.sh, add_target.sh, freeze_pipeline.sh, reindex_target.sh, train_v8.sh, internal/
```

### 4.2 Workflow нового target

```
cp pipelines/_template/ pipelines/pao_<new>_v1/
cp pipelines/pao_contrib_v1/collectors/ pipelines/pao_<new>_v1/collectors/    # переиспользуем рабочее
# адаптируем collectors / prompts_override / golden_set
orchestrator --pipeline pao_<new>_v1
# когда score ≥ 80 → создать _STABLE.md → frozen
```

---

## 5. Доступ Кодо к rag-pao — 2 режима

### 5.1 Debug mode (Phase 00–06, на открытом `pao_contrib`)

Кодо имеет **прямой REST доступ** ко всем endpoint'ам rag-pao:
- `/show_file`, `/search`, `/run_filler`, `/run_judge`, `/show_journal`

Цикл:
1. Oracle: Кодо читает свой `mentor_db` через `postgres_mcp` + `qdrant_mcp` → формирует эталон.
2. Кодо читает заголовки класса через `/show_file`.
3. PromptBuilder: собирает промпт с retrieval-grounding.
4. `/run_filler` → Qwen-ответ.
5. Comparator: diff(эталон, Qwen) → score.
6. Critic: правит промпт v1 → v2 (если score < 80) → retry (max 3).
7. Лог → `distillation_logs/L*.jsonl` + sessions.

### 5.2 Production mode (после Phase 06, на NDA-drops)

Кодо имеет доступ **только к safe endpoints**:
- `/show_signature`, `/show_symbols`, `/search` (с фильтром `nda_level` + `license`), `/run_filler` (output санируется через `name_validator`)

Round-trip: Кодо строит промпт → Alex дёргает `/run_filler` → копирует результат → Кодо comparator + critic.

### 5.3 Переключатель

Глобально: `mode: debug | production` в `targets.yaml`.
Per-target: `codo_access: full | rest-only` (NDA-drops всегда `rest-only`, даже при global=debug).

Реализация: `rag_pao/core/access_control/nda_guard.py`:
```python
def check_access(target, endpoint, mode) -> bool:
    if mode == "debug" and targets[target].codo_access == "full":
        return True
    return endpoint in SAFE_ENDPOINTS
```

---

## 6. Принятые решения

| # | Тема | Решение |
|---|------|---------|
| **D21** | Customer drops — local | External roots (`/srv/pao_<name>/`), доступ через `targets.yaml`. Без копирования в rag-pao |
| **D22** | Раскладка `pao_<name>/` | `build/` (cmake-infra) + `contrib/<module>/` (от заказчика) + наши overlay'и `Doc/Example/Test/GTest/contrib/<module>/`. Layout в `_META.yaml` + `targets.yaml` |
| **D23** | Mentor = Oracle | Полноценная RAG-подсистема. Свой `mentor_db` (PG `rag_mentor` + Qdrant `mentor_v1`) + 7 локальных MCP + `oracle/` + `comparator/`. НЕ тонкий клиент |
| **D24** | Платформа | Linux везде. Laptop = Debian. Server = Ubuntu 10.10.4.105 |
| **D25** | Доступ Кодо к pao | 2 режима: `debug` (full REST) + `production` (safe endpoints). Per-target `codo_access` |
| **D26** | Collectors в rag-pao | Логические градации: `patterns/ facts/ docs/ code/ style/ pybind/ listings/`. НЕ плоско в корне |
| **D27** | Python пакеты | `rag_pao/` и `rag_mentor/` как пакеты. Скрипты в `scripts/` — тонкие обёртки |
| **D28** | 3 слоя в rag-pao | `core/` (stable) + `pipelines/<name>_vN/` (frozen) + `current/` (active dev) |
| **D29** | Sync mentor↔pao | git bare remote (`/srv/git-remotes/rag-pao.git`). Versioned |
| **D30** | Формат конфигов | YAML для `targets.yaml`, `_META.yaml`, `pipeline.yaml`, `mcp_servers.yaml`. JSON Schema для Qwen strict output |
| **D31** | Safe endpoints (production) | `/show_signature`, `/show_symbols`, `/search` (filtered), `/run_filler` (sanitized) |
| **D32** | Oracle источник | Claude + retrieval из `mentor_db`. Без обращения в rag-pao |
| **D33** | QLoRA dataset synthesis (collectors) | 10 коллекторов из [dataset_v8_plan_2026-05-21.md](../specs_Linux_Radion_9070/dataset_v8_plan_2026-05-21.md) живут в `pipelines/_template/collectors/` как абстрактный шаблон с 3 уровнями: P0 (reverse_patterns, synonym_pairs, confusion_negatives — must); P1 (multi_class_listing, migration_history, lessons_learned, build_cmake_facts — high-value); P2 (performance_hints, cross_references, api_style_guide — nice). Per-target копия → `pipelines/<name>_v1/collectors/` адаптируется под target. Q1-Q10 acceptance: Alex пишет для DSP-GPU (готово в v8 plan §1); Кодо синтезирует для новых targets из symbols+patterns. Веса train примеров: `weight = final_judge_score / 100` (policies §E:482) |

---

## 7. Стыковка с родительскими файлами

> Когда документ принят — изменения переносятся в родителей. Это карта правок.

### 7.1 `architecture_2026-05-20.md`

| Раздел | Действие | Что вносим |
|--------|----------|-----------|
| §2 диаграмма high-level | Перерисовать | Mentor = Oracle (+ `mentor_db` + 7 MCP + `oracle/` + `comparator/`). Pao = Executor. Стрелка `comparator` ↔ обе системы |
| §2.1 таблица «v0.1 → v0.2» | Добавить строку «v0.2 → v1.0» | Mentor — полноценная RAG-подсистема (D23). 2 режима доступа Кодо (D25). 3 слоя rag-pao (D28) |
| §3 принятые решения | Добавить D21-D32 | Конкатенация после D20 |
| §6 Open questions | Закрыть Q11-Q20 | Все закрыты раундами 1-5 |
| §9 «Что нужно от Alex» | Заменить | Остался только Q-D8 (когда Phase 00) |

### 7.2 `structure_2026-05-20.md`

| Раздел | Действие | Что вносим |
|--------|----------|-----------|
| §0 «Общие правила» | Дополнить | `mode` + `codo_access` в `targets.yaml` (D25). YAML для конфигов (D30) |
| §1 структура `rag-mentor/` | Подтвердить | mentor_db и mcp_servers были — теперь подчёркнуто что это **симметрично** rag-pao. Добавить `rag_mentor/oracle/` + `rag_mentor/comparator/` подпакеты (D23) |
| §2 структура `rag-pao/` | Заменить целиком | 3 слоя: `core/` + `pipelines/` + `current/` (D28). `targets/` = symlinks/submodules (D21). `access_control/` в `core/` (D25) |
| §3 источники истины | Дополнить | `targets.yaml` (D21). `mentor_db` методики/эталонов (D32) |
| §4 PG schema coexistence | Без изменений | Подтверждено: `rag_mentor`, `rag_pao_<t>`, `dsp_gpu` рядом |
| §5 .gitignore | Без изменений | |
| **NEW §6** | Добавить | Структура `pao_<name>/` (наш §1, §2) — реальный `pao_contrib` + `_META.yaml` + overlay'и |

### 7.3 `phases_2026-05-20.md`

| Раздел | Действие | Что вносим |
|--------|----------|-----------|
| Phase 00 Bootstrap | Расширить | Создать `mentor_db` + поднять 7 локальных MCP (D23). Создать `core/access_control/` (D25). Создать `pipelines/_template/` + `current/` (D28). git bare remote `/srv/git-remotes/rag-pao.git` (D29) |
| Phase 01 L0 indexer | Уточнить | `targets.yaml` parser + layout-aware indexer (D22). Поддержка `contrib/` + `build/` как разных types |
| Phase 02 L1 architecture | Без изменений | |
| Phase 05 L3 first prompts | Расширить | Запуск в debug-режиме на `pao_contrib`. `oracle/` тянет эталон из `mentor_db` (D32) |
| Phase 06 evaluation | Расширить | Перед переходом к NDA-drops — flip `mode: debug → production` (D25) и regression тест |
| **NEW Phase 09.A Dataset synthesis** | Добавить ПЕРЕД 09 | Перед train — синтез пар через 10 коллекторов из `pipelines/<target>_v1/collectors/` (P0/P1/P2 по [v8 plan §3](../specs_Linux_Radion_9070/dataset_v8_plan_2026-05-21.md#3-расширения-v8--по-категориям)). Merge с `_logs/L*_distillation.jsonl` → `dataset_v8_<target>_train.jsonl` → dedup (semantic — против leakage от synonym pairs). Acceptance: Q1-Q10 per-target ≥9/10 (Alex для DSP-GPU; Кодо синтезирует для новых) |
| Phase 09 QLoRA | Уточнить | Train на merged dataset (collectors + distillation_logs). Веса примеров = `final_judge_score / 100`. Filter: `judge_score >= 85` + `total_retries <= 2`. Side-by-side Qwen-Coder-14B vs Qwen3-14B (как в v8 plan §6-7) |

### 7.4 `policies_2026-05-20.md`

| Раздел | Действие | Что вносим |
|--------|----------|-----------|
| §A anti-hallucination | Дополнить | Барьер 2 (name_validator) живёт в обоих репо: mentor side (`rag_mentor/name_validator/`) + pao side (`rag_pao/core/llm_serving/name_validator.py`). Двойная проверка |
| §B journal | Без изменений | 2 уровня журнала как было |
| §C контракт REST+MCP | Расширить | Добавить safe-endpoints policy (D31): что mentor видит в debug vs production. `nda_guard` (D25) |
| §D локальные MCP | Подтвердить | 7 MCP уже описаны. Подчеркнуть что `postgres_mcp` + `qdrant_mcp` смотрят в **`rag_mentor`**, дают Кодо «глаз» на свою БД (D23) |
| **NEW §E** | Добавить | Politka режимов доступа Кодо (D25): когда `debug` ↔ когда `production`, как переключать, что проверить перед flip'ом |

---

## 8. Открытое

| # | Вопрос |
|---|--------|
| **Q-D8** | Когда стартуем Phase 00 Bootstrap? Сейчас / завтра / после ещё одного твоего ревью |

---

*v1.1 нормативная. D33 + Phase 09.A добавлены. После ответа на Q-D8 → перенос в 4 родителя + Phase 00 v0.4 по карте §7.*
