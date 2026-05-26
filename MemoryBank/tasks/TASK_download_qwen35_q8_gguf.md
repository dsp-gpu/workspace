# TASK — Скачать дома `Qwen3.6-35B-A3B-Q8_0.gguf` (свежий формат)

> Создано: 2026-05-26 · Кодо
> Status: 🟡 BLOCKED — дома (Windows E:\) скачать большой файл
> Priority: P2 (опционально — без этого compare через llama-server для 35B-Q8 невозможен; вчерашние Ollama-scores в БД остаются валидными как fallback)

## Зачем

Сегодня (2026-05-26) при попытке прогнать вчерашнюю модель `qwen3.6:35b-a3b-q8_0` через llama-server для **идеального cross-сравнения** (та же инфра что MTP, 14B, 30B) — получили ошибку:

```
error loading model hyperparameters: key qwen35moe.rope.dimension_sections has wrong array length; expected 4, got 3
```

**Причина:** GGUF в Ollama blob (`/usr/share/ollama/.ollama/models/blobs/sha256-7d8298ddcbce...`) создан старой версией llama.cpp (~14 мая), где у Qwen3.6 MoE этот массив имел 3 элемента. Свежий llama.cpp (master, +195 коммитов с MTP-fixes для qwen35.cpp) ожидает **4 элемента**. Формат изменился — старый GGUF несовместим.

## Что качать

| | |
|---|---|
| **Файл** | `Qwen3.6-35B-A3B-Q8_0.gguf` |
| **Repo (приоритет 1)** | `unsloth/Qwen3.6-35B-A3B-GGUF` — без MTP-суффикса! |
| **Repo (резерв)** | `Qwen/Qwen3.6-35B-A3B-GGUF` (официальный) |
| **HF URL** | https://huggingface.co/unsloth/Qwen3.6-35B-A3B-GGUF |
| **Размер** | ~37-40 GB |
| **Куда положить** | `/mnt/data/Qwen3.6-35B-A3B-GGUF/Qwen3.6-35B-A3B-Q8_0.gguf` |

Альтернатива (более крутая) — взять `unsloth/Qwen3.6-35B-A3B-GGUF` и любой подходящий Q4_K_M / Q5_K_M файл вместо Q8 — на 16 ГБ VRAM с partial offload **разумнее Q4 чем Q8** (быстрее, разница в качестве небольшая).

## Команды для скачки дома (Windows)

```powershell
# Windows PowerShell + huggingface-cli (или git lfs)
pip install huggingface_hub
huggingface-cli download unsloth/Qwen3.6-35B-A3B-GGUF Qwen3.6-35B-A3B-Q8_0.gguf --local-dir E:\Qwen3.6-35B-A3B-GGUF
```

Если файла Q8_0 нет (Unsloth не всегда делает Q8) — взять **Q5_K_M или Q6_K**:
```powershell
huggingface-cli download unsloth/Qwen3.6-35B-A3B-GGUF --include "*Q5_K_M*.gguf" --local-dir E:\Qwen3.6-35B-A3B-GGUF
```

## Что делать на Debian после переноса

```bash
# Переместить с E:\ на /mnt/data
# (через USB или rsync)

# Симлинк в llama.cpp/models
ln -sfn /mnt/data/Qwen3.6-35B-A3B-GGUF/Qwen3.6-35B-A3B-Q8_0.gguf \
    /home/alex/llama.cpp/models/qwen3.6-35b-a3b-q8.gguf

# Раскомментировать строку в run_all_via_llamaserver.sh:
#   "qwen3.6-35b-a3b-q8-llamaserver|$MODELS_DIR/qwen3.6-35b-a3b-q8.gguf|--reasoning off"
# (она там сейчас в комменте после "⚠️ 35B-Q8 из Ollama blob НЕ совместим...")

# Прогнать compare
cd /home/alex/finetune-env/Core/phase6_qwen3coder_30b_moe
./run_all_via_llamaserver.sh   # только 35B-Q8 (т.к. 14B+30B уже сделаны)
```

## DoD

- [ ] GGUF файл скачан и доступен на Debian
- [ ] Симлинк создан
- [ ] llama-server успешно загружает (без `dimension_sections` ошибки)
- [ ] Compare выполнен (DSP-GPU + pao-contrib)
- [ ] Импорт в `llm_bench` (run_id 8 + 9)
- [ ] AI-judge scores проставлены
- [ ] Финальная cross-compare таблица обновлена

## Fallback

Если скачать не получается — **закрыть тему**: вчерашние scores Q8 в БД (`run_id=1, model='qwen3.6:35b-a3b-q8_0'`) остаются валидными. В отчётах помечать **runtime: Ollama** (отличается от остальных llama-server).
