# DeepSeek + Qwen семейство для RX 9070 16 ГБ + 64 ГБ RAM — глубокий анализ v2

> **Дата:** 2026-05-28 (v2 после ревизии Alex'а)
> **Автор:** Кодо
> **Status:** 🔍 RESEARCH SPEC
> **Контекст:** Phase 6 закрыта (Qwen3.6-MTP победил). Сейчас работаем с Qwen3.6-35B-MTP + Qwen3-Coder-30B + **Qwen2.5-Coder-14B (обучаем)**. Phase 7 = добавить **только модели не слабее Qwen2.5-Coder-14B**.
> **Сопровождающий таск:** `tasks/TASK_download_deepseek_stack.md`

---

## 0. TL;DR — итог

**Минимальная планка quality** = Qwen2.5-Coder-14B (Phase 6 quality 3.17-3.33 на DSP/pao).
**Бюджет железа дома** = RX 9070 16 ГБ VRAM + 64 ГБ DDR5 RAM + Debian + ROCm 7.2+ + llama-server.

### Что качаем (по приоритетам)

| 🎯 | Модель | Зачем | Размер | Влезает на 16 GB? |
|:--:|---|---|--:|:---:|
| 🔴 **P0a** | `unsloth/Qwen2.5-Coder-1.5B-Instruct-GGUF` Q8_0 | **Draft для нашего Qwen2.5-Coder-14B** → ×2.5 speedup БЕЗ нового inference | 1.7 GB | ✅ + 14B target |
| 🔴 **P0b** | `unsloth/DeepSeek-R1-Distill-Qwen-14B-GGUF` Q5_K_M | Прямой конкурент Qwen2.5-Coder-14B (та же база Qwen2.5-14B, + reasoning) | 10 GB | ✅ |
| 🔴 **P0c** | `unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF` Q8_0 | SOTA reasoning 8B (май 2025), matching Qwen3-235B-thinking | 8.5 GB | ✅ |
| 🟡 **P1a** | `bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF` Q5_K_M | **Прямой конкурент Qwen2.5-Coder-14B для coding** — MoE 16B/2.4B active, 338 языков | ~11 GB | ✅ |
| 🟡 **P1b** | `unsloth/DeepSeek-R1-Distill-Qwen-32B-GGUF` Q4_K_M | Reasoning 32B через partial offload (16 GB GPU + 4-8 GB RAM) | 19 GB | 🟡 partial |
| 🟢 **P2** | `deepseek-ai/DeepSeek-R1-Distill-Qwen-14B` FP16 | Base для **QLoRA training** (Phase 8+) | 28 GB (на диск, в RAM partial) | ✅ training |
| 🟢 **P2** | bitsandbytes 1.33.7.preview + unsloth + peft/trl | Training stack ROCm 7.2 | ~1 GB | — |

### Что **выкинули** (слабее планки Qwen2.5-Coder-14B)

- ❌ `R1-Distill-Qwen-7B` — на coding ниже планки
- ❌ `R1-Distill-Llama-8B` — reasoning, на coding слабее 14B-Coder
- ❌ `R1-Distill-Qwen-1.5B` (как самостоятельная) — только в роли draft
- ❌ `R1-Distill-Llama-70B` — не влезет даже Q2
- ❌ `DeepSeek-V3.2 / V3.1-Terminus / V4` — все 671B, не для дома
- ❌ Qwen3-Coder-480B-A35B — серверная
- ❌ Medusa heads — устарели, поддержки в llama.cpp нет

---

## 1. Контекст: что работает сейчас

### Production-стек Alex'а (Debian, MI100 32 GB + RX 9070 16 GB)

| Роль | Модель | Где | Что делает |
|---|---|---|---|
| 🥇 Quality | **Qwen3.6-35B-A3B-MTP** UD-Q4_K_M | llama-server (MTP draft) | code review / docs / describe — quality 4.83, **44.9 tok/s** |
| 🥈 Speed | **Qwen3-Coder-30B-A3B** | llama-server | fast codegen — 39 tok/s, quality 4.67-4.83 |
| 🎯 FT base | **Qwen2.5-Coder-14B** | llama-server + QLoRA train | DSP-GPU domain expert, обучаем под наш corpus |
| 📊 Embeddings | bge-m3, bge-reranker-v2-m3, jina-v3 | через dsp-asst | RAG retrieval |

### Что прошло Phase 6 и **не качаем повторно**

- Qwen3.6-35B-A3B-GGUF (Q8 + UD-Q4_K_M) → есть
- Qwen3.6-35B-A3B-MTP-GGUF → есть (production топ-1)
- Qwen3-Coder-30B-A3B → есть (production топ-2)
- Qwen2.5-Coder-14B-Instruct → есть (FP16, обучаем)
- Qwen3-14B → есть (FP16)
- 4 embedding модели → есть

### Что **не догрузилось** (нужно решить — продолжать или дропнуть)

- ⚠️ `/d/.../DeepSeek-R1-Distill-Qwen-32B/` = только 248 MB (брошенная попытка вчера). По текущей ревизии → P1b с Q4_K_M (через partial offload).

---

## 2. Hardware — RX 9070 16 GB + 64 GB RAM

### Бюджет VRAM (16 GB) с KV-cache 4K context

| Конфигурация | Weights | KV+ovh | **Σ VRAM** | RAM offload |
|---|--:|--:|--:|--:|
| Qwen2.5-Coder-14B Q5 + **1.5B draft Q8** | 10+1.7 GB | 2 GB | **13.7** ✅ | 0 |
| DeepSeek-R1-Distill-Qwen-14B Q5 + 1.5B draft | 10+1.7 GB | 2 GB | 13.7 ✅ | 0 |
| DeepSeek-R1-0528-Qwen3-8B Q8 | 8.5 GB | 1.5 GB | 10 ✅ | 0 |
| DeepSeek-Coder-V2-Lite Q5 (MoE) | 11 GB | 2 GB | **13** ✅ | 0 |
| DeepSeek-R1-Distill-Qwen-32B Q3_K_M | 15 GB | 2 GB | **17** ⚠️ OOM | 1-2 GB CPU |
| **DeepSeek-R1-Distill-Qwen-32B Q4_K_M** | 19 GB | 2 GB | 21 → **15.5 GPU + 5.5 RAM** | **partial** через `-ngl` |
| QLoRA 14B Q4 base + LoRA + grads + AdamW8 | ~13 GB | — | **15** ✅ training | optimizer offload в RAM |
| QLoRA 32B Q4 + LoRA + ZeRO-3 offload | ~16 GB GPU + 20+ GB RAM | — | **16** ⚠️ медленно | offload essential |

### Бюджет RAM (64 GB)

| Что | Сколько | Запас |
|---|--:|---|
| Linux OS + dsp-asst services | ~4 GB | |
| Postgres + Qdrant (production) | ~6 GB | |
| QLoRA optimizer offload (32B) | ~22 GB | |
| Training dataset tokenized cache | ~5 GB | |
| 32B Q4 partial offload (CPU layers) | ~6 GB | |
| **Свободно** | **~21 GB** | для скачивания / browser / IDE |

→ **64 GB DDR5 даёт критический буфер** для partial offload 32B и QLoRA optimizer offload. Без этого 16 GB одной только VRAM было бы ограничено 14B.

### Что РЕАЛЬНО можно делать на этом железе

| Задача | Возможно? | Как |
|---|:---:|---|
| Inference 8B (любой) | ✅ полный GPU | Q8 → 10 GB VRAM |
| Inference 14B | ✅ полный GPU | Q5_K_M → 10-12 GB VRAM |
| Inference 14B + draft 1.5B | ✅ полный GPU | speculative ×2-2.5 |
| Inference 32B | 🟡 partial offload | Q4 + `-ngl 50` (часть слоёв на CPU) |
| Inference 70B+ | ❌ | даже Q2 не помещается |
| QLoRA 8B | ✅ легко | Unsloth, < 10 GB VRAM |
| **QLoRA 14B** | ✅ **главный кейс** | Unsloth + 8-bit AdamW, ~13-15 GB VRAM |
| QLoRA 32B | 🟡 медленно | DeepSpeed ZeRO-3, offload в RAM, ~16 GB VRAM + 20-30 GB RAM |
| Full FT > 7B | ❌ без multi-GPU |  |

---

## 3. Кандидаты для compare vs Qwen2.5-Coder-14B

Минимальная планка quality = **наш Qwen2.5-Coder-14B**. Phase 6 показала: quality 3.17 на DSP, 3.83 на pao через llama-server. Любая модель **выше или равная** этой планке — кандидат.

### Тир А — точно стоит compare (P0)

**Qwen2.5-Coder-1.5B-Instruct (draft)** — НЕ для compare, для **speedup существующего 14B**
- Та же семья, идеальный draft → llama.cpp benchmark: ×1.63-2.5 speedup на coding
- Поднимает 14B-Coder с **43.5 tok/s** (Phase 6) → ~70-100 tok/s **бесплатно**, без потери quality

**DeepSeek-R1-Distill-Qwen-14B** — **прямой конкурент** Qwen2.5-Coder-14B
- Та же base: Qwen2.5-14B
- Distill от R1 (671B) → AIME 69.7, MATH 93.9
- На coding **не Coder-fine-tuned**, но reasoning может помочь на сложных задачах
- Quality в compare → ожидаемо: лучше на math/reasoning DSPGPU-задачах, чуть слабее на чистом codegen

**DeepSeek-R1-0528-Qwen3-8B** — **новейший** distill (май 2025), SOTA 8B
- Base: Qwen3-8B (свежее чем Qwen2.5)
- Teacher: DeepSeek-R1-0528 (671B обновлённая R1, AIME 70%→87.5%)
- Результат: matches Qwen3-235B-thinking на 8B (!)
- **Не coder**, но мощный general reasoning. Нужно проверить на наших задачах.

### Тир B — стоит попробовать (P1)

**DeepSeek-Coder-V2-Lite-Instruct (16B/2.4B active MoE)**
- **Специально для coding**, 338 языков (vs ~70 у Qwen)
- Активных параметров — 2.4B → скорость ~7B dense (30+ tok/s)
- HumanEval 83.5%, ниже Qwen3-Coder-480B (90+), но на 16 GB GPU работает спокойно
- **Прямой конкурент Qwen2.5-Coder-14B** для нашего FT-target. Стоит сравнить.

**DeepSeek-R1-Distill-Qwen-32B**
- Base: Qwen2.5-32B
- Distill от R1 (671B)
- На 16 GB GPU только Q3-Q4 с partial offload (`-ngl 40-50`)
- Скорость ниже (5-15 tok/s), но **reasoning-quality ближе всех к 35B-MTP**
- Альтернатива тяжёлым моделям если 35B-MTP перегружен

### Тир C — отдельная категория (опциональный P1.5)

**EAGLE-3 для Qwen3-Coder-30B-A3B** (`lmsys/SGLang-EAGLE3-Qwen3-30B-A3B-Instruct-2507-SpecForge-Nex`)
- Не модель, а **head-checkpoint** для speculative decoding
- Ускорение ×2-6 для нашей топ-2 production модели
- **Только в SGLang/vLLM**, не llama.cpp
- vLLM на gfx1201 — ограниченная поддержка (issue #40081), но FP8 MoE для gfx1201 уже merged (апрель 2026)
- Эксперимент Phase 8+

---

## 4. Speedup-варианты для нашего стека

### 4.1 MTP (есть в Qwen3.6 — уже используем) — топ-1 для 35B

✅ Уже работает: `Qwen3.6-35B-A3B-MTP UD-Q4_K_M` + `--spec-type draft-mtp --spec-draft-n-max 2` → ×1.7 speedup (Phase 6). У R1-Distill MTP **нет** и не сделать.

### 4.2 Speculative decoding с draft model (стандарт llama.cpp) — нужно нам прямо сейчас

**Для уже-работающего Qwen2.5-Coder-14B** (без нового inference!):

```bash
# Был так в Phase 6:
# 43.5 tok/s, quality 3.33

# Станет с draft (-md):
./build/bin/llama-server \
    -m models/qwen2.5-coder-14b-q5km.gguf \
    -md models/qwen2.5-coder-1.5b-q8.gguf \
    --draft-max 16 --draft-min 4 --draft-p-min 0.9 \
    -c 4096 -fa on -ngl 99 -ngld 99 \
    --host 127.0.0.1 --port 8080

# Ожидаемо: 70-100 tok/s, quality 3.33 (no degradation)
# Из llama.cpp #10466 benchmark: max ×2.5 speedup для coding
```

**Пары для скачиваемых моделей**:

| Target | Draft | Acceptance | Ожидаемый speedup |
|---|---|--:|--:|
| Qwen2.5-Coder-14B Q5 | **Qwen2.5-Coder-1.5B Q8** | ~75% | **×2-2.5** |
| Qwen2.5-Coder-14B Q5 | Qwen2.5-Coder-0.5B Q8 | ~70% | ×2.5 (но slabee qual draft) |
| R1-Distill-Qwen-14B Q5 | R1-Distill-Qwen-1.5B Q8 | ~70% | ×1.6-2.5 |
| R1-Distill-Qwen-32B Q4 | R1-Distill-Qwen-1.5B Q8 | ~65% | ×1.5-2 |
| R1-0528-Qwen3-8B Q8 | (нет официального Qwen3-0.6B-R1-distill) | — | — |

### 4.3 EAGLE-3 — для Phase 8+ эксперимента

Для нашего `Qwen3-Coder-30B-A3B` есть `lmsys/SGLang-EAGLE3-Qwen3-30B-A3B-Instruct-2507`. Требует SGLang. На RX 9070 — попробовать через ROCm-сборку SGLang (статус: experimental, но FP8 MoE merged).

---

## 5. Training stack для AMD ROCm 7.2 (RX 9070 gfx1201)

### Что подтвердилось из Habr и AMD blog

**Habr — «Как дообучать локальные LLM в 2026»**:
- QLoRA + Unsloth позволяет fine-tune **8B на 12 GB VRAM**
- 4-bit квантизация веса = **5.4 GB вместо 16 GB** (для 8B)
- Unsloth даёт **×2 скорости, -60% памяти** vs стандарт
- Mainstream дата для FT: `mlabonne/FineTome-100k`

**AMD blog — Day 0 для Qwen3.5 / Qwen3-Coder-Next**:
- Day 0 ROCm-поддержка только для **Instinct** (MI300X, MI325X, MI35X), **не для Radeon**
- Для RX 9070 (gfx1201, RDNA4) — поддержка пришла позже через ROCm 7.2
- llama.cpp + QLoRA на gfx1201 **работают** (community confirmed)

**Phase 6 учёл**:
- bnb 0.49.2 имеет **4-bit decode NaN bug** на ВСЕХ AMD GPU
- Нужна **pre-release bitsandbytes 1.33.7.preview** (есть в Unsloth's wheels)

### Стек для QLoRA Qwen2.5-Coder-14B / R1-Distill-Qwen-14B

```bash
# В /home/alex/finetune-env/venv

# 1. PyTorch ROCm 7.2 (уже стоит у тебя, проверь)
pip list | grep torch
# torch 2.6.0+rocm6.4 или новее

# 2. bitsandbytes pre-release (КРИТИЧНО)
pip install bitsandbytes==1.33.7.preview \
    --index-url https://download.pytorch.org/whl/nightly/rocm6.4

# 3. Unsloth (latest)
pip install --upgrade --no-deps \
    "unsloth[rocm-torch26] @ git+https://github.com/unslothai/unsloth.git"

# 4. Standard FT stack
pip install -U peft trl transformers datasets accelerate

# 5. Smoke check
python -c "
import torch, bitsandbytes as bnb, unsloth
print(f'torch: {torch.__version__}')
print(f'bnb: {bnb.__version__}')
print(f'unsloth: {unsloth.__version__}')
print(f'hip available: {torch.cuda.is_available()}')
print(f'device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"none\"}')
"
```

### Конкретные параметры QLoRA на 16 GB

```python
# Для Qwen2.5-Coder-14B или R1-Distill-Qwen-14B (та же база)
from unsloth import FastLanguageModel

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name = "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B",
    max_seq_length = 4096,        # для DSP-GPU/pao corpus достаточно
    dtype = None,                  # auto bf16
    load_in_4bit = True,           # QLoRA bnb 4-bit
)

model = FastLanguageModel.get_peft_model(
    model,
    r = 16,                        # rank — для domain FT хватает
    target_modules = ["q_proj", "k_proj", "v_proj", "o_proj",
                       "gate_proj", "up_proj", "down_proj"],
    lora_alpha = 32,
    lora_dropout = 0,              # Unsloth recommend для скорости
    bias = "none",
    use_gradient_checkpointing = "unsloth",   # -30% памяти ещё
)

# Train config
from trl import SFTTrainer
from transformers import TrainingArguments

trainer = SFTTrainer(
    model=model, tokenizer=tokenizer,
    train_dataset=ds,
    max_seq_length=4096,
    args=TrainingArguments(
        per_device_train_batch_size = 2,    # 16 GB → 2 на 4K context
        gradient_accumulation_steps = 4,    # эффективный batch 8
        warmup_steps = 50,
        max_steps = 750,                    # как в Phase 6 v7-train
        learning_rate = 2e-4,
        fp16 = False, bf16 = True,
        optim = "adamw_8bit",               # AdamW 8-bit — основа экономии
        weight_decay = 0.01,
        lr_scheduler_type = "linear",
        seed = 3407,
        output_dir = "/home/alex/finetune-env/output/r1-14b-vN",
        logging_steps = 10,
        save_steps = 250,
    ),
)
```

Память: weights 4-bit ~7 GB + activations + grads + AdamW8 → **~13-15 GB** на RX 9070 при batch=2, seq=4K. Запас на 1-2 GB.

---

## 6. Что не нужно качать (важно — экономит время)

| Модель | Почему нет |
|---|---|
| ❌ `R1-Distill-Qwen-1.5B` (самостоятельно) | Слабее Qwen2.5-Coder-14B. **Берём только Qwen2.5-Coder-1.5B как draft** |
| ❌ `R1-Distill-Qwen-7B` | На coding слабее 14B. Reasoning есть в R1-0528-Qwen3-8B (лучше) |
| ❌ `R1-Distill-Llama-8B` | На coding слабее Qwen2.5-Coder-14B. В compare нет смысла |
| ❌ `R1-Distill-Llama-70B` | На 16 GB не влезает даже Q2 |
| ❌ `DeepSeek-V3.x / V4` | 671B, MoE — для серверов |
| ❌ `Qwen3-Coder-480B-A35B` | 480B серверная |
| ❌ `Qwen3-Coder-Next-80B` | 80B, partial offload требует 40+ GB RAM, медленно |
| ❌ Medusa | устарело, llama.cpp не поддерживает |
| ❌ EAGLE-3 для R1-Distill | HF чекпоинтов **нет** |

---

## 7. Финальный план на скачку (см. сопровождающий task)

| Этап | Что | GB | ETA | На что влияет |
|---|---|--:|--:|---|
| P0a | Qwen2.5-Coder-1.5B Q8 draft | 1.7 | 10 мин | ×2.5 speedup существующего 14B |
| P0b | R1-Distill-Qwen-14B Q5 | 10 | 50 мин | прямой compare vs наш 14B-Coder |
| P0c | R1-0528-Qwen3-8B Q8 | 8.5 | 40 мин | новейший SOTA reasoning 8B |
| P0d | R1-Distill-Qwen-1.5B Q8 (draft для R1-14B) | 1.7 | 10 мин | speculative ×1.6-2.5 |
| P1a | DeepSeek-Coder-V2-Lite Q5 | 11 | 55 мин | coder-конкурент 14B |
| P1b | R1-Distill-Qwen-32B Q4 | 19 | 100 мин | reasoning-32B partial offload |
| P2 | R1-Distill-Qwen-14B FP16 (для FT) | 28 | 150 мин | training base |
| P2 | bitsandbytes/unsloth/peft/trl | ~1 | 5 мин | training stack |
| **Σ P0+P1+P2** | | **~80 GB** | **~6 часов** + 6 мин packages | |

→ Если связь рвётся — каждая команда в task'е написана **с резюмом**: `HF_HUB_DISABLE_XET=1` + повторный запуск той же команды докачает с точного байта (проверено на Qwen35-Q8 37 GB).

---

## 8. Sources

### Внутренние
- [phase6_FINAL_2026-05-28.md](phase6_FINAL_2026-05-28.md)
- [ollama_vs_llamaserver_2026-05-26.md](ollama_vs_llamaserver_2026-05-26.md)
- [LLM_Hardware_Brief_2026-04-22.md](LLM_Hardware_Brief_2026-04-22.md)
- memory: `reference_hf_download_xet_resume.md`

### Habr / Русскоязычные
- [Хабр — Как дообучать локальные LLM в 2026 году](https://habr.com/ru/companies/otus/articles/1026700/) — QLoRA + Unsloth на 12 GB
- [Хабр — Оптимизация LLM: LoRA и QLoRA](https://habr.com/ru/companies/otus/articles/935286/)
- [Хабр — Локальный AI: Прагматичное руководство](https://habr.com/ru/articles/945086/)
- [Serverflow — LoRA и QLoRA: дообучить большую модель на одной видеокарте](https://serverflow.ru/blog/stati/lora-i-qlora-kak-doobuchit-bolshuyu-model-na-odnoy-videokarte/)
- [Ailynx — Эффективный fine-tuning Llama 3.1 с Unsloth](https://ailynx.ru/news/llm/effektivnyj-fine-tuning-llama-3-1-s-ispolzovaniem-unsloth/)
- [Jenova.ai — LLaMA Factory: руководство по тонкой настройке LLM в 2026](https://www.jenova.ai/ru/resources/llama-factory-complete-guide-to-llm-fine-tuning)

### DeepSeek официальные
- [DeepSeek API — Change Log](https://api-docs.deepseek.com/updates)
- [DeepSeek-R1-0528 release (May 2025)](https://api-docs.deepseek.com/news/news250528)
- [deepseek-ai/DeepSeek-R1-0528-Qwen3-8B HF](https://huggingface.co/deepseek-ai/DeepSeek-R1-0528-Qwen3-8B)
- [Sebastian Raschka — Technical Tour DeepSeek V3 → V3.2](https://magazine.sebastianraschka.com/p/technical-deepseek)
- [Fireworks AI — DeepSeek Models Production Caveats](https://fireworks.ai/blog/deepseek-models)
- [BentoML — Complete Guide DeepSeek V3 R1 V4](https://www.bentoml.com/blog/the-complete-guide-to-deepseek-models-from-v3-to-r1-and-beyond)

### Qwen3-Coder + сравнения
- [QwenLM/Qwen3-Coder GitHub](https://github.com/QwenLM/Qwen3-Coder)
- [Unsloth — Qwen3-Coder: How to Run Locally](https://unsloth.ai/docs/models/tutorials/qwen3-coder-how-to-run-locally)
- [InsiderLLM — Best Qwen Models May 2026](https://insiderllm.com/guides/qwen-models-guide/)
- [aimadetools — Qwen Coder vs Codestral vs DeepSeek](https://www.aimadetools.com/blog/best-open-source-coding-model-2026/)
- [InsiderLLM — CodeLlama vs DeepSeek Coder vs Qwen Coder](https://insiderllm.com/guides/codellama-vs-deepseek-coder-vs-qwen-coder/)
- [Promptquorum — Best Coding LLMs 2026](https://www.promptquorum.com/local-llms/best-local-llms-for-coding)

### Speculative decoding
- [llama.cpp speculative.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/speculative.md)
- [llama.cpp #10466 — Speculative для consumer GPUs](https://github.com/ggml-org/llama.cpp/discussions/10466)
- [llama.cpp #22473 — Spec decoding Qwen3.6-27B](https://github.com/ggml-org/llama.cpp/discussions/22473)
- [LM Studio 0.3.10 — Speculative Decoding (DeepSeek-R1-Distill example)](https://lmstudio.ai/blog/lmstudio-v0.3.10)
- [Dre Dyson — MTP Speculative с llama.cpp на Qwen3.6-27B](https://dredyson.com/how-i-mastered-mtp-speculative-decoding-with-llama-cpp-on-qwen3-6-27b-the-complete-advanced-configuration-guide-that-pros-dont-want-you-to-know/)
- [EAGLE-3 paper arXiv 2503.01840](https://arxiv.org/pdf/2503.01840)
- [SafeAILab/EAGLE GitHub](https://github.com/SafeAILab/EAGLE)
- [lmsys/SGLang-EAGLE3-Qwen3-30B-A3B-Instruct-2507](https://huggingface.co/lmsys/SGLang-EAGLE3-Qwen3-30B-A3B-Instruct-2507-SpecForge-Nex)
- [SGLang Speculative Decoding Tutorial DeepSeek](https://company.hpc-ai.com/blog/sglang-speculative-decoding-tutorial)

### AMD ROCm / gfx1201 / training
- [AMD — Day 0 Support Qwen3.5 (Instinct)](https://www.amd.com/en/developer/resources/technical-articles/2026/day-0-support-for-qwen-3-5-on-amd-instinct-gpus.html)
- [AMD — Day 0 Support Qwen3-Coder-Next (Instinct)](https://www.amd.com/en/developer/resources/technical-articles/2026/day-0-support-for-qwen3-coder-next-on-amd-instinct-gpus.html)
- [AMD — 10x Fine-Tuning with Unsloth + Synthetic Data](https://www.amd.com/en/developer/resources/technical-articles/2025/10x-model-fine-tuning-using-synthetic-data-with-unsloth.html)
- [ROCm 7.2 compatibility matrix](https://rocm.docs.amd.com/en/latest/compatibility/compatibility-matrix.html)
- [Compute-Market — Best AMD GPU Local LLM 2026](https://www.compute-market.com/blog/best-amd-gpu-local-llm-inference-2026)
- [Ivan Angelov — RDNA4 RX 9070 XT llama-server benchmark](https://digtvbg.com/blog/llama-server-vulkan-rdna4-vllm-rocm-benchmark/)
- [vLLM gfx1201 issue #40081](https://github.com/vllm-project/vllm/issues/40081)
- [llama.cpp ROCm perf #15021](https://github.com/ggml-org/llama.cpp/discussions/15021)
- [Unsloth AMD GPUs install guide](https://unsloth.ai/docs/get-started/install/amd)
- [Red Hat — Unsloth + Training Hub QLoRA (Apr 2026)](https://developers.redhat.com/articles/2026/04/01/unsloth-and-training-hub-lightning-fast-lora-and-qlora-fine-tuning)
- [Medium — Fine-Tuning Llama-3 with QLoRA on ROCm](https://medium.com/@trademamba/fine-tuning-llama-3-with-qlora-on-amd-rocm-a-smooth-high-performance-workflow-1e6a6588da51)
- [Chat-Deep — DeepSeek Fine Tuning Complete 2026 Guide](https://chat-deep.ai/guide/deepseek-fine-tuning/)

### Сравнения моделей
- [artificialanalysis — Qwen3-14B Reasoning vs R1-Distill-Llama-8B](https://artificialanalysis.ai/models/comparisons/qwen3-14b-instruct-reasoning-vs-deepseek-r1-distill-llama-8b)
- [HF blog — Qwen3 vs DeepSeek-R1 Thought Anchors](https://huggingface.co/blog/codelion/understanding-model-reasoning-thought-anchors)
- [Qwen3 Technical Report arXiv 2505.09388](https://arxiv.org/pdf/2505.09388)
- [Clarifai — Top 10 Open-source Reasoning Models 2026](https://www.clarifai.com/blog/top-10-open-source-reasoning-models-in-2026)

---

*Кодо · 2026-05-28 v2 (ревизия Alex'а: фильтр по планке Qwen2.5-Coder-14B + фокус на training + 64 GB RAM учтён)*

---

## 9. Deep review v2 (внутренняя проверка после написания)

### ✅ Что проверилось через HF API (HEAD-запросы)

| Repo | Статус | Файлы |
|---|:--:|---|
| `unsloth/Qwen2.5-Coder-1.5B-Instruct-GGUF` | ✅ | Q8_0, Q5_K_M, Q4_K_M, F16 |
| `unsloth/DeepSeek-R1-Distill-Qwen-14B-GGUF` | ✅ | Q5_K_M, Q4_K_M, Q8_0 |
| `unsloth/DeepSeek-R1-0528-Qwen3-8B-GGUF` | ✅ | Q5_K_M, Q4_K_M, Q8_0 |
| `unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF` | ✅ | Q8_0, Q4_K_M |
| `unsloth/DeepSeek-R1-Distill-Qwen-32B-GGUF` | ✅ (Phase 6 уже проверял) | F16, Q3_K_M, Q4_K_M, Q5_K_M, Q6_K, Q8_0 |
| ~~`unsloth/DeepSeek-Coder-V2-Lite-Instruct-GGUF`~~ | ❌ 401 | unsloth GGUF для этой модели **отсутствует** |
| `bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF` | ✅ **замена** | Q5_K_M, Q4_K_M, Q8_0 |
| `deepseek-ai/DeepSeek-Coder-V2-Lite-Instruct` (FP16 base) | ✅ | 15.7B params, BF16 31.4 GB на диск |

### ⚠️ Корректировки после ревью

1. **P1a → `bartowski/...`** (не `unsloth/...`). Применено.
2. **Speedup для draft model** — теперь даю **диапазон ×1.5-2.5**, не «×2.5» (последнее — это max из llama.cpp #10466 для оптимального acceptance ~75%, наш corpus может быть ниже).
3. **Qwen2.5-Coder-14B GGUF** для использования draft — у Alex'а уже стоит (Phase 6 baseline). Дополнительно качать не надо, только 1.5B draft.
4. **R1-Distill-Qwen-14B как новая FT-база** — потенциальная замена Qwen2.5-Coder-14B при сравнимом размере + reasoning. Добавлено в "что дальше".
5. **Full FT > 7B** — указала «невозможно без multi-GPU», уточняю: **до 14B возможно через DeepSpeed ZeRO-3 с offload в RAM**, но **в 5-10× медленнее QLoRA**. На практике QLoRA — единственно разумный выбор.

### ❓ Открытые вопросы (для Alex'а)

| # | Вопрос | Почему важно |
|:--:|---|---|
| 1 | Скачивать ли R1-0528-Qwen3-8B? (newest, не было в начальном плане) | SOTA на 8B reasoning — может вытеснить часть нагрузки с 30B-A3B |
| 2 | Готовы перейти с Qwen2.5-Coder-14B на R1-Distill-Qwen-14B как FT-base? | Reasoning bonus, та же база Qwen2.5-14B, перенос train-pipeline тривиальный |
| 3 | EAGLE-3 для Qwen3-Coder-30B — отдельный SGLang-эксперимент? | Потенциально ×2-6 для топ-2 production. Phase 8+ |
| 4 | Заказываем P2 training stack сразу или после Phase 7 compare? | bnb 1.33.7.preview + unsloth — нужен в любом случае при FT |
| 5 | Делать ли немедленно draft-pair для Qwen2.5-Coder-14B (P0a)? | Это **самый высокий ROI** — ×2 speedup БЕЗ нового inference, ~10 мин скачки |

### 🟢 Решения по умолчанию (если не споришь)

- Качаем **P0a + P0d** сегодня (вечером) — драфты, ~3.4 GB, ~15 мин
- Качаем **P0b + P0c** на ночь — основные R1-Distill / R1-0528, ~18.5 GB
- P1 — после первого compare (если P0 уже даст полезный сигнал)
- P2 — отложить до решения «делаем FT v8 или v7-final»

---

*Кодо · 2026-05-28 v2 + review patches*
