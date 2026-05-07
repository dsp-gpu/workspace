# Setup инструкция: LLM + RAG + Continue/Cline на работе (2026-05-12)

> Цель: на Debian + Radeon 9070 поднять полный стек который сегодня (07.05) работает дома.
> Источник истины: эта инструкция + `MemoryBank/specs/LLM_and_RAG/_session_handoff_2026-05-07_evening.md`.

---

## Архитектура (что куда подключено)

```
Continue Agent / Cline (VSCode)  ←─ chat + autocomplete
        │
        │ MCP protocol (stdio)
        ▼
dsp-asst mcp (Python adapter)
        │
        │ HTTP :7821
        ▼
dsp-asst HTTP server (BGE-M3 + reranker)
        │
        │ SQL
        ▼
PostgreSQL :5432 (schema=rag_dsp, pgvector)
        +
Qdrant :6333 (vectors collection dsp_gpu_rag_v1)
        +
Ollama :11434 (LLM models: qwen3-8b-dsp, qwen25-coder-7b-dsp)
```

**Всё работает локально.** Continue/Cline дёргают Ollama для генерации + dsp-asst MCP для контекста из RAG.

---

## Шаг 0 — клонировать репо и MemoryBank на работу

```bash
# на работе — Debian
mkdir -p ~/work && cd ~/work
git clone git@github.com:dsp-gpu/workspace.git DSP-GPU
cd DSP-GPU
# подтянуть все sub-репо
for r in core spectrum stats signal_generators heterodyne linalg radar strategies DSP; do
    git clone git@github.com:dsp-gpu/$r.git $r
done
```

Прочитать первым:
- `MemoryBank/MASTER_INDEX.md`
- `MemoryBank/tasks/IN_PROGRESS.md`
- `MemoryBank/sessions/2026-05-07.md`
- `MemoryBank/specs/LLM_and_RAG/cheatsheet_qlora_train_metrics_2026-05-07.md`

---

## Шаг 1 — Postgres + Qdrant (Debian native, не WSL)

```bash
# Postgres 16 + pgvector
sudo apt install -y postgresql-16 postgresql-16-pgvector
sudo -u postgres createuser -s dsp_asst
sudo -u postgres psql -c "ALTER USER dsp_asst PASSWORD '1';"
sudo -u postgres createdb gpu_rag_dsp -O dsp_asst

# Qdrant native (без WSL)
wget https://github.com/qdrant/qdrant/releases/latest/download/qdrant-x86_64-unknown-linux-gnu.tar.gz
tar -xzf qdrant-*.tar.gz -C ~/qdrant
~/qdrant/qdrant --config-path ~/qdrant/config/config.yaml &
```

Проверка:
```bash
psql -U dsp_asst -h localhost -d gpu_rag_dsp -c "SELECT version();"
curl http://localhost:6333/healthz
```

## Шаг 2 — dsp-asst (Python venv)

```bash
cd ~/finetune-env  # перенести с win-машины ИЛИ git clone репо dsp_assistant
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e .

# Импорт схемы и данных из дамой машины (если есть pg_dump)
# либо ингест с нуля:
export DSP_ASST_PG_PASSWORD=1
dsp-asst --stage 2_work_local rag meta build --all
dsp-asst --stage 2_work_local rag blocks ingest --repo spectrum  # x9 для каждого репо
dsp-asst --stage 2_work_local rag cards build
dsp-asst --stage 2_work_local rag pipelines build --all
dsp-asst --stage 2_work_local rag python build
dsp-asst --stage 2_work_local rag python bindings
dsp-asst --stage 2_work_local rag usecases build --all
```

**Альтернатива — перенести готовую БД с домашней:**
```bash
# на ДОМАШНЕЙ машине (Win, WSL):
wsl -d Ubuntu -- pg_dump -U dsp_asst gpu_rag_dsp > ~/gpu_rag_dsp_dump.sql

# скопировать на работу:
scp ~/gpu_rag_dsp_dump.sql work:~/

# на РАБОТЕ:
psql -U dsp_asst -d gpu_rag_dsp < ~/gpu_rag_dsp_dump.sql
```

(вторая опция в 100× быстрее — все 2650+ doc_blocks + эмбеддинги уже готовы)

## Шаг 3 — Ollama + модели

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama serve &  # systemd-service ставится автоматом

# базовые модели
ollama pull qwen3:8b
ollama pull qwen2.5-coder:1.5b
ollama pull nomic-embed-text

# наши обученные — их нужно перенести как GGUF + Modelfile
# (после полного train на 9070):
#   ollama create qwen3-8b-dsp -f Modelfile_qwen3-8b-dsp_v4
#   ollama create qwen25-coder-7b-dsp -f Modelfile_qwen25-coder-7b-dsp
```

Modelfile берём с домашней (с правильным TEMPLATE `### Задача / ### Код / ### Ответ`).

## Шаг 4 — llama.cpp (для GGUF + quantize)

```bash
git clone https://github.com/ggerganov/llama.cpp.git ~/tools/llama.cpp
cd ~/tools/llama.cpp
cmake -B build -DGGML_HIPBLAS=ON  # ROCm support для 9070
cmake --build build --config Release -j 8

export LLAMA_CPP_DIR=~/tools/llama.cpp
echo 'export LLAMA_CPP_DIR=~/tools/llama.cpp' >> ~/.bashrc
```

## Шаг 5 — Continue в VSCode

