# TASK FINETUNE Phase B — Radeon 9070 + ROCm full train (12.05.2026)

> **Обновлено 08.05** — после диагностики 3 экспериментов на 2080 Ti (Phase A + r=8 dirty + r=8 clean).
> Полный анализ → `MemoryBank/specs/LLM_and_RAG/finetune_diagnostic_2026-05-08.md`.

## 🔴 Главное изменение vs первой версии TASK

**❌ НЕ использовать `dataset_enriched_clean.jsonl` (247 примеров)** — проверено,
даёт catastrophic forgetting (теряется namespace, появляются новые галлюцинации).

**✅ Базовый старт на 9070** — `dataset_enriched.jsonl` (1093 dirty) + r=16 + bf16.

## Обзор экспериментов 07-08.05 (что узнали)

| Run | dataset | r | last-10 avg loss | inference qualité |
|-----|---------|---|-------------------|-------------------|
| Phase A | dirty 1093 | 4 | n/a | хаотично, выдуманные libs |
| Diagnostic | dirty 1093 | 8 | ~0.95 | **5/5 ROCm libs** ✅, namespace ✅ |
| CLEAN | clean 247 | 8 | 0.815 | ❌ «Rochester GPU», namespace потерян, зацикл. вернулось |

→ **Datasets clean (max-5/class) опровергнут**. На 9070 берём проверенный dirty + r=16.

## Подготовка перед стартом

1. **Перенести на Linux/работа**:
   - `dataset_enriched.jsonl` (5.14 MB, 1093 lines, **dirty — баseline**)
   - `train_simple.py` (адаптировать пути под Linux)
   - `inference_test.py` + промпты (для проверки качества)
   - `qwen3-8b/` (16 GB) ИЛИ скачать заново через `huggingface-cli download`
2. **Установить ROCm 7.2+** + bnb (Linux: `bitsandbytes>=0.46`)
3. **Проверить bf16 на 9070**: `python -c "import torch; print(torch.cuda.is_bf16_supported())"` → True
4. **Скрипты с домашней**:
   - `run_full_qwen3_r8.ps1` → переписать в `run_full_qwen3_r16.sh`
   - `run_compare_3way.ps1` → переписать в bash для 9070

## Главные параметры vs Phase A (что меняется на 9070)

| Параметр | Phase A (2080 Ti) | **Phase B (9070)** | Зачем |
|----------|-------------------|--------------------|-------|
| `lora_r` | 4 | **16** | глубже адаптация (Diagnostic r=8 на dirty уже дал ✅ inference) |
| `lora_alpha` | 8 | 32 | стандарт `2×r` |
| `max_seq_len` | 384 (VRAM) | **1024** | полный контекст датасета (16GB позволяет) |
| `epochs` | 3 | 3 | то же |
| `bf16` | False (нет hw) | **True** | точнее fp16, не overflow |
| `optim` | adamw_torch | **adamw_8bit** | bnb стабильно на Linux |
| `eval_split` | нет | **10% holdout** (109 примеров) | **обязательно для 9070!** анти-overfit |
| `load_best_model_at_end` | нет | **True** | автоматический best |
| `evaluation_strategy` | нет | "steps", `eval_steps=25` | мониторинг overfit |
| `save_total_limit` | 3 | 5 | best/last сравнение |

## Доработать train_simple.py для 9070

```python
# В TrainingArguments:
evaluation_strategy="steps",
eval_steps=25,
load_best_model_at_end=True,
metric_for_best_model="eval_loss",
greater_is_better=False,
save_total_limit=5,
bf16=True, fp16=False,
optim="adamw_8bit",

# До Trainer (split):
split = tokenized.train_test_split(test_size=0.1, seed=42)
train_ds, eval_ds = split["train"], split["test"]
trainer = Trainer(eval_dataset=eval_ds, ...)
```

✅ **Это уже частично есть** в текущей версии train_simple.py (`--eval-split 0.1`).
На 9070 — просто запустить с этим флагом.

## Команда полного train на 9070

```bash
python -u train_simple.py \
  --max-seq-len 1024 --epochs 3 \
  --lora-r 16 --lora-alpha 32 --grad-accum 8 \
  --eval-split 0.1 --eval-steps 25 \
  --save-steps 50 \
  --output-dir ~/finetune/output/full-r16-9070-2026-05-12
```

**Ожидание**:
- ~410 шагов × ~30 сек/шаг (9070 быстрее 2080 Ti) = **~3-4 ч**
- last-10 avg loss: **0.7-0.9** (vs Diagnostic r=8 на 2080 Ti: ~0.95)
- eval_loss: ожидаем **< 0.7** (DoD)

