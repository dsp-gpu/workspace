# TASK_RAG_dataset_generation_for_qlora — расширение fine-tune датасета через RAG

> **Этап:** Параллельный трек к CONTEXT-FUEL · **Приоритет:** 🟠 P1 · **Effort:** ~6-8 ч · **Зависимости:** CONTEXT-FUEL частично (test_params, use_cases, pipelines заполнены)
> **Координатор:** `TASK_RAG_context_fuel_2026-05-08.md`
> **Связано с Phase B:** `TASK_FINETUNE_phase_B_2026-05-12.md`

## 🎯 Цель

**Не путать с CONTEXT-FUEL!**
- CONTEXT-FUEL = RAG-инфраструктура для **inference-time** (Continue/Cline дёргают MCP)
- Этот TASK = генерация **fine-tune датасета** (1500-3000 raw QA пар) для следующего QLoRA

**Гипотеза по результатам Phase A diagnostic** (`finetune_diagnostic_2026-05-08.md`):
- dirty 1093 + r=8 → loss 1.113, inference приличный
- clean 247 + r=8 → loss 0.815 (lower!), но inference **хуже** (catastrophic forgetting)
- → нужно **расширять датасет**, не сокращать

## 📋 Подэтапы

### 1. Шаблоны генерации (~1.5 ч)

`dsp_assistant/cli/generate_dataset.py` — 5 шаблонов запросов через RAG:

| Тип | Шаблон | Источник | Кол-во |
|-----|--------|----------|--------|
| **class_overview** | «Опиши класс {X}» | symbols + doc_blocks (kind=class_overview) | ~200 |
| **method_explain** | «Что делает метод {X}::{m}»  | symbols + doc_blocks | ~500 |
| **usecase_walkthrough** | «Как сделать {Y}» | use_cases (123 готовы) | ~300 |
| **pipeline_explain** | «Объясни pipeline {Z}» | pipelines (8 → расширим до 20) | ~150 |
| **test_gen** | «Сгенерируй smoke-тест для {X}::{m}» | symbols + test_params (после C1+C2) | ~500 |

Итого: ~1650 пар → дополнить ручным отбором/правкой → **2000-3000**.

### 2. Pipeline генерации (~3 ч)

```python
def generate_qa_pair(symbol: Symbol, template: str) -> dict:
    """
    1. Через dsp_context_pack(query=template, intent=...) собираем контекст
    2. Через Qwen3-8B (или Claude API) генерируем ответ
    3. Format: {instruction, input, output} в Alpaca-style
    """
```

CLI: `dsp-asst rag generate-finetune --template all --target-size 2500 --output ~/finetune-env/dataset_v3.jsonl`.

### 3. Dedup + filter (~1 ч)

- Hash-dedup по `instruction+input`
- Filter короткие output (`<100 chars`)
- Filter дубликаты по `embedding_text` (cosine sim > 0.95)

### 4. Mid-clean балансировка (~30 мин)

В отличие от старого `clean_dataset.py` (max-5/class — оказался слишком агрессивен):
- **max-15/class** — компромисс: убрать сильные дубли, сохранить critical mass
- Drop по `primary_class: (unknown)`
- Drop output<80 chars

### 5. Сравнение dataset_v3 vs текущие (~1.5 ч)

Запустить QLoRA на 2080 Ti (или подождать до 9070):
- 1093 dirty (baseline)
- 247 clean (overfit)
- **2500 expanded v3** (target)

Сравнить inference на тех же 3 промптах что вчера. Ожидание: **существенно лучше** dirty (больше critical mass правильных фактов).

## ✅ DoD

- [ ] `dsp_assistant/cli/generate_dataset.py` написан
- [ ] `dataset_v3.jsonl` ≥ **2000 строк**, dedup по hash, filter по output length
- [ ] Распределение по 5 шаблонам сбалансированное (~400/template ± 100)
- [ ] Mid-clean (max-15/class) не убирает >20% датасета
- [ ] Inference сравнение dirty vs expanded v3 → expanded **лучше** на промптах из `finetune_diagnostic_2026-05-08.md`
- [ ] Запись в `MemoryBank/specs/LLM_and_RAG/_dataset_v3_report_2026-05-XX.md`

## ⚠️ Критическое замечание

> Этот TASK **не связан** с Phase B QLoRA на 12.05! Phase B стартует на **dirty 1093** + r=16 + bf16 (как baseline). Если этот TASK успеет до 12.05 → можно стартовать Phase B на v3. Если нет → Phase B на dirty, expanded v3 идёт в Phase B+ или Phase C.

## Артефакты

- `dsp_assistant/cli/generate_dataset.py`
- `~/finetune-env/dataset_v3.jsonl`
- `MemoryBank/specs/LLM_and_RAG/_dataset_v3_report_2026-05-XX.md`

## Связано

- Координатор: `TASK_RAG_context_fuel_2026-05-08.md`
- Phase A diagnostic: `MemoryBank/specs/LLM_and_RAG/finetune_diagnostic_2026-05-08.md`
- Phase B: `MemoryBank/tasks/TASK_FINETUNE_phase_B_2026-05-12.md`
- Зависит от (опц.): test_params, use_cases, pipelines готовы

*Maintained by: Кодо · 2026-05-08*
