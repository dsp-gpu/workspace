# TASK FINETUNE Phase B — Radeon 9070 + ROCm full train (12.05.2026)

> Phase A (07.05) — путь проторён на 2080 Ti дома, качество слабое.
> Phase B — полноценный train на работе.

## Подготовка перед стартом

1. Перенести на Linux/работа: `dataset_enriched.jsonl` (1093) + `train_simple.py` + `qwen3-8b/` (16 GB)
2. Установить ROCm 7.2+ + bnb (Linux версия: `bitsandbytes>=0.46`)
3. Проверить bf16 на 9070: `python -c "import torch; print(torch.cuda.is_bf16_supported())"`

## Главные изменения vs Phase A

| Параметр | Phase A (2080 Ti) | Phase B (9070) | Зачем |
|----------|-------------------|----------------|-------|
| `lora_r` | 4 | **16** | глубже адаптация |
| `lora_alpha` | 8 | 32 | масштаб |
| `max_seq_len` | 384 | **1024** | полный контекст датасета |
| `epochs` | 3 | 3 | то же |
| `bf16` | False (нет hw) | **True** | точнее чем fp16 |
| `optim` | adamw_torch | adamw_8bit | bnb стабильно на Linux |
| `eval_split` | нет | **10% holdout (109)** | анти-overfit |
| `load_best_model_at_end` | нет | **True** | автоматический best |
| `evaluation_strategy` | нет | "steps", eval_steps=25 | мониторинг |

## Доработать train_simple.py

```python
# В TrainingArguments добавить:
evaluation_strategy="steps",
eval_steps=25,
load_best_model_at_end=True,
metric_for_best_model="eval_loss",
greater_is_better=False,
save_total_limit=5,  # хранить больше для best/last сравнения
bf16=True, fp16=False,
optim="adamw_8bit",

# В коде до Trainer:
split = tokenized.train_test_split(test_size=0.1, seed=42)
train_ds, eval_ds = split["train"], split["test"]
# ... передать в Trainer(eval_dataset=eval_ds)
```

## Команда полного train на 9070

```bash
python -u train_simple.py \
  --max-seq-len 1024 --epochs 3 \
  --lora-r 16 --lora-alpha 32 --grad-accum 8 \
  --save-steps 50 \
  --output-dir ~/finetune/output/full-r16-9070
```

Ожидание: ~30 сек/шаг × 410 шагов = ~3-4 ч. В ночь — за час до сна, утром готово.

## Параллельный эксперимент: Qwen2.5-Coder

```bash
# скачать base
huggingface-cli download Qwen/Qwen2.5-Coder-7B --local-dir ./qwen2.5-coder-7b
# или 14B если влезет (на 9070 16GB QLoRA встанет)

# тренировать с тем же датасетом + теми же параметрами
python -u train_simple.py \
  --model ./qwen2.5-coder-7b \
  --max-seq-len 1024 --epochs 3 \
  --lora-r 16 --lora-alpha 32 \
  --output-dir ~/finetune/output/qwen25coder-7b-dsp
```

Сравнить inference на одинаковых промптах: какая лучше понимает DSP-GPU C++/HIP.

## Опционально: фильтрация датасета

Текущий датасет 1093 содержит много use_case с одинаковыми YAML-заголовками
(`primary_class: (unknown)`, повторы repo/class). Это и сломало Phase A —
модель выучила «повторяй блок».

Вариант: написать `clean_dataset.py` который:
- удалит примеры с `primary_class: (unknown)` (мусор)
- де-дуплицирует по hash(input)
- ограничит подряд идущие примеры одного класса

Ожидаемый результат: 700-900 чистых примеров, модель будет учиться лучше.

## Финальные шаги (после успешного train на 9070)

1. `inference_test.py` на best-checkpoint → проверка качества
2. `post_training.py` → merge → GGUF → Q4_K_M → Ollama deploy
3. **Modelfile с правильным TEMPLATE** (взять Modelfile_v4 за основу)
4. **VSCode Continue YAML config** + Cline настроить
5. **Закрыть TASK_RAG_finetune** в IN_PROGRESS

## DoD (Phase B)

- [ ] eval_loss < 0.7 на 9070
- [ ] inference в Ollama: 3 разных промпта про DSP-GPU → корректные ответы без зацикливания
- [ ] Continue/Cline подключены к qwen3-8b-dsp в VSCode
- [ ] Сравнение Qwen3 vs Qwen2.5-Coder по 10 промптам
- [ ] Документация обновлена в `MemoryBank/specs/LLM_and_RAG/`
