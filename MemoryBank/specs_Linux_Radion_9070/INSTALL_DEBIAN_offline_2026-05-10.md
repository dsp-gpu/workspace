# INSTALL_DEBIAN — пошаговая установка из offline pack

> **Сценарий:** Debian 12 + RX 9070, **без интернета**. SSD с offline pack из `offline_pack_download_list_2026-05-10.md`.
> **ETA:** ~2-4 часа (с обучением Phase B = +3-4 ч).
> **Целевая структура на Debian:**
> - `/home/alex/DSP-GPU/` — 10 репо (распакованы из git bundles)
> - `/home/alex/finetune-env/` — Python проект + dsp_assistant пакет
> - `/home/alex/qdrant_storage/` — Qdrant data
> - `~/.cache/huggingface/hub/` — embeddings модели
> - `~/.ollama/models/` — Ollama модели

---

## 🔌 Шаг 0 — Подключение SSD (5 мин)

```bash
# Узнать какое устройство SSD
lsblk
# Например /dev/sdb1 (NTFS) или /dev/sdb1 (ext4 / exFAT)

# Создать точку монтирования и примонтировать
sudo mkdir -p /mnt/ssd
sudo mount /dev/sdb1 /mnt/ssd

# Проверить содержимое
ls -lh /mnt/ssd/offline-debian-pack/
# Должно быть: 1_models, 2_software, 3_python_wheels, 4_git_bundles, 5_apt_offline, 6_docker_images

# Назначить переменную для удобства
export OFFLINE=/mnt/ssd/offline-debian-pack
```

**Если SSD в NTFS** и не монтируется автоматически:
```bash
sudo apt install -y ntfs-3g  # (если интернет был хоть раз)
sudo mount -t ntfs-3g /dev/sdb1 /mnt/ssd
```

---

## 🛠️ Шаг 1 — Системные APT пакеты (5 мин, опционально)

**Если на Debian уже установлены: gcc, cmake, postgresql-server-dev-16, python3.12, git** — пропусти этот шаг.

**Если нет (offline install из 5_apt_offline/):**
```bash
cd $OFFLINE/5_apt_offline
sudo dpkg -i *.deb
# Если жалуется на dependency — не страшно, попробует поставить что может

# Проверка ключевых
gcc --version           # >= 12
cmake --version         # >= 3.20
python3.12 --version    # 3.12.x
git --version           # >= 2.39
```

---

## 🗄️ Шаг 2 — PostgreSQL 16 + pgvector (15 мин)

### 2A. PostgreSQL 16 (если не установлен)
```bash
cd $OFFLINE/2_software
sudo dpkg -i postgresql-common_*.deb postgresql-client-common_*.deb
sudo dpkg -i postgresql-client-16_*.deb
sudo dpkg -i postgresql-16_*.deb
sudo dpkg -i postgresql-server-dev-16_*.deb

# Запуск
sudo systemctl enable --now postgresql
sudo systemctl status postgresql | head -5  # должно быть active (running)
```

### 2B. pgvector — компиляция из исходников
```bash
cd $OFFLINE/2_software
tar xf pgvector-0.8.0.tar.gz -C ~/
cd ~/pgvector-0.8.0/
make                    # ~30 секунд
sudo make install       # ставит pgvector.so в /usr/lib/postgresql/16/lib/

# Verify
ls /usr/lib/postgresql/16/lib/vector.so   # должен быть
```

### 2C. Создать БД gpu_rag_dsp
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

# Verify
psql -h localhost -U dsp_asst -d gpu_rag_dsp -c "SELECT extname FROM pg_extension WHERE extname='vector';"
# Expected: vector | 0.8.0
```

---

## 🔍 Шаг 3 — Qdrant (5 мин)

### Вариант A — нативный binary (рекомендуется)
```bash
cd $OFFLINE/2_software
tar xf qdrant-1.12.4-linux-x86_64.tar.gz -C ~/
mkdir -p ~/qdrant
mv ~/qdrant_x86_64-unknown-linux-gnu/qdrant ~/qdrant/
chmod +x ~/qdrant/qdrant

