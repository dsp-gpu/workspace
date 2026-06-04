# finetune-env — MASTER план реорганизации (ООП / SOLID / GRASP / GoF)

> **Единый источник.** Объединяет: план 10.05 («по глаголам»), ревью 11.05 (21 находка + `core/paths.py`),
> ООП-слой 04.06. **Кому:** Alex · **От:** Кодо · **Дата:** 2026-06-04.
> Старые документы остаются как архив; работаем по этому.

---

## 1. Статус и цель

- **Цель:** причесать `/home/alex/finetune-env` в ООП-стиль (SOLID/GRASP/GoF), убрать бардак.
- **Сделано к 04.06:** C:→E: и переезд на Debian — да; Phase B (обучение) — идёт.
- **Технический долг (замер 04.06):** **100** `.py` + **33** `.sh/.ps1` + **87** `.jsonl` + **38** `_report.txt` в корне.
  Дублируют: `psycopg.connect()` — **28** файлов, запись JSONL — **69**, ad-hoc `DSP_GPU_ROOT`/env — **44**.
- **Два слоя реорганизации:**
  - **Слой A** — раскладка файлов по папкам-глаголам (из плана 10.05).
  - **Слой B** — ООП-дизайн классов: убрать дублирование через `core/`-сервисы + базовые классы (новое).

---

## 2. Текущее дерево (как есть, 04.06)

```
finetune-env/
├── Core/                       # phase5_qwen14b_train/, phase6_qwen3coder_30b_moe/  ← фазовые наработки
├── dsp_assistant/              # Python-пакет RAG-сервера (agent, cli, config, db, indexer, llm, modes, retrieval, server, utils, ...)
├── Scripts/                    # rag_setup/ (15+) + qwen_biglora_*.sh
├── output/                     # 30 прогонов обучения (qwen25coder14b_v7_*, ...)
├── Qwen2.5-Coder-14B-Instruct/ # модель (тяжёлое)
├── prompts/, tests/            # legacy? — проверить git log
├── tmp/                        # репо-локальный
├── unsloth_compiled_cache/     # кэш unsloth (не в git)
└── 100×.py + 33×.sh/ps1 + 87×.jsonl + 38×.txt   ← БАРДАК В КОРНЕ
```

---

## 3. Целевое дерево (полное — единая картина)