Скопировать `~/.continue/config.yaml` с домашней машины **с поправками для Linux**:

```yaml
name: Local Config (Debian/work)
version: 1.0.0
schema: v1

models:
  - name: Qwen3 14B DSP (Chat)
    provider: ollama
    model: qwen3-14b-dsp  # после train Phase B на 9070
    apiBase: http://localhost:11434
    roles: [chat, edit, apply]
    defaultCompletionOptions:
      contextLength: 32768
      maxTokens: 4096
      temperature: 0.2

  - name: Qwen2.5-Coder DSP (Autocomplete)
    provider: ollama
    model: qwen25-coder-7b-dsp
    apiBase: http://localhost:11434
    roles: [autocomplete]

  - name: Nomic Embed
    provider: ollama
    model: nomic-embed-text
    apiBase: http://localhost:11434
    roles: [embed]

context:
  - provider: code
  - provider: codebase
  - provider: file
  - provider: folder
  - provider: terminal

mcpServers:
  - name: context7
    command: node
    args:
      - /home/alex/mcp-servers/node_modules/@upstash/context7-mcp/dist/index.js

  - name: sequential-thinking
    command: node
    args:
      - /home/alex/mcp-servers/node_modules/@modelcontextprotocol/server-sequential-thinking/dist/index.js

  - name: dsp-asst
    command: /home/alex/finetune-env/.venv/bin/dsp-asst
    args: [mcp]
    env:
      DSP_ASST_PG_PASSWORD: "1"
    cwd: /home/alex/finetune-env

allowAnonymousTelemetry: false
```

**Главное:**
- путь к dsp-asst — Linux (`.venv/bin/`, не `.venv/Scripts/`)
- env с `DSP_ASST_PG_PASSWORD: "1"` обязателен
- agent mode в Continue chat — **обязательно**

## Шаг 6 — Cline в VSCode (для 14B+ моделей)

VSCode → Cline icon → Settings:
- **API Provider:** Ollama
- **Base URL:** `http://localhost:11434` (без `/v1`)
- **Model ID:** `qwen3-14b-dsp` (или `qwen25-coder-14b-dsp`)
- Custom Instructions:
  ```
  You are working on Linux (Debian) with bash.
  Use '&&' for command chaining (we are NOT on PowerShell).
  Project root: ~/work/DSP-GPU
  Always check existing code via dsp-asst MCP before generating.
  ```

Cline на 14B+ должен работать значительно лучше чем на 8B (это сам Cline предупреждает про слабые модели).

## Шаг 7 — Train Phase B (full quality на 9070)

См. `MemoryBank/tasks/TASK_FINETUNE_phase_B_2026-05-12.md`. Главные параметры:
- `--max-seq-len 1024 --epochs 3 --lora-r 16 --lora-alpha 32`
- `--bf16` (9070 поддерживает!)
- eval_split + load_best_model_at_end (доработать train_simple.py)

Параллельно — Qwen2.5-Coder с теми же параметрами для сравнения.

---

## Чеклист готовности (быстрая проверка после setup)

```bash
# 1. Postgres
psql -U dsp_asst -h localhost -d gpu_rag_dsp -c "SELECT count(*) FROM rag_dsp.doc_blocks;"
# должно быть >2600

# 2. Qdrant (если используем)
curl http://localhost:6333/collections/dsp_gpu_rag_v1 | jq .result.vectors_count

# 3. dsp-asst HTTP
dsp-asst ping

# 4. Ollama
ollama list  # должны быть qwen3-8b-dsp, qwen25-coder-7b-dsp, nomic-embed-text

# 5. Continue в VSCode — Reload Window → Agent mode → @dsp-asst find ScopedHipEvent
# должен вернуть: core/include/core/services/scoped_hip_event.hpp:53

# 6. llama.cpp
ls ~/tools/llama.cpp/build/bin/llama-quantize
```

Если всё ✅ — рабочая среда DSP-GPU AI готова. Можно train Phase B.

---

## Перенос с домашней машины (что копировать)

| Файл/папка дома | Путь на работе | Размер |
|----------------|----------------|--------|
| `C:\finetune-env\dataset_enriched.jsonl` | `~/finetune-env/dataset_enriched.jsonl` | 5 MB |
| `C:\finetune-env\qwen3-8b\` | `~/finetune-env/qwen3-8b/` (или скачать заново) | 16 GB |
| `C:\finetune-env\qwen2.5-coder-7b\` | `~/finetune-env/qwen2.5-coder-7b/` | 16 GB |
| `C:\finetune-env\output\full-r4-2026-05-07\` | для сравнения с Phase B | 200 MB |
| `C:\finetune-env\train_simple.py` | `~/finetune-env/train_simple.py` | 6 KB |
| `C:\finetune-env\train_qwen25_coder.py` | `~/finetune-env/` | 6 KB |
| `C:\finetune-env\inference_test.py` | `~/finetune-env/` | 4 KB |
| `C:\finetune-env\post_training.py` | `~/finetune-env/` | 8 KB |
| `~\.continue\config.yaml` | `~/.continue/config.yaml` (с правкой путей) | 1 KB |
| `pg_dump gpu_rag_dsp` | `~/gpu_rag_dsp_dump.sql` | ~50 MB |

Самый быстрый путь — `rsync` всю `C:\finetune-env\` (исключая `.venv`, `output/checkpoint-*`, `__pycache__`).

---

*Последнее обновление: 2026-05-07 вечер. Кодо.*
