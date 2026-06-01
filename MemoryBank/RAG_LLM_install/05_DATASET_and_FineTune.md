# 🎓 05 — Dataset + QLoRA Fine-Tune

> Как из RAG-БД собрать датасет и (опционально) дообучить LoRA.
> **Стратегия (важно)**: FT — **опция для стиля**, не для фактов (факты в RAG). На датасете < 10k
> RAG обгоняет FT. Боевой FT `qwen-coder-14b-dsp` v6 (q=3.17) проиграл базовым с RAG (4.67-4.83).
> → Делать FT только если нужен «стилевой» сигнал (v8a ~3-5k), иначе достаточно RAG + inference.

> Все скрипты — в `/home/alex/finetune-env/` (отдельный git-репо). Сверено 2026-06-01: существуют.

---

## 1. Пайплайн датасета (RAG БД → JSONL)

**Формат**: Alpaca `{instruction, input, output}` (без `_meta` — срезается в `build_dataset_v3.py:213`).

**Скрипты-коллекторы** (`finetune-env/`):
| Скрипт | Что собирает |
|--------|-------------|
| `collect_rag_v6.py` | RAG-БД (dsp-asst API) → `(query, fqn, repo, doxygen, code)`, фильтр query≥20 симв |
| `collect_hard_negatives.py` | anti-hallucination negatives (typo→real) |
| `collect_explicit_patterns.py` | pattern-пары (Bridge/RAII/Factory) |
| `collect_pybind_bridge_pairs.py` | C++ ↔ Python имена |
| `collect_namespace_correction.py` | namespace correction |
| `build_dataset_v3.py` | сборка финального JSONL (срезает `_meta`) |

**Объёмы по версиям**:
| Версия | Train | Прим. |
|--------|------:|-------|
| baseline | 1093 | Phase A dirty |
| v3_final | 6067 (cap=30, 2428 классов) | snapshot для Phase B, 5.55× baseline |
| v4 | 5071 | база smoke |
| v6 | ≥12000 | RAG-обогащённый (+7k из RAG) |
| v7 | ~10000 | смешанный style+facts (шумный) |
| **v8 (план)** | v8a ~3-5k style / v8b facts→RAG | разделённый сигнал |

`cap=30` (concept-углов на класс) победил `cap=15` — больше augmentation без дублей.

---

## 2. Train/val split + health-check

- **`prepare_phase_b.py`** (~150 строк): `seed=42`, `val_fraction=0.1`, **stratified по классу** (каждый класс в train+val при count≥2) → ~14% val.
- Health (v3): 0 missing, short outputs <50 = 0.6%, output median 604 симв. Отчёт → `dataset_v3_health_report.txt`.
- Артефакты: `dataset_v3_train.jsonl`, `dataset_v3_val.jsonl`.
- Pre-flight: `preflight_smoke_check.py` (модель/bf16/VRAM/датасеты).

---

## 3. QLoRA конфиг

**Тренер**: `train_simple.py` — чистый `transformers.Trainer` (НЕ trl SFTTrainer — виснет на Windows). Кастомный `ProgressPrinter`.

**Целевая модель**: `Qwen2.5-Coder-14B-Instruct` (~28 ГБ fp16).

```bash
python -u train_simple.py \
  --dataset dataset_v3_train.jsonl --eval-dataset dataset_v3_val.jsonl \
  --max-seq-len 1024 --epochs 3 \
  --lora-r 16 --lora-alpha 32 --grad-accum 8 \
  --eval-steps 200 --save-steps 50 \
  --bf16 --optim adamw_8bit \
  --output-dir output/full-r16-9070-...
```
| Параметр | Значение |
|----------|----------|
| batch / grad_accum | 1 / 8 → eff. batch 8 |
| max_seq_len | 384 (smoke) / 1024 (full) |
| lr | 2e-4, cosine, warmup ~10 |
| lora_r / alpha | 16 / 32 (alpha≈2×r) |
| 4-bit | NF4 (bnb) |
| precision | **bf16** (9070); fp16 (2080 Ti, нет bf16 hw) |
| optim | **adamw_8bit** (Linux); adamw_torch (2080 Ti) |
| grad_checkpointing | True; max_grad_norm 1.0; load_best_model_at_end (eval_loss) |

