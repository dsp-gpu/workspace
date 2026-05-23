# 11 — Golden Set

> **paths:** `pipelines/*/golden_set/**`, `golden_set/**`

## Что это

Q&A эталоны для измерения качества RAG на каждом слое + acceptance после QLoRA.

## Иерархия

```
rag-pao/
├── golden_set/                          ← GLOBAL (cross-target gates)
│   ├── L0_corpus.jsonl                  ← external_corpus (open-source)
│   └── README.md
└── pipelines/<target>_v1/golden_set/    ← PER-TARGET
    ├── L0.jsonl
    ├── L1.jsonl
    ├── L2.jsonl
    ├── L3.jsonl
    ├── L4.jsonl
    └── Q1_Q10_acceptance.jsonl
```

## Кто пишет

| Layer | DSP-GPU pilot | новый target |
|-------|---------------|--------------|
| L0 | Кодо генерит из open-source. Alex review | то же |
| L1 | Alex 30 QA вручную (важная инвестиция) | Alex + Кодо помогает |
| L2 | автомат из L2 symbols (signatures как ground-truth) | то же |
| L3-L4 | Кодо помогает auto после первых ручных | Alex + Кодо |
| **Q1-Q10** | **Alex** (готово в dataset_v8_plan) | **Кодо синтезирует, Alex review** (Q-R2) |

## Format `Lx.jsonl`

```json
{
  "id": "L3-Q001",
  "query": "Какие throw'ы у FFTProcessorROCm::ProcessComplex?",
  "expected_artifacts": [
    {"layer": "L3", "class_fqn": "dsp::spectrum::FFTProcessorROCm", "rank_max": 5}
  ],
  "difficulty": "easy|medium|hard"
}
```

## Format `Q1_Q10_acceptance.jsonl`

```json
{
  "id": "Q1",
  "category": "pattern_forward",
  "question": "Какой паттерн использует HybridBackend?",
  "expected": "Bridge",
  "trap_pattern": null,
  "difficulty": "easy"
}
```

Категории: `pattern_forward`, `pattern_reverse`, `namespace_lookup`, `module_lookup`, `class_listing`, `migration_history`, `build_facts`, `config_facts`, **`anti_hallucination`** (Q9), **`anti_confusion`** (Q10).

## Gate

| Layer | Метрика | Threshold |
|-------|---------|-----------|
| L0 | R@5 | ≥ 0.9 |
| L1-L2 | R@5 | ≥ 0.85 |
| L3-L4 | R@5 | ≥ 0.8 |
| Q1-Q10 (после QLoRA) | correct/10 | **≥ 9/10** |

## Обновление

- L0-L4 — после каждой итерации добавляем 5-10 QA из появившихся пробелов.
- Q1-Q10 — фиксируется на момент start QLoRA, **не меняется** между прогонами модели (иначе сравнение не valid).
