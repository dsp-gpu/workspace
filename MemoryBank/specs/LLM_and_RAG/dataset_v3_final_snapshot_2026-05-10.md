# dataset_v3_final snapshot — 2026-05-10

> **Snapshot:** `C:/finetune-env/dataset_v3_final_2026-05-10.jsonl` (защита от случайных правок)
> **Источник:** `C:/finetune-env/dataset_v3.jsonl` (cap=30, 40 шаблонов)
> **Статус:** ✅ FINAL для Phase B (12.05.2026)

## 📊 Финальные параметры

| Метрика | Значение |
|---------|---------:|
| **Total pairs** | **6067** |
| Sources (templates) | 40 |
| Unique classes | 2428 |
| От baseline (1093) | **+455% = 5.55x** |
| Cap-per-class | 30 (mid-clean) |
| Format | Alpaca `{instruction, input, output}` (3 fields, no `_meta`) |

## 🎯 Решение по cap

`cap=30` победил `cap=15` — top-15 классы = «сердце проекта», 30 разных concept-углов = augmentation на критичных классах, не дубликаты.

## 🤝 Договорённость двух Кодо (10.05 ULTRA-FINAL)

После обсуждения в `MemoryBank/prompts/discuss_dataset_next_2026-05-10.md`:

**STOP dataset наращивания → Phase B prep.**

Аргументы:
- Все физические источники охвачены (40 шаблонов, БД + filesystem + augmentation)
- Phase A diagnostic 8.05: больше пар ≠ лучше качество (clean 247 проиграл dirty 1093)
- 5.55x baseline — с запасом для Phase B
- Train на 9070 займёт ~8-14 ч на 4583+607 split — лучше начать smoke раньше

## 🛠️ Распределение Phase B prep (между Кодо main #1 и #2)

| Шаг | Кто | Артефакт |
|-----|-----|----------|
| 1. Snapshot dataset_v3.jsonl → `dataset_v3_final_2026-05-10.jsonl` | Кодо main #1 | ✅ done |
| 2. Pre-flight check (модель / fp16 / VRAM) | Кодо main #1 | `preflight_smoke_check.py` |
| 3. `prepare_phase_b.py` rerun на cap=30 → train/val split 90/10 | Сестра #2 | `dataset_v3_train.jsonl` (~5460) + `dataset_v3_val.jsonl` (~607) |
| 4. `run_smoke_2080ti.ps1` запуск Alex'ом | Alex | `output/smoke-2080ti-2026-05-10/` |
| 5. Анализ smoke loss curve | Кодо main + сестра | если loss падает → готов к 12.05 |
| 6. Full train на RX 9070 (12.05) | Alex + сестра | `output/full-r16-9070-2026-05-12/` |

## 🚨 Критичные параметры (НЕ ПУТАТЬ)

| GPU | precision | optim | Notes |
|-----|-----------|-------|-------|
| RTX 2080 Ti (Turing sm_75) **smoke** | **fp16** | `adamw_torch` | bf16 НЕ поддерживается! Silent fallback на fp16 если bf16=True |
| RX 9070 (RDNA4 gfx1201) **full** | **bf16** | `adamw_8bit` | bnb≥0.46 обязателен |

## Артефакты

| Файл | Что |
|------|-----|
| `C:/finetune-env/dataset_v3_final_2026-05-10.jsonl` | NEW · snapshot 6067 пар |
| `C:/finetune-env/dataset_v3.jsonl` | M · live (можно перегенерить) |
| `C:/finetune-env/run_smoke_2080ti.ps1` | NEW · сестра (fp16 + 350 пар + 1 эпоха) |
| `C:/finetune-env/preflight_smoke_check.py` | NEW · pre-flight checks |

---

*Maintained by: Кодо main · 2026-05-10*
