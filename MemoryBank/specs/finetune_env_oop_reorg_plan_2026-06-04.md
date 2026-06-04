# finetune-env — ООП-реорганизация (актуализация плана 10.05 → 04.06)

> **Кому:** Alex · **От:** Кодо · **Дата:** 2026-06-04
> **Задача:** причесать бардак `/home/alex/finetune-env` в стиль ООП / SOLID / GRASP / GoF.
> **База:** `specs_Linux_Radion_9070/finetune_env_reorg_plan_2026-05-10.md` (структура «по глаголам») +
> `specs/finetune_env_reorg_review_2026-05-11.md` (21 находка + `core/paths.py`).
> **Что нового:** план месячной давности устарел — репо вырос; C:→E: и Debian-переезд **сделаны**; Phase B
> (обучение) **идёт**. Этот документ = (1) поправка инвентаря, (2) **второй слой — ООП-дизайн классов**,
> которого в старом плане не было (там была только раскладка файлов по папкам).

---

## 0. TL;DR

1. **Старый план («по глаголам»: core/collect/enrich/build/ingest/train/eval/analyze/tools/infra + data/models) — оставляем как Слой A** (раскладка файлов). Он правильный.
2. **Добавляем Слой B — ООП/SOLID/GRASP/GoF** (дизайн классов). Это то, чего просит Alex и чего в плане 10.05 нет.
3. **Измеренный технический долг (факт 04.06):**
   - **100** `.py` + **33** `.sh/.ps1` + **87** `.jsonl` + **38** `_report.txt` в корне.
   - **28** файлов дублируют `psycopg.connect()` → должен быть один `core.db.Database`.
   - **69** файлов дублируют запись JSONL → `core.jsonl.JsonlWriter`.
   - **44** файла ad-hoc читают `DSP_GPU_ROOT`/`os.environ` → `core.paths`.
   - Каждый из ~48 `collect_*.py` = один каркас `connect → query → build_pairs → write+report` → **Template Method + Strategy**.
4. **Битьё путей:** часть коллекторов всё ещё хардкодит `Path(r"E:\finetune-env\...")` (Windows-путь на Debian!). На Debian это пишет в несуществующее место / падает.
5. **Кириллица не устранена:** `collect_acк_advanced.py` (русская «к» U+043A) всё ещё в корне — Phase 0a не выполнялась.
6. **Очерёдность безопасности:** обучение идёт прямо сейчас (resume 200→600). Reorg — **в отдельной ветке `reorg-2026-06`**, начинать **после** завершения текущего train, не трогая работающие скрипты на лету.

---

## 1. Поправка инвентаря (что изменилось с 10.05)

### 1.1 Новые файлы в корне (НЕ были в плане 10.05)

| Файл | Куда по новой схеме | Примечание |
|------|---------------------|-----------|
| `main.py` | `core/` или корень (entry-point CLI) | проверить назначение перед переносом |
| `train_simple.py` | `train/` | **рабочий** baseline (им сейчас обучаем) |
| `train_unsloth_v7_continue.py` | `train/` | continue-обучение |
| `run_with_resume.sh` | `train/runners/` | **рабочий** wrapper auto-resume |
| `qwen_biglora.sh`, `qwen_cont400.sh`, `qwen_train_v7_400.sh`, `qwen_smooth_from600.sh` | `train/runners/` | qwen-прогоны |
| `cont_r1_plus100.sh`, `cont_r1_plus200.sh` | `train/runners/` | r1 continue |
| `run_smoke_9070_max.sh`, `post_train.sh`, `re_ingest_all.sh` | `train/runners/` / `infra/` | bash-аналоги .ps1 |
| `convert_both_ft.sh`, `convert_r1_ft_to_gguf.sh` | `train/` (GGUF-конвертация) | новый этап «convert» |
| `collect_claude_md.py`, `collect_cpp_impls.py`, `collect_doc_rich_pairs.py`, `collect_from_rag.py`, `collect_more_dataset.py`, `collect_pybind_bridge_pairs.py`, `collect_rag_v6.py`, `collect_test_gen.py` | `collect/{docs,code,...}` | новые коллекторы v6/v7 |
| `migrate_pgvector_to_qdrant.py` | `ingest/` или `tools/` | миграция векторов |
| `update_rag_tags_and_claude_md.py` | `ingest/` | RAG-теги |
| `t_fft.py`, `t_fft_v2.py` | **кандидаты на удаление** | похоже на разовые FFT-пробы, не относятся к LLM |
| `Scripts/qwen_biglora_cont600.sh`, `Scripts/qwen_biglora_resume600.sh` | `train/runners/` | мои скрипты этой сессии (уже в `Scripts/`) |