mkdir -p ~/qdrant_storage
cd ~/qdrant
nohup ./qdrant > qdrant.log 2>&1 &
echo $! > qdrant.pid

# Verify
sleep 3
curl http://localhost:6333/healthz
# Expected: healthz check passed
```

### Вариант B — через Docker (если Docker установлен)
```bash
# Загрузить из tar
docker load -i $OFFLINE/6_docker_images/qdrant-v1.12.4.tar

# Запустить
docker run -d --name qdrant --restart=always \
  -p 6333:6333 -p 6334:6334 \
  -v /home/alex/qdrant_storage:/qdrant/storage \
  qdrant/qdrant:v1.12.4

# Verify
sleep 3
curl http://localhost:6333/healthz
```

### Автозапуск Qdrant при старте (через systemd, для Варианта A)
```bash
sudo tee /etc/systemd/system/qdrant.service > /dev/null <<EOF
[Unit]
Description=Qdrant Vector Database
After=network.target

[Service]
Type=simple
User=alex
WorkingDirectory=/home/alex/qdrant
ExecStart=/home/alex/qdrant/qdrant
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now qdrant
```

---

## 🤖 Шаг 4 — Ollama (10 мин)

```bash
# Распаковка
cd $OFFLINE/2_software
sudo tar -C /usr -xzf ollama-0.4.5-linux-amd64.tgz

# Verify
ollama --version

# Создать пользователя ollama (если нужно для systemd)
sudo useradd -r -s /bin/false -m -d /usr/share/ollama ollama || true

# Запуск (вручную или через systemd)
ollama serve > ~/ollama.log 2>&1 &
echo $! > ~/ollama.pid

# Verify
sleep 3
curl http://localhost:11434/api/version
# Expected: {"version":"0.4.5"}
```

### Автозапуск Ollama
```bash
sudo tee /etc/systemd/system/ollama.service > /dev/null <<EOF
[Unit]
Description=Ollama Service
After=network.target

[Service]
Type=simple
User=alex
ExecStart=/usr/local/bin/ollama serve
Environment=OLLAMA_HOST=0.0.0.0:11434
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ollama
```

---

## 📦 Шаг 5 — HuggingFace модели (5-10 мин копирования, ~150 GB)

> **⚠️ ПЕРЕПИСАНО 11.05** (см. `MemoryBank/specs/finetune_env_reorg_review_2026-05-11.md` D3).
> Старый подход `huggingface-cli download --local-dir` создаёт **flat layout**, который HF SDK НЕ подхватит как cache.
> **Правильно**: на Windows скачивать через `HF_HOME` env, на Debian копировать целиком `hub/`.

### 5A. Если на Windows скачано через `HF_HOME` (правильный layout)

```bash
# Создать целевую директорию
mkdir -p ~/.cache/huggingface

# Скопировать ВЕСЬ hub/ — внутри уже правильная структура models--*\snapshots\<hash>\...
cp -r $OFFLINE/1_hf_cache/hub ~/.cache/huggingface/hub

# Verify правильной структуры
ls ~/.cache/huggingface/hub/models--BAAI--bge-m3/snapshots/
# Expected: <commit_hash>/  (не "main", а реальный sha)
```

### 5B. Если на Windows скачано через `--local-dir` (flat layout — fallback)

Тогда используем **прямой путь к модели** в коде, обходя HF cache:
```bash
# Просто скопировать на постоянное место (не в HF cache)
mkdir -p /home/alex/models
cp -r $OFFLINE/1_models/bge-m3 /home/alex/models/bge-m3
cp -r $OFFLINE/1_models/bge-reranker-v2-m3 /home/alex/models/bge-reranker-v2-m3

# В скриптах использовать прямой путь:
#   from FlagEmbedding import BGEM3FlagModel
#   model = BGEM3FlagModel('/home/alex/models/bge-m3', use_fp16=True)
```

И добавить в `.env`:
```bash
DSP_ASST_BGE_M3_PATH=/home/alex/models/bge-m3
DSP_ASST_BGE_RERANKER_PATH=/home/alex/models/bge-reranker-v2-m3
```

### 5C. Qwen3-8B (всегда прямой путь, не в HF cache)

```bash
# До reorg — в корень finetune-env:
mkdir -p /home/alex/finetune-env
cp -r $OFFLINE/1_models/qwen3-8b /home/alex/finetune-env/qwen3-8b

