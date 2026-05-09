# TASK_RAG_dataset_agent_examples — пары из MemoryBank/.agent/ + DSP/Examples/

> **Создан:** 2026-05-10 · **Закрыт:** 2026-05-10 (Кодо main) · **Статус:** ✅ DoD
> **Тип:** дополнение к `examples_agent` от сестры (та сделала flat overview, эта — overview + sections + code skeleton)
> **Effort:** ~20 мин

## 🎯 Цель

Добить остаточные неохваченные источники:
- `MemoryBank/.agent/` — материалы для AI-синьоров (3 .md)
- `DSP/Examples/` — README + code примеры (1 .md + 1 dir)

## 📋 Шаблоны

| Шаблон | Output |
|--------|--------|
| `agent_material_overview` | каждый .md из `.agent/` |
| `agent_material_section` | top-2 секции |
| `example_overview` | overview README пример |
| `example_section` | top-2 секции README |
| `example_code_skeleton` | первые 60 строк main.cpp/.hpp |

## ✅ DoD

- [x] `collect_agent_examples.py` написан (~210 строк)
- [x] **16 пар** (9 agent_material + 7 example) → 16 после dedup (с `examples_agent` сестры — 0 пересечений)
- [x] `dataset_v3.jsonl` пересобран — `agent_examples: 16` в split, total **5122 → 5145** (+23 после mid-clean)
- [x] Total **32 источника** в `build_dataset_v3.py`

## Артефакты

| Файл | Что |
|------|-----|
| `C:/finetune-env/collect_agent_examples.py` | NEW |
| `C:/finetune-env/dataset_agent_examples.jsonl` | NEW · 16 пар |

*Maintained by: Кодо main · 2026-05-10*
