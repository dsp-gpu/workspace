# biglora cont600 — анализ плато + предложения выхода

> **От:** Кодо → Alex · **2026-06-04** · прогон `qwen25coder14b_v7_biglora_cont600_1632` (resume 200→600).
> Стек: чистый `transformers.Trainer` + `peft` (НЕ unsloth/trl) → доступны `neftune_noise_alpha`, `use_dora`, `use_rslora`, eval_split.

## 1. Факт: плато подтверждено

Средний train-loss по окнам 50 шагов:

| шаги | avg loss | LR |
|------|---------|-----|
| 200–249 | 0.549 | 7.5e-5 |
| 250–299 | 0.561 | 6.5e-5 |
| 300–349 | 0.593 | 5.3e-5 |
| 350–399 | 0.550 | 4.0e-5 |
| 400–449 | 0.559 | 2.5e-5 |

**Флэт ~0.55** при падении LR в 3×. Прогресса нет. Колебания ±0.1 — это шум `batch=1`, не сигнал.

## 2. Диагноз (причины)

1. **`max_seq_len=256` — режет длинные примеры.** avg=146, но max упирается в 256 (код/доки длиннее) → модель не видит хвосты. Главное информационное узкое место.
2. **`eval_split=0` — слепые.** Нет val-loss → невозможно отличить здоровое плато от оверфита. Критический пробел.
3. **<1 эпохи** (epoch 0.93 на 600 шагов), но loss уже флэт → сигнал датасета са턴рируется быстро. Floor ~0.55 скорее **ограничен датасетом**, не недообучением.
4. **`batch=1`** → шумный градиент. **`r16`** — нижняя граница (2025: r32–64 лучше баланс).

## 3. Главное (честно)

**Train-loss 0.55 на <1 эпохе — НЕ плохо.** Для instruct-QLoRA 0.5–0.7 = здоровая сходимость. Гнать loss ниже = память/оверфит, хуже генерализация. **Истинный судья — `llm_bench` quality scores на T1–T6, не train-loss.** Поэтому пункт 2 (eval) важнее всех — он скажет, давить дальше или стоп.

## 4. Предложения (приоритет; всё в нашем стеке, без смены фреймворка)

### Tier 1 — наибольший рычаг
1. **`max_seq_len 256 → 512`** — перестать резать. VRAM сейчас 15.8/17 ГБ — пробовать 512 при batch=1 осторожно (если OOM → grad_checkpointing уже вкл). Ожидаемо лучший рычаг по качеству.
2. **`eval_split=0.05` + `load_best_model_at_end`** — получить val-loss, увидеть оверфит/плато. Диагностика №1.
3. **DoRA (`use_dora=True`) + `r16→r32` + rsLoRA (`use_rslora=True`)** — эталон 2025: DoRA (декомпозиция magnitude/direction) лучше тянет; r32+rsLoRA = capacity без gradient-collapse.

### Tier 2
4. **Эффективный batch 16→32** (`grad_accum 32`) — глаже градиент, ниже шум.
5. **NEFTune `neftune_noise_alpha=5`** — на инструкт/Q-A парах даёт большой прирост качества генерации (AlpacaEval +30%, MT-Bench +25% в статье). ⚠️ может **поднять** train-loss, но улучшить генерацию → судить по бенчу, не loss.

### Tier 3 — если floor ограничен датасетом (вероятнее всего)
6. **Данные, не оптимайзер.** 0.55 на <1 эпохе → сигнал датасета исчерпан. Реальный прирост: dedup near-duplicates (`dedup_top_classes.py` есть), длиннее/сложнее примеры, рост разнообразия — **`dataset_v8_plan_2026-05-21.md` уже готов**. Это перспективнее, чем крутить LoRA.

## 5. Рекомендация по шагам

1. **Сейчас:** дать текущему прогону доехать до 600 (loss-floor подтвердить), смерджить адаптер.
2. **Прогнать `llm_bench` T1–T6** на checkpoint-600 → это реальная оценка (не train-loss).
3. **Следующий прогон (A/B):** `max_seq_len=512` + `eval_split=0.05` + `use_dora=True` + `r32` + `use_rslora=True`. Сравнить по val-loss И по бенчу с текущим.
4. **Если бенч не растёт** → проблема в данных → v8 (Tier 3), а не в гиперпараметрах.

## Источники
- [rsLoRA — A Rank Stabilization Scaling Factor (arXiv:2312.03732)](https://arxiv.org/pdf/2312.03732)
- [DoRA/rsLoRA/QLoRA practical guide 2026 (Medium)](https://medium.com/@abhi-84/lora-qlora-dora-rslora-the-complete-guide-to-7-production-ready-fine-tuning-variants-283ff3e574a3)
- [FinLoRA benchmark (arXiv:2505.19819)](https://arxiv.org/html/2505.19819v1)
- [NEFTune: Noisy Embeddings Improve Instruction Finetuning (arXiv:2310.05914)](https://arxiv.org/abs/2310.05914)
- [NEFTune official repo](https://github.com/neelsjain/NEFTune)

---
*2026-06-04 · Кодо*
