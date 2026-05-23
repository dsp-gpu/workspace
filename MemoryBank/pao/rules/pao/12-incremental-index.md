# 12 — Incremental Index (blake3 hash skip)

> Перенидексация одного класса не должна занимать минуты. Используем blake3 hash skip.

## Алгоритм

```python
# rag_pao/core/indexer/hash_skip/incremental.py
import blake3

def file_hash(path: Path) -> str:
    return blake3.blake3(path.read_bytes()).hexdigest()

def should_reindex(target: str, file_path: Path) -> bool:
    current = file_hash(file_path)
    stored = pg.fetchval(
        "SELECT hash FROM rag_pao_<target>.file_hashes WHERE path=%s",
        (str(file_path),)
    )
    return current != stored

def mark_indexed(target: str, file_path: Path):
    pg.execute(
        "INSERT INTO rag_pao_<target>.file_hashes(path, hash, indexed_at) VALUES(%s, %s, now()) "
        "ON CONFLICT(path) DO UPDATE SET hash=EXCLUDED.hash, indexed_at=now()",
        (str(file_path), file_hash(file_path))
    )
```

## Workflow re-index

```python
def reindex_target(target: str):
    for file_path in walk_target(target):
        if not should_reindex(target, file_path):
            log.debug(f"skip {file_path} — unchanged")
            continue

        # Re-extract symbols + embeddings
        symbols = libclang_extract(file_path)
        update_pg(target, file_path, symbols)

        embeddings = bge_m3_embed(symbols)
        update_qdrant(target, embeddings)

        mark_indexed(target, file_path)
```

## Скорость

- Полный реиндекс `pao_contrib` (~45 модулей, ~5000 файлов): ~30 минут
- Incremental после 1 файла изменился: ~3 секунды
- Incremental после Phase 06 (когда L3 заполнен): ~5 секунд (skipnет 99.9% файлов)

## Точки re-index

| Триггер | Что reindex'ить |
|---------|-----------------|
| Заказчик обновил drop (`git pull /srv/pao_<name>`) | весь target |
| Phase 06 закончилась | L3+L3b (артефакты в `.rag/`) |
| Embedder upgrade (BGE-M3 → новый) | весь target (новая collection) |
| Изменился extraction pipeline | весь target |

## Force re-index

```bash
bash scripts/reindex_target.sh pao_contrib --force
```

→ TRUNCATE `file_hashes` → re-index всё.

## Где hash хранится

`rag_pao_<target>.file_hashes`:
```sql
CREATE TABLE file_hashes (
    path TEXT PRIMARY KEY,
    hash CHAR(64) NOT NULL,          -- blake3 hex digest
    indexed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Запреты

- НЕ использовать md5/sha1 — blake3 в 5× быстрее на больших файлах
- НЕ хэшировать содержимое БД (только source files)
