# finetune-env: глубокое ревью плана reorg + миграция C:→E: + cross-platform

> **От:** Кодо main #1 → Alex
> **Дата:** 2026-05-11
> **Триггер:** Alex попросил (1) глубокое ревью плана `finetune_env_reorg_plan_2026-05-10.md` + соседних файлов; (2) заложить миграцию `C:\finetune-env` → `E:\finetune-env` с учётом Debian `/home/alex/finetune-env`.
> **Сейчас:** только план/анализ, **код не трогаем**, файлы не двигаем.
> **Сканировано:** 10 файлов в `MemoryBank/specs_Linux_Radion_9070/` + реальный листинг `C:/finetune-env/` (97 .py + 76 .jsonl + 15 runners + 1 git-репо `AlexLan73/finetune-env`).

---

## 0. TL;DR

1. **План reorg в целом правильный** (архитектура «по глаголам», `core/paths.py`, snapshot перед движением, после Phase B 12.05 как окно). Но — **21 ошибка/пробел**, см. §2.
2. **Кириллица в имени файла** `collect_acк_advanced.py` (русская «к» между `c` и `_`) — **критичный баг для Debian**. Срочно `git mv` в `collect_ack_advanced.py` ДО переезда.
3. **`C:\finetune-env` хардкодится в 86 .py** + 68 файлов имеют `E:\DSP-GPU` или `/home/alex`. Из них **30 файлов** уже используют `os.environ.get("DSP_GPU_ROOT")` с fallback'ом — **паттерн уже есть**, надо распространить.
4. **`.venv/` НЕЛЬЗЯ копировать** при переезде C:→E:: внутри абсолютные пути в `pyvenv.cfg`, shebang'ах, shim'ах. План reorg об этом не пишет — **критичный пробел**. Решение: пересоздать venv после переезда.
5. **Папка `Scripts/rag_setup/` (15+ файлов) полностью отсутствует в плане** — пропадёт при reorg. Нужно явно отнести её в `infra/rag_setup/` или `tools/rag_setup/`.
6. **`dsp_assistant/` (6+ файлов) — план говорит «не трогать»**, но внутри тоже хардкоды `e:\DSP-GPU`. После переезда сломаются. Нужно патчить через env, не структуру.
7. **HF cache layout broken** в `INSTALL_DEBIAN_offline.md` Шаг 5 — `huggingface-cli download --local-dir` создаёт **flat layout**, который HF SDK не подхватит как cache. Решение: использовать `HF_HOME` env, не `--local-dir`.
8. **Конфликт: BGE-M3 dim** — `inventory_2026-05-10.md` пишет 1024 (правильно), `postgres_grounded_inference_2026-05-11.md` пишет 768 (ошибка). `migrate_pgvector_to_qdrant.py` опирается на 1024 — он прав, фикс в spec'е.
9. **Миграция C:→E: cross-platform** делается в **3 шага** (см. §3): Alex копирует → patch script `tools/migrate_paths.py` → переустановка venv. После reorg — заменим хардкоды на `core/paths.py`.
10. **Когда что делать** (см. §6): миграция C:→E: можно делать **сейчас** (изолировано), reorg — **после Phase B 12.05** как и было запланировано.

---

## 1. Контекст: что реально лежит в `C:/finetune-env/`

### 1.1 Git
```
remote: https://github.com/AlexLan73/finetune-env.git
branch: main, синхронен с origin
status: 9 модифицированных + 18 untracked .py/.jsonl/.txt (collect_db_facts, collect_explicit_negatives,
        collect_idioms, collect_math_foundations, collect_error_handling, collect_arch_rationale,
        collect_code_templates, collect_refusal_pairs + dataset_*.jsonl/_report.txt + dataset_v3*/v4*)
```
**До любой миграции — закоммитить и запушить эти 27 файлов.**

### 1.2 Структура корня (что важно)
```
C:\finetune-env\
├── .git\                  (15+ MB, тащим)
├── .venv\                 (1+ GB, НЕ тащим — пересоздаём)
├── .claude\               (gitignored, локальные настройки)
├── .dsp_assistant\        (cache, gitignored)
├── .env.example           (шаблон env-переменных, ✓)
├── .gitignore             (адекватный, ✓)
├── .idea\                 (PyCharm, gitignored)
├── pyproject.toml         (пакет dsp-assistant)
├── dsp_assistant\         ← Python-пакет (НЕ просто .dsp_assistant!)
├── Scripts\
│   └── rag_setup\         ← 15+ файлов, в плане ОТСУТСТВУЕТ
├── qwen3-8b\              (~16 GB, gitignored)
├── qwen2.5-coder-7b\      (gitignored)
├── output\                (gitignored)
├── backups\               (gitignored)
├── wheels_offline\        (gitignored)
├── prompts\               (есть, в плане не упомянут)
├── tests\                 (есть, в плане не упомянут)
├── __pycache__\
├── 97 *.py в корне
├── 76 dataset_*.jsonl     (некоторые gitignored через `output/`)
├── 47 dataset_*_report.txt
├── 15+ run_*.{ps1,sh}
├── *.bat (start-dsp-asst, install_git_hooks, fix_torch_cu118, update_*)
├── *.log (enrich_test_gen, stderr, inference_compare, halluc_report)
├── ~!Data.md (локальная заметка)
└── Modelfile.template
```

