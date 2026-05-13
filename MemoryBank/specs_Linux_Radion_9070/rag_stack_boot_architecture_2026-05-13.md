# 🚀 RAG Stack — Boot Architecture (Debian + RX 9070)

> **Создано:** 2026-05-13 после полного bringup стэка.
> **Назначение:** документировать что стартует при boot, в каком порядке, почему именно так, и как диагностировать отказы.
> **Связано:** `rag_stack_cheatsheet_2026-05-13.md` (команды), `task_phase_b_debian_setup_2026-05-12.md` (история bringup).

---

## 🎯 Цель архитектуры

После любого reboot Debian — стек должен подняться **сам**, без логина пользователя, и быть готов отвечать на запросы Claude Code MCP-tools в течение ~15 секунд после login screen.

## 🗂 Карта сервисов (5 шт., автостарт включён)

```
┌───────────────────────────────────────────────────────────────────────┐
│ BOOT (Debian + ROCm 7.2 + systemd)                                    │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  T0:00  systemd-system запускается                                    │
│  T0:02  ┌─────────────────────────────────────┐                       │
│         │ postgresql.service       (system)   │ ← `enabled`           │
│         │  → /var/lib/postgresql/16/main/     │                       │
│         │  → port 5432                        │                       │
│         └─────────────────────────────────────┘                       │
│                                                                       │
│  T0:02  ┌─────────────────────────────────────┐                       │
│         │ qdrant.service           (system)   │ ← `enabled`,          │
│         │  → /home/alex/qdrant_storage/       │   Restart=always      │
│         │  → port 6333 (REST), 6334 (gRPC)    │                       │
│         └─────────────────────────────────────┘                       │
│                                                                       │
│  T0:02  ┌─────────────────────────────────────┐                       │
│         │ ollama.service           (system)   │ ← `enabled`,          │
│         │  → port 11434                       │   Restart=always      │
│         └─────────────────────────────────────┘                       │
│                                                                       │
│  T0:05  systemd-user (alex) запускается, потому что Linger=yes        │
│         (не ждёт логина — благодаря `loginctl enable-linger alex`)    │
│                                                                       │
│  T0:07  ┌─────────────────────────────────────┐                       │
│         │ embed.service            (user)     │ ← `enabled`,          │
│         │  → BGE-M3 ONNX → port 8765          │   Restart=on-failure  │
│         │  → 1.4 GB RAM, ONNX runtime (CPU)   │                       │
│         │  → для Continue VSCode @codebase    │                       │
│         └─────────────────────────────────────┘                       │
│                                                                       │
│  T0:10  ┌─────────────────────────────────────┐                       │
│         │ dsp-asst.service         (user)     │ ← `enabled`,          │
│         │  → port 7821                        │   Restart=on-failure  │
│         │  → грузит BGE-M3+reranker в GPU VRAM│                       │
│         │  → ≈ 2 GB VRAM, ≈ 1.5 GB RAM        │                       │
│         │  → отвечает на /health, /search,    │                       │
│         │    /find, /show_symbol              │                       │
│         └─────────────────────────────────────┘                       │
│                                                                       │
│  T0:15  ✅ Стек готов к работе                                        │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 🔗 Граф зависимостей (что чему нужно)

```
                          ┌─── postgresql.service (PG 16, system)
                          │      ↑
                          │      └── читает: schema rag_dsp,
                          │          15 таблиц, 19,961 row
dsp-asst.service ─────────┤
  (стек RAG-API)          ├─── qdrant.service (system)
                          │      ↑
                          │      └── читает: dsp_gpu_rag_v1
                          │          (123 use_cases + doc_blocks)
                          │
                          └─── модели на диске:
                                /home/alex/offline-debian-pack/1_models/
                                  bge-m3/, bge-reranker-v2-m3/

embed.service ─────────── модели на диске:
  (для Continue VSCode)    /home/alex/offline-debian-pack/1_models/bge-m3/

ollama.service ───────── модели в ~/.ollama/models/
  (LLM для Continue +     (qwen3.6:35b, qwen2.5-coder:7b)
   будущего Phase B)
