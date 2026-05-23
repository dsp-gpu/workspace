# 06 — Prompt Versioning

> **paths:** `MemoryBank/prompts/**`

## Структура

```
MemoryBank/prompts/
├── for_mentor/v1/                  # промпты для самой Claude
│   ├── reviewer/
│   ├── critic/
│   ├── builder_meta/
│   └── comparator/
├── for_rag_pao/v1/                 # нумерованные для Qwen
│   ├── 001_doxygen_simple_class.md
│   ├── 002_doxygen_template_class.md
│   ├── 003_test_cases_basic.md
│   ├── ...
│   ├── 012_judge_gtest_quality.md
│   ├── schemas/                    # JSON Schema strict output
│   └── fewshot/
└── for_mentor/v2/                  # новая версия после критики
└── for_rag_pao/v2/
```

## Правила

1. **Никогда не правим v1 после применения** — создаём v2.
2. **Git tag** на каждой версии: `git tag prompts-v1-2026-05-25`.
3. **Прометей**: для каждой prompt-сессии (per-class) фиксируем какая версия использовалась — в `metadata.prompt_version`.
4. **Backward-compat**: Кодо может вернуться к v1 если v2 хуже. Всегда сохраняем v1 в git.
5. **Naming**: для Qwen — `NNN_<topic>.md` (трёхзначное, описательное). 001-099 для L3 / 100-199 для L4 / 200-299 для L3b и т.д.

## Когда bump'ить version

| Триггер | Bump |
|---------|------|
| Patch промпта (исправил опечатку, уточнил формулировку) | НЕ bump (правим in-place в `v1/`) |
| Semantic правка (другие allow_list, другой schema, другой fewshot) | **v1 → v2** |
| Claude model upgrade (4.7 → 5.0) | **major bump**, ре-валидация на golden_set |

## Schema validation

Каждый промпт `for_rag_pao/v<N>/NNN_*.md` имеет соответствующую JSON Schema в `schemas/<topic>.schema.json`. Qwen output валидируется через `jsonschema.validate` перед `name_validator`.

## Метрики per-prompt

`prompts/v1/NNN_*.journal.md` (см. `15-journal-discipline.md`):
- история применений к разным классам
- scores (judge / reviewer / comparator)
- retry counts
- список escalated_to_human

→ это **источник для QLoRA dataset** (см. `dataset_v8_reference §3`).
