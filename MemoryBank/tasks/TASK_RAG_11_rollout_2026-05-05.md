# TASK_RAG_11 — Раскатка на 6 оставшихся репо (DSP пропущен)

> **Статус**: pending · **Приоритет**: MEDIUM · **Время**: ~13 ч (Кодо 6 + Alex 7) · **Зависимости**: TASK_RAG_10
> **Версия**: v2 (после ревью v2.1) · DSP пропущен (вариант B), 6 репо вместо 7

## Цель

Прогнать все 3 агента на оставшихся **6 репо** (после pilot'ов spectrum + strategies): **core, stats, signal_generators, heterodyne, linalg, radar**. **DSP — пропущен** (решение Alex'а #8, вариант B).

## Порядок (от простых к сложным)

| # | Репо | Class-cards | Use-cases | Pipelines | Время |
|---|---|---|---|---|---|
| 1 | core | 4 | 5 | 0 | 2 ч |
| 2 | stats | 3 | 5 | 1 | 2 ч |
| 3 | signal_generators | 4 | 6 | 1 | 2 ч |
| 4 | heterodyne | 2 | 4 | 2 | 1.5 ч |
| 5 | linalg | 4 | 6 | 2 | 2.5 ч |
| 6 | radar | 3 | 4 | 3-5 | 3 ч |
| ~~7~~ | ~~DSP~~ | ~~—~~ | ~~—~~ | ~~—~~ | ~~Python в C++ карточках~~ |

## DSP — упоминание Python в C++ карточках

Образец `use_case_fft_batch_signal.example.md` уже содержит ссылку `examples/python/fft_basic.py`. Применяем тот же паттерн на каждом C++ use_case'е где есть Python-биндинг:

```markdown
## Python-эквивалент
См. `DSP/Python/<module>/<file>.py`. Пример вызова:
```python
import dsp_<repo>
proc = dsp_<repo>.<Class>(...)
result = proc.method(...)
```
```

## Workflow на каждый репо

1. `dsp-asst rag blocks ingest --repo <name>`
2. `dsp-asst rag cards build --repo <name>`
3. `dsp-asst rag usecases build --repo <name> --suggest-via-ai`
4. Alex выбирает use_cases → реальная генерация
5. `dsp-asst rag pipelines build --repo <name>` (если есть)
6. Ревью Alex'ом → ≥50% `human_verified`
7. Commit + push (после явного OK Alex'а — правило 02-workflow / 16-github-sync)

## DoD

- [ ] 6 репо обработаны (DSP пропущен).
- [ ] Минимум по 1 class-card на Layer-6 класс.
- [ ] Минимум 4 use-case на репо.
- [ ] ≥50% всех карточек `human_verified=true`.
- [ ] R@5 на golden_set ≥0.91 (промежуточная цель).
- [ ] **Qdrant консистентен с PG**: для каждого репо `qdrant.count(filter={"repo":<name>}) == count(*) FROM rag_dsp.{doc_blocks ∪ use_cases ∪ pipelines}`.
- [ ] В C++ use_case карточках где есть Python-биндинг — секция «Python-эквивалент» добавлена.

## Связано с

- План: §14
- Ревью v2.1: §«Решения Alex'а» #8, §«Таски → TASK_RAG_11»
- Блокирует: TASK_RAG_12