```

**Важно:** systemd-user не имеет `After=postgresql.service` (system targets не видны
user-units). Поэтому если PG не успел подняться до `dsp-asst.service` →
последний упадёт на старте → systemd подождёт `RestartSec=10` и повторит.
Через 1-2 попытки PG будет готов и `dsp-asst.service` встанет.

---

## ⚙️ Как именно работает каждый сервис

### 1. PostgreSQL 16 (system, port 5432)
- Стандартный Debian `postgresql.service` → `postgresql@16-main.service`.
- Данные: `/var/lib/postgresql/16/main/`.
- Базы: `gpu_rag_dsp` (наша), `rag` (legacy от прошлых попыток).
- Пользователь `dsp_asst` пароль `1`, схема `rag_dsp` (15 таблиц).
- pg_hba: peer-auth для unix socket, password для TCP `127.0.0.1`.

**Что-то сломалось:**
```bash
journalctl -u postgresql -n 50
systemctl restart postgresql
sudo -u postgres psql -c "\l"      # список БД
```

### 2. Qdrant (system, port 6333)
- Бинарь `/opt/qdrant/qdrant` (нативный, не docker).
- Данные: `/home/alex/qdrant_storage/`.
- Коллекция `dsp_gpu_rag_v1` (1024d cosine, HNSW m=16 ef=200).
- `Restart=always` — будет рестартить даже после graceful exit.

**Что-то сломалось:**
```bash
journalctl -u qdrant -n 50
curl http://localhost:6333/healthz       # ok
curl http://localhost:6333/collections   # список коллекций
```

### 3. Ollama (system, port 11434)
- Стандартный `ollama.service`.
- Модели: `qwen3.6:35b` (~25 GB), `qwen2.5-coder:7b` (~14 GB), etc.
- Используется Continue VSCode для chat/autocomplete.
- В будущем — для **Phase B**: `ollama create qwen3-8b-dsp -f Modelfile.template`.

**Что-то сломалось:**
```bash
journalctl -u ollama -n 50
ollama list
ollama ps           # запущенные модели
```

### 4. embed.service (user, port 8765)
- **Назначение:** OpenAI-совместимый embedder для Continue VSCode @codebase.
- Бинарь: `~/.continue/.venv/bin/python ~/.continue/embed_server.py`.
- Модель: `bge-m3` (ONNX, `/home/alex/offline-debian-pack/1_models/bge-m3`).
- Backend: ONNX runtime (**CPU**, не GPU — Continue не требует скорости).
- 1.4 GB RAM, dim=1024, 8192 ctx.

**Что-то сломалось:**
```bash
systemctl --user status embed.service
journalctl --user -u embed.service -n 50
curl http://localhost:8765/health
```

### 5. dsp-asst.service (user, port 7821) — **главный**
- **Назначение:** HTTP API для RAG поиска по DSP-GPU кодовой базе.
- Бинарь: `/home/alex/finetune-env/.venv/bin/dsp-asst serve --port 7821`.
- Модели в VRAM: **BGE-M3 + BGE-reranker-v2-m3 (fp16, ROCm 7.2 на RX 9070 gfx1201)**.
- Backend: torch 2.11.0+rocm7.2.
- ≈ 2 GB VRAM, ≈ 1.5 GB RAM.
- **Endpoints:** `/health`, `/search`, `/find`, `/show_symbol`, `/repos`.

**Что-то сломалось:**
```bash
systemctl --user status dsp-asst.service
journalctl --user -u dsp-asst.service -n 100
curl http://127.0.0.1:7821/health
# Если упало с torch error:
~/.local/bin/uv pip show torch | grep Version    # должно: 2.11.0+rocm7.2
# Если упало с PG auth:
PGPASSWORD=1 psql -h localhost -U dsp_asst -d gpu_rag_dsp -c "select 1"
```

---

## 🔑 Linger (критично для autostart без логина)

Без `Linger=yes` — user-сервисы (`embed`, `dsp-asst`) стартуют **только** после login.
С `Linger=yes` — стартуют при boot, как system-сервисы.

```bash
loginctl show-user alex | grep Linger    # должно: Linger=yes
sudo loginctl enable-linger alex          # если =no
sudo loginctl disable-linger alex         # отключить если когда-нибудь нужно
```

Файл-маркер `Linger=yes`: `/var/lib/systemd/linger/alex` (создаётся пустым).

---

## 🛡 Что произойдёт при разных сбоях

| Сценарий | Что делает systemd | Действие user'а |
|---|---|---|
| **`dsp-asst.service` упал по OOM** | Перезапустит через 10с (`Restart=on-failure`) | смотреть `journalctl --user -u dsp-asst`, увеличить `MemoryMax` в unit'е |
| **PG не успел стартовать до dsp-asst** | dsp-asst упадёт на connect, ждёт 10с, повторит. Через 1-2 попытки встанет | ничего, само починится |
| **HF cache stub сломался (refs/main пустой)** | dsp-asst падает с `LocalEntryNotFoundError` бесконечно | пересоздать stubs (см. cheatsheet «HF stubs») или установить env `DSP_ASST_BGE_M3_PATH` |
| **GPU в low-power, медленно** | работает но 8с/batch вместо 0.3 | `rocm-smi --setperflevel high` (требует sudo) или подождать warmup |
| **Disk full (`/home/alex` полный)** | qdrant_storage/ + PG + journal начнут падать | `df -h /home/alex`, очистить journal: `journalctl --user --vacuum-time=7d` |
| **Modelfile на диске удалили** | embed.service / dsp-asst падают `OSError no such file` | восстановить из `offline-debian-pack/1_models/` или backup |
| **Continue убил порт 8765** | embed.service показывает FAIL «port in use» | `ss -tlnp \| grep 8765`, убить второй процесс, restart |
| **dsp-asst.service отключили** (`systemctl --user disable`) | После reboot не стартанёт | `systemctl --user enable --now dsp-asst.service` |

---

## 🩺 Health-check 1 командой (после reboot)

```bash
# полный аудит за 3 секунды:
systemctl is-active postgresql qdrant ollama
systemctl --user is-active embed.service dsp-asst.service
curl -s http://127.0.0.1:7821/health 2>/dev/null | head -1
curl -s http://localhost:6333/healthz
ss -tlnp 2>/dev/null | grep -E ':5432|:6333|:8765|:7821|:11434'
```

Ожидаемое:
```
active
active
active
active
active
{"status":"ok","version":"0.1.0",...}
healthz check passed
LISTEN ... 127.0.0.1:5432 ...
LISTEN ... 0.0.0.0:6333  ...
LISTEN ... 127.0.0.1:7821 ...
LISTEN ... 127.0.0.1:8765 ...
LISTEN ... 127.0.0.1:11434 ...
```

Если хоть что-то не active — см. таблицу выше или `journalctl`.

---

## 💡 Зачем именно такая архитектура

| Решение | Почему |
|---|---|
| **systemd-user для embed/dsp-asst** (не system) | Не требуется sudo для управления, всё под `alex`. Меньше rights → меньше attack surface. Прецедент: `~/.continue/` уже подключён через user-systemd, единообразие. |
| **Linger=yes** | Чтобы стек поднимался при reboot **без** ожидания логина (например, после отключения питания на ночь — утром придёшь, всё готово). |
| **HTTP API + stdio-MCP** (не stdio-only) | HTTP сервер держит модели в RAM (warmup ~7s), MCP-stdio спавнится по запросу за <100ms (без warmup). Иначе каждый MCP-вызов был бы +7s overhead. |
| **Port 7821 для dsp-asst (default)** | Стандартный default в коде `dsp-asst`, чтобы `dsp-asst mcp` без `--server` работал. 8765 занят Continue embed. |
| **`Restart=on-failure`** | Только при ошибках. Если человек руками сделает `stop` — сервис останется выключен, не воскресает. |
| **`Restart=always` у Qdrant/Ollama** | Эти быстро поднимаются и без них стек не работает. Воскрешаются всегда. |
| **PG = system, embed/dsp-asst = user** | PG — общая инфраструктура, может использоваться другими проектами. Сервисы RAG — per-user, переезжают вместе с `/home/alex`. |
| **HF cache stubs с симлинками на offline-pack** | Не дублировать 12 GB моделей. Disk-friendly, instant copy. transformers видит «как будто скачано». |
| **No HSA_OVERRIDE_GFX_VERSION** | RX 9070 (gfx1201) поддерживается ROCm 7.2 нативно. Override был бы для RDNA3, и сломал бы gfx1201. |

---

## 🚫 Что **НЕ** автостартует (и почему)

- **`re_ingest_all.sh`** — наполнение RAG базы. Должно запускаться **после изменений кода в DSP-GPU**, не при каждом boot.
- **`dsp-asst index build/embeddings`** — то же самое: триггер по событию (push в git, изменение `.cpp/.hpp`), не по таймеру.
- **`dsp-asst serve` без systemd** — мы убрали ручной запуск, заменили на systemd-user.

При желании можно добавить **`dsp-asst-watchdog.timer`** который раз в 30 мин будет
проверять `/health` и рестартить если ответ невалидный. Сейчас не нужно — на 13.05 стек стабилен.

---

## 🔁 Полная процедура «новая машина / переезд»

Если поднимаем стек на **новой** Debian-машине (или после переустановки ОС):

```bash
# 1. ROCm 7.2 + hipcc (как было сегодня)
sudo apt install hipcc hip-dev rocm-llvm hipfft-dev rocblas-dev \
                 rocsolver-dev rocprim-dev rocrand-dev hipblas-dev \
                 rocm-opencl-runtime
