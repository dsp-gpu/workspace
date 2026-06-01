# 🛠 03 — Развёртывание с нуля (Bringup Runbook)

> **Цель**: поднять весь RAG+LLM-стек DSP-GPU на чистой машине.
> **Платформа**: Debian 13 trixie / Ubuntu 24 + ROCm 7.2 + AMD RX 9070 (gfx1201, 16 ГБ) + Python 3.12.
> **ETA**: ~1–1.5 ч при наличии offline-pack.
> **Принцип**: system-сервисы (PG/Qdrant/Ollama) + user-сервисы (embed/dsp-asst) + linger.

> ⚠️ Перед стартом убедись: GPU виден (`rocm-smi`), для gfx1201 `HSA_OVERRIDE_GFX_VERSION` **не нужен**.

---

## Карта целевого состояния

| Сервис | Порт | Тип unit | Назначение |
|--------|-----:|----------|------------|
| postgresql@16-main | 5432 | system | БД `gpu_rag_dsp`, схема `rag_dsp` + `llm_bench` |
| qdrant | 6333/6334 | system | коллекция `dsp_gpu_rag_v1` (1024-dim) |
| ollama | 11434 | system | вспом. (quick-test, nomic-embed) |
| embed.service | 8765 | user | BGE-M3 ONNX (CPU) для Continue `@codebase` |
| dsp-asst.service | 7821 | user | RAG HTTP API (BGE-M3+BM25+reranker, GPU) |
| llama-server | 8080 | system (template) | production LLM-инференс |

---

## Шаг 1 — ROCm 7.2 + hipcc

Подключить repo `repo.radeon.com/rocm/apt/7.2/noble`, затем:
```bash
sudo apt install hipcc hip-dev rocm-llvm hipfft-dev rocblas-dev \
  rocsolver-dev rocprim-dev rocrand-dev hipblas-dev rocm-opencl-runtime
```
Проверка: `hipcc --version` (ROCm 7.2.x), `rocm-smi` (видит RX 9070).

> ⚠️ **Ubuntu 24 gotcha**: конфликт `libamdhip64-dev 5.7.1` (noble) vs `hip-dev 7.2` (radeon) — удалить старый.
> ⚠️ **GLIBC**: Debian 13 (2.41) ≠ Ubuntu 24 (2.39) — бинари (llama-server) **не переносимы**, собирать на целевой машине.

---

## Шаг 2 — PostgreSQL 16 + pgvector

```bash
sudo apt install postgresql-16 postgresql-16-pgvector
```
Применить SQL **по порядку** (файлы в `MemoryBank/specs/LLM_and_RAG/configs/`):
```bash
cd MemoryBank/specs/LLM_and_RAG/configs
sudo -u postgres psql -v pg_password="'1'" -f postgres_init.sql       # user dsp_asst, БД gpu_rag_dsp, схема rag_dsp, базовые таблицы
psql -h localhost -U dsp_asst -d gpu_rag_dsp -f postgres_init_pgvector.sql
psql -h localhost -U dsp_asst -d gpu_rag_dsp -f postgres_init_rag.sql        # doc_blocks/use_cases/pipelines/ai_stubs
psql -h localhost -U dsp_asst -d gpu_rag_dsp -f postgres_init_pybind_extras.sql
psql -h localhost -U dsp_asst -d gpu_rag_dsp -f postgres_migration_2026-05-08.sql
```
**Auth**: peer для unix-socket, password для TCP → подключаться **всегда** `-h localhost` (TCP), пароль `1` (env `DSP_ASST_PG_PASSWORD`).

> ⚠️ postgres-user **не читает** `/home/alex/` → SQL-файлы копировать в `/tmp/` или через `sudo -u postgres`.

Ключевые таблицы схемы `rag_dsp`: `files · symbols · deps · includes · enum_values · pybind_bindings · test_params · doc_blocks · use_cases · pipelines · ai_stubs · cmake_targets · embeddings · rag_logs`. Расширения: `vector`, `pg_trgm`, `btree_gin`. Отдельная схема `llm_bench` (бенчмарк моделей, rule 17).

---

## Шаг 3 — Qdrant

```bash
# нативный бинарь (НЕ docker)
sudo install qdrant /opt/qdrant/qdrant
mkdir -p /home/alex/qdrant_storage
# создать коллекцию:
python MemoryBank/specs/LLM_and_RAG/configs/qdrant_create_rag_collection.py
```
Коллекция `dsp_gpu_rag_v1`: `vector_size=1024` (BGE-M3), `distance=Cosine`, HNSW `m=16, ef_construct=200`. Payload: `{target_table, target_id, repo}`, point_id = UUID v5. Payload-индексы KEYWORD: `target_table`, `repo`.

