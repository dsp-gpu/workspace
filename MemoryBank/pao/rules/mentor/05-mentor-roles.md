# 05 — Mentor Roles (5 ролей внутри rag_mentor/)

> Кодо в rag-mentor работает не как «один тонкий клиент», а как **5 ролей**.

## Роли

| # | Роль | Подпакет | LLM | Что делает |
|---|------|----------|-----|------------|
| 1 | **Builder** | `prompt_builder/` | Claude Opus 4.7 | строит промпт для Qwen с retrieval-grounding (allow_list + schema_inject) |
| 2 | **Oracle** 🌟 | `oracle/` | Claude Opus 4.7 + retrieval из `mentor_db` | формирует **априорный эталон** ответа (D32) — что **должно** получиться у Qwen |
| 3 | **Reviewer** | `reviewer/` | Claude Sonnet 4.6 | оценивает Qwen-output 0-100 |
| 4 | **Comparator** 🌟 | `comparator/` | Claude Opus 4.7 | `diff(эталон, Qwen)` → score + issue_categorizer (hallucination/generic/wrong_param/...) |
| 5 | **Critic** | `critic/` | Claude Opus 4.7 | правит промпт v1 → v2 если score < 80 (на основе issues от comparator) |

## Цикл (cycle of self-correction)

```
class X
  → Oracle.build_etalon(X)             # 1: эталон через Claude + mentor_db
  → Builder.build_prompt(X, ctx)        # 2: промпт для Qwen
  → pao.run_filler(prompt)              # 3: Qwen генерит
  → name_validator(qwen_out, ctx)       # 4: барьер 1 anti-hallucination
  → pao.run_judge(qwen_out)             # 5: Qwen 35B judge
  → Reviewer(qwen_out)                  # 6: Claude double-check
  → Comparator(etalon, qwen_out)        # 7: diff vs эталон
  → if all OK → save_to_rag             # 8: сохранение
    else → Critic.fix(prompt, issues)   # 9: правка промпта
            retry (max 3)
```

## Запреты по ролям

- **Builder** НЕ пишет финальный артефакт (это Qwen)
- **Oracle** НЕ обращается в rag-pao (только свой mentor_db, D32)
- **Reviewer** НЕ правит промпт (это Critic)
- **Comparator** НЕ оценивает в отрыве от эталона (нужен Oracle output)
- **Critic** НЕ запускает Qwen напрямую (только меняет промпт для следующего retry)

## Где конфигурировать

`config/stack.{dev,prod}.json`:
```json
"policy": {
  "max_retries": 3,
  "judge_threshold": 80,
  "reviewer_threshold": 80,
  "comparator_threshold": 80,
  "temperature_oracle": 0.2,
  "temperature_filler": 0.3
}
```

## Тесты ролей

`tests/test_<role>.py` для каждой роли — изолированно с мок-mentor_db и фиксированными ctx.