# (через подключение repo.radeon.com/rocm/apt/7.2/noble в sources.list)

# 2. PostgreSQL 16 + pgvector
sudo apt install postgresql-16 postgresql-16-pgvector
sudo -u postgres psql -v pg_password="'1'" \
    -f /home/alex/DSP-GPU/MemoryBank/specs/LLM_and_RAG/configs/postgres_init.sql
sudo -u postgres psql -d gpu_rag_dsp \
    -f /home/alex/DSP-GPU/MemoryBank/specs/LLM_and_RAG/configs/postgres_init_pgvector.sql
sudo -u postgres psql -d gpu_rag_dsp \
    -f /home/alex/DSP-GPU/MemoryBank/specs/LLM_and_RAG/configs/postgres_init_rag.sql
# … остальные 4 SQL (см. session 2026-05-13)

# 3. Qdrant binary в /opt/qdrant/ + systemd unit (system)
# 4. Ollama install + pull models
# 5. finetune-env: uv python install 3.12, uv venv, uv pip install -e .
#    Не забыть: torch 2.11.0+rocm7.2 (не CUDA wheel!)
# 6. HF cache stubs (см. session 2026-05-13)
# 7. systemd user-units: embed.service + dsp-asst.service
# 8. sudo loginctl enable-linger alex