---

## 4. Критичные фиксы для gfx1201 (RX 9070, 16 ГБ)

> Это «Plan-D / Plan-фиксы» — без них train на 14B падает. Точные тела — в `train_simple.py` (патч) + `training_strategy_2026-05-26.md`.

| Проблема | Симптом | Фикс |
|----------|---------|------|
| **bnb 0.49.2 — 4-bit decode NaN на ВСЕХ AMD GPU** | `hipErrorIllegalAddress` каждые 5-67 шагов | `pip install unsloth[amd]` (bnb ≥ 1.33.7) — главный фикс |
| **PEFT `prepare_model_for_kbit_training` кастует embed/lm_head в fp32** | +3 ГБ → OOM на 14B | ручная подготовка: freeze 4-bit, cast только norm, `gradient_checkpointing_enable({"use_reentrant": False})`, embed/lm_head остаются fp16 (патч в `train_simple.py:~299`) |
| **HIP race в HF Trainer** | illegal address на step 50-120 | `run_with_resume.sh` (auto-resume с checkpoint, `--save-steps 20`) |
| **swap при 14B + GUI** | 1.3→13-18 сек/шаг (10× slowdown) | `sudo swapoff -a` + закрыть PyCharm/VSCode/браузер перед train |
| **eval-steps overhead** | eval @ 25 = 92% времени | `--eval-steps 200` (снижает 13ч → ~3ч) |
| `expandable_segments` | warning «not supported» на ROCm 7.2 | игнор |

Перед train: `systemctl --user stop dsp-asst.service` (освободить ~5 ГБ VRAM), `rocm-smi --showmemuse` < 2 ГБ.

---

## 5. Post-train: merge → GGUF → Ollama

`post_train.sh` (bash, существует в finetune-env):
```bash
./post_train.sh <checkpoint> <ollama-name> <base-model> Q4_K_M
# 1. merge_lora.py → merged HF (~28 ГБ)
# 2. llama.cpp convert_hf_to_gguf.py → f16.gguf
# 3. llama-quantize → Q4_K_M.gguf (~8 ГБ)
# 4. ollama create <ollama-name>
```
> ⚠️ Формат Modelfile (ChatML vs `### Задача:`) **обязан** совпадать с train-форматом, иначе модель не отвечает.

---

## 6. Результаты / тренды

- v3 smoke (2080 Ti): loss 2.45 → 1.0-1.3 / 3 эпохи / ~45 мин.
- 14B-Coder smoke (9070): step 1 loss 2.71 → step 50 eval **1.353** (до bnb-краша). Тренд здоровый.
- Best Coder-14B full: `checkpoint-375` eval **0.7125**.
- Цель: train_loss < 1.0, eval < train+0.3 (no overfit).
- **Вывод**: FT-модель НЕ победила базовые с RAG. FT-часть была заблокирована bnb-bug → unsloth[amd] разблокирует, но стратегически: RAG для фактов, FT — опц. стиль.

---

## 7. Железо / полигоны

| Площадка | Железо | Для train? |
|----------|--------|-----------|
| Работа (Debian) | RX 9070 16 ГБ + MI100 | да (полигон) |
| **Дом** | RX 9070 + RTX 2080 Ti | **да — Phase 7E train локально**; 2080 Ti = качать |
| Сервер 10.10.4.105 | RX 9070 16 ГБ | ❌ НЕ для обучения (inference+RAG) |

FT > 14B в 16 ГБ не лезет. Unsloth: 60-80% меньше VRAM, 2-5× быстрее, RDNA4 supported.

---

## 8. Артефакты (finetune-env/)

`train_simple.py` · `prepare_phase_b.py` · `build_dataset_v3.py` · `preflight_smoke_check.py` · `collect_*.py` (5) · `merge_lora.py` · `inference_compare.py` · `post_train.sh` · `run_with_resume.sh` · датасеты `dataset_v{3,4,6}_*.jsonl` · llm_bench tree `Core/phase6_qwen3coder_30b_moe/` · llama.cpp `~/llama.cpp`.

---

*Maintained by: Кодо · 2026-06-01*
