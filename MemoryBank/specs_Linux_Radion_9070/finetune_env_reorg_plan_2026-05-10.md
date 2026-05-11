# finetune-env reorganization plan — `core/` + папки по действиям

> **Текущий бардак:** 97 .py + 76 .jsonl + 15 runners + 10 папок в корне.
> **Архитектура аналогии:** как `e:\DSP-GPU\` — есть `core/` (фундамент) + рабочие папки по типам задач.
> **В finetune-env:** `core/` (общая инфра) + папки по **глаголам**: collect / enrich / build / train / eval / ingest / analyze / postprocess / tools / infra.
> **Maintainer:** Кодо main #1
> **Пути:** Windows = `E:\finetune-env\` (был `C:\` до миграции 11.05); Debian = `/home/alex/finetune-env/`.
> **Ревью:** см. `MemoryBank/specs/finetune_env_reorg_review_2026-05-11.md` (21 находка + cross-platform `core/paths.py`).

---

## 🔍 Inventory сейчас (бардак)

| Категория | Кол-во | Где |
|-----------|-------:|-----|
| `collect_*.py` (генераторы пар) | **48** | корень |
| `dataset_*.jsonl` (outputs) | **76** | корень + `output/` |
| `dataset_*_report.txt` (отчёты) | **47** | корень |
| `train_*.py` | 3 | корень |
| `run_*.{ps1,sh}` (runners обучения) | 15+ | корень |
| `enrich_*.py` | 3 | корень |
| `inference_*.py / smoke_*.py` | 8+ | корень |
| `analyze_*.py / db_*.py` | 3 | корень |
| `parse_*.py / ingest_*.py / generate_*.py` | 4 | корень |
| `merge_lora.py / post_training.py / plot_train_curves.py` | 3 | корень |
| `apply_doxytags / clean_doxytags` | 2 | корень |
| `patch_rag_tags.py / sync_claude_md_tags.py / gen_patterns_drafts.py / dedup_top_classes.py` | 4 | корень |
| `_inspect_schema / _concat_enriched / Obnova / clean_dataset` | 4 | корень |
| `Modelfile.template + Modelfile_qwen3-8b-dsp_v*` | 5 | корень + `output/` |
| Большие папки моделей | 3 | `qwen3-8b/`, `qwen2.5-coder-7b/`, `wheels_offline/` |
| Логи `.log` | 3+ | корень |

**Главная проблема:** все скрипты используют **хардкоженные** пути `Path(r"E:\finetune-env\dataset_*.jsonl")` (после 11.05; ранее `C:\`) → переезд на Debian сломает всё. Решение: ввести модуль `core/paths.py` с **cross-platform** константами (Windows `E:/` + Debian `/home/alex`) + replace во всех 86 .py + 6 файлах внутри `dsp_assistant/`. См. `MemoryBank/specs/finetune_env_reorg_review_2026-05-11.md` §4.

---

## 🎯 Целевая структура (по действиям)

```
E:\finetune-env\   (Windows; на Debian — /home/alex/finetune-env/)
│
│  ── корень (минимум файлов) ──
├── README.md                     # entry point + быстрый старт
├── CLAUDE.md                     # короткая инструкция Кодо для finetune-env
├── pyproject.toml                # dsp-asst пакет (НЕ ТРОГАТЬ)
├── .gitignore                    # обновить (модели, .venv, *.log, .env)
├── .env.example                  # шаблон (HF_TOKEN, DSP_ASST_PG_PASSWORD)
│
│  ── KODO INFRA ──
├── .claude/
│   └── rules/
│       ├── 00-finetune-workflow.md      # workflow + fast-tracks
│       ├── 01-dataset-conventions.md    # как писать collect_*.py + JSONL формат
│       ├── 02-train-conventions.md      # train + runners + checkpoints
│       └── 03-paths-conventions.md      # ВСЕ пути через core/paths.py
│
├── MemoryBank/
│   ├── MASTER_INDEX.md
│   ├── tasks/IN_PROGRESS.md
│   ├── specs/                           # spec'и про обучение / dataset / RAG
│   ├── sessions/                        # YYYY-MM-DD.md
│   └── changelog/                       # YYYY-MM.md
│
│  ── РАБОЧИЙ КОД ПО ДЕЙСТВИЯМ ──
├── core/                                # фундамент (как в DSP-GPU)
│   ├── __init__.py
│   ├── paths.py                         # ★ ВСЕ пути константы (центр)
│   ├── db.py                            # connect_pg() + helpers
│   ├── meta.py                          # _meta нормализация / class_fqn
│   ├── jsonl.py                         # read/write JSONL
│   ├── brief.py                         # clean_brief / extract_doxy
│   ├── filters.py                       # _is_test_path / _is_test_name
│   └── README.md
│
├── collect/                             # генерация пар → dataset_*.jsonl (48 скриптов)
│   ├── README.md                        # каталог всех collectors с описанием
│   ├── INDEX.md                         # таблица: имя / output / пар / статус
│   │
│   ├── docs/                            # из документации
│   │   ├── collect_doc_rich.py
│   │   ├── collect_repo_docs.py
│   │   ├── collect_membank_specs.py
│   │   ├── collect_membank_specs_extended.py
│   │   ├── collect_doc_deep.py
│   │   ├── collect_dsp_docs.py
│   │   ├── collect_examples_agent.py
│   │   ├── collect_agent_examples.py
│   │   ├── collect_architecture_docs.py
│   │   ├── collect_prompts_changelog.py
│   │   └── collect_test_overview.py
│   │
│   ├── code/                            # из C++/Python кода
│   │   ├── collect_class_overview.py
│   │   ├── collect_class_facts.py
│   │   ├── collect_class_role.py
│   │   ├── collect_method_doxygen.py
│   │   ├── collect_method_signatures.py
│   │   ├── collect_fields_cmake.py
│   │   ├── collect_free_functions.py
│   │   ├── collect_namespace_overview.py
│   │   ├── collect_file_grouping.py
│   │   ├── collect_inheritance.py
│   │   ├── collect_pybind_modules.py
│   │   ├── collect_cpp_files.py
│   │   ├── collect_ack_advanced.py        # NB: было collect_acк_advanced.py (кириллица), Phase 0a fix
│   │   ├── collect_pybind_bridge.py
│   │   ├── collect_hip_kernels.py
│   │   ├── collect_hip_primitives.py
│   │   └── collect_build_test_infra.py
│   │
│   ├── tests/                           # тестовая инфра
│   │   ├── collect_test_params_pairs.py
│   │   └── (test_gen — отдельно в enrich/)
│   │
│   ├── anti_galluc/                     # см. ниже
│   │   ├── collect_db_facts.py          # NEW 11.05 — v6 dataset +1548 пар
│   │   └── collect_explicit_negatives.py # NEW 11.05
│   │
│   ├── pipelines/                       # data-flow / архитектура
│   │   ├── collect_pipeline_data_flow.py
│   │   ├── collect_arch_levels.py
│   │   ├── collect_reasoning_chains.py
│   │   └── collect_explicit_patterns.py
│   │
│   ├── usage/                           # use-cases / examples
│   │   ├── collect_usage_docs.py
│   │   ├── collect_usage_aug.py
│   │   ├── collect_python_aug.py
│   │   ├── collect_feedback_python.py
│   │   └── collect_claude_md_section.py
│   │
│   ├── anti_galluc/                     # anti-fabrication
│   │   ├── collect_negative_pairs.py            # typo→real
│   │   ├── collect_namespace_correction.py      # legacy ns
│   │   ├── collect_hard_negatives.py            # CUDA/pytest/...
│   │   ├── collect_refusal_pairs.py             # anti-misuse правил
│   │   └── collect_arch_rationale.py            # почему так
│   │
│   ├── advanced/                        # ground-truth / patterns
│   │   ├── collect_patterns_md.py
│   │   ├── collect_code_templates.py
│   │   ├── collect_idioms.py
│   │   ├── collect_math_foundations.py
│   │   └── collect_error_handling.py
│   │
│   └── enriched/                        # уже обогащенные base-источники
│       └── (dataset_enriched.jsonl — в data/, скрипт в build/)
│
├── enrich/                              # обогащение пар через LLM (3 файла)
│   ├── README.md
│   ├── enrich_dataset.py
│   ├── enrich_test_gen.py               # enrich placeholders → C++ snippets
│   ├── enrich_class_summary.py          # AI-summary топ-классов (через qwen3:8b)
│   └── watch_enrich.py                  # heartbeat монитор для long-running
│
├── build/                               # финал dataset_v* (concat / dedup / split / snapshot)
│   ├── README.md
│   ├── build_dataset_v3.py              # concat 51 источника
│   ├── dedup_top_classes.py             # semantic dedup (sklearn TF-IDF)
│   ├── prepare_phase_b.py               # train/val 90/10 split
│   ├── snapshot.py                      # cp v3 → v4_YYYY-MM-DD.jsonl (создать)
│   └── _concat_enriched.py              # старая утилита (legacy)
│
├── ingest/                              # наполнение PostgreSQL `gpu_rag_dsp`
│   ├── README.md
│   ├── parse_test_tags.py               # @test* парсер (CTX2)
│   ├── ingest_test_tags.py              # → rag_dsp.test_params
│   ├── generate_rag_manifest.py         # _RAG.md в каждом репо
│   ├── generate_arch_files.py           # arch C2/C3/C4
│   ├── apply_doxytags_repo.py           # doxytags по репо
│   └── clean_doxytags_dups.py
│
├── train/                               # обучение моделей
│   ├── README.md
│   ├── train_simple.py                  # baseline (Phase A diag)
│   ├── train_diag.py                    # diagnostic runs
│   ├── train_qwen25_coder.py
│   ├── post_training.py
│   ├── merge_lora.py                    # adapter → full model
│   ├── plot_train_curves.py             # loss / eval visualization
│   ├── preflight_smoke_check.py         # check libs / GPU / VRAM перед train
│   ├── Modelfile.template               # Ollama base
│   │
│   ├── runners/                         # PowerShell + Bash скрипты запуска
│   │   ├── run_full_qwen3_r16_9070.sh           # ★ Phase B главный
│   │   ├── run_full_qwen3_r8.ps1
│   │   ├── run_full_qwen3_r8_clean.ps1
│   │   ├── run_diag_qwen3_r8.ps1
│   │   ├── run_smoke_2080ti.ps1
│   │   ├── run_dynamics_hour.ps1
│   │   ├── run_dynamics_hour_resume.ps1
│   │   ├── run_dynamics_hour_resume2.ps1
│   │   └── run_compare_resume2.ps1
│   │
│   └── checkpoints/                     # выходы train + Modelfile варианты
│       ├── README.md
│       ├── smoke_2080ti_2026-05-10/             # переехать
│       ├── medium_2080ti_2026-05-10/            # переехать
│       ├── phase_b_2026-05-12/                  # будет 12.05
│       ├── Modelfile_qwen3-8b-dsp.template
│       ├── Modelfile_qwen3-8b-dsp_v2
│       ├── Modelfile_qwen3-8b-dsp_v3
│       └── Modelfile_qwen3-8b-dsp_v4
│
├── eval/                                # B1/B2/B3 валидация моделей
│   ├── README.md
│   ├── inference_compare.py             # ★ B1 3-way (baseline/smoke/full)
│   ├── inference_test.py                # одиночный prompt тест
│   ├── grounded_inference.py            # P2 RAG-aware inference (NEW 11.05)
│   ├── validate_inference.py            # P1 PG+Qdrant halluc validator (NEW 11.05)
│   ├── eval.py                          # общий entry point
│   ├── smoke_ragas.py                   # B3 RAGAs faithfulness
│   ├── smoke_analyzer.py                # анализ smoke результатов
│   ├── smoke_ctx4_atomic_tools.py       # CTX4 MCP smoke
│   │
│   ├── runners/
│   │   ├── run_compare_3way.ps1
│   │   ├── run_compare_r4_vs_r8.ps1
│   │   ├── run_compare_hour_vs_resume.ps1
│   │   └── post_train.ps1
│   │
│   ├── runners/                         # NEW: дополнить
│   │   ├── run_compare_3way.ps1
│   │   ├── run_compare_r4_vs_r8.ps1
│   │   ├── run_compare_hour_vs_resume.ps1
│   │   ├── run_compare_resume2.ps1      # NEW 11.05
│   │   ├── run_compare_v6_long.ps1      # NEW 11.05
│   │   ├── run_p2_grounded.ps1          # NEW 11.05
│   │   └── post_train.ps1
│   │
│   └── reports/                         # eval outputs (.md / .json)
│       ├── inference_compare_2026-05-10.md
│       ├── halluc_report.md             # переехать из корня (NEW 11.05)
│       └── smoke_2080ti_PASSED.md
│
├── analyze/                             # offline analytics dataset / БД
│   ├── README.md
│   ├── analyze_class_distribution.py    # топ-15 / cap / share
│   ├── analyze_patterns_coverage.py     # gap _RAG.md tags vs БД
│   ├── db_underrepresented.py           # классы без пар
│   ├── _inspect_schema.py               # PG schema dump
│   └── reports/
│
├── tools/                               # разовые утилиты (idempotent)
│   ├── README.md
│   ├── patch_rag_tags.py                # patch _RAG.md tags
│   ├── sync_claude_md_tags.py           # sync CLAUDE.md ↔ _RAG.md
│   ├── gen_patterns_drafts.py           # <repo>/Doc/Patterns.md generator
│   ├── clean_dataset.py                 # cleanup utility
│   ├── Obnova.py                        # restore (legacy?)
│   └── smoke_*                          # smoke_walker_git / smoke_ast_dump / smoke_extractor / smoke_heuristics / smoke_patcher (5 файлов)
│
├── infra/                               # запуск окружения
│   ├── README.md
│   ├── start-dsp-asst.bat               # Windows WSL launcher (текущий)
│   ├── start-dsp-asst.sh                # Debian native (создать)
│   ├── re_ingest_all.ps1                # пересобрать БД
│   ├── install_git_hooks.bat
│   ├── fix_torch_cu118.bat
│   ├── download_qwen25_coder.ps1
│   ├── stop-all.sh                      # остановить PG/Qdrant/Ollama (создать)
│   │
│   └── rag_setup/                       # ★ переехать ИЗ Scripts/rag_setup/ (15+ файлов)
│       ├── apply_pybind_extras.py
│       ├── apply_task_02.py
│       ├── backfill_use_cases_pipelines.py
│       ├── check_db_status.{py,sql}
│       ├── check_qdrant_coverage.py
│       ├── check_usecase_pipeline_progress.sql
│       ├── cleanup_class_card_orphans.py
│       ├── cleanup_pipeline_orphans.py
│       ├── cleanup_pybind_orphans.py
│       ├── cleanup_usecase_orphans.py
│       ├── final_dod_validation.py
│       ├── reembed_mirror_to_typed_target_tables.py
│       ├── rename_db_schema.py
│       ├── rollout_pybind_bindings.py
│       ├── rollout_python_usecases.py
│       ├── smoke_pg.py
│       ├── smoke_retrieval.py / smoke_retrieval_rank.py
│       ├── validate_rag_rerank.py
│       └── verify_meta_pilot.py
│
│  ── ДАННЫЕ (отдельно от кода) ──
├── data/
│   ├── output/                          # все dataset_*.jsonl (76 файлов)
│   │   ├── README.md                    # каталог: что в каком .jsonl
│   │   └── *.jsonl
│   │
│   ├── snapshots/                       # защищённые копии (read-only логически)
│   │   ├── dataset_v3_final_2026-05-10.jsonl
│   │   ├── dataset_v4_2026-05-11.jsonl
│   │   ├── dataset_v4_train.jsonl
│   │   └── dataset_v4_val.jsonl
│   │
│   ├── reports/                         # 47 dataset_*_report.txt
│   │   └── *.txt
│   │
│   ├── logs/                            # *.log (train, enrich, inference)
│   │   ├── enrich_test_gen.log
│   │   ├── inference_compare_2026-05-10.log
│   │   └── stderr.log
│   │
│   └── golden/                          # golden-set v1/v2 для RAGAs
│       └── (создать по мере)
│
│  ── ИНФРАСТРУКТУРА (тяжёлое, не в git) ──
├── models/                              # большие модели
│   ├── qwen3-8b/                        # 16 GB safetensors
│   ├── qwen2.5-coder-7b/                # 15 GB
│   └── README.md
│
├── wheels_offline/                      # для offline pack (НЕ ТРОГАТЬ)
├── backups/                             # PG dumps
│
│  ── НЕ ТРОГАТЬ ──
├── dsp_assistant/                       # ★ Python пакет (рабочий код RAG-сервера)
│   └── (как было)
│
└── .venv/                               # venv (НЕ В GIT)
```

---

## 🧱 Главное — `core/paths.py` (ОБЯЗАТЕЛЬНО ПЕРВЫМ)

> **Версия v2 (11.05)** — cross-platform Windows/Debian, **БЕЗ side-effects на импорте**.
> Полная версия + обоснование — `MemoryBank/specs/finetune_env_reorg_review_2026-05-11.md` §4.

Без этого модуля переезд **сломает все хардкоженные пути**.

```python
"""core/paths.py — единая точка путей для finetune-env.

Приоритет резолва: env → платформо-зависимый default → auto-detect.

Использование:
    from core.paths import OUTPUT, SNAPSHOTS, MODELS, DSP_GPU_ROOT
    out = OUTPUT / "dataset_inheritance.jsonl"

Подготовка папок (вызывать ЯВНО, НЕ на импорте):
    from core.paths import ensure_dirs
    ensure_dirs()
"""
from __future__ import annotations
import os
import sys
from pathlib import Path

