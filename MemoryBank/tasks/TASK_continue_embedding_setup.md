# TASK — Continue: локальный embedding для @codebase

**Статус**: ✅ **DONE 2026-05-13**
**Дата**: 2026-05-12 (анализ + offline-pack) → 2026-05-13 (установка + smoke + systemd)
**Цель**: заменить медленный встроенный `transformers.js` в Continue на быстрый локальный embedding-сервер для индексации `@codebase`.

---

## ✅ Итог 2026-05-13 — сервер поднят, Continue переключён

Реализовано через **Variant B** (свой FastAPI на onnxruntime), но с поправкой по факту:
- системный Python = **3.13.5**, offline-pack wheels — **cp312** → не подошли
- решение: `python3 -m venv ~/.continue/.venv` + `pip install` из pypi (~30 MB) — без sudo, без трогания системы

**Развёрнуто**:
- `~/.continue/.venv/` — Python 3.13 venv с onnxruntime 1.26 / fastapi 0.136 / uvicorn 0.46 / tokenizers 0.23 / numpy 2.4 / pydantic 2.13
- `~/.continue/embed_server.py` — копия `scripts/debian_deploy/embed_server.py`
- `~/.config/systemd/user/embed.service` — `active (running)`, `ExecStart` через venv-python; enabled
- `~/.continue/config.yaml` — добавлен `bge-m3 (local)` (openai-совместимый, role=embed); Qwen chat/autocomplete не тронуты; backup `config.yaml.bak-2026-05-13`
- модель `bge-m3` — `/home/alex/offline-debian-pack/1_models/bge-m3` (1024-dim, 8K ctx)

**Acceptance**: `/health` → ok / dim=1024; `/v1/embeddings` на en+ru → 2 вектора по 1024-dim, разные.

**Команды**:
```bash
systemctl --user status embed.service
journalctl --user -u embed.service -f
```
Откат: `cp ~/.continue/config.yaml.bak-2026-05-13 ~/.continue/config.yaml && systemctl --user disable --now embed.service`.

---

## 📜 Исходный анализ (12.05)

## ✅ Прогресс 2026-05-12 (вечер) — Вариант B: wheel скачан

`onnxruntime==1.20.*` для `cp312` / `manylinux_2_28_x86_64` + транзитивный `numpy-2.4.4` скачаны через `pip download` на Windows.

**Артефакт**: `D:\offline-debian-pack\7_dop_files\` (Windows) → перенести в `/home/alex/offline-debian-pack/7_dop_files/` или сразу в `3_python_wheels/`.

| Файл | Размер |
|------|--------|
| `onnxruntime-1.20.*-cp312-cp312-manylinux_2_28_x86_64.whl` | ~13-15 MB |
| `numpy-2.4.4-cp312-cp312-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl` | ~16 MB |

> Вариант A (`ollama pull bge-m3`, 1.2 GB) — отложен, не нужен.
> `fastembed` — не качали (конфликт зависимостей tokenizers; пишем свой FastAPI напрямую на `onnxruntime`).

**Следующий шаг на Debian** (после установки ROCm SDK):
```bash
pip install --no-index --find-links /home/alex/offline-debian-pack/3_python_wheels \
    onnxruntime sentence_transformers fastapi uvicorn
```
→ далее `~/.continue/embed_server.py` (Шаг 1 ниже).

---

## 🟢 Что УЖЕ ЕСТЬ в `/home/alex/offline-debian-pack` (качать НЕ надо)

### Модель `bge-m3` (мультиязычная RU+EN, 1024-dim, 8K ctx)
- `1_models/bge-m3/onnx/model.onnx` + `model.onnx_data` — готовая ONNX версия
- `1_models/bge-m3/pytorch_model.bin` — HF / PyTorch формат
- `1_models/bge-m3/sentencepiece.bpe.model` + `tokenizer.json` — токенизатор
- `1_models/bge-m3/config_sentence_transformers.json` — конфиг для sentence-transformers
- `1_models/bge-m3/1_Pooling/` — pooling-слой

### Python wheels (всё для своего сервера)
- `torch-rocm/torch-2.11.0+rocm7.2-cp312-cp312-manylinux_2_28_x86_64.whl` — **ROCm 7.2 torch**, для RX 9070
- `sentence_transformers-5.4.1-py3-none-any.whl`
- `transformers-5.8.0-py3-none-any.whl`
- `tokenizers-0.22.2-cp39-abi3-manylinux_2_17_x86_64.whl`
- `fastapi-0.136.1-py3-none-any.whl`
- `uvicorn-0.46.0-py3-none-any.whl`
- `starlette-1.0.0-py3-none-any.whl`
- `pydantic-2.13.4`, `pydantic_core-2.46.4`, `httpx`, `numpy`, `safetensors`, `huggingface_hub`, `accelerate`, `regex`, `pyyaml`, `filelock`, `mpmath`, `sympy` (если нужно), `jinja2`, `markupsafe`, `networkx`, `pillow`, `fsspec`, `requests`, `idna`, `urllib3`, `certifi`, `charset_normalizer`, `packaging`, `typing_extensions`

### Ollama (рантайм, не сервер embeddings)
- `models/`, `blobs/`, `manifests/registry.ollama.ai/library/qwen3.6/{35b,27b,35b-a3b-q8_0}` — три qwen3.6 уже в pack.

---

## 🔴 Чего НЕТ в pack — кандидаты на скачивание

### Вариант A — самый простой, через Ollama (требует ОK Alex)

| Файл | Размер | Источник |
|------|--------|----------|
| **bge-m3 GGUF** (через `ollama pull bge-m3`) | **~1.2 GB** | `registry.ollama.ai/library/bge-m3` |

> ⚠️ > 600 MB → по правилу CLAUDE.md скачать дома (Windows) или с явным OK Alex.
> После загрузки на работе: `ollama pull bge-m3`, далее одна строка в `~/.continue/config.yaml`.

### Вариант B — на готовом ONNX + Python сервер (~6 MB качать)

| Wheel | Размер | Зачем |
|-------|--------|-------|
| `onnxruntime-1.20.x-cp312-cp312-manylinux_2_28_x86_64.whl` | ~6 MB | CPU инференс ONNX, нужен для `model.onnx` из pack |
| (опц.) `fastembed-0.4.x-py3-none-any.whl` | ~2 MB | удобная обёртка Qdrant над ONNX + tokenizer |
| (опц.) `onnxruntime-rocm-*.whl` | ~30 MB | если хочется на GPU; нестабильно для RDNA4 — пропускаем |

> Wheels — публичные, всё < 10 MB суммарно → можно качать без отдельного OK.

### Вариант C — **0 байт качать** (на чистом PyTorch + ROCm)

Использовать `torch-rocm 2.11.0+rocm7.2` + `sentence_transformers` напрямую на `bge-m3/pytorch_model.bin`.
**Всё уже в pack.** Минус — модель 2.2 GB в RAM (float32) или 1.1 GB (float16 cast).

---

## 📋 Рекомендация Кодо

**Вариант B — оптимальный**:
- 6 MB скачать (один `onnxruntime`),
- использовать готовый `bge-m3/onnx/model.onnx` (полу-precision уже ~600 MB на диске),
- свой FastAPI сервер `~/.continue/embed_server.py` на порту `localhost:8765`,
- в `~/.continue/config.yaml` добавить provider `openai` с `apiBase: http://localhost:8765/v1`.

