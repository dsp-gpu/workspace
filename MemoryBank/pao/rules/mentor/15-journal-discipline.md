# 15 — Journal Discipline (2 уровня, D17)

## 2 уровня журнала

### B.1 Per-prompt journal

`rag-pao/MemoryBank/prompts/v1/NNN_<topic>.journal.md` (в **rag-pao**, mentor читает через REST/git pull):

```markdown
# 001_doxygen_simple_class.journal

История применений промпта 001 к разным классам.

| Date       | Target       | Class                              | Outcome      | Judge | Reviewer | Comparator | Retries | Notes |
|------------|--------------|------------------------------------|--------------|-------|----------|------------|---------|-------|
| 2026-05-25 | pao_contrib  | boost::filesystem::path            | ✅ saved     | 92    | 88       | 85         | 1       | — |
| 2026-05-25 | pao_contrib  | qwt::QwtPlot                       | ❌ escalated | 70    | 65       | 60         | 3       | generic placeholder |
| 2026-05-26 | pao_contrib  | sqlite::Database                   | ✅ saved     | 95    | 90       | 88         | 0       | — |
```

### B.2 Per-class session

`rag-pao/.rag/<target>/sessions/NNN_<Class>_<date>.md`:

```markdown
---
class_fqn: boost::filesystem::path
target: pao_contrib
date: 2026-05-25
prompt_version: v1/001_doxygen_simple_class.md
total_retries: 2
final_judge_score: 92
final_reviewer_score: 88
final_comparator_score: 85
human_verified: false
escalated: false
---

## Oracle etalon (mentor)
<эталон через Claude + mentor_db>

## Attempt 1
**Prompt:** <full prompt text>
**Qwen output:** <JSON>
**name_validator:** FAIL — used `parse_with_flags` (not in allow-list)
**Critic feedback:** "Remove `parse_with_flags`; only `parse` exists"

## Attempt 2
**Prompt:** <updated prompt>
**Qwen output:** <JSON>
**name_validator:** OK
**judge:** 92
**reviewer:** 88
**comparator:** 85 (issue: 1 generic placeholder in 1 method)
**Decision:** ✅ save_to_rag

## Distillation entry (для QLoRA)
{...}
```

## Правила

- **Каждый run цикла** → новая запись в per-class session (append-only)
- **Каждое сохранение** → строка в per-prompt journal
- **Final score** в frontmatter = score последнего успешного attempt
- **escalated_to_human=true** → отдельная пометка в `MemoryBank/feedback/manual_review_queue.md`

## Источник для QLoRA (D33)

Per-class sessions + per-prompt journals — это **источник train-данных** для QLoRA (фильтр: `judge_score ≥ 85 && retries ≤ 2`).

См. `04-policies §G` + `dataset_v8_reference §3`.

## Git policy

- `.rag/<target>/sessions/` — **коммитим** (D18 — артефакты ценные)
- `_logs/distillation/` — **коммитим** (нужно для воспроизводимого train)
- `prompts/v1/*.journal.md` — **коммитим**