### 1.3 Где хардкоды
- **86 .py** содержат `C:\finetune-env` или `C:/finetune-env`.
- **68 .py** содержат `E:\DSP-GPU` / `e:/DSP-GPU` / `/home/alex`.
- **`build_dataset_v3.py`** = 54 строки `Path(r"C:\finetune-env\dataset_*.jsonl")` — **самый тяжёлый**, 51 SOURCES блок.
- **30 .py** уже используют `os.environ.get("DSP_GPU_ROOT", ...)` — **есть готовый паттерн**, эталон в `generate_rag_manifest.py:70`:
  ```python
  DSP_GPU_ROOT = Path(os.environ.get("DSP_GPU_ROOT", r"e:\DSP-GPU"))
  ```
- **`.ps1` / `.bat`** тоже содержат `C:\finetune-env` (минимум `post_train.ps1`).

### 1.4 Кириллица в имени файла (CRITICAL)
```
collect_acк_advanced.py
         ^
       русская «к» (U+043A), не латинская «k» (U+006B)
```
- Windows NTFS терпит, но `import collect_acк_advanced` упадёт на чистом ASCII-окружении.
- Linux ext4 терпит, но любой grep/sed/zip может попортить.
- В плане reorg это упомянуто как `collect_acк_advanced.py` — **тоже с кириллицей**. План воспроизводит баг.

**Fix**: `git mv collect_acк_advanced.py collect_ack_advanced.py` + правка имени в плане + grep по кодовой базе на любые `import collect_acк_advanced`.

---

## 2. Глубокое ревью `finetune_env_reorg_plan_2026-05-10.md` — 21 находка

### Категория А — Критичные (блокируют переезд)

**A1. `.venv/` пути нерелокируемы**
План молчит про venv. Реально `pyvenv.cfg` содержит абсолютный путь к Python; `Scripts/activate.bat`, `Scripts/python.exe` — shim'ы с зашитыми абсолютами. После переезда папки `python` запустится не оттуда, либо пакеты не подхватятся.
**Fix**: после переезда обязателен:
```powershell
rm -rf .venv
python3.12 -m venv .venv
.venv\Scripts\activate
pip install -e .
pip install psycopg[binary] sklearn sentence-transformers transformers peft accelerate bitsandbytes datasets pyyaml
```
Это **отдельный шаг M3** в плане миграции (см. §3).

**A2. Кириллица в `collect_acк_advanced.py`**
План воспроизводит имя as-is (строка 103). На Debian с C-локалью или в archive/zip — испортится.
**Fix**: переименовать ДО reorg, отдельным коммитом.

**A3. Папка `Scripts/rag_setup/` (15+ файлов) пропадает в плане**
В плане упомянут только `re_ingest_all.ps1` в `infra/`. Остальные `apply_*`, `backfill_*`, `check_*`, `cleanup_*`, `final_dod_validation`, `reembed_*`, `rename_db_schema`, `rollout_*`, `smoke_*`, `validate_rag_rerank` — отсутствуют.
**Fix**: добавить в маппинг:
```
Scripts/rag_setup/  →  infra/rag_setup/   (одной папкой, не разбираем)
```

**A4. `dsp_assistant/` хардкодит `E:\DSP-GPU`**
План: «НЕ ТРОГАТЬ внутреннюю структуру». Согласна. Но **внутри** есть как минимум:
- `dsp_assistant/agent/tools.py`
- `dsp_assistant/cli/params_extract.py`
- `dsp_assistant/cli/main.py`
- `dsp_assistant/config/loader.py`
- `dsp_assistant/indexer/build.py`
- `dsp_assistant/indexer/file_walker.py`
- `dsp_assistant/modes/{class_card, meta_extractor, pipeline_gen, pybind_extractor, python_usecase_*, usecase_gen}.py`

— все упоминают `e:\DSP-GPU` / `/home/alex`.
**Fix**: эти пути читать из env (`DSP_GPU_ROOT`), не патчить через `core/paths.py`. То есть для `dsp_assistant/` сохраняем самостоятельность, но переводим хардкоды на `os.environ.get(...)` с платформо-зависимым default'ом.

### Категория B — Архитектурные

