# TASK_RAG_11 — Раскатка на 7 оставшихся репо (DSP вернулся в v3)

> **Статус**: pending · **Приоритет**: MEDIUM · **Время**: ~18 ч (Кодо 8 + Alex 10) · **Зависимости**: TASK_RAG_10, TASK_RAG_02.5, TASK_RAG_02.6
> **Версия**: v3 (2026-05-06) — DSP вернулся через TASK_RAG_02.6, 7 репо (вместо 6 в v2)

## Цель

Прогнать все агенты на оставшихся **7 репо** (после pilot'ов spectrum + strategies): **core, stats, signal_generators, heterodyne, linalg, radar, DSP**.

## Порядок (от простых к сложным)

| # | Репо | Class-cards | Use-cases | Pipelines | Python use-cases | Время |
|---|---|---|---|---|---|---|
| 1 | core | 4 | 5 | 0 | — (нет t_*.py) | 2 ч |
| 2 | stats | 3 | 5 | 1 | 3 (DSP/Python/stats/) | 2.5 ч |
| 3 | signal_generators | 4 | 6 | 1 | 3 | 2.5 ч |
| 4 | heterodyne | 2 | 4 | 2 | 4 | 2 ч |
| 5 | linalg | 4 | 6 | 2 | 3 | 3 ч |
| 6 | radar | 3 | 4 | 3-5 | 3 | 3 ч |
| 7 | **DSP** (v3) | — | — | — | **53** (включая 5 cross_repo) + 4 локальных smoke | 6 ч |

**Итого**: ~25 class-cards + ~30 use-cases + ~12 pipelines + ~70 python_test_usecase + 5 cross_repo_pipeline.

## DSP — главный источник Python use-cases (v3)

Делается через TASK_RAG_02.6, выполняется ДО или параллельно с этим rollout'ом. На этапе rollout DSP мы:
1. Запускаем `dsp-asst rag python build --repo DSP --all-modules`.
2. Ревью Alex'ом по модулям: spectrum (12) → strategies (7) → integration (5 cross_repo) → остальные.
3. Проставляем `human_verified=true` на ≥50% python_test_usecase.

## C++ репо: связывание с Python биндингами (через TASK_RAG_02.6)

В каждом C++ use_case карточке где есть pybind-обёртка — секция «Python-эквивалент» **автоматически** генерируется через `block_refs` к `python_binding` блоку:

```markdown
## Python-эквивалент
См. `<repo>/.rag/use_cases/python__<test_name>.md`. Краткий пример:
```python
import dsp_<repo>
proc = dsp_<repo>.<Class>(...)
result = proc.method(...)
```
Связанный test: `DSP/Python/<module>/t_<name>.py`.
```

## Workflow на каждый репо

### C++ репо (1-6):
1. `dsp-asst rag meta build --repo <name>` (TASK_RAG_02.5)
2. `dsp-asst rag blocks ingest --repo <name>`
3. `dsp-asst rag cards build --repo <name>`
4. `dsp-asst rag usecases build --repo <name> --suggest-via-ai`
5. `dsp-asst rag pipelines build --repo <name>` (если есть composer)
6. `dsp-asst rag python build --repo <name>` (для локальных `<repo>/python/t_*.py`)
7. Alex выбирает use_cases → реальная генерация
8. Ревью → ≥50% `human_verified`
9. Commit + push (после явного OK Alex'а)

### DSP (7):
1. `dsp-asst rag meta build --repo DSP` (только claude_card + doxygen_modules_index)
2. `dsp-asst rag python build --repo DSP --module <module>` для каждого DSP/Python/<module>/
3. `dsp-asst rag python build --repo DSP --integration` для DSP/Python/integration/
4. Ревью Alex'ом по модулю
5. Commit + push

## DoD

- [ ] 7 репо обработаны (включая DSP).
- [ ] Минимум по 1 class-card на Layer-6 класс в C++ репо.
- [ ] Минимум 4 use-case на C++ репо.
- [ ] DSP: ≥45 python_test_usecase + 5 cross_repo_pipeline.
- [ ] ≥50% всех карточек `human_verified=true`.
- [ ] R@5 на golden_set ≥0.91 (промежуточная цель), **с покрытием Python-запросов**.
- [ ] **Qdrant консистентен с PG**: для каждого репо `qdrant.count(filter={"repo":<name>}) == count(*) FROM rag_dsp.{doc_blocks ∪ use_cases ∪ pipelines}`.
- [ ] C++ use_case карточки где есть Python-биндинг — секция «Python-эквивалент» с автоматической ссылкой на python_test_usecase блок.
- [ ] Кросс-репо тесты из DSP/Python/integration/ — все 5 имеют cross_repo карточку с правильно проставленным графом репо.

## Связано с

- План v3: §14
- TASK_RAG_02.5 (meta) — должен быть выполнен ДО rollout (генерит сводки которые class-card подтягивает).
- TASK_RAG_02.6 (Python) — должен быть выполнен ДО или вместе с DSP-rollout.
- Блокирует: TASK_RAG_12.