## DoD (Phase B) — обновлённый чек-лист

- [ ] **eval_loss < 0.7** на 9070 (главный критерий)
- [ ] **last-10 train_loss < 0.9** (sanity check)
- [ ] **inference compare** на 3 промптах vs r=8 dirty (08.05) → **subjectivно лучше**
  - правильный namespace `drv_gpu_lib::` ✅
  - 5/5 правильных ROCm библиотек ✅
  - НЕТ галлюцинаций уровня «Rochester GPU»
  - НЕТ зацикливания на повторах блоков
- [ ] **Continue/Cline в VSCode** подключены к новой `qwen3-8b-dsp:r16` в Ollama
- [ ] **Modelfile** с правильным TEMPLATE (взять `Modelfile_v4` за основу)
- [ ] Документация обновлена в `MemoryBank/specs/LLM_and_RAG/`

## Параллельный эксперимент 1 — Qwen2.5-Coder

Уже скачан (14.2 GB) на C:\finetune-env\qwen2.5-coder-7b\.

```bash
# скопировать на 9070
rsync -avz qwen2.5-coder-7b/ work:~/finetune/qwen2.5-coder-7b/

# train с теми же параметрами
python -u train_simple.py \
  --model ~/finetune/qwen2.5-coder-7b \
  --max-seq-len 1024 --epochs 3 \
  --lora-r 16 --lora-alpha 32 \
  --eval-split 0.1 \
  --output-dir ~/finetune/output/qwen25coder-7b-dsp-r16-2026-05-12
```

Сравнить inference на одинаковых промптах: какая лучше понимает DSP-GPU C++/HIP.

## Параллельный эксперимент 2 — расширение датасета (через RAG)

**Цель**: довести до 2000-3000 примеров без потери качества.

```bash
# использовать RAG для генерации новых примеров:
dsp-asst rag generate-finetune --target-size 2500 \
  --output ~/finetune/dataset_expanded.jsonl

# train на расширенном:
python -u train_simple.py \
  --dataset ~/finetune/dataset_expanded.jsonl \
  --lora-r 16 --max-seq-len 1024 --epochs 3 \
  --eval-split 0.1 \
  --output-dir ~/finetune/output/r16-expanded-2026-05-13
```

**Ожидание**: с 2000+ примеров — last-10 avg < 0.7, **существенно лучше inference**
чем dirty 1093 (больше critical mass для каждого факт-имени).

## ⚠️ Альтернативы если основной план не сработает

### Если eval_loss на 9070 не падает ниже 1.0

→ проблема в **формате промпта** (`### Задача / ### Код / ### Ответ` учит копировать шаблон).

```python
# попробовать ChatML-формат:
def format_prompt_chatml(example):
    return (
        f"<|im_start|>system\nYou are an expert in DSP-GPU project.<|im_end|>\n"
        f"<|im_start|>user\n{example['instruction']}\n\n{example['input']}<|im_end|>\n"
        f"<|im_start|>assistant\n{example['output']}<|im_end|>"
    )
```

### Если inference остаётся с галлюцинациями

→ проблема в **content** датасета (мало правильной фактуры).

→ перейти к параллельному эксперименту 2 (расширение через RAG).

## Финальные шаги (после успешного train на 9070)

1. `inference_test.py` на best-checkpoint → проверка качества (3 контрольных промпта)
2. **3-way inference compare** vs r=4 + r=8 dirty → доказать улучшение
3. `post_training.py` → merge → GGUF → Q4_K_M → Ollama deploy
4. **Modelfile** с правильным TEMPLATE (взять `Modelfile_v4` за основу)
5. **Continue YAML config** + Cline настроить (см. `setup_instructions_2026-05-12.md`)
6. **Закрыть TASK_FINETUNE Phase B** в `IN_PROGRESS.md`, перевести в `archive/completed/`

## Точки опоры (что прочитать перед стартом на 9070)

1. **Этот файл** (TASK_FINETUNE_phase_B_2026-05-12.md) — план и DoD
2. `MemoryBank/specs/LLM_and_RAG/finetune_diagnostic_2026-05-08.md` — почему именно так
3. `MemoryBank/specs/LLM_and_RAG/setup_instructions_2026-05-12.md` — общий setup на работе
4. `MemoryBank/specs/LLM_and_RAG/cheatsheet_qlora_train_metrics_2026-05-07.md` — метрики
5. `MemoryBank/sessions/2026-05-08.md` — итог утра
