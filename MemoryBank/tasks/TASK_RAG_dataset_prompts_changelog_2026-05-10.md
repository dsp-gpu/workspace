# TASK_RAG_dataset_prompts_changelog — пары из MemoryBank/prompts + changelog

> **Создан:** 2026-05-10 · **Закрыт:** 2026-05-10 (Кодо main) · **Статус:** ✅ DoD
> **Effort:** ~15 мин

## 🎯 Цель

Последний неохваченный источник проект-специфичного контента:
- `MemoryBank/prompts/` — 12 .md (handoff'ы между сессиями, готовые промпты для subagents)
- `MemoryBank/changelog/` — 5 .md (записи об изменениях по датам/месяцам)

## 📋 Шаблоны

| Шаблон | Output |
|--------|--------|
| `prompt_overview` / `prompt_section` | каждый .md из prompts/ |
| `changelog_overview` / `changelog_section` | каждый .md из changelog/ |

## ✅ DoD

- [x] `collect_prompts_changelog.py` написан (~190 строк)
- [x] Парсинг 17 .md (12 prompts + 5 changelog): 0 fail
- [x] **47 пар** (34 prompts + 13 changelog)
- [x] Output `dataset_prompts_changelog.jsonl` валиден
- [x] Добавлено в `build_dataset_v3.py` SOURCES
- [x] `dataset_v3.jsonl` пересобран — `prompts_changelog: 47` в split, total **5145 → 5295**

## Артефакты

| Файл | Что |
|------|-----|
| `C:/finetune-env/collect_prompts_changelog.py` | NEW |
| `C:/finetune-env/dataset_prompts_changelog.jsonl` | NEW · 47 пар |

*Maintained by: Кодо main · 2026-05-10*
