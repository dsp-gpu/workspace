# 🛠 DSP-GPU RAG Stack — Cheatsheet (Debian + RX 9070)

> **Создано:** 2026-05-13 после полного bringup RAG на работе.
> **Платформа:** Debian 13 trixie + ROCm 7.2 + AMD Radeon RX 9070 (gfx1201) + Python 3.12.
> **Принцип:** все 5 сервисов автозапускаются при boot, перезапускаются при сбое.

---

## 🔧 Архитектура (5 сервисов, `linger=yes`)

| Сервис | Порт | Тип | Restart | Назначение |
|---|---:|---|---|---|
| `postgresql.service` | 5432 | system | no | БД `gpu_rag_dsp`/schema `rag_dsp` (15 таблиц, pgvector) |
| `qdrant.service` | 6333 | system | always | Коллекции `dsp_gpu_rag_v1`, `dsp_gpu_code_v1` (опц.) |
| `ollama.service` | 11434 | system | always | LLM (`qwen3.6:35b`, `qwen2.5-coder:7b`, …) |
| `embed.service` | 8765 | user | on-failure | bge-m3 ONNX для Continue VSCode |
| **`dsp-asst.service`** | **7821** | user | on-failure | **RAG HTTP API (BGE-M3+BM25+rerank на 9070)** |

---

## 🚀 Управление сервисами

```bash
# Статус всех 5 разом
systemctl is-active postgresql.service ollama.service qdrant.service
systemctl --user is-active embed.service dsp-asst.service

# Подробный статус
systemctl status postgresql.service
systemctl --user status dsp-asst.service

# Перезапуск (после обновления кода в /home/alex/finetune-env/dsp_assistant/)
systemctl --user restart dsp-asst.service
systemctl --user restart embed.service

# Live логи
journalctl --user -u dsp-asst.service -f
journalctl --user -u embed.service -f
journalctl -u qdrant.service -f
journalctl -u postgresql.service -f --since "5 min ago"

# Остановить / запустить
systemctl --user stop dsp-asst.service
systemctl --user start dsp-asst.service

# Отключить autostart (НЕ ломая текущий запуск)
systemctl --user disable dsp-asst.service     # не стартует при boot
systemctl --user disable --now dsp-asst.service  # + остановить сейчас

# Boot-time start без логина — уже включён:
loginctl show-user alex | grep Linger   # должно: Linger=yes
sudo loginctl enable-linger alex        # если выключилось
```

---

## 🔍 Использование RAG (CLI и curl)

### CLI (`dsp-asst`)
```bash
cd /home/alex/finetune-env && source .venv/bin/activate
export DSP_ASST_PG_PASSWORD=1

# Точный поиск по имени класса/метода
dsp-asst --stage 1_home find FFTProcessor
dsp-asst --stage 1_home find HeterodyneROCm --limit 30

# Семантический поиск (BGE-M3 dense + BM25 sparse + reranker)
dsp-asst --stage 1_home query "как реализован Capon на ROCm"
dsp-asst --stage 1_home query "оконные функции FFT" --top-k 10

# Только dense / только sparse
dsp-asst --stage 1_home query "профилирование GPU ядра" --dense-only
dsp-asst --stage 1_home query "профилирование GPU ядра" --sparse-only

# Без reranker (быстрее)
dsp-asst --stage 1_home query "FFT batch" --no-rerank

# Health-check / ping (PG)
dsp-asst --stage 1_home ping

# LLM health (Ollama)
dsp-asst --stage 1_home llm-health
```

### HTTP API (`curl`)
```bash
curl -s http://127.0.0.1:7821/health | python3 -m json.tool

curl -s -X POST http://127.0.0.1:7821/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"FFT обратное преобразование","top_k":5}' | python3 -m json.tool

curl -s 'http://127.0.0.1:7821/find?name=FFTProcessor&limit=5' | python3 -m json.tool
```

---

## 🔁 Re-ingest (когда обновили DSP-GPU код)

