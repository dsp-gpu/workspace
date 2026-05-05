# TASK_RAG_01 — Переименование БД и schema (через ALTER)

> **Статус**: pending · **Приоритет**: HIGH · **Время**: ~1 ч · **Зависимости**: нет
> **Версия**: v2 (после ревью v2.1) · ALTER вместо sed-only

## Цель

Переименовать `database = dsp_assistant` → **`gpu_rag_dsp`** и `schema = dsp_gpu` → **`rag_dsp`**. БД на Ubuntu **уже существует и наполнена symbols** — поэтому метод `ALTER DATABASE`/`ALTER SCHEMA RENAME` (не CREATE заново). Однотипное имя — префикс `gpu_` обозначает «GPU-проект», далее `rag_dsp` — «RAG для DSP-GPU», задел под другие RAG-базы.

## Pre-step (обязательно ДО ALTER)

```bash
# Бэкап БД через шлюз (защита от ошибки ALTER)
pg_dump -h <ubuntu-host> -U dsp_asst dsp_assistant > _backup_pre_rag_2026-05-05.sql

# Snapshot Qdrant symbols-коллекции (на всякий)
curl -X POST http://<ubuntu-host>:6333/collections/dsp_gpu_code_v1/snapshots
```

Хост `<ubuntu-host>` — из `MemoryBank/specs/LLM_and_RAG/configs/stack.json` (целевой stage 2_work_local или 3_mini_server).

## ALTER SQL (через psql / psycopg2)

```sql
-- ВАЖНО: подключаемся к postgres (не к dsp_assistant) — нельзя переименовать БД к которой подключен
\c postgres

-- 1) Переименование БД
ALTER DATABASE dsp_assistant RENAME TO gpu_rag_dsp;

-- 2) Переименование схемы
\c gpu_rag_dsp
ALTER SCHEMA dsp_gpu RENAME TO rag_dsp;

-- 3) Smoke
\dn
SELECT count(*) FROM rag_dsp.symbols;
SELECT count(*) FROM rag_dsp.files;
```

## Файлы для правки (конфиги + spec)

| # | Файл | Что менять | Коммит |
|---|---|---|---|
| 1 | `MemoryBank/specs/LLM_and_RAG/configs/stack.json` | 4 stage'а: `database` → `gpu_rag_dsp`, `schema` → `rag_dsp` | **DSP-GPU** |
| 2 | `MemoryBank/specs/LLM_and_RAG/configs/postgres_init.sql` | `CREATE DATABASE`, `CREATE SCHEMA`, `\c`, `SET search_path` (для будущих fresh-инсталляций) | **DSP-GPU** |
| 3 | `MemoryBank/specs/LLM_and_RAG/configs/postgres_init_pgvector.sql` | то же | **DSP-GPU** |
| 4 | `MemoryBank/specs/LLM_and_RAG/03_Database_Schema_2026-04-30.md` | все упоминания `dsp_assistant` / `dsp_gpu` | **DSP-GPU** |
| 5 | `C:/finetune-env/dsp_assistant/db/client.py` | проверить хардкоды | **НЕ коммитим** (Alex держит в голове, решение #5) |
| 6 | `C:/finetune-env/dsp_assistant/config/loader.py` | то же | **НЕ коммитим** |

## Шаги

1. **Pre-flight grep** (для ревью Alex'ом перед ALTER):
   ```
   grep -rn "dsp_assistant\|dsp_gpu" \
     MemoryBank/specs/LLM_and_RAG/configs/ \
     MemoryBank/specs/LLM_and_RAG/03_*.md \
     C:/finetune-env/dsp_assistant/ \
     --include="*.py" --include="*.json" --include="*.sql" --include="*.md" \
     > MemoryBank/specs/LLM_and_RAG/_rename_audit.txt
   ```
   Alex смотрит → даёт OK на конкретные правки.

2. **Pre-step**: `pg_dump` + Qdrant snapshot (см. выше).

3. **Точечная sed-замена** в файлах #1-#4 (только БД/schema, **не** путь к коду `C:/finetune-env/dsp_assistant/`):
   - `dsp_assistant` → `gpu_rag_dsp` (только в database-ключах JSON и SQL `CREATE DATABASE`)
   - `dsp_gpu` → `rag_dsp` (только schema; **не** имя репо `dsp-gpu`)

4. **ALTER на live БД** через `psql` или Python скрипт.

5. **Файлы #5-#6** (`C:/finetune-env/`) — Alex правит сам ИЛИ Кодо правит, но **не коммитит** (Alex держит в голове).

6. **Smoke**: `python -c "from dsp_assistant.config import load_stack; from dsp_assistant.db import DbClient; cfg=load_stack('2_work_local'); db=DbClient(cfg.pg); db.connect(); print(db.fetchone('SELECT count(*) FROM rag_dsp.symbols'))"` — ожидаем число.

7. **Один коммит в DSP-GPU/MemoryBank** (без побочных правок):
   `rag/db: rename dsp_assistant → gpu_rag_dsp + schema rag_dsp (ALTER on live)`.

## Definition of Done

- [ ] `psql -h <host> -l` показывает БД **`gpu_rag_dsp`**, а **не** `dsp_assistant`.
- [ ] `psql -h <host> -d gpu_rag_dsp -c "\dn"` показывает схему **`rag_dsp`**, а **не** `dsp_gpu`.
- [ ] `SELECT count(*) FROM rag_dsp.symbols` возвращает то же число, что было в `dsp_gpu.symbols` до ALTER (данные не потеряны).
- [ ] `grep -rn "dsp_assistant" MemoryBank/specs/LLM_and_RAG/configs/` — пусто (только в backup-файле).
- [ ] `grep -rn "schema.*dsp_gpu\b" MemoryBank/specs/LLM_and_RAG/configs/` — пусто.
- [ ] `dsp_assistant/` (путь модуля) **не тронут** в файлах DSP-GPU.
- [ ] Файлы `C:/finetune-env/dsp_assistant/` правлены, но **не закоммичены** в DSP-GPU.
- [ ] `dsp-asst ping` (с обновлённым stack.json) проходит.
- [ ] Один коммит в DSP-GPU/MemoryBank создан, Alex дал OK на push.

## Откат

```sql
\c postgres
ALTER DATABASE gpu_rag_dsp RENAME TO dsp_assistant;
\c dsp_assistant
ALTER SCHEMA rag_dsp RENAME TO dsp_gpu;
```

+ `git revert <sha>` для конфигов.
+ Файлы `C:/finetune-env/` Alex откатывает сам (не коммитились).

Если что-то сломалось критически: `psql -d postgres -f _backup_pre_rag_2026-05-05.sql` (восстановление из дампа).

## Связано с

- План: `MemoryBank/specs/LLM_and_RAG/RAG_three_agents_plan_2026-05-05.md` §5.1
- Ревью: `RAG_three_agents_review_2026-05-05.md` v2.1 §«Решения Alex'а» #5/#6/#9, §«Таски → TASK_RAG_01»
- Зависит от: ничего
- Блокирует: TASK_RAG_02
