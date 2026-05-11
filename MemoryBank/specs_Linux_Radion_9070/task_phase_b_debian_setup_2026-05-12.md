# TASK: Phase B Debian Setup — 12.05.26

> **Цель:** поднять полный LLM/RAG стек на работе (Debian + RX 9070), запустить Phase B, валидировать.
> **Effort:** 5-7 ч (с обучением) / 2-3 ч (если checkpoint готов)
> **Зависимости:** SSD с двоичными моделями, git pushed (10 репо + finetune-env)
> **Связано:** `migration_plan_2026-05-10.md`, `ssd_transfer_list_2026-05-10.md`, `inventory_2026-05-10.md`

---

## ✅ Чек-лист перед выездом (10.05 вечер дома)

- [ ] Все 10 репо DSP-GPU pushed в git (`git status -sb` чисто)
- [ ] `finetune-env` push в git (включая последние collect_*.py / dataset_v4*.jsonl / dsp_assistant/)
- [ ] SSD содержит:
  - [ ] `qwen3-8b/` (16 GB)
  - [ ] BGE-M3 (4.6 GB)
  - [ ] BGE-reranker-v2-m3 (2.2 GB)
  - [ ] (опц) Phase B checkpoint если уже обучали
  - [ ] (опц) Qwen3-14B / Qwen2.5-Coder-7B если планируете
- [ ] Резервная копия Modelfile.template + run_full_qwen3_r16_9070.sh

---

## 🚀 Шаги на работе (12.05)

### Шаг 1 — Pre-flight check (5 мин)
```bash
# Verify all installed
psql --version && docker --version && python3 --version && ollama --version && hipcc --version

# Verify DSP-GPU 10 репо есть
ls /home/alex/DSP-GPU/
# Expected: core spectrum stats signal_generators heterodyne linalg radar strategies DSP MemoryBank

# Verify GPU
rocm-smi
hipcc --offload-arch=gfx1201 -E - </dev/null && echo "RX 9070 ready"

# Verify git revisions всех 11 репо (DSP-GPU + finetune-env)
for r in core spectrum stats signal_generators heterodyne linalg radar strategies DSP; do
  echo -n "$r: "; git -C /home/alex/DSP-GPU/$r log -1 --format="%h %s"
done
echo -n "workspace: "; git -C /home/alex/DSP-GPU log -1 --format="%h %s"
echo -n "finetune-env: "; git -C /home/alex/finetune-env log -1 --format="%h %s"
```

### Шаг 2 — Создать БД (5 мин)
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
psql -h localhost -U dsp_asst -d gpu_rag_dsp -c "SELECT version();"
```

### Шаг 3 — Запустить Qdrant (5 мин)
```bash
docker run -d --name qdrant --restart=always \
  -p 6333:6333 -p 6334:6334 \
  -v /home/alex/qdrant_storage:/qdrant/storage \
  qdrant/qdrant

# Wait + verify
sleep 3
curl http://localhost:6333/healthz   # healthz check passed
```

### Шаг 4 — Скопировать с SSD (10 мин)
```bash
sudo mount /dev/sdX1 /mnt/ssd

mkdir -p /home/alex/finetune-env
cp -r /mnt/ssd/dsp-gpu-migration/qwen3-8b /home/alex/finetune-env/