_IS_WINDOWS = (os.name == "nt")
_DEFAULT_FINETUNE = Path("E:/finetune-env" if _IS_WINDOWS else "/home/alex/finetune-env")
_DEFAULT_DSP_GPU  = Path("E:/DSP-GPU"      if _IS_WINDOWS else "/home/alex/DSP-GPU")

def _resolve(env_var: str, default: Path, auto: Path) -> Path:
    raw = os.environ.get(env_var)
    if raw:
        return Path(raw).resolve()
    if default.exists():
        return default.resolve()
    return auto.resolve()

_AUTO_FINETUNE = Path(__file__).resolve().parent.parent

ROOT          = _resolve("FINETUNE_ROOT", _DEFAULT_FINETUNE, _AUTO_FINETUNE)
DSP_GPU_ROOT  = _resolve("DSP_GPU_ROOT",  _DEFAULT_DSP_GPU,  _DEFAULT_DSP_GPU)

# Данные
DATA = ROOT / "data"
OUTPUT = DATA / "output"
SNAPSHOTS = DATA / "snapshots"
REPORTS = DATA / "reports"
LOGS = DATA / "logs"
GOLDEN = DATA / "golden"
ENRICHED = DATA / "enriched"

# Модели
MODELS = ROOT / "models"
QWEN3_8B = MODELS / "qwen3-8b"
QWEN25_CODER = MODELS / "qwen2.5-coder-7b"
QWEN3_14B = MODELS / "qwen3-14b"
QWEN3_32B = MODELS / "qwen3-32b"