**B1. `core/paths.py` mkdir на импорте — антипаттерн**
План (стр. 326-328):
```python
for p in (OUTPUT, SNAPSHOTS, REPORTS, LOGS, GOLDEN, CHECKPOINTS):
    p.mkdir(parents=True, exist_ok=True)
```
Импорт модуля не должен иметь side effects. Сломает unit-тесты на CI / readonly FS.
**Fix**: вынести в `core/setup.py:ensure_dirs()` или `infra/init_dirs.py` — вызывать явно из main-скриптов.

**B2. `core/paths.py` не различает Windows/Debian**
План: `Path(os.environ.get("FINETUNE_ROOT") or Path(__file__).parent.parent).resolve()`.
Работает только при запуске из самого репо. Сторонний скрипт упадёт.
**Fix**: явный платформо-зависимый default (см. §4).

**B3. `data/output/` слишком плоский** (76 файлов в одну кучу)
**Fix**: подгруппировать по типу collector'а (`outputs/docs/`, `outputs/code/`, `outputs/anti_galluc/` и т.д.) — параллельно структуре `collect/`.

**B4. `enrich/` без `data/enriched/`**
Куда падает `dataset_test_gen_enriched.jsonl`? В план не вписано.
**Fix**: `data/enriched/` явно завести.

**B5. Маппинг для `tools/` слишком эклектичный**
`patch_rag_tags / sync_claude_md_tags / gen_patterns_drafts` (idempotent, точечные) рядом со `smoke_walker_git / smoke_ast_dump / ...` (legacy doxytags). Это разные кластеры.
**Fix**: `tools/rag_meta/` (patch/sync/gen) + `tools/doxytags_legacy/` (smoke_*).

### Категория C — Свежие файлы (10-11.05) не учтены

**C1.** План написан 10.05 ночью. После — добавлены:
- `validate_inference.py` (P1 hallucination validator) → `eval/`
- `grounded_inference.py` (P2 RAG wrapper) → `eval/`
- `collect_db_facts.py` (v6 dataset = +1548 db_facts) → `collect/code/` или `collect/anti_galluc/`
- `collect_explicit_negatives.py` (новые negative pairs) → `collect/anti_galluc/`
- `halluc_report.md` → `eval/reports/`
- `run_dynamics_*.ps1` × 3 + `run_compare_resume2.ps1`, `run_compare_v6_long.ps1` → `train/runners/` или `eval/runners/`
- `run_long_train_v6.ps1`, `run_short_test_v6.ps1`, `run_p2_grounded.ps1` → `train/runners/` / `eval/runners/`
- `run_dynamics_v3.py` → `train/`
- `watch_resume2.ps1` → `train/runners/`

**Fix**: добавить в маппинг плана.

**C2.** Папки `prompts/` и `tests/` в корне — не упомянуты.
- `prompts/` — устарело, кандидат на удаление или в `tools/prompts_legacy/`.
- `tests/` — пусто или legacy. Проверить, при необходимости удалить.

### Категория D — Цепочка spec'ов (несогласованность)

**D1.** `migration_plan_2026-05-10.md` Фаза 3 (стр. 91): `git clone <github>/finetune-env`
**Fix**: `git clone https://github.com/AlexLan73/finetune-env.git`

**D2.** `migration_plan_2026-05-10.md` пишет `cp -r .../qwen3-8b /home/alex/finetune-env/qwen3-8b/` — это **до reorg**.
После reorg правильно: `cp -r .../qwen3-8b /home/alex/finetune-env/models/qwen3-8b/`.
**Fix**: в conditional блок: «если reorg ещё не сделан — путь A, если сделан — путь B».

**D3.** `INSTALL_DEBIAN_offline.md` Шаг 5 — HF cache layout сломан
```bash
cp -r $OFFLINE/1_models/bge-m3 ~/.cache/huggingface/hub/models--BAAI--bge-m3
```
Реально `huggingface-cli download --local-dir D:\...\bge-m3 --local-dir-use-symlinks False` создаёт **flat layout** (`config.json`, `model.safetensors`, ... в корне), а HF cache ожидает `models--BAAI--bge-m3/snapshots/<commit_hash>/<files>`.
**Fix (рекомендую)**: на Windows скачивать через `HF_HOME`:
```powershell
$env:HF_HOME = "D:\offline-debian-pack\1_hf_cache"
huggingface-cli download BAAI/bge-m3
huggingface-cli download BAAI/bge-reranker-v2-m3
huggingface-cli download Qwen/Qwen3-8B
# layout: $HF_HOME\hub\models--*\snapshots\<hash>\...  ← правильный
```
На Debian:
```bash
mkdir -p ~/.cache/huggingface
cp -r $OFFLINE/1_hf_cache/hub/* ~/.cache/huggingface/hub/
```
Это работает «из коробки» с FlagEmbedding / sentence-transformers.

