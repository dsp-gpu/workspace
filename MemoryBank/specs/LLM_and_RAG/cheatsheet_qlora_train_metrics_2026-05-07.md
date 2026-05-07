# Шпаргалка: метрики обучения QLoRA (Alex, 2026-05-07)

> Создана в процессе сегодняшнего fine-tune `qwen3-8b-dsp` на 2080 Ti (план A
> из handoff: чистый `transformers.Trainer` без trl).
> Источник: формат логов `train_simple.py` + ProgressPrinter callback.

---

## Пример строки лога

```
[44/411 10.7%] loss= 1.8358  lr=1.97e-04  grad= 0.4367  el=04:42  eta=39:12
```

---

## Главные метрики обучения

| Метрика | Что это | Норма | Тревога если |
|---------|---------|-------|--------------|
| **loss** | Ошибка модели на батче (cross-entropy следующего токена) | падает с шумом | внезапно >5 или `nan` |
| **lr** (learning_rate) | Размер шага оптимизатора, диктуется scheduler'ом | по плану scheduler'а | внезапно ноль или скачок |
| **grad** (grad_norm) | L2-норма градиентов — «сила» сигнала обучения | 0.1–2.0 | >10 (взрыв) или ~0 на 50+ шагов (mert) |
| **epoch** | сколько раз модель прошла весь датасет | дойти до запланированного | — |

## Прогресс и время

| | |
|---|---|
| **N/411** | текущий шаг / всего; 1 «шаг» = `batch_size × grad_accum` микро-батчей |
| **el** (elapsed) | сколько уже идёт |
| **eta** | оценка оставшегося времени (фейковая в первые 1–2 шага из-за Triton-компиляции) |

---

## Ключевые параметры конфига (наш QLoRA)

| Параметр | Значение | Смысл |
|----------|----------|-------|
| `batch_size` | 1 | один пример за раз в GPU; диктуется VRAM |
| `grad_accum` | 8 | накапливаем градиенты от 8 батчей, потом **один** update |
| effective batch | `batch_size × grad_accum` = 8 | реальный размер обучающего шага |
| `max_seq_len` | 384 (smoke) / 512–1024 (full) | максимум токенов в примере, длинные обрезаются |
| `lr` (max) | 2e-4 | пик learning rate; стандарт для QLoRA |
| `epochs` | 1–3 | полных проходов по датасету |
| `lora_r` | 4 / 8 / 16 | rank LoRA-адаптера; больше = больше capacity |
| `lora_alpha` | обычно `2 × r` | масштаб вклада LoRA |
| `4bit (NF4)` | base модель квантизована | экономит VRAM ×4, минимум потери качества |
| `fp16` | half precision compute | для 2080 Ti (нет bf16 hw); на 9070 — `bf16=True` лучше |
| `gradient_checkpointing` | True | экономит VRAM, замедляет шаг ~30% |

---

## Как читать loss (батч=1)

- **Прыгает 0.8 ↔ 1.3** — норма, разные примеры разной сложности.
- **Тренд** видно на 20+ шагов подряд (moving average).
- **Хорошие финальные значения** для QLoRA на инструкциях: `0.5–1.2`.
- **Внезапный скачок к 5+ или `nan`** — overflow в mixed precision; снижай `lr` или меняй `dtype`.

## Как читать grad_norm

- **0.1–2.0** — нормальная зона
- **>10** — взрыв (защита: `max_grad_norm=1.0` клипает)
- **~0 на 50+ шагов** — модель «застряла», не учится (бывает при слишком низком `lr` или сломанной маске labels)

## Как читать lr (cosine schedule)

- Первые `warmup_steps` (обычно 10): `0 → max_lr` линейно
- Дальше: косинус-decay к ~0 на финальном шаге
- На середине: ~`max_lr × 0.5`
- На финале: `~1e-9` (фактически ноль) — это норма

---

## Минимальный рабочий конфиг для smoke (проторить путь)

```powershell
python -u train_simple.py `
  --max-seq-len 384 --epochs 1 --max-steps 15 `
  --lora-r 4 --lora-alpha 8 --grad-accum 8 `
  --save-steps 5
```

→ ~2 мин на 2080 Ti, проверка end-to-end.

## Полный train на маленьком датасете (~1000 примеров)

```powershell
python -u train_simple.py `
  --max-seq-len 384 --epochs 3 `
  --lora-r 4 --lora-alpha 8 --grad-accum 8 `
  --save-steps 50
```

→ ~45 мин на 2080 Ti, loss 2.45 → 1.0–1.3.

## Production-конфиг для Radeon 9070 + ROCm (16 GB VRAM)

```bash
python -u train_simple.py \
  --max-seq-len 1024 --epochs 3 \
  --lora-r 16 --lora-alpha 32 --grad-accum 8 \
  --save-steps 50
```

→ ожидание ~3–4 ч, loss выйдет ниже благодаря `r=16` + полный seq.

---

## Грабли которые мы уже прошли

| Проблема | Симптом | Решение |
|----------|---------|---------|
| trl SFTTrainer виснет на Win | `0/411 [00:00<?, ?it/s]` навечно | заменить на `transformers.Trainer` |
| 22 мин/шаг на seq=768 + 2080 Ti | очень медленно, GPU 100% | снизить `max_seq_len` до 384 |
| Triton перекомпилит на новый shape | первый шаг 5–25 мин | подождать 1 раз, дальше быстро |
| `paged_adamw_8bit` на Win | silent hang | использовать `adamw_torch` |
| `save_total_limit=3` съедает ранние чекпоинты | теряются хорошие из середины | копировать вручную или `load_best_model_at_end` |
| ChatML vs `### Задача:` | модель не отвечает в Ollama | формат Modelfile должен совпадать с train |

---

## Что добавить на 12.05 (Radeon 9070)

1. **Eval split** (10% holdout, 109 примеров) → видим overfit
2. `load_best_model_at_end=True, metric_for_best_model="eval_loss"` → авто best
3. `eval_steps=25, save_strategy="steps"`
4. `bf16=True` (Radeon 9070 поддерживает) вместо `fp16`
5. `optim="adamw_8bit"` (без `paged_` — на Linux стабилен)

---

*Last updated: 2026-05-07 · QLoRA fine-tune Qwen3-8B на DSP-GPU датасете 1093 примера*