```
finetune-env/
│  ── корень: ≤10 файлов ──
├── README.md                       # entry-point + быстрый старт
├── CLAUDE.md                       # короткая инструкция Кодо (~40 строк)
├── pyproject.toml                  # пакет dsp-assistant (НЕ ТРОГАТЬ)
├── .gitignore  .env.example
│
│  ── KODO INFRA ──
├── .claude/rules/                  # 00-finetune-workflow / 01-dataset / 02-train / 03-paths
├── MemoryBank/                     # MASTER_INDEX, tasks/, specs/, sessions/, changelog/
│
│  ── ★ core/  — ИНФРА-СЕРВИСЫ (Слой B, lowercase!) ──
├── core/
│   ├── __init__.py
│   ├── paths.py                    # PathRegistry: пути Linux (env → /home/alex default → auto)
│   ├── db.py                       # Database: connect/query, контекст-менеджер (заменяет 28×connect)
│   ├── jsonl.py                    # JsonlWriter/Reader + авто-report (заменяет 69×json.dump)
│   ├── meta.py                     # MetaNormalizer: _meta / class_fqn
│   ├── brief.py                    # BriefCleaner: clean_brief / extract_doxy
│   ├── filters.py                  # PathFilter: is_test_path / is_test_name
│   └── README.md
│
│  ── РАБОЧИЙ КОД ПО ГЛАГОЛАМ ──
├── collect/                        # ~48 коллекторов → dataset_*.jsonl
│   ├── base.py                     # ★ Collector (ABC, Template Method)
│   ├── registry.py                 # ★ реестр name→класс (Factory/Registry)
│   ├── run.py                      # ★ единый CLI: python -m collect.run [--all|name]
│   ├── README.md  INDEX.md
│   ├── docs/                       # collect_doc_*, repo_docs, membank_specs*, dsp_docs, examples*, architecture_docs, prompts_changelog, test_overview
│   ├── code/                       # collect_class_*, method_*, fields_cmake, free_functions, namespace_*, file_grouping, inheritance, pybind*, cpp_files, cpp_impls, ack_advanced, hip_*, build_test_infra
│   ├── tests/                      # collect_test_params_pairs, test_gen
│   ├── pipelines/                  # collect_pipeline_data_flow, arch_levels, reasoning_chains, explicit_patterns
│   ├── usage/                      # collect_usage_*, python_aug, feedback_python, claude_md*
│   ├── anti_galluc/                # collect_negative_pairs, namespace_correction, hard_negatives, refusal_pairs, arch_rationale, explicit_negatives, db_facts
│   └── advanced/                   # collect_patterns_md, code_templates, idioms, math_foundations, error_handling
│
├── enrich/                         # enrich_dataset, enrich_test_gen, enrich_class_summary, watch_enrich
├── assemble/                       # build_dataset_v3, dedup_top_classes, prepare_phase_b, _concat_enriched, snapshot
│                                   #  (имя assemble, НЕ build/ — build/ коллизит с .gitignore + pip/setuptools)
├── ingest/                         # parse_test_tags, ingest_test_tags, generate_rag_manifest, generate_arch_files, apply_doxytags_repo, clean_doxytags_dups, migrate_pgvector_to_qdrant, update_rag_tags_and_claude_md
│
├── train/                          # обучение
│   ├── runner.py                   # ★ TrainRunner + TrainConfig (Facade, заменяет копипасту .sh)
│   ├── train_simple.py             # рабочий baseline
│   ├── train_unsloth_v7_continue.py  train_qwen25_coder.py  train_diag.py
│   ├── post_training.py  merge_lora.py  plot_train_curves.py  preflight_smoke_check.py
│   ├── convert/                    # convert_both_ft.sh, convert_r1_ft_to_gguf.sh (→GGUF)
│   ├── runners/                    # run_with_resume.sh, qwen_biglora*.sh, qwen_cont400, run_full_*, cont_r1_*, run_*_v6 ...
│   └── checkpoints/                # Modelfile_* + (output/ переезжает сюда ПОСЛЕ финиша train)
│
├── eval/                           # inference_compare, inference_test, grounded_inference, validate_inference, eval, smoke_ragas, smoke_analyzer, smoke_ctx4_atomic_tools
│   ├── runners/                    # run_compare_*, run_p2_grounded, post_train.*
│   └── reports/                    # halluc_report.md, *_compare_*.md
│
├── analyze/                        # analyze_class_distribution, analyze_patterns_coverage, db_underrepresented
│   └── reports/
│
├── tools/                          # patch_rag_tags, sync_claude_md_tags, gen_patterns_drafts, clean_dataset, smoke_* (walker_git/ast_dump/extractor/heuristics/patcher)
│
├── infra/                          # start/stop окружения, re_ingest_all.{sh,ps1}, install_git_hooks, download_*
│   └── rag_setup/                  # ★ переезжает ИЗ Scripts/rag_setup/ (15+ файлов одной папкой)
│
│  ── ДАННЫЕ (отдельно от кода) ──
├── data/
│   ├── output/                     # 87 dataset_*.jsonl  + README (каталог)
│   ├── snapshots/                  # dataset_v*_final / v7_train / v7_val (read-only логически)
│   ├── reports/                    # 38 *_report.txt
│   ├── logs/                       # *.log
│   └── golden/                     # golden-set для RAGAs
│
│  ── ТЯЖЁЛОЕ (не в git) ──
├── models/                         # Qwen2.5-Coder-14B-Instruct/, qwen3-8b/, ... (gitignored)
├── phases/                         # ← Core/ переименовать (phase5/phase6 наработки; коллизия с core/)
│
│  ── НЕ ТРОГАТЬ ──
├── dsp_assistant/                  # пакет RAG-сервера (структуру не менять; внутр. пути → os.environ)
└── .venv/                          # venv (НЕ В GIT; нерелокируем — пересоздавать после переездов)
```

