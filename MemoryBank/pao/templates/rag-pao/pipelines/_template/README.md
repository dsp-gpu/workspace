# `pipelines/_template/` — шаблон pipeline для нового target

> **Назначение**: при добавлении нового customer drop'а — `cp -r _template/ <target>_v1/` и адаптировать под target.

---

## Как создать новый pipeline

```bash
# 1. Скопировать _template/
cd /srv/rag-pao
bash scripts/add_target.sh pao_xxxx_acme        # автоматизация шагов 1-4

# Или вручную:
# 1. cp -r pipelines/_template/ pipelines/pao_xxxx_acme_v1/
# 2. cp -r pipelines/pao_contrib_v1/collectors/ pipelines/pao_xxxx_acme_v1/collectors/
#    (если есть похожий уже отлаженный target — копировать ИЗ НЕГО, не из _template)
# 3. vim pipelines/pao_xxxx_acme_v1/pipeline.yaml
# 4. vim pipelines/pao_xxxx_acme_v1/golden_set/Q1_Q10_acceptance.jsonl

# 2. Запустить orchestrator
python -m rag_pao.orchestrator --pipeline pao_xxxx_acme_v1

# 3. Когда score ≥ 80 на golden_set — заморозить
mv pipelines/pao_xxxx_acme_v1/_WIP.md pipelines/pao_xxxx_acme_v1/_STABLE.md
git add pipelines/pao_xxxx_acme_v1/
git commit -m "freeze pipeline pao_xxxx_acme_v1"
```

---

## Структура

```
_template/
├── pipeline.yaml.template          # этапы L0→L5 + параметры
├── collectors/                     # 10 коллекторов синтеза пар для QLoRA (D33)
│   ├── README.md                   # 🔗 источник: dataset_v8_plan_2026-05-21.md
│   ├── patterns/                   # P0: reverse_patterns/synonym_pairs/confusion_negatives
│   ├── facts/                      # P1: class_facts/build_cmake_facts/migration_history
│   ├── docs/                       # P1: architecture_docs/lessons_learned
│   ├── code/                       # P2: hip_kernels/hip_primitives/code_templates
│   ├── style/                      # P2: api_style/idioms/error_handling
│   ├── pybind/                     # если applicable
│   └── listings/                   # multi_class_listing
├── prompts_override/               # per-target правки промптов (если стандартный не подходит)
│   └── README.md
├── golden_set/                     # Q&A per-target
│   ├── L0.jsonl.template
│   ├── L1.jsonl.template
│   ├── L2.jsonl.template
│   ├── L3.jsonl.template
│   ├── L4.jsonl.template
│   └── Q1_Q10_acceptance.jsonl     # 10 факт-вопросов для проверки hallucinations
└── _WIP.md                         # маркер «в разработке» (переименовать в _STABLE.md когда score ≥ 80)
```

---

## Workflow: adapt under target

| Шаг | Что меняем |
|-----|-----------|
| 1 | `pipeline.yaml` — параметры (layers L0-L5, фильтры license, modules to skip, ...) |
| 2 | `collectors/patterns/` — список known patterns (Bridge / Strategy / Singleton / Resource / ...) per-target |
| 3 | `collectors/facts/` — known facts (key classes, namespaces, repo structure) |
| 4 | `prompts_override/` — если для target нужен другой промпт (например, особые doxygen-теги заказчика) |
| 5 | `golden_set/Q1_Q10_acceptance.jsonl` — 10 trap-вопросов для anti-hallucination |

---

## Acceptance Q1-Q10

10 факт-вопросов которые **обязательно** правильно отвечает после QLoRA train.

**DSP-GPU pilot** (готово в [`dataset_v8_plan §1`](../../../MemoryBank/specs/05_dataset_v8_reference.md)):
- Q1: «Какой паттерн использует HybridBackend?» → Bridge
- Q2: «В каком namespace HybridBackend?» → `drv_gpu_lib::`
- ... (10 вопросов всего)

**Для нового target** (Q-R2): Кодо синтезирует Q1-Q10 из:
- `_META.yaml.modules[]`
- L2 symbols
- известных patterns (через `collectors/patterns/`)
- typical confusion (Singleton vs Bridge для backends, etc.)

Alex ревьюит финальный Q1-Q10.

---

## Связь с QLoRA (D33)

После сборки коллекторов P0+P1+P2:
```bash
python -m rag_pao.finetune.dataset_builders.v8 \
    --pipeline pao_<target>_v1 \
    --output dataset_v8_<target>_train.jsonl

# Merge с _logs/L*_distillation.jsonl, dedup, split train/val
python -m rag_pao.finetune.dataset_builders.dedup --input dataset_v8_<target>_train.jsonl
```

Train:
```bash
bash scripts/train_v8.sh pao_<target>
# pre-flight healthcheck.sh → train → post_train.sh → ollama deploy
```

Acceptance:
```bash
python -m rag_pao.finetune.eval.acceptance_test \
    --model adapters/<target>-qwen-coder-14b-lora-v1 \
    --questions pipelines/pao_<target>_v1/golden_set/Q1_Q10_acceptance.jsonl
```

Gate: ≥ 9/10.
