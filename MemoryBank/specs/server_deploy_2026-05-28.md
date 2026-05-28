# 🖥️ Server Deploy — Ubuntu 24 + ROCm 7.2 + RX 9070

> **Дата**: 2026-05-28 · **Сервер**: `user@10.10.4.105` · **Hardware**: i9-13900K + 62GB RAM + RX 9070 (gfx1201, 16 GB VRAM) + 586 GB free на /

## ✅ Что развёрнуто

| Сервис | Адрес | Статус |
|--------|-------|--------|
| **llama-server** (3 модели) | `127.0.0.1:8080` | systemd ✅ |
| **Qdrant** (RAG vectors) | `127.0.0.1:6333` (HTTP) / `:6334` (gRPC) | systemd ✅ |
| **Postgres 16** (pgvector) | `127.0.0.1:5432`, db `gpu_rag_dsp`, user `dsp_asst` / `1` | systemd ✅ |
| **Ollama** (предустановлен) | `127.0.0.1:11434` | systemd ✅ |

## 📊 LLM модели (3 варианта, переключаются)

| Модель | systemd unit | ngl | Скорость | Использовать для |
|--------|-------------|-----|---------:|------------------|
| **qwen-coder-14b-dsp** | `llama-server@14b.service` | 99 (full GPU) | **47.78 tok/s** | Fast codegen, default |
| **qwen3-coder-30b-a3b** | `llama-server@30b.service` | 30 (partial) | ~30 tok/s | Strong code generation |
| **qwen3.6-35b-mtp (UD-Q4_K_M)** | `llama-server@mtp.service` | 26 (partial) | **36 tok/s + 89% draft** | Deep review, docs, RAII reasoning |

### Переключение моделей (быстрая команда)

```bash
ssh user@10.10.4.105
sudo llm-switch 14b   # быстрая 14B
sudo llm-switch 30b   # средняя 30B coder
sudo llm-switch mtp   # глубокая MTP 35B (speculative)
sudo llm-switch status
sudo llm-switch logs
sudo llm-switch stop
```

Или вручную через systemd:
```bash
sudo systemctl stop  'llama-server@*.service'
sudo systemctl start llama-server@mtp.service
journalctl -u llama-server@mtp.service -f
```

## 🗄️ Postgres `gpu_rag_dsp`

```
schemas:  rag_dsp (14 tables, 5396 BGE-M3 embeddings)
          llm_bench (5 tables — Phase 6 final + 36 responses scored)
user:     dsp_asst  password='1'  (SUPERUSER)
extension: vector (pgvector 0.8+)
```

Connection:
```python
psycopg.connect("host=127.0.0.1 port=5432 dbname=gpu_rag_dsp user=dsp_asst password=1")
```

## 🔍 Qdrant collection `dsp_gpu_rag_v1`

- 2591 points × 1024-dim BGE-M3, cosine distance
- HNSW не построен (`indexed_vectors_count=0`) — search через full-scan, ~ms на 2591 points
- payload schema: `repo` (keyword), `target_table` (keyword)

```bash
curl http://127.0.0.1:6333/collections/dsp_gpu_rag_v1
```

## 🔌 SSH Tunnel с твоего ноутбука/ПК

```bash
# Один tunnel на 3 порта:
ssh -L 8080:127.0.0.1:8080 \
    -L 11434:127.0.0.1:11434 \
    -L 6333:127.0.0.1:6333 \
    user@10.10.4.105

# Теперь localhost:8080 на ноутбуке → llama-server на сервере
# localhost:11434 → Ollama (embeddings)
# localhost:6333  → Qdrant
```

### Постоянный tunnel (autossh, systemd user):

```ini
# ~/.config/systemd/user/dsp-server-tunnel.service
[Unit]
Description=SSH tunnel to DSP-GPU server
After=network-online.target

[Service]
ExecStart=/usr/bin/autossh -M 0 -N \
    -o ServerAliveInterval=30 -o ServerAliveCountMax=3 \
    -L 8080:127.0.0.1:8080 \
    -L 11434:127.0.0.1:11434 \
    -L 6333:127.0.0.1:6333 \
    user@10.10.4.105
Restart=always

[Install]
WantedBy=default.target
```
`systemctl --user enable --now dsp-server-tunnel.service`

## 🔧 Continue VSCode конфиг

`~/.continue/config.json`:
```json
{
  "models": [
    {
      "title": "DSP-GPU 14B (fast)",
      "provider": "openai",
      "apiBase": "http://127.0.0.1:8080/v1",
      "model": "qwen-coder-14b-dsp",
      "apiKey": "none"
    }
  ],
  "tabAutocompleteModel": {
    "title": "DSP-GPU 14B (autocomplete)",
    "provider": "openai",
    "apiBase": "http://127.0.0.1:8080/v1",
    "model": "qwen-coder-14b-dsp",
    "apiKey": "none"
  },
  "embeddingsProvider": {
    "provider": "ollama",
    "model": "nomic-embed-text",
    "apiBase": "http://127.0.0.1:11434"
  }
}
```

