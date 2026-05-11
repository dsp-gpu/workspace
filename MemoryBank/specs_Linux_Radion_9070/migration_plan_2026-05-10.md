# Migration Plan: Windows (WSL Ubuntu) → Debian + RX 9070

> **Цель:** поднять полный LLM/RAG стек на рабочем Debian 12.05 с нуля.
> **ETA:** ~3-4 часа (без обучения; обучение Phase B = +3-4ч).

---

## 🗺️ 6 фаз миграции

### Фаза 0 — pre-flight (до приезда на работу) — ~30 мин дома

**На Windows:**
1. Подготовить SSD: скопировать `qwen3-8b/` + BGE-M3 + reranker (~23 GB) — см. `ssd_transfer_list_2026-05-10.md`.
2. Push в git **всё** что в `finetune-env`:
   ```powershell
   cd E:\finetune-env   # был C:\finetune-env до 11.05
   git status -sb
   git add -A   # или точечно если есть секреты
   git commit -m "pre-debian-migration: full snapshot"
   git push origin main
   ```
3. Push в git все 10 репо DSP-GPU (workspace + 9).
4. Вытащить SSD, забрать на работу.

---

### Фаза 1 — инфраструктура на Debian (~30 мин)

**Проверка что есть** (Alex сказал «всё установлено», но для протокола):
```bash
psql --version              # PostgreSQL >= 14 (для pgvector)
docker --version            # для Qdrant
python3 --version           # 3.11+
ollama --version            # для inference
hipcc --version             # ROCm 7.2+
```

**Создать БД gpu_rag_dsp** (уже на Ubuntu/Debian — нативно, без WSL):
```bash
sudo -u postgres psql <<EOF
CREATE DATABASE gpu_rag_dsp;
CREATE USER dsp_asst WITH PASSWORD '1';
GRANT ALL ON DATABASE gpu_rag_dsp TO dsp_asst;
\c gpu_rag_dsp
CREATE EXTENSION IF NOT EXISTS vector;
CREATE SCHEMA rag_dsp AUTHORIZATION dsp_asst;
GRANT ALL ON SCHEMA rag_dsp TO dsp_asst;
EOF
```

**Запустить Qdrant** (через Docker):
```bash
docker run -d --name qdrant --restart=always \
  -p 6333:6333 -p 6334:6334 \
  -v /home/alex/qdrant_storage:/qdrant/storage \
  qdrant/qdrant

# Проверка
curl http://localhost:6333/healthz
# expected: healthz check passed
```

---

### Фаза 2 — копирование двоичных с SSD (~10 мин)

```bash
sudo mount /dev/sdX1 /mnt/ssd        # подключить SSD
ls /mnt/ssd/dsp-gpu-migration/

# qwen3-8b в finetune-env
mkdir -p /home/alex/finetune-env
cp -r /mnt/ssd/dsp-gpu-migration/qwen3-8b /home/alex/finetune-env/

# BGE-M3 + reranker в HF cache
mkdir -p ~/.cache/huggingface/hub
cp -r /mnt/ssd/dsp-gpu-migration/hf-cache/* ~/.cache/huggingface/hub/

# Verify
du -sh /home/alex/finetune-env/qwen3-8b           # ~16 GB
du -sh ~/.cache/huggingface/hub/models--BAAI--*   # ~6.8 GB
```

---

### Фаза 3 — git clone + venv setup (~15 мин)

```bash
# 1. Клонировать finetune-env (репо AlexLan73/finetune-env, отдельный от dsp-gpu org)
cd /home/alex
git clone https://github.com/AlexLan73/finetune-env.git || (cd finetune-env && git pull)

# 2. Python venv (3.11+ per pyproject.toml; 3.12 если есть, иначе 3.11)
cd /home/alex/finetune-env
python3 -m venv .venv      # или python3.12 -m venv .venv если установлен
source .venv/bin/activate

# 3. Install dsp-asst (editable mode — pyproject.toml)
pip install --upgrade pip
pip install -e .                      # ставит dsp-assistant пакет + все deps из pyproject.toml

# 4. Доп. зависимости для скриптов collect_*.py / train_*.py
pip install psycopg[binary] sklearn sentence-transformers transformers peft accelerate bitsandbytes datasets pyyaml

# 5. Verify CLI
dsp-asst --help
dsp-asst ping
```