**Бонус**: тот же сервер потом — для RAG в `finetune-env` (общий embedding-эндпоинт).

---

## 📝 План на завтра (по шагам)

### 0. Установить onnxruntime (если выбираем B)
```bash
# Если нет в pack — скачать дома:
pip download onnxruntime==1.20.* -d /home/alex/offline-debian-pack/3_python_wheels/ --platform manylinux_2_28_x86_64 --python-version 3.12 --only-binary=:all:
# На Debian:
pip install --no-index --find-links /home/alex/offline-debian-pack/3_python_wheels onnxruntime sentence_transformers fastapi uvicorn
```

### 1. Создать ~/.continue/embed_server.py
- FastAPI на `localhost:8765`
- эндпоинты `/v1/embeddings` (OpenAI совместимый формат) + `/health`
- модель: `bge-m3/onnx/model.onnx` + `tokenizer.json` через `onnxruntime.InferenceSession`
- pooling: mean + L2 normalize (стандарт для bge-m3)
- батч: 32 одновременно

### 2. systemd-юнит `~/.config/systemd/user/embed.service`
```ini
[Unit]
Description=Local bge-m3 embedding server for Continue
[Service]
ExecStart=/usr/bin/python3 /home/alex/.continue/embed_server.py
Restart=on-failure
[Install]
WantedBy=default.target
```
`systemctl --user enable --now embed.service`

### 3. Обновить `~/.continue/config.yaml`
```yaml
models:
  # ... existing chat models ...
  - name: bge-m3 (local embed)
    provider: openai
    model: bge-m3
    apiBase: http://localhost:8765/v1
    apiKey: dummy
    roles:
      - embed
```

### 4. Проверка
```bash
curl -s http://localhost:8765/health
curl -s -X POST http://localhost:8765/v1/embeddings \
  -H 'content-type: application/json' \
  -d '{"model":"bge-m3","input":["hello world","привет мир"]}' | head -c 200
```

### 5. Reload VSCode Window → Continue переиндексирует `@codebase` через локальный сервер.

---

## 🔁 Альтернатива (если Вариант A выбран)

```bash
# дома (Windows) или с OK Alex:
ollama pull bge-m3                          # ~1.2 GB
# на работе после ollama load:
curl -s http://localhost:11434/api/tags | grep bge-m3
```
В `~/.continue/config.yaml`:
```yaml
  - name: bge-m3 (ollama)
    provider: ollama
    model: bge-m3
    apiBase: http://localhost:11434
    roles: [embed]
```

---

## ❓ Открытые вопросы к Alex (обсудить перед стартом)

1. **Вариант A (ollama, 1.2 GB) vs B (ONNX сервер, 6 MB)?**
   - A проще (3 минуты), но 1.2 GB трафика.
   - B сложнее (1 час), но 0/6 MB трафика и пригодится для RAG.
2. **Если B — гонять onnxruntime на CPU или попытаться на ROCm?**
   - CPU: стабильно, ~50ms на батч 32 текста.
   - ROCm: ~10 ms, но onnxruntime-rocm на gfx1201 нестабилен → пока CPU.
3. **Скачивание дома (Windows) → на флешке принести `.whl`?** Или открыть «окно» интернета на работе?

---

## ✅ Definition of Done

- [ ] Сервер `localhost:8765` живой, отвечает на `/v1/embeddings`.
- [ ] Continue `@codebase` перестроил индекс через bge-m3.
- [ ] `~/.continue/config.yaml` обновлён.
- [ ] systemd-юнит активен.
- [ ] Этот файл → `MemoryBank/changelog/2026-05.md` с пометкой DONE.

---

*Связано*: `TASK_install_rocm_hip_sdk_debian_2026-05-12.md`, [02-workflow](.claude/rules/02-workflow.md).
