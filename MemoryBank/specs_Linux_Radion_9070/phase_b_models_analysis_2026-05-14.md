# 🔬 Phase B Fine-tune — анализ моделей (приоритет КАЧЕСТВО)

> **Дата:** 2026-05-14
> **Цель:** matrix experiments — fine-tune нескольких моделей до 14B на RX 9070 + сравнить качество.
> **Контекст:** dataset_v4 (5071 train / 814 val), Smoke 2080 Ti прошёл (loss 2.51→1.49).
> **Принцип:** **только HF оригиналы fp16/bf16**, никакой GGUF→safetensors конвертации (lossy).
> **Maintainer:** Кодо

---

## 🎯 Жёсткое ограничение VRAM (RX 9070 = 16 GB)

После 4bit квантизации (через bitsandbytes) + LoRA r=16 + activations + gradient_checkpointing:

| Модель (dense) | После 4bit | + LoRA + acts | TOTAL | На 16 GB 9070? |
|---|---:|---:|---:|---|
| **7B / 8B** | 4-5 GB | +4-5 GB | **8-10 GB** | ✅ много запаса |
| **13B / 14B** | 7-8 GB | +5-6 GB | **13-14 GB** | ⚠️ впритык, обязательно grad_ckpt |
| 27B / 32B / 35B | 16-21 GB | +5-8 GB | 22-29 GB | ❌ **физически нет** |

**Жёсткий потолок для fine-tune на 9070: 14B max.**

Большие модели (27B/32B/35B) **остаются как inference baseline** через Ollama (Continue chat, dsp-asst) — для **сравнения** с fine-tuned 7B/14B.

---

## 📦 Текущее состояние моделей

### Workstation (Debian + RX 9070) — локально, HF safetensors
- `qwen3-8b/` — **16 GB** ✅ general 8B (baseline)
- `qwen2.5-coder-7b/` — **15 GB** ✅ Coder 7B

### Сервер 10.10.4.105 (только Ollama GGUF — для inference, не для fine-tune)
- qwen2.5-coder:14b (9 GB Q4_K_M)
- qwen3:32b (20 GB Q4_K_M)
- qwen3.6:27b, qwen3.6:35b, qwen3.6:35b-a3b-q8_0 (Ollama-only)
- nomic-embed-text (embeddings)

⚠️ **GGUF → HF safetensors конвертация исключена** из плана — двойная потеря качества (4-bit decompression + fine-tune на degraded базе). Принцип «КАЧЕСТВО».

---

## 📥 Что нужно скачать (дома, через интернет) — приоритет КАЧЕСТВО

### Главное для Phase B: Qwen2.5-Coder-14B-Instruct
```bash
huggingface-cli download Qwen/Qwen2.5-Coder-14B-Instruct \
    --local-dir ~/Downloads/Qwen2.5-Coder-14B-Instruct \
    --local-dir-use-symlinks False
```
- **~28 GB** HF safetensors fp16
- Coder-специализированная модель (C++/HIP/Python)
- 14B размер — впритык влезает в 16 GB VRAM 9070 с 4bit + LoRA

### Для compare matrix (рекомендую тоже скачать)

```bash
# 1. General 14B (для сравнения coder vs general)
huggingface-cli download Qwen/Qwen3-14B \
    --local-dir ~/Downloads/Qwen3-14B \
    --local-dir-use-symlinks False
# (если Qwen3-14B нет на HF — берём Qwen/Qwen2.5-14B-Instruct)

# 2. Coder 7B Instruct (если локальный Qwen2.5-Coder-7B без -Instruct)
huggingface-cli download Qwen/Qwen2.5-Coder-7B-Instruct \
    --local-dir ~/Downloads/Qwen2.5-Coder-7B-Instruct \
    --local-dir-use-symlinks False
```

| Модель | HF имя | Размер | Зачем |
|---|---|---:|---|
| **Qwen2.5-Coder-14B-Instruct** ⭐ | `Qwen/Qwen2.5-Coder-14B-Instruct` | ~28 GB | основная Phase B |
| **Qwen3-14B** (если есть на HF) | `Qwen/Qwen3-14B` | ~28 GB | compare general vs coder (14B) |
| **Qwen2.5-Coder-7B-Instruct** | `Qwen/Qwen2.5-Coder-7B-Instruct` | ~14 GB | compare 7B vs 14B coder |

**Итого скачать дома:** ~70 GB. Принести на флешке/SSD на работу.

### Python packages (через интернет на работе, малый трафик)
```bash
~/.local/bin/uv pip install --python /home/alex/finetune-env/.venv/bin/python \
    --extra-index-url https://download.pytorch.org/whl/rocm6.4 \
    bitsandbytes triton-rocm huggingface-hub
```
- bitsandbytes 0.49.2 (ROCm multi-backend) — 4bit quant
- triton-rocm 3.6.0 — torch JIT
- huggingface-hub — CLI

**~400 MB**, ~3 мин через интернет.

---

