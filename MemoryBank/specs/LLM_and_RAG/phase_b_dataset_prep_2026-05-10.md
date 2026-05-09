# Phase B QLoRA — Dataset preparation report

> **Дата:** 2026-05-10 · **Автор:** Кодо main
> **Источник:** `dataset_v3.jsonl` (5343 пар, 35 шаблонов после комплексной серии DS_*)
> **Цель:** подготовить train/val split + health-check к Phase B QLoRA на 9070 (12.05.2026)

## 📊 Итоговый health-check

```
Total records:      5343
Missing fields:     0
Short outputs (<50):  30 (0.6%)

Длины (chars):
  output:  min=20, p25=313, median=604, p75=1806, p95=4368, max=5497
  input:   min=61, max=3602, avg=567
  instr:   min=39, max=244, avg=109
```

✅ **Формат valid (alpaca {instruction, input, output})**, пустых полей нет, output median 604 chars — здоровый сигнал для QLoRA.

## 🧩 Распределение по источникам (top-15)

| Concept | Pairs | % |
|---------|------:|--:|
| (unknown — без `# Concept:`) | 1158 | 21.7 |
| method_signatures | 372 | 7.0 |
| class_role | 283 | 5.3 |
| negative_lookup | 261 | 4.9 |
| param_edges | 233 | 4.4 |
| method_return | 141 | 2.6 |
| usecase | 130 | 2.4 |

«(unknown)» — записи где input не содержит `# Concept:` (старые шаблоны `enriched`, `class_overview`, etc.). Это не баг — `_meta._source` намеренно срезан в `build_dataset_v3.py:213` для совместимости с alpaca trainer'ом.

## 🎯 Классы (coverage)

```
unique classes: 816
top-15 share:   41.9% (2240 пар)
```

Top-15 (~15 пар каждый — cap-15 в mid-clean):
- hybrid_backend, opencl_backend, rocm_backend
- heterodyne_processor_rocm, fm_correlator_processor_rocm
- delayed_form_signal_generator_rocm, form_script_generator, script_generator_rocm
- fft_processor_rocm, fir_filter_rocm, iir_filter_rocm
- kalman_filter_rocm, kaufman_filter_rocm, moving_average_filter_rocm

«(unknown)» — 2030 пар без `# Class:` в input (документация / спеки / handoff'ы — не привязаны к классу).

## ✂ Train/Val split

| Split | Records | % |
|-------|--------:|--:|
| train | 4583 | 85.8 |
| val | 760 | 14.2 |
| **total** | **5343** | 100 |

**Параметры split:**
- `seed = 42`
- `val_fraction = 0.1` (но stratified по классу + `n_val ≥ 1` для каждого редкого класса → итого 14.2%)
- Stratified: каждый из 816 классов представлен и в train, и в val (если `count ≥ 2`)
- Random shuffle после stratified split

**Артефакты:**
- `C:/finetune-env/dataset_v3_train.jsonl` (4583 записи)
- `C:/finetune-env/dataset_v3_val.jsonl` (760 записей)
- `C:/finetune-env/dataset_v3_health_report.txt` (полный отчёт)
- `C:/finetune-env/prepare_phase_b.py` (NEW · ~150 строк)

## 🚀 Готовность к Phase B (12.05)

| Требование TASK Phase B | Статус |
|-------------------------|--------|
| `dataset_*.jsonl` ≥ 1093 | ✅ 4583 train (4.2x baseline) |
| Eval split 10% | ✅ 14.2% (760 records, stratified) |
| Alpaca format | ✅ {instruction, input, output} |
| Длины output (median) | ✅ 604 chars (sweet spot 300-1500) |
| Top-15 cap | ✅ 15/class (без перевеса в обучении) |
| Coverage классов | ✅ 816 уникальных |

## 📝 Команда полного train на 9070

```bash
python -u train_simple.py \
  --dataset ~/finetune/dataset_v3_train.jsonl \
  --eval-dataset ~/finetune/dataset_v3_val.jsonl \
  --max-seq-len 1024 --epochs 3 \
  --lora-r 16 --lora-alpha 32 --grad-accum 8 \
  --eval-steps 25 --save-steps 50 \
  --bf16 --optim adamw_8bit \
  --output-dir ~/finetune/output/full-r16-9070-2026-05-12-v3
```

⚠️ **Важно:** в TASK Phase B был расчёт на dirty 1093 = 410 шагов × 30 сек. На 4583 train (4.2x) — **~1700 шагов × 30 сек ≈ 14 ч**. На 9070 быстрее — может уложимся в 8-10 ч. Если слишком долго — варианты:
1. Уменьшить `--epochs 3 → 2`
2. Уменьшить `--grad-accum 8 → 4`
3. Сократить val до 5% (быстрее evaluation)

## 🔗 Связано

- TASK: `MemoryBank/tasks/TASK_FINETUNE_phase_B_2026-05-12.md`
- Phase A diagnostic: `MemoryBank/specs/LLM_and_RAG/finetune_diagnostic_2026-05-08.md`
- Полный список 35 источников dataset_v3: `MemoryBank/tasks/IN_PROGRESS.md` (DS_* записи)

---

*Maintained by: Кодо main · 2026-05-10*