**D4.** `postgres_grounded_inference_2026-05-11.md` пишет `BGE-M3 dense embeddings 768d`. Реально BGE-M3 = **1024**. `inventory_2026-05-10.md` (1024) и `INSTALL_DEBIAN_offline.md` (`migrate_pgvector_to_qdrant.py: DIM = 1024`) правы.
**Fix**: исправить 768d → 1024d в `postgres_grounded_inference_2026-05-11.md`.

**D5.** `task_phase_b_debian_setup_2026-05-12.md` Шаг 1 не проверяет git revision на репо. Нужно `git -C <repo> log -1 --format="%h %s"` × 11 репо для подтверждения, что взяли нужные коммиты.

**D6.** `inventory_2026-05-10.md` указывает `pyproject.toml` в Python 3.12. Реально в `pyproject.toml`: `requires-python = ">=3.11"`. Минор, но для Debian важно (если только 3.11 — план Фаза 3 `python3.12 -m venv` упадёт).
**Fix**: в `migration_plan` использовать `python3 -m venv` или fallback на 3.11.

### Категория E — Локальные мелочи

**E1.** `~!Data.md` (9.9 KB) в корне — `~!*.md` в `.gitignore` уже есть, но файл существует локально. План говорит «удалить или MemoryBank/specs/».
**Fix**: удалить (это локальная заметка, не нужна в репо). Если содержит важное — сначала в `MemoryBank/specs/finetune_env_local_notes.md` затем удалить.

**E2.** План **глобального** `~/.claude/CLAUDE.md` пишет: Windows = `C:\finetune-env`. После переезда нужно обновить **тоже**.
**Fix**: в DoD миграции добавить пункт «обновить `~/.claude/CLAUDE.md` + `e:/DSP-GPU/CLAUDE.md` секцию `🧪 Сопутствующий проект — finetune-env`».

**E3.** `_inspect_schema.py` и `Obnova.py` — в плане «tools/». Реально legacy:
- `_inspect_schema.py` — одноразовый dump схемы PG (1.8 KB).
- `Obnova.py` — 313 байт, явно эксперимент.
**Fix**: после reorg рассмотреть удаление, не хранить.

**E4.** `collect_dataset.py.bak_20260506_2020` / `train.py.bak_20260506_2020` / `enrich_dataset.py.bak_20260506_2020` — старые .bak файлы в корне.
**Fix**: удалить ДО reorg (git rm).

---

## 3. Миграция `C:\finetune-env` → `E:\finetune-env` (Windows, СЕЙЧАС возможно)

> Это **независимая** от reorg задача. Можно сделать **до** Phase B 12.05 (если Alex хочет освободить C:\), не трогая структуру.

### Шаг M0 — pre-flight (5 мин)
```powershell
cd C:\finetune-env
git status -sb        # Сейчас: 9 M + 18 ??
git add -A
git commit -m "pre-migration C:->E: snapshot (27 files)"
git push origin main

# Проверка свободного места на E:
Get-PSDrive E | Select-Object Used,Free,@{N='FreeGB';E={[int]($_.Free/1GB)}}
# Нужно >= 50 GB (16 модель + .git + datasets + резерв)
```

### Шаг M1 — копирование (Alex делает сам, ~10 мин)

**Вариант A (rsync-like через robocopy, рекомендую)**:
```powershell
robocopy C:\finetune-env E:\finetune-env /E /XD .venv __pycache__ .idea /XF *.pyc /MT:8 /R:2 /W:5
```
Объяснение флагов:
- `/E` — все подпапки
- `/XD .venv __pycache__ .idea` — **исключить** venv (пересоздадим), кэш, IDE-файлы
- `/XF *.pyc` — исключить байткод
- `/MT:8` — 8 потоков
- `/R:2 /W:5` — 2 ретрая по 5 сек

**Вариант B (через git clone, чистый)** — **не рекомендую** из-за моделей и dataset'ов вне git:
```powershell
git clone C:\finetune-env E:\finetune-env
# qwen3-8b/, output/, backups/, dataset_*.jsonl потеряются (gitignored)
```

### Шаг M2 — patch путей в скриптах (script от Кодо, ~5 мин на запуск)

Я подготовлю `tools/migrate_paths_C_to_E.py` (в `e:/DSP-GPU/MemoryBank/tools/` или прямо в `E:/finetune-env/`). Replace pattern (idempotent):

| Найти | Заменить |
|-------|----------|
| `r"C:\finetune-env"` | `r"E:\finetune-env"` |
| `r'C:\finetune-env'` | `r'E:\finetune-env'` |
| `"C:/finetune-env"` | `"E:/finetune-env"` |
| `'C:/finetune-env'` | `'E:/finetune-env'` |
| `Path("C:/finetune-env"` | `Path("E:/finetune-env"` |
| `Path(r"C:\finetune-env"` | `Path(r"E:\finetune-env"` |
| (в `.ps1`, `.bat`, `.sh`, `.md`) `C:\finetune-env` | `E:\finetune-env` |

