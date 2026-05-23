# 08 — Anti-Hallucination (ПРИОРИТЕТ №1 Alex)

> Alex: «1. точность (галлюцинации на известных именах = 0), 2. кодинг с минимумом ошибок, 3. всё остальное».

## 4 защитных барьера

### Барьер 1 — Retrieval grounding (prompt-builder)

Промпт **явно** перечисляет allow-list:
```
Используй ТОЛЬКО имена из allow-list. Любое имя вне = ошибка.

allow-list-classes:    [...]
allow-list-methods:    {class_name: [method_a, method_b]}
allow-list-params:     {method: [arg1, arg2]}
allow-list-throws:     {method: [std::invalid_argument]}
allow-list-constants:  [kFoo, kBar]
allow-list-namespaces: [boost::filesystem, dsp::spectrum]
```

Запрещённые конструкции в output:
```
forbidden_substrings:
  - "function that does"
  - "RochesterGPU"
  - "dsp_hybrid::"             # wrong namespace
```

### Барьер 2 — Name validator (server-side в `rag_pao/core/llm_serving/name_validator.py` + client-side в `rag_mentor/name_validator/`)

```python
def name_validator(qwen_json, ctx) -> ValidationResult:
    used_names = extract_names_from_doxygen(qwen_json)
    allowed = ctx.symbols.flatten_names()
    forbidden = ctx.config.forbidden_terms

    not_in_allowlist = used_names - allowed
    forbidden_used = used_names & forbidden

    if not_in_allowlist or forbidden_used:
        return ValidationResult(ok=False, errors=[
            *[(n, "not_in_allowlist") for n in not_in_allowlist],
            *[(n, "forbidden_term") for n in forbidden_used],
        ])
    return ValidationResult(ok=True)
```

Двойная проверка: на стороне pao (после Qwen) + на стороне mentor (перед save).

### Барьер 3 — Schema lint + doxygen lint

```python
# JSON Schema
JsonSchemaValidator.validate(qwen_json, schema)

# Doxygen lint:
# - brief > 20 chars
# - no generic placeholders ("function that does")
# - все @param matches signature
# - все @throws присутствуют в method body (AST check)
```

### Барьер 4 — Comparator (mentor diff vs oracle эталон)

```python
diff = Comparator.diff_vs_etalon(oracle_etalon, qwen_out)
issues = issue_categorizer(diff)
# issues типы:
#   - hallucination_name / hallucination_param / hallucination_throw
#   - generic_placeholder / wrong_param_order / missing_throw
#   - structural_mismatch
if diff.score < 80:
    new_prompt = Critic.fix(prompt, issues)
    retry()
```

## Trap-вопросы в acceptance (Q9-Q10)

Каждый target имеет в `golden_set/Q1_Q10_acceptance.jsonl`:
- **Q9**: «Существует ли класс X?» (X — заведомо не существует) → правильный ответ «Нет, hallucination»
- **Q10**: «X — это <wrong_pattern>?» → правильный «Нет, <correct_pattern>»

После QLoRA train модель должна отвечать правильно на Q9-Q10 **≥ 9/10**.

## forbidden_terms.yaml

`rag-pao/config/forbidden_terms.yaml` — список запрещённых substrings. Обновляется при появлении новых hallucinations в журналах.

## Метрики

`mentor_db.eval_runs`:
- `hallucinations_count_per_run`
- `forbidden_terms_count_per_run`
- `comparator_avg_score`
- `escalated_to_human_pct`

Target: **0 hallucinations** на известных именах на всех 4 барьерах.