> **Коллизия `Core/` ↔ `core/`:** на ext4 разные каталоги, но путают. `Core/` → `phases/` ДО создания `core/`.

> **🖼 Картинки/графики (мои мысли):** loss/eval-кривые (`plot_train_curves.py`) → `train/reports/figures/*.png`; графики бенчмарков/RAGAs/тестов → `eval/reports/figures/*.png`; аналитика датасета → `data/reports/figures/*.png` — единая конвенция `*/reports/figures/`, картинка лежит рядом с глаголом, который её породил (High Cohesion).

---

## 4. Слой A — маппинг файлов (git mv, история сохраняется)

| Источник (корень) | Назначение |
|-------------------|-----------|
| `collect_doc_*, repo_docs, membank_specs*, dsp_docs, examples*, agent_examples, architecture_docs, prompts_changelog, test_overview, doc_rich_pairs, claude_md` | `collect/docs/` |
| `collect_class_*, method_*, fields_cmake, free_functions, namespace_overview, file_grouping, inheritance, pybind*, cpp_files, cpp_impls, ack_advanced, hip_*, build_test_infra, from_rag, rag_v6, more_dataset` | `collect/code/` |
| `collect_test_params_pairs, test_gen` | `collect/tests/` |
| `collect_pipeline_data_flow, arch_levels, reasoning_chains, explicit_patterns` | `collect/pipelines/` |
| `collect_usage_*, python_aug, feedback_python` | `collect/usage/` |
| `collect_negative_pairs, namespace_correction, hard_negatives, refusal_pairs, arch_rationale, explicit_negatives, db_facts` | `collect/anti_galluc/` |
| `collect_patterns_md, code_templates, idioms, math_foundations, error_handling` | `collect/advanced/` |
| `enrich_*, watch_enrich` | `enrich/` |
| `build_dataset_v3, dedup_top_classes, prepare_phase_b, _concat_enriched, collect_dataset, collect_more_dataset` | `assemble/` |
| `parse_test_tags, ingest_test_tags, generate_*, apply_doxytags_repo, clean_doxytags_dups, migrate_pgvector_to_qdrant, update_rag_tags_and_claude_md` | `ingest/` |
| `train_*, run_dynamics_v3, merge_lora, post_training, plot_train_curves, preflight_smoke_check` | `train/` |
| `run_with_resume.sh, qwen_*.sh, run_full_*, cont_r1_*, run_dynamics_*, run_long_train_v6, run_short_test_v6, run_smoke_*` | `train/runners/` |
| `convert_both_ft.sh, convert_r1_ft_to_gguf.sh` | `train/convert/` |
| `inference_*, grounded_inference, validate_inference, eval, smoke_ragas, smoke_analyzer, smoke_ctx4_atomic_tools` | `eval/` |
| `run_compare_*, run_p2_grounded, post_train.{sh,ps1}` | `eval/runners/` |
| `analyze_*, db_underrepresented` | `analyze/` |
| `patch_rag_tags, sync_claude_md_tags, gen_patterns_drafts, clean_dataset, smoke_walker_git, smoke_ast_dump, smoke_extractor, smoke_heuristics, smoke_patcher*` | `tools/` |
| `re_ingest_all.{sh,ps1}, download_qwen25_coder.ps1, post_train.sh` | `infra/` |
| `Scripts/rag_setup/*` | `infra/rag_setup/` (целиком) |
| `*.jsonl` (87) | `data/output/` (snapshot-версии → `data/snapshots/`) |
| `*_report.txt` (38) | `data/reports/` · `*.log` → `data/logs/` |
| `Qwen2.5-Coder-14B-Instruct/` | `models/` · `Core/` → `phases/` · `output/` → `train/checkpoints/` (после финиша train) |
| `main.py` | проверить → `core/` (CLI) или корень |
| **удалить:** `t_fft.py, t_fft_v2.py, Obnova.py, _inspect_schema.py, *.bak*, ~!Data.md` | (legacy) |
| **переименовать (Phase 0a):** `collect_acк_advanced.py` (кириллица) → `collect_ack_advanced.py` | |

---

## 5. Слой B — ООП-дизайн (SOLID / GRASP / GoF)