Файлы под patch: 86 .py + 1 .ps1 + .bat'ы + .md в корне.

**Important**: НЕ патчить файлы в `.git/`, `.venv/`, `__pycache__/`, `qwen*/`, `output/`, `backups/`.

После запуска:
```powershell
cd E:\finetune-env
git diff --stat                # увидеть scope изменений
git add -A
git commit -m "chore: C:\finetune-env → E:\finetune-env (M2 mass replace)"
```

### Шаг M3 — пересоздать venv (15 мин)

```powershell
cd E:\finetune-env
# .venv/ не копировался, но если случайно есть — удалить:
if (Test-Path .venv) { Remove-Item -Recurse -Force .venv }

python3.12 -m venv .venv      # или python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -e .              # ставит dsp-assistant + все deps из pyproject.toml
pip install psycopg[binary] sklearn sentence-transformers transformers peft accelerate bitsandbytes datasets pyyaml

# Smoke
dsp-asst --help
python -c "import dsp_assistant; print(dsp_assistant.__file__)"   # должно показать E:\finetune-env\dsp_assistant\__init__.py
```

### Шаг M4 — обновить env переменные / Claude config (5 мин)

В `~/.claude/CLAUDE.md` (глобал) и `e:/DSP-GPU/CLAUDE.md` найти упоминания `C:\finetune-env` → заменить на `E:\finetune-env`. Глобальный CLAUDE.md секция «🧪 Сопутствующий проект — `finetune-env`» — таблица путей:

| Платформа | Путь |
|-----------|------|
| Windows (дома) | **`E:\finetune-env`** ← было `C:\finetune-env` |
| Debian (работа) | `/home/alex/finetune-env` |

Также обновить `e:/DSP-GPU/MemoryBank/specs_Linux_Radion_9070/*.md` — все 10 файлов содержат `C:\finetune-env`. См. §5 ниже — patch в этой же спеке.

### Шаг M5 — smoke (5 мин)
```powershell
cd E:\finetune-env
.\.venv\Scripts\Activate.ps1
$env:DSP_ASST_PG_PASSWORD = "1"
$env:DSP_GPU_ROOT = "E:\DSP-GPU"   # или e:\DSP-GPU
$env:FINETUNE_ROOT = "E:\finetune-env"

# Один из самых типичных скриптов
python collect_inheritance.py
ls dataset_inheritance.jsonl       # должен появиться, размер >0

# Проверка build_dataset_v3 (51 SOURCES) — НЕ запускать в production, только check parsing:
python -c "
import ast, sys
with open('build_dataset_v3.py') as f: tree = ast.parse(f.read())
print('Parse OK:', len(list(ast.walk(tree))), 'AST nodes')
"
```

Если зелёное — `git push origin main` (всё уже закоммичено M2).

