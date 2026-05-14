# TASK_FINETUNE_phase_B_models_download_2026-05-14

> **Цель:** скачать дома HF safetensors моделей для matrix experiments Phase B на RX 9070.
> **Исполнитель:** Сестра (дома, на Windows + SWx-Ubuntu или native Linux с интернетом).
> **Передача результатов:** SSD/флешка → принести в офис.
> **Maintainer:** Кодо
> **Связано:** `MemoryBank/specs_Linux_Radion_9070/phase_b_models_analysis_2026-05-14.md`

---

## 🎯 Что и почему

Для **Phase B fine-tune QLoRA** на RX 9070 (16 GB VRAM) нужны **HF safetensors** (Ollama GGUF не подходит — lossy decompression нарушает принцип «КАЧЕСТВО»).

Локально на работе уже есть Qwen3-8B и Qwen2.5-Coder-7B. Не хватает **14B Coder** для основного Phase B + (опционально) **14B general** для сравнения.

**Жёсткий лимит размера: до 14B** — большие модели физически не помещаются в 16 GB для обучения.

---

## 📋 Чек-лист скачивания

### Установить инструмент HF Hub (если ещё нет)
```bash
pip install huggingface-hub
# или через uv:
uv pip install huggingface-hub
```

### 🔴 ОБЯЗАТЕЛЬНО: Qwen2.5-Coder-14B-Instruct (28 GB)
```bash
huggingface-cli download Qwen/Qwen2.5-Coder-14B-Instruct \
    --local-dir ~/Downloads/Qwen2.5-Coder-14B-Instruct \
    --local-dir-use-symlinks False
```
**Зачем:** основная модель Phase B fine-tune. Coder-специализированная для C++/HIP/Python.

### 🟡 РЕКОМЕНДУЮ: Qwen3-14B general (28 GB)
```bash
# Сначала проверить что есть на HF (Qwen3-14B может быть renamed)
huggingface-cli scan-cache  # или просто попробовать download
huggingface-cli download Qwen/Qwen3-14B \
    --local-dir ~/Downloads/Qwen3-14B \
    --local-dir-use-symlinks False

# Если Qwen3-14B нет, fallback:
huggingface-cli download Qwen/Qwen2.5-14B-Instruct \
    --local-dir ~/Downloads/Qwen2.5-14B-Instruct \
    --local-dir-use-symlinks False
```
**Зачем:** сравнить **Coder vs general 14B** в одинаковых условиях — оценить outweighs Coder специализация.

### 🟢 ОПЦИОНАЛЬНО: Qwen2.5-Coder-7B-Instruct (14 GB)
```bash
huggingface-cli download Qwen/Qwen2.5-Coder-7B-Instruct \
    --local-dir ~/Downloads/Qwen2.5-Coder-7B-Instruct \
    --local-dir-use-symlinks False
```
**Зачем:** на работе уже есть `qwen2.5-coder-7b/`, но возможно не Instruct версия. Скачать чистый Instruct для compare 7B vs 14B Coder.

### Итого
| Модель | Размер | Приоритет |
|---|---:|---|
| Qwen2.5-Coder-14B-Instruct | 28 GB | 🔴 P0 |
| Qwen3-14B (или Qwen2.5-14B-Instruct) | 28 GB | 🟡 P1 |
| Qwen2.5-Coder-7B-Instruct | 14 GB | 🟢 P2 |
| **МИНИМУМ для Phase B** | **28 GB** | — |
| **МАКСИМУМ для matrix experiments** | **~70 GB** | — |

---

## ⏱ Сколько по времени

| Скорость интернета | 28 GB | 70 GB |
|---|---|---|
| 10 Mbps | 6 ч | 16 ч |
| 50 Mbps | 1.3 ч | 3.5 ч |
| 100 Mbps | 40 мин | 1.7 ч |
| 1 Gbps | 4 мин | 10 мин |

**Качать частями** — `huggingface-cli` поддерживает resume через `--resume`.

---

## 💾 Передача в офис

### Вариант A: SSD
- Объём: до 100 GB
- Скорость передачи USB 3.0: ~150 MB/s → 70 GB за ~8 мин
- ✅ рекомендую

### Вариант B: Флешка (если 70 GB не нужно, только 28 GB основной)
- USB 3.0 32-64 GB

### Вариант C: rsync через сеть (если есть VPN/доступ)
- Скорость зависит от сети
- ✅ не нужно физически носить

---

## 🎯 Что делать в офисе после привоза

```bash
# 1. Скопировать модели в правильное место
mv ~/Downloads/Qwen2.5-Coder-14B-Instruct \
   /home/alex/offline-debian-pack/1_models/Qwen2.5-Coder-14B-Instruct

# 2. Симлинк в finetune-env для удобства
ln -sfn /home/alex/offline-debian-pack/1_models/Qwen2.5-Coder-14B-Instruct \
        /home/alex/finetune-env/Qwen2.5-Coder-14B-Instruct

# 3. (если нужно) HF cache stub чтобы transformers нашёл через "Qwen/Qwen2.5-Coder-14B-Instruct"
#    Аналогично как мы делали для bge-m3 (commit hash → snapshots/main)

# 4. Smoke train (после установки bnb-rocm)
cd /home/alex/finetune-env && source .venv/bin/activate
./run_smoke_9070_max.sh   # MODEL=/home/alex/.../Qwen2.5-Coder-14B-Instruct

# 5. Full Phase B (на лучшей smoke модели)
./run_full_qwen3_r16_9070.sh
```

---

## ✅ DoD (Definition of Done)

- [ ] Qwen2.5-Coder-14B-Instruct (28 GB) скачана дома
- [ ] (опц.) Qwen3-14B или Qwen2.5-14B-Instruct (28 GB)
- [ ] (опц.) Qwen2.5-Coder-7B-Instruct (14 GB)
- [ ] Принесено в офис (SSD/флешка/rsync)
- [ ] Распаковано в `/home/alex/offline-debian-pack/1_models/`
- [ ] Verify: `ls /home/alex/offline-debian-pack/1_models/Qwen2.5-Coder-14B-Instruct/model.safetensors.index.json` существует

---

## 🚫 НЕ скачивать (исключено из плана)

| Модель | Почему НЕ |
|---|---|
| Qwen3-32B | 64 GB safetensors, не помещается для fine-tune (только inference, уже есть на сервере GGUF) |
| Qwen3-72B | 144 GB, всё то же |
| Qwen2.5-72B | 144 GB, всё то же |
| Любые GGUF | не подходят для обучения через transformers |

Большие модели **уже работают** через Ollama на сервере 10.10.4.105:11434 (`qwen3:32b`, `qwen3.6:35b`) — этого достаточно для inference compare baseline.

---

## 📞 Связь с Кодо

Если возникнут вопросы при скачивании:
- HF authentication errors → нужно `huggingface-cli login` с токеном (бесплатный на huggingface.co)
- Rate limits → ждать или использовать `--resume`
- Disk full → освободить место (28 GB → ~50 GB запаса нужно)

---

*TASK создан: Кодо · 2026-05-14 утро · к выполнению дома (сестра / Alex)*