**Если 10 репо DSP-GPU ещё не клонированы:**
```bash
cd /home/alex
git clone https://github.com/dsp-gpu/workspace DSP-GPU
cd DSP-GPU
for r in core spectrum stats signal_generators heterodyne linalg radar strategies DSP; do
  git clone https://github.com/dsp-gpu/$r
done
```

---

### Фаза 4 — наполнение PostgreSQL (~30-60 мин)

**Применить миграции схемы:**
```bash
cd /home/alex/finetune-env
source .venv/bin/activate
export DSP_ASST_PG_PASSWORD=1
export DSP_GPU_ROOT=/home/alex/DSP-GPU

# Применить SQL миграции (создать таблицы)
psql -h localhost -U dsp_asst -d gpu_rag_dsp \
  -f dsp_assistant/migrations/2026-05-08_rag_tables_tsvector.sql
psql -h localhost -U dsp_asst -d gpu_rag_dsp \
  -f dsp_assistant/migrations/2026-05-08_test_params_extend.sql
```

**Запустить indexer (главное наполнение):**
```bash
# Polный индекс через CLI (точное имя команды надо проверить — варианты):
dsp-asst index --root /home/alex/DSP-GPU --all
# или:
python -m dsp_assistant.indexer.build --root /home/alex/DSP-GPU
# или:
dsp-asst rebuild-index
```

После основного индекса:
```bash
# test_params (LEVEL 1 через @test* парсер) — у нас есть отдельный скрипт
python parse_test_tags.py --root /home/alex/DSP-GPU
python ingest_test_tags.py

# _RAG.md манифесты (если ещё не созданы в репо)
python generate_rag_manifest.py

# arch файлы C2/C3/C4
python generate_arch_files.py
```

**Проверка после наполнения:**
```bash
psql -h localhost -U dsp_asst -d gpu_rag_dsp -c "
SELECT 'files' AS tbl, count(*) FROM rag_dsp.files
UNION ALL SELECT 'symbols', count(*) FROM rag_dsp.symbols
UNION ALL SELECT 'doc_blocks', count(*) FROM rag_dsp.doc_blocks
UNION ALL SELECT 'test_params', count(*) FROM rag_dsp.test_params
UNION ALL SELECT 'pybind_bindings', count(*) FROM rag_dsp.pybind_bindings
UNION ALL SELECT 'embeddings', count(*) FROM rag_dsp.embeddings;
"
# Expected (приблизительно):
# files          ~600
# symbols        ~3000
# doc_blocks     ~2287
# test_params    ~1319
# pybind_bindings ~42
# embeddings     ~5432
```

---

### Фаза 5 — наполнение Qdrant (~10 мин)

**Скрипт `migrate_pgvector_to_qdrant.py` (НАДО НАПИСАТЬ 12.05)**, ~150 строк:

```python
"""Перенос embeddings из pgvector → Qdrant collections."""
import psycopg
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct

client = QdrantClient(host="localhost", port=6333)

# 3 коллекции (1024-dim BGE-M3, cosine):
for col in ["dsp_symbols", "dsp_doc_blocks", "dsp_test_params"]:
    client.recreate_collection(col, vectors_config=VectorParams(size=1024, distance=Distance.COSINE))

# SELECT из pgvector + JOIN с metadata → Upsert в Qdrant
with psycopg.connect(...) as conn, conn.cursor() as cur:
    cur.execute("""
        SELECT e.id, e.vector, s.fqn, s.kind, f.repo, s.doxy_brief
          FROM rag_dsp.embeddings e
          JOIN rag_dsp.symbols s ON s.id = e.symbol_id
          JOIN rag_dsp.files f ON f.id = s.file_id
    """)
    points = [
        PointStruct(id=row[0], vector=row[1].tolist(),
                    payload={"fqn": row[2], "kind": row[3], "repo": row[4], "brief": row[5]})
        for row in cur.fetchall()
    ]
    client.upsert("dsp_symbols", points=points)

# Аналогично для doc_blocks / test_params
print(f"Upserted {len(points)} points in dsp_symbols")
```