> ⚠️ **Расхождение имён (источник истины = скрипт)**: `stack.json` для Stage 2 указывает коллекцию `dsp_gpu_code_v1` (+ ранний план: `public_api`/`internal`), но **реально создаваемая и читаемая** коллекция — `dsp_gpu_rag_v1` (константа `COLLECTION_NAME` в `qdrant_create_rag_collection.py`). Используй `dsp_gpu_rag_v1`. `stack.json` в этой части устарел.

---

## Шаг 4 — Ollama (вспомогательный)

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull nomic-embed-text          # для embeddings на сервере без BGE-M3
# опц. quick-test модели:
ollama pull qwen2.5-coder:7b
```

---

## Шаг 5 — finetune-env (Python пакет dsp_assistant + .venv)

```bash
cd /home/alex/finetune-env
uv python install 3.12 && uv venv && source .venv/bin/activate
uv pip install -e .
```
**Критично**: torch **2.11.0+rocm7.2** (НЕ CUDA-wheel). Offline-wheels: `offline-debian-pack/3_python_wheels/torch-rocm/`.

Бинарь: `/home/alex/finetune-env/.venv/bin/dsp-asst`.

---

## Шаг 6 — HF cache (offline embeddings)

Модели: `offline-debian-pack/1_models/{bge-m3, bge-reranker-v2-m3, nomic-embed-text-v1.5}`.
```bash
# симлинки-stubs в ~/.cache/huggingface/hub/ (не дублировать 12 ГБ)
export TRANSFORMERS_OFFLINE=1 HF_HUB_OFFLINE=1
# при поломке stubs:
export DSP_ASST_BGE_M3_PATH=/home/alex/offline-debian-pack/1_models/bge-m3
```
- **Embeddings**: BGE-M3 (`BAAI/bge-m3`), dim 1024, max 8192, multilingual.
- **Reranker**: `BAAI/bge-reranker-v2-m3` (top 50 → 5).

---

## Шаг 7 — systemd user-units + linger

Юниты в `~/.config/systemd/user/`:
- `embed.service` → `~/.continue/.venv/bin/python ~/.continue/embed_server.py` (порт 8765, Restart=on-failure)
- `dsp-asst.service` → `/home/alex/finetune-env/.venv/bin/dsp-asst serve --port 7821` (Restart=on-failure, RestartSec=10)

Минимальный шаблон `~/.config/systemd/user/dsp-asst.service` (embed.service аналогично):
```ini
[Unit]
Description=DSP-GPU RAG assistant (HTTP API + BGE-M3 + reranker)

[Service]
Type=simple
Environment=DSP_ASST_PG_PASSWORD=1
Environment=DSP_GPU_ROOT=/home/alex/DSP-GPU
Environment=TRANSFORMERS_OFFLINE=1
Environment=HF_HUB_OFFLINE=1
ExecStart=/home/alex/finetune-env/.venv/bin/dsp-asst serve --port 7821
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
```
> Готовые тела units стоит держать в `DSP-GPU/scripts/debian_deploy/` (backup, помечены «нельзя терять»).

```bash
systemctl --user enable --now embed.service dsp-asst.service
sudo loginctl enable-linger alex          # ОБЯЗАТЕЛЬНО — user-units стартуют при boot без логина
loginctl show-user alex | grep Linger     # → Linger=yes
```
> system-units (`postgresql qdrant ollama`) — `sudo systemctl enable --now ...`.
> user-units не видят system-targets → нет `After=postgresql`; если PG не успел, dsp-asst падает и поднимается через RestartSec=10 (by design).

---

## Шаг 8 — Ingestion (наполнение RAG) — на каждый из 9 репо

build_order: `core → spectrum → stats → signal_generators → heterodyne → linalg → radar → strategies → DSP`.

```bash
export DSP_ASST_PG_PASSWORD=1 DSP_GPU_ROOT=/home/alex/DSP-GPU
dsp-asst --stage 1_home index build        # tree-sitter → symbols/files/includes/enums (~2 мин)
dsp-asst --stage 1_home index embeddings    # BGE-M3 на GPU → vector(1024) (~3 мин)
dsp-asst --stage 1_home index extras        # pybind/cmake
./re_ingest_all.sh                          # doc_blocks/use_cases/pipelines (6 фаз, ~5 мин)
python ingest_test_tags.py --all            # @test* doxygen → test_params
```

> ⚠️ **Про флаг `--stage 1_home`**: на Debian (по смыслу «work» = Stage 2) он используется **исторически** (Stage 1 = home Windows pgvector). Сверь актуальные стадии в `stack.json` (`stages.*`); функционально на нашей машине работает `1_home`. Если CLI изменится — подставить актуальную стадию.

> 🔴 **Критичный для качества шаг**: проверь наполнение `test_params` после ingest:
> ```bash
> psql -h localhost -U dsp_asst -d gpu_rag_dsp -c "SELECT count(*) FROM rag_dsp.test_params;"
> ```
> Если мало/0 — LLM генерит тесты «вслепую» (`fft_size=100` вместо `power_of_2`). Заполнение
> (LEVEL 0 авто confidence=0.5 через `ingest_test_tags.py` → ручная верификация ~20 ключевых
> классов: FFTProcessorROCm/ScopedHipEvent/ProfilingFacade/CaponProcessor до LEVEL 2 = 1.0) —
> **приоритет P0**. Зависит от наличия `@test*` doxygen-тегов в коде. Детали → `04_RAG_Pipeline.md`.

---

## Шаг 9 — Регистрация MCP в Claude Code

**Не править JSON руками, не коммитить в git** — регистрировать локально на каждой машине:
```bash
claude mcp add dsp-asst -s user \
  -e DSP_ASST_SERVER_URL=http://127.0.0.1:7821 \
  -e DSP_ASST_PG_PASSWORD=1 \
  -- /home/alex/finetune-env/.venv/bin/dsp-asst --stage 1_home mcp