# После reorg — в models/:
# cp -r $OFFLINE/1_models/qwen3-8b /home/alex/finetune-env/models/qwen3-8b

# Verify
du -sh /home/alex/finetune-env/qwen3-8b           # ~16 GB
du -sh ~/.cache/huggingface/hub/models--BAAI--* 2>/dev/null || \
  du -sh /home/alex/models/bge-* 2>/dev/null     # ~6.8 GB total
```

### 5D. Включить offline-режим HF (важно)
```bash
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1
```
(Можно положить в `.env` и `source` перед запуском скриптов.)

---

## 🐍 Шаг 6 — Python venv + offline install (10 мин)

```bash
# Создать venv (3.11+ per pyproject; 3.12 если есть)
cd /home/alex/finetune-env
python3 -m venv .venv      # или python3.12 если установлен
source .venv/bin/activate

# Обновить pip из локального wheel (если есть)
pip install --upgrade --no-index --find-links $OFFLINE/3_python_wheels pip setuptools wheel

# === Установить torch (ROCm версия) ===
pip install --no-index --find-links $OFFLINE/3_python_wheels/torch-rocm \
    torch torchvision torchaudio

# === Установить остальные зависимости ===
pip install --no-index --find-links $OFFLINE/3_python_wheels \
    -r $OFFLINE/3_python_wheels/requirements.txt

# === Установить dsp-asst в editable режиме (если git bundle уже распакован — см. Шаг 7) ===
# Это шаг будет в Шаге 8 после клонирования finetune-env из git bundle
```

### Verify torch + ROCm
```bash
python -c "import torch; print('torch:', torch.__version__); print('hip:', torch.version.hip if hasattr(torch.version, 'hip') else 'no hip'); print('cuda available (HIP):', torch.cuda.is_available())"
# Expected:
#   torch: 2.4.x+rocm6.2
#   hip: 6.2.x
#   cuda available (HIP): True
```

---

## 📂 Шаг 7 — Git bundles → клонирование репо (10 мин)

```bash
mkdir -p /home/alex/DSP-GPU
cd /home/alex/DSP-GPU

# Клонировать workspace (содержит MemoryBank + .claude + CLAUDE.md)
git clone $OFFLINE/4_git_bundles/workspace.bundle .

# Клонировать 9 саб-репо
for repo in core spectrum stats signal_generators heterodyne linalg radar strategies DSP; do
    git clone $OFFLINE/4_git_bundles/${repo}.bundle ${repo}
done

# Проверка структуры
ls /home/alex/DSP-GPU/
# Expected: CLAUDE.md core spectrum stats signal_generators heterodyne linalg radar strategies DSP MemoryBank .claude

# Клонировать finetune-env (если ещё не клонирован)
cd /home/alex
# ВАЖНО: если finetune-env/ уже создан с qwen3-8b/ — клонируем рядом и переносим
git clone $OFFLINE/4_git_bundles/finetune-env.bundle finetune-env-git