```bash
cd /home/alex/finetune-env && source .venv/bin/activate
export DSP_ASST_PG_PASSWORD=1
export DSP_GPU_ROOT=/home/alex/DSP-GPU

# 1. Symbols/files/includes (tree-sitter, ~2 мин)
dsp-asst --stage 1_home index build

# 2. Embeddings (BGE-M3 на 9070 GPU, ~3 мин)
dsp-asst --stage 1_home index embeddings

# 3. Extras: pybind/cmake/enums (быстро)
dsp-asst --stage 1_home index extras

# 4. Doc blocks / use_cases / pipelines (6 фаз, ~5 мин)
./re_ingest_all.sh
# или только meta (CLAUDE.md/rules):
./re_ingest_all.sh --only-meta

# 5. Перезапустить HTTP-сервер чтобы он подцепил свежие embeddings
systemctl --user restart dsp-asst.service
sleep 8 && curl -s http://127.0.0.1:7821/health
```

---

## 📊 БД PostgreSQL

```bash
# Подключение
PGPASSWORD=1 psql -h localhost -U dsp_asst -d gpu_rag_dsp

# Подсчёт строк в RAG-таблицах
PGPASSWORD=1 psql -h localhost -U dsp_asst -d gpu_rag_dsp -c "
SELECT table_name, rows FROM (VALUES
  ('symbols', (SELECT count(*) FROM rag_dsp.symbols)),
  ('embeddings', (SELECT count(*) FROM rag_dsp.embeddings)),
  ('doc_blocks', (SELECT count(*) FROM rag_dsp.doc_blocks)),
  ('test_params', (SELECT count(*) FROM rag_dsp.test_params)),
  ('use_cases', (SELECT count(*) FROM rag_dsp.use_cases)),
  ('pybind_bindings', (SELECT count(*) FROM rag_dsp.pybind_bindings))
) AS t(table_name, rows) ORDER BY rows DESC;
"

# Backup БД (если нужен экспорт)
PGPASSWORD=1 pg_dump -h localhost -U dsp_asst gpu_rag_dsp \
  > /home/alex/gpu_rag_dsp_backup_$(date +%Y%m%d).sql

# Restore из бекапа
PGPASSWORD=1 psql -h localhost -U dsp_asst -d gpu_rag_dsp \
  < /home/alex/gpu_rag_dsp_backup_YYYYMMDD.sql
```

---

## 🔍 Qdrant

```bash
# Список коллекций
curl -s http://localhost:6333/collections | python3 -m json.tool

# Инфо по коллекции
curl -s http://localhost:6333/collections/dsp_gpu_rag_v1 | python3 -m json.tool

# Поиск (vector search)
curl -s -X POST http://localhost:6333/collections/dsp_gpu_rag_v1/points/search \
  -H 'Content-Type: application/json' \
  -d '{"vector":[...1024 floats...],"limit":5,"with_payload":true}'
```

---

## 🎮 GPU / ROCm

```bash
# Статус GPU
rocm-smi
rocm-smi --showuse --showmemuse --showpower --showperflevel
watch -n 1 rocm-smi --showuse

# Принудить high-performance (если в low-power)
sudo rocm-smi --setperflevel high

# Сброс
sudo rocm-smi --resetperflevel
```

### torch / FlagEmbedding diagnostics
```bash
cd /home/alex/finetune-env && source .venv/bin/activate
python << 'EOF'
import torch
print(f"torch     = {torch.__version__}")
print(f"hip       = {torch.version.hip}")
print(f"cuda_avail= {torch.cuda.is_available()}")
print(f"devices   = {torch.cuda.device_count()}")
if torch.cuda.is_available():
    print(f"device 0  = {torch.cuda.get_device_name(0)}")
EOF
```

---

## 🤖 MCP в Claude Code

> ⚠️ **Важно:** MCP-сервера в Claude Code хранятся **НЕ** в `.claude/settings.json`,
> а в отдельных файлах с **машинно-зависимыми путями**:
> - `~/.claude.json` — **user-scope** (доступно во всех проектах, не в git)
> - `<project>/.mcp.json` — **project-scope** (в `.gitignore` DSP-GPU!)
>
> Регистрация через CLI `claude mcp add ...`, не правкой JSON руками.

### Текущая регистрация (проверка)

```bash
claude mcp list
# должно показать: dsp-asst: /home/alex/finetune-env/.venv/bin/dsp-asst ... ✓ Connected

claude mcp get dsp-asst
# Scope: User config (available in all your projects)
# Status: ✓ Connected
# Type: stdio
# Command: /home/alex/finetune-env/.venv/bin/dsp-asst
# Args: --stage 1_home mcp
# Environment: DSP_ASST_SERVER_URL=..., DSP_ASST_PG_PASSWORD=...
```

