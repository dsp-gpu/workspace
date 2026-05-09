# TASK_RAG_dataset_membank_specs_ext — пары из MemoryBank/specs/

> **Создан:** 2026-05-10 · **Закрыт:** 2026-05-10 (Кодо main) · **Статус:** ✅ DoD
> **Тип:** новый источник (дополнение к `membank_specs` от сестры — тот про `.claude/specs/`, этот про `MemoryBank/specs/`)
> **Effort:** ~30 мин

## 🎯 Цель

`MemoryBank/specs/` — ревью / аудиты / планы / proposals (28 .md). Богатый проект-специфичный контекст (cmake-git, GPUProfiler proposal, RAG implementation reviews, LLM hardware briefs).

Не пересекается с:
- `membank_specs` (сестра, `.claude/specs/` — Ref03/Optimization/Mermaid)
- `architecture` (сестра, `.architecture/` — C4)
- `repo_docs` (сестра, `<repo>/Doc/`)
- `dsp_docs` (сестра, `DSP/Doc/`)

## 📋 Шаблоны

| Шаблон | Output |
|--------|--------|
| `spec_overview` | заголовок + 800 chars intro + список секций |
| `spec_section` | топ-3 секции с body ≥200 chars (по `## H2`) |

## ✅ DoD

- [x] `collect_membank_specs_extended.py` написан (~190 строк)
- [x] Парсинг 28 .md: 0 fail
- [x] **109 пар** (28 overview + 81 section) → 108 после dedup
- [x] Output `dataset_membank_specs_ext.jsonl` валиден
- [x] Добавлено в `build_dataset_v3.py` SOURCES (label=`membank_specs_ext`)
- [x] `dataset_v3.jsonl` пересобран — `membank_specs_ext: 108` в по-источникам, total **4943 → 5122**

## Артефакты

| Файл | Что |
|------|-----|
| `C:/finetune-env/collect_membank_specs_extended.py` | NEW |
| `C:/finetune-env/dataset_membank_specs_ext.jsonl` | NEW · 109 пар |
| `C:/finetune-env/build_dataset_v3.py` | M · +1 SOURCE |

*Maintained by: Кодо main · 2026-05-10*
