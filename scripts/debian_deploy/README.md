# scripts/debian_deploy — handoff на завтра (13.05)

> **Контекст**: всё подготовлено вечером 12.05 на Windows-сессии.
> На рабочем Debian + RX 9070 — выполнить три задачи в указанном порядке.

---

## 📦 Что в этом каталоге

| Файл | Что делает |
|------|-----------|
| `install_rocm_devkit.sh` | Ставит 76 .deb ROCm 7.2 devkit из offline-pack (hipcc/hipfft/rocblas/rocsolver/rocprim) + smoke check |
| `embed_server.py` | FastAPI server на bge-m3 ONNX, OpenAI-совместимый `/v1/embeddings` (для Continue) |
| `embed.service` | systemd user unit для автозапуска embed_server |
| `acceptance_namespace_migration.sh` | Авто-чеклист сборки + ctest + Python smoke для 7 мигрированных репо |
| `README.md` | этот файл |

---

## 🐧 Шаг 1 — Установить ROCm devkit (5-10 мин)

**Требование**: SSD с offline-pack уже примонтирован, ROCm runtime (rocminfo, hsa-rocr) уже стоит.

```bash
cd /home/alex/DSP-GPU/scripts/debian_deploy
chmod +x install_rocm_devkit.sh
bash install_rocm_devkit.sh
# Или кастомный путь: bash install_rocm_devkit.sh /mnt/ssd/offline-debian-pack/7_dop_files/lib_deb
```

**Acceptance**: 9/9 PASS в smoke check, `hipcc --version` показывает AMD clang + HIP.

**Грабли**:
- `apt: dependency problems` → `sudo apt-get install -f -y`
- `gfx1201 not detected` → `sudo usermod -aG render,video $USER` + перелогин

---

## 🚀 Шаг 2 — Проверить миграцию namespace (1-2 ч)

После того как ROCm devkit стоит — прогнать acceptance скрипт.

```bash
cd /home/alex/DSP-GPU
chmod +x scripts/debian_deploy/acceptance_namespace_migration.sh

# Полный прогон (build + ctest + python smoke + integration):
bash scripts/debian_deploy/acceptance_namespace_migration.sh

# Только сборка (быстрая итерация при отладке):
bash scripts/debian_deploy/acceptance_namespace_migration.sh --only-build

# Только тесты (build уже зелёный):
bash scripts/debian_deploy/acceptance_namespace_migration.sh --only-test
```

**Acceptance**: 0 FAIL. SKIP норма (если GPU не виден или .so не собран ещё).

**Что делать при FAIL** — см. раздел "Возможные грабли" в:
`MemoryBank/tasks/TASK_namespace_migration_debian_acceptance_2026-05-12.md`

**Самые вероятные грабли**:
- `'IBackend' was not declared in this scope` в heterodyne/fm_correlator → проверить что `using namespace ::drv_gpu_lib;` сразу после `namespace dsp::heterodyne {`
- `fft_processor::WindowType` где-то остался → grep + fix

---

## 🧠 Шаг 3 — Опционально: локальный embedding для Continue (1 ч)

Заменить медленный встроенный transformers.js на bge-m3 ONNX.

### 3.1 — Установить onnxruntime (если ещё нет)

```bash
pip install --no-index --find-links /home/alex/offline-debian-pack/3_python_wheels \
    onnxruntime fastapi uvicorn tokenizers
```

### 3.2 — Скопировать скрипт + service

```bash
mkdir -p ~/.continue ~/.config/systemd/user
cp scripts/debian_deploy/embed_server.py ~/.continue/
cp scripts/debian_deploy/embed.service ~/.config/systemd/user/
chmod +x ~/.continue/embed_server.py
```

### 3.3 — Standalone smoke (без systemd)

```bash
python3 ~/.continue/embed_server.py &
sleep 5
curl -s http://localhost:8765/health
curl -s -X POST http://localhost:8765/v1/embeddings \
    -H 'content-type: application/json' \
    -d '{"model":"bge-m3","input":["hello world","привет мир"]}' \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print('dim:', len(d['data'][0]['embedding']), 'first5:', d['data'][0]['embedding'][:5])"
kill %1
```

**Acceptance**: `dim: 1024` и числа отличные от нулей. Первый запуск ONNX session занимает ~10 сек.

### 3.4 — Включить через systemd

```bash
systemctl --user daemon-reload
systemctl --user enable --now embed.service
systemctl --user status embed.service     # должен быть "active (running)"
journalctl --user -u embed.service -f      # follow логов, Ctrl+C для выхода
```

### 3.5 — Подключить к Continue

Добавить в `~/.continue/config.yaml`:

```yaml
models:
  - name: bge-m3 (local)
    provider: openai
    model: bge-m3
    apiBase: http://localhost:8765/v1
    apiKey: dummy
    roles:
      - embed
```

Перезагрузить VSCode → Continue переиндексирует `@codebase` через локальный сервер.

---

## 🚦 Порядок завтра (рекомендованный)

```
07:00 — coffee ☕
07:15 — git pull всех 10 репо
07:20 — Шаг 1: install_rocm_devkit.sh (~5 мин)
07:30 — Шаг 2: acceptance_namespace_migration.sh (~1-2 ч с разбором ошибок)
       └─ Если зелёное → переместить TASK_namespace_migration_debian_acceptance в changelog/
       └─ Опц. тег v0.X.0-namespace-migration через release-manager
10:00 — Шаг 3: embed_server (если есть время; не блокирует DSP-GPU работу)
```

---

## 🛟 Где искать помощь

| Проблема | Файл |
|----------|------|
| Грабли с namespace migration | `MemoryBank/tasks/TASK_namespace_migration_debian_acceptance_2026-05-12.md` |
| План миграции для spectrum (рецепт) | `MemoryBank/specs/namespace_migration_spectrum_plan_2026-05-12.md` |
| ROCm SDK install (общая инструкция) | `MemoryBank/tasks/TASK_install_rocm_hip_sdk_debian_2026-05-12.md` |
| Continue/embedding (общий план) | `MemoryBank/tasks/TASK_continue_embedding_setup.md` |
| Offline-pack inventory | `MemoryBank/specs_Linux_Radion_9070/offline_pack_download_list_2026-05-10.md` |

---

*Created: 2026-05-12 вечер Кодо. Все 30 коммитов миграции в origin/main 7 репо. Завтра sanity check + закрытие.*