### 5.1 `core/` — сервисы (SRP, Pure Fabrication, DIP)

| Класс | Ответственность | Заменяет |
|-------|-----------------|----------|
| `PathRegistry` (`paths.py`) | пути Linux (env→/home/alex default→auto), без mkdir на импорте | 44× ad-hoc env + хардкоды |
| `Database` (`db.py`) | connect/query, пароль из env, context-manager | 28× `psycopg.connect()` |
| `JsonlWriter`/`Reader` (`jsonl.py`) | атомарная запись пар + авто `_report.txt` | 69× `json.dump` |
| `MetaNormalizer` (`meta.py`) | `_meta`, `class_fqn` | копипаста нормализации |
| `BriefCleaner` (`brief.py`) | `clean_brief`, `extract_doxy` | копипаста |
| `PathFilter` (`filters.py`) | `is_test_path`, `is_test_name` | копипаста |

`core/paths.py` — готовый дизайн в плане 10.05 / ревью §4.1 (берём как есть).

### 5.2 Коллекторы — Template Method + Strategy

```python
# collect/base.py
class Collector(ABC):                     # Template Method: run() = инвариант
    name: str; output: str
    def __init__(self, db: Database, writer: JsonlWriter): self.db, self.writer = db, writer
    def run(self):
        pairs = self.build_pairs(self.fetch_source())
        self.writer.write(OUTPUT / self.output, pairs, report=True)
    def fetch_source(self): return self.db.query(self.SOURCE_SQL)
    @abstractmethod
    def build_pairs(self, rows) -> list: ...   # ← единственное, что пишет автор
```

```python
# collect/anti_galluc/negative_pairs.py — конкретный коллектор сжат до сути
@register
class NegativePairsCollector(Collector):
    name, output = "negative_pairs", "dataset_negative_pairs.jsonl"
    SOURCE_SQL = "SELECT name, fqn FROM rag_dsp.symbols WHERE ..."
    def build_pairs(self, rows): return [self._typo_pair(r) for r in rows]
```

- **Template Method** — `run()`; **Strategy** — генераторы опечаток `TypoStrategy`; **Registry/Factory** — `registry.py`.
- **OCP** — новый коллектор = подкласс; **LSP** — все взаимозаменяемы; **DIP** — зависят от `Database`/`JsonlWriter`.
- `collect/run.py` (**Controller**) создаёт сервисы и гоняет коллекторы → убирает 48× `__main__` + 48× ручной connect.

### 5.3 Обучение — `TrainRunner` + `TrainConfig` (Facade)

```python
@dataclass
class TrainConfig:
    model: Path; dataset: Path; max_steps: int
    lora_r: int; lora_alpha: int; lora_all_linear: bool
    resume_from: Path | None = None; ...
class TrainRunner:                         # Facade над train_simple + auto-resume
    def __init__(self, cfg: TrainConfig): ...
    def run(self): ...                     # retry+resume логика run_with_resume.sh
```

- **Facade** прячет train_simple + resume-wrapper. `--lora-*` становятся **полями** `TrainConfig` → нельзя «забыть» (ровно баг, убивший ночной прогон 03.06: пропавшие `--lora-*` → r8/r16 mismatch).

### 5.4 Карта принципов → артефакты

| Принцип | Артефакт |
|---------|----------|
| SRP | каждый `core/*` класс; коллектор только `build_pairs` |
| OCP / LSP | подклассы `Collector`, взаимозаменяемы |
| ISP | узкие интерфейсы `Collector` / `TypoStrategy` / `JsonlWriter` |
| DIP | DI `Database`/`JsonlWriter` в коллекторы |
| GRASP Pure Fabrication | `core/db`, `core/jsonl`, `core/paths` |
| GRASP Controller | `collect/run.py`, `train/runner.py` |
| GRASP Creator | `registry.py` |
| GoF Template Method / Strategy / Factory / Facade | `Collector.run` / `TypoStrategy` / `registry` / `TrainRunner` |

### 5.5 `dsp_assistant/` — НЕ ТРОГАТЬ структуру

Внутр. хардкоды путей → `os.environ.get("DSP_GPU_ROOT", "/home/alex/DSP-GPU")` (не через `core/paths` — изоляция пакета).