## 🧪 Matrix experiments (план обучения и сравнения)

| # | Модель | Параметры | ETA train | Цель |
|---|---|---|---:|---|
| 1 | Qwen2.5-Coder-7B (Local Instruct?) | bf16 + r=8 + max_seq=1024 | 4-6 ч | Baseline 7B Coder |
| 2 | Qwen3-8B | bf16 + r=16 + max_seq=1024 | 6-8 ч | Baseline general 8B (smoke 2080 Ti прецедент) |
| 3 | **Qwen2.5-Coder-14B-Instruct** ⭐ | bf16 + r=16 + max_seq=1024 + grad_ckpt | 8-12 ч | **Целевая Phase B** |
| 4 | Qwen3-14B (если есть на HF) | bf16 + r=16 + max_seq=1024 | 8-12 ч | Compare coder vs general 14B |

Smoke 350-500 пар × 1 эпоха для каждой = 15-25 мин × 4 = ~1.5 ч (предварительная валидация).
Full Phase B 5000 пар × 3 эпохи = 4-12 ч × 4 модели = **20-40 ч суммарно**.

Рекомендую начать с **smoke matrix** (4 модели × 15-25 мин), выбрать лучшую → full Phase B только на ней.

---

## 📊 Inference Compare Matrix (после fine-tune)

После каждого Phase B — `inference_compare.py` на 6 ключевых вопросах из `smoke_2080ti_2026-05-10_PASSED.md`:

| # | Тема | Base model | Fine-tuned 7B Coder | Fine-tuned 8B | Fine-tuned 14B Coder | Ollama 32B baseline |
|---|---|---|---|---|---|---|
| 1 | HybridBackend паттерн (Bridge) | ? | ? | ? | ? | ? |
| 2 | ScopedHipEvent (RAII) | ? | ? | ? | ? | ? |
| 3 | FFTProcessorROCm Python API | ? | ? | ? | ? | ? |
| 4 | IBackend impls (OpenCL/ROCm) | ? | ? | ? | ? | ? |
| 5 | beam_count edge values | ? | ? | ? | ? | ? |
| 6 | RochesterGPU (anti-hallucination) | ? | ? | ? | ? | ? |

**Метрики:** namespace правильный, паттерн правильный, code-example работающий, отсутствие галлюцинаций. Шкала 0/0.5/1.

---

## 🎯 Workflow Phase B (для исполнения)

```
ЭТАП 1 (Alex дома, ~1-2 ч):
  ├─ Скачать Qwen/Qwen2.5-Coder-14B-Instruct (28 GB)
  ├─ (опц.) Скачать Qwen/Qwen3-14B (28 GB)
  ├─ (опц.) Скачать Qwen/Qwen2.5-Coder-7B-Instruct (14 GB)
  └─ Принести на SSD/флешке на работу

ЭТАП 2 (на работе, ~5 мин):
  ├─ Установить bitsandbytes-rocm + triton-rocm + huggingface-hub (~400 MB)
  └─ Распаковать модели в /home/alex/offline-debian-pack/1_models/

ЭТАП 3 (smoke matrix, ~1.5 ч):
  ├─ Smoke train 4 моделей × 15-25 мин (350 пар × 1 эп)
  └─ Анализ loss curves → выбор лучшего кандидата

ЭТАП 4 (full Phase B, 8-12 ч):
  ├─ Запуск ночью на выбранной модели (rec: 14B Coder)
  ├─ 3 эпохи × 5071 пар × bf16 + r=16 + grad_ckpt
  └─ Сохранение LoRA adapter

ЭТАП 5 (inference compare, ~30 мин):
  ├─ Merge LoRA + base → Qwen-DSP merged model
  ├─ Ollama deploy: ollama create qwen-coder-14b-dsp -f Modelfile
  └─ Run inference_compare.py на 6 ключевых вопросах × N моделей
```

---

## ❗ Что НЕ делаем (исключено из плана)

- ❌ GGUF → HF safetensors конвертация (lossy, нарушает принцип «КАЧЕСТВО»)
- ❌ Fine-tune 27B/32B/35B (физически не помещается в 16 GB)
- ❌ CPU offload для 27B+ обучения (медленно в 10-50×)
- ❌ Скачивание моделей которые не помещаются в VRAM (бессмысленно)

---

## 📋 Связанные документы

- `TASK_FINETUNE_phase_B_models_download_2026-05-14.md` — таск со списком и командами
- `prompt_for_sister_phase_b_2026-05-14.md` — готовый промпт для сестры (домашняя машина)
- `run_smoke_9070_max.sh` — bash skрипт smoke train (готов, в `/home/alex/finetune-env/`)
- `phase_b_dataset_prep_2026-05-10.md` — train/val split
- `smoke_2080ti_2026-05-10_PASSED.md` — baseline smoke результаты

---

*Создал: Кодо · 2026-05-14 утро · по запросу Alex'а «глубокий анализ + приоритет КАЧЕСТВО»*