### DoD миграции C:→E:
- [ ] `E:\finetune-env\.git\` существует, `git status` чистый
- [ ] `E:\finetune-env\.venv\` пересоздан, `dsp-asst --help` работает
- [ ] `grep -r "C:\\finetune-env" E:\finetune-env --include="*.py" --include="*.ps1" --include="*.bat"` → 0 hits (кроме refusal_pairs/explicit_neg где это **намеренно** в датасете как negative example)
- [ ] `~/.claude/CLAUDE.md` обновлён
- [ ] `e:/DSP-GPU/CLAUDE.md` обновлён
- [ ] `e:/DSP-GPU/MemoryBank/specs_Linux_Radion_9070/*.md` patched (см. §5)
- [ ] `git push origin main` зелёный
- [ ] `C:\finetune-env\` Alex может удалить (после успешного smoke на E:\)

---

## 4. Cross-platform path resolution (для reorg, после Phase B)

> Для этапа reorg — финальный дизайн `core/paths.py`, который решает **обе** задачи: Windows E:\ и Debian /home/alex.

### 4.1 Дизайн `core/paths.py`

```python
"""core/paths.py — единая точка путей для finetune-env.

Приоритет резолва:
    1. Переменная окружения (FINETUNE_ROOT / DSP_GPU_ROOT)
    2. Платформо-зависимый default (Windows E:/ или Linux /home/alex)
    3. Авто-detect (Path(__file__).parent.parent.resolve()) — fallback

Использование:
    from core.paths import OUTPUT, SNAPSHOTS, MODELS, DSP_GPU_ROOT
    out = OUTPUT / "dataset_inheritance.jsonl"

Подготовка dirs (вызывать явно из main, НЕ на импорте):
    from core.paths import ensure_dirs
    ensure_dirs()
"""
from __future__ import annotations
import os
import sys
from pathlib import Path

# ──────────────────────────────────────────────────────────────────────
# Платформо-зависимые defaults
# ──────────────────────────────────────────────────────────────────────
_IS_WINDOWS = (os.name == "nt")

_DEFAULT_FINETUNE = Path("E:/finetune-env" if _IS_WINDOWS else "/home/alex/finetune-env")
_DEFAULT_DSP_GPU  = Path("E:/DSP-GPU"      if _IS_WINDOWS else "/home/alex/DSP-GPU")

# ──────────────────────────────────────────────────────────────────────
# Корни — env > default > auto-detect
# ──────────────────────────────────────────────────────────────────────
def _resolve_root(env_var: str, default: Path, auto: Path) -> Path:
    """env > default (если existsет) > auto-detect."""
    raw = os.environ.get(env_var)
    if raw:
        return Path(raw).resolve()
    if default.exists():
        return default.resolve()
    return auto.resolve()

# Авто-detect для FINETUNE_ROOT — корень репо относительно этого файла
_AUTO_FINETUNE = Path(__file__).resolve().parent.parent

ROOT          = _resolve_root("FINETUNE_ROOT", _DEFAULT_FINETUNE, _AUTO_FINETUNE)
DSP_GPU_ROOT  = _resolve_root("DSP_GPU_ROOT",  _DEFAULT_DSP_GPU,  _DEFAULT_DSP_GPU)

# ──────────────────────────────────────────────────────────────────────
# Подпапки данных
# ──────────────────────────────────────────────────────────────────────
DATA      = ROOT / "data"
OUTPUT    = DATA / "output"
SNAPSHOTS = DATA / "snapshots"
REPORTS   = DATA / "reports"
LOGS      = DATA / "logs"
GOLDEN    = DATA / "golden"
ENRICHED  = DATA / "enriched"

# Модели
MODELS         = ROOT / "models"
QWEN3_8B       = MODELS / "qwen3-8b"
QWEN25_CODER   = MODELS / "qwen2.5-coder-7b"
QWEN3_14B      = MODELS / "qwen3-14b"
QWEN3_32B      = MODELS / "qwen3-32b"

# Checkpoints
CHECKPOINTS = ROOT / "train" / "checkpoints"

# HuggingFace cache (offline)
HF_HOME = Path(os.environ.get("HF_HOME") or (Path.home() / ".cache" / "huggingface"))
HF_HUB  = HF_HOME / "hub"

# ──────────────────────────────────────────────────────────────────────
# Утилиты
# ──────────────────────────────────────────────────────────────────────
def ensure_dirs() -> None:
    """Создать data-папки если их нет. ВЫЗЫВАТЬ ЯВНО из main, НЕ на импорте."""
    for p in (OUTPUT, SNAPSHOTS, REPORTS, LOGS, GOLDEN, ENRICHED, CHECKPOINTS):
        p.mkdir(parents=True, exist_ok=True)

def info() -> dict:
    """Diagnostic — что разрешилось."""
    return {
        "platform":    "windows" if _IS_WINDOWS else "linux",
        "ROOT":        str(ROOT),
        "DSP_GPU_ROOT": str(DSP_GPU_ROOT),
        "OUTPUT":      str(OUTPUT),
        "MODELS":      str(MODELS),
        "HF_HUB":      str(HF_HUB),
        "from_env": {
            "FINETUNE_ROOT": os.environ.get("FINETUNE_ROOT"),
            "DSP_GPU_ROOT":  os.environ.get("DSP_GPU_ROOT"),
            "HF_HOME":       os.environ.get("HF_HOME"),
        },
    }

if __name__ == "__main__":
    import json
    json.dump(info(), sys.stdout, indent=2, ensure_ascii=False)
    print()
```

**Свойства**:
1. **Нет mkdir на импорте** — только `ensure_dirs()` явно.
2. **Cross-platform** — `os.name == "nt"` детект.
3. **Env > default > auto-detect** — три уровня.
4. **`__main__` self-test** — `python -m core.paths` показывает что разрешилось. Удобно для отладки на новой машине.

### 4.2 Шаблон env-файла `.env.example` (расширение)

К существующим переменным добавить:
```bash
# ── Cross-platform paths (опционально — есть defaults) ──────────
# Windows: E:\finetune-env  /  Debian: /home/alex/finetune-env
# FINETUNE_ROOT=E:\finetune-env
# DSP_GPU_ROOT=E:\DSP-GPU

# ── HuggingFace cache (offline режим) ────────────────────────────
# HF_HOME=E:\HF\hub
# HF_HUB_OFFLINE=1
# TRANSFORMERS_OFFLINE=1
```

### 4.3 Замена в скриптах (когда reorg)

```python
# Было:
OUT = Path(r"C:\finetune-env\dataset_inheritance.jsonl")
WS  = Path(r"E:\DSP-GPU")

# Стало:
from core.paths import OUTPUT, DSP_GPU_ROOT
OUT = OUTPUT / "dataset_inheritance.jsonl"
WS  = DSP_GPU_ROOT
```

Patch выполняется массово через `tools/reorg_patch_paths.py` (см. план reorg, доработать).

---

## 5. Что патчить в существующих 4 файлах spec'а (С→E + cross-platform)

> Это **минимальный** набор правок в `MemoryBank/specs_Linux_Radion_9070/*.md` — для приведения spec'ов к согласованному виду ДО reorg. Это **только текст**, код не трогаем.

### 5.1 `finetune_env_reorg_plan_2026-05-10.md`
- **Стр. 38, 304, 351, и т.д.** — `C:\finetune-env\` → `E:\finetune-env\` (replace-all).
- **Стр. 103** — `collect_acк_advanced.py` → `collect_ack_advanced.py` (кириллица!).
- **Стр. 304-307** — заменить `core/paths.py` на cross-platform версию из §4.1.
- **Стр. 326-328** — убрать mkdir на импорте, добавить `ensure_dirs()`.
- Добавить новый раздел **«Phase 0a — кириллица + .bak cleanup»** перед Фазой 0:
  ```
  Phase 0a — pre-cleanup (5 мин)
  - git mv collect_acк_advanced.py collect_ack_advanced.py
  - rm *.bak_20260506_2020
  - rm ~!Data.md
  ```
- Добавить **папку `Scripts/rag_setup/`** в маппинг → `infra/rag_setup/`.
- Добавить C1 файлы (validate_inference, grounded_inference, collect_db_facts, collect_explicit_negatives, halluc_report, run_dynamics_*, run_compare_*, run_*_v6, run_p2_grounded, watch_resume2, run_dynamics_v3) в маппинг.
- Добавить **раздел «.venv нерелокируема»** в риски.
- Добавить **раздел про dsp_assistant**: внутренние пути патчатся через `os.environ.get`, не через `core/paths`.

### 5.2 `migration_plan_2026-05-10.md`
- **Фаза 3, стр. 91** — `git clone <github>/finetune-env` → `git clone https://github.com/AlexLan73/finetune-env.git`.
- **Фаза 3, стр. 93** — `python3.12 -m venv` → `python3 -m venv` (с заметкой про fallback на 3.11 если 3.12 нет).
- **Фаза 2** — добавить условие «если reorg сделан — путь `models/qwen3-8b/`, иначе — `qwen3-8b/`».
- **Стр. 295** — добавить переменные `FINETUNE_ROOT` и `DSP_GPU_ROOT` (для cross-platform).

### 5.3 `INSTALL_DEBIAN_offline_2026-05-10.md`
- **Шаг 5 (HF cache)** — переписать на `HF_HOME` подход (см. D3 выше). На Windows скачивать с `$env:HF_HOME = "D:\offline-debian-pack\1_hf_cache"`, на Debian копировать целиком `~/.cache/huggingface/hub/`.
- **Шаг 12** — добавить `OLLAMA_HOST` env для systemd (если binding нужен на 0.0.0.0).
- **Шаг 6** — `python3.12 -m venv` → `python3 -m venv`.
- Добавить заметку про `core/paths.py` после reorg (если уже сделан — переменные `FINETUNE_ROOT=/home/alex/finetune-env`).

### 5.4 `ssd_transfer_list_2026-05-10.md`
- **Шаг "На Windows"** — пути источника **C:** оставить (это исходник), но HF cache источник — поменять на `$HF_HOME` (см. D3).
- **«На Debian»** — добавить пункт «после reorg перенести qwen3-8b/ в `models/qwen3-8b/`».

### 5.5 `task_phase_b_debian_setup_2026-05-12.md`
- **Шаг 1** — добавить `git -C /home/alex/DSP-GPU/<repo> log -1 --format="%h %s"` для каждого репо.
- **Шаг 5** — `python3.12` → `python3`.
- DoD — добавить `python -m core.paths` (если reorg сделан).

### 5.6 `inventory_2026-05-10.md`
- Минор: `python 3.12 venv` → `python 3.11+ venv (per pyproject)`.

### 5.7 `postgres_grounded_inference_2026-05-11.md`
- **Стр. 47** — `BGE-M3 dense embeddings 768d` → `BGE-M3 dense embeddings 1024d` (CRITICAL — иначе `migrate_pgvector_to_qdrant.py` упадёт по dim mismatch).

### 5.8 `halluc_metrics_2026-05-11.md`
- Все упоминания `C:\finetune-env\` → `E:\finetune-env\` (артефакты после переезда). 5+ мест.

### 5.9 `offline_pack_download_list_2026-05-10.md`
- **HF token** в открытом виде в `offline_pack_download_list_2026-05-10.md` (стр. 5, 38). **CRITICAL secret!** Перенести в `.env.local` (gitignored), в spec'е оставить заглушку `hf_***REVOKED_2026-05-11***`. Старый токен через https://huggingface.co/settings/tokens — **ревокать**.
- **Шаг 1A-1C** — переписать на `$env:HF_HOME = "D:\offline-debian-pack\1_hf_cache"` подход (D3).

### 5.10 `README.md` папки
- Добавить ссылку на эту спеку.
- Добавить статус: «план в ревью, см. `MemoryBank/specs/finetune_env_reorg_review_2026-05-11.md`».

---

## 6. Когда что делать (roadmap)

| Когда | Что | Зависимости |
|-------|-----|-------------|
| **Сейчас (11.05)** | Эта спека — обзор + план | — |
| **Сейчас (после OK)** | §5 — патчи в 9 spec'ов (только текст, кода нет) | OK Alex |
| **Сейчас (после OK)** | Кириллица fix: `git mv collect_acк_advanced.py collect_ack_advanced.py` | OK Alex |
| **Сейчас (после OK)** | Удалить .bak* + ~!Data.md | OK Alex |
| **До 12.05 (опц)** | Миграция C:→E: (M0-M5) — изолированная задача, не зависит от reorg | OK Alex + 30-40 мин |
| **12.05 — Phase B** | Запуск Phase B на RX 9070 — pipeline должен работать как есть | SSD + venv |
| **13-14.05 — после Phase B** | Reorg по плану `finetune_env_reorg_plan` (с правками из §5.1) | Phase B зелёный |
| **13-14.05** | Внедрение `core/paths.py` (§4.1) + массовый patch 86 .py через `tools/reorg_patch_paths.py` | reorg сделан |
| **15-20.05** | Cleanup `dsp_assistant/` хардкоды через env (A4) | reorg сделан |

### Что НЕ делаем сейчас
- **Не двигаем файлы** в `C:\finetune-env\` (даже после переезда на E:\) — структура остаётся плоской до Phase B.
- **Не пишем `core/paths.py`** в текущий C:\ или E:\ — он часть reorg, появится после Phase B.
- **Не патчим 86 .py** на cross-platform — они работают как есть (один платформо-зависимый default через ручной replace в M2 достаточно).

### Что **CRITICAL** до выезда на работу 12.05
1. **HF_TOKEN ревокать** — он в открытом виде в `offline_pack_download_list_2026-05-10.md`. Это **прямо сейчас**, не дожидаясь OK на остальное.
2. **Если есть `Scripts/rag_setup/`** — git status проверить, что эти 15+ файлов закоммичены (они вне маппинга reorg, но физически нужны).
3. **Кириллица** в имени — пока на Windows работает, но если миграция через rsync/zip → может побиться. Лучше переименовать.

---

## 7. Открытые вопросы (нужны решения Alex'a)

1. **Q1**: Делаем миграцию C:→E: **до** 12.05 или **после** Phase B (вместе с reorg)?
   - **(A) До 12.05**: освободит C:\, но риск задержки Phase B.
   - **(B) После Phase B**: безопаснее, но C:\ всё ещё занят моделями.
   - 💡 **рекомендация**: **(B) После Phase B** — связать с reorg одной задачей.
2. **Q2**: HF_TOKEN — ревокаем сейчас или после поездки в тайгу?
   - 💡 **рекомендация**: **сейчас** + сгенерить новый, положить в `.env` (gitignored).
3. **Q3**: `Scripts/rag_setup/` (15 файлов) — действительно нужно сохранять? Или legacy?
   - Не могу решить без Alex'а — посмотри `git log` или скажи.
4. **Q4**: Папки `prompts/` и `tests/` в корне — что с ними?
   - 💡 **рекомендация**: проверить через `git log -- prompts/ tests/`, если 0 коммитов за месяц → удалить.
5. **Q5**: `_inspect_schema.py` / `Obnova.py` / `*.bak_*` — удалять?
   - 💡 **рекомендация**: **да**, явный legacy.

---

## 8. Связи

- **Источники ревью**: 10 файлов в `MemoryBank/specs_Linux_Radion_9070/`
- **План reorg**: `finetune_env_reorg_plan_2026-05-10.md`
- **Глобальный CLAUDE.md**: `~/.claude/CLAUDE.md` (раздел про finetune-env)
- **Project CLAUDE.md**: `e:/DSP-GPU/CLAUDE.md` (раздел `🧪 Сопутствующий проект`)
- **Связанные tasks**: `MemoryBank/tasks/TASK_FINETUNE_phase_B_2026-05-12.md`

---

*Создано: 2026-05-11 · Кодо main #1 · ревью + миграция C:→E: + cross-platform план*