# Checkpoints
CHECKPOINTS = ROOT / "train" / "checkpoints"

# HuggingFace cache
HF_HOME = Path(os.environ.get("HF_HOME") or (Path.home() / ".cache" / "huggingface"))
HF_HUB  = HF_HOME / "hub"

def ensure_dirs() -> None:
    """Вызывать ЯВНО из main, НЕ на импорте."""
    for p in (OUTPUT, SNAPSHOTS, REPORTS, LOGS, GOLDEN, ENRICHED, CHECKPOINTS):
        p.mkdir(parents=True, exist_ok=True)

def info() -> dict:
    return {
        "platform": "windows" if _IS_WINDOWS else "linux",
        "ROOT": str(ROOT),
        "DSP_GPU_ROOT": str(DSP_GPU_ROOT),
        "OUTPUT": str(OUTPUT),
        "MODELS": str(MODELS),
        "HF_HUB": str(HF_HUB),
        "from_env": {
            "FINETUNE_ROOT": os.environ.get("FINETUNE_ROOT"),
            "DSP_GPU_ROOT": os.environ.get("DSP_GPU_ROOT"),
            "HF_HOME": os.environ.get("HF_HOME"),
        },
    }

if __name__ == "__main__":
    import json
    json.dump(info(), sys.stdout, indent=2, ensure_ascii=False)
    print()