> **🐧 Linux-only (решение Alex):** проект живёт только на Debian. Из плана/кода убираем **все** Windows-пути (`E:\`, `C:\`, `os.name=="nt"`-ветки). `core/paths.py` — без cross-platform, только Linux: `DSP_GPU_ROOT` default `/home/alex/DSP-GPU`, `FINETUNE_ROOT` default `/home/alex/finetune-env`. Любой `E:\`/`C:\` в скриптах = технический долг на вычистку (Фаза 3).

---

## 6. Критичные находки ревью 11.05 (свёрнуты)

1. **`.venv` нерелокируема** — после любого переезда пересоздавать (`rm -rf .venv && python3 -m venv .venv && pip install -e .`).
2. **Кириллица** `collect_acк_advanced.py` → Phase 0a rename.
3. **`Scripts/rag_setup/`** (15+) — целиком в `infra/rag_setup/` (иначе пропадёт).
4. **HF_TOKEN** в `offline_pack_download_list` был в открытом виде — держать только в `.env.local`.
5. **BGE-M3 dim = 1024** (не 768) — фикс в зависимых спеках.
6. **mkdir на импорте** в `core/paths` — антипаттерн, только `ensure_dirs()` явно.

---

## 7. Фазы (безопасно — обучение не ломаем)

| Фаза | Действие | Когда |
|------|----------|-------|
| **0a** | rename кириллицы; удалить `t_fft*, *.bak, Obnova, _inspect_schema`; `Core/`→`phases/` | после финиша train |
| **0** | `git add -A && commit` snapshot; ветка `reorg-2026-06` | — |
| **1** | каркас папок + `core/{paths,db,jsonl}.py` | — |
| **2** | `git mv` по §4 | — |
| **3** | патч путей: 44 файла → `core.paths`; вычистить **все** Windows-хардкоды `E:\`/`C:\` (Linux-only) | — |
| **4** | ООП Слой B: `Collector` база + реестр + `TrainRunner` — **инкрементально**, smoke после каждого кластера | — |
| **5** | `CLAUDE.md` + `.claude/rules/` + `.gitignore` + smoke (collect→build→train) | — |

**Порядок A→B обязателен:** сначала разложить (git mv), потом классы.

---

## 8. DoD

- [ ] Корень ≤10 файлов; 100 .py разнесены
- [ ] `core/` (lowercase) с 6 сервисами; `Core/`→`phases/`
- [ ] 0 хардкодов `E:\`/`C:\`; пути через `core.paths`
- [ ] Кириллица + legacy удалены
- [ ] `Collector` база + ≥1 кластер + реестр (`python -m collect.run --all`)
- [ ] `TrainRunner`+`TrainConfig` (защита от забытых `--lora-*`)
- [ ] `dsp_assistant/` структурно не тронут; внутр. пути → env
- [ ] git history сохранён (только `git mv`)
- [ ] smoke зелёный: collect → build → 1 train-шаг

---

## 9. 🔬 Глубокое ревью этого плана

**Сильное:**
- Долг измерен (28/69/44 дубля) — ООП обоснован цифрами, не «для красоты».
- Слой B напрямую лечит реальный баг 03.06 (забытые `--lora-*` → `TrainConfig`-поле).
- `git mv` + ветка = полная обратимость.

**Риски / спорное (требует решения):**
1. **Объём.** 100 .py + ООП-рефактор за раз — большой. **Митигация:** Слой A (раскладка) можно смерджить отдельно; Слой B — инкрементально, кластер за кластером. Не делать всё одним PR.
2. **`build_dataset_v3.py`** — 51 хардкод-источник (план 10.05 §Фаза3). Патч путей тут самый хрупкий → отдельный шаг + ручная проверка diff.
3. **Коллекторы могут НЕ быть на 100% единообразны.** База `Collector` подойдёт ~80%; нестандартные (multi-output, без БД) оставить функциями или добавить хук `fetch_source` override. Не ломать через силу под паттерн (риск over-engineering — Alex против лишних сущностей).
4. **`output/` (30 прогонов, активный train).** Переносить в `train/checkpoints/` ТОЛЬКО после финиша; иначе оборвём запись чекпойнтов.
5. **`main.py` назначение неизвестно** — прочитать до переноса (не угадывать).
6. **dsp_assistant импорты** — если внутри есть `from <root_script> import ...`, переезд корневых .py их сломает. **Проверить grep `import` внутри пакета ДО Фазы 2.**
7. **`.ps1` раннеры** — Windows-only, на Debian не работают. Решить: оставить (дом) или удалить (только .sh)? — открытый вопрос §10.
8. **Двойной `anti_galluc/`** в плане 10.05 (был дубль-блок) — в этом master оставлен ОДИН, верно.

**Вывод ревью:** план готов к исполнению при условии — (1) Слой A и B разными этапами; (2) Фаза 0 grep-проверка импортов dsp_assistant; (3) `Collector`-база не натягивается силой на нестандартные коллекторы.

---

## 10. Вопросы к Alex (нужно решение)

1. **Глубина Слоя B сейчас:** (A) `core/` + `Collector` база (80% долга, быстро) → потом B `TrainRunner`+Strategy. Рекомендую **A сначала**.
2. **`Core/`** (phase5/phase6, бенчмарки+sql+results): → `phases/`, или вынести архивом из репо?
3. **`.ps1` раннеры** (Windows): оставить для дома или удалить (Debian = только .sh)?
4. **`prompts/`, `tests/`:** проверить git log → удалить если legacy?
5. **Старт:** ветку `reorg-2026-06` создаём после финиша текущего train (≈14:00)?

---

## 11. Связи

- Архив-план: `specs_Linux_Radion_9070/finetune_env_reorg_plan_2026-05-10.md`
- Архив-ревью: `specs/finetune_env_reorg_review_2026-05-11.md`
- ООП-черновик: `specs/finetune_env_oop_reorg_plan_2026-06-04.md` (этот master его заменяет)
- Таски: `tasks/TASK_FINETUNE_phase_B_*.md`
- Train: `output/qwen25coder14b_v7_biglora_cont600_1632/` · БД `llm_bench.runs` id=20,21

---

*MASTER · 2026-06-04 · Кодо · план 10.05 + ревью 11.05 + ООП-слой 04.06 в одном месте*

---

## 12. Авто-загрузка инструкций finetune-env (ответ на вопрос Alex)

> **Вопрос:** «Стартую в DSP-GPU, потом перехожу в finetune-env. Как сделать, чтобы ты читала эти инструкции при переходе? В DSP-GPU/CLAUDE.md прописать или отдельными rules?»

**Как это работает у Claude Code:** при работе с файлом/папкой Claude **автоматически** читает `CLAUDE.md` из текущего каталога и всех родительских (вверх по дереву). Соседний проект (DSP-GPU) при этом **не** подхватывается — у `finetune-env` своего `CLAUDE.md` сейчас нет, поэтому инструкции не грузятся.

**Решение (3 уровня, делаем в Фазе 4-5):**

1. **`finetune-env/CLAUDE.md`** (главное) — короткий (~40 строк): структура по глаголам, `core/paths.py`, запрет pytest, Linux-only. Claude читает его автоматически, как только ты открываешь любой файл в `finetune-env/`. **Это и есть ответ — отдельный CLAUDE.md в проекте, не в DSP-GPU.**

2. **`finetune-env/.claude/rules/`** — детальные path-scoped правила (00-workflow / 01-dataset / 02-train / 03-paths). Грузятся когда трогаешь файлы по их `paths:`-маске.

3. **Указатель в `DSP-GPU/CLAUDE.md`** — там уже есть секция «🧪 Сопутствующий проект — finetune-env». Дополняем одной строкой: «при работе в finetune-env — правила в `finetune-env/CLAUDE.md` + `.claude/rules/`». Это страховка, если начинаешь из DSP-GPU.

**Итог:** не нужно дублировать всё в DSP-GPU/CLAUDE.md. Создаём `finetune-env/CLAUDE.md` (Фаза 4) — и при переходе в проект инструкции грузятся сами. DSP-GPU/CLAUDE.md — только короткий указатель.