### 1.2 Каталоги верхнего уровня сейчас

```
finetune-env/
├── Core/                 # phase5_qwen14b_train/, phase6_qwen3coder_30b_moe/ — фазовые наработки (НЕ путать с core/ из плана!)
├── Scripts/              # rag_setup/ (15+ файлов из ревью §A3) + мои qwen_biglora_*.sh
├── dsp_assistant/        # ★ Python-пакет RAG-сервера — НЕ ТРОГАТЬ структуру (ревью §A4)
├── output/               # чекпойнты обучения (qwen25coder14b_v7_*) — → train/checkpoints/ либо data/
├── prompts/, tests/      # ревью §C2 — проверить, возможно legacy
├── tmp/                  # репо-локальный (replace_finetune_path.py)
└── 100×.py + 33×.sh/ps1 + 87×.jsonl + 38×.txt  ← БАРДАК в корне
```

> ⚠️ **Коллизия имён:** план вводит `core/` (инфра), а сейчас уже есть `Core/` (фазовые наработки). На Debian (case-sensitive ext4) это **разные** каталоги, но визуально путает. **Решение:** план-овский `core/` оставить (lowercase, инфра-пакет), `Core/` переименовать в `phases/` или `experiments/` ДО создания `core/`.

---

## 2. Слой A — раскладка по глаголам (из плана 10.05, без изменений)

Структура целевых папок — **как в плане 10.05 §«Целевая структура»**: `core/ collect/{docs,code,tests,pipelines,usage,anti_galluc,advanced} enrich/ build/ ingest/ train/{runners,checkpoints} eval/{runners,reports} analyze/ tools/ infra/{rag_setup} data/{output,snapshots,reports,logs,golden} models/`.

Не дублирую здесь маппинг 97 файлов — он в плане 10.05 §Фаза 2. **Поправки к маппингу** — таблица §1.1 выше (новые файлы) + §1.2 (Core→phases, output→train/checkpoints).

---

## 3. Слой B — ООП / SOLID / GRASP / GoF (НОВОЕ — ядро задачи)

> Слой A раскладывает файлы. Слой B убирает **дублирование** (28× connect, 69× jsonl, 44× env) через классы.
> Принцип Alex: **не плодить сущности** → минимум классов, максимум переиспользования. 6 инфра-классов + 1 база коллектора + 1 база раннера покрывают весь долг.

### 3.1 `core/` — инфраструктурные сервисы (Pure Fabrication, SRP, DIP)

Каждый класс = одна ответственность (SRP), внедряется в коллекторы как зависимость (DIP — коллектор зависит от абстракции, не от psycopg напрямую).

| Модуль | Класс | Ответственность (SRP) | GRASP |
|--------|-------|------------------------|-------|
| `core/paths.py` | `PathRegistry` (или модуль-константы) | единая точка путей, cross-platform (env→default→auto) | Pure Fabrication, Information Expert |
| `core/db.py` | `Database` | `connect()`, `query()`, контекст-менеджер; читает пароль из env | Pure Fabrication, Low Coupling |
| `core/jsonl.py` | `JsonlWriter` / `JsonlReader` | атомарная запись/чтение пар + авто-`_report.txt` | Pure Fabrication, High Cohesion |
| `core/meta.py` | `MetaNormalizer` | нормализация `_meta`, `class_fqn` | Information Expert |
| `core/brief.py` | `BriefCleaner` | `clean_brief` / `extract_doxy` | High Cohesion |
| `core/filters.py` | `PathFilter` | `is_test_path` / `is_test_name` | Information Expert |

`core/paths.py` — **готовый дизайн уже есть** в ревью §4.1 / плане §«core/paths.py» (cross-platform, без mkdir на импорте). Берём его как есть.

### 3.2 Коллекторы — Template Method + Strategy (GoF) для ~48 `collect_*.py`

**Проблема (факт):** каждый `collect_*.py` повторяет: `connect()` → запрос источника → генерация пар → `json.dump` + report. Разница только в **середине** (как строить пары).

**Решение — абстрактная база (Template Method):**