```

**Свойства**:
1. **Нет mkdir на импорте** — только `ensure_dirs()` явно (важно для тестов / readonly FS).
2. **Cross-platform** — `os.name == "nt"` детект Windows / Linux.
3. **Env > default > auto-detect** — три уровня резолва.
4. **`python -m core.paths`** — self-test (показывает что разрешилось на текущей машине).

**Замена в скриптах** (массово через `sed`/Python script):
```python
# Было:
OUT = Path(r"E:\finetune-env\dataset_inheritance.jsonl")

# Стало:
from core.paths import OUTPUT
OUT = OUTPUT / "dataset_inheritance.jsonl"
```

---

## 🚀 Migration plan (6 фаз — добавлена 0a)

### Фаза 0a — pre-cleanup (10 мин, CRITICAL до Phase 0)
```bash
cd E:\finetune-env

# 1. Кириллица в имени файла (русская «к» в collect_acк_advanced.py)
git mv collect_acк_advanced.py collect_ack_advanced.py
# Также правка плана: в маппинге collect/code/ заменить collect_acк_advanced.py → collect_ack_advanced.py
# grep по кодовой базе на любые `import collect_acк_advanced` или `from collect_acк_advanced` — НЕТ хитов в репо (проверено)

# 2. Удалить .bak* (старые backup'ы 6.05)
git rm collect_dataset.py.bak_20260506_2020 train.py.bak_20260506_2020 enrich_dataset.py.bak_20260506_2020