После переключения модели на сервере (`llm-switch mtp`) — пиши то же `http://127.0.0.1:8080/v1`, имя в Continue только для UI.

## 📂 Структура на сервере

```
/home/user/
├── llama.cpp/                    # source + build/
│   ├── build/bin/llama-server    # бинарь (HIP, gfx1201)
│   └── models/                   # 3 GGUF (~49 GB)
│       ├── qwen-coder-14b-dsp.gguf            (8.4 GB)
│       ├── qwen3-coder-30b-a3b.gguf           (18 GB)
│       └── Qwen3.6-35B-A3B-UD-Q4_K_M.gguf     (22 GB)
├── rag-pao/                      # сестрин проект (не трогать)
└── .ollama/                      # 102 GB (qwen3.6:35b-a3b-q8_0, nomic-embed-text, и др.)

/etc/systemd/system/
├── llama-server@.service         # template для 3 вариантов
└── qdrant.service                # Qdrant autostart

/etc/default/
├── llama-server-14b              # args для 14B
├── llama-server-30b              # args для 30B
└── llama-server-mtp              # args для MTP

/usr/local/bin/llm-switch         # переключатель моделей

/opt/qdrant/qdrant                # 73 MB бинарь
/var/lib/qdrant/storage/          # коллекции
```

## 🧪 Smoke test

```bash
# 1. Какая модель сейчас?
ssh user@10.10.4.105 'sudo llm-switch status'

# 2. Тест chat
ssh user@10.10.4.105 'curl -s http://127.0.0.1:8080/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d "{\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":20}"'

# 3. Qdrant
ssh user@10.10.4.105 'curl -s http://127.0.0.1:6333/collections/dsp_gpu_rag_v1'

# 4. Postgres
ssh user@10.10.4.105 'PGPASSWORD=1 psql -h 127.0.0.1 -U dsp_asst -d gpu_rag_dsp -c "SELECT count(*) FROM rag_dsp.embeddings;"'
```

## ⏭️ Что НЕ перенесли (отложено)

### dsp-asst HTTP API (RAG)

Требует Python `.venv` 19 GB с ROCm wheels (torch+bnb+transformers+sentence-transformers+rerankers). На сервере нет интернета для pip, только `repo.radeon.com` mirror (не имеет PyPI).

Варианты решения:
- A) Собрать wheels локально → rsync → `pip install --no-index --find-links ./wheels`
- B) Использовать `dsp-asst` локально на твоём ПК + читать БД с сервера через SSH tunnel
- C) Если будет временный интернет — `python -m venv .venv && pip install` на сервере

**Минимум для @codebase в Continue:** достаточно `nomic-embed-text` через Ollama (embeddings) + прямой SQL/Qdrant запрос. Реранкер можно опустить.

### embed.service (BGE-M3 для Continue)

То же — нужен `.venv` с onnxruntime + tokenizers. На сервере уже есть `nomic-embed-text` через Ollama (274 MB), и Continue умеет с ним работать. Это проще.

## 📝 Логи / диагностика

```bash
# llama-server
journalctl -u llama-server@14b.service -f
journalctl -u llama-server@mtp.service -n 100

# qdrant
journalctl -u qdrant.service -f

# postgres
journalctl -u postgresql -n 50

# GPU
ssh user@10.10.4.105 'rocm-smi --showmeminfo vram --showuse'

# Что слушает порт
ss -tlnp | grep -E ":8080|:6333|:11434|:5432"
```

## 🎯 Что важно знать

1. **VRAM 16 GB** — full-offload (`-ngl 99`) только для 14B (8.4 GB). 30B/35B требуют partial (`-ngl 26-30`).
2. **MTP draft acceptance 75-89%** — speculative decoding работает идеально, скорость близка к 14B.
3. **Thinking mode для Qwen3.6** — отключается через `--reasoning-format none --jinja --chat-template-kwargs '{"enable_thinking":false}'`. Иначе модель «жуёт» все токены на thinking.
4. **systemd unit template** `llama-server@<variant>` — один файл, разные env. Только одна модель одновременно (VRAM лимит).
5. **GLIBC** — Debian 13 (2.41) ≠ Ubuntu 24 (2.39). Бинари **не переносимы**, нужна build на сервере.
6. **HIP headers конфликт** — `libamdhip64-dev 5.7.1` от Ubuntu noble repo конфликтует с `hip-dev 7.2` от repo.radeon.com. Удалили старый, оставили только новый.

---

*Кодо · 2026-05-28 · Сервер production-ready*
