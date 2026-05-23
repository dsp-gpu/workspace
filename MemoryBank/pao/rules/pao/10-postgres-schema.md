# 10 — PostgreSQL Schema (coexistence + per-target)

## Schemas

Один PG instance, **много schemas**:

| Schema | Owner | Назначение |
|--------|-------|-----------|
| `dsp_gpu` | DSP-GPU project (legacy) | существующий проект — НЕ трогаем |
| `rag_mentor` | rag-mentor | свой RAG про методику (D23) |
| `rag_pao_<target>` per target | rag-pao | symbols + deps + sessions + eval_runs target'а |
| `public` | system | extensions, public functions |

Каждый target → отдельная schema (`rag_pao_pao_contrib`, `rag_pao_pao_xxxx_acme`, ...).

## Таблицы в `rag_pao_<target>` (7 шт)

| Таблица | Что хранит |
|---------|-----------|
| `symbols` | classes / methods / functions / variables / enums из L2 |
| `dependencies` | edges include/inheritance/composition |
| `doc_blocks` | doxygen + use_cases + arch markdown blocks |
| `test_params` | parsed `@test` блоки + edge cases |
| `pybind_bindings` | если applicable |
| `sessions` | per-class journals (D17) |
| `eval_runs` | метрики прогонов (judge/reviewer/comparator scores) |

Init SQL: `pao_db/postgres_init.sql`.

## Миграции — alembic

```bash
cd pao_db
alembic upgrade head            # применить все миграции
alembic revision -m "add X column to sessions"   # создать новую
```

## Init нового target

```bash
bash scripts/add_target.sh pao_xxxx_acme
# что делает:
psql -U rag_pao -c "CREATE SCHEMA rag_pao_pao_xxxx_acme"
psql -U rag_pao -d rag_pao_pao_xxxx_acme -f pao_db/postgres_init.sql
alembic upgrade head --schema=rag_pao_pao_xxxx_acme
```

## Connection

```python
# rag_pao/core/utils/db.py
import psycopg
def get_conn(target: str):
    return psycopg.connect(
        host=ENV.POSTGRES_HOST,
        user=ENV.POSTGRES_USER,
        password=ENV.POSTGRES_PASSWORD,
        dbname=f"rag_pao_{target}",        # или один db с разными schemas
        options=f"-c search_path=rag_pao_{target},public"
    )
```

## Backup policy

Weekly pg_dump per target (`pao_db/backup.sh`):
```bash
pg_dump -U rag_pao --schema=rag_pao_pao_contrib > backups/pao_contrib_$(date +%Y%m%d).sql
```

Retention: 4 weeks. Manual backup перед каждой Phase'ой.

## НЕ трогать

- `dsp_gpu.*` schemas — это другой проект
- Public extensions (`vector`, `tsvector`) — оставляем

## Запреты

- НЕ давать одному target write-доступ к schema другого
- НЕ использовать `public` для наших таблиц
- НЕ удалять schemas без backup