# 3. Удалить локальную заметку
rm -f ~!Data.md   # уже в .gitignore (~!*.md)

# 4. Проверить, нужны ли prompts/ и tests/ (если 0 коммитов за месяц — git rm -r)
git log --since="1 month ago" -- prompts/ tests/ | head

git commit -m "phase 0a pre-cleanup: ascii rename + bak removal"
```

### Фаза 0 — pre-flight (10 мин)
- ✅ Сделать **полный snapshot** через git: `git add -A && git commit -m "pre-reorg snapshot"`
- ✅ Запушить в GitHub: `git push origin main`
- ✅ Создать ветку: `git checkout -b reorg-2026-05-10`

### Фаза 1 — создать каркас + `core/paths.py` (15 мин)
```bash
cd E:\finetune-env   # Windows; на Debian — cd /home/alex/finetune-env
mkdir -p core collect/{docs,code,tests,pipelines,usage,anti_galluc,advanced,enriched}
mkdir -p enrich build ingest train/runners train/checkpoints eval/runners eval/reports
mkdir -p analyze/reports tools infra
mkdir -p data/{output,snapshots,reports,logs,golden}
mkdir -p .claude/rules MemoryBank/{tasks,specs,sessions,changelog}

# Создать core/paths.py + core/__init__.py
# (содержимое выше)

# README.md в каждой новой папке (1-2 строки)
```

### Фаза 2 — переезд файлов (`git mv` для истории) (30-60 мин)
**Скрипт `tools/reorg_move.py`** (создать сначала, проверить dry-run):
```python
"""Перемещает все файлы по mapping в новую структуру.
Использует git mv для сохранения истории.

Запуск:
    python reorg_move.py --dry-run    # показать без перемещения
    python reorg_move.py --apply      # применить
"""
import subprocess
from pathlib import Path

ROOT = Path("E:/finetune-env")   # Windows default; cross-platform — см. core/paths.py в ревью §4