# Слияние с уже скопированной qwen3-8b/
mv finetune-env-git/* finetune-env/  2>/dev/null || true
mv finetune-env-git/.* finetune-env/ 2>/dev/null || true
rm -rf finetune-env-git

cd /home/alex/finetune-env
ls
# Expected: dsp_assistant/, *.py скрипты, dataset_*.jsonl, qwen3-8b/, pyproject.toml
```

### Установить dsp-asst (editable)
```bash
cd /home/alex/finetune-env
source .venv/bin/activate
pip install --no-index --find-links $OFFLINE/3_python_wheels -e .

# Verify
dsp-asst --help
```

---

## 🗃️ Шаг 8 — Применить SQL миграции (2 мин)

```bash
cd /home/alex/finetune-env
export DSP_ASST_PG_PASSWORD=1
export DSP_GPU_ROOT=/home/alex/DSP-GPU

# Применить миграции
psql -h localhost -U dsp_asst -d gpu_rag_dsp \
    -f dsp_assistant/migrations/2026-05-08_rag_tables_tsvector.sql
psql -h localhost -U dsp_asst -d gpu_rag_dsp \
    -f dsp_assistant/migrations/2026-05-08_test_params_extend.sql

# Verify
psql -h localhost -U dsp_asst -d gpu_rag_dsp -c "\dt rag_dsp.*"
# Expected: 15 таблиц (files, symbols, doc_blocks, embeddings, ...)
```

---

## ⚙️ Шаг 9 — Indexer наполнения PG (30-60 мин)

```bash
cd /home/alex/finetune-env
source .venv/bin/activate
export DSP_ASST_PG_PASSWORD=1
export DSP_GPU_ROOT=/home/alex/DSP-GPU
# offline режим HF — не пытаться качать
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1

# Запустить indexer
dsp-asst index --root /home/alex/DSP-GPU --all
# или fallback:
python -m dsp_assistant.indexer.build --root /home/alex/DSP-GPU
```

**Если indexer ругается на отсутствие BGE-M3 в HF cache** — задать прямой путь:
```bash
export DSP_ASST_BGE_M3_PATH=$OFFLINE/1_models/bge-m3
# или поправить config: dsp_assistant/config/...
```

### Дополнительные шаги (наши collect-скрипты вне dsp-asst)
```bash
# test_params LEVEL 1 (через @test* парсер)
python parse_test_tags.py
python ingest_test_tags.py

# _RAG.md манифесты (если ещё не созданы)
python generate_rag_manifest.py

# arch C2/C3/C4 файлы
python generate_arch_files.py
```

### Verify наполнения
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

## 🔁 Шаг 10 — Миграция pgvector → Qdrant (15 мин)

**Скрипт `migrate_pgvector_to_qdrant.py` нужно написать на месте.** Шаблон ниже.

```bash
cat > /home/alex/finetune-env/migrate_pgvector_to_qdrant.py <<'EOF'
"""Перенос embeddings из pgvector → Qdrant (3 коллекции)."""
import os, psycopg
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct

DIM = 1024  # BGE-M3 dimension

def connect_pg():
    return psycopg.connect(
        host="localhost", port=5432, dbname="gpu_rag_dsp",
        user="dsp_asst", password=os.environ["DSP_ASST_PG_PASSWORD"],
        options="-c search_path=rag_dsp,public",
    )

def migrate(table, source_col, qd_collection, payload_query):
    client = QdrantClient(host="localhost", port=6333)
    client.recreate_collection(qd_collection,
        vectors_config=VectorParams(size=DIM, distance=Distance.COSINE))

    with connect_pg() as conn, conn.cursor() as cur:
        cur.execute(payload_query)
        rows = cur.fetchall()
        points = []
        for row in rows:
            row_id, vec = row[0], row[1]
            payload = dict(zip([d[0] for d in cur.description[2:]], row[2:]))
            points.append(PointStruct(
                id=row_id,
                vector=list(vec),
                payload=payload,
            ))
        client.upsert(qd_collection, points=points)
        print(f"{qd_collection}: upserted {len(points)} points")

if __name__ == "__main__":
    # 1. dsp_symbols
    migrate("symbols", "embedding", "dsp_symbols", """
        SELECT e.symbol_id AS id, e.vector,
               s.fqn, s.name, s.kind, s.namespace, s.doxy_brief, f.repo, f.path
          FROM rag_dsp.embeddings e
          JOIN rag_dsp.symbols s ON s.id = e.symbol_id
          JOIN rag_dsp.files f ON f.id = s.file_id
         WHERE e.vector IS NOT NULL
    """)
    # TODO: добавить doc_blocks + test_params когда там будут embeddings
    print("Done.")
EOF

cd /home/alex/finetune-env
source .venv/bin/activate
export DSP_ASST_PG_PASSWORD=1
python migrate_pgvector_to_qdrant.py

# Verify
curl http://localhost:6333/collections/dsp_symbols
# Expected: {"result":{"status":"green","points_count":~5432,...}}
```

---

## 🧠 Шаг 11 — LLM Phase B обучение (3-4 ч на RX 9070)

```bash
cd /home/alex/finetune-env
source .venv/bin/activate
export DSP_ASST_PG_PASSWORD=1
export HF_HUB_OFFLINE=1
export TRANSFORMERS_OFFLINE=1

# Скрипт обучения
chmod +x run_full_qwen3_r16_9070.sh
./run_full_qwen3_r16_9070.sh 2>&1 | tee phase_b_2026-05-12.log

# Параметры (из spec'a):
#   - Base: ./qwen3-8b/
#   - LoRA: r=16, alpha=32
#   - bf16
#   - 3 epochs
#   - Train: dataset_v4_train.jsonl (4975 пар)
#   - Eval:  dataset_v4_val.jsonl (798 пар)
```

**Если падает с OOM на 16 GB VRAM:**
```bash
# Уменьшить batch_size или включить 4bit
# В run_full_qwen3_r16_9070.sh: добавить --load_in_4bit или --gradient_accumulation_steps=8
```

---

## 🚀 Шаг 12 — Загрузить модель в Ollama (5 мин)

```bash
cd /home/alex/finetune-env
ls phase_b_2026-05-12/   # должен быть adapter_model.safetensors + adapter_config.json

# Создать Modelfile (если шаблон есть — иначе адаптировать)
cat > Modelfile.phase_b <<EOF
FROM ./qwen3-8b
ADAPTER ./phase_b_2026-05-12

PARAMETER temperature 0.3
PARAMETER top_p 0.9
PARAMETER num_ctx 4096

SYSTEM """Ты — Кодо, code assistant проекта DSP-GPU. Отвечай на русском, используй данные из предоставленного контекста проекта (RAG)."""
EOF

# Создать ollama модель
ollama create qwen3-8b-dsp -f Modelfile.phase_b

# Проверка
ollama list
# Expected: qwen3-8b-dsp:latest

# Smoke test
ollama run qwen3-8b-dsp "Что делает класс FFTProcessorROCm в репо spectrum?"
```

---

## 🌐 Шаг 13 — `dsp-asst serve` MCP сервер (5 мин)

```bash
cd /home/alex/finetune-env
source .venv/bin/activate
export DSP_ASST_PG_PASSWORD=1
export DSP_GPU_ROOT=/home/alex/DSP-GPU
export HF_HUB_OFFLINE=1

# В отдельном терминале (Терминал 0 — зарезервирован)
dsp-asst serve --host localhost --port 8765
# или нативно через systemd (см. ниже)
```

### systemd unit для автозапуска
```bash
sudo tee /etc/systemd/system/dsp-asst.service > /dev/null <<EOF
[Unit]
Description=DSP-Assistant RAG Server
After=postgresql.service qdrant.service

[Service]
Type=simple
User=alex
WorkingDirectory=/home/alex/finetune-env
Environment=DSP_ASST_PG_PASSWORD=1
Environment=DSP_GPU_ROOT=/home/alex/DSP-GPU
Environment=HF_HUB_OFFLINE=1
Environment=TRANSFORMERS_OFFLINE=1
ExecStart=/home/alex/finetune-env/.venv/bin/dsp-asst serve --host 0.0.0.0 --port 8765
Restart=always

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now dsp-asst
sudo systemctl status dsp-asst | head -10
```

### Verify через curl / MCP
```bash
curl http://localhost:8765/health
# Expected JSON с статусом БД + Qdrant + embedded model

# Если есть Claude Code на этой же машине — конфиг MCP:
# ~/.config/claude-code/mcp.json:
# { "mcpServers": { "dsp-asst": { "command": "dsp-asst", "args": ["serve"] } } }
```

---

## ✅ Финальный CHECKLIST

- [ ] `psql -U dsp_asst -d gpu_rag_dsp` подключается, 15 таблиц
- [ ] `embeddings` имеет ~5432 строк
- [ ] `curl http://localhost:6333/collections/dsp_symbols` показывает ~5432 points
- [ ] `ollama list` показывает `qwen3-8b-dsp`
- [ ] `ollama run qwen3-8b-dsp "..."` отвечает осмысленно
- [ ] `dsp-asst ping` работает
- [ ] `curl http://localhost:8765/health` зелёный
- [ ] systemd сервисы (postgresql, qdrant, ollama, dsp-asst) — `enabled` + `active`

---

## 🚨 Troubleshooting

### Проблема 1: pgvector не компилируется
```
Error: cannot find postgresql/server/...
```
**Fix:** не установлен `postgresql-server-dev-16`. Поставить:
```bash
sudo dpkg -i $OFFLINE/2_software/postgresql-server-dev-16_*.deb
```

### Проблема 2: torch не находит ROCm
```python
torch.cuda.is_available()  # False
```
**Fix:** torch установлен из CPU-канала, не ROCm. Переустановить:
```bash
pip uninstall torch torchvision torchaudio
pip install --no-index --find-links $OFFLINE/3_python_wheels/torch-rocm \
    torch torchvision torchaudio
```

### Проблема 3: HF модель не находится
```
OSError: Cannot find model in cache
```
**Fix:** структура HF cache битая. Использовать прямой путь в коде:
```python
model = BGEM3FlagModel('/mnt/ssd/offline-debian-pack/1_models/bge-m3', use_fp16=True)
# или скопировать модель в /home/alex/models/bge-m3 и указать путь оттуда
```

### Проблема 4: Qdrant не запускается (port 6333 занят)
```bash
lsof -i :6333  # узнать кто держит порт
# или поменять порт в конфиге Qdrant: ./qdrant --uri http://0.0.0.0:6334
```

### Проблема 5: dsp-asst CLI не найден
```bash
which dsp-asst
# nothing
```
**Fix:** не в venv или dsp-asst не установлен:
```bash
source /home/alex/finetune-env/.venv/bin/activate
pip install -e /home/alex/finetune-env --no-index --find-links $OFFLINE/3_python_wheels
```

### Проблема 6: Ollama не подключается к ROCm GPU
```bash
ollama logs
# CUDA error...
```
**Fix:** Ollama по умолчанию ищет CUDA. Для ROCm нужны env-переменные:
```bash
export HSA_OVERRIDE_GFX_VERSION=11.0.0   # для RX 9070 (gfx1201)
export ROCR_VISIBLE_DEVICES=0
ollama serve
```

### Проблема 7: Phase B обучение OOM
**Fix:** уменьшить batch_size, включить gradient checkpointing, или 4bit quantization:
```bash
# В скрипте train: --per_device_train_batch_size=1 --gradient_accumulation_steps=8 --bf16 --load_in_4bit
```

---

## 📝 Часто забываемые шаги

1. **`source .venv/bin/activate`** перед каждым `python`/`dsp-asst` командой
2. **`export HF_HUB_OFFLINE=1`** чтобы HF не пытался качать (нет интернета)
3. **`export DSP_ASST_PG_PASSWORD=1`** для всех скриптов БД
4. **systemctl enable** для автозапуска после reboot
5. **Размотировать SSD после копирования** (через `umount /mnt/ssd`) если SSD нужен для других целей

---

## 🎯 После успешной установки — Phase B inference compare

```bash
cd /home/alex/finetune-env
source .venv/bin/activate
export DSP_ASST_PG_PASSWORD=1

# B1 — 3-way inference compare (см. dataset_post_phase_b_plan_2026-05-10.md)
# Скрипт inference_compare.py — должен быть в finetune-env, проверить
ls inference_compare* run_compare_3way*
```

---

## 📞 Если что-то не получилось

**Заметить точную ошибку → записать в:** `MemoryBank/specs_Linux_Radion_9070/install_issues_2026-05-12.md`

Когда будешь обратно в зоне интернета — Кодо разберёт и поправит инструкцию для следующего раза.

---

*Created: 2026-05-10 поздняя ночь · Кодо main #1 · INSTALL для Debian + RX 9070 без интернета*
