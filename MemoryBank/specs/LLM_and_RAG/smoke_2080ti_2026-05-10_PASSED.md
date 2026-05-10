# Smoke train на 2080 Ti — ✅ PASSED (2026-05-10)

> **Цель:** проверить что pipeline alpaca + LoRA + fp16 не падает на dataset_v3 формате
> **GPU:** RTX 2080 Ti (Turing sm_75, 11 GB VRAM)
> **Результат:** ✅ **ALL GREEN** — готовы к full train на RX 9070 (12.05)

## 📊 Результаты

| Метрика | Значение | Прогноз | Оценка |
|---------|----------|---------|--------|
| **Train loss** | 2.51 → **1.49** | 3.0 → <2.0 | ✅ старт лучше прогноза |
| **Eval loss** | **1.909** (50 holdout) | n/a | ✅ |
| **Eval-Train gap** | **−0.25** | <0.3 | ✅ НЕ overfit |
| **Runtime** | **6.6 мин** | 10-15 мин | ✅ быстрее прогноза |
| **Checkpoint** | saved @ step 38 | step 38 | ✅ |
| **LoRA adapters** | saved | saved | ✅ |
| **OOM** | 0 | 0 | ✅ |
| **bf16 errors** | 0 | 0 | ✅ |

## 🎯 Что подтверждено

1. **Alpaca format корректен** — `train_simple.py` без правок принимает {instruction, input, output}
2. **LoRA r=8 + qwen3-8b на 11 GB VRAM** — VRAM хватает с запасом
3. **fp16 + adamw_torch** — Turing-стек работает (без silent fallback bf16)
4. **max_seq_len=384** — достаточен для 350 пар smoke
5. **eval_loss < train_loss** — для 1 эпохи на 300 train: норма (train усреднён по всем шагам, eval в конце уже низкий). На full train с epochs=3 выровняется.

---

## 🔁 Medium train на 2080 Ti (тот же день, ~2 ч)

> **Cap:** 4124 train + 459 eval (cap=30, dataset_v3) · 1 epoch · ~683 steps · LoRA r=8 / α=16 · max_seq_len=384 · fp16 · adamw_torch

### Метрики
| Метрика | Старт | Конец | Δ |
|---|---:|---:|---|
| train_loss (smooth-5) | 2.65 | ~0.85 | **-68%** ✅ |
| eval_loss | 1.538 | **0.784** | **-49%** ✅ |
| eval-train gap | -1.10 | **-0.07** | **underfit, НЕ overfit** |
| Best eval | — | 0.784 @ epoch 0.99 | плато не достигнуто |

**Вывод:** модель **выучила паттерн, не запомнила** (eval ниже train стабильно). Можно учить дальше — eval монотонно падает, плато ещё не достигнуто.

### Inference compare (6 ключевых вопросов)
| # | Тема | Base | Fine-tuned | Вердикт |
|---|---|---|---|---|
| 1 | HybridBackend паттерн | "Composite" (galлюц) | namespace ✅, **Singleton ❌** (надо Bridge) | ⚠️ |
| 2 | ScopedHipEvent | общее | **RAII + hipEvent_t + код-пример** | ✅ ЗОЛОТО |
| 3 | FFTProcessorROCm | rocfft | `dsp_fft` ❌ (надо `dsp::spectrum`) + «нет Python» ❌ | ❌ |
| 4 | IBackend impls | CUDA/CPU/HIP (выдумка) | OpenCL/ROCm ✅ + **TestBackend ❌** | ⚠️ 2/3 |
| 5 | beam_count edges | "число > 0" | uint32_t ✅, **range [1,5000] ❌** (надо [1,50000]) | ⚠️ |
| 6 | RochesterGPU (negative) | выдумала | **выдумала с подробностями** | ❌❌ |

**Что выучилось хорошо:** namespace `drv_gpu_lib`, repo `core`, RAII (gold), 2/3 IBackend, markdown-структура ответа. **Скорость:** 13-22 сек fine-tuned vs 30-31 сек base.

### 🔧 Root-cause каждой ошибки

| Ошибка | Причина | Фикс для Phase B |
|---|---|---|
| Singleton vs Bridge | class_facts описывал паттерн через doxy_brief, **не explicit** | **explicit_pattern_pairs**: «X = Bridge паттерн (НЕ Singleton, НЕ Composite)» — 50-100 пар на топ-30 |
| `dsp_fft` vs `dsp::spectrum` | Legacy `fft_processor::*` остался в части `class_role/method_doxygen` | **Очистка dataset_v4** — grep-фильтр legacy + Patterns.md руками |
| TestBackend в IBackend | `collect_inheritance.py` regex поймал test-helpers | **Skip Test\* в inheritance.py** — 1 строка fix |
| beam_count [1,5000] vs [1,50000] | `max_seq_len=384` truncated «`[1, 50000]`» → читалось «`[1, 5000`» | **max_seq_len=1024** в Phase B (16 GB 9070 позволяет) |
| RochesterGPU galлюц | 261 negative_lookup × 79 классов **не хватило** для anti-hallucination | **negative_lookup × 5 = ~1300 пар** + спец-категория «бренды/компании не выдумывать» |

### 🚀 Прогноз Phase B на RX 9070 (3 эпохи × r=16 × bf16)

```
Epoch 1:  eval ~0.78  (как сейчас)
Epoch 2:  eval ~0.55-0.65  ← модель усваивает детали (паттерны, числа)
Epoch 3:  eval ~0.40-0.50  ← галлюцинации сокращаются на 60-80%
```