MAPPING = {
    # collect/docs/
    "collect_doc_rich.py": "collect/docs/",
    "collect_repo_docs.py": "collect/docs/",
    # ... (полный mapping всех 97 файлов)
}

# Реализация через subprocess.run(["git", "mv", src, dst])
```

**Перемещения по группам** (ключевые):

| Источник (корень) | Назначение |
|-------------------|------------|
| `collect_doc_*.py / collect_repo_docs.py / collect_membank_*.py / collect_dsp_docs.py / collect_examples*.py / collect_agent_examples.py / collect_architecture_docs.py / collect_prompts_changelog.py / collect_test_overview.py` | `collect/docs/` |
| `collect_class_*.py / collect_method_*.py / collect_fields_cmake.py / collect_free_functions.py / collect_namespace_*.py / collect_file_grouping.py / collect_inheritance.py / collect_pybind*.py / collect_cpp_files.py / collect_ack_advanced.py / collect_hip*.py / collect_build_test_infra.py / collect_db_facts.py` | `collect/code/` (после Phase 0a — `collect_ack_advanced.py` БЕЗ кириллицы) |
| `collect_test_params_pairs.py` | `collect/tests/` |
| `collect_pipeline_data_flow.py / collect_arch_levels.py / collect_reasoning_chains.py / collect_explicit_patterns.py` | `collect/pipelines/` |
| `collect_usage_*.py / collect_python_aug.py / collect_feedback_python.py / collect_claude_md_section.py` | `collect/usage/` |
| `collect_negative_pairs.py / collect_namespace_correction.py / collect_hard_negatives.py / collect_refusal_pairs.py / collect_arch_rationale.py / collect_explicit_negatives.py / collect_db_facts.py` | `collect/anti_galluc/` (NEW 11.05: explicit_neg + db_facts) |
| `collect_patterns_md.py / collect_code_templates.py / collect_idioms.py / collect_math_foundations.py / collect_error_handling.py` | `collect/advanced/` |
| `enrich_*.py / watch_enrich.py` | `enrich/` |
| `build_dataset_v3.py / dedup_top_classes.py / prepare_phase_b.py / _concat_enriched.py` | `build/` |
| `parse_test_tags.py / ingest_test_tags.py / generate_*.py / apply_doxytags*.py / clean_doxytags_dups.py` | `ingest/` |
| `train_*.py / run_dynamics_v3.py / merge_lora.py / post_training.py / plot_train_curves.py / preflight_smoke_check.py / Modelfile.template` | `train/` |
| `run_full_*.{ps1,sh} / run_diag_*.ps1 / run_smoke_*.ps1 / run_dynamics_*.ps1 / run_long_train_v6.ps1 / run_short_test_v6.ps1 / watch_resume2.ps1` | `train/runners/` |
| `inference_*.py / grounded_inference.py / validate_inference.py / eval.py / smoke_ragas.py / smoke_analyzer.py / smoke_ctx4_atomic_tools.py` | `eval/` (validate_inference NEW 11.05) |
| `run_compare_3way.ps1 / run_compare_r4_vs_r8.ps1 / run_compare_hour_vs_resume.ps1 / run_compare_resume2.ps1 / run_compare_v6_long.ps1 / run_p2_grounded.ps1 / post_train.ps1` | `eval/runners/` |
| `analyze_*.py / db_underrepresented.py / _inspect_schema.py` | `analyze/` |
| `patch_rag_tags.py / sync_claude_md_tags.py / gen_patterns_drafts.py / clean_dataset.py / Obnova.py / smoke_walker_git.py / smoke_ast_dump.py / smoke_extractor.py / smoke_heuristics.py / smoke_patcher*.py` | `tools/` |
| `start-dsp-asst.bat / re_ingest_all.ps1 / install_git_hooks.bat / fix_torch_cu118.bat / download_qwen25_coder.ps1 / update_*.bat` | `infra/` |
| `Scripts/rag_setup/*` (15+ файлов целиком) | `infra/rag_setup/` (cели одной папкой) |
| `halluc_report.md` (корень) | `eval/reports/` |
| `dataset_v3.jsonl / dataset_*.jsonl` (76 файлов) | `data/output/` |
| `dataset_v3_final_2026-05-10.jsonl / dataset_v4_*.jsonl` | `data/snapshots/` |
| `*_report.txt` | `data/reports/` |
| `*.log` | `data/logs/` |
| `qwen3-8b/ qwen2.5-coder-7b/` | `models/` |
| `output/Modelfile_qwen3-8b-dsp_v*` | `train/checkpoints/` |
| `halluc_report.md` | `eval/reports/` |
| `~!Data.md` | удалить или `MemoryBank/specs/` |

### Фаза 3 — patch путей в скриптах (1-2 ч)
**Скрипт `tools/reorg_patch_paths.py`** (массово sed-replace):
```python
# Заменить везде:
#   Path(r"E:\finetune-env\dataset_*.jsonl")  # после миграции 11.05
# На:
#   from core.paths import OUTPUT; OUTPUT / "dataset_*.jsonl"
```

**Внимание к build_dataset_v3.py** — там самый длинный SOURCES list (51 строка хардкоженных Path). Patcher должен это распознать.

### Фаза 4 — создать CLAUDE.md / .claude/rules/ / MemoryBank/ (30 мин)

**`CLAUDE.md` для finetune-env** (короткий, ~40 строк):
```markdown
# 🤖 CLAUDE — finetune-env

> LLM/RAG проект для DSP-GPU: dataset generation, training, evaluation.
> Связан с `e:\DSP-GPU\` через DSP_GPU_ROOT env.

## 🎯 Структура (короткая)
- `core/` — общая инфра (paths.py, db.py, jsonl.py)
- `collect/` — генерация пар по типам (docs/code/anti_galluc/...)
- `enrich/` — обогащение через LLM
- `build/` — финал dataset_v* (concat/dedup/split)
- `train/` — обучение + runners + checkpoints
- `eval/` — B1 inference compare / RAGAs
- `ingest/` — наполнение PG `gpu_rag_dsp`
- `analyze/` — analytics / gap detection
- `tools/` — разовые утилиты
- `infra/` — запуск окружения (start/stop/reindex)
- `data/` — outputs/snapshots/reports/logs (НЕ В GIT modelы и .venv)
- `dsp_assistant/` — RAG-сервер (НЕ ТРОГАТЬ)

## 🚫 Жёсткие правила
- Все пути через `core/paths.py` (не хардкодить `C:\...`)
- pytest **запрещён** — `dsp_assistant/utils/test_runner` или прямой запуск
- Не push без OK Alex'a
- Snapshots в `data/snapshots/` — read-only логически

## 🚀 Быстрый старт
\`\`\`bash
source .venv/bin/activate              # или .venv\Scripts\activate.bat
export DSP_ASST_PG_PASSWORD=1
export DSP_GPU_ROOT=/home/alex/DSP-GPU  # или e:\DSP-GPU
export FINETUNE_ROOT=/home/alex/finetune-env

# Запуск collector
python collect/anti_galluc/collect_negative_pairs.py

# Build финального dataset
python build/build_dataset_v3.py
python build/dedup_top_classes.py
python build/prepare_phase_b.py

# Обучение
bash train/runners/run_full_qwen3_r16_9070.sh
\`\`\`
```

**`.claude/rules/`** (4 файла, по 30-50 строк каждый):
- `00-finetune-workflow.md` — workflow задач
- `01-dataset-conventions.md` — JSONL формат, _meta поля, class_fqn naming
- `02-train-conventions.md` — runners convention, checkpoint naming
- `03-paths-conventions.md` — обязательное использование `core/paths.py`

**`MemoryBank/`** скелет (повторяет `e:\DSP-GPU\MemoryBank\`):
- `MASTER_INDEX.md`
- `tasks/IN_PROGRESS.md` (укажет на актуальные задачи)
- `specs/` (перенести `dataset_v3_remaining_improvements_*` сюда из `e:\DSP-GPU\MemoryBank\specs\LLM_and_RAG\`?)
- `sessions/` (новые сессии писать сюда, а не в DSP-GPU)
- `changelog/2026-05.md`

### Фаза 5 — `.gitignore` + smoke тест (15 мин)

**`.gitignore`** обновить:
```gitignore
# venv
.venv/
__pycache__/
*.pyc

# Большие модели
models/qwen3-8b/
models/qwen2.5-coder-7b/

# Логи
data/logs/

# Локальные адаптеры (опционально — если не хотим в git)
train/checkpoints/*/checkpoint-*/
train/checkpoints/*/optimizer.pt

# Секреты
.env
*.token

# OS
.DS_Store
Thumbs.db

# IDE
.idea/
.vscode/
```

**Smoke тест** после reorg:
```bash
# Проверка что core/paths.py работает
python -c "from core.paths import OUTPUT, SNAPSHOTS, ROOT; print('ROOT:', ROOT); print('OUTPUT:', OUTPUT)"

# Запуск одного collector
python collect/anti_galluc/collect_negative_pairs.py
ls data/output/dataset_negative_pairs.jsonl   # должен появиться

# Build
python build/build_dataset_v3.py
ls data/output/dataset_v3.jsonl
```

---

## 📊 Что получится — итоговая статистика

| Категория | Было (корень) | Стало (по папкам) |
|-----------|--------------:|-------------------|
| Python скрипты | 97 (вперемешку) | **~10 папок** по 5-15 файлов |
| Datasets | 76 .jsonl + 47 .txt в корне | `data/output/` + `data/reports/` + `data/snapshots/` |
| Runners | 15+ в корне | `train/runners/` + `eval/runners/` |
| Модели | 31 GB в корне | `models/` (gitignored) |
| Конфиги | 5 Modelfile в корне | `train/checkpoints/` |

**Главное:** теперь по имени **папки** видно что делает скрипт. Найти файл — за секунды.

---

## ⚠️ Риски / точки отказа

1. **Хардкоженные пути в 86 .py + 6 файлах внутри `dsp_assistant/`** → нужен grep + sed/python-replace. Скрипт `tools/reorg_patch_paths.py` обязателен.
2. **`dsp_assistant/` импортирует свои подпакеты** — НЕ трогать его внутреннюю структуру. НО **внутри** есть хардкоды `e:\DSP-GPU` (`config/loader.py`, `cli/main.py`, `indexer/build.py`, `indexer/file_walker.py`, `modes/{class_card, meta_extractor, pipeline_gen, pybind_extractor, python_usecase_*, usecase_gen}.py`, `agent/tools.py`). Эти пути перевести на `os.environ.get("DSP_GPU_ROOT")` с платформо-зависимым default'ом — НЕ через `core/paths.py` (изоляция пакета).
3. **Скрипты обучения** имеют пути `--output_dir output/` (Trainer config) — patch'нуть на `data/output/checkpoints/...` или оставить как есть с переменной.
4. **Git history**: `git mv` сохраняет, обычное `mv` теряет. **Только git mv.**
5. **Обратимость:** ветка `reorg-2026-05-10` — если что-то сломается, `git checkout main` откатит.
6. **Время рисков**: если делать ДО Phase B 12.05 — может разорвать pipeline в самый неподходящий момент. **Лучше после Phase B 12.05** когда основные результаты получены.
7. **`.venv/` НЕРЕЛОКИРУЕМА** (CRITICAL): абсолютные пути в `pyvenv.cfg`, `Scripts/activate.bat`, `Scripts/python.exe` shim'ы. После любого переезда (C:→E: или Win→Debian) **обязательно** пересоздать venv: `rm -rf .venv && python3 -m venv .venv && pip install -e .`. Это **отдельный шаг M3** в `MemoryBank/specs/finetune_env_reorg_review_2026-05-11.md` §3.
8. **Кириллица в имени `collect_acк_advanced.py`** (русская «к» U+043A) — на Linux/zip/rsync может побиться. Phase 0a её устраняет ПЕРЕД любыми операциями (см. выше).
9. **HF cache layout** (`huggingface-cli download --local-dir`) даёт **flat layout**, который HF SDK не подхватит как cache. Использовать `HF_HOME` env при скачивании на Windows (см. `INSTALL_DEBIAN_offline.md` Шаг 5 после правок 11.05).
10. **HF_TOKEN** в `offline_pack_download_list_2026-05-10.md` был в открытом виде — **ревокнут 11.05**. Новый токен класть **только** в `.env.local` (gitignored).

---

## 🎯 Когда делать reorg

| Опция | Pro | Con |
|-------|-----|-----|
| **Сейчас (10.05 ночь)** | Чистая база к Phase B 12.05 | Риск сломать всё в последний момент |
| **После Phase B 12.05** ⭐ | Все pipeline'ы проверены, можно безопасно патчить пути | До 12.05 ещё работаем в бардаке |
| **На Debian 12.05+** | Reorg + миграция = одна задача | Сложнее: и переезд, и реорг, всё на новой машине |

**Рекомендация:** **после Phase B 12.05** — когда модель обучена и B1/B2 закрыты, провести reorg в **отдельной ветке** `reorg-after-phase-b`, проверить smoke, мерджить в main.

---

## 📋 DoD (после полного reorg)

- [ ] Корень содержит ≤10 файлов (README.md, CLAUDE.md, pyproject.toml, .gitignore, .env.example + папки)
- [ ] `core/paths.py` создан и используется во всех скриптах
- [ ] Все 97 .py разнесены по 10 папкам действий
- [ ] Все 76 .jsonl в `data/output/` или `data/snapshots/`
- [ ] `MemoryBank/` создан со структурой DSP-GPU
- [ ] `.claude/rules/` 4 файла
- [ ] `CLAUDE.md` для finetune-env (короткий)
- [ ] Smoke test: один collector + build + ничего не сломано
- [ ] git history сохранён (через git mv)

---

## 📝 Следующие шаги (если Alex одобрит план)

1. **Сейчас:** не трогать. Финиш Phase B 12.05 без бардака reorg.
2. **После Phase B (13-14.05):** создать ветку `reorg-after-phase-b`, написать `reorg_move.py` + `reorg_patch_paths.py`, сделать dry-run.
3. **Перед merge:** smoke тест полного pipeline (collect → build → train → eval).
4. **Merge в main:** после OK Alex'a + git push.

---

*Created: 2026-05-10 поздняя ночь · Кодо main #1 · после глубокого анализа 97 .py + 76 .jsonl бардака*