# 9. Полный re-ingest:
cd /home/alex/finetune-env && source .venv/bin/activate
export DSP_ASST_PG_PASSWORD=1
export DSP_GPU_ROOT=/home/alex/DSP-GPU
dsp-asst --stage 1_home index build
dsp-asst --stage 1_home index embeddings
dsp-asst --stage 1_home index extras
./re_ingest_all.sh
python ingest_test_tags.py --all

# 10. Smoke
curl -s http://127.0.0.1:7821/health

# 11. ОБЯЗАТЕЛЬНО: зарегистрировать MCP в Claude Code (НЕ автоматом, .mcp.json
#     в .gitignore — каждая машина регистрирует локально):
claude mcp add dsp-asst -s user \
  -e DSP_ASST_SERVER_URL=http://127.0.0.1:7821 \
  -e DSP_ASST_PG_PASSWORD=1 \
  -- /home/alex/finetune-env/.venv/bin/dsp-asst --stage 1_home mcp

# Verify:
claude mcp list | grep dsp-asst
# должно: dsp-asst: ... ✓ Connected

# 12. Перезапустить Claude Code чтобы он подцепил MCP-сервер при старте.
```

ETA: 1-1.5 ч (без скачивания offline-pack), 4-6 ч если качать с интернета.

> ⚠️ **Почему MCP регистрация не в git:** команда `dsp-asst mcp` хранит **абсолютный
> путь к бинарю** и **OS-зависимые флаги** (`cmd /c` на Windows). Если попадёт в git
> — каждая машина при pull получит чужой путь. Поэтому `.mcp.json` в `.gitignore`,
> регистрация делается локально через `claude mcp add ...` на каждой машине.

---

## 📁 Файлы которые нельзя терять

| Артефакт | Путь | Backup стратегия |
|---|---|---|
| **БД PG** | `/var/lib/postgresql/16/main/` | `pg_dump > backup.sql` раз в неделю |
| **Qdrant data** | `/home/alex/qdrant_storage/` | Tar archive раз в неделю (можно re-build из PG) |
| **systemd units** | `~/.config/systemd/user/{embed,dsp-asst}.service` | В git: `DSP-GPU/scripts/debian_deploy/` копии |
| **DSP-GPU/.claude/settings.json** | (в git) | git история |
| **finetune-env/.venv/** | (не в git, ~5 GB) | `uv pip freeze > requirements.lock` раз в неделю |
| **finetune-env код** | (в git finetune-env) | git история |
| **Модели** | `/home/alex/offline-debian-pack/1_models/` | SSD backup, повторно скачать с HF при нужде |

---

*Создал: Кодо · 2026-05-13 — после bringup на работе. Maintenance: при любых изменениях в архитектуре — обновлять этот файл.*