```python
# collect/base.py
from abc import ABC, abstractmethod
from core.db import Database
from core.jsonl import JsonlWriter
from core.paths import OUTPUT

class Collector(ABC):
    """Template Method: run() фиксирует скелет, build_pairs() — варьируется."""
    name: str                      # "negative_pairs"
    output: str                    # "dataset_negative_pairs.jsonl"

    def __init__(self, db: Database, writer: JsonlWriter):  # DIP: зависимости внедряются
        self.db = db
        self.writer = writer

    def run(self) -> None:                       # ← скелет (одинаков для всех)
        rows = self.fetch_source()
        pairs = self.build_pairs(rows)
        self.writer.write(OUTPUT / self.output, pairs, report=True)

    def fetch_source(self) -> list:              # хук с дефолтом (можно переопределить)
        return self.db.query(self.SOURCE_SQL)

    @abstractmethod
    def build_pairs(self, rows: list) -> list:   # ← ЕДИНСТВЕННОЕ что пишет автор коллектора
        ...
```

**Конкретный коллектор сжимается до сути (OCP — расширяем, не меняя базу):**

```python
# collect/anti_galluc/negative_pairs.py
class NegativePairsCollector(Collector):
    name = "negative_pairs"
    output = "dataset_negative_pairs.jsonl"
    SOURCE_SQL = "SELECT name, fqn FROM rag_dsp.symbols WHERE ..."

    def build_pairs(self, rows):
        return [self._typo_pair(r) for r in rows]   # вся уникальная логика тут
```

- **GoF Strategy:** генераторы опечаток (swap/drop/suffix/prefix) — отдельные стратегии `TypoStrategy`, инъектируются в коллектор.
- **GoF Template Method:** `Collector.run()` — инвариантный скелет.
- **SOLID OCP:** новый коллектор = новый подкласс, база не меняется.
- **SOLID LSP:** все коллекторы взаимозаменяемы через `Collector` интерфейс → реестр гоняет их единообразно.

### 3.3 Реестр + Фабрика (GoF Factory / Registry) — запуск коллекторов

```python
# collect/registry.py
COLLECTORS: dict[str, type[Collector]] = {}      # name → класс

def register(cls):                                # декоратор-регистрация (Creator)
    COLLECTORS[cls.name] = cls; return cls

# collect/run.py — единый CLI вместо 48 __main__
#   python -m collect.run negative_pairs      # один
#   python -m collect.run --all               # все
# Controller (GRASP): один вход, создаёт Database/JsonlWriter и раздаёт коллекторам (Creator).
```

Это убирает 48× `if __name__ == "__main__"` + 48× ручной `connect()`.

### 3.4 Раннеры обучения — иерархия классов вместо россыпи `.sh`

**Факт:** 20+ `run_*.{sh,ps1}` + `qwen_*.sh` — копипаста с разными флагами (этой сессией мы как раз ловили баг от копипасты: пропавшие `--lora-*`).

**Решение:** один `train/runner.py` с конфиг-объектом (а не N шелл-скриптов):

```python
# train/runner.py
@dataclass
class TrainConfig:                 # все гиперпараметры — типизированный объект
    model: Path; dataset: Path
    max_steps: int; lora_r: int; lora_alpha: int; lora_all_linear: bool
    resume_from: Path | None = None
    ...

class TrainRunner:                 # Facade над train_simple.py + auto-resume
    def __init__(self, cfg: TrainConfig): ...
    def run(self): ...             # вкл. логику run_with_resume.sh (retry+resume)
```

- **GoF Facade:** `TrainRunner` прячет train_simple + resume-wrapper за один вызов.
- **Устраняет класс багов:** `--lora-*` теперь поле `TrainConfig` (нельзя «забыть»), а не флаг в копипасте → ровно тот баг, что убил ночной прогон.
- `.sh`-обёртки становятся тонкими: `python -m train.runner --config configs/biglora600.yaml`.

### 3.5 `dsp_assistant/` — НЕ ТРОГАТЬ (ревью §A4)

Внутренние хардкоды `e:\DSP-GPU` → перевести на `os.environ.get("DSP_GPU_ROOT")` (не через `core/paths` — изоляция пакета). Структуру пакета не менять.

### 3.6 Карта принципов → артефакты (для проверки)