claude mcp list      # → dsp-asst ✓ Connected (stdio)
```
Перезапустить Claude Code. Реестр → `~/.claude.json` (user-scope, не в git).

---

## Шаг 10 — Production LLM (llama-server)

Собрать llama.cpp с ROCm **на целевой машине** (GLIBC!), зафиксировать commit (апгрейд может сломать старые GGUF). Модели GGUF на диске, deploy `127.0.0.1:8080`.

Переключение моделей (16 ГБ → одна за раз):
```bash
sudo llm-switch mtp      # qwen3.6-mtp Q4_K_M — review/docs (top quality, ×6-17 быстрее Ollama)
sudo llm-switch 30b      # qwen3-coder-30b-a3b — fast codegen
sudo llm-switch 14b      # qwen-coder-14b-dsp — autocomplete (47 tok/s, full GPU)
sudo llm-switch status|stop
```
Env-файлы: `/etc/default/llama-server-{14b,30b,mtp}`. Детали MTP-флагов → `06_PRODUCTION_Inference.md`.

---

## Шаг 11 — Smoke-проверка всего стека

```bash
# сервисы живы:
systemctl is-active postgresql qdrant ollama
systemctl --user is-active embed.service dsp-asst.service
# порты:
ss -tlnp | grep -E ':5432|:6333|:8765|:7821|:11434|:8080'
# RAG API:
curl -s http://127.0.0.1:7821/health
curl -s http://localhost:6333/healthz
# MCP:
claude mcp get dsp-asst        # ✓ Connected
# LLM:
curl -s http://127.0.0.1:8080/v1/models
```

---

## Обязательные env-переменные (сводка)

```bash
export DSP_ASST_PG_PASSWORD=1
export DSP_GPU_ROOT=/home/alex/DSP-GPU
export DSP_GPU_SPECS_DIR=/home/alex/DSP-GPU/MemoryBank/specs/LLM_and_RAG
export DSP_ASST_SERVER_URL=http://127.0.0.1:7821
export TRANSFORMERS_OFFLINE=1 HF_HUB_OFFLINE=1
# опц.: export DSP_ASST_BGE_M3_PATH=/home/alex/offline-debian-pack/1_models/bge-m3
```

---

## Порядок старта при boot (что происходит само)

```
T+02s  postgresql, qdrant, ollama (system)
T+05s  systemd-user (alex) поднимается (linger)
T+07s  embed.service (8765)
T+10s  dsp-asst.service (7821) — грузит BGE-M3+reranker в VRAM (~7-15s warmup)
T+15s  стек готов
```

---

## Что НЕ автостартует (по событию)

- `re_ingest_all.sh`, `dsp-asst index build/embeddings` — ручной ре-индекс при изменении кода
- `llm-switch` — переключение модели вручную
- weekly cron (вторник 09:00) `dsp-asst manifest refresh` — обновление AI-секций `_RAG.md`

Эксплуатация / troubleshooting → [`07_OPERATIONS_Runbook.md`](07_OPERATIONS_Runbook.md).

---

*Maintained by: Кодо · 2026-06-01*