### Регистрация на **новой машине** (после `git clone DSP-GPU`)

`.mcp.json` в `.gitignore` → новая машина получит **пустую** регистрацию.
Нужно зарегистрировать MCP **один раз** локально:

```bash
# Linux/Debian:
claude mcp add dsp-asst -s user \
  -e DSP_ASST_SERVER_URL=http://127.0.0.1:7821 \
  -e DSP_ASST_PG_PASSWORD=1 \
  -- /home/alex/finetune-env/.venv/bin/dsp-asst --stage 1_home mcp

# Windows (PowerShell):
claude mcp add dsp-asst -s user `
  -e DSP_ASST_SERVER_URL=http://127.0.0.1:7821 `
  -e DSP_ASST_PG_PASSWORD=1 `
  -- "C:\finetune-env\.venv\Scripts\dsp-asst.exe" --stage 1_home mcp

# macOS (zsh):
claude mcp add dsp-asst -s user \
  -e DSP_ASST_SERVER_URL=http://127.0.0.1:7821 \
  -e DSP_ASST_PG_PASSWORD=1 \
  -- ~/finetune-env/.venv/bin/dsp-asst --stage 1_home mcp
```

> 💡 **`-s user`** — глобально для всех проектов. Альтернативы:
> - `-s project` — только этот проект (запишется в `<project>/.mcp.json` —
>   у нас в .gitignore, не в git)
> - `-s local` — только текущая директория

После регистрации **перезапусти Claude Code** (выйди из текущей сессии и
запусти `claude` снова) — он подцепит новый MCP-сервер при старте.

### Удалить (если что-то пошло не так)

```bash
claude mcp remove dsp-asst -s user
# или -s project / -s local
```

### Доступные tools после успешной регистрации

После запуска `claude` в любом проекте появятся 5 MCP tools:
- `mcp__dsp-asst__dsp_search` — гибридный поиск (BGE-M3 dense + BM25 sparse + reranker)
- `mcp__dsp-asst__dsp_find` — точный по имени символа
- `mcp__dsp-asst__dsp_show_symbol` — детали символа (doxy/код/file:line)
- `mcp__dsp-asst__dsp_health` — статус БД (counts по таблицам, schema)
- `mcp__dsp-asst__dsp_repos` — список репо в БД

### Какие файлы НЕ переносить через git

Все эти файлы в `.gitignore` DSP-GPU (или в `$HOME` — не в репо):
- `~/.claude.json` — user-scope MCP реестр (в `$HOME`, не в git)
- `<project>/.mcp.json` — project-scope MCP реестр (в `.gitignore`)
- `.claude/settings.json.bak-*` — личные backups (в `.gitignore`)

В git только `.claude/settings.json` (permissions/theme) и `.claude/settings.local.json`
(локальные permissions).

---

## 🆘 Что если что-то упало

| Симптом | Проверка | Фикс |
|---|---|---|
| MCP не отвечает в Claude Code | `systemctl --user is-active dsp-asst.service` | `systemctl --user restart dsp-asst.service` |
| `curl /health` → connection refused | `systemctl --user status dsp-asst.service` | смотреть `journalctl --user -u dsp-asst -n 50` |
| `dsp-asst index embeddings` медленный | `rocm-smi --showuse` — GPU 0-5%? | torch не на ROCm — см. ниже |
| `import torch; cuda.is_available()=False` | `pip show torch \| grep Version` | переустановить ROCm wheel из `offline-pack/3_python_wheels/torch-rocm/` |
| FlagEmbedding `LocalEntryNotFoundError` | проверь `~/.cache/huggingface/hub/models--BAAI--bge-m3/refs/main` | `export DSP_ASST_BGE_M3_PATH=/home/alex/offline-debian-pack/1_models/bge-m3` |
| `psql peer auth fail` | подключение через unix socket требует `--host localhost` | `PGPASSWORD=1 psql -h localhost -U dsp_asst -d gpu_rag_dsp` |
| Qdrant `dsp_gpu_rag_v1 doesn't exist` | `curl localhost:6333/collections` | `python MemoryBank/specs/LLM_and_RAG/configs/qdrant_create_rag_collection.py` |
| `dsp-asst index build` → `--root E:\DSP-GPU not exist` | env override не выставлен | `export DSP_GPU_ROOT=/home/alex/DSP-GPU` |