**Verify:**
```bash
curl http://localhost:6333/collections/dsp_symbols
# expected: {"points_count": ~5432, ...}
```

---

### Фаза 6 — LLM локально через Ollama (~15 мин)

**Если Phase B уже обучен дома и checkpoint на SSD:**
```bash
cp -r /mnt/ssd/dsp-gpu-migration/phase_b_2026-05-12 /home/alex/finetune-env/

cd /home/alex/finetune-env
ollama create qwen3-8b-dsp -f Modelfile.template
ollama serve  # http://localhost:11434
ollama run qwen3-8b-dsp "Что делает FFTProcessorROCm в DSP-GPU?"
```

**Если обучение делаем на работе** (RX 9070):
```bash
cd /home/alex/finetune-env
source .venv/bin/activate
chmod +x run_full_qwen3_r16_9070.sh
./run_full_qwen3_r16_9070.sh
# 3-4 часа на обучение

# После обучения — собрать в Ollama
ollama create qwen3-8b-dsp -f Modelfile.template
```

**Большие модели (опционально)**:
```bash
# Если RAM 64GB позволяет
ollama pull qwen3:14b      # 30 GB
ollama pull qwen2.5-coder:7b  # 14 GB
# Qwen3:32B — потребует offload, можно попробовать
```

---

### Фаза 7 (бонус) — `dsp-asst serve` MCP (~5 мин)

```bash
cd /home/alex/finetune-env
source .venv/bin/activate
export DSP_ASST_PG_PASSWORD=1
export DSP_GPU_ROOT=/home/alex/DSP-GPU

# В отдельном терминале (Терминал 0 — зарезервирован для этого):
dsp-asst serve --host localhost --port 8765
```

**Тест MCP-tools** через Claude Code:
- `mcp__dsp-asst__dsp_health` → должен показать `vector_db: pgvector` + Qdrant info
- `mcp__dsp-asst__dsp_find('FFTProcessor')`
- `mcp__dsp-asst__dsp_search('как профилировать ядро')`

---

## 🚦 ETA итого

| Фаза | Что | ETA |
|------|-----|----:|
| 0 | Pre-flight (дома, push в git + SSD prep) | 30 мин |
| 1 | Инфра PG + Qdrant | 30 мин |
| 2 | Копирование с SSD | 10 мин |
| 3 | git clone + venv | 15 мин |
| 4 | PostgreSQL наполнение | 30-60 мин |
| 5 | Qdrant миграция | 10 мин |
| 6 | LLM (если есть checkpoint) | 15 мин |
| 6+ | Phase B обучение (если на работе) | +3-4 ч |
| 7 | dsp-asst serve | 5 мин |
| **Σ** | **С обучением** | **5-7 ч** |
| **Σ** | **Без обучения (если checkpoint готов)** | **2-3 ч** |

---

## ⚠️ Риски / точки отказа

1. **`dsp-asst index` команда — точное имя?** Проверить через `dsp-asst --help` или просмотреть `dsp_assistant/cli/main.py`.
2. **BGE-M3 embeddings на CPU vs GPU** — на CPU ~30 мин, на GPU 3-5 мин. Проверить что `embedder_bge_late.py` подхватит ROCm GPU через `device='cuda'` (HIP совместимость).
3. **Qdrant Docker** — если Docker не установлен / нет прав → fallback на nativnyy install (binary download с github.com/qdrant/qdrant/releases).
4. **`migrate_pgvector_to_qdrant.py`** — нужно **написать** на 12.05. Шаблон в Фазе 5 выше, ~150 строк.
5. **Cross-platform пути** — 86 .py хардкодят `Path(r"E:\finetune-env\...")` (после 11.05; ранее `C:\`). Перед запуском на Debian → переменная `DSP_GPU_ROOT=/home/alex/DSP-GPU` + `FINETUNE_ROOT=/home/alex/finetune-env`. Полное решение — `core/paths.py` cross-platform (см. `MemoryBank/specs/finetune_env_reorg_review_2026-05-11.md` §4). Временное — `tools/migrate_paths_C_to_E.py` (mass replace).

---

*Migration plan: 2026-05-10 поздняя ночь · 6 фаз × командами × ETA*
