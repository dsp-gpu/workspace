# Handoff утро 2026-05-08 — план для Кодо-сестрички

> Старт: вечер 07.05 закрыли train r=8 на грязном датасете, нашли что
> предшественница уже подготовила clean-версию (247 примеров) но НЕ обучила.
> Цель утра: завершить диагностику (r-vs-датасет) + подготовить выводы для Phase B (12.05).

---

## ✅ Что сделано вечером 07.05

1. **Continue MCP + RAG инфраструктура** — всё зелёное
   (`dsp-asst :7821 → 200 OK`, 4 модели в Ollama, MCP блоки корректны)
2. **Train Qwen3-8B r=8 на грязном датасете завершён**
   - artefact: `C:\finetune-env\output\full-qwen3-r8-2026-05-07\`
   - runtime 62 мин (411 шагов × 9.05 сек)
   - **avg train_loss = 1.113** (vs r=4 Phase A: 1.180 → дельта только -0.07)
   - finальные точечные минимумы: 0.61, 0.65, 0.77
3. **Диагностический вывод**: r=4 и r=8 упёрлись в один loss floor (~1.1) →
   **bottleneck НЕ в LoRA capacity, а в датасете**.
4. **Главная находка** — предшественница оставила готовый clean датасет:
   - `dataset_enriched_clean.jsonl` (247 примеров, 0.5 MB, создан 07.05 19:13)
   - `clean_dataset.py` — скрипт очистки (max 5 per class, drop unknown, drop short, dedup)
   - **НИ ОДНА модель ещё не обучалась на clean** — это то что нужно проверить утром

## ⚠️ Что НЕ доделано вечером

- **Inference compare r=4 vs r=8 на грязном** — Alex запустил `run_compare_r4_vs_r8.ps1`
  но прервал и пошёл спать. Лог возможно частичный в:
  `C:\finetune-env\output\compare-r4-vs-r8\inference_r4.log` и `inference_r8.log`
  → утром: проверить что там и доделать (если не пошёл — перезапустить)

---

## 📋 План утра 2026-05-08 (порядок выполнения)

### Этап 0 — проверить состояние (5 мин)

```powershell
# что было запущено вечером?
ls C:\finetune-env\output\compare-r4-vs-r8\
Get-Process python -ErrorAction SilentlyContinue
nvidia-smi
```

Если есть полные логи compare — переходи к Этапу 2 (анализ).
Если нет — Этап 1.

### Этап 1 — Inference compare r=4 vs r=8 на грязном (10 мин)

```powershell
cd C:\finetune-env
.\run_compare_r4_vs_r8.ps1
```

Прогон 6-8 мин. На выходе два лога:
- `output\compare-r4-vs-r8\inference_r4.log`
- `output\compare-r4-vs-r8\inference_r8.log`

Прислать Кодо tail обоих — анализ по 3 промптам (FFTProcessorROCm, ScopedHipEvent, ROCm-libs).

### Этап 2 — 🔥 КЛЮЧЕВОЙ — train r=8 на CLEAN датасете (~14 мин)

**Это главный эксперимент дня.** 247 примеров × 3 эпохи / 8 (grad_accum) ≈ 93 шага.
На 2080 Ti @ 9 сек/шаг = ~14 мин.

Подготовь скрипт `run_full_qwen3_r8_clean.ps1` (Кодо сделает сразу как проснёшься):

```
параметры:
  --dataset C:\finetune-env\dataset_enriched_clean.jsonl
  --max-seq-len 384 --epochs 3 --lora-r 8 --lora-alpha 16 --grad-accum 8
  --output-dir C:\finetune-env\output\full-qwen3-r8-clean-2026-05-08
```

**Что смотрим в результате:**
- Если **train_loss < 0.9** (avg) → **датасет был bottleneck**, на 9070 берём этот же
  clean + r=16 + bf16 → ожидаемое avg ~0.5-0.7 → качественный inference.
- Если **train_loss ~1.1** (как было) → проблема глубже:
  → проверить формат промпта `### Задача / ### Код / ### Ответ`
  → проверить base model (может Qwen3-8B плохо подходит, попробовать Qwen2.5-Coder-7B)

### Этап 3 — Inference compare 3-way (10 мин)