**Ожидаемое после Phase B:**
- ✅ Singleton vs Bridge — лечится 3 эпохами + explicit_pattern (если добавить)
- ✅ namespace путаница — лечится dataset cleanup + 3 эпохи
- ❌ TestBackend — **dataset bug**, не train (требует фикс скрипта)
- ⚠️ RochesterGPU — частично лечится 3 эпохами, **полностью** только при +1000 negative pairs
- ✅ beam_count — лечится сменой max_seq_len 384→1024

### 🎯 Action items для Phase B 12.05 (приоритет)

1. **🔴 P0** — fix `collect_inheritance.py` (skip Test*) + перегенерить (+5 мин, +0 риск)
2. **🔴 P0** — `negative_lookup × 5` (~+1000 пар, +30 мин) для anti-hallucination
3. **🟡 P1** — `<repo>/Doc/Patterns.md` руками (Alex) для core/spectrum/strategies (+1 ч его времени) → автоподхват через `collect_doc_deep.py`
4. **🟡 P1** — `namespace_correction_pairs` (30-50 пар, +20 мин) — «каноничный namespace = `dsp::X`, legacy `fft_processor` deprecated»
5. **🟢 P2** — Rebuild dataset_v4 → ~7100 пар → push
6. **🟢 P2** — Phase B на 9070 с dataset_v4 + max_seq_len=1024 + 3 эпохи

### Что **не нужно** делать

- ❌ Удалять текущий dataset и пересоздавать с нуля — корневая проблема НЕ в смеси, а в **частичной legacy** (фильтр + Patterns.md решают)
- ❌ Continue training на текущем checkpoint medium — cosine LR довёл lr→0, продолжить = ничего не выучится. **Resume требует нового LR schedule** (`--lr 5e-5 --epochs 2 --resume_from_checkpoint`). Лучше сразу свежий Phase B.
- ❌ Менять модель (Qwen3 → Qwen2.5-coder) ДО Phase B — сначала проверить что Qwen3 + правильный dataset работает, потом параллельно сравнить с Coder.

---

*Дополнено: 2026-05-10 поздняя ночь · Кодо main · после medium train + inference compare*

## 🚀 Готовность к 12.05 (full train на RX 9070)

| Параметр | Smoke 2080 Ti | **Full RX 9070** |
|----------|---------------|------------------|
| GPU | Turing sm_75 | **RDNA4 gfx1201** |
| VRAM | 11 GB | 16 GB |
| precision | fp16 | **bf16** |
| optim | adamw_torch | **adamw_8bit** (bnb) |
| lora_r | 8 | **16** |
| lora_alpha | 16 | **32** |
| max_seq_len | 384 | **1024** |
| epochs | 1 | **3** |
| dataset | 350 (smoke) | ~5460 train + ~607 val (cap=30 final) |
| ETA | 6.6 мин | **8-14 ч** (4.2x объём + bf16/8bit overhead) |

## 📝 Команда full train (12.05)

```bash
python -u train_simple.py \
  --dataset ~/finetune/dataset_v3_train.jsonl \
  --eval-dataset ~/finetune/dataset_v3_val.jsonl \
  --output-dir ~/finetune/output/full-r16-9070-2026-05-12 \
  --max-seq-len 1024 --epochs 3 \
  --lora-r 16 --lora-alpha 32 --grad-accum 8 \
  --bf16 --optim adamw_8bit \
  --eval-steps 25 --save-steps 50 --logging-steps 5 \
  --load-best-model-at-end
```

## ⏭ Следующие шаги

1. ✅ **Smoke prove** — DONE (этот файл)
2. ⏳ **Сестра rebuild train/val на cap=30** — `dataset_v3_train.jsonl` ~5460 + `dataset_v3_val.jsonl` ~607
3. ⏳ **11.05 — Перенос на работу:**
   - `dataset_v3_train.jsonl`, `dataset_v3_val.jsonl`, `train_simple.py`, `qwen3-8b/` (15.26 GB) → RX 9070 машина
   - Проверка `bitsandbytes>=0.46` + `torch.cuda.is_bf16_supported()` → True
4. ⏳ **12.05 — Full train на 9070** (~8-14 ч)
5. ⏳ **12.05 — Inference compare 3-way:** baseline r=8 dirty / smoke r=8 dataset_v3 / full r=16 dataset_v3
6. ⏳ **post-train:** merge → GGUF Q4_K_M → Ollama deploy → Continue/Cline reconfig

## Артефакты

| Файл | Что |
|------|-----|
| `C:/finetune-env/output/smoke-2080ti-2026-05-10/checkpoint-38/` | LoRA adapters (smoke baseline для inference compare) |
| `C:/finetune-env/output/smoke-2080ti-2026-05-10/train.log` | Полный лог train (38 шагов) |
| `C:/finetune-env/dataset_smoke_350.jsonl` | Subset который тренировали (350 первых из train) |

## Связано

- TASK Phase B: `MemoryBank/tasks/TASK_FINETUNE_phase_B_2026-05-12.md`
- Phase B prep: `MemoryBank/specs/LLM_and_RAG/phase_b_dataset_prep_2026-05-10.md`
- Snapshot v3 final: `MemoryBank/specs/LLM_and_RAG/dataset_v3_final_snapshot_2026-05-10.md`
- Two Кодо agreement: `MemoryBank/prompts/discuss_dataset_next_2026-05-10.md`

---

*Maintained by: Кодо main · 2026-05-10*