### Полный «жёсткий ребут» RAG-стека:
```bash
systemctl --user restart embed.service dsp-asst.service
sudo systemctl restart qdrant.service postgresql.service
sleep 10
curl -s http://127.0.0.1:7821/health
curl -s http://127.0.0.1:8765/health
curl -s http://localhost:6333/healthz
PGPASSWORD=1 psql -h localhost -U dsp_asst -d gpu_rag_dsp -c "SELECT count(*) FROM rag_dsp.symbols;"
```

---

## 📁 Важные пути

```
/home/alex/finetune-env/                      ← Python-проект dsp-assistant (venv + код)
/home/alex/finetune-env/.venv/                ← Python 3.12 + ROCm wheels
/home/alex/finetune-env/dsp_assistant/        ← код пакета (cli/indexer/retrieval/server)
/home/alex/finetune-env/re_ingest_all.sh      ← bash-версия re-ingest скрипта
/home/alex/finetune-env/ingest_test_tags.py   ← @test* doxygen → test_params
/home/alex/finetune-env/migrate_pgvector_to_qdrant.py  ← опц. перенос symbols в Qdrant

/home/alex/DSP-GPU/                           ← DSP-GPU мета-репо (9 модулей + MemoryBank)
/home/alex/DSP-GPU/.claude/settings.json      ← Claude Code project config + mcpServers
/home/alex/DSP-GPU/MemoryBank/specs/LLM_and_RAG/configs/stack.json  ← конфиг RAG
/home/alex/DSP-GPU/MemoryBank/specs_Linux_Radion_9070/              ← migration материалы

/home/alex/offline-debian-pack/1_models/      ← локальные модели
  ├── bge-m3/                                 ← embedder
  ├── bge-reranker-v2-m3/                     ← reranker
  ├── jina-embeddings-v3/                     ← альтернатива (late chunking)
  ├── qwen3-8b/ qwen3.6/ qwen2.5-coder-7b/    ← LLM (для Ollama / Phase B)
  └── nomic-embed-text-v1.5/                  ← опц.

/home/alex/offline-debian-pack/3_python_wheels/
  ├── *.whl                                   ← 101 cp312 пакет
  └── torch-rocm/torch-2.11.0+rocm7.2-*.whl   ← ROCm torch

/home/alex/.cache/huggingface/hub/            ← HF-style stubs → симлинки на offline-pack
/home/alex/.config/systemd/user/              ← user systemd units (embed, dsp-asst)
/home/alex/qdrant_storage/                    ← Qdrant data (или /var/lib/qdrant)
/var/lib/postgresql/16/main/                  ← PG data
```

---

## 🔧 Env переменные (обязательные)

| Var | Значение | Где нужно |
|---|---|---|
| `DSP_ASST_PG_PASSWORD` | `1` | везде где PG подключение |
| `DSP_ASST_BGE_M3_PATH` | `/home/alex/offline-debian-pack/1_models/bge-m3` | если HF stubs ломаются |
| `DSP_GPU_ROOT` | `/home/alex/DSP-GPU` | для `index build` / `rag *` команд |
| `DSP_GPU_SPECS_DIR` | `/home/alex/DSP-GPU/MemoryBank/specs/LLM_and_RAG` | загрузка stack.json |
| `TRANSFORMERS_OFFLINE=1` | `1` | offline режим HF |
| `HF_HUB_OFFLINE=1` | `1` | offline режим HF Hub |
| `HSA_OVERRIDE_GFX_VERSION` | НЕ нужно для gfx1201 (9070) | ROCm 7.2 знает 9070 нативно |

---

## 📈 Итог состояния БД (2026-05-13 после полного ingest)

| Таблица | Rows |
|---|---:|
| symbols | 6 292 |
| embeddings | 5 396 |
| includes | 3 052 |
| doc_blocks | 2 591 |
| files | 1 548 |
| test_params | 900 |
| use_cases | 123 |
| cmake_targets | 31 |
| pybind_bindings | 28 |
| pipelines | 0 (no C++ pipeline classes in code) |
| **TOTAL** | **19 961** |

---

*Создал: Кодо · 2026-05-13 после полного RAG bringup на Debian + RX 9070.*
*Связанные документы: `migration_plan_2026-05-10.md`, `task_phase_b_debian_setup_2026-05-12.md`, `inventory_2026-05-10.md`.*