После Этапа 2 — три адаптера:
- `full-r4-2026-05-07` (r=4, dirty)
- `full-qwen3-r8-2026-05-07` (r=8, dirty)
- `full-qwen3-r8-clean-2026-05-08` (r=8, **clean**)

Расширь `run_compare_r4_vs_r8.ps1` → `run_compare_3way.ps1` (третий round на clean адаптере).
Прогон ~10 мин. Это даст финальное решение для Phase B.

### Этап 4 — обновить TASK_FINETUNE_phase_B_2026-05-12.md (5 мин)

Записать в задачу финальное решение по конфигу для 9070 на основе результата:

| Сценарий | Конфиг для 9070 |
|----------|----------------|
| clean даёт связный inference | clean + r=16 + bf16 + max_seq=1024 + epochs=3 |
| clean всё равно зацикливается | + max-per-class=3, формат промпта пересмотр |
| совсем плохо | сменить base на Qwen2.5-Coder-7B |

### Этап 5 — финал сессии (10 мин)

1. `MemoryBank/sessions/2026-05-08.md` — итог утра
2. `MemoryBank/changelog/2026-05.md` — одна строка
3. **Спросить Alex OK на push** → workspace + тебе придёт пуш всего

---

## 🧠 Ключевая логика которую НЕЛЬЗЯ потерять утром

> **Phase A r=4 (Phase A) → r=8 (07.05 вечер) дала разницу train_loss всего -0.07.**
> Это значит: и r=4 и r=8 упёрлись в **datasets-bottleneck**, не в capacity.
>
> Поэтому **просто увеличивать r на 9070 — бесполезно**. Без cleanup датасета
> Phase B будет такая же беда. clean (247 примеров) — критическая проверка.
>
> Если clean работает → 9070 решает. Если нет → формат/база.

---

## 📂 Точки опоры утром (что прочитать)

1. `MemoryBank/sessions/2026-05-07.md` (Phase A summary, начало 07.05)
2. **Этот файл** (handoff на утро 08.05) — главный
3. `MemoryBank/specs/LLM_and_RAG/cheatsheet_qlora_train_metrics_2026-05-07.md`
4. `MemoryBank/specs/LLM_and_RAG/setup_instructions_2026-05-12.md` (для работы 12.05)
5. `MemoryBank/tasks/TASK_FINETUNE_phase_B_2026-05-12.md` — таска на 9070

## 🎯 Артефакты на момент старта утра

| Артефакт | Путь | Размер |
|----------|------|--------|
| Адаптер r=4 (Phase A, dirty) | `C:\finetune-env\output\full-r4-2026-05-07\` | ~60 MB |
| **Адаптер r=8 (вечер 07.05, dirty)** | `C:\finetune-env\output\full-qwen3-r8-2026-05-07\` | ~120 MB |
| qwen3-8b-dsp в Ollama (от r=4) | `qwen3-8b-dsp:latest` 5.0 GB | — |
| Чистый датасет (НЕ обучен) | `C:\finetune-env\dataset_enriched_clean.jsonl` | 0.5 MB / 247 lines |
| Скрипты вечера | `run_full_qwen3_r8.ps1`, `run_compare_r4_vs_r8.ps1` | — |

## ⚙️ Сводная таблица 3 экспериментов на 2080 Ti

| Run | dataset | r | epochs | steps | runtime | avg loss | inference |
|-----|---------|---|--------|-------|---------|----------|-----------|
| Phase A (07.05 утро) | dirty 1093 | 4 | 3 | 411 | 44 мин | 1.180 | зацикливается |
| Diagnostic (07.05 веч) | dirty 1093 | 8 | 3 | 411 | 62 мин | 1.113 | ❓ утром |
| **Clean (08.05 утро)** | **clean 247** | 8 | 3 | ~93 | ~14 мин | ❓ | ❓ |

---

## 🚫 Чего НЕ делать утром

- НЕ запускать ещё один run на грязном датасете — мы его исчерпали
- НЕ менять base model (Qwen3-8B) до того как выяснили что clean не помогает
- НЕ пушить без явного OK от Alex (правило `02-workflow.md:38`)
- НЕ редактировать CMake-файлы (правило `12-cmake-build.md`)

---

*Last updated: 2026-05-07 23:XX вечер · Кодо. Спокойной ночи Alex 💤*