mkdir -p ~/.cache/huggingface/hub
cp -r /mnt/ssd/dsp-gpu-migration/hf-cache/* ~/.cache/huggingface/hub/

# Verify
du -sh /home/alex/finetune-env/qwen3-8b           # ~16G
du -sh ~/.cache/huggingface/hub/models--BAAI--*   # ~6.8G total
```

### Шаг 5 — Git clone + venv (15 мин)
```bash
cd /home/alex
git clone <github>/finetune-env || (cd finetune-env && git pull)
cd finetune-env

python3 -m venv .venv      # 3.11+ per pyproject; 3.12 если установлен
source .venv/bin/activate

pip install --upgrade pip
pip install -e .                       # dsp-asst пакет + tree-sitter + qdrant + FlagEmbedding + ...

# Доп для collect/train
pip install psycopg[binary] sklearn sentence-transformers transformers peft accelerate bitsandbytes datasets pyyaml

# Smoke check
dsp-asst --help
dsp-asst ping       # должен подключиться к PG (пока пусто)
```

### Шаг 6 — Применить миграции схемы (2 мин)
```bash
cd /home/alex/finetune-env
export DSP_ASST_PG_PASSWORD=1

psql -h localhost -U dsp_asst -d gpu_rag_dsp \
  -f dsp_assistant/migrations/2026-05-08_rag_tables_tsvector.sql
psql -h localhost -U dsp_asst -d gpu_rag_dsp \
  -f dsp_assistant/migrations/2026-05-08_test_params_extend.sql

# Verify schema
psql -h localhost -U dsp_asst -d gpu_rag_dsp -c "\dt rag_dsp.*"
# Expected: 15 таблиц (files, symbols, doc_blocks, embeddings, ...)
```

### Шаг 7 — Indexer наполнение PG (30-60 мин)

**Точное имя команды узнать через:**
```bash
dsp-asst --help            # увидеть top-level subcommands
dsp-asst index --help      # если есть `index`
# или прочитать dsp_assistant/cli/main.py
```

**Запуск indexer'а** (вариант — узнать на месте):
```bash
export DSP_GPU_ROOT=/home/alex/DSP-GPU
export DSP_ASST_PG_PASSWORD=1

# Полный индекс
dsp-asst index --root /home/alex/DSP-GPU --all
# или fallback:
python -m dsp_assistant.indexer.build --root /home/alex/DSP-GPU
```

**Дополнительные шаги** (наши скрипты вне dsp-asst):
```bash
# test_params LEVEL 1 (через @test* парсер)
python parse_test_tags.py
python ingest_test_tags.py

# _RAG.md манифесты — должны уже быть в репо после git clone, если нет:
python generate_rag_manifest.py

# arch C2/C3/C4 файлы
python generate_arch_files.py
```

**Verify:**
```bash
psql -h localhost -U dsp_asst -d gpu_rag_dsp -c "
SELECT 'files' AS tbl, count(*) FROM rag_dsp.files
UNION ALL SELECT 'symbols', count(*) FROM rag_dsp.symbols
UNION ALL SELECT 'doc_blocks', count(*) FROM rag_dsp.doc_blocks
UNION ALL SELECT 'test_params', count(*) FROM rag_dsp.test_params
UNION ALL SELECT 'embeddings', count(*) FROM rag_dsp.embeddings;
"
```

### Шаг 8 — Создать `migrate_pgvector_to_qdrant.py` + запустить (15 мин)

См. шаблон в `migration_plan_2026-05-10.md` Фаза 5 (~150 строк). Создать на месте, запустить.

```bash
cd /home/alex/finetune-env
source .venv/bin/activate
python migrate_pgvector_to_qdrant.py

# Verify Qdrant collections
curl http://localhost:6333/collections
# Expected: dsp_symbols, dsp_doc_blocks, dsp_test_params
```

### Шаг 9 — LLM Phase B обучение (3-4 ч)

```bash
cd /home/alex/finetune-env
source .venv/bin/activate
chmod +x run_full_qwen3_r16_9070.sh

# Запуск с logged output
./run_full_qwen3_r16_9070.sh 2>&1 | tee phase_b_2026-05-12.log
```

**Параметры (из spec'a):**
- LoRA r=16
- bf16
- 3 epochs
- ~5777 пар train (dataset_v4)
- ~798 val

**ETA:** 3-4 ч на RX 9070.

### Шаг 10 — Validate via Ollama + B1 inference compare (30 мин)

```bash
# Создать модель в Ollama
ollama create qwen3-8b-dsp -f Modelfile.template

# Запустить ollama serve (если не запущен)
ollama serve &

# B1 — 3-way inference compare
python run_compare_3way.ps1   # либо аналог .sh
# Сравнивает baseline / smoke 2080 Ti / full 9070 на 6 вопросах
```

### Шаг 11 — `dsp-asst serve` MCP (5 мин)

```bash
# Терминал 0 (зарезервирован)
dsp-asst serve --host localhost --port 8765
```

Тест через Claude Code MCP-tools (если работа клиент = эта же машина):
- `dsp_health` → `vector_db: pgvector + qdrant`
- `dsp_find('FFTProcessor')` → найти класс
- `dsp_search('как профилировать ядро')` → семантический поиск

---

## ✅ DoD финал

- [ ] PG `gpu_rag_dsp` создан, 15 таблиц наполнены (~5432 embeddings)
- [ ] Qdrant запущен, 3 коллекции с vectors
- [ ] `dsp-asst ping` работает
- [ ] Phase B обучен, checkpoint в `finetune-env/phase_b_2026-05-12/`
- [ ] Ollama model `qwen3-8b-dsp` отвечает
- [ ] B1 inference compare выполнен, отчёт в `MemoryBank/specs/LLM_and_RAG/inference_compare_2026-05-12.md`
- [ ] `dsp-asst serve` работает, MCP-tools отвечают

---

## 🚨 Если что-то пойдёт не так

| Проблема | Решение |
|----------|---------|
| `dsp-asst index` не найден | Прочитать `dsp_assistant/cli/main.py` — посмотреть зарегистрированные subcommands |
| BGE-M3 embeddings занимает 30+ мин | Проверить что использует GPU (HIP). Если CPU — установить torch с ROCm support |
| Qdrant docker fail | Fallback: скачать binary с github releases, запустить нативно |
| Phase B падает с OOM | Уменьшить batch_size в run_full_qwen3_r16_9070.sh, или offload через `--load_in_4bit` |
| Скрипты используют Windows пути `C:\` | sed-патч: `sed -i 's|C:\\\\finetune-env|/home/alex/finetune-env|g' *.py` |

---

## 📞 Контакт-points для уточнений

- **Q5 финал**: парсеры **в `dsp_assistant/indexer/`** (внутри finetune-env), tree-sitter (не libclang). Не в `DSP/` репо. Не в `MemoryBank/`.
- **Q6 финал**: для Phase B **Qwen3-8B** хватит. Qwen3-14B/32B + Qwen2.5-coder — для inference после успеха 8B (опциональные модели через SSD когда понадобятся).
- **Q7 финал**: `dsp-asst` собирается через `pip install -e .` из `pyproject.toml` в `finetune-env`. Никаких отдельных репо нет.

---

*TASK создан: 2026-05-10 поздняя ночь · к исполнению 12.05 на работе (Debian + RX 9070)*
