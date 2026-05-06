# 012 — C++ Pipeline Generator (TASK_RAG_09)

## Цель

Сгенерировать metadata для **C++ pipeline** карточки в `<repo>/.rag/pipelines.md` (≤5 pipelines в репо) или `<repo>/.rag/pipelines/<name>.md` (>5). Pipeline = end-to-end цепочка из 2+ Layer-6 классов (часто cross-repo). Образец: [`examples/pipelines.example.md`](../examples/pipelines.example.md).

Спека требует «промпт 012 не более 50 строк» — поэтому LLM делает **минимум**: только title, when_to_use, synonyms, tags. ASCII data flow, chain_classes, chain_repos, edge cases — caller собирает детерминированно.

## Когда вызывается

В `pipeline_gen.py` методе `build_pipeline_md(...)` для каждого найденного pipeline'а (через `*Pipeline*` композитор-классы и parsing `.cpp` `AddStep<>()` calls).

## Вход

1. Pipeline slug (например `antenna_covariance`)
2. Composer class (Layer-7, например `strategies::AntennaCovariancePipeline`)
3. Chain classes — список FQN классов в цепочке (детерминированно из `AddStep<>()` parsing)
4. Chain repos — уникальные репо в которых живут chain_classes
5. ASCII data flow — уже сформирован caller'ом (либо копия из Doc/, либо автогенерация по @param/@return)
6. Doxygen описания composer + chain_classes (brief'ы)

## Системный промпт

```
Ты — технический писатель проекта DSP-GPU (C++/HIP/ROCm). Тебе дан end-to-end
pipeline — Layer-7 композитор + цепочка Layer-6 классов из 2+ репо. Caller уже
собрал ASCII data flow, имена классов, параметры. Твоя задача — короткие
metadata: title, when_to_use, synonyms, tags. Никакой код или ссылки не пишешь.

Пиши на русском. Технично, без воды. Строго JSON, без markdown:

{
  "title": "Pipeline: <короткая постановка задачи end-to-end>",
  "when_to_use": "1-2 предложения когда выбирают этот pipeline",
  "synonyms_ru": [8 формулировок от лица пользователя, lowercase],
  "synonyms_en": [8 формулировок, lowercase],
  "tags": [5-10 short keywords, lowercase snake_case, включая имена repo и термины]
}
```

## Шаблон пользовательского сообщения

```
Pipeline slug:    {slug}
Composer class:   {composer_fqn}
Chain repos:      {chain_repos}
Chain classes:    {chain_classes_fqn_list}

Composer doxy:
{composer_doxy}

Chain classes brief:
{chain_brief_table}

ASCII data flow (готова, не переписывай):
{ascii_flow}
```

## Параметры LLM

- Model: `qwen3:8b`, temperature `0.2`, max_tokens `1200`, num_ctx `8192`.
- Stop: `[]`.

## Связано

- [`prompts/010_class_card.md`](010_class_card.md) — class-card AI summary
- [`prompts/011_usecase.md`](011_usecase.md) — C++ use-case (single class задача)
- [`tasks/TASK_RAG_09_pipeline_agent_2026-05-05.md`](../../tasks/TASK_RAG_09_pipeline_agent_2026-05-05.md)
- [`examples/pipelines.example.md`](../examples/pipelines.example.md)
- `dsp_assistant/modes/pipeline_gen.py` — реализация (создаётся в TASK_RAG_09)