| Принцип | Где применяется |
|---------|-----------------|
| **SRP** | каждый `core/*` класс — одна забота; коллектор только `build_pairs` |
| **OCP** | новый коллектор/стратегия — подкласс, база не меняется |
| **LSP** | все `Collector` взаимозаменяемы в реестре |
| **ISP** | узкие интерфейсы: `Collector`, `TypoStrategy`, `JsonlWriter` отдельно |
| **DIP** | коллектор зависит от `Database`/`JsonlWriter` абстракций, не от psycopg |
| **GRASP Pure Fabrication** | `core/db`, `core/jsonl`, `core/paths` — служебные классы |
| **GRASP Information Expert** | `MetaNormalizer`/`PathFilter` владеют своими данными |
| **GRASP Controller** | `collect/run.py`, `train/runner.py` — точки входа |
| **GRASP Creator** | реестр/фабрика создают коллекторы |
| **GRASP Low Coupling / High Cohesion** | папки по глаголам + DI |
| **GoF Template Method** | `Collector.run()` |
| **GoF Strategy** | `TypoStrategy`, pair-builders |
| **GoF Factory/Registry** | `collect/registry.py` |
| **GoF Facade** | `TrainRunner` |

---

## 4. Фазы выполнения (безопасно, обучение не ломаем)

> Все §-ссылки на детали — в плане 10.05 и ревью 11.05. Здесь — порядок с поправкой на 04.06.

| Фаза | Что | Когда | Риск |
|------|-----|-------|------|
| **0a** | кириллица `git mv collect_acк_advanced.py collect_ack_advanced.py`; убрать `t_fft*.py`, `*.bak`, `Obnova.py`, `_inspect_schema.py` (legacy); `Core/`→`phases/` | после финиша train | низкий |
| **0** | snapshot: `git add -A && commit`; ветка `reorg-2026-06` | — | — |
| **1** | каркас папок (Слой A) + `core/paths.py` + `core/db.py` + `core/jsonl.py` | — | низкий |
| **2** | `git mv` файлов по маппингу (план §Фаза2 + поправки §1.1) | — | средний |
| **3** | патч путей: 44 файла на `core.paths`; 2 хардкода `E:\` убрать | — | средний |
| **4** | ООП-рефактор (Слой B): база `Collector`, реестр, `TrainRunner` — **инкрементально**, по одному кластеру, со smoke после каждого | — | управляемый |
| **5** | `CLAUDE.md` + `.claude/rules/` + `.gitignore` + smoke (collect→build→train) | — | низкий |

**Порядок Слой A → Слой B критичен:** сначала разложить (git mv, history), потом классы. Не смешивать.

---

## 5. DoD

- [ ] Корень ≤10 файлов; 100 .py разнесены по папкам-глаголам
- [ ] `core/` (lowercase) с `paths/db/jsonl/meta/brief/filters`; `Core/`→`phases/`
- [ ] 0 хардкодов `E:\` / `C:\`; пути через `core.paths`
- [ ] Кириллица устранена; legacy (`t_fft`, `.bak`, `Obnova`) удалены
- [ ] База `Collector` + ≥1 кластер коллекторов переведён, реестр работает (`python -m collect.run --all`)
- [ ] `TrainRunner` + `TrainConfig` заменяют копипасту раннеров (с защитой от «забытых `--lora-*`»)
- [ ] `dsp_assistant/` не тронут структурно; внутр. пути на env
- [ ] git history сохранён (только `git mv`)
- [ ] smoke зелёный: один collector → build → один train-шаг

---

## 6. Открытые вопросы (нужно решение Alex)

1. **Глубина ООП Слоя B сейчас:** (A) только инфра `core/` + база `Collector` (быстро, 80% долга), или (B) ещё `TrainRunner` + Strategy на опечатки (полный)? — рекомендую **A сначала**, B после smoke.
2. **`Core/` (phase5/phase6):** переименовать в `phases/` или вынести в отдельный архив? Там бенчмарки/sql/results — много.
3. **`output/` чекпойнты:** в `train/checkpoints/` (по плану) или `data/checkpoints/`? Сейчас активный train пишет в `output/...` — переносить только после финиша.
4. **`prompts/` и `tests/`:** проверить `git log`, возможно legacy → удалить.
5. **Когда стартуем:** жду финиша текущего resume (≈3ч), потом ветка `reorg-2026-06`?

---

## 7. Связи

- План: `specs_Linux_Radion_9070/finetune_env_reorg_plan_2026-05-10.md`
- Ревью (21 находка + paths.py): `specs/finetune_env_reorg_review_2026-05-11.md`
- Таски: `tasks/TASK_FINETUNE_phase_B_*.md`
- Текущее обучение: `output/qwen25coder14b_v7_biglora_cont600_1632/` (resume 200→600), БД `llm_bench.runs` id=20,21

---

*Создано: 2026-06-04 · Кодо · актуализация + ООП-слой (SOLID/GRASP/GoF) к плану 10.05*
