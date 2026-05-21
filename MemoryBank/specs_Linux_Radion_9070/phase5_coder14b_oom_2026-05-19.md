# Phase 5 Coder-14B OOM при подготовке модели — **РЕШЕНО Plan-D ✅**

> **Дата:** 2026-05-19
> **Статус:** Plan-B fail (OOM) → Plan-C fail (тот же OOM) → **Plan-D PASS** (патч train_simple.py)
> **Платформа:** Debian + RX 9070 (gfx1201, 16 GB) + ROCm 7.2 + PyTorch 2.11.0+rocm7.2
> **Скрипт:** `Core/phase5_qwen14b_train/run_smoke_coder14b.sh`

## ✅ Финальное решение — Plan-D (патч train_simple.py:299-318)

Применён 2026-05-19 09:30. Бэкап: `train_simple.py.bak_20260519_oom_patch`.

Заменили `prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)` на:
```python
# Freeze 4-bit weights
for _name, _param in model.named_parameters():
    if _param.dtype in (torch.int8, torch.uint8):
        _param.requires_grad = False
# Cast только norm-layers в fp32 (НЕ embed/lm_head)
for _name, _module in model.named_modules():
    if "norm" in _name.lower():
        for _p in _module.parameters():
            _p.data = _p.data.to(torch.float32)
model.gradient_checkpointing_enable(
    gradient_checkpointing_kwargs={"use_reentrant": False}
)
if hasattr(model, "enable_input_require_grads"):
    model.enable_input_require_grads()
model.config.use_cache = False
```

## Результат Plan-D на smoke Coder-14B (seq=1024, r=16, 150 steps)

| Метрика | Step 25 | Step 150 (финал) | Оценка |
|---------|---------|-------------------|--------|
| train_loss | 1.909 | **1.092** | ✅ |
| eval_loss | 2.053 | **1.102** | ✅ ноль overfit |
| grad_norm | 0.266 | 0.47 | ✅ стабильный |
| HIP race | 0 | 0 | ✅ smoke не словил |
| Runtime | — | 36 мин | 1.27s/step |

## Результат Plan-D на smoke Qwen3-14B (seq=1024, r=16, 150 steps)

| Метрика | Step 25 | Step 150 (финал) | Оценка |
|---------|---------|-------------------|--------|
| train_loss | 1.96 | **1.146** | ✅ |
| eval_loss | 2.16 | **1.140** | ✅ near train |
| grad_norm | 0.33 | 0.53 | ✅ стабильный |
| **HIP race** | — | **1 (step 75)** | ✅ **auto-resume PASSED** |
| Runtime | — | 17.5 мин (attempt 2) | 1.27s/step |

### 🛡 Главная валидация — HIP race + auto-resume

ATTEMPT 1 упал на step 75 с `c10::AcceleratorError: illegal memory access`
→ `run_with_resume.sh` поймал, sleep 10, RESUME from checkpoint-75
→ ATTEMPT 2 дошёл до step 150 без проблем. Потеря = 0 шагов.

### Сравнение Coder-14B vs Qwen3-14B на одинаковом datasete_v6_1200

| Метрика | Coder-14B | Qwen3-14B | Победитель |
|---------|-----------|-----------|-----------|
| eval @ step 25 | 2.05 | 2.16 | Coder |
| **eval @ step 150** | **1.102** | **1.140** | **Coder (+0.04)** |
| train @ step 150 | 1.09 | 1.15 | Coder |

→ **Coder-14B-Instruct лучше для DSP-GPU кода**, паттерн Day-1 (Coder-7B > general-8B на 0.085) подтверждается на 14B.

## TL;DR

> OOM при **подготовке** модели, НЕ при train. Проблема в `prepare_model_for_kbit_training` —
> peft пытается кастовать параметры в fp32 (10.73 GB уже занято + нужно 2.9 GB → не хватает).
> Не bnb crash, не HIP race, всё чисто — просто 14B в 4-bit + fp32 cast не лезет в 16 GB.

## Цифры из трейса

```
GPU 0 total       : 15.92 GiB
PyTorch allocated : 10.73 GiB   ← Coder-14B 4-bit base уже загружена
Reserved unused   :  1.57 GiB
Free              :  2.92 GiB
Tried to allocate :  2.90 GiB   ← peft fp32 cast одного параметра
                                  (embed/lm_head = 152K × 5120 × 4 bytes ≈ 3.1 GB)
→ OOM
```

## Где именно падает

```
File "train_simple.py", line 299:
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)

File "peft/utils/other.py", line 186:
    param.data = param.data.to(torch.float32)   ← каст embed/lm_head в fp32
```

## Что НЕ помогло (5 retry'ев)

- `run_with_resume.sh` 5 попыток подряд — каждая в одинаковой точке падает.
- Между попытками Python процесс перезапускается → GPU память освобождается → НЕ утечка.
- `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True` — на ROCm 7.2 игнорируется.

## Что работает (диагноз)

- ✅ Coder-14B 4-bit квантование загружается (10.73 GB ≤ 16 GB)
- ✅ `bnb 0.49.2` 4-bit kernel НЕ падает (нет crash в `csrc/ops.hip:83`)
- ✅ `bf16` поддерживается, tokenizer OK, dataset OK (1200 примеров)
- ❌ `peft.prepare_model_for_kbit_training` каст в fp32 → +3 GB пик не вмещается

## Решения (по приоритету)

### Plan-C — уменьшить seq_len + lora_r (попытка #1)
```bash
./Core/phase5_qwen14b_train/run_smoke_coder14b_planC.sh
```
- `max-seq-len 1024 → 512`
- `lora-r 16 → 8`, `lora-alpha 16`
- Активации вдвое меньше, LoRA grad memory вдвое меньше
- **Но**: peft cast делается ДО активаций → возможно не поможет

### Plan-D — патч `train_simple.py` (если Plan-C тоже OOM)
Заменить:
```python
model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
```
На:
```python
# Аналогично prepare_model_for_kbit_training, но БЕЗ fp32 cast embed/lm_head
for name, param in model.named_parameters():
    if param.dtype in (torch.int8, torch.uint8):
        param.requires_grad = False
# Каст только norm layers (для стабильности fp16 backprop)
for name, module in model.named_modules():
    if "norm" in name.lower():
        for p in module.parameters():
            p.data = p.data.to(torch.float32)
model.gradient_checkpointing_enable({"use_reentrant": False})
model.enable_input_require_grads()
model.config.use_cache = False
```

### Plan-E — fallback Qwen3-14B / откатиться на 7B
Если Plan-C+D не работают на 14B — снова на Coder-7B (Day-1 уже проверен).

## Связано

- `tasks/TASK_FINETUNE_phase_B_9070_2026-05-14.md` — Phase 5 = full Coder-14B
- `IN_PROGRESS.md` — секция QLoRA Phase B Day-1 (Coder выиграл на Δ=−0.085)
- Memory: `expandable_segments` env молча игнорируется на ROCm 7.2 (warning «not supported»)